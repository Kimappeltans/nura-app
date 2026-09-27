import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Sheet } from './Sheet';
import { Primary, Ghost } from '../ui';
import { ask } from '../notify';
import { habitName, type HabitView } from '../habits';

/**
 * A habit, in a sheet (TaskPeek's look): what it is, when, the bad-day
 * version, how many times it has happened, and what you can do with it:
 * Done today (or Undo), Edit, Pause or Resume, and Let it go.
 */
export function HabitSheet({ view, onClose, onTick, onPause, onResume, onLetGo }: {
  view: HabitView | null;
  onClose: () => void;
  onTick: (v: HabitView) => void;
  onPause: (v: HabitView) => void;
  onResume: (v: HabitView) => void;
  onLetGo: (v: HabitView) => void;
}) {
  const t = useTheme();
  if (!view) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const { habit, times, doneToday, paused } = view;

  const rows: [string, string][] = [
    ['After', habit.cue],
    ...(habit.minimum ? [['On a bad day', habit.minimum] as [string, string]] : []),
    ['Done', times === 0 ? 'Not yet' : times === 1 ? '1 time' : `${times} times`],
  ];
  const letGo = async () => {
    const yes = await ask('Let this habit go?', 'It leaves your list, and so do the times you did it.', 'Let it go', true);
    if (yes) { onClose(); onLetGo(view); }
  };

  return (
    <Sheet visible onClose={onClose}>
      <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.4 }}>{habitName(habit)}</Text>
      {paused && <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 5 }}>Paused</Text>}

      <View style={{ marginTop: 10 }}>
        {rows.map(([k, v]) => (
          <View key={k} accessible accessibilityLabel={`${k}: ${v}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
            <Text style={{ color: t.ink, fontSize: 14.5 }}>{k}</Text>
            <Text numberOfLines={2} style={{ color: t.ink3, fontSize: 14.5, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
        <Ghost label="Edit" style={{ flex: 1 }}
          onPress={() => { onClose(); router.push({ pathname: '/habit', params: { id: habit.id } }); }} />
        {paused ? (
          <Primary label="Resume" tone="ra" style={{ flex: 1 }} onPress={() => { onClose(); onResume(view); }} />
        ) : doneToday ? (
          <Ghost label="Undo today" style={{ flex: 1 }} onPress={() => { onClose(); onTick(view); }} />
        ) : (
          <Primary label="Done today" tone="ra" style={{ flex: 1 }} onPress={() => { onClose(); onTick(view); }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 14 }}>
        {!paused && (
          <Pressable onPress={() => { onClose(); onPause(view); }} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Pause</Text>
          </Pressable>
        )}
        <Pressable onPress={letGo} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Let it go</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
