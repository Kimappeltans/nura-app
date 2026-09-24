import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useTheme, useStore } from '../src/store';
import { unlockedActivities } from '../src/db';
import { stageFor, nextStage, stageProgress, STAGES, collectionFrom } from '../src/growth';
import { type as T } from '../src/theme';
import { Mica, Surface, Character, Bar, Count, IconChevron } from '../src/ui';
import { SceneGallery } from '../src/components/Rank';

/**
 * Nu and Ra, and everything you've found.
 *
 * The characters are drawn at the scale their stage earns, sitting on an aura
 * whose strength is the stage's own. Nothing here decays and nothing is
 * gated — see growth.ts for why that isn't negotiable.
 */
export default function Companions() {
  const t = useTheme();
  const { light, refresh } = useStore();
  const [done, setDone] = useState<string[]>([]);

  const load = useCallback(async () => { setDone(await unlockedActivities()); }, []);
  useFocusEffect(useCallback(() => { load(); refresh(); }, [load]));

  const stage = stageFor(light);
  const next = nextStage(light);
  const p = stageProgress(light);
  const col = collectionFrom(done);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>

        {/* ---- the pair, at their current size ---- */}
        <View style={{ height: 220, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          {/* the aura: the one thing that visibly grows with you */}
          {stage.glow > 0 && (
            <Svg width="100%" height={220} style={{ position: 'absolute' }}>
              <Defs>
                <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={t.ra} stopOpacity={stage.glow} />
                  <Stop offset="1" stopColor={t.ra} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#aura)" />
            </Svg>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            <Character name="nu-idle" size={132 * stage.scale} motion="greet" />
            <Character name="ra-wave" size={144 * stage.scale} motion="greet" />
          </View>
        </View>

        <Surface accent="ra">
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, flex: 1 }}>{stage.name}</Text>
              <Count value={light} style={{ color: t.ra, fontSize: 24, fontFamily: T.display }} />
              <Text style={{ color: t.ink3, fontSize: 13, marginLeft: 5 }}>light</Text>
            </View>
            <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 20 }}>{stage.note}</Text>
            <Bar pct={p} height={8} />
            <Text style={{ color: t.ink3, fontSize: 13 }}>
              {next
                ? `${next.at - light} more and they reach ${next.name}.`
                : 'Fully grown. Nothing left to reach.'}
            </Text>
          </View>
        </Surface>

        {/* ---- the ladder ahead ---- */}
        <Text style={{
          color: t.ink2, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand,
          marginTop: 24, marginBottom: 10, marginLeft: 4,
        }}>STAGES</Text>
        <Surface>
          {STAGES.map((s, i) => {
            const reached = light >= s.at;
            const current = s.n === stage.n;
            return (
              <View key={s.n}>
                {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 54 }} />}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 13,
                  paddingHorizontal: 15, paddingVertical: 13,
                  opacity: reached ? 1 : 0.5,
                }}>
                  <View style={{
                    width: 26, height: 26, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: reached ? t.ra : 'transparent',
                    borderWidth: reached ? 0 : 1.5, borderColor: t.strokeStrong,
                  }}>
                    <Text style={{ color: reached ? t.onRa : t.ink3, fontSize: 12.5, fontFamily: T.brand }}>
                      {s.n + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: t.ink, fontSize: 15.5,
                      fontFamily: current ? T.brand : undefined,
                    }}>
                      {s.name}{current ? '  ·  now' : ''}
                    </Text>
                    <Text style={{ color: t.ink3, fontSize: 13, marginTop: 1 }}>{s.note}</Text>
                  </View>
                  <Text style={{ color: t.ink3, fontSize: 13 }}>{s.at}</Text>
                </View>
              </View>
            );
          })}
        </Surface>

        {/* ---- the collection ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 26, marginBottom: 10, marginLeft: 4 }}>
          <Text style={{ color: t.ink2, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, flex: 1 }}>
            SCENES FOUND
          </Text>
          <Text style={{ color: t.ra, fontSize: 15, fontFamily: T.brand }}>
            {col.unlocked.size}
          </Text>
          <Text style={{ color: t.ink3, fontSize: 13 }}> / {col.total}</Text>
        </View>

        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19, marginBottom: 12, marginLeft: 4 }}>
          A scene appears the first time you finish something of that kind.
          Planning one doesn't count — only doing it.
        </Text>

        <SceneGallery unlocked={col.unlocked} />

        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19, marginTop: 20, paddingHorizontal: 4 }}>
          They never shrink and they never get sad at you. Growth here only
          goes one way.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
