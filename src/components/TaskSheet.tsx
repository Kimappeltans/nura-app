import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useStore, useTheme } from '../store';
import { PRIORITIES } from '../priority';
import { radius, type as T } from '../theme';
import { useTaskActions } from '../useTaskActions';
import { ActionSheet, type SheetAction } from './ActionSheet';
import type { Task } from '../db';

/**
 * Hold a task: its priority, and what else you can do with it — focus on it,
 * mark it done, put it on Today or take it off, open its details, move it out
 * of the way, let it go. Shown by any list of tasks; `task` null hides it.
 */
export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const t = useTheme();
  const focusOn = useStore(s => s.focusOn);
  const { tick, addToToday, takeOffToday, setPriority, later, letGo } = useTaskActions();
  // the priority shown changes the moment it's tapped, before the store catches up
  const [priority, setShown] = useState(task?.priority ?? 0);
  useEffect(() => { setShown(task?.priority ?? 0); }, [task?.id, task?.priority]);

  const actions: SheetAction[] = task ? [
    { key: 'focus', glyph: '▶', label: 'Focus on this now', onPress: () => focusOn(task.id) },
    { key: 'done', glyph: '✓', label: 'Mark as done', onPress: () => tick(task.id) },
    task.state === 'inbox'
      ? { key: 'today', glyph: '+', label: 'Add to Today', onPress: () => addToToday(task) }
      : { key: 'today', glyph: '−', label: 'Take off Today', sub: 'back into everything else', onPress: () => takeOffToday(task) },
    { key: 'open', glyph: '✎', label: 'Details', sub: 'first move, length, date, steps',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: task.id } }) },
    { key: 'later', glyph: '↓', label: 'Later today', sub: 'out of the way for a few hours', onPress: () => later(task) },
    { key: 'drop', glyph: '×', label: 'Let it go', sub: 'gone, no explanation needed', onPress: () => letGo(task) },
  ] : [];

  return (
    <ActionSheet visible={!!task} title={task?.title ?? ''} actions={actions} dismissLabel="Close" onDismiss={onClose}>
      {!!task && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 8 }}>PRIORITY</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[...PRIORITIES].reverse().map(p => {
              const on = priority === p.n;
              const c = p.n ? p.color : t.ink2;
              return (
                <Pressable key={p.n} onPress={() => { setShown(p.n); setPriority(task, p.n); }} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill,
                  borderWidth: 1.5, borderColor: on ? c : t.strokeStrong, backgroundColor: on ? `${c}26` : 'transparent',
                }}>
                  <Text style={{ color: on ? c : t.ink2, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </ActionSheet>
  );
}
