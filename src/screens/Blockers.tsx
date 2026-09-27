import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { Primary } from '../ui';
import { radius, type as T } from '../theme';
import { OnbFrame } from '../components/OnbFrame';
import type { Blocker } from '../db';

/**
 * "What do you want help with?" — the one question onboarding asks.
 *
 * It used to read "What happens with your to-do list?", which made people
 * stop and work out what was being asked. Now the question says what it's
 * for, and each answer has a short name to scan (Getting started) over the
 * situation in your own words (I know what to do, but I put it off) — the
 * name alone was too vague, the sentence alone too slow to scan. Square
 * checkboxes, because more than one can be true.
 *
 * A question earns its place only if the answer changes the app, and the
 * person can see that it will: each option says what Nura will do
 * differently the moment it's picked. Where each one lands:
 *   starting    → Ra asks for the first physical move before anything else
 *   choosing    → the app opens on the one thing, not the list
 *   remembering → reminders are offered at the end of setup
 *   returning   → an evening card asks what you actually did
 */
const OPTIONS: { key: Blocker; name: string; line: string; effect: string }[] = [
  { key: 'starting', name: 'Getting started',
    line: 'I know what to do, but I put it off.',
    effect: 'Nura will ask for the very first move, small enough to just begin.' },
  { key: 'choosing', name: 'Knowing what to do first',
    line: 'Everything feels urgent at once.',
    effect: 'Nura will open on one task, not the whole list.' },
  { key: 'remembering', name: 'Remembering',
    line: 'Things slip my mind until it’s too late.',
    effect: 'Nura will offer gentle reminders at the end of setup.' },
  { key: 'returning', name: 'Getting back on track',
    line: 'After a bad week, I stop looking at my list.',
    effect: 'Each evening Nura will ask what you got done. Small things count.' },
];

export default function Blockers({ onNext, onBack }: { onNext: (picked: Blocker[]) => void; onBack: () => void }) {
  const t = useTheme();
  const [picked, setPicked] = useState<Blocker[]>([]);
  const toggle = (k: Blocker) => {
    Haptics.selectionAsync();
    setPicked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  };

  return (
    <OnbFrame step={1} onBack={onBack} onSkip={() => onNext([])}
      title="What do you want help with?"
      sub="Choose all that fit."
      footer={<Primary label="Continue" tone="ra" disabled={!picked.length} onPress={() => onNext(picked)} />}>
      <View style={{ gap: 11, marginTop: 24 }}>
        {OPTIONS.map(o => {
          const on = picked.includes(o.key);
          return (
            <Pressable key={o.key} onPress={() => toggle(o.key)}
              accessibilityRole="checkbox" aria-checked={on}
              accessibilityLabel={on ? `${o.name}. ${o.line} ${o.effect}` : `${o.name}. ${o.line}`}
              style={({ pressed }) => ({
                borderRadius: radius.lg, paddingVertical: 15, paddingHorizontal: 16,
                flexDirection: 'row', gap: 14,
                backgroundColor: on ? t.raWash : t.layer,
                borderWidth: 1.5, borderColor: on ? t.ra : t.stroke,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}>
              <View style={{
                width: 24, height: 24, borderRadius: 7, marginTop: 1, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: on ? t.ra : t.ink3, backgroundColor: on ? t.ra : 'transparent',
              }}>
                {on && <Text style={{ color: t.onRa, fontSize: 14, fontFamily: T.brand, marginTop: -1 }}>✓</Text>}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: t.ink, fontSize: 17, lineHeight: 22, fontFamily: T.display }}>{o.name}</Text>
                <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21 }}>{o.line}</Text>
                {/* what changes, said the moment you pick it */}
                {on && <Text style={{ color: t.raDeep, fontSize: 14, lineHeight: 19, marginTop: 5 }}>{o.effect}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </OnbFrame>
  );
}
