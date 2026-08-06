import { guessActivity, activityById, type ActivityId } from './activities';
import { guessLabel, type LabelId } from './labels';
import type { RepeatRule } from './db';

/**
 * The assistant, without a model behind it.
 *
 * The single most valuable thing a chatbot can do in a task app is turn one
 * sentence into a correctly-structured task: "gym tuesday and thursday at 7"
 * should become a weekly repeat on days 2 and 4 at 07:00, labelled Health,
 * with the Exercise scene — not a to-do literally titled "gym tuesday and
 * thursday at 7", which is what typing it into the capture box gets you today.
 *
 * That job is deterministic, so it doesn't need a model. Doing it locally
 * means it is instant, works on a plane, costs nothing per message, and can
 * never invent a date that wasn't in the sentence — which for a scheduling
 * tool is not a small thing.
 *
 * The parser NEVER commits. It returns a draft, the chat shows it as a card,
 * and you confirm. An assistant that silently creates the wrong recurring
 * event is worse than no assistant.
 *
 * When a real model is added later, this stays: as the fast path for the
 * common case, and as the fallback when the network is gone.
 */

/* ------------------------------------------------------------------ *
 *  Time
 * ------------------------------------------------------------------ */

const WEEKDAYS: [RegExp, number][] = [
  [/\b(mon|monday)s?\b/i, 1],
  [/\b(tue|tues|tuesday)s?\b/i, 2],
  [/\b(wed|weds|wednesday)s?\b/i, 3],
  [/\b(thu|thur|thurs|thursday)s?\b/i, 4],
  [/\b(fri|friday)s?\b/i, 5],
  [/\b(sat|saturday)s?\b/i, 6],
  [/\b(sun|sunday)s?\b/i, 7],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Monday = 1 … Sunday = 7, matching the rest of the app. */
const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1;

function nextWeekday(target: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (isoDay(d) === target) return d;
  }
  return d;
}

interface TimeFound { h: number; m: number }

function findTime(s: string): TimeFound | null {
  // "at 7", "at 7:30", "7pm", "19:00", "half seven" is a bridge too far
  let m = s.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
       || s.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/i)
       || s.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] && m[2].length === 2 ? parseInt(m[2], 10) : 0;
    const ap = (m[3] || m[2] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    // a bare "at 7" almost always means the evening for personal plans, but
    // guessing wrong on a time is worse than being literal — 7 stays 7
    if (h >= 0 && h <= 23) return { h, m: min };
  }
  if (/\b(tonight|this evening)\b/i.test(s)) return { h: 19, m: 0 };
  if (/\bmorning\b/i.test(s)) return { h: 9, m: 0 };
  if (/\b(noon|midday|lunch(time)?)\b/i.test(s)) return { h: 12, m: 0 };
  if (/\bafternoon\b/i.test(s)) return { h: 15, m: 0 };
  if (/\bevening\b/i.test(s)) return { h: 18, m: 0 };
  return null;
}

/* ------------------------------------------------------------------ *
 *  The draft
 * ------------------------------------------------------------------ */

export interface Draft {
  title: string;
  activity: ActivityId | null;
  label: LabelId | null;
  est_minutes: number | null;
  due_at: number | null;
  has_time: boolean;
  repeat_rule: RepeatRule | null;
  repeat_days: string | null;
  priority: number;
  /** what the parser actually recognised, so the card can show its working */
  found: string[];
}

export function parseTask(input: string): Draft {
  let s = ` ${input.trim()} `;
  const found: string[] = [];
  const eat = (re: RegExp) => { s = s.replace(re, ' '); };

  /* --- repeats --- */
  let repeat: RepeatRule | null = null;
  let days: number[] = [];

  if (/\bevery\s+(week)?day\b|\bdaily\b/i.test(s)) {
    repeat = 'daily'; found.push('every day');
    eat(/\bevery\s+(week)?day\b|\bdaily\b/i);
  } else if (/\bweekdays?\b|\bevery weekday\b/i.test(s)) {
    repeat = 'weekdays'; found.push('weekdays');
    eat(/\bevery weekday\b|\bweekdays?\b/i);
  } else if (/\bmonthly\b|\bevery month\b/i.test(s)) {
    repeat = 'monthly'; found.push('every month');
    eat(/\bmonthly\b|\bevery month\b/i);
  }

  // "every tuesday and thursday" / "mondays" / "on wed"
  const repeating = /\bevery\b/i.test(s) || /\b\w+days\b/i.test(s);
  for (const [re, n] of WEEKDAYS) {
    if (re.test(s)) { days.push(n); }
  }
  if (days.length) {
    if (repeating || days.length > 1) {
      repeat = repeat ?? 'weekly';
      found.push(`every ${days.length > 1 ? days.length + ' days a week' : 'week'}`);
    }
    for (const [re] of WEEKDAYS) eat(re);
    eat(/\bevery\b/i);
  } else if (/\bweekly\b|\bevery week\b/i.test(s)) {
    repeat = 'weekly'; found.push('every week');
    eat(/\bweekly\b|\bevery week\b/i);
  }

  /* --- when --- */
  let due: Date | null = null;
  if (/\btoday\b/i.test(s))          { due = new Date(); found.push('today'); eat(/\btoday\b/i); }
  else if (/\btomorrow\b/i.test(s))  { due = new Date(); due.setDate(due.getDate() + 1); found.push('tomorrow'); eat(/\btomorrow\b/i); }
  else if (/\btonight\b/i.test(s))   { due = new Date(); found.push('tonight'); }
  else if (/\bnext week\b/i.test(s)) { due = new Date(); due.setDate(due.getDate() + 7); found.push('next week'); eat(/\bnext week\b/i); }

  const inN = s.match(/\bin\s+(\d+)\s*(day|days|week|weeks|hour|hours|min|mins|minutes)\b/i);
  if (inN && !due) {
    const n = parseInt(inN[1], 10);
    due = new Date();
    if (/day/i.test(inN[2]))       due.setDate(due.getDate() + n);
    else if (/week/i.test(inN[2])) due.setDate(due.getDate() + n * 7);
    else if (/hour/i.test(inN[2])) due.setHours(due.getHours() + n);
    else                            due.setMinutes(due.getMinutes() + n);
    found.push(`in ${n} ${inN[2]}`);
    eat(/\bin\s+\d+\s*(day|days|week|weeks|hour|hours|min|mins|minutes)\b/i);
  }

  // "12 aug" / "aug 12" / "on the 12th"
  const dm = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})\\w*\\b`, 'i'))
          || s.match(new RegExp(`\\b(${MONTHS.join('|')})\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  if (dm && !due) {
    const isDayFirst = /^\d/.test(dm[1]);
    const day = parseInt(isDayFirst ? dm[1] : dm[2], 10);
    const mon = MONTHS.indexOf((isDayFirst ? dm[2] : dm[1]).slice(0, 3).toLowerCase());
    const now = new Date();
    due = new Date(now.getFullYear(), mon, day, 9, 0, 0, 0);
    if (due < now) due.setFullYear(due.getFullYear() + 1);   // a past date means next year
    found.push(due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    eat(new RegExp(dm[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  // a bare day of the month: "on the 28th", "the 3rd", "on 15"
  if (!due) {
    const dom = s.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
             || s.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i)
             || s.match(/\bon\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dom) {
      const day = parseInt(dom[1], 10);
      if (day >= 1 && day <= 31) {
        const now = new Date();
        due = new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0, 0);
        // a day that has already passed this month means next month
        if (due.getTime() < now.getTime() - 86400_000) due.setMonth(due.getMonth() + 1);
        found.push(due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
        eat(new RegExp(dom[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
    }
  }

  // a bare weekday with no repeat means the NEXT one
  if (!due && days.length === 1 && !repeat) {
    due = nextWeekday(days[0]);
    found.push(due.toLocaleDateString(undefined, { weekday: 'long' }));
  }

  /* --- time of day --- */
  const time = findTime(s);
  if (time) {
    due = due ?? new Date();
    due.setHours(time.h, time.m, 0, 0);
    // "at 7" today, already gone? they mean tomorrow
    if (due.getTime() < Date.now() - 60_000 && !repeat) due.setDate(due.getDate() + 1);
    found.push(`${String(time.h).padStart(2, '0')}:${String(time.m).padStart(2, '0')}`);
    eat(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i);
    eat(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i);
    eat(/\b\d{1,2}\s*(am|pm)\b/i);
    eat(/\b(tonight|this evening|morning|afternoon|evening|noon|midday|lunchtime)\b/i);
  } else if (due) {
    due.setHours(9, 0, 0, 0);
  }

  /* --- how long --- */
  let mins: number | null = null;
  const dur = s.match(/\bfor\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i)
           || s.match(/\b(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b(?!\s*(am|pm))/i);
  if (dur) {
    const n = parseInt(dur[1], 10);
    mins = /^h/i.test(dur[2]) ? n * 60 : n;
    found.push(mins < 60 ? `${mins} min` : `${mins / 60} hr`);
    eat(new RegExp(dur[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  } else if (/\bhalf an hour\b/i.test(s)) {
    mins = 30; found.push('30 min'); eat(/\bhalf an hour\b/i);
  } else if (/\ban hour\b/i.test(s)) {
    mins = 60; found.push('1 hr'); eat(/\ban hour\b/i);
  }

  /* --- priority --- */
  let priority = 0;
  if (/\b(urgent|asap|important|high priority)\b/i.test(s)) {
    priority = 3; found.push('high priority');
    eat(/\b(urgent|asap|important|high priority)\b/i);
  } else if (/\b(low priority|whenever|no rush)\b/i.test(s)) {
    priority = 1; eat(/\b(low priority|whenever|no rush)\b/i);
  }

  /* --- what's left is the title --- */
  let title = s
    .replace(/\b(every|on|at|the|a|an|this|next)\b/gi, ' ')
    .replace(/[,;]+/g, ' ')
    // "gym tuesday and thursday" -> the weekdays are eaten, and a lone "and"
    // is left behind. Strip conjunctions that no longer join anything, plus
    // any ordinal whose date was consumed.
    .replace(/\b(and|&|or|plus)\b\s*$/gi, ' ')
    .replace(/^\s*\b(and|&|or|plus)\b/gi, ' ')
    .replace(/\b(and|&)\s+(and|&)\b/gi, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(and|&|or|plus)$/i, '')
    .trim();
  if (!title) title = input.trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const activity = guessActivity(input);
  const act = activityById(activity);
  const label = act?.label ?? guessLabel(input);

  return {
    title,
    activity,
    label,
    est_minutes: mins,
    due_at: due ? due.getTime() : null,
    has_time: !!time,
    repeat_rule: repeat,
    repeat_days: repeat === 'weekly' && days.length ? days.sort((a, b) => a - b).join(',') : null,
    priority,
    found,
  };
}

/* ------------------------------------------------------------------ *
 *  Intent
 * ------------------------------------------------------------------ */

export type Intent =
  | { kind: 'create'; draft: Draft }
  | { kind: 'now' }
  | { kind: 'today' }
  | { kind: 'progress' }
  | { kind: 'count' }
  | { kind: 'help' }
  | { kind: 'hello' };

export function route(input: string): Intent {
  const s = input.trim().toLowerCase();

  if (/^(hi|hey|hello|yo)\b/.test(s)) return { kind: 'hello' };
  if (/\b(help|what can you do|how does this work)\b/.test(s)) return { kind: 'help' };
  if (/\b(what|which).*(should i|do i|shall i).*(do|start)|what now|what next\b/.test(s)) return { kind: 'now' };
  if (/\bwhat('| i)?s (on |up )?(for )?today\b|\bmy day\b|\bschedule\b|\bagenda\b/.test(s)) return { kind: 'today' };
  if (/\bhow am i doing\b|\bprogress\b|\bhow's it going\b|\bmy light\b|\bmy rank\b/.test(s)) return { kind: 'progress' };
  if (/\bhow (many|much).*(left|to do|outstanding)\b|\bwhat('| i)?s left\b/.test(s)) return { kind: 'count' };

  return { kind: 'create', draft: parseTask(input) };
}

/** A plain-English readback of what the parser understood. */
export function describe(d: Draft): string {
  const bits: string[] = [];
  if (d.repeat_rule === 'daily') bits.push('every day');
  else if (d.repeat_rule === 'weekdays') bits.push('every weekday');
  else if (d.repeat_rule === 'monthly') bits.push('every month');
  else if (d.repeat_rule === 'weekly') {
    const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const ds = (d.repeat_days ?? '').split(',').filter(Boolean).map(n => names[+n]);
    bits.push(ds.length ? `every ${ds.join(' & ')}` : 'every week');
  }
  if (d.due_at) {
    const dt = new Date(d.due_at);
    if (!d.repeat_rule) bits.push(dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
    if (d.has_time) bits.push(dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }
  if (d.est_minutes) bits.push(d.est_minutes < 60 ? `${d.est_minutes} min` : `${d.est_minutes / 60} hr`);
  if (d.priority >= 3) bits.push('high priority');
  return bits.join(' · ');
}
