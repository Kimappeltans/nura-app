import type { Task } from '../db';
import type { BehaviorProfile, Suggestion, SuggestionKind } from './types';

/**
 * SUGGEST — plain rules over the profile and what's open right now. Free,
 * instant, on the phone. Each rule only speaks when its numbers are real, and
 * says what the numbers are ("4 of your last 5…"), so a suggestion can always
 * be checked against what you know about yourself.
 *
 * Tone: an offer, never a verdict. No "overdue", no streaks, nothing that
 * counts what you didn't do. "Not now" is always a fine answer — dismissing
 * teaches feedback.ts that this kind of advice isn't helping.
 */

export interface SuggestContext {
  profile: BehaviorProfile | null;
  /** what's open: today's picks and the inbox */
  tasks: Task[];
  now: Task | null;
  /** when the day ends, minutes after midnight (1500 = 1:00 AM) */
  dayEndMin: number;
  doneToday: number;
  nowMs: number;
  /** tasks that are already a project's current move — no "plan it" for those */
  moveIds?: string[];
}

const DAY = 86_400_000;

/** the same shape src/assistant.ts routes to "vague" — a verb with no first step in it */
export const VAGUE_RE = /^(work on|think about|sort out|deal with|look into|figure out)\b/i;

/** small things that go well in one sitting, by label — or by activity, whatever the label */
const BATCH_LABELS = ['money', 'errands'];
const BATCH_ACTIVITIES = ['finances', 'email', 'phone-call', 'waiting-on-hold'];

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** kind + what it's about + the day — the same advice keeps the same id all day */
export const suggestionId = (kind: SuggestionKind, about: string | undefined, nowMs: number) =>
  `${kind}:${about ?? '-'}:${dayKey(nowMs)}`;

/** how sure a pattern is from how many times it's been seen: 5 → 0.5, 20 → 0.8 */
export const sampleConfidence = (n: number, half = 5) => (n <= 0 ? 0 : n / (n + half));

export const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const short = (s: string) => (s.length > 40 ? s.slice(0, 39).trimEnd() + '…' : s);
const quote = (t: Task) => `“${short(t.title)}”`;
export const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

const partOf = (h: number) =>
  h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';

/** minutes since midnight, counted past 24:00 when the day is set to end after midnight */
export function minutesIntoDay(nowMs: number, dayEndMin: number): number {
  const d = new Date(nowMs);
  const m = d.getHours() * 60 + d.getMinutes();
  // 00:30 with a 1:00 AM end is still "tonight"; with a 9 PM end it's long past it
  if (d.getHours() < 5) return dayEndMin > 1440 ? m + 1440 : m + 1440 * 2;
  return m;
}

const isOpen = (t: Task, nowMs: number) =>
  t.state !== 'done' && t.state !== 'dropped' && !t.parent_id && !(t.snoozed_until && t.snoozed_until > nowMs);

/* ---------------- the rules ---------------- */

const pastEnd = (c: SuggestContext) => minutesIntoDay(c.nowMs, c.dayEndMin) >= c.dayEndMin;

function rest(c: SuggestContext): Suggestion | null {
  if (pastEnd(c)) {
    const end = c.dayEndMin % 1440;
    return {
      id: suggestionId('rest', undefined, c.nowMs), kind: 'rest', who: 'ra', source: 'local',
      text: 'Your day is over. Whatever is left will keep until tomorrow.',
      why: `You set your day to end at ${hourLabel(Math.floor(end / 60))}${end % 60 ? `:${String(end % 60).padStart(2, '0')}` : ''}`,
      action: { type: 'none' }, confidence: 0.85,
    };
  }
  if (c.doneToday >= 5) {
    return {
      id: suggestionId('rest', undefined, c.nowMs), kind: 'rest', who: 'ra', source: 'local',
      text: 'That is a full day already. Stopping here is allowed.',
      why: `${c.doneToday} things done today`,
      action: { type: 'none' }, confidence: Math.min(0.8, 0.6 + 0.05 * (c.doneToday - 5)),
    };
  }
  return null;
}

function comeback(c: SuggestContext, open: Task[]): Suggestion | null {
  const gap = c.profile?.gapDays ?? 0;
  if (gap < 3 || c.doneToday > 0) return null;
  // the smallest thing there is — an unestimated task counts as 15 minutes, as in db.smallestTask()
  const pick = [...open].sort((a, b) => (a.est_minutes ?? 15) - (b.est_minutes ?? 15) || a.created_at - b.created_at)[0];
  if (!pick) return null;
  return {
    id: suggestionId('comeback', pick.id, c.nowMs), kind: 'comeback', who: 'ra', source: 'local',
    text: `Welcome back. No catching up needed, just one small thing, like ${quote(pick)}?`,
    why: `Last here ${gap} days ago`,
    taskId: pick.id, action: { type: 'focus', minutes: roundTo5(Math.min(pick.est_minutes ?? 10, 15)) },
    confidence: 0.8,
  };
}

function bestTime(c: SuggestContext, open: Task[]): Suggestion | null {
  const p = c.profile;
  if (!p || p.days < 5 || !p.bestHours.length) return null;
  const total = p.byHour.reduce((s, b) => s + b.completed, 0);
  if (total < 5) return null;

  // today's picks come first, then Ra's current one; a task already given a time is left alone
  const pool = [c.now, ...open.filter(t => t.state === 'today' || t.state === 'doing')]
    .filter((t): t is Task => !!t && isOpen(t, c.nowMs) && !t.has_time);
  const task = pool[0];
  if (!task) return null;

  const hour = new Date(c.nowMs).getHours();
  const endHour = Math.floor(c.dayEndMin / 60);
  const inBest = p.bestHours.includes(hour);
  const next = p.bestHours.filter(h => h > hour && h < endHour).sort((a, b) => a - b)[0];
  if (!inBest && next == null) return null;
  const h = inBest ? hour : next;

  // the reason, in the most concrete words the numbers allow
  const part = partOf(h);
  const inPart = p.byHour.filter(b => partOf(b.key) === part).reduce((s, b) => s + b.completed, 0);
  const bucket = p.byHour[h];
  const why = inPart === total
    ? `All ${total} things you finished lately were in the ${part}`
    : inPart / total >= 0.5
    ? `${inPart} of the ${total} things you finished lately were in the ${part}`
    : `${bucket.completed} of ${bucket.started} things you started around ${hourLabel(h)} got done`;
  const rate = (bucket.completed + 1) / (bucket.started + 2);
  const confidence = clamp01(sampleConfidence(total) * rate * 1.2);

  if (inBest) {
    return {
      id: suggestionId('best_time', task.id, c.nowMs), kind: 'best_time', who: 'ra', source: 'local',
      text: `This tends to be a good hour for you. A good moment for ${quote(task)}?`,
      why, taskId: task.id, action: { type: 'focus' }, confidence,
    };
  }
  const at = new Date(c.nowMs); at.setHours(h, 0, 0, 0);
  return {
    id: suggestionId('best_time', task.id, c.nowMs), kind: 'best_time', who: 'ra', source: 'local',
    text: `You tend to get things done around ${hourLabel(h)}. Put ${quote(task)} there?`,
    why, taskId: task.id, action: { type: 'schedule', at: at.getTime() }, confidence,
  };
}

function shrink(c: SuggestContext, open: Task[]): Suggestion[] {
  const p = c.profile;
  const out: Suggestion[] = [];
  for (const t of open) {
    const n = t.snooze_count ?? 0;
    if (n >= 3) {
      out.push({
        id: suggestionId('shrink', t.id, c.nowMs), kind: 'shrink', who: 'nu', source: 'local',
        text: `${quote(t)} keeps getting moved. Make it smaller, just the first few minutes of it?`,
        why: `Moved to later ${n} times, often a sign the first step isn't clear yet`,
        taskId: t.id, action: { type: 'shrink' }, confidence: Math.min(0.9, 0.4 + 0.1 * n),
      });
      continue;
    }
    // or: a big, older task with a label that tends to get put off
    const lab = p && t.label ? p.putOffByLabel.find(l => l.label === t.label) : undefined;
    const ageDays = (c.nowMs - t.created_at) / DAY;
    if (lab && lab.rate >= 1.5 && lab.n >= 4 && ageDays >= 7 && (t.est_minutes ?? 0) >= 45) {
      out.push({
        id: suggestionId('shrink', t.id, c.nowMs), kind: 'shrink', who: 'nu', source: 'local',
        text: `${quote(t)} is a big one. Want to cut it down to a first small piece?`,
        why: `${t.label} tasks get moved ${lab.rate} times each on average (${lab.n} tasks)`,
        taskId: t.id, action: { type: 'shrink' }, confidence: clamp01(0.35 + 0.05 * lab.n),
      });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
}

function estimate(c: SuggestContext, open: Task[]): Suggestion | null {
  const p = c.profile;
  const ratio = p?.estimateRatio;
  const n = p?.estimateN ?? 0;
  if (ratio == null || ratio < 1.3 || n < 5) return null;
  const r = Math.min(ratio, 3);   // past 3× it's more likely a forgotten timer than a pattern
  const pool = [c.now, ...open].filter((t): t is Task => !!t && isOpen(t, c.nowMs) && (t.est_minutes ?? 0) >= 5);
  for (const t of pool) {
    const est = t.est_minutes as number;
    const minutes = roundTo5(est * r);
    if (minutes - est < 5) continue;
    return {
      id: suggestionId('estimate', t.id, c.nowMs), kind: 'estimate', who: 'nu', source: 'local',
      text: `Things tend to run a bit longer than planned for you. Give ${quote(t)} ${minutes} minutes instead of ${est}?`,
      why: `Across your last ${n} timed tasks, the time spent was ${ratio}× the guess (median)`,
      taskId: t.id, action: { type: 'set_minutes', minutes },
      confidence: clamp01(sampleConfidence(n) * Math.min(1, (r - 1) / 0.6)),
    };
  }
  return null;
}

function planIt(c: SuggestContext, open: Task[]): Suggestion | null {
  const moves = new Set(c.moveIds ?? []);
  for (const t of open) {
    if (moves.has(t.id)) continue;
    const m = t.title.trim().match(VAGUE_RE);
    const long = (t.est_minutes ?? 0) >= 120;
    if (!m && !long) continue;
    // if replans as "too big" are common for this person, a vague task is even likelier to be one
    const bump = (c.profile?.tooBigRate ?? 0) >= 0.3 ? 0.1 : 0;
    return {
      id: suggestionId('plan_it', t.id, c.nowMs), kind: 'plan_it', who: 'nu', source: 'local',
      text: `${quote(t)} sounds like more than one step. Want me to lay out the first few?`,
      why: m
        ? `“${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}…” doesn't say where to begin yet`
        : `Estimated at ${Math.round((t.est_minutes as number) / 6) / 10} hours, which is usually a few steps`,
      taskId: t.id, action: { type: 'plan' }, confidence: (m ? 0.55 : 0.5) + bump,
    };
  }
  return null;
}

function batch(c: SuggestContext, open: Task[]): Suggestion | null {
  const groups = new Map<string, Task[]>();
  for (const t of open) {
    if (t.est_minutes == null || t.est_minutes > 10) continue;
    const key = t.activity && BATCH_ACTIVITIES.includes(t.activity) ? 'admin'
      : t.label && BATCH_LABELS.includes(t.label) ? t.label : null;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const [key, list] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!key || !list || list.length < 3) return null;
  const minutes = list.reduce((s, t) => s + (t.est_minutes ?? 0), 0);
  const what = key === 'admin' ? 'admin' : key === 'money' ? 'money' : 'errand';
  return {
    id: suggestionId('batch', key, c.nowMs), kind: 'batch', who: 'nu', source: 'local',
    text: `${list.length} small ${what} things. Do them in one go? About ${roundTo5(minutes)} minutes.`,
    why: `${list.length} tasks, each 10 minutes or less`,
    taskIds: list.map(t => t.id), action: { type: 'focus', minutes: roundTo5(minutes) },
    confidence: Math.min(0.8, 0.5 + 0.1 * (list.length - 3)),
  };
}

/** Every rule, over what's open. Order doesn't matter — rank() decides. */
export function localSuggestions(c: SuggestContext): Suggestion[] {
  const seen = new Set<string>();
  const open = [...(c.now ? [c.now] : []), ...c.tasks]
    .filter(t => isOpen(t, c.nowMs) && !seen.has(t.id) && (seen.add(t.id), true));

  // Past the end of the day, the only advice is to stop.
  const r = rest(c);
  if (r && pastEnd(c)) return [r];

  // Coming back after a gap: one small thing, and nothing about the backlog.
  const back = comeback(c, open);
  if (back) return [back, ...(r ? [r] : [])];

  const out: Suggestion[] = [];
  if (r) out.push(r);
  const bt = bestTime(c, open); if (bt) out.push(bt);
  out.push(...shrink(c, open));
  const est = estimate(c, open); if (est) out.push(est);
  const plan = planIt(c, open); if (plan) out.push(plan);
  const b = batch(c, open); if (b) out.push(b);
  return out;
}

/* ---------------- ranking ---------------- */

const tasksOf = (s: Suggestion) => [...(s.taskId ? [s.taskId] : []), ...(s.taskIds ?? [])];

/**
 * Best first, by how sure the rule is × how often this kind has helped
 * (feedback.ts; 0.5 when there's no history). Never two about the same task,
 * and never two of the same kind — two "make it smaller"s in a row reads like
 * a list of complaints.
 */
export function rank(
  suggestions: Suggestion[],
  weights: Partial<Record<SuggestionKind, number>>,
  limit = 2,
): Suggestion[] {
  const score = (s: Suggestion) => s.confidence * (weights[s.kind] ?? 0.5);
  const sorted = [...suggestions].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const out: Suggestion[] = [];
  const ids = new Set<string>(), kinds = new Set<string>(), tasks = new Set<string>();
  for (const s of sorted) {
    if (out.length >= limit) break;
    if (ids.has(s.id) || kinds.has(s.kind) || tasksOf(s).some(t => tasks.has(t))) continue;
    out.push(s);
    ids.add(s.id); kinds.add(s.kind); tasksOf(s).forEach(t => tasks.add(t));
  }
  return out;
}
