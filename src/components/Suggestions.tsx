import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { declineDay, undoDay } from '../nextActions';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { useCoach, useApply } from '../learn/engine';
import type { Suggestion } from '../learn/types';
import { NuGlow } from './NuGlow';
import { announce, decorative } from '../a11y';

/**
 * What Nu or Ra noticed — the learning, where you can see it. Each one says
 * what it's based on ("4 of your last 5…"), and Yes / Not now is the feedback
 * the suggestions learn from: the kinds you take come up more, the ones you
 * wave off fade. Renders nothing when there's nothing worth saying.
 */
export function Suggestions({ limit = 2 }: { limit?: number }) {
  const t = useTheme();
  const refresh = useStore(s => s.refresh);
  const { suggestions, accept, dismiss } = useCoach(limit);
  const apply = useApply();
  // a smaller day, just taken: how many were left for later, and the way back
  const [undo, setUndo] = useState<number | null>(null);
  if (!suggestions.length && undo == null) return null;
  return (
    <View style={{ gap: 10 }}>
      {undo != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 }}>
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: t.ink2, fontSize: 14, fontFamily: T.brand }}>{undo} left for later.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={8} style={{ paddingVertical: 4 }}
            onPress={async () => { Haptics.selectionAsync(); setUndo(null); await undoDay(); await refresh(); }}>
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Undo</Text>
          </Pressable>
        </View>
      )}
      {suggestions.map(s => (
        <SuggestionCard key={s.id} s={s}
          onYes={() => {
            Haptics.selectionAsync(); accept(s); apply(s);
            if (s.action?.type === 'reduce_day') {
              const n = s.action.defer?.length ?? 0;
              setUndo(n);
              announce(`${n} left for later.`);
            }
          }}
          onNo={() => {
            Haptics.selectionAsync(); dismiss(s);
            if (s.action?.type === 'reduce_day') declineDay().catch(() => {});
          }} />
      ))}
    </View>
  );
}

function SuggestionCard({ s, onYes, onNo }: { s: Suggestion; onYes: () => void; onNo: () => void }) {
  const t = useTheme();
  const ra = s.who === 'ra';
  const actionable = !!s.action && s.action.type !== 'none';
  return (
    <View style={{ borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: ra ? 'rgba(255,139,88,0.28)' : t.stroke }}>
      <View style={{ position: 'absolute', inset: 0, backgroundColor: t.card }} />
      <View style={{ flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' }}>
        <View {...decorative}>
          {ra
            ? <Image source={poseImage('ra-icon')} style={{ width: 52, height: 52 }} resizeMode="contain" />
            : <NuGlow size={52}><Image source={poseImage('nu-listen')} style={{ width: 52, height: 52 }} resizeMode="contain" /></NuGlow>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 15, lineHeight: 21, fontFamily: T.brand }}>{s.text}</Text>
          {!!s.why && <Text style={{ color: t.ink3, fontSize: 12.5, lineHeight: 17, marginTop: 4 }}>{s.why}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }}>
            <Pressable onPress={onYes} accessibilityRole="button" hitSlop={6}
              style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, opacity: pressed ? 0.85 : 1,
                backgroundColor: ra ? t.raWash : t.nuWash, borderWidth: 1, borderColor: ra ? 'rgba(255,139,88,0.40)' : t.nu,
              })}>
              <Text style={{ color: ra ? (t.key === 'nu' ? t.raSoft : t.raDeep) : t.nu, fontSize: 13.5, fontFamily: T.brand }}>
                {s.action?.type === 'reduce_day' ? 'Make today smaller' : actionable ? 'Yes' : 'Good to know'}
              </Text>
            </Pressable>
            <Pressable onPress={onNo} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: t.ink3, fontSize: 13.5, fontFamily: T.brand }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
