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
/** Whole month names and their usual short forms, as whole words only: "mar"
 *  is March, "mark" is a verb, and "may" only counts next to a day number. */
const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const ORD = '(?:st|nd|rd|th)?';
// "3 march", "3rd of march", "march 3", "mar. 3rd"; never a clock time ("may 3pm")
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}\\b\\.?`, 'i');
const MONTH_DAY = new RegExp(`\\b${MONTH}\\b\\.?\\s+(\\d{1,2})${ORD}\\b(?!\\s*(?::\\d|am\\b|pm\\b))`, 'i');

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
/** A day of a month, clamped: the 31st of a 30-day month is its last day. */
const dayOf = (y: number, m: number, day: number) => {
  const d = new Date(y, m, 1, 9, 0, 0, 0);
  d.setDate(Math.min(day, daysIn(d.getFullYear(), d.getMonth())));
  return d;
};
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Where the parser took a date, time or length out of the sentence. */
const GAP = '\u0000';
/** A word that only introduced what was taken out: "by", "this", "on the". */
const DATE_LEAD = /\b(on|at|by|this|next|every|the|before|until|due|for|in|from)\s*\u0000/gi;

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

/** The first time a repeat actually happens, from `from` on: a weekday
 *  standup typed on a Saturday starts Monday, not this morning. */
function firstOccurrence(rule: RepeatRule, days: number[], from: Date, after: Date): Date {
  const d = new Date(from);
  if (rule === 'monthly') {
    if (d < after) {
      const next = dayOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      return next;
    }
    return d;
  }
  const fits = (x: Date) =>
    rule === 'weekdays' ? isoDay(x) <= 5
    : rule === 'weekly' && days.length ? days.includes(isoDay(x))
    : true;
  for (let i = 0; i < 14 && (d < after || !fits(d)); i++) d.setDate(d.getDate() + 1);
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
    // only real minutes: in "6pm" the second group is the "pm", not two digits
    const min = m[2] && /^\d{2}$/.test(m[2]) ? parseInt(m[2], 10) : 0;
    // am or pm, wherever the match put it (never the minutes: "3:30" has neither)
    const ap = ([m[3], m[2]].find(x => !!x && /^(am|pm)$/i.test(x)) ?? '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    // a bare "at 7" almost always means the evening for personal plans, but
    // guessing wrong on a time is worse than being literal — 7 stays 7.
    // Unless the sentence says so: "tonight at 9" is 21:00.
    if (!ap && h < 12 && /\b(tonight|evening|afternoon)\b/i.test(s)) h += 12;
    // and a bare 1 to 6 is the afternoon, with its minutes or without ("at 3",
    // "3:30"): nobody plans the dentist for 3 in the morning. 7 to 11 stay as
    // said ("gym at 7" is 07:00); "3am" is still 3am, and "03:30" is the clock.
    else if (!ap && h >= 1 && h <= 6 && !m[1].startsWith('0') && !/\bmorning\b/i.test(s)) h += 12;
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

/* ------------------------------------------------------------------ *
 *  What was only said on the way to the thing
 * ------------------------------------------------------------------ */

// "hello", "ok so", "ugh", "hey Nu", "and then": said before the thing itself
const GREETING = /^(?:hello|hi|hiya|hey|yo|ok(?:ay)?|so|um+|uh+|ugh+|argh+|oh|hmm+|well|right|alright|anyways?|basically|actually|honestly|and|also|then|plus|nu|dear nu)\b[\s,.!:]*/i;
// "I want to", "can you remind me to", "please", "note to self": the ask, not the thing
const ASK = /^(?:(?:i|we)\s+(?:really\s+|just\s+|still\s+|also\s+)?(?:want|need|have|would like|'d like|wanna|gotta|got|ought|am going|'m going|plan|hope|wanted|was going|am supposed|'m supposed)\s+to|(?:i|we)(?:'ve|\s+have)\s+got\s+to|(?:i|we)\s+gotta|i'?d\s+(?:really\s+)?(?:like|love)\s+to|i'?m\s+(?:going|trying|planning|hoping)\s+to|i\s+(?:should|must|could)|(?:can|could|will|would)\s+you\s+(?:please\s+)?(?:help\s+me\s+(?:to\s+)?)?|help\s+me\s+(?:to\s+)?|remind\s+me\s+(?:to|that\s+i\s+(?:need|have)\s+to)|(?:don'?t|do\s+not)\s+(?:let\s+me\s+)?forget\s+to|remember\s+to|make\s+sure\s+(?:i|to)|note\s+to\s+self|to\s*-?\s*do\s*:|task\s*:|please|let'?s|my\s+goal\s+is\s+to|the\s+goal\s+is\s+to|(?:it'?s\s+)?time\s+to)\b[\s,:]*/i;

/**
 * Your words without what was only said on the way to them: "Hello I want
 * to finish my website" is "finish my website". Every reading starts here
 * (parseTaskAt, understand, each piece of a run-on sentence), so no way of
 * putting something down keeps the greeting in the title.
 */
export function stripFiller(input: string): string {
  let s = input.trim().replace(/[‘’]/g, "'");
  for (let i = 0; i < 8; i++) {
    const next = s.replace(GREETING, '').replace(ASK, '').trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[.!\s]+$/, '');
}

/** One argument on purpose: `lines.map(parseTask)` would hand the index in as a clock. */
export function parseTask(input: string): Draft {
  return parseTaskAt(input, new Date());
}

/** The parser against a given "now", so tests can pin the clock. */
export function parseTaskAt(input: string, now: Date): Draft {
  // the greeting and the ask come off first; words that are nothing but filler stay as they are
  let s = ` ${stripFiller(input) || input.trim()} `;
  const found: string[] = [];
  // what the parser takes out leaves a marker, so the small words that only
  // introduced it ("by friday", "this tuesday", "on the 3rd") can go too
  const eat = (re: RegExp) => { s = s.replace(re, ` ${GAP} `); };

  /* --- repeats --- */
  let repeat: RepeatRule | null = null;
  let days: number[] = [];

  // "every weekday" must not fall into this branch — it's checked below
  if (/\bevery\s*day\b|\bdaily\b/i.test(s)) {
    repeat = 'daily'; found.push('every day');
    eat(/\bevery\s*day\b|\bdaily\b/i);
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
  // "in 2 hours" is a moment, not a day: it keeps its own time
  let exact = false;
  if (/\btoday\b/i.test(s))          { due = new Date(now); found.push('today'); eat(/\btoday\b/i); }
  else if (/\b(tomorrow|tmrw|tmr)\b/i.test(s))  { due = new Date(now); due.setDate(due.getDate() + 1); found.push('tomorrow'); eat(/\b(tomorrow|tmrw|tmr)\b/i); }
  else if (/\btonight\b/i.test(s))   { due = new Date(now); found.push('tonight'); }
  else if (/\bnext week\b/i.test(s)) { due = new Date(now); due.setDate(due.getDate() + 7); found.push('next week'); eat(/\bnext week\b/i); }

  const inN = s.match(/\bin\s+(\d+)\s*(day|days|week|weeks|hour|hours|min|mins|minutes)\b/i);
  if (inN && !due) {
    const n = parseInt(inN[1], 10);
    due = new Date(now);
    if (/day/i.test(inN[2]))       due.setDate(due.getDate() + n);
    else if (/week/i.test(inN[2])) due.setDate(due.getDate() + n * 7);
    else {
      if (/hour/i.test(inN[2])) due.setHours(due.getHours() + n);
      else                      due.setMinutes(due.getMinutes() + n);
      due.setSeconds(0, 0);
      exact = true;
    }
    found.push(`in ${n} ${inN[2]}`);
    eat(/\bin\s+\d+\s*(day|days|week|weeks|hour|hours|min|mins|minutes)\b/i);
  }

  // "12 aug" / "aug 12" / "3rd of march"; the 31st of a short month is its last day
  const dm = s.match(DAY_MONTH) || s.match(MONTH_DAY);
  if (dm && !due) {
    const isDayFirst = /^\d/.test(dm[1]);
    const day = parseInt(isDayFirst ? dm[1] : dm[2], 10);
    const mon = MONTHS.indexOf((isDayFirst ? dm[2] : dm[1]).slice(0, 3).toLowerCase());
    if (day >= 1 && day <= 31) {
      due = dayOf(now.getFullYear(), mon, day);
      if (due < startOfDay(now)) due = dayOf(now.getFullYear() + 1, mon, day);   // a past date means next year
      found.push(due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
      eat(new RegExp(dm[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
  }

  // a bare day of the month: "on the 28th", "the 3rd", "on 15"
  if (!due) {
    const dom = s.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
             || s.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i)
             || s.match(/\bon\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dom) {
      const day = parseInt(dom[1], 10);
      if (day >= 1 && day <= 31) {
        due = dayOf(now.getFullYear(), now.getMonth(), day);
        // a day that has already passed this month means next month
        if (due < startOfDay(now)) due = dayOf(now.getFullYear(), now.getMonth() + 1, day);
        found.push(due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
        eat(new RegExp(dom[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
    }
  }

  // a bare weekday with no repeat means the NEXT one
  if (!due && days.length === 1 && !repeat) {
    due = nextWeekday(days[0], now);
    found.push(due.toLocaleDateString(undefined, { weekday: 'long' }));
  }

  /* --- time of day --- */
  const dayGiven = !!due;
  const time = exact ? null : findTime(s);
  if (time) {
    due = due ?? new Date(now);
    due.setHours(time.h, time.m, 0, 0);
    // "at 7" with no day, already gone? they mean tomorrow. A day that was
    // named ("today at 8", "26 sep at 8") stays the day that was named.
    if (!dayGiven && !repeat && due.getTime() < now.getTime() - 60_000) due.setDate(due.getDate() + 1);
    found.push(`${String(time.h).padStart(2, '0')}:${String(time.m).padStart(2, '0')}`);
    eat(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i);
    eat(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i);
    eat(/\b\d{1,2}\s*(am|pm)\b/i);
    eat(/\b(tonight|this evening|morning|afternoon|evening|noon|midday|lunchtime)\b/i);
  } else if (due && !exact) {
    due.setHours(9, 0, 0, 0);
  }

  // a repeat starts at its next real occurrence, never earlier today
  if (repeat && due) due = firstOccurrence(repeat, days, due, time ? new Date(now.getTime() - 60_000) : startOfDay(now));

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
  // Only words standing right before something the parser took out are
  // dropped. This used to strip "the", "a", "on", "at" from the whole title,
  // so "Book the dentist" became "Book dentist" and "Finish the report by
  // friday" became "Finish report by".
  let title = s, before: string;
  do {
    before = title;
    title = title.replace(DATE_LEAD, ` ${GAP} `);
  } while (title !== before);
  title = title
    .split(GAP).join(' ')
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
    // "Urgent: fix the bug" -> the colon outlives the word it followed
    .replace(/^[\s:;,.\-–—]+|[\s:;,\-–—]+$/g, '')
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
    has_time: !!time || exact,
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
  | { kind: 'vague'; draft: Draft }
  | { kind: 'now' }
  | { kind: 'today' }
  | { kind: 'progress' }
  | { kind: 'count' }
  | { kind: 'help' }
  | { kind: 'hello' };

/**
 * "Work on the presentation" isn't a task, it's a whole open-ended project
 * wearing a task's clothes — there's no first physical action in it, so it
 * just sits, unstarted, looking exactly as done as everything else on the
 * list. Catching the shape of it (a vague verb with nothing concrete after
 * it) and offering a ten-minute first slice is worth more than parsing it
 * perfectly.
 */
const VAGUE_RE = /^(work on|think about|sort out|deal with|look into|figure out)\b/i;

export function route(input: string): Intent {
  const s = input.trim().toLowerCase();

  if (/^(hi|hey|hello|yo)\b/.test(s)) return { kind: 'hello' };
  if (/\b(help|what can you do|how does this work)\b/.test(s)) return { kind: 'help' };
  if (/\b(what|which).*(should i|do i|shall i).*(do|start)|what now|what next\b/.test(s)) return { kind: 'now' };
  if (/\bwhat('| i)?s (on |up )?(for )?today\b|\bmy day\b|\bschedule\b|\bagenda\b/.test(s)) return { kind: 'today' };
  if (/\bhow am i doing\b|\bprogress\b|\bhow's it going\b|\bmy light\b|\bmy rank\b/.test(s)) return { kind: 'progress' };
  if (/\bhow (many|much).*(left|to do|outstanding)\b|\bwhat('| i)?s left\b/.test(s)) return { kind: 'count' };
  if (VAGUE_RE.test(s)) return { kind: 'vague', draft: parseTask(input) };

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
    if (d.has_time) bits.push(dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }
  if (d.est_minutes) bits.push(d.est_minutes < 60 ? `${d.est_minutes} min` : `${d.est_minutes / 60} hr`);
  if (d.priority >= 3) bits.push('high priority');
  return bits.join(' · ');
}
