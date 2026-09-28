import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { useStore, useTheme } from '../store';
import { getDb, getFlag, setFlag } from '../db';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { NuGlow } from '../components/NuGlow';
import { decorative } from '../a11y';
import { understandLocal } from '../understand';
import { getLanguage } from '../planner';
import { readOf } from '../components/CaptureSheet';
import { DeskCard, Label, LinkButton, Reading, useDeskTokens, useDeskState, ON_CORAL } from './kit';

/**
 * GETTING STARTED, on the desktop's Home: the three things Nura is for, as
 * steps that tick themselves off when you've really done them (from your own
 * tasks and the event log, never a button that says so). With nothing held
 * yet it is the room's main card, right under Tell Nu: the steps on one
 * side, and on the other what you can say, each example with how Nu reads
 * it shown beside it (read by the app's own parser, so the days are real).
 * The examples are only shown: nothing is added, and Type your own puts the
 * cursor in Tell Nu. Once there's a task it is a small card beside the move.
 * All three done, or Hide, and it's gone for good (the flag `guide.hidden`),
 * unless Nura is opened at `?guide=again`.
 */

const STEPS = [
  { title: 'Tell Nu what’s going on', line: 'Type it or say it, in any order.' },
  { title: 'Start your next move', line: 'Nu picks one and says why. Press Start.' },
  { title: 'Tell Nu when the day changes', line: 'Not now, or Something changed.' },
];
/** What you can say: one of each kind Nu reads differently. */
const SAY = [
  { what: 'One thing', words: 'pay rent friday 10 min' },
  { what: 'Several at once', words: 'prep the board deck 2h, dentist tue 3pm, buy milk' },
  { what: 'Something big', words: 'launch my website' },
];

/**
 * The web: opening Nura at `?guide=again` starts the guide over, once (the
 * address is tidied straight after). Nothing of yours is touched: the steps
 * count from this moment on.
 */
async function again() {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return;
  const q = new URLSearchParams(location.search);
  if (q.get('guide') !== 'again') return;
  q.delete('guide');
  history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  await setFlag('guide.since', String(Date.now()));
  await setFlag('guide.hidden', '0');
}

/** Which steps are done, and whether the guide is still shown. Null until it's known. */
export function useGuide() {
  const { inbox, todayPicked, wins, decisions } = useStore();
  const [seen, setSeen] = useState<{ fresh: boolean; told: boolean; started: boolean; changed: boolean; hidden: boolean } | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const db = await getDb();
        await again();
        // `guide.since`: the guide started over (nothing of yours is touched): only what happened after counts
        const since = Number(await getFlag('guide.since')) || 0;
        const [row, hidden] = await Promise.all([
          db.getFirstAsync<{ c: number; a: number; b: number }>(
            `SELECT (SELECT COUNT(*) FROM event WHERE kind = 'captured' AND at >= ?) AS c,
                    (SELECT COUNT(*) FROM event WHERE kind IN ('session_start','completed') AND at >= ?) AS a,
                    (SELECT COUNT(*) FROM event WHERE kind IN ('swapped','skipped','snoozed') AND at >= ?) AS b`,
            since, since, since),
          getFlag('guide.hidden'),
        ]);
        if (!dead) setSeen({ fresh: since === 0, told: (row?.c ?? 0) > 0, started: (row?.a ?? 0) > 0, changed: (row?.b ?? 0) > 0, hidden: hidden === '1' });
      } catch {
        // it can't be known: no guide, rather than one that's wrong
        if (!dead) setSeen({ fresh: true, told: false, started: false, changed: false, hidden: true });
      }
    })();
    return () => { dead = true; };
  }, [inbox, todayPicked, wins, decisions]);

  // told: something put down (or, on a first run, anything held at all: tasks that came with the account count)
  const held = inbox.length + todayPicked.length + wins.length > 0;
  const done = [!!seen && (seen.told || (seen.fresh && held)), !!seen?.started, !!seen?.changed];
  const all = done.every(Boolean);
  // all three done: it has said what it had to say
  useEffect(() => { if (seen && !seen.hidden && all) setFlag('guide.hidden', '1').catch(() => {}); }, [seen, all]);
  const hide = () => {
    setSeen(s => (s ? { ...s, hidden: true } : s));
    setFlag('guide.hidden', '1').catch(() => {});
  };
  return { show: !!seen && !seen.hidden && !all, done, at: done.findIndex(d => !d), hide };
}

export function Guide({ full, wide, done, at, onHide }: { full?: boolean; /** room for the steps and the examples side by side */ wide?: boolean; done: boolean[]; at: number; onHide: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const count = done.filter(Boolean).length;
  const steps = (
    <View accessibilityRole="list" style={{ gap: full ? 16 : 12 }}>
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
    <DeskCard style={{ paddingVertical: 24, paddingHorizontal: 30, gap: 18 }}>
      {head}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 40 : 24, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 4 : undefined, minWidth: 0, alignSelf: 'stretch', gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View {...decorative}><NuGlow size={76}><Image source={poseImage('nu-listen')} resizeMode="contain" style={{ width: 76, height: 76 }} /></NuGlow></View>
            <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, fontSize: 30, letterSpacing: -1.1, fontFamily: T.display }}>What’s going on?</Text>
          </View>
          {steps}
          <Pressable onPress={() => useDeskState.setState(s => ({ tellFocus: s.tellFocus + 1 }))} accessibilityRole="button" accessibilityLabel="Tell Nu"
            style={(s) => {
              const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
              return { alignSelf: 'flex-start', height: 46, paddingHorizontal: 24, borderRadius: 23, justifyContent: 'center', backgroundColor: t.ink, opacity: pressed ? 0.8 : hovered ? 0.9 : 1 };
            }}>
            <Text style={{ color: t.base, fontSize: 16, fontFamily: T.display }}>Tell Nu</Text>
          </Pressable>
        </View>
        <View style={{ flex: wide ? 6 : undefined, minWidth: 0, alignSelf: 'stretch' }}>
          <Say wide={wide} />
        </View>
      </View>
    </DeskCard>
  );
}

/** What you can say, and beside each one how Nu reads it. Shown, never added. */
function Say({ wide }: { wide?: boolean }) {
  const t = useTheme();
  const [lang, setLang] = useState('en');
  useEffect(() => { getLanguage().then(setLang).catch(() => {}); }, []);
  const rows = useMemo(() => SAY.map(x => ({ ...x, read: readOf([x.words], understandLocal(x.words, lang)) })), [lang]);
  return (
    <View accessibilityRole="list">
      <View {...decorative} style={{ flexDirection: 'row', gap: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
        <Text style={{ flex: wide ? 4 : 1, color: t.ink3, fontSize: 12.5, letterSpacing: 1.2, fontFamily: T.display, textTransform: 'uppercase' }}>You say</Text>
        {wide && <Text style={{ flex: 6, color: t.ink3, fontSize: 12.5, letterSpacing: 1.2, fontFamily: T.display, textTransform: 'uppercase' }}>Nu reads</Text>}
      </View>
      {rows.map((x, i) => (
        <View key={x.what} accessible accessibilityLabel={`${x.what}. You say: ${x.words}.`}
          style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 10, paddingVertical: 14, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: t.stroke }}>
          <View style={{ flex: wide ? 4 : undefined, minWidth: 0 }}>
            <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>{x.what}</Text>
            <Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 21, fontFamily: T.brand, marginTop: 2 }}>{`“${x.words}”`}</Text>
          </View>
          <View style={{ flex: wide ? 6 : undefined, minWidth: 0 }}>
            {!!x.read && <Reading read={x.read} said />}
          </View>
        </View>
      ))}
    </View>
  );
}
