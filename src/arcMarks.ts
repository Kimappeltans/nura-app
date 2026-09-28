/**
 * THE MARKS ON THE DAY'S ARC (Kim, 28 September). The arc is still the sun's
 * path; the marks say what's on it:
 *
 *   done    a coral dot where something was finished
 *   ahead   an open ring where a task with a set time is still to come
 *   event   a small dark mark where a calendar event starts
 *   next    your next move, pinned at now (where Ra is), whether or not it
 *           has a time: Start means now, so that is where it belongs
 *   many    marks that would sit on top of each other, as one dot with a
 *           count: it opens the day in the Calendar
 *
 * Only the next move is named on the arc. The rest are shape, so the arc
 * never becomes a second calendar.
 *
 * Pure: the arc components (src/components/DayPath.tsx, src/desk/DayArc.tsx)
 * give it the day and their width, and draw what comes back. Tested in
 * tests/arcmarks.test.cjs.
 */

export type MarkKind = 'done' | 'ahead' | 'event' | 'next' | 'many';

export interface ArcThing { id?: string | null; title: string; at: number }

export interface ArcDay {
  now: number;
  /** minutes after midnight; the end may run past 24 h */
  dayStartMin: number;
  dayEndMin: number;
  /** finished today, at the time each was finished */
  done: ArcThing[];
  /** tasks with a set time today, still to do */
  ahead: ArcThing[];
  /** today's calendar events, at their start */
  events: ArcThing[];
  /** the move in front; `at` is its set time, when it has one */
  next: { id: string; title: string; at: number | null } | null;
}

export interface Mark {
  kind: MarkKind;
  /** how far along the day, 0 to 1 */
  p: number;
  title: string;
  /** when: a finish, a start, a set time (the next move's, when it has one) */
  at: number | null;
  id: string | null;
  /** many: how many, of what, and from when to when */
  count: number;
  of: { done: number; ahead: number; event: number };
  from: number | null;
  to: number | null;
}

/** Marks closer than this (px) would overlap: they become one. */
export const MERGE_PX = 20;

/** How far along the day a moment is; under 0 before it starts, over 1 after it ends. */
export function along(ms: number, dayStartMin: number, dayEndMin: number): number {
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  // past midnight, in a day that runs that late, is still the same day
  const min = dayEndMin > 24 * 60 && m < dayStartMin ? m + 24 * 60 : m;
  return (min - dayStartMin) / (dayEndMin - dayStartMin);
}

const one = (kind: MarkKind, x: ArcThing, p: number): Mark => ({
  kind, p, title: x.title, at: x.at, id: x.id ?? null, count: 1,
  of: { done: kind === 'done' ? 1 : 0, ahead: kind === 'ahead' ? 1 : 0, event: kind === 'event' ? 1 : 0 },
  from: x.at, to: x.at,
});

/**
 * The marks for a day, left to right, the next move last (it's drawn on top).
 * `width`: the arc's length across, in px, from the day's start to its end.
 */
export function arcMarks(day: ArcDay, width: number, gap: number = MERGE_PX): Mark[] {
  const p = (ms: number) => along(ms, day.dayStartMin, day.dayEndMin);
  const inDay = (m: Mark) => m.p >= 0 && m.p <= 1;
  const nextId = day.next?.id ?? null;
  const marks = [
    ...day.done.map(x => one('done', x, p(x.at))),
    // the move in front is at now, not also at its time
    ...day.ahead.filter(x => x.id !== nextId && x.at > day.now).map(x => one('ahead', x, p(x.at))),
    ...day.events.map(x => one('event', x, p(x.at))),
  ].filter(inDay).sort((a, b) => a.p - b.p || (a.at ?? 0) - (b.at ?? 0));

  // marks that would touch become one, with a count
  const out: Mark[] = [];
  let group: Mark[] = [];
  const close = () => {
    if (!group.length) return;
    if (group.length === 1) out.push(group[0]);
    else {
      const of = { done: 0, ahead: 0, event: 0 };
      for (const m of group) { of.done += m.of.done; of.ahead += m.of.ahead; of.event += m.of.event; }
      const times = group.map(m => m.at ?? 0);
      out.push({
        kind: 'many', p: group.reduce((a, m) => a + m.p, 0) / group.length,
        title: '', at: null, id: null, count: group.length, of,
        from: Math.min(...times), to: Math.max(...times),
      });
    }
    group = [];
  };
  for (const m of marks) {
    const last = group[group.length - 1];
    if (last && (m.p - last.p) * width > gap) close();
    group.push(m);
  }
  close();

  // the next move, where Ra is: while the day runs (before it starts, at its start)
  const now = p(day.now);
  if (day.next && now <= 1) {
    out.push({
      kind: 'next', p: Math.max(0, now), title: day.next.title, at: day.next.at, id: day.next.id, count: 1,
      of: { done: 0, ahead: 0, event: 0 }, from: day.next.at, to: day.next.at,
    });
  }
  return out;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What a mark is, in words: its hover title on the desktop, and what a screen reader says. */
export function markSaid(m: Mark): string {
  if (m.kind === 'next') return `Next move: ${m.title}${m.at ? `, ${clock(m.at)}` : ''}`;
  if (m.kind === 'done') return `${m.title}, done ${clock(m.at ?? 0)}`;
  if (m.kind === 'ahead') return `${m.title}, ${clock(m.at ?? 0)}`;
  if (m.kind === 'event') return `${m.title}, ${clock(m.at ?? 0)}, on your calendar`;
  const parts = [
    m.of.done ? `${m.of.done} done` : null,
    m.of.ahead ? `${m.of.ahead} to come` : null,
    m.of.event ? `${m.of.event} on your calendar` : null,
  ].filter(Boolean).join(', ');
  const when = m.from != null && m.to != null && clock(m.from) !== clock(m.to) ? `${clock(m.from)} to ${clock(m.to)}` : clock(m.from ?? 0);
  return `${parts}, ${when}`;
}
