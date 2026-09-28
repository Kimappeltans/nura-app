import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { labelById } from '../labels';
import { LabelGlyph } from './LabelIcon';
import type { Task } from '../db';
import { SwipeRow } from './SwipeRow';
import { taskSwipes, COL_NAME, type Col } from '../desk/kit';

const DAY = 86400_000;

/** A label's colour as a soft fill behind its glyph. */
const tint = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Sizes by depth in Your Tasks: bigger and brighter at the surface, smaller and quieter deeper down.
 *  Without a depth (Home and elsewhere) a row is the middle one. */
const DEPTH = {
  0: { row: 60, chip: 34, glyph: 18, title: 17, value: 23 },
  1: { row: 54, chip: 30, glyph: 16, title: 15.5, value: 21 },
  2: { row: 46, chip: 24, glyph: 13, title: 14, value: 17 },
} as const;

/** A task's one value on the right: its time if it has one, else how long it takes, else its day. */
export function taskValue(task: Task): { big: string; small: string } | null {
  if (task.due_at && task.has_time) {
    const [time, ampm] = new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(/\s/);
    const today = new Date().setHours(0, 0, 0, 0);
    if (task.due_at >= today && task.due_at < today + DAY) return { big: time, small: ampm ?? '' };
  }
  if (task.est_minutes) return { big: String(task.est_minutes), small: 'min' };
  if (task.due_at) return { big: new Date(task.due_at).toLocaleDateString(undefined, { weekday: 'short' }), small: '' };
  return null;
}

/**
 * A TASK, AS A ROW (guidelines/components/overview.md): its label in a
 * circle tinted in the label's own colour, the title, and one value on the right — the same wherever a task is
 * listed. Tap to look at it, hold for what you can do with it. Given what to
 * do, it swipes: right for Done, left for the other two places and Delete
 * (the same actions a screen reader gets on the row).
 */
export function HeldRow({ task, onPress, onHold, faint, meta, col, onDone, onMove, onDelete, peek }: {
  task: Task;
  onPress: () => void;
  onHold: () => void;
  /** how deep it's held (Your Tasks): 0 at the surface, 1 a little deeper, 2 deepest */
  faint?: 0 | 1 | 2;
  /** a quiet second line (a project's name) */
  meta?: string | null;
  /** where it is now (Today, This week, Someday), so its moves are the other two */
  col?: Col;
  onDone?: () => void;
  onMove?: (c: Col) => void;
  onDelete?: () => void;
  /** once: slide open a little, to show a row can be swiped */
  peek?: boolean;
}) {
  const t = useTheme();
  const l = labelById(task.label);
  const v = taskValue(task);
  const dark = t.key === 'nu';
  const d = DEPTH[faint ?? 1];
  // deeper reads quieter, not disabled: a softer ink, never a faded row
  const ink = faint === 2 ? t.ink3 : faint === 1 ? t.ink2 : t.ink;
  const hold = () => { Haptics.selectionAsync(); onHold(); };
  const swipes = taskSwipes(task, col, dark, { onDone, onMove, onDelete });
  const others = col && onMove ? (['today', 'week', 'someday'] as Col[]).filter(c => c !== col) : [];
  const actions = [
    { name: 'more', label: 'More options' },
    ...(onDone ? [{ name: 'done', label: 'Done' }] : []),
    ...others.map(c => ({ name: `move:${c}`, label: `Move to ${COL_NAME[c]}` })),
    ...(onDelete ? [{ name: 'delete', label: 'Delete' }] : []),
  ];
  return (
    <SwipeRow left={swipes.left} right={swipes.right} peek={peek}>
    <Pressable onPress={onPress} onLongPress={hold}
      accessibilityRole="button"
      accessibilityLabel={[task.title, l?.name, meta, v ? [v.big, v.small].filter(Boolean).join(' ') : null].filter(Boolean).join(', ')}
      accessibilityActions={actions}
      onAccessibilityAction={e => {
        const a = e.nativeEvent.actionName;
        if (a === 'more') hold();
        else if (a === 'done') onDone?.();
        else if (a === 'delete') onDelete?.();
        else if (a.startsWith('move:')) onMove?.(a.slice(5) as Col);
      }}
      style={({ pressed }) => ({
        minHeight: d.row, flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: 1, borderBottomColor: t.stroke,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{
        width: d.chip, height: d.chip, borderRadius: d.chip / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: l ? tint(dark ? l.color : l.onLight, dark ? 0.2 : 0.12) : dark ? 'rgba(170,185,255,0.09)' : 'rgba(23,19,19,0.06)',
      }}>
        {l && <LabelGlyph id={l.id} size={d.glyph} color={dark ? l.color : l.onLight} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: ink, fontSize: d.title, fontFamily: faint === 0 ? T.display : T.brand, letterSpacing: faint === 0 ? -0.5 : -0.3 }}>{task.title}</Text>
        {!!meta && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand, marginTop: 1 }}>{meta}</Text>}
      </View>
      {v && (
        <Text style={{ color: ink, fontSize: d.value, letterSpacing: -0.9, fontFamily: T.displayLight }}>
          {v.big}<Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 0, fontFamily: T.brand }}>{v.small}</Text>
        </Text>
      )}
    </Pressable>
    </SwipeRow>
  );
}
