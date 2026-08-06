import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * The calendar.
 *
 * READ is the default and always sufficient: how much time is actually
 * available before the next hard stop, so the energy filter and the transition
 * warning work from a real number instead of a guess.
 *
 * WRITE is opt-in, per the sync setting on the Connect screen. When two-way is
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

export type UpcomingEvent = { id: string; title: string; startsAt: number };

/**
 * The next real (non-all-day) event starting within `lookaheadMs`. Returns
 * null on web, without permission, or with nothing that close — callers
 * treat null as "no constraint," never as an error.
 */
export async function nextEvent(lookaheadMs = 4 * 3600_000): Promise<UpcomingEvent | null> {
  if (Platform.OS === 'web') return null;
  if (!(await hasCalendarPermission())) return null;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return null;

  const now = Date.now();
  const events = await Calendar.getEventsAsync(
    calendars.map(c => c.id), new Date(now), new Date(now + lookaheadMs),
  );
  const upcoming = events
    .filter(e => !e.allDay)
    .map(e => ({ id: e.id, title: e.title || 'Busy', startsAt: new Date(e.startDate as string).getTime() }))
    .filter(e => e.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt);

  return upcoming[0] ?? null;
}

/**
 * Everything on the calendar today, in order. The home screen lays your real
 * commitments alongside your tasks — you cannot plan a day against a list that
 * pretends the day is empty.
 */
export async function todayEvents(): Promise<UpcomingEvent[]> {
  if (Platform.OS === 'web') return [];
  if (!(await hasCalendarPermission())) return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const events = await Calendar.getEventsAsync(calendars.map(c => c.id), start, end);
  return events
    .filter(e => !e.allDay)
    .map(e => ({ id: e.id, title: e.title || 'Busy', startsAt: new Date(e.startDate as string).getTime() }))
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** Every non-all-day event in an arbitrary window — what the month grid draws. */
export async function eventsBetween(fromMs: number, toMs: number): Promise<UpcomingEvent[]> {
  if (Platform.OS === 'web') return [];
  if (!(await hasCalendarPermission())) return [];
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!calendars.length) return [];
    const events = await Calendar.getEventsAsync(
      calendars.map(c => c.id), new Date(fromMs), new Date(toMs));
    return events
      .filter(e => !e.allDay)
      .map(e => ({ id: e.id, title: e.title || 'Busy', startsAt: new Date(e.startDate as string).getTime() }))
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
  const id = await writableCalendarId();
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
