import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { getFlag, setFlag, pickForToday, guideFacts, type Task } from '../db';
import { guide as decide, GUIDE_KEYS, GUIDE_STEPS, SAY, BIG, type Guide as GuideState, type GuideStep } from '../guide';
import { type as T } from '../theme';
import { poseImage, type CharacterName } from '../ui';
import { NuGlow } from './NuGlow';
import { decorative } from '../a11y';
import { understandLocal } from '../understand';
import { getLanguage } from '../planner';
import { readOf } from './CaptureSheet';
import { useDesk } from '../screen';
import { DeskCard, Reading, partsOf, useDeskState, useDeskTokens, ON_CORAL } from '../desk/kit';

/**
 * THE GUIDE on Home (src/guide.ts), phone and desktop alike: show first,
 * then do, one step at full size and the others as a quiet row above it.
 * Each step ticks itself off from what you really did; Hide puts it away
 * for good.
 */

const HIDDEN: GuideState = { show: false, retire: null, begin: null, done: [false, false, false, false, false], count: 0, current: null, newly: [] };

/**
 * The web: opening Nura at `?guide=again` starts the guide over, once (the
 * address is tidied straight after). Nothing of yours is touched: the steps
 * count from this moment on.
 */
let restarting: Promise<void> = Promise.resolve();
function again(): Promise<void> {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return restarting;
  const q = new URLSearchParams(location.search);
  if (q.get('guide') !== 'again') return restarting;
  q.delete('guide');
  history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  // every read waits for this, so none sees the flags from before
  restarting = restarting.then(async () => {
    await setFlag(GUIDE_KEYS.since, String(Date.now()));
    await setFlag(GUIDE_KEYS.again, '1');
    await setFlag(GUIDE_KEYS.off, '');
    for (const s of GUIDE_STEPS) await setFlag(GUIDE_KEYS.step(s), '');
  }).catch(() => {});
  return restarting;
}

/**
 * The guide's state on this device, read again whenever what you hold, what's
 * done, the projects, the planner's picks or the running session change, and
 * when Home comes back into view (from What Nura has learned). It writes its
 * own flags: when it was first offered, each step as it's ticked, and
 * `guide2.off` once it's finished, hidden, or the person isn't new.
 */
export function useGuide(night: boolean) {
  const tasks = useStore(s => s.inbox.length + s.todayPicked.length);
  const wins = useStore(s => s.wins.length);
  const projects = useStore(s => s.projects.length);
  const decisions = useStore(s => s.decisions);
  const running = useStore(s => s.running);
  const [state, setState] = useState<GuideState>(HIDDEN);
  const [hidden, setHidden] = useState(false);
  const [back, setBack] = useState(0);
  useFocusEffect(useCallback(() => { setBack(n => n + 1); }, []));

  useEffect(() => {
    let live = true;
    (async () => {
      await again();
      const [since, off, re, oldOff, oldSince, oldDesk, f, ...steps] = await Promise.all([
        getFlag(GUIDE_KEYS.since), getFlag(GUIDE_KEYS.off), getFlag(GUIDE_KEYS.again),
        getFlag(GUIDE_KEYS.oldStartOff), getFlag(GUIDE_KEYS.oldStartSince), getFlag(GUIDE_KEYS.oldDeskHidden),
        guideFacts(),
        ...GUIDE_STEPS.map(s => getFlag(GUIDE_KEYS.step(s))),
      ]);
      const crossed = GUIDE_STEPS.filter((_, i) => !!steps[i]);
      // a session running now has started, even before its event is written
      const at = [f.firstSession, f.lastSession, running?.startedAt ?? null].filter((x): x is number => x != null);
      const now = Date.now();
      const g = decide({
        now, since: since ? Number(since) : null, off: !!off, again: re === '1',
        old: { off: !!oldOff || oldDesk === '1', since: oldSince ? Number(oldSince) : null },
        crossed, night,
        tasks: f.tasks, lastTask: f.lastTask, firstDone: f.firstDone,
        firstSession: at.length ? Math.min(...at) : null, lastSession: at.length ? Math.max(...at) : null,
        lastProject: f.lastProject, lastChange: f.lastChange,
      });
      if (g.begin) await setFlag(GUIDE_KEYS.since, String(g.begin));
      for (const n of g.newly) await setFlag(GUIDE_KEYS.step(n), String(now));
      if (g.retire) await setFlag(GUIDE_KEYS.off, g.retire);
      if (live) setState(g);
    })().catch(() => {});
    return () => { live = false; };
  }, [night, tasks, wins, projects, decisions, running?.id, back]);

  const hide = async () => {
    setHidden(true);
    await setFlag(GUIDE_KEYS.off, 'hidden');
  };
  return { ...state, show: state.show && !hidden, hide };
}

export type UseGuide = ReturnType<typeof useGuide>;

type StepDef = { n: GuideStep; title: string; who: CharacterName };
const STEPS: StepDef[] = [
  { n: 1, title: 'Put it all down', who: 'nu-listen' },
  { n: 2, title: 'Start your next move', who: 'ra-hello' },
  { n: 3, title: 'Plan something bigger', who: 'nu-ask' },
  { n: 4, title: 'Change the day', who: 'ra-sun' },
  { n: 5, title: 'See what Nura learns', who: 'nu-hello' },
];

/** The planner's pick: what's chosen or first on Today, else the planner's first (the same as Home's move). */
function usePick(): Task | null {
  const now = useStore(s => s.now);
  const first = useStore(s => s.decisions[0]?.task ?? null);
  return now ?? first;
}

/**
 * The guide: the progress row (done ones ticked, Hide on the right) and the
 * step at full size. `beside`: the desktop's small card beside the move;
 * otherwise, on the desktop, the room's main card with the step on one side
 * and what it shows on the other.
 */
export function Guide({ g, beside }: { g: UseGuide; beside?: boolean }) {
  const desk = useDesk();
  const t = useTheme();
  const pick = usePick();
  const [viewing, setViewing] = useState<GuideStep | null>(null);
  // an example tapped: Tell Nu (or Plan it with Nu) opens with it
  const [said, setSaid] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  // a step you looked at that has since been done: back to the one at full size
  const n = viewing && !g.done[viewing - 1] ? viewing : g.current;
  useEffect(() => { setSaid(null); setPlanned(false); }, [n]);
  if (!g.show || !n) return null;
  const step = STEPS[n - 1];
  const wide = desk && !beside;

  const run = async () => {
    Haptics.selectionAsync();
    if (n === 1) {
      if (desk) useDeskState.setState(s => ({ tellFocus: s.tellFocus + 1, tellFill: said }));
      else useStore.setState({ telling: true, tellDraft: said });
      return;
    }
    if (n === 2) {
      if (!pick) return;
      // as onboarding's Start does: what you start is on your Today
      await pickForToday(pick.id, true);
      await useStore.getState().focusOn(pick.id);
      router.push({ pathname: '/timer', params: { id: pick.id, mins: '5' } });
      return;
    }
    if (n === 3) { router.push({ pathname: '/project/new', params: planned ? { goal: BIG.words } : {} }); return; }
    if (n === 5) router.push('/learned');
  };
  const button = n === 1 ? 'Tell Nu' : n === 2 ? 'Begin · 5 minutes' : n === 3 ? 'Plan it with Nu' : n === 5 ? 'What Nura has learned' : null;
  const buttonSaid = n === 2 ? 'Begin, 5 minutes' : button;
  // step 4 has nothing to press here: it's on the move itself
  const line = n === 4 ? (desk ? 'On your next move.' : 'On Focus, under More options.') : null;

  const show = (
    n === 1 ? <SayShow wide={wide} said={said} onSay={setSaid} />
    : n === 2 ? <PickShow pick={pick} big={wide} />
    : n === 3 ? <BigShow big={wide} tapped={planned} onTap={() => setPlanned(v => !v)} />
    : n === 4 ? <ChangeShow desk={desk} big={wide} />
    : <LearnShow big={wide} />
  );
  const doIt = button && <DoButton label={button} said={buttonSaid!} big={desk} disabled={n === 2 && !pick} onPress={run} />;
  const head = <Progress g={g} at={n} big={desk} onView={s => setViewing(s)} onHide={g.hide} />;

  if (wide) {
    return (
      <DeskCard style={{ paddingVertical: 24, paddingHorizontal: 30, gap: 22 }}>
        {head}
        <View style={{ flexDirection: 'row', gap: 40, alignItems: 'flex-start' }}>
          <View style={{ flex: 4, minWidth: 0, gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Who name={step.who} size={76} />
              <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, fontSize: 30, lineHeight: 34, letterSpacing: -1.1, fontFamily: T.display }}>{step.title}</Text>
            </View>
            {!!line && <Text style={{ color: t.ink2, fontSize: 16, fontFamily: T.brand }}>{line}</Text>}
            {doIt && <View style={{ flexDirection: 'row' }}>{doIt}</View>}
          </View>
          <View style={{ flex: 6, minWidth: 0 }}>{show}</View>
        </View>
      </DeskCard>
    );
  }

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Who name={step.who} size={desk ? 52 : 46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" numberOfLines={2} style={{ color: t.ink, fontSize: desk ? 21 : 19, lineHeight: desk ? 25 : 23, letterSpacing: -0.6, fontFamily: T.display }}>{step.title}</Text>
          {!!line && <Text style={{ color: t.ink3, fontSize: 13.5, fontFamily: T.brand, marginTop: 1 }}>{line}</Text>}
        </View>
      </View>
      <View style={{ marginTop: 14 }}>{show}</View>
      {doIt && <View style={{ flexDirection: 'row', marginTop: 16 }}>{doIt}</View>}
    </>
  );
  if (desk) {
    return <DeskCard style={{ paddingVertical: 18, paddingHorizontal: 22, gap: 16 }}>{head}<View>{body}</View></DeskCard>;
  }
  return (
    <View>
      {head}
      <View style={{ marginTop: 10, borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 14 }}>
        {body}
      </View>
    </View>
  );
}

/** Five marks, done ones ticked and the one at full size ringed; "2 of 5"; Hide. Tap a step still to do to see it. */
function Progress({ g, at, big, onView, onHide }: { g: UseGuide; at: GuideStep; big?: boolean; onView: (s: GuideStep) => void; onHide: () => void }) {
  const t = useTheme();
  const size = big ? 26 : 24;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}>
      <View accessibilityRole="header" accessibilityLabel={`Getting started, ${g.count} of 5 done`} style={{ flexDirection: 'row', alignItems: 'center', gap: big ? 8 : 6 }}>
        {STEPS.map(s => {
          const done = g.done[s.n - 1];
          const here = s.n === at;
          return (
            <Pressable key={s.n} disabled={done || here} onPress={() => onView(s.n)} hitSlop={4}
              accessibilityRole="button" accessibilityLabel={`Step ${s.n}, ${s.title}${done ? ', done' : here ? ', showing' : ''}`}
              aria-disabled={done || here}
              style={{
                width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
                backgroundColor: done ? t.ra : 'transparent',
                borderWidth: done ? 0 : here ? 1.8 : 1, borderColor: here ? t.nu : t.strokeStrong,
              }}>
              {done ? (
                <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
                  <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={ON_CORAL} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Svg>
              ) : (
                <Text style={{ color: here ? t.ink : t.ink3, fontSize: big ? 13 : 12, fontFamily: T.display }}>{s.n}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text {...decorative} style={{ color: t.ink3, fontSize: big ? 14 : 13, fontFamily: T.brand, marginLeft: 2 }}>{g.count} of 5</Text>
      <View style={{ flex: 1 }} />
      <Pressable onPress={onHide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide getting started">
        <Text style={{ color: t.nu, fontSize: big ? 15 : 14, fontFamily: T.display }}>Hide</Text>
      </Pressable>
    </View>
  );
}

/** Nu in his pale glow; Ra in the sun's. */
function Who({ name, size }: { name: CharacterName; size: number }) {
  const img = <Image source={poseImage(name)} resizeMode="contain" style={{ width: size, height: size }} />;
  if (name.startsWith('nu')) return <View {...decorative}><NuGlow size={size}>{img}</NuGlow></View>;
  const g = size * 1.6;
  return (
    <View {...decorative} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: (size - g) / 2, top: (size - g) / 2 }}>
        <Svg width={g} height={g}>
          <Defs>
            <RadialGradient id="guideRa" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFB067" stopOpacity={0.55} />
              <Stop offset="0.5" stopColor="#FF8A5C" stopOpacity={0.2} />
              <Stop offset="1" stopColor="#FF6B35" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={g / 2} cy={g / 2} r={g / 2} fill="url(#guideRa)" />
        </Svg>
      </View>
      {img}
    </View>
  );
}

/** The step's one button: the ink pill. */
function DoButton({ label, said, big, disabled, onPress }: { label: string; said: string; big?: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={said} aria-disabled={disabled}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return {
          height: big ? 46 : 44, paddingHorizontal: big ? 24 : 20, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.nu, opacity: disabled ? 0.4 : hovered ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        };
      }}>
      <Text style={{ color: t.onNu, fontSize: big ? 16 : 15, fontFamily: T.display }}>{label}</Text>
    </Pressable>
  );
}

/** A small uppercase caption: You say, Nu reads, Nu plans. */
function Cap({ children, style }: { children: React.ReactNode; style?: object }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink3, fontSize: 11.5, letterSpacing: 1.3, fontFamily: T.display, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

/** An example you can tap: the words in quotes, ringed in ink once tapped. */
function Example({ words, on, onPress, big }: { words: string; on: boolean; onPress: () => void; big?: boolean }) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Example: ${words}`}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return {
          borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? t.pickEdge ?? t.ink : t.stroke,
          backgroundColor: on ? t.pick ?? k.pick : pressed || hovered ? k.wash : 'transparent',
          paddingHorizontal: 12, paddingVertical: big ? 10 : 8,
        };
      }}>
      <Text style={{ color: t.ink, fontSize: big ? 15.5 : 14.5, lineHeight: big ? 21 : 19, fontFamily: T.brand }}>{`“${words}”`}</Text>
    </Pressable>
  );
}

/**
 * Step 1: what you can say, and what Nu reads in it (the app's own parser,
 * so the days are real). Tap one and Tell Nu opens with it; nothing is added
 * until you add it there.
 */
function SayShow({ wide, said, onSay }: { wide?: boolean; said: string | null; onSay: (w: string | null) => void }) {
  const t = useTheme();
  const [lang, setLang] = useState('en');
  useEffect(() => { getLanguage().then(setLang).catch(() => {}); }, []);
  const rows = useMemo(() => SAY.map(x => ({ ...x, read: readOf([x.words], understandLocal(x.words, lang)) })), [lang]);
  const tap = (w: string) => onSay(said === w ? null : w);

  if (wide) {
    return (
      <View accessibilityRole="list">
        <View {...decorative} style={{ flexDirection: 'row', gap: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
          <Cap style={{ flex: 4 }}>You say</Cap>
          <Cap style={{ flex: 6 }}>Nu reads</Cap>
        </View>
        {rows.map((x, i) => (
          <View key={x.what} style={{ flexDirection: 'row', gap: 20, paddingVertical: 14, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: t.stroke }}>
            <View style={{ flex: 4, minWidth: 0, gap: 6 }}>
              <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>{x.what}</Text>
              <Example words={x.words} on={said === x.words} onPress={() => tap(x.words)} big />
            </View>
            <View style={{ flex: 6, minWidth: 0, paddingTop: 22 }}>
              {!!x.read && <Reading read={x.read} />}
            </View>
          </View>
        ))}
      </View>
    );
  }
  // a phone, or beside the move: the examples, then what Nu reads in the one tapped (the first until then)
  const shown = rows.find(x => x.words === said) ?? rows[0];
  const drafts = shown.read ? (shown.read.kind === 'many' ? shown.read.drafts : [shown.read.draft]) : [];
  return (
    <View>
      <Cap>You say</Cap>
      <View style={{ gap: 6, marginTop: 6 }}>
        {rows.map(x => <Example key={x.what} words={x.words} on={said === x.words} onPress={() => tap(x.words)} />)}
      </View>
      <Cap style={{ marginTop: 12 }}>Nu reads</Cap>
      <View style={{ gap: 8, marginTop: 6 }}>
        {drafts.map((d, i) => <ReadRow key={i} title={d.title} parts={partsOf(d)} n={drafts.length > 1 ? i + 1 : undefined} />)}
      </View>
    </View>
  );
}

/** One thing Nu read: its title, and each part it picked out. */
function ReadRow({ title, parts, n }: { title: string; parts: [string, string][]; n?: number }) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <View accessible accessibilityLabel={[n ? `Task ${n}` : 'Task', title, ...parts.map(([a, b]) => `${a}: ${b}`)].join(', ')}>
      <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15, fontFamily: T.display, letterSpacing: -0.2 }}>{title}</Text>
      {parts.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
          {parts.map(([a, b]) => (
            <View key={a} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: k.wash }}>
              <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand }}>{a}</Text>
              <Text style={{ color: t.ink, fontSize: 13, fontFamily: T.brand }}>{b}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Step 2: the planner's pick, the one Home's move shows. */
function PickShow({ pick, big }: { pick: Task | null; big?: boolean }) {
  const t = useTheme();
  const k = useDeskTokens();
  const planned = useStore(s => (pick ? s.decisions.find(d => d.taskId === pick.id)?.suggestedMinutes ?? null : null));
  const mins = planned ?? pick?.est_minutes ?? null;
  if (!pick) return <Text style={{ color: t.ink3, fontSize: big ? 16 : 14.5, fontFamily: T.brand }}>Nothing to start yet.</Text>;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.stroke, backgroundColor: k.wash, paddingHorizontal: big ? 20 : 14, paddingVertical: big ? 18 : 12 }}>
      <Cap style={{ color: k.raText }}>Your next move</Cap>
      <Text numberOfLines={2} style={{ color: t.ink, fontSize: big ? 24 : 18, lineHeight: big ? 29 : 23, letterSpacing: big ? -0.8 : -0.4, fontFamily: T.display, marginTop: 6 }}>{pick.title}</Text>
      {!!mins && <Text style={{ color: t.ink2, fontSize: big ? 15.5 : 14, fontFamily: T.brand, marginTop: 3 }}>{`About ${mins} min`}</Text>}
    </View>
  );
}

/** Step 3: a goal, and the kind of path Nu makes of it, the first move marked. An example, not a plan. */
function BigShow({ big, tapped, onTap }: { big?: boolean; tapped: boolean; onTap: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const row = big ? 30 : 26;
  return (
    <View>
      <Cap>You say</Cap>
      <View style={{ marginTop: 6, flexDirection: 'row' }}><Example words={BIG.words} on={tapped} onPress={onTap} big={big} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: big ? 18 : 12 }}>
        <Cap>Nu plans</Cap>
        <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: k.wash }}>
          <Text style={{ color: t.ink3, fontSize: 11.5, fontFamily: T.brand }}>Example</Text>
        </View>
      </View>
      <View accessible accessibilityLabel={`An example path: ${BIG.path.join(', ')}. The first move is marked.`} style={{ marginTop: 8 }}>
        {BIG.path.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: row }}>
            <View {...decorative} style={{ width: 14, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
              {/* the path: a hairline joining the moves */}
              <View style={{ position: 'absolute', width: 1.5, backgroundColor: t.strokeStrong, top: i === 0 ? row / 2 : 0, bottom: i === BIG.path.length - 1 ? row / 2 : 0 }} />
              <View style={{ width: i === 0 ? 14 : 9, height: i === 0 ? 14 : 9, borderRadius: 7, backgroundColor: i === 0 ? t.ra : t.card, borderWidth: i === 0 ? 0 : 1.5, borderColor: t.strokeStrong }} />
            </View>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: i === 0 ? t.ink : t.ink2, fontSize: big ? 16 : 14.5, fontFamily: i === 0 ? T.display : T.brand }}>{s}</Text>
            {i === 0 && <Text style={{ color: k.raText, fontSize: big ? 13 : 12, fontFamily: T.display }}>First move</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Step 4: the buttons as they are on the move (the desktop), or where the phone keeps them. Only shown. */
function ChangeShow({ desk, big }: { desk: boolean; big?: boolean }) {
  const t = useTheme();
  const pill = (label: string) => (
    <View key={label} style={{ height: big ? 46 : 38, paddingHorizontal: big ? 20 : 15, borderRadius: 23, justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong }}>
      <Text style={{ color: t.ink, fontSize: big ? 15.5 : 14, fontFamily: T.brand }}>{label}</Text>
    </View>
  );
  if (desk) {
    return (
      <View {...decorative} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: big ? 4 : 0 }}>
        {pill('Not now')}
        {pill('Something changed')}
      </View>
    );
  }
  // the phone: Focus's More options, and its first row, as the sheet has them
  return (
    <View {...decorative} style={{ borderRadius: 16, borderWidth: 1, borderColor: t.stroke, paddingHorizontal: 14 }}>
      <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.display, paddingVertical: 10 }}>More options</Text>
      <View style={{ borderTopWidth: 1, borderTopColor: t.stroke, paddingVertical: 11 }}>
        <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>Something else</Text>
      </View>
    </View>
  );
}

/** Step 5: one row as What Nura has learned shows it. */
function LearnShow({ big }: { big?: boolean }) {
  const t = useTheme();
  return (
    <View {...decorative} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: t.stroke, paddingHorizontal: big ? 18 : 14, paddingVertical: big ? 13 : 10 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: t.ink3 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontSize: big ? 16 : 15, fontFamily: T.brand }}>How long things take you</Text>
        <Text style={{ color: t.ink3, fontSize: big ? 13.5 : 12.5, fontFamily: T.brand, marginTop: 1 }}>Still learning</Text>
      </View>
    </View>
  );
}
