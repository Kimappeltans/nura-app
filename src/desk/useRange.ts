import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../store';
import { tasksBetween, type Task } from '../db';
import { eventsBetween, type UpcomingEvent } from '../calendar';

/**
 * The tasks dated and the calendar's events between two times, kept current:
 * anything added, moved or done while the room is open reloads them (Tell Nu
 * is a sheet over the room, so the room never loses focus).
 */
export function useRange(from: number, to: number) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const inbox = useStore(s => s.inbox);
  const todayPicked = useStore(s => s.todayPicked);
  const wins = useStore(s => s.wins);
  const load = useCallback(async () => {
    const [ts, es] = await Promise.all([
      tasksBetween(from, to).catch(() => [] as Task[]),
      eventsBetween(from, to).catch(() => [] as UpcomingEvent[]),
    ]);
    setTasks(ts); setEvents(es);
  }, [from, to]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [inbox, todayPicked, wins, load]);
  return { tasks, events, reload: load };
}

/** A clock that moves on every half minute, so the time, the arc and the "now" line keep up. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}
