import { useCallback } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../src/store';
import { radius, type as T } from '../src/theme';
import { rankFor, nextRank, rankProgress, skyLabel } from '../src/reward';
import { Mica, Card, RingStat, WeekBars, SunArc, Character } from '../src/ui';

const weekdayLetter = (isoDay: string) =>
  new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });

/**
 * Reachable from Nu only — this is reflection, not doing.
 *
 * Everything on this screen is monotonic or an average. There is no streak, no
 * completion rate, no "you missed 4 days": a number that can go down turns a
 * quiet week into evidence against yourself, and that is the moment the app
 * gets deleted.
 */
export default function Wins() {
  const t = useTheme();
  const { wins, total, light, today, momentum, grid, refresh } = useStore();
  useFocusEffect(useCallback(() => { refresh(); }, []));
  const step = (n: number) => t.scale[Math.min(n, t.scale.length - 1)];

  const rank = rankFor(light);
  const next = nextRank(light);
  const p = rankProgress(light);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, padding: 20, gap: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 4 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Everything</Text>
        </Pressable>

        {/* The light. Earned, never spent, never decayed, never lost. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ra, fontSize: 62, fontFamily: T.displayLight, letterSpacing: -2 }}>{light}</Text>
            <Text style={{ color: t.ink, fontSize: 16.5, fontFamily: T.brand, marginTop: -4 }}>
              light · {rank.name}
            </Text>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 3, lineHeight: 18 }}>{rank.blurb}</Text>
          </View>
          <Character name="ra-celebrate" size={92} motion="bob" />
        </View>

        {/* Rank bar — you can be short of the next one, you can never fall out
            of the one you have. */}
        <View style={{ gap: 6 }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.track, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(p * 100)}%`, height: '100%', backgroundColor: t.ra, borderRadius: 4 }} />
          </View>
          <Text style={{ color: t.ink3, fontSize: 12 }}>
            {next ? `${next.at - light} to ${next.name}` : 'Every rank there is.'}
          </Text>
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <SunArc light={today} size={128} compact />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand }}>{skyLabel(today)}</Text>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
              {today} today. Tomorrow starts at the horizon again — nothing carries over,
              and nothing is taken away.
            </Text>
          </View>
        </Card>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <RingStat progress={momentum} value={`${Math.round(momentum * 100)}%`} label="MOMENTUM" size={104} stroke={11} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand }}>
              {momentum > 0.6 ? 'Strong' : momentum > 0.25 ? 'Building back' : 'Quiet'}
            </Text>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
              A decaying average, not a chain — one quiet day doesn't reset it.
            </Text>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 6 }}>{total} things done, all time.</Text>
          </View>
        </Card>

        <Card>
          <Text style={{ color: t.ink3, fontSize: 13, marginBottom: 10 }}>Last 7 days</Text>
          <WeekBars data={grid.slice(-7).map(d => ({ label: weekdayLetter(d.day), value: d.n }))} />
        </Card>

        <View>
          <Text style={{ color: t.ink3, fontSize: 13, marginBottom: 8 }}>Last 6 months</Text>
          {/* gaps read as a pattern, not as failure */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
            {grid.slice(-182).map((d, i) => (
              <View key={i} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: step(d.n) }} />
            ))}
          </View>
        </View>

        <View style={{ flex: 1, borderRadius: radius.md, overflow: 'hidden' }}>
          <FlatList
            data={wins} keyExtractor={i => i.id} showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{
                flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: t.stroke,
              }}>
                <Text style={{ color: t.ra, fontSize: 15 }}>✓</Text>
                <Text style={{ color: t.ink2, fontSize: 14.5, flex: 1 }} numberOfLines={1}>{item.title}</Text>
                <Text style={{ color: t.ink3, fontSize: 12 }}>
                  {item.completed_at
                    ? new Date(item.completed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : ''}
                </Text>
              </View>
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
