import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useStore } from '../src/store';
import { getProfile, setProfile, lightByDay, wins as winsQuery, type Task } from '../src/db';
import { rankFor, nextRank, rankProgress, DAY_TARGET } from '../src/reward';
import { stageFor } from '../src/growth';
import { LABELS, labelById } from '../src/labels';
import { radius, elevation, type as T } from '../src/theme';
import { Mica, Surface, Character, Bar, Count, IconChevron, IconCheck } from '../src/ui';
import { LabelGlyph } from '../src/components/LabelIcon';

/**
 * You, and how it's actually going.
 *
 * The bars are LIGHT PER DAY, not "percent of tasks completed". A completion
 * rate needs a denominator, the denominator is however much you happened to
 * write down, and so a productive day where you captured a lot scores worse
 * than a quiet day where you captured nothing. That's the exact inversion this
 * app exists to avoid. Light only ever goes up, so a short bar is a quiet day
 * and never a failure.
 */
export default function Profile() {
  const t = useTheme();
  const { light, total, momentum, refresh } = useStore();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<{ date: Date; day: string; n: number }[]>([]);
  const [recent, setRecent] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const p = await getProfile();
    setName(p.name); setTagline(p.tagline);
    setDays(await lightByDay(7));
    setRecent(await winsQuery(6));
  }, []);
  useFocusEffect(useCallback(() => { load(); refresh(); }, [load]));

  const save = async () => {
    await setProfile({ name: name.trim(), tagline: tagline.trim() });
    await refresh();
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const rank = rankFor(light);
  const next = nextRank(light);
  const p = rankProgress(light);
  const max = Math.max(DAY_TARGET, ...days.map(d => d.n));

  /** Warm for a full day, cool for a quiet one — never red, never a warning. */
  const barColors = (n: number): readonly [string, string] => {
    const r = n / DAY_TARGET;
    if (r >= 1)   return t.raBtn;
    if (r >= 0.5) return ['#FFA05C', '#FFC48F'] as const;
    if (r > 0)    return [t.nu, t.nuSoft] as const;
    return [t.track, t.track] as const;
  };

  /** What you actually spend your time on, from the last few weeks. */
  const topLabels = useMemo(() => {
    const count = new Map<string, number>();
    recent.forEach(w => { if (w.label) count.set(w.label, (count.get(w.label) ?? 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, n]) => ({ label: labelById(id)!, n })).filter(x => x.label);
  }, [recent]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>← Today</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <Text style={{ color: t.ink3, fontSize: 14 }}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ---- who ---- */}
        <View style={{ alignItems: 'center', marginTop: 6 }}>
          <View style={[{
            width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.layer, borderWidth: 1, borderColor: t.strokeStrong, overflow: 'hidden',
          }, elevation.e8]}>
            <Character name="ra-celebrate" size={92 * stageFor(light).scale} motion="bob" />
          </View>

          {editing ? (
            <View style={{ alignSelf: 'stretch', marginTop: 14, gap: 10 }}>
              <Surface>
                <TextInput
                  autoFocus value={name} onChangeText={setName}
                  placeholder="Your name" placeholderTextColor={t.ink3}
                  style={{ color: t.ink, fontSize: 18, fontFamily: T.display, padding: 14, textAlign: 'center' }}
                />
              </Surface>
              <Surface>
                <TextInput
                  value={tagline} onChangeText={setTagline}
                  onSubmitEditing={save} returnKeyType="done"
                  placeholder="What you're working towards" placeholderTextColor={t.ink3}
                  style={{ color: t.ink2, fontSize: 14.5, padding: 13, textAlign: 'center' }}
                />
              </Surface>
              <Pressable onPress={save} style={{ borderRadius: radius.pill, overflow: 'hidden' }}>
                <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: t.onRa, fontSize: 15, fontFamily: T.brand }}>Save</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={{ color: t.ink, fontSize: 26, fontFamily: T.display, marginTop: 12, letterSpacing: -0.5 }}>
                {name || 'Add your name'}
              </Text>
              {!!tagline && (
                <Text style={{ color: t.ink3, fontSize: 14, marginTop: 4, textAlign: 'center', maxWidth: 280, lineHeight: 20 }}>
                  {tagline}
                </Text>
              )}
              <Pressable onPress={() => setEditing(true)}
                style={{
                  marginTop: 12, paddingHorizontal: 20, paddingVertical: 10,
                  borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.strokeStrong,
                }}>
                <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>Edit profile</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* companions — the growth surface, reachable from the face you see most */}
        <Pressable onPress={() => router.push('/companions')} style={{ marginTop: 18 }}>
          <Surface accent="nu">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 }}>
              <Character name="nu-idle" size={40} motion="none" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>
                  Nu &amp; Ra · {stageFor(light).name}
                </Text>
                <Text style={{ color: t.ink3, fontSize: 13, marginTop: 1 }}>
                  They grow as you do. See the collection.
                </Text>
              </View>
              <IconChevron size={16} color={t.ink3} />
            </View>
          </Surface>
        </Pressable>

        {/* ---- rank ---- */}
        <Surface accent="ra" style={{ marginTop: 22 }}>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: t.ink, fontSize: 18, fontFamily: T.display, flex: 1 }}>{rank.name}</Text>
              <Count value={light} style={{ color: t.ra, fontSize: 26, fontFamily: T.display }} />
              <Text style={{ color: t.ink3, fontSize: 13, marginLeft: 5 }}>light</Text>
            </View>
            <Bar pct={p} height={8} />
            <Text style={{ color: t.ink3, fontSize: 13 }}>
              {next ? `${next.at - light} to ${next.name}` : 'Every rank there is.'}
            </Text>
          </View>
        </Surface>

        {/* ---- the week ---- */}
        <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginTop: 24, marginBottom: 10, marginLeft: 4 }}>
          YOUR PROGRESS
        </Text>
        <Surface>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 168 }}>
              {days.map((d, i) => {
                const isToday = i === days.length - 1;
                const h = Math.max(8, (d.n / max) * 128);
                return (
                  <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                    {isToday && (
                      <Text style={{ color: t.ra, fontSize: 11, fontFamily: T.brand }}>{d.n}</Text>
                    )}
                    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                      <View style={{ width: 26, height: h, borderRadius: 13, overflow: 'hidden' }}>
                        <LinearGradient colors={barColors(d.n)} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
                          style={{ flex: 1 }} />
                      </View>
                    </View>
                    <Text style={{ color: isToday ? t.ink : t.ink3, fontSize: 11.5, fontFamily: isToday ? T.brand : undefined }}>
                      {isToday ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: t.stroke, marginVertical: 14 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontFamily: T.brand }}>
                  {momentum > 0.6 ? 'Strong' : momentum > 0.25 ? 'Building back' : 'Quiet'}
                </Text>
                <Text style={{ color: t.ink3, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                  A decaying average, not a chain. One quiet day doesn't reset it.
                </Text>
              </View>
              <Text style={{ color: t.ra, fontSize: 22, fontFamily: T.display }}>
                {Math.round(momentum * 100)}%
              </Text>
            </View>
          </View>
        </Surface>

        <Pressable onPress={() => router.push('/wins')}
          style={{ marginTop: 12, borderRadius: radius.pill, overflow: 'hidden' }}>
          <LinearGradient colors={t.nuBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: T.brand }}>View history</Text>
          </LinearGradient>
        </Pressable>

        {/* ---- what you actually do ---- */}
        <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginTop: 26, marginBottom: 10, marginLeft: 4 }}>
          WHERE YOUR TIME GOES
        </Text>
        {topLabels.length ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {topLabels.map(({ label, n }) => {
              const c = t.key === 'ra' ? label.onLight : label.color;
              return (
                <Surface key={label.id} style={{ flex: 1 }}>
                  <View style={{ padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: radius.md,
                      alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}22`,
                    }}>
                      <LabelGlyph id={label.id} size={21} color={c} />
                    </View>
                    <Text style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>{label.name}</Text>
                    <Text style={{ color: t.ink3, fontSize: 12.5 }}>{n} done</Text>
                  </View>
                </Surface>
              );
            })}
          </View>
        ) : (
          <Surface>
            <Text style={{ color: t.ink3, fontSize: 14, padding: 18, lineHeight: 20 }}>
              Finish a few things and this fills in with what you actually spend your days on.
            </Text>
          </Surface>
        )}

        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19, marginTop: 20, paddingHorizontal: 4 }}>
          These bars are light earned, not a completion rate. A rate would punish
          you for writing more down.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
