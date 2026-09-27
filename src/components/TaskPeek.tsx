import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { priorityOf } from '../priority';
import { type as T } from '../theme';
import { formatDue } from './DatePicker';
import { Sheet } from './Sheet';
import { Primary, Ghost } from '../ui';
import { useTaskActions } from '../useTaskActions';

/**
 * A task, at a glance, in a sheet: what it is, when, how long, which project
 * — and the two things you'd do next: Edit it, or Start focus on it.
 * "Mark as done" finishes it without a session; "More actions" opens the
 * task's action sheet (priority, later, let go).
 */
export function TaskPeek({ task, onClose, onMore }: { task: Task | null; onClose: () => void; onMore?: (task: Task) => void }) {
  const t = useTheme();
  const { projects, todayPicked, focusOn } = useStore();
  const { tick } = useTaskActions();
  if (!task) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;

  const project = projects.find(p => p.current?.task_id === task.id)?.project.title;
  const onToday = todayPicked.some(x => x.id === task.id);
  const when = task.due_at ? formatDue(task.due_at, !!task.has_time) : onToday ? 'Today · flexible' : 'Flexible';
  const sub = [
    (task.priority ?? 0) > 0 ? `${priorityOf(task.priority).name} priority` : null,
    task.est_minutes ? `about ${task.est_minutes} minutes` : null,
  ].filter(Boolean).join(' · ');
  const rows: [string, string][] = [
    ['When', when],
    ['Duration', task.est_minutes ? `${task.est_minutes} min` : 'Not set'],
    ...(project ? [['Project', project] as [string, string]] : []),
  ];

  return (
    <Sheet visible onClose={onClose}>
      <Text style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.4 }}>{task.title}</Text>
      {!!sub && <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 5 }}>{sub}</Text>}

      <View style={{ marginTop: 10 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
            <Text style={{ color: t.ink, fontSize: 14.5 }}>{k}</Text>
            <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 14.5, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
        <Ghost label="Edit" style={{ flex: 1 }}
          onPress={() => { onClose(); router.push({ pathname: '/task/[id]', params: { id: task.id } }); }} />
        <Primary label="Start focus" tone="ra" style={{ flex: 1 }} onPress={() => { onClose(); focusOn(task.id); }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 14 }}>
        <Pressable onPress={() => { onClose(); tick(task.id); }} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Mark as done</Text>
        </Pressable>
        {onMore && (
          <Pressable onPress={() => { onClose(); onMore(task); }} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>More actions…</Text>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}
