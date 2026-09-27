import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Check } from '../ui';
import { AddToToday } from './TaskRow';
import { LabelTile } from './LabelIcon';
import { formatDue } from './DatePicker';
import { priorityOf } from '../priority';
import type { Task } from '../db';

/**
 * One task, compact: the title on one line, what matters about it under it
 * ("High priority · 15 min"), and at most one thing on the right —
 *   start  — straight into Ra (the warm ▶);
 *   more   — the task's sheet (•••);
 *   add    — put it on Today (+);
 *   tick   — a done circle on the left instead.
 * `done` draws it risen: struck through and quiet.
 * The lists in Your tasks and Your day are made of these.
 */
export function TaskLine({ title, meta, label, onPress, onHold, onStart, onMore, onAdd, onTick, done, divider = true, dim }: {
  title: string;
  /** the task's label, drawn as a small tile on the left (null: a plain tile) */
  label?: string | null;
  meta?: (string | null | false | undefined)[];
  onPress?: () => void;
  onHold?: () => void;
  onStart?: () => void;
  onMore?: () => void;
  onAdd?: () => void;
  onTick?: () => void;
  done?: boolean;
  divider?: boolean;
  /** put off for later — sits back */
  dim?: boolean;
}) {
  const t = useTheme();
  const parts = (meta ?? []).filter(Boolean) as string[];
  return (
    <Pressable onPress={onPress} disabled={!onPress && !onHold}
      onLongPress={onHold ? () => { Haptics.selectionAsync(); onHold(); } : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
        borderBottomWidth: divider ? 1 : 0, borderBottomColor: t.stroke,
        backgroundColor: pressed ? t.subtle : 'transparent', opacity: done ? 0.72 : dim ? 0.55 : 1,
      })}>
      {onTick && <Check tone="ra" onPress={onTick} />}
      {!onTick && !done && label !== undefined && <LabelTile id={label} size={30} />}
      {done && (
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash }}>
          <Text style={{ color: t.nu, fontSize: 12, fontFamily: T.brand }}>✓</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{
          color: t.ink, fontSize: 15,
          textDecorationLine: done ? 'line-through' : 'none', textDecorationColor: t.ink3,
        }}>{title}</Text>
        {parts.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, overflow: 'hidden' }}>
            {parts.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: i === parts.length - 1 ? 1 : 0, minWidth: 0 }}>
                {i > 0 && <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.ink3 }} />}
                <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12.5 }}>{p}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {onStart ? (
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onStart(); }} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={`Start ${title}`}
          style={({ pressed }) => ({
            width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,139,88,0.35)', backgroundColor: pressed ? t.raWash : 'rgba(255,107,53,0.08)',
          })}>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill={t.key === 'nu' ? t.raSoft : t.raDeep} />
          </Svg>
        </Pressable>
      ) : onAdd ? (
        <AddToToday title={title} onPress={onAdd} size={32} />
      ) : onMore ? (
        <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More for ${title}`}
          style={({ pressed }) => ({
            width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
          })}>
          <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1, lineHeight: 14 }}>•••</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** What a task's line says under its title: its priority (if it has one worth
 *  saying), when it's due, how long it takes, and whether it's put off. */
export function taskMeta(task: Task, opts: { priority?: boolean; due?: boolean } = {}) {
  const later = !!task.snoozed_until && task.snoozed_until > Date.now();
  return [
    opts.priority !== false && (task.priority ?? 0) >= 2 ? `${priorityOf(task.priority).name} priority` : null,
    opts.due !== false && task.due_at ? formatDue(task.due_at, !!task.has_time) : null,
    task.est_minutes ? `${task.est_minutes} min` : null,
    later ? 'later' : null,
  ];
}
