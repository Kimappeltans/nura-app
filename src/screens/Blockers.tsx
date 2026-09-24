import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { Primary, Mica } from '../ui';
import { radius, type as T } from '../theme';
import type { Blocker } from '../db';

/**
 * "What usually gets in the way?" — the one question onboarding asks.
 *
 * A question earns its place only if the answer changes the app, and the
 * person can see that it will: each option shows what Nura will do
 * differently the moment it's picked. Answers that changed nothing would be a
 * longer wait dressed up as personalisation. Where each one lands:
 *   starting    → Ra asks for the first physical move before anything else
 *   choosing    → the app opens on the one thing, not the list
 *   remembering → reminders are offered at the end of setup
 *   returning   → an evening card asks what you actually did
 */
const OPTIONS: { key: Blocker; title: string; sub: string; effect: string }[] = [
  { key: 'starting', title: 'Getting started',
    sub: 'I know what to do. I just don’t begin.',
    effect: 'Nura will ask for the very first move before anything else.' },
  { key: 'choosing', title: 'Choosing what to do',
    sub: 'Everything feels equally urgent.',
    effect: 'Nura will open on your one thing, not the whole list.' },
  { key: 'remembering', title: 'Remembering things',
    sub: 'Things slip until it’s too late.',
    effect: 'Nura will offer gentle reminders at the end.' },
  { key: 'returning', title: 'Getting back on track',
    sub: 'After a bad week, I stop opening the app.',
    effect: 'Each evening Nura will ask what you did. Small things count.' },
];

export default function Blockers({ onNext }: { onNext: (picked: Blocker[]) => void }) {
  const t = useTheme();
  const [picked, setPicked] = useState<Blocker[]>([]);
  const toggle = (k: Blocker) => {
    Haptics.selectionAsync();
    setPicked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 12 }}>
        <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand }}>1 OF 3</Text>
        <Text style={{
          color: t.ink, fontSize: 30, lineHeight: 36, fontFamily: T.display,
          letterSpacing: -0.8, marginTop: 8,
        }}>What usually gets in the way?</Text>
        <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22, marginTop: 8 }}>
          Pick any. Each one changes how Nura works for you.
        </Text>

        <View style={{ gap: 11, marginTop: 24 }}>
          {OPTIONS.map(o => {
            const on = picked.includes(o.key);
            return (
              <Pressable key={o.key} onPress={() => toggle(o.key)}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={({ pressed }) => ({
                  borderRadius: radius.lg, padding: 16, gap: 4,
                  backgroundColor: on ? t.raWash : t.layer,
                  borderWidth: 1.5, borderColor: on ? t.ra : t.stroke,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, color: t.ink, fontSize: 17, fontFamily: T.brand }}>{o.title}</Text>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: on ? t.ra : t.strokeStrong, backgroundColor: on ? t.ra : 'transparent',
                  }}>
                    {on && <Text style={{ color: t.onRa, fontSize: 13, fontFamily: T.brand, marginTop: -1 }}>✓</Text>}
                  </View>
                </View>
                <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 20 }}>{o.sub}</Text>
                {/* what changes, said the moment you pick it */}
                {on && (
                  <Text style={{ color: t.raSoft, fontSize: 13.5, lineHeight: 19, marginTop: 6 }}>{o.effect}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <View style={{ gap: 14 }}>
          <Primary label="Continue" tone="ra" onPress={() => onNext(picked)} />
          <Pressable onPress={() => onNext([])} hitSlop={10}>
            <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>Skip</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
