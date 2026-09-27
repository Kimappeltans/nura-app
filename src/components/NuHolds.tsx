import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T, radius } from '../theme';
import { Character, Primary, vary } from '../ui';
import { NuGlow } from './NuGlow';
import type { Task } from '../db';

const NU = 168;

/**
 * NU HOLDS IT — Home's hero. Nu, big and moving, holding out the one thing
 * she found, in a bubble: Begin, or Choose another. Choosing another opens
 * the next few right under it; tapping one puts it in Nu's hands instead.
 * Nu's pose changes from day to day, so she isn't the same drawing every
 * time you open the app.
 */
export function NuHolds({ task, from, yours, choosing, others, onBegin, onOpen, onChoose, onPick, onPlan }: {
  task: Task | null;
  /** a project's name, when the move is a project's */
  from?: string | null;
  /** you chose it (Choose another), rather than Nu */
  yours?: boolean;
  choosing: boolean;
  /** what Choose another offers */
  others: Task[];
  onBegin: () => void;
  onOpen: () => void;
  onChoose: () => void;
  onPick: (task: Task) => void;
  onPlan: () => void;
}) {
  const t = useTheme();
  const pose = vary(['nu-hello', 'nu-listen', 'nu-ask'] as const);

  return (
    <View>
      <View style={{ minHeight: NU + 24 }}>
        {/* Nu, with the pale light that lifts her off the water */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -12, top: 18 }}>
          <NuGlow size={NU}><Character name={pose} size={NU} motion="bob" /></NuGlow>
        </View>

        {/* what she's holding out */}
        <View style={{
          marginLeft: NU - 44, borderRadius: 22, borderBottomLeftRadius: 6, overflow: 'hidden',
          borderWidth: 1, borderColor: t.strokeStrong,
        }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: t.card }} />
          <View style={{ padding: 16, gap: 8 }}>
            {task ? (
              <>
                {(!!from || !yours) && (
                  <Text style={{ color: t.nuSoft, fontSize: 12.5, fontFamily: T.brand }}>{from ?? 'Nu found this one'}</Text>
                )}
                <Pressable onPress={onOpen} hitSlop={4}>
                  <Text style={{ color: t.ink, fontSize: 18.5, lineHeight: 23, fontFamily: T.display, letterSpacing: -0.3 }}>{task.title}</Text>
                </Pressable>
                {!!task.est_minutes && <Text style={{ color: t.ink3, fontSize: 12.5 }}>≈ {task.est_minutes} min</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 10, marginTop: 4 }}>
                  <Primary label="Begin" tone="ra" size="sm" onPress={onBegin} />
                  <Pressable onPress={() => { Haptics.selectionAsync(); onChoose(); }} hitSlop={8}
                    accessibilityRole="button" accessibilityState={{ expanded: choosing }}>
                    <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>{choosing ? 'Keep this one' : 'Choose another'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: t.ink, fontSize: 18.5, lineHeight: 23, fontFamily: T.display }}>Nothing to begin yet.</Text>
                <Pressable onPress={onPlan} hitSlop={6}>
                  <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Plan something bigger ›</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Choose another: the next few, one tap to hand it to Nu instead */}
      {choosing && (
        <View style={{ gap: 8, marginTop: 4 }}>
          {others.map(o => (
            <Pressable key={o.id} onPress={() => { Haptics.selectionAsync(); onPick(o); }} accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14,
                borderRadius: radius.md + 2, borderWidth: 1, borderColor: t.stroke,
                backgroundColor: pressed ? t.subtle : t.layer,
              })}>
              <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 15 }}>{o.title}</Text>
              {!!o.est_minutes && <Text style={{ color: t.ink3, fontSize: 12.5 }}>{o.est_minutes} min</Text>}
            </Pressable>
          ))}
          {!others.length && <Text style={{ color: t.ink3, fontSize: 14 }}>Nothing else is waiting.</Text>}
        </View>
      )}
    </View>
  );
}

/** Stones aren't rectangles: a few slightly uneven shapes, taken in turn. */
const SHAPES = [
  { borderTopLeftRadius: 22, borderTopRightRadius: 26, borderBottomRightRadius: 20, borderBottomLeftRadius: 24 },
  { borderTopLeftRadius: 26, borderTopRightRadius: 20, borderBottomRightRadius: 24, borderBottomLeftRadius: 22 },
  { borderTopLeftRadius: 20, borderTopRightRadius: 24, borderBottomRightRadius: 26, borderBottomLeftRadius: 20 },
];
const when = (x: Task) => [
  x.due_at ? new Date(x.due_at).toLocaleDateString(undefined, { weekday: 'short' }) : null,
  x.est_minutes ? `${x.est_minutes} min` : null,
].filter(Boolean).join(' · ');

/**
 * What Nu is holding, as stones — each one a thing, not a row in a table.
 * Tap to look at it, hold for what you can do with it. `sunk` is Later:
 * further down, quieter. `risen` is done: lit, with a tick.
 */
export function Stones({ tasks, onPress, onHold, sunk, risen, meta }: {
  tasks: Task[];
  onPress?: (t: Task) => void;
  onHold?: (t: Task) => void;
  sunk?: boolean;
  risen?: boolean;
  /** what the line under the title says; by default its day and length */
  meta?: (t: Task) => string | null;
}) {
  const t = useTheme();
  const warm = t.key === 'nu' ? t.raSoft : t.raDeep;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, opacity: sunk ? 0.62 : 1 }}>
      {tasks.map((x, i) => {
        const sub = meta ? meta(x) : when(x);
        return (
          <Pressable key={x.id} onPress={onPress ? () => onPress(x) : undefined} disabled={!onPress && !onHold}
            onLongPress={onHold ? () => { Haptics.selectionAsync(); onHold(x); } : undefined}
            accessibilityRole="button" accessibilityLabel={x.title}
            style={({ pressed }) => ({
              ...SHAPES[i % SHAPES.length], maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 9,
              paddingHorizontal: 14, paddingVertical: sunk ? 8 : 10, borderWidth: 1,
              borderColor: risen ? 'rgba(255,139,88,0.30)' : t.stroke,
              backgroundColor: pressed ? t.subtle : risen ? t.raWash : sunk ? t.layer : t.card,
            })}>
            {risen && <Text style={{ color: warm, fontSize: 13, fontFamily: T.brand }}>✓</Text>}
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: t.ink, fontSize: sunk ? 13.5 : 14.5, maxWidth: 230 }}>{x.title}</Text>
              {!!sub && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 11.5, marginTop: 2 }}>{sub}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A stone that needs you today: the whole width, and a way straight in. */
export function BigStone({ task, meta, index = 0, onPress, onHold, onStart }: {
  task: Task; meta?: string; index?: number;
  onPress: () => void; onHold: () => void; onStart: () => void;
}) {
  const t = useTheme();
  const warm = t.key === 'nu' ? t.raSoft : t.raDeep;
  return (
    // not a button itself: the start button sits inside it, and a button
    // can't hold a button (on the web that's <button> in <button>)
    <Pressable onPress={onPress} onLongPress={() => { Haptics.selectionAsync(); onHold(); }}
      accessibilityLabel={task.title}
      style={({ pressed }) => ({
        ...SHAPES[index % SHAPES.length], borderTopLeftRadius: SHAPES[index % SHAPES.length].borderTopLeftRadius + 4,
        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,139,88,0.30)', opacity: pressed ? 0.9 : 1,
      })}>
      <View style={{ position: 'absolute', inset: 0, backgroundColor: t.card }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 16, paddingRight: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: t.ink, fontSize: 16.5, lineHeight: 21, fontFamily: T.brand }}>{task.title}</Text>
          {!!meta && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12.5, marginTop: 3 }}>{meta}</Text>}
        </View>
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onStart(); }} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={`Start ${task.title}`}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,139,88,0.40)', backgroundColor: pressed ? t.raWash : 'rgba(255,107,53,0.10)',
          })}>
          <Text style={{ color: warm, fontSize: 13, marginLeft: 2 }}>▶</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** A project as a stone: its name, what's left, and its path as a row of dots — lit as the moves are done. */
export function PathStone({ title, done, total, index = 0, onPress }: {
  title: string; done: number; total: number; index?: number; onPress: () => void;
}) {
  const t = useTheme();
  const left = total - done;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({
        ...SHAPES[index % SHAPES.length], width: 188, padding: 14, gap: 4,
        borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
      })}>
      <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14.5, fontFamily: T.brand }}>{title}</Text>
      <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12 }}>{`${left} move${left === 1 ? '' : 's'} left`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {Array.from({ length: Math.min(total, 14) }, (_, i) => (
          <View key={i} style={{
            width: 9, height: 9, borderRadius: 5,
            backgroundColor: i < done ? t.ra : 'transparent', borderWidth: 1.5, borderColor: i < done ? t.ra : t.strokeStrong,
          }} />
        ))}
      </View>
    </Pressable>
  );
}
