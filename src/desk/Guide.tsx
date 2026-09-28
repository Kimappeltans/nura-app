import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useStore, useTheme } from '../store';
import { getDb, getFlag, setFlag } from '../db';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { NuGlow } from '../components/NuGlow';
import { decorative } from '../a11y';
import { DeskCard, Label, LinkButton, useDeskTokens, useDeskState, ON_CORAL } from './kit';

/**
 * GETTING STARTED, on the desktop's Home: the three things Nura is for, as
 * steps that tick themselves off when you've really done them (from your own
 * tasks and the event log, never a button that says so). With nothing held
 * yet it is the room's main card and shows what you can say, each one marked
 * as an example: tapping one puts it in Tell Nu so you see how Nu reads it,
 * and nothing is added until you press Enter. Once there's a task it is a
 * small card beside the move. All three done, or Hide, and it's gone for good
 * (the flag `guide.hidden`).
 */

const STEPS = [
  { title: 'Tell Nu what’s going on', line: 'Type it or say it, in any order.' },
  { title: 'Start your next move', line: 'Nu picks one and says why. Press Start.' },
  { title: 'Tell Nu when the day changes', line: 'Not now, or Something changed.' },
];
/** What you can say: one of each kind Nu reads differently. */
const SAY = [
  { what: 'One thing', words: 'pay rent friday 10 min' },
  { what: 'Several at once', words: 'finish the deck, call the dentist tue 3pm, send Sarah the notes' },
  { what: 'Something big', words: 'launch my website' },
];

/** Which steps are done, and whether the guide is still shown. Null until it's known. */
export function useGuide() {
  const { inbox, todayPicked, wins, decisions } = useStore();
  const [seen, setSeen] = useState<{ started: boolean; changed: boolean; hidden: boolean } | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const db = await getDb();
        const [row, hidden] = await Promise.all([
          db.getFirstAsync<{ a: number; b: number }>(
            `SELECT (SELECT COUNT(*) FROM event WHERE kind IN ('session_start','completed')) AS a,
                    (SELECT COUNT(*) FROM event WHERE kind IN ('swapped','skipped','snoozed')) AS b`),
          getFlag('guide.hidden'),
        ]);
        if (!dead) setSeen({ started: (row?.a ?? 0) > 0, changed: (row?.b ?? 0) > 0, hidden: hidden === '1' });
      } catch {
        // it can't be known: no guide, rather than one that's wrong
        if (!dead) setSeen({ started: false, changed: false, hidden: true });
      }
    })();
    return () => { dead = true; };
  }, [inbox, todayPicked, wins, decisions]);

  const done = [inbox.length + todayPicked.length + wins.length > 0, !!seen?.started, !!seen?.changed];
  const all = done.every(Boolean);
  // all three done: it has said what it had to say
  useEffect(() => { if (seen && !seen.hidden && all) setFlag('guide.hidden', '1').catch(() => {}); }, [seen, all]);
  const hide = () => {
    setSeen(s => (s ? { ...s, hidden: true } : s));
    setFlag('guide.hidden', '1').catch(() => {});
  };
  return { show: !!seen && !seen.hidden && !all, done, at: done.findIndex(d => !d), hide };
}

export function Guide({ full, done, at, onHide }: { full?: boolean; done: boolean[]; at: number; onHide: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const count = done.filter(Boolean).length;
  const steps = (
    <View accessibilityRole="list" style={{ gap: full ? 18 : 12 }}>
      {STEPS.map((s, i) => {
        const now = i === at;
        return (
          <View key={s.title} accessible accessibilityLabel={`Step ${i + 1}, ${s.title}${done[i] ? ', done' : now ? ', next' : ''}`}
            style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View {...decorative} style={{
              width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1,
              borderWidth: 1.5, borderColor: done[i] || now ? t.ra : t.strokeStrong, backgroundColor: done[i] ? t.ra : 'transparent',
            }}>
              <Text style={{ color: done[i] ? ON_CORAL : now ? k.raText : t.ink3, fontSize: 13, fontFamily: T.display }}>{done[i] ? '✓' : i + 1}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: done[i] ? t.ink3 : now ? t.ink : t.ink2, fontSize: full ? 18 : 16, letterSpacing: -0.3, fontFamily: now ? T.display : T.brand }}>{s.title}</Text>
              {now && <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21, fontFamily: T.brand, marginTop: 2 }}>{s.line}</Text>}
              {now && i === 0 && full && <Say />}
            </View>
          </View>
        );
      })}
    </View>
  );
  const head = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
      <Label color={k.raText}>{`Getting started · ${count} of 3`}</Label>
      <LinkButton label="Hide" accessibilityLabel="Hide getting started" onPress={onHide} />
    </View>
  );
  if (!full) return <DeskCard style={{ paddingVertical: 18, paddingHorizontal: 24, gap: 14 }}>{head}{steps}</DeskCard>;
  return (
    <DeskCard style={{ paddingVertical: 26, paddingHorizontal: 30, gap: 6 }}>
      {head}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6, marginBottom: 18 }}>
        <View {...decorative}><NuGlow size={84}><Image source={poseImage('nu-listen')} resizeMode="contain" style={{ width: 84, height: 84 }} /></NuGlow></View>
        <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, fontSize: 32, letterSpacing: -1.1, fontFamily: T.display }}>What’s going on?</Text>
      </View>
      {steps}
    </DeskCard>
  );
}

/** What you can say: three examples, each marked as one. Tapping one hands it to Tell Nu. */
function Say() {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      {SAY.map(x => (
        <Pressable key={x.what} onPress={() => useDeskState.setState({ tellText: x.words })}
          accessibilityRole="button" accessibilityLabel={`${x.what}, an example: ${x.words}. Shows how Nu reads it.`}
          style={(s) => {
            const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
            return {
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 14,
              borderRadius: 14, borderWidth: 1, borderColor: pressed || hovered ? t.strokeStrong : t.stroke, backgroundColor: pressed || hovered ? k.wash : 'transparent',
            };
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.display, letterSpacing: -0.2 }}>{x.what}</Text>
            <Text numberOfLines={2} style={{ color: t.ink2, fontSize: 15, lineHeight: 20, fontFamily: T.brand }}>{`“${x.words}”`}</Text>
          </View>
          <View style={{ borderRadius: 6, borderWidth: 1, borderColor: t.strokeStrong, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: t.ink2, fontSize: 12.5, fontFamily: T.display }}>Example</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
