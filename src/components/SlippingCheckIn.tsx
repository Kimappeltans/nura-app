import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { checkInDue, markCheckInSeen, type Task } from '../db';
import { useTaskActions } from '../useTaskActions';
import { ActionSheet, type SheetAction } from './ActionSheet';

/**
 * A task that keeps slipping gets one kind check-in — never a red badge.
 * Looks through `tasks` for the first one due a check-in (db.checkInDue) and
 * asks, once, what's really going on. `paused` holds it back (while you're
 * searching, say).
 */
export function SlippingCheckIn({ tasks, paused }: { tasks: Task[]; paused?: boolean }) {
  const [task, setTask] = useState<Task | null>(null);
  const { later, letGo } = useTaskActions();

  useEffect(() => {
    let dead = false;
    (async () => {
      if (task || paused) return;
      for (const x of tasks) if (await checkInDue(x)) { if (!dead) setTask(x); return; }
    })();
    return () => { dead = true; };
  }, [tasks, task, paused]);

  const actions: SheetAction[] = task ? [
    { key: 'smaller', glyph: '◊', label: 'Too big — make it smaller', sub: 'break it into a first, smaller step',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: task.id, focus: 'steps' } }) },
    { key: 'waiting', glyph: '⋯', label: "Blocked — I'm waiting on someone", sub: 'stays in the list, stops being asked',
      onPress: () => later(task, 3 * 24 * 60) },
    { key: 'when', glyph: '↓', label: 'Wrong time — change the date', sub: 'open it and pick a date that fits',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: task.id } }) },
    { key: 'drop', glyph: '×', label: 'Not important anymore', sub: 'gone, no explanation needed', onPress: () => letGo(task) },
  ] : [];

  return (
    <ActionSheet visible={!!task} title="This one keeps slipping" subtitle={task?.title}
      actions={actions} dismissLabel="It's fine, keep it"
      onDismiss={async () => { if (task) await markCheckInSeen(task); setTask(null); }} />
  );
}
