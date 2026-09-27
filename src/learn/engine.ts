import { useCallback } from 'react';
import { router } from 'expo-router';
import { useStore } from '../store';
import { getDb, updateTask } from '../db';
import { modelSuggestions, maybeReflect, type OutcomeCount, type TodayTask } from '../coach';
import { aiAllowed } from '../ai';
import { acceptDay } from '../nextActions';
import { getProfile, profileSummary } from './signals';
import { useSuggestions } from './useSuggestions';
import type { Suggestion, SuggestionKind } from './types';

/**
 * THE ENGINE, wired in — the glue between the learning on the phone
 * (signals, suggest, feedback) and the coach on the server (coach.ts):
 *
 *   startEngine()      once a day, from the rooms: the weekly working notes
 *                      (a Message Batch, collected on a later open);
 *   useCoach(limit)    the suggestions to show — the phone's own, plus the
 *                      model's at most every few hours;
 *   useApply()         what "Yes" does.
 */

const MODEL_EVERY = 3 * 3600_000;   // the model's suggestions are asked for at most this often
const KINDS: SuggestionKind[] = ['best_time', 'shrink', 'estimate', 'comeback', 'plan_it', 'rest', 'batch', 'model'];

let startedDay = '';
/** Once a day: collect last week's notes if a batch is waiting, or queue this week's. */
export async function startEngine() {
  const day = new Date().toDateString();
  if (startedDay === day) return;
  startedDay = day;
  try {
    const profile = await getProfile();
    if (profile.activeDays14 < 5) return;          // too little yet to write notes about
    await maybeReflect({
      summary: profileSummary(profile),
      outcomes: await outcomesSince(Date.now() - 7 * 86400_000),
      activeDays: profile.activeDays14,
    });
  } catch { /* the notes are a bonus; never in the way */ }
}

/** How each kind of suggestion landed since `since`: yes, not now, and shown but left. */
async function outcomesSince(since: number): Promise<OutcomeCount[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ kind: string; outcome: string; n: number }>(
    `SELECT kind, outcome, COUNT(*) AS n FROM suggestion_log WHERE at >= ? GROUP BY kind, outcome`, since,
  ).catch(() => []);
  return KINDS.map(kind => {
    const n = (o: string) => rows.find(r => r.kind === kind && r.outcome === o)?.n ?? 0;
    const answered = n('accepted') + n('dismissed');
    return { kind, accepted: n('accepted'), dismissed: n('dismissed'), ignored: Math.max(0, n('shown') - answered) };
  }).filter(o => o.accepted + o.dismissed + o.ignored > 0);
}

let modelCache: { at: number; list: Suggestion[] } | null = null;

/** Today's suggestions: the phone's, and — every few hours, when there's anything to go on — the model's. */
export function useCoach(limit = 2) {
  const inbox = useStore(s => s.inbox);
  const todayPicked = useStore(s => s.todayPicked);
  const extra = useCallback(async (): Promise<Suggestion[]> => {
    if (modelCache && Date.now() - modelCache.at < MODEL_EVERY) return modelCache.list;
    const seen = new Set<string>();
    const tasks: TodayTask[] = [...todayPicked, ...inbox]
      .filter(t => !seen.has(t.id) && (seen.add(t.id), true))
      .slice(0, 30)
      .map(t => ({ id: t.id, title: t.title, minutes: t.est_minutes, priority: t.priority ?? 0 }));
    if (!tasks.length) return [];
    const profile = await getProfile();
    if (profile.days < 3) return [];                 // the phone's rules are enough until there's history
    if (!(await aiAllowed())) return [];             // AI help off: the phone's own only, and nothing cached
    const list = await modelSuggestions(profileSummary(profile), { tasks });
    modelCache = { at: Date.now(), list };
    return list;
  }, [inbox, todayPicked]);
  return useSuggestions(limit, extra);
}

/** What "Yes" does, for each kind of action a suggestion can carry. */
export function useApply() {
  const focusOn = useStore(s => s.focusOn);
  const refresh = useStore(s => s.refresh);
  const inbox = useStore(s => s.inbox);
  const todayPicked = useStore(s => s.todayPicked);
  const showToast = useStore(s => s.showToast);
  return useCallback(async (s: Suggestion) => {
    const a = s.action;
    const id = s.taskId;
    if (!a || a.type === 'none') return;
    // a smaller day: the rest leaves Today (still in Someday); Undo is on the card
    if (a.type === 'reduce_day' && a.defer?.length) {
      await acceptDay(a.keep ?? [], a.defer);
      await refresh();
      return showToast(`${a.defer.length} left for later`);
    }
    if (a.type === 'focus' && id) return focusOn(id);
    if (a.type === 'set_minutes' && id && a.minutes) { await updateTask(id, { est_minutes: a.minutes }); return refresh(); }
    if (a.type === 'schedule' && id && a.at) { await updateTask(id, { due_at: a.at, has_time: 1 }); return refresh(); }
    if (a.type === 'plan') {
      const title = [...todayPicked, ...inbox].find(t => t.id === id)?.title ?? '';
      return router.push({ pathname: '/project/new', params: { goal: title } });
    }
    if (a.type === 'shrink' && id) return router.push({ pathname: '/task/[id]', params: { id } });
  }, [focusOn, refresh, inbox, todayPicked, showToast]);
}
