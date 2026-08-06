import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  getDb, logEvent, complete, notNow, markActed, softnessAt, smallestTask,
  ANCHOR_SLOTS, type Task,
} from './db';
import { nextEvent } from './calendar';

/**
 * The nudge engine.
 *
 * iOS allows only 64 PENDING scheduled local-notification requests at a time.
 * The limit is on *requests*, not deliveries — a repeating calendar trigger is
 * one request that fires forever. The split:
 *
 *    1 request  -> the morning re-entry, repeating, fires forever
 *   14 requests -> a week of midday/evening anchors, each pre-softened
 *  ~40 requests -> nearest deadline nudges
 *    9 requests -> headroom
 *
 * iOS won't reliably run our code in the background, so the queue can't be
 * topped up by a background job; everything is reconciled on foreground and on
 * every task mutation. The morning anchor repeats, so the app still nudges
 * correctly if you don't open it for a week — that property is what makes it
 * trustworthy, and it's the thing worth writing a test for.
 */

const BUDGET = 40;
export const CATEGORY = 'nura.task';
/** How far ahead the pre-softened anchors are written. */
const ANCHOR_DAYS = 7;

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

const ANCHOR_COPY: Record<string, { title: string; body: string }> = {
  'anchor.morning':  { title: 'Pick one for today',   body: 'Just one. The rest can wait.' },
  'anchor.midday':   { title: 'Still going?',          body: 'There is one thing waiting.' },
  'anchor.shutdown': { title: 'What did you actually do?', body: 'Nothing is too small to count.' },
};

/**
 * The softening ladder, made real.
 *
 * The morning anchor is a single repeating request: it fires forever, it is
 * never silenced, and its copy makes no reference to yesterday — that's the
 * re-entry point after a bad week, and it has to survive the app not being
 * opened.
 *
 * The other two are written as a week of individual dated requests, each one
 * evaluated at the volume it *will* deserve when it fires, assuming you do
 * nothing between now and then. That's what makes the de-escalation real
 * without a background task: by the fourth ignored slot the queue simply
 * contains nothing more, so the app goes quiet on its own. Any action at all
 * calls markActed(), which resets the projection the next time we reconcile.
 */
export async function scheduleAnchors() {
  if (Platform.OS === 'web') return;

  const morning = ANCHOR_SLOTS.find(s => s.id === 'anchor.morning')!;
  await Notifications.scheduleNotificationAsync({
    identifier: morning.id,
    content: {
      ...ANCHOR_COPY[morning.id],
      categoryIdentifier: CATEGORY,
      data: { kind: 'anchor', anchor: morning.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: morning.hour, minute: morning.minute,
    },
  });

  const now = Date.now();
  const keep = new Set<string>([morning.id]);

  for (let d = 0; d < ANCHOR_DAYS; d++) {
    for (const slot of ANCHOR_SLOTS) {
      if (slot.id === morning.id) continue;
      const when = new Date();
      when.setDate(when.getDate() + d);
      when.setHours(slot.hour, slot.minute, 0, 0);
      const fireAt = when.getTime();
      if (fireAt <= now) continue;

      const soft = await softnessAt(fireAt);
      if (soft.silent) continue;                     // level 4: the app stops asking

      const id = `anchor.${slot.id.split('.')[1]}.${when.toISOString().slice(0, 10)}`;
      keep.add(id);

      // as it softens it stops naming the thing you chose and starts offering
      // the smallest thing there is
      const small = soft.ceiling < 999 ? await smallestTask(soft.ceiling) : null;
      const copy = ANCHOR_COPY[slot.id];

      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: soft.offer ? 'No pressure' : copy.title,
          body: soft.offer
            ? (small ? `${small.title} — only if you feel like it.` : 'Something small is here if you want it.')
            : (small ? `${small.title}. Five minutes?` : copy.body),
          categoryIdentifier: CATEGORY,
          data: { kind: 'anchor', anchor: slot.id, taskId: small?.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
      });
    }
  }

  // drop anchors that are no longer wanted (yesterday's, or ones the ladder
  // has since silenced)
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const p of pending) {
    if (p.identifier.startsWith('anchor.') && !keep.has(p.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(p.identifier).catch(() => {});
    }
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
      const soft = await softnessAt(fireAt);
      if (soft.silent) continue;
      out.push({
        // fireAt is part of the id, not just the trigger — reconcileNudges()
        // below treats "id already pending" as "already correctly scheduled"
        // and skips it. Without fireAt baked in, editing a task's due date
        // kept the OLD id (same taskId, same '24h'/'2h'/'20m' label) with its
        // OLD fireAt: the stale reminder survived the edit untouched, and the
        // correctly-timed one for the new due date never got scheduled.
        id: `deadline.${t.id}.${label}.${fireAt}`,
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
  // Scheduling is native-only. The AppState 'active' listener in _layout.tsx
  // calls this on every foreground event, so guard here rather than at each
  // call site.
  if (Platform.OS === 'web') return;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const wanted = (await computeDesired()).slice(0, BUDGET);
  const wantedIds = new Set(wanted.map(w => w.id));

  // cancel anything scheduled that we no longer want (anchors are managed by
  // scheduleAnchors, so they're exempt here)
  for (const p of pending) {
    const id = p.identifier;
    if (id.startsWith('anchor.') || id.startsWith('transition.')) continue;
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

/**
 * Foreground delivery, for the event log only.
 *
 * This used to be where the ladder counted ignored nudges — which was exactly
 * backwards: addNotificationReceivedListener fires only while the app is OPEN,
 * so it incremented "you ignored me" in the one situation where you plainly
 * hadn't, and never incremented in the situation it was built for. The ladder
 * is derived from elapsed anchor slots now (see softnessAt in db.ts) and needs
 * no delivery callback at all.
 */
export function attachDeliveryHandler() {
  return Notifications.addNotificationReceivedListener(async n => {
    const kind = (n.request.content.data?.kind as string) ?? 'deadline';
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
    await markActed();
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

/**
 * Two minutes' notice before the next calendar event — a documented ADHD
 * accommodation (transitions are hard, not the tasks themselves) that's
 * absent from every productivity app. Reads the calendar, never writes it.
 */
export async function scheduleTransitionWarning() {
  if (Platform.OS === 'web') return;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const stale = pending.filter(p => p.identifier.startsWith('transition.'));

  const ev = await nextEvent();
  const id = ev ? `transition.${ev.id}` : null;

  for (const p of stale) {
    if (p.identifier !== id) await Notifications.cancelScheduledNotificationAsync(p.identifier).catch(() => {});
  }
  if (!ev || !id) return;

  const fireAt = ev.startsAt - 2 * 60_000;
  if (fireAt <= Date.now()) return;                 // already inside the window
  if (stale.some(p => p.identifier === id)) return; // already scheduled

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Two minutes',
      body: `${ev.title} is starting soon.`,
      data: { kind: 'transition' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  });
}

/** Everything that doesn't require asking permission again — safe to call
 *  any time permission has already been decided, on any launch. */
export async function setupSchedules() {
  if (Platform.OS === 'web') return;
  await registerCategory();
  await scheduleAnchors();
  await reconcileNudges();
  await scheduleTransitionWarning();
}

/**
 * Only for users who have already answered the permission prompt — see Nu.tsx,
 * where it is asked once, in context, after the first thing is written down.
 * requestPermissionsAsync is a no-op re-check once decided, so this is safe on
 * every launch and pops nothing for someone who hasn't been asked yet.
 */
export async function initNotifications() {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await setupSchedules();
}
