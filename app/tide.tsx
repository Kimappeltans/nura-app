import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../src/store';
import { capacityFor } from '../src/capacity';
import { radius, type as T, type Theme } from '../src/theme';
import { Mica, Surface, Eyebrow, IconClock } from '../src/ui';
import { LabelTile } from '../src/components/LabelIcon';
import { praiseFor } from '../src/components/ActivityCard';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The whole day, both halves of it.
 *
 * Separate from Wins on purpose — Wins is pure reflection with nothing
 * time-bound about it (see its own header comment); this is explicitly
 * about right now, today, and whether what's left of it actually fits in
 * what's left of the clock. Reachable from Home, not part of its scroll —
 * it's a deliberate look, not ambient information.
 */
export default function Tide() {
  const t = useTheme();
  const { wins, inbox, todayPicked, agenda } = useStore();

  const above = useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    return wins
      .filter(w => w.completed_at && w.completed_at >= startOfDay)
      .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));
  }, [wins]);

  const belowTasks = useMemo(() => {
    const endOfDay = new Date().setHours(23, 59, 59, 999);
    const dated = inbox.filter(x => x.due_at && x.due_at <= endOfDay);
    return [...todayPicked, ...dated];
  }, [inbox, todayPicked]);

  const belowEvents = useMemo(() => {
    const now = Date.now();
    return agenda.filter(e => e.startsAt > now);
  }, [agenda]);

  const below = useMemo(() => [
    ...belowTasks.map(task => ({ kind: 'task' as const, task, at: task.due_at ?? Infinity })),
    ...belowEvents.map(event => ({ kind: 'event' as const, event, at: event.startsAt })),
  ].sort((a, b) => a.at - b.at), [belowTasks, belowEvents]);

  const cap = useMemo(() => capacityFor(belowEvents, belowTasks), [belowEvents, belowTasks]);

  const receipt = `${above.length} risen · ${below.length} still in the water`;
  const dow = new Date().toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>← Today</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <Eyebrow label={`The tide · ${dow}`} tone="ra" />
        <Text style={{ color: t.ink, fontSize: 26, fontFamily: T.display, letterSpacing: -0.6, marginTop: 6 }}>
          {receipt}
        </Text>
        <Text style={{ color: t.ink3, fontSize: 14, marginTop: 5, lineHeight: 20 }}>
          What has risen, and what is still under. Both are the same day.
        </Text>

        {!!above.length && (
          <>
            <Text style={{
              color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand,
              marginTop: 24, marginBottom: 8, marginLeft: 4,
            }}>ABOVE THE SURFACE</Text>
            <Surface accent="ra">
              {above.map((w, i) => (
                <View key={w.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 58 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <LabelTile id={w.label} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15.5 }}>{w.title}</Text>
                      <Text style={{ color: t.ra, fontSize: 12.5, marginTop: 1 }}>{praiseFor(w.id)}</Text>
                    </View>
                    {!!w.completed_at && (
                      <Text style={{ color: t.ink3, fontSize: 12.5 }}>{clock(w.completed_at)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </Surface>
          </>
        )}

        <Text style={{
          color: t.ink3, fontSize: 9.5, letterSpacing: 2, fontFamily: T.brand,
          marginTop: 22, marginBottom: 8, marginLeft: 4,
        }}>NOW · {clock(Date.now())}</Text>

        <Text style={{
          color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand, marginBottom: 8, marginLeft: 4,
        }}>STILL BELOW · {below.length}</Text>
        {!below.length ? (
          <Surface>
            <Text style={{ color: t.ink3, fontSize: 14, padding: 18, lineHeight: 20 }}>
              Nothing left under the surface today.
            </Text>
          </Surface>
        ) : (
          <Surface>
            {below.map((it, i) => (
              <View key={it.kind === 'event' ? `e${it.event.id}` : `t${it.task.id}`}>
                {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 58 }} />}
                {it.kind === 'event' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: t.nuWash,
                    }}>
                      <IconClock size={16} color={t.nu} />
                    </View>
                    <Text style={{ color: t.ink2, fontSize: 15.5, flex: 1 }} numberOfLines={1}>{it.event.title}</Text>
                    <Text style={{ color: t.ink3, fontSize: 12.5 }}>{clock(it.event.startsAt)}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => router.push({ pathname: '/task/[id]', params: { id: it.task.id } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                      backgroundColor: pressed ? t.subtle : 'transparent',
                    })}>
                    <LabelTile id={it.task.label} />
                    <Text style={{ color: t.ink, fontSize: 15.5, flex: 1 }} numberOfLines={1}>{it.task.title}</Text>
                    {!!it.task.due_at && it.task.has_time && (
                      <Text style={{ color: t.ink3, fontSize: 12.5 }}>{clock(it.task.due_at)}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            ))}
          </Surface>
        )}

        {!!below.length && (
          <>
            {/* The risk callout — branches on whether it fits, never on
                whether you've "fallen behind"; there's no such concept to
                fall behind on here. */}
            <View style={{
              marginTop: 16, borderRadius: radius.lg, padding: 16,
              backgroundColor: cap.fits ? t.nuWash : t.raWash,
              borderWidth: 1, borderColor: cap.fits ? t.strokeStrong : `${t.ra}44`,
            }}>
              <Text style={{ color: cap.fits ? t.nu : t.raDeep, fontSize: 15.5, fontFamily: T.brand }}>
                {cap.fits ? 'Everything below fits.' : `${cap.overflowMin} more minutes than fits today.`}
              </Text>
              <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
                {cap.fits
                  ? 'Nothing here needs cutting. One pass through it anyway if you’d rather sort it than sit with it.'
                  : 'Nothing here is late — there’s just more than fits before the day winds down. One pass through the backlog and it will.'}
              </Text>
              <Pressable onPress={() => router.push('/triage')} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                <Text style={{ color: cap.fits ? t.nu : t.raDeep, fontSize: 14, fontFamily: T.brand }}>
                  {cap.fits ? 'Go through them anyway →' : 'Sort it in one pass →'}
                </Text>
              </Pressable>
            </View>

            {/* What will fit — booked / tasks / open, to scale. */}
            <View style={{ marginTop: 14, borderRadius: radius.lg, padding: 16, backgroundColor: t.layer, borderWidth: 1, borderColor: t.stroke }}>
              <Text style={{ color: t.ink2, fontSize: 13.5, fontFamily: T.brand, marginBottom: 10 }}>
                What will fit · until 9:00 PM
              </Text>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.track }}>
                {cap.bookedMin > 0 && (
                  <View style={{ flex: cap.bookedMin, backgroundColor: t.nu }} />
                )}
                {cap.taskMin > 0 && (
                  <View style={{ flex: cap.taskMin, backgroundColor: t.nuSoft }} />
                )}
                {cap.freeMin > 0 && (
                  <View style={{ flex: cap.freeMin, backgroundColor: t.track }} />
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                <Legend color={t.nu} label={`${cap.bookedMin}m anchored`} theme={t} />
                <Legend color={t.nuSoft} label={`${cap.taskMin}m of tasks`} theme={t} />
                <Legend color={t.track} label={`${cap.freeMin}m open`} theme={t} outline />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ color, label, theme, outline }: { color: string; label: string; theme: Theme; outline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{
        width: 8, height: 8, borderRadius: 4, backgroundColor: color,
        borderWidth: outline ? 1 : 0, borderColor: theme.strokeStrong,
      }} />
      <Text style={{ color: theme.ink3, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
