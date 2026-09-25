import type React from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Check, IconChevron } from '../ui';
import { LabelTile } from './LabelIcon';
import { PriorityChip } from './PriorityChip';
import { formatDue } from './DatePicker';
import type { Task } from '../db';

/**
 * One task in a list.
 *   - `onTick` shows a tick circle on the left (for what's on Today);
 *     otherwise the task's label, if it has one — no empty placeholder;
 *   - on the right: `onStart` a "Start" button (straight to Ra), `onAdd` a
 *     "+" that puts it on Today, `onMore` a "•••" that opens its sheet;
 *     otherwise a chevron;
 *   - `caption` goes under the title with the date (a project's name,
 *     "Today"); a task snoozed "later" reads as later and sits back.
 * Tap does `onPress`; hold does `onHold` (the task's sheet).
 */
export function TaskRow({ task, onPress, onHold, onTick, onAdd, onMore, onStart, caption, divider = true }: {
  task: Task;
  onPress: () => void;
  onHold: () => void;
  onTick?: () => void;
  onAdd?: () => void;
  onMore?: () => void;
  onStart?: () => void;
  caption?: string | null;
  divider?: boolean;
}) {
  const t = useTheme();
  const later = !!task.snoozed_until && task.snoozed_until > Date.now();
  const due = task.due_at ? formatDue(task.due_at, !!task.has_time) : null;
  const mins = task.est_minutes ? `${task.est_minutes} min` : null;
  const sub = [caption, due, mins, later ? 'later' : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} onLongPress={() => { Haptics.selectionAsync(); onHold(); }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13,
        borderBottomWidth: divider ? 1 : 0, borderBottomColor: t.stroke,
        backgroundColor: pressed ? t.subtle : 'transparent', opacity: later ? 0.55 : 1,
      })}>
      {onTick ? <Check tone="ra" onPress={onTick} /> : task.label ? <LabelTile id={task.label} size={30} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: t.ink, fontSize: 15 }}>{task.title}</Text>
        {!!sub && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12.5 }}>{sub}</Text>}
      </View>
      <PriorityChip n={task.priority ?? 0} />
      {onStart ? <StartButton title={task.title} onPress={onStart} />
        : onAdd ? <AddToToday title={task.title} onPress={onAdd} />
        : onMore ? <MoreButton title={task.title} onPress={onMore} />
        : <IconChevron size={15} color={t.ink3} />}
    </Pressable>
  );
}

/** "Start": straight into Ra with this task. */
function StartButton({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Start ${title}`}
      style={({ pressed }) => ({
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, borderWidth: 1,
        borderColor: t.ra, backgroundColor: pressed ? t.raWash : 'transparent',
      })}>
      <Text style={{ color: t.key === 'nu' ? t.raSoft : t.raDeep, fontSize: 12.5, fontFamily: T.brand }}>Start</Text>
    </Pressable>
  );
}

/** "•••": the task's sheet, without having to know about the long press. */
function MoreButton({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More for ${title}`}
      style={({ pressed }) => ({
        width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      <Text style={{ color: t.ink3, fontSize: 13, letterSpacing: 1, lineHeight: 15 }}>•••</Text>
    </Pressable>
  );
}

/** The "+" that puts a task on Today — in Nu's colour, so it can be seen. */
export function AddToToday({ title, onPress, size = 34 }: { title: string; onPress: () => void; size?: number }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${title} to Today`}
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: t.nu, backgroundColor: t.nuWash,
      }}>
      <Text style={{ color: t.nu, fontSize: 19, lineHeight: 21, fontFamily: T.brand }}>+</Text>
    </Pressable>
  );
}

/** A section label with a rule either side: — EVERYTHING ELSE ——— 3 */
export function SectionRule({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <View style={{ width: 18, height: 1.5, backgroundColor: t.strokeStrong }} />
      <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 2.2, fontFamily: T.brand }}>{title.toUpperCase()}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.stroke }} />
      {count ? <Text style={{ color: t.ink3, fontSize: 12.5, fontFamily: T.brand }}>{count}</Text> : null}
      {children}
    </View>
  );
}
