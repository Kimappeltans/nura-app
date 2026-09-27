// The function-style API moved to /legacy in Expo 57; the bare import now throws
// "deprecated" at call time. The new object-oriented API is a later migration.
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { getFlag, setFlag } from './db';

/**
 * The calendar.
 *
 * READ is the default and always sufficient: how much time is actually
 * available before the next hard stop, so the energy filter and the transition
 * warning work from a real number instead of a guess.
 *
 * WRITE is opt-in, per the sync setting on the Connect screen (or Settings →
 * Calendar, which also picks the calendar it goes to). When two-way is
 * on, a finished focus session is written back as an event — so the hour you
 * actually spent shows up in the same place as the meetings that ate the rest
 * of the day. Nothing is ever written without that switch being turned on
 * explicitly, and Nura never edits or deletes an event it didn't create.
 */

export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function hasCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

export type UpcomingEvent = { id: string; title: string; startsAt: number; endsAt: number };

/** A calendar on the phone, for Settings → Calendar. */
export type PhoneCalendar = { id: string; title: string; writable: boolean; shown: boolean };

/** The calendars turned off in Settings → Calendar. Stored as the ones left
 *  out, so a calendar added to the phone later shows up by itself. */
async function hiddenIds(): Promise<Set<string>> {
  try { return new Set(JSON.parse((await getFlag('calendar.hidden')) || '[]')); } catch { return new Set(); }
}

/** The ids of the calendars Nura reads: every one on the phone but those turned off. */
async function shownCalendarIds(): Promise<string[]> {
  const [cals, hidden] = await Promise.all([Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT), hiddenIds()]);
  return cals.filter(c => !hidden.has(c.id)).map(c => c.id);
}

export async function phoneCalendars(): Promise<PhoneCalendar[]> {
  if (Platform.OS === 'web' || !(await hasCalendarPermission())) return [];
  try {
    const [cals, hidden] = await Promise.all([Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT), hiddenIds()]);
    return cals
      .map(c => ({ id: c.id, title: c.title || 'Calendar', writable: !!c.allowsModifications, shown: !hidden.has(c.id) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch { return []; }
}

export async function showCalendar(id: string, shown: boolean) {
  const hidden = await hiddenIds();
  if (shown) hidden.delete(id); else hidden.add(id);
  await setFlag('calendar.hidden', JSON.stringify([...hidden]));
}

/** Where a finished focus session is written (Settings → Calendar): null
 *  when that's off. The same switch as the Connect screen's two-way sync. */
export async function focusCalendar(): Promise<string | null> {
  if ((await getFlag('sync.calendar')) !== 'two') return null;
  // the one chosen, while it's still there and writable; else the first that is
  const chosen = await getFlag('calendar.write');
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT).catch(() => []);
  return cals.some(c => c.id === chosen && c.allowsModifications) ? chosen : await writableCalendarId();
}
export async function setFocusCalendar(id: string | null) {
  await setFlag('sync.calendar', id ? 'two' : 'read');
  if (id) await setFlag('calendar.write', id);
}

/**
 * The next real (non-all-day) event starting within `lookaheadMs`. Returns
 * null on web, without permission, or with nothing that close — callers
 * treat null as "no constraint," never as an error.
 */
export async function nextEvent(lookaheadMs = 4 * 3600_000): Promise<UpcomingEvent | null> {
  if (Platform.OS === 'web') return null;
  // a calendar that won't answer is no constraint, never a failed refresh()
  try {
    if (!(await hasCalendarPermission())) return null;

    const ids = await shownCalendarIds();
    if (!ids.length) return null;

    const now = Date.now();
    const events = await Calendar.getEventsAsync(
      ids, new Date(now), new Date(now + lookaheadMs),
    );
    const upcoming = events
      .filter(e => !e.allDay)
      .map(e => ({
        id: e.id, title: e.title || 'Busy',
        startsAt: new Date(e.startDate as string).getTime(),
        endsAt: new Date(e.endDate as string).getTime(),
      }))
      .filter(e => e.startsAt > now)
      .sort((a, b) => a.startsAt - b.startsAt);

    return upcoming[0] ?? null;
  } catch { return null; }
}

/**
 * Everything on the calendar today, in order. The home screen lays your real
 * commitments alongside your tasks — you cannot plan a day against a list that
 * pretends the day is empty.
 */
export async function todayEvents(): Promise<UpcomingEvent[]> {
  if (Platform.OS === 'web') return [];
  try {
    if (!(await hasCalendarPermission())) return [];
    const ids = await shownCalendarIds();
    if (!ids.length) return [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const events = await Calendar.getEventsAsync(ids, start, end);
    return events
      .filter(e => !e.allDay)
      .map(e => ({
        id: e.id, title: e.title || 'Busy',
        startsAt: new Date(e.startDate as string).getTime(),
        endsAt: new Date(e.endDate as string).getTime(),
      }))
      .sort((a, b) => a.startsAt - b.startsAt);
  } catch { return []; }
}

/** Every non-all-day event in an arbitrary window — what the month grid draws. */
export async function eventsBetween(fromMs: number, toMs: number): Promise<UpcomingEvent[]> {
  if (Platform.OS === 'web') return [];
  if (!(await hasCalendarPermission())) return [];
  try {
    const ids = await shownCalendarIds();
    if (!ids.length) return [];
    const events = await Calendar.getEventsAsync(
      ids, new Date(fromMs), new Date(toMs));
    return events
      .filter(e => !e.allDay)
      .map(e => ({
      id: e.id, title: e.title || 'Busy',
      startsAt: new Date(e.startDate as string).getTime(),
      endsAt: new Date(e.endDate as string).getTime(),
    }))
      .sort((a, b) => a.startsAt - b.startsAt);
  } catch { return []; }
}

/** The first calendar we're actually allowed to write into. */
async function writableCalendarId(): Promise<string | null> {
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ok = cals.find(c => c.allowsModifications);
    return ok?.id ?? null;
  } catch { return null; }
}

/**
 * Write a finished focus session back to the calendar. Silent no-op unless
 * two-way sync is on and we have somewhere to put it — a failed write must
 * never interrupt the moment someone just finished something.
 */
export async function writeFocusBlock(title: string, startMs: number, endMs: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!(await hasCalendarPermission())) return false;
  const id = await focusCalendar();       // the calendar chosen in Settings
  if (!id) return false;
  try {
    await Calendar.createEventAsync(id, {
      title: `Focused: ${title}`,
      startDate: new Date(startMs),
      endDate: new Date(endMs),
      notes: 'Logged by Nura',
      alarms: [],
    });
    return true;
  } catch { return false; }
}

/** Minutes until a hard stop, for the "47 minutes until your 3pm" framing. */
export function minutesUntil(ev: UpcomingEvent): number {
  return Math.max(0, Math.round((ev.startsAt - Date.now()) / 60_000));
}
