import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  getDb, logEvent, complete, notNow, type Task,
  getStreak, bumpStreak, resetStreaks, softness,
} from './db';

/**
 * The nudge engine.
 *
 * iOS allows only 64 PENDING scheduled local-notification requests at a time.
 * The limit is on *requests*, not deliveries — a repeating calendar trigger is
 * one request that fires forever. So:
 *
 *    3 requests  -> daily anchors (repeating, infinite fires)
 *   ~55 requests -> nearest deadline + follow-through nudges
 *    6 requests  -> headroom
 *
 * iOS also won't reliably run our code in the background, so we can't top the
 * queue up from a background job. Everything is reconciled on foreground and on
 * every task mutation instead. Because the anchors repeat, the app still nudges
 * correctly even if you don't open it for a week — that property is what makes
 * it trustworthy, and it's the thing worth writing a test for.
 */

const BUDGET = 58;
export const CATEGORY = 'nura.task';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false, // no badge. a number on the icon is task debt.
  }),
});

export async function requestPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return req.status === 'granted';
}

/**
 * Action buttons, so a nudge can be resolved from the lock screen without
 * opening the app. Opening an app is an activation cost; a notification you can
 * answer in place gets answered far more often.
 */
export async function registerCategory() {
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'START',  buttonTitle: 'Start 5 min', options: { opensAppToForeground: true } },
    { identifier: 'DONE',   buttonTitle: 'Done',        options: { opensAppToForeground: false } },
    { identifier: 'LATER',  buttonTitle: 'Later today', options: { opensAppToForeground: false } },
    { identifier: 'NOTWEEK',buttonTitle: 'Not this week',options:{ opensAppToForeground: false } },
  ]);
}

/** Copy rules: name the task, name the first physical action, offer an out. */
function body(t: Task) {
  return t.first_action ? `${t.first_action} Five minutes?` : 'Five minutes?';
}

type Desired = { id: string; fireAt: number; title: string; body: string; taskId?: string };

/** Anchors are repeating triggers — one request each, fires forever. */
const ANCHORS = [
  { id: 'anchor.morning',  hour: 9,  minute: 0,  title: 'Pick 3 for today',   body: 'What are the three?' },
  { id: 'anchor.midday',   hour: 13, minute: 30, title: 'Still going?',        body: 'Here are your three.' },
  { id: 'anchor.shutdown', hour: 20, minute: 0,  title: 'What did you actually do?', body: 'Nothing is too small to count.' },
];

export async function scheduleAnchors() {
  for (const a of ANCHORS) {
    await Notifications.cancelScheduledNotificationAsync(a.id).catch(() => {});
    // level 4 mutes the midday prompt but never the morning re-entry, which is
    // deliberately written to make no reference to yesterday
    const soft = softness(await getStreak('anchor'));
    if (soft.silent && a.id !== 'anchor.morning') continue;
    const offer = soft.offer && a.id !== 'anchor.morning';
    await Notifications.scheduleNotificationAsync({
      identifier: a.id,
      content: {
        title: offer ? 'No pressure' : a.title,
        body: offer ? 'There\'s something small here if you want it.' : a.body,
        categoryIdentifier: CATEGORY,
        data: { kind: 'anchor', anchor: a.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: a.hour, minute: a.minute,
      },
    });
  }
}

/** Pure function: what SHOULD be scheduled right now, soonest first. */
async function computeDesired(): Promise<Desired[]> {
  const db = await getDb();
  const now = Date.now();
  const tasks = await db.getAllAsync<Task>(
    `SELECT * FROM task
      WHERE state NOT IN ('done','dropped') AND due_at IS NOT NULL AND due_at > ?
      ORDER BY due_at ASC LIMIT 30`, now);

  const out: Desired[] = [];
  for (const t of tasks) {
    // T-minus ladder. 24h is dropped if it's already inside 24h, and so on.
    for (const [label, lead] of [['24h', 86400_000], ['2h', 7200_000], ['20m', 1200_000]] as const) {
      const fireAt = t.due_at! - lead;
      if (fireAt <= now) continue;
      const soft = softness(await getStreak('deadline'));
      if (soft.silent) continue;
      out.push({
        id: `deadline.${t.id}.${label}`,
        fireAt, taskId: t.id,
        title: soft.offer ? 'No pressure' : t.title,
        body: soft.offer ? `There's a smaller piece of this if you want it.` : body(t),
      });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/**
 * Reconcile the OS queue against what we want. Called on foreground and on every
 * task mutation — never from a background task, because iOS won't run one.
 */
export async function reconcileNudges() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const wanted = (await computeDesired()).slice(0, BUDGET);
  const wantedIds = new Set(wanted.map(w => w.id));

  // cancel anything scheduled that we no longer want (anchors are exempt)
  for (const p of pending) {
    const id = p.identifier;
    if (id.startsWith('anchor.')) continue;
    if (!wantedIds.has(id)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }
  }

  const pendingIds = new Set(pending.map(p => p.identifier));
  for (const w of wanted) {
    if (pendingIds.has(w.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: w.id,
      content: {
        title: w.title, body: w.body,
        categoryIdentifier: CATEGORY,
        data: { taskId: w.taskId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.fireAt) },
    });
  }

  if (__DEV__) {
    const after = await Notifications.getAllScheduledNotificationsAsync();
    console.log(`[nudges] ${after.length}/64 slots used`);
  }
}

/** Handle a button press from the lock screen. */
export function attachDeliveryHandler() {
  return Notifications.addNotificationReceivedListener(async n => {
    const kind = (n.request.content.data?.kind as string) ?? 'deadline';
    await bumpStreak(kind);
    await logEvent('nudge_sent', undefined, { kind });
  });
}

export function attachResponseHandler(
  onOpenTimer: (taskId?: string) => void,
  onOpenRetro?: () => void,
) {
  return Notifications.addNotificationResponseReceivedListener(async res => {
    const taskId = res.notification.request.content.data?.taskId as string | undefined;
    const action = res.actionIdentifier;
    // ANY action resets the ladder — including "not this week"
    await resetStreaks();
    await logEvent('nudge_acted', taskId, { action });

    // the evening anchor opens retro-capture, not a task
    if (res.notification.request.content.data?.anchor === 'anchor.shutdown') {
      onOpenRetro?.();
      return;
    }

    if (!taskId) return;
    if (action === 'DONE') await complete(taskId);
    else if (action === 'LATER' || action === 'NOTWEEK') await notNow(taskId);
    else if (action === 'START') onOpenTimer(taskId);

    await reconcileNudges();
  });
}

export async function initNotifications() {
  if (Platform.OS === 'web') return;
  const ok = await requestPermission();
  if (!ok) return;
  await registerCategory();
  await scheduleAnchors();
  await reconcileNudges();
}
