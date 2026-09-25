import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { radius, type as T } from '../theme';
import { Character, IconChevron } from '../ui';
import type { Task } from '../db';

/** The move as a sentence, split so its last few words can be lit. */
export function splitForLight(title: string): [string, string] {
  const text = /[.!?…]$/.test(title.trim()) ? title.trim() : `${title.trim()}.`;
  const words = text.split(/\s+/);
  if (words.length < 4) return [text, ''];
  const lit = Math.max(1, Math.round(words.length / 3));
  return [`${words.slice(0, -lit).join(' ')} `, words.slice(-lit).join(' ')];
}

/** A small sun: a ring and eight rays, the same sun as Ra's. */
export function SunGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={1.8} fill="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <Line key={i} x1={12 + 7 * Math.cos(a)} y1={12 + 7 * Math.sin(a)} x2={12 + 10 * Math.cos(a)} y2={12 + 10 * Math.sin(a)}
          stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
      })}
    </Svg>
  );
}

/**
 * ONE THING TO BEGIN: the move you'd start now, large, with where it comes
 * from (a project, your Today) above it, and one button — Begin with Ra.
 * With nothing to begin, it says so and offers Nu's planner instead.
 */
export function OneThing({ task, from, onBegin, onOpen, onPlan }: {
  task: Task | null;
  /** where it comes from: the project's name, "From your Today", … */
  from?: string | null;
  onBegin: () => void;
  onOpen: () => void;
  onPlan: () => void;
}) {
  const t = useTheme();

  if (!task) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={{ color: t.ink, fontSize: 23, lineHeight: 29, fontFamily: T.display, letterSpacing: -0.5 }}>
          Nothing to begin yet.
        </Text>
        <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 20 }}>
          Put down what’s on your mind, or let Nu find the first move of something bigger.
        </Text>
        <Pressable onPress={onPlan} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Character name="nu-thinking" size={30} motion="none" />
          <Text style={{ color: t.nu, fontSize: 15.5, fontFamily: T.brand }}>Plan something bigger with Nu ›</Text>
        </Pressable>
      </View>
    );
  }

  const [lead, glow] = splitForLight(task.title);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 22, height: 2, borderRadius: 1, backgroundColor: t.ra }} />
        <Text style={{ color: t.ink2, fontSize: 11.5, letterSpacing: 2.2, fontFamily: T.brand }}>ONE THING TO BEGIN</Text>
      </View>
      {!!from && <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>{from}</Text>}
      <Pressable onPress={onOpen}>
        <Text style={{ color: t.ink, fontSize: 25, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.6 }}>
          {lead}{!!glow && <Text style={{ color: t.key === 'nu' ? t.raSoft : t.raDeep }}>{glow}</Text>}
        </Text>
      </Pressable>
      <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onBegin(); }}
        accessibilityRole="button" style={({ pressed }) => ({ marginTop: 8, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
        <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 1 }} style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 20,
          borderRadius: radius.pill, shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
        }}>
          <SunGlyph color={t.onRa} />
          <Text style={{ flex: 1, color: t.onRa, fontSize: 16, fontFamily: T.display }}>Begin with Ra</Text>
          <IconChevron size={18} color={t.onRa} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}
