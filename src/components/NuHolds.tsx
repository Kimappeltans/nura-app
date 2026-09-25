import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
          <LinearGradient colors={t.key === 'nu' ? ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)'] : [t.card, t.layer]}
            start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
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

/**
 * The rest of what Nu is holding, as stones — each one a thing, not a row in
 * a table. Tap to look at it, hold for what you can do with it.
 */
export function Stones({ tasks, onPress, onHold }: { tasks: Task[]; onPress: (t: Task) => void; onHold: (t: Task) => void }) {
  const t = useTheme();
  const SHAPES = [
    { borderTopLeftRadius: 22, borderTopRightRadius: 26, borderBottomRightRadius: 20, borderBottomLeftRadius: 24 },
    { borderTopLeftRadius: 26, borderTopRightRadius: 20, borderBottomRightRadius: 24, borderBottomLeftRadius: 22 },
    { borderTopLeftRadius: 20, borderTopRightRadius: 24, borderBottomRightRadius: 26, borderBottomLeftRadius: 20 },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {tasks.map((x, i) => (
        <Pressable key={x.id} onPress={() => onPress(x)}
          onLongPress={() => { Haptics.selectionAsync(); onHold(x); }}
          accessibilityRole="button" accessibilityLabel={x.title}
          style={({ pressed }) => ({
            ...SHAPES[i % SHAPES.length], maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10,
            borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
          })}>
          <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14.5, maxWidth: 230 }}>{x.title}</Text>
          {(!!x.est_minutes || !!x.due_at) && (
            <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 11.5, marginTop: 2 }}>
              {[x.due_at ? new Date(x.due_at).toLocaleDateString(undefined, { weekday: 'short' }) : null, x.est_minutes ? `${x.est_minutes} min` : null].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
