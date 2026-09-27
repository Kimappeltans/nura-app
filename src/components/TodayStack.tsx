import { View, Text, Pressable, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { labelById, type LabelId } from '../labels';
import { LabelGlyph } from './LabelIcon';
import type { Task } from '../db';

const CORAL = '#FF6B35';
const ON_CORAL = '#3B1204';
const INK_NU = '#1B1830';

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Blend a label's colour into the ground: `amount` of the label, the rest ground. */
const mix = (hex: string, ground: string, amount: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(ground)];
  return '#' + a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('');
};
/** A card in its label's colour, soft enough to sit with the coral and the cream (or the navy at night). */
export const labelTint = (id: string | null | undefined, dark: boolean) => {
  const l = labelById(id);
  if (!l) return null;
  return dark ? mix(l.color, '#161D42', 0.2) : mix(l.color, '#FAF7F0', 0.3);
};

/**
 * HOME'S STACK (guidelines/components/overview.md). Today as stacked cards:
 * the rest are stones behind, the one Nu found is in front — coral, with Nu
 * on its corner and Begin. Tap a stone to bring it to the front instead;
 * hold one for what you can do with it.
 */
export function TodayStack({ front, back, from, fact, onBegin, onOpen, onPick, onHold, onPlan }: {
  front: Task | null;
  back: Task[];
  /** a project's name, when the front card is a project's move */
  from?: string | null;
  /** the facts behind the one in front (priority.ts → factLine) */
  fact?: string | null;
  onBegin: () => void;
  onOpen: (task: Task) => void;
  onPick: (task: Task) => void;
  onHold: (task: Task) => void;
  onPlan: () => void;
}) {
  const t = useTheme();
  const dark = t.key === 'nu';
  return (
    <View>
      {back.map((x, i) => (
        <Pressable key={x.id} onPress={() => { Haptics.selectionAsync(); onPick(x); }}
          onLongPress={() => { Haptics.selectionAsync(); onHold(x); }}
          accessibilityRole="button" accessibilityLabel={`${x.title}, bring to the front`}
          style={({ pressed }) => ({
            height: 82, marginBottom: -24, zIndex: i, borderRadius: 28, paddingHorizontal: 16,
            backgroundColor: labelTint(x.label, dark) ?? t.card, opacity: pressed ? 0.85 : 1,
            borderWidth: 1, borderColor: dark ? t.stroke : 'rgba(255,255,255,0.6)',
          })}>
          <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Glyph id={x.label} />
            <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 16, fontFamily: T.brand, letterSpacing: -0.3 }}>{x.title}</Text>
            <When task={x} />
          </View>
        </Pressable>
      ))}

      {front ? (
        <View style={{ zIndex: 20 }}>
          <View style={{ borderRadius: 28, backgroundColor: CORAL, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,18,4,0.10)' }}>
                {front.label ? <LabelGlyph id={front.label as LabelId} size={17} color={ON_CORAL} /> : null}
              </View>
              <Text style={{ color: ON_CORAL, fontSize: 13, fontFamily: T.display }}>{from ?? 'Nu found this one'}</Text>
            </View>
            <Pressable onPress={() => onOpen(front)} hitSlop={4} style={{ marginTop: 10, paddingRight: 72 }}>
              <Text style={{ color: ON_CORAL, fontSize: 24, lineHeight: 26, fontFamily: T.display, letterSpacing: -1 }}>{front.title}</Text>
            </Pressable>
            {!!fact && <Text style={{ color: 'rgba(59,18,4,0.66)', fontSize: 13, fontFamily: T.brand, marginTop: 6 }}>{fact}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22 }}>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onBegin(); }}
                accessibilityRole="button" accessibilityLabel={`Begin ${front.title}`}
                style={({ pressed }) => ({
                  width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: INK_NU, transform: [{ scale: pressed ? 0.96 : 1 }],
                })}>
                <Text style={{ color: '#FAF7F0', fontSize: 14.5, fontFamily: T.display }}>Begin</Text>
              </Pressable>
              {!!front.est_minutes && (
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ color: ON_CORAL, fontSize: 58, lineHeight: 58, letterSpacing: -2.9, fontFamily: T.displayLight }}>{front.est_minutes}</Text>
                  <Text style={{ color: ON_CORAL, fontSize: 14, fontFamily: T.brand, marginLeft: 3 }}>min</Text>
                </View>
              )}
            </View>
          </View>
          {/* Nu on the card's corner, holding the rest */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 12, top: -8 }}>
            <Image source={poseImage('nu-hold')} resizeMode="contain" style={{ width: 70, height: 87 }} />
          </View>
        </View>
      ) : (
        <View style={{ zIndex: 20, borderRadius: 28, backgroundColor: t.card, borderWidth: 1, borderColor: t.stroke, padding: 20, gap: 10 }}>
          <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.6 }}>Nothing to begin yet.</Text>
          <Pressable onPress={onPlan} hitSlop={6}>
            <Text style={{ color: dark ? t.nu : t.nu, fontSize: 14.5, fontFamily: T.display }}>Plan something bigger ›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Glyph({ id }: { id?: string | null }) {
  const t = useTheme();
  const l = labelById(id);
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.key === 'nu' ? 'rgba(170,185,255,0.09)' : 'rgba(23,19,19,0.06)',
    }}>
      {l && <LabelGlyph id={l.id} size={17} color={t.key === 'nu' ? l.color : l.onLight} />}
    </View>
  );
}

/** A time if it has one, else how long it takes. */
function When({ task }: { task: Task }) {
  const t = useTheme();
  if (task.has_time && task.due_at) {
    const [time, ampm] = clock(task.due_at).split(/\s/);
    return (
      <Text style={{ color: t.ink, fontSize: 22, letterSpacing: -0.9, fontFamily: T.displayLight }}>
        {time}<Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 0, fontFamily: T.brand }}>{ampm ?? ''}</Text>
      </Text>
    );
  }
  if (!task.est_minutes) return null;
  return (
    <Text style={{ color: t.ink, fontSize: 22, letterSpacing: -0.9, fontFamily: T.displayLight }}>
      {task.est_minutes}<Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 0, fontFamily: T.brand }}>min</Text>
    </Text>
  );
}
