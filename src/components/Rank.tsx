import { View, Text, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { radius, elevation, type as T } from '../theme';
import { useTheme } from '../store';
import { rankFor, nextRank, rankProgress } from '../reward';
import { ACTIVITIES, SCENES, type ActivityId } from '../activities';
import { Surface, Bar, Count } from '../ui';

/**
 * The rank card — light total, current rank, the bar toward the next one.
 * Profile and Wins both showed this, each with its own slightly different
 * markup; since Phase 0 made `reward.ts` the single source of truth for the
 * 9-tier rank list, this is the single source of truth for how it's drawn,
 * so the two screens can't quietly drift into disagreeing about it again.
 */
export function RankCard({ light, blurb = true }: { light: number; blurb?: boolean }) {
  const t = useTheme();
  const rank = rankFor(light);
  const next = nextRank(light);
  const p = rankProgress(light);

  return (
    <Surface accent="ra">
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ color: t.ink, fontSize: 18, fontFamily: T.display, flex: 1 }}>{rank.name}</Text>
          <Count value={light} style={{ color: t.ra, fontSize: 26, fontFamily: T.display }} />
          <Text style={{ color: t.ink3, fontSize: 13, marginLeft: 5 }}>light</Text>
        </View>
        {blurb && (
          <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 20 }}>{rank.blurb}</Text>
        )}
        <Bar pct={p} height={8} />
        <Text style={{ color: t.ink3, fontSize: 13 }}>
          {next ? `${next.at - light} to ${next.name}` : 'Every rank there is.'}
        </Text>
      </View>
    </Surface>
  );
}

/**
 * The six-month contribution grid — "gaps are a pattern, not a failure."
 * `grid` is oldest-first, one entry per day, same shape as `store.grid`.
 */
export function ContributionGrid({ grid, months = 6 }: { grid: { n: number }[]; months?: number }) {
  const t = useTheme();
  const days = months * 30.5;
  const step = (n: number) => t.scale[Math.min(n, t.scale.length - 1)];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
      {grid.slice(-Math.round(days)).map((d, i) => (
        <View key={i} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: step(d.n) }} />
      ))}
    </View>
  );
}

/**
 * The scene gallery — one of 36 activity illustrations, unlocked the first
 * time you finish something of that kind. Locked ones render as a flat
 * silhouette: the shape of what's missing, not the thing itself.
 */
export function SceneGallery({ unlocked }: { unlocked: Set<string> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ACTIVITIES.map(a => {
        const got = unlocked.has(a.id);
        const c = t.key === 'ra' ? a.onLight : a.tint;
        return (
          <Pressable key={a.id} onPress={() => Haptics.selectionAsync()} style={{ width: '31.5%' }}>
            <View style={[{
              borderRadius: radius.lg, overflow: 'hidden',
              borderWidth: 1, borderColor: got ? `${c}44` : t.stroke,
            }, got ? elevation.e4 : elevation.e0]}>
              <LinearGradient
                colors={got ? [`${c}30`, `${c}10`] : [t.surface[0], t.surface[1]]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 8 }}>
                <Image
                  source={SCENES[a.id as ActivityId]}
                  style={{ width: 74, height: 58, opacity: got ? 1 : 0.16, tintColor: got ? undefined : t.ink3 }}
                  resizeMode="contain"
                />
                <Text numberOfLines={1} style={{
                  color: got ? c : t.ink3, fontSize: 11.5, marginTop: 2,
                  fontFamily: got ? T.brand : undefined,
                }}>
                  {got ? a.name : '—'}
                </Text>
              </LinearGradient>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
