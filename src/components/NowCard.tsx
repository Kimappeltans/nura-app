import { View, Text, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage, Character } from '../ui';
import { priorityOf } from '../priority';
import type { Task } from '../db';

/**
 * YOUR NEXT CLEAR STEP — the one card on Home that is lit. The move, why
 * it's this one (the engine's own rule, in words — see priority.whyLine),
 * what it costs, and one way in: Begin, which opens Ra on it. ↻ is "not
 * this one": the rest of your tasks, to pick another.
 *
 * Ra sits in the corner because this is Ra's card: choosing and starting.
 */
export function NowCard({ task, from, why, onBegin, onOpen, onAnother, onPlan }: {
  task: Task | null;
  /** a project's name, when the move is a project's */
  from?: string | null;
  why?: string | null;
  onBegin: () => void;
  onOpen: () => void;
  onAnother: () => void;
  onPlan: () => void;
}) {
  const t = useTheme();
  const warm = t.key === 'nu' ? t.raSoft : t.raDeep;

  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.stroke }}>
      <LinearGradient colors={t.key === 'nu' ? ['#242C56', '#171D3A'] : [t.card, t.layer]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {/* the warmth pooling at the foot of the card, and around Ra */}
      <LinearGradient colors={['transparent', t.key === 'nu' ? 'rgba(255,135,84,0.16)' : 'rgba(255,135,84,0.10)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }} />
      <Svg width={150} height={150} style={{ position: 'absolute', right: -30, top: -20 }}>
        <Defs>
          <RadialGradient id="raglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFB37C" stopOpacity={t.key === 'nu' ? 0.32 : 0.28} />
            <Stop offset="1" stopColor="#FFB37C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={75} cy={75} r={75} fill="url(#raglow)" />
      </Svg>
      <Image source={poseImage(task ? 'ra-hello' : 'nu-ask')} accessibilityIgnoresInvertColors
        style={{ position: 'absolute', right: 6, top: 12, width: 84, height: 84 }} resizeMode="contain" />

      <View style={{ padding: 17, paddingBottom: 15 }}>
        {task ? (
          <>
            <View style={{ paddingRight: 88 }}>
              <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1.9, fontFamily: T.brand }}>
                {from ? from.toUpperCase() : 'YOUR NEXT CLEAR STEP'}
              </Text>
              <Pressable onPress={onOpen} hitSlop={4}>
                <Text style={{ color: t.ink, fontSize: 21, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.6, marginTop: 8 }}>
                  {task.title}
                </Text>
              </Pressable>
              {!!why && (
                <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 19, marginTop: 7 }}>
                  <Text style={{ color: warm, fontFamily: T.brand }}>Why this one: </Text>{why}.
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
              {(task.priority ?? 0) > 0 && <Pill label={`${priorityOf(task.priority).name} priority`} warm={(task.priority ?? 0) >= 3} />}
              {!!task.est_minutes && <Pill label={`≈ ${task.est_minutes} min`} />}
            </View>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onBegin(); }}
                accessibilityRole="button" style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
                <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 1 }} style={{
                  minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#FF6B35', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
                }}>
                  <Text style={{ color: t.onRa, fontSize: 15, fontFamily: T.display }}>Begin with Ra</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={onAnother} accessibilityRole="button" accessibilityLabel="Choose another"
                style={({ pressed }) => ({
                  width: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                <Text style={{ color: t.ink, fontSize: 19 }}>↻</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={{ paddingRight: 88 }}>
            <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1.9, fontFamily: T.brand }}>YOUR NEXT CLEAR STEP</Text>
            <Text style={{ color: t.ink, fontSize: 21, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.6, marginTop: 8 }}>
              Nothing to begin yet.
            </Text>
            <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 19, marginTop: 7 }}>
              Put down what’s on your mind, or let Nu find the first move of something bigger.
            </Text>
            <Pressable onPress={onPlan} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Character name="nu-thinking" size={24} motion="none" />
              <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Plan something bigger ›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function Pill({ label, warm }: { label: string; warm?: boolean }) {
  const t = useTheme();
  return (
    <View style={{
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
      borderColor: warm ? 'rgba(255,139,94,0.35)' : t.strokeStrong,
      backgroundColor: warm ? t.raWash : t.subtle,
    }}>
      <Text style={{ color: warm ? (t.key === 'nu' ? t.raSoft : t.raDeep) : t.ink2, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}
