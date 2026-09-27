import { View, Text, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage, Character, Primary, Ghost, BUTTON } from '../ui';
import { priorityOf } from '../priority';
import type { Task } from '../db';
import { decorative } from '../a11y';

/**
 * The next clear step — the one card on Home that is lit. The move, what
 * it costs, and one way in: Begin, which opens Ra's focus on it (five
 * minutes to start with; Ra lets you change that). ↻ is "not
 * this one": the rest of your tasks, to pick another.
 *
 * Ra sits in the corner because this is Ra's card: choosing and starting.
 */
export function NowCard({ task, from, onBegin, onOpen, onAnother, onPlan }: {
  task: Task | null;
  /** a project's name, when the move is a project's */
  from?: string | null;
  onBegin: () => void;
  onOpen: () => void;
  onAnother: () => void;
  onPlan: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.stroke }}>
      <LinearGradient {...decorative} colors={t.key === 'nu' ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.045)'] : [t.card, t.layer]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {/* the warmth pooling at the foot of the card, and around Ra */}
      <LinearGradient {...decorative} colors={['transparent', t.key === 'nu' ? 'rgba(255,135,84,0.16)' : 'rgba(255,135,84,0.10)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }} />
      <Svg {...decorative} width={220} height={220} style={{ position: 'absolute', right: -50, top: -40 }}>
        <Defs>
          <RadialGradient id="raglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFB37C" stopOpacity={t.key === 'nu' ? 0.32 : 0.28} />
            <Stop offset="1" stopColor="#FFB37C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={110} cy={110} r={110} fill="url(#raglow)" />
      </Svg>
      <Image {...decorative} source={poseImage(task ? 'ra-hello' : 'nu-ask')} accessibilityIgnoresInvertColors
        style={{ position: 'absolute', right: 0, top: 6, width: 110, height: 110 }} resizeMode="contain" />

      <View style={{ padding: 17, paddingBottom: 15 }}>
        {task ? (
          <>
            <View style={{ paddingRight: 96 }}>
              {!!from && (
                <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1.9, fontFamily: T.brand, marginBottom: 8 }}>{from.toUpperCase()}</Text>
              )}
              <Pressable onPress={onOpen} hitSlop={4} accessibilityRole="button" accessibilityLabel={task.title}>
                <Text style={{ color: t.ink, fontSize: 21, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.6 }}>
                  {task.title}
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
              {(task.priority ?? 0) > 0 && <Pill label={priorityOf(task.priority).name} spoken={`${priorityOf(task.priority).name} priority`} warm={(task.priority ?? 0) >= 3} />}
              {!!task.est_minutes && <Pill label={`≈ ${task.est_minutes} min`} spoken={`About ${task.est_minutes} min`} />}
            </View>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}>
              <Primary label="Begin" tone="ra" size="sm" onPress={onBegin} style={{ minWidth: 120 }} />
              <Ghost label="↻" size="sm" onPress={onAnother} accessibilityLabel="Choose another" style={{ width: BUTTON.sm.height, paddingHorizontal: 0 }} />
            </View>
          </>
        ) : (
          <View style={{ paddingRight: 96 }}>
            <Text style={{ color: t.ink, fontSize: 21, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.6 }}>
              Nothing to begin yet.
            </Text>
            <Pressable onPress={onPlan} hitSlop={6} accessibilityRole="button" accessibilityLabel="Plan something bigger" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Character name="nu-thinking" size={24} motion="none" />
              <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Plan something bigger ›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function Pill({ label, warm, spoken }: { label: string; warm?: boolean; spoken?: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={spoken ?? label} style={{
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
      borderColor: warm ? 'rgba(255,139,94,0.35)' : t.strokeStrong,
      backgroundColor: warm ? t.raWash : t.subtle,
    }}>
      <Text style={{ color: warm ? (t.key === 'nu' ? t.raSoft : t.raDeep) : t.ink2, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}
