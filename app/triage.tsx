import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../src/store';
import { notNow, dropTask, updateTask, pickForToday, type Task } from '../src/db';
import { radius, elevation, type as T } from '../src/theme';
import { Mica, Surface, Primary, Character } from '../src/ui';

type Outcome = 'kept' | 'pushed' | 'shrunk' | 'waiting' | 'handed' | 'dropped';

const ACTIONS: { key: Outcome; glyph: string; label: string; sub: string }[] = [
  { key: 'kept',    glyph: '✓', label: 'Keep it today',        sub: 'stays right where it is' },
  { key: 'pushed',  glyph: '↓', label: 'Push to this evening',  sub: 'resurfaces after 7:30' },
  { key: 'shrunk',  glyph: '◊', label: 'Shrink it',             sub: 'just five minutes of it, for now' },
  { key: 'waiting', glyph: '⋯', label: 'Waiting on someone',    sub: 'stays in the water, stops being asked' },
  { key: 'handed',  glyph: '↗', label: 'Give it to someone',    sub: 'off your day, still tracked' },
  { key: 'dropped', glyph: '×', label: 'Let it go',             sub: 'gone, no explanation needed' },
];

const TALLY_LABEL: Record<Outcome, string> = {
  kept: 'kept', pushed: 'moved', shrunk: 'shrunk', waiting: 'waiting', handed: 'handed off', dropped: 'let go',
};

/**
 * One pass through everything, one decision each.
 *
 * Not a cleanup you're graded on — there's no "you should have done this
 * sooner" anywhere on this screen, just six honest things to do with a
 * task that's been sitting. The backlog isn't a queue to feel behind on,
 * it's a pile of decisions nobody's made yet; this makes each one small.
 */
export default function Triage() {
  const t = useTheme();
  const { inbox, todayPicked, refresh } = useStore();
  const [queue] = useState<Task[]>(() =>
    [...todayPicked, ...inbox].filter(x => x.state !== 'done' && x.state !== 'dropped'));
  const [i, setI] = useState(0);
  const [tally, setTally] = useState<Record<Outcome, number>>({
    kept: 0, pushed: 0, shrunk: 0, waiting: 0, handed: 0, dropped: 0,
  });

  const current = queue[i];
  const finished = i >= queue.length;

  useEffect(() => { if (finished && queue.length) refresh(); }, [finished]);

  const act = async (outcome: Outcome) => {
    if (!current) return;
    Haptics.selectionAsync();
    switch (outcome) {
      // on today's plan — for an inbox task that's a real move, not a no-op
      case 'kept': if (current.state === 'inbox') await pickForToday(current.id, true); break;
      case 'pushed': {
        const target = new Date(); target.setHours(19, 30, 0, 0);
        if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
        await notNow(current.id, Math.round((target.getTime() - Date.now()) / 60000));
        break;
      }
      case 'shrunk': await updateTask(current.id, { est_minutes: 5 }); break;
      case 'waiting': await notNow(current.id, 3 * 24 * 60); break;
      case 'handed': await pickForToday(current.id, false); break;
      case 'dropped': await dropTask(current.id); break;
    }
    setTally(p => ({ ...p, [outcome]: p[outcome] + 1 }));
    setI(v => v + 1);
  };

  const summary = (Object.keys(TALLY_LABEL) as Outcome[])
    .map(k => `${tally[k]} ${TALLY_LABEL[k]}`)
    .join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>✕</Text>
        </Pressable>
      </View>

      {!queue.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}>
          <Character name="nu-idle" size={104} motion="bob" />
          <Text style={{ color: t.ink, fontSize: 22, fontFamily: T.display, textAlign: 'center' }}>
            Nothing waiting on a decision.
          </Text>
          <Text style={{ color: t.ink3, fontSize: 14.5, textAlign: 'center', lineHeight: 20, maxWidth: 260 }}>
            The water's clear enough that there's nothing here worth a pass through it.
          </Text>
          <Primary label="Back to the one thing" tone="nu" onPress={() => router.back()} />
        </View>
      ) : finished ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}>
          <Character name="nu-idle" size={112} motion="bob" />
          <Text style={{ color: t.ink, fontSize: 24, fontFamily: T.display, textAlign: 'center' }}>
            That's the whole backlog.
          </Text>
          <Text style={{ color: t.ink3, fontSize: 14.5, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
            {summary}.
          </Text>
          <View style={{ height: 6 }} />
          <Primary label="Back to the one thing" tone="nu" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, flexGrow: 1 }}>
          <Text style={{ color: t.nu, fontSize: 11.5, letterSpacing: 2, fontFamily: T.brand }}>
            ONE PASS · {i + 1} OF {queue.length}
          </Text>
          <Text style={{ color: t.ink3, fontSize: 14.5, marginTop: 4, marginBottom: 18 }}>
            One decision each. Nothing here is judged.
          </Text>

          <View style={[{
            borderRadius: radius.xl, padding: 18, marginBottom: 18,
            backgroundColor: t.card, borderWidth: 1, borderColor: t.strokeStrong,
          }, elevation.e8]}>
            <Text style={{ color: t.ink, fontSize: 22, fontFamily: T.display, lineHeight: 28 }}>
              {current.title}
            </Text>
            {!!current.est_minutes && (
              <Text style={{ color: t.ink3, fontSize: 13, marginTop: 6 }}>≈ {current.est_minutes} min</Text>
            )}
          </View>

          <Surface>
            {ACTIONS.map((a, idx) => (
              <View key={a.key}>
                {idx > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 56 }} />}
                <Pressable onPress={() => act(a.key)} style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 13,
                  paddingVertical: 13, paddingHorizontal: 14,
                  backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                  <View style={{
                    width: 34, height: 34, borderRadius: radius.md,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash,
                  }}>
                    <Text style={{ color: t.nu, fontSize: 15 }}>{a.glyph}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{a.label}</Text>
                    <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 1 }}>{a.sub}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </Surface>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
