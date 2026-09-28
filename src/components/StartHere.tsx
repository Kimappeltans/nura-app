import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { getFlag, setFlag, pickForToday, startHereFacts, type Task } from '../db';
import { startHere, START_KEYS, type StartHere as StartState, type StartStep } from '../startHere';
import { type as T } from '../theme';
import { poseImage, type CharacterName } from '../ui';
import { decorative } from '../a11y';
import { DeskCard, Label, LinkButton } from '../desk/kit';

const HIDDEN: StartState = { show: false, retire: null, begin: null, done: [false, false, false], current: null, newly: [] };

/**
 * Start here's state on this device (src/startHere.ts), read again whenever
 * the list, what's done or the running session changes. It writes its own
 * flags: when it first showed, each step as it's crossed off, and `start.off`
 * once it's finished, skipped, or the person turns out not to be new.
 * `active` is false at night, when Home doesn't offer it.
 */
export function useStartHere(active: boolean) {
  const tasks = useStore(s => s.inbox.length + s.todayPicked.length);
  const wins = useStore(s => s.wins.length);
  const running = useStore(s => s.running);
  const [state, setState] = useState<StartState>(HIDDEN);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (!active) return;
    let live = true;
    (async () => {
      const [since, off, c1, c2, c3, f] = await Promise.all([
        getFlag(START_KEYS.since), getFlag(START_KEYS.off),
        getFlag(START_KEYS.step(1)), getFlag(START_KEYS.step(2)), getFlag(START_KEYS.step(3)),
        startHereFacts(),
      ]);
      const crossed = ([1, 2, 3] as const).filter((_, i) => !![c1, c2, c3][i]);
      // a session running now has started, even before its event is written
      const sessions = [f.firstSession, running?.startedAt ?? null].filter((x): x is number => x != null);
      const now = Date.now();
      const s = startHere({
        now, since: since ? Number(since) : null, off: !!off, crossed,
        tasks: f.tasks, firstDone: f.firstDone, firstSession: sessions.length ? Math.min(...sessions) : null, lastShown: f.lastShown,
      });
      if (s.retire) await setFlag(START_KEYS.off, s.retire);
      if (s.begin) await setFlag(START_KEYS.since, String(s.begin));
      for (const n of s.newly) await setFlag(START_KEYS.step(n), String(now));
      if (live) setState(s);
    })().catch(() => {});
    return () => { live = false; };
  }, [active, tasks, wins, running?.id]);

  const skip = async () => {
    setSkipped(true);
    await setFlag(START_KEYS.off, 'skipped');
  };
  return { ...state, show: active && state.show && !skipped, skip };
}

type Start = ReturnType<typeof useStartHere>;

const STEPS: { n: StartStep; title: string; who: CharacterName; button: string; said: string }[] = [
  { n: 1, title: 'Put it all down', who: 'nu-listen', button: 'Tell Nu', said: 'Tell Nu' },
  { n: 2, title: 'Let Ra pick one', who: 'ra-hello', button: 'Pick one', said: 'Let Ra pick one' },
  { n: 3, title: 'Begin · 5 minutes', who: 'ra-sun', button: 'Begin', said: 'Begin, 5 minutes' },
];

/** What each step's button does: Tell Nu; Focus on the planner's pick; that pick in the timer for five minutes. */
function useStepActions() {
  const now = useStore(s => s.now);
  const first = useStore(s => s.decisions[0]?.task ?? null);
  const focusOn = useStore(s => s.focusOn);
  // the one next-action engine: what's chosen or first on Today, else the planner's first
  const pick: Task | null = now ?? first;
  const run = async (n: StartStep) => {
    Haptics.selectionAsync();
    if (n === 1) { useStore.setState({ telling: true }); return; }
    if (!pick) return;
    if (n === 2) { await focusOn(pick.id); return; }
    // as onboarding's Start does: what you start is on your Today
    await pickForToday(pick.id, true);
    await focusOn(pick.id);
    router.push({ pathname: '/timer', params: { id: pick.id, mins: '5' } });
  };
  return { pick, run };
}

/**
 * START HERE on Home: three steps you do, each crossed off when it's done.
 * Stacked on a phone; side by side on the desktop (`row`).
 */
export function StartHere({ start, row }: { start: Start; row?: boolean }) {
  const t = useTheme();
  const { pick, run } = useStepActions();
  if (!start.show) return null;
  const can = (n: StartStep) => n === 1 || !!pick;
  // the task Ra picked, on the step that begins it
  const line = (n: StartStep) => (n === 3 && start.done[1] && pick ? pick.title : null);

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: row ? 12 : 10 }}>
      {row ? <Label>Start here</Label> : (
        <Text accessibilityRole="header" style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display }}>START HERE</Text>
      )}
      {row ? <LinkButton label="Skip" accessibilityLabel="Skip Start here" size={14} onPress={start.skip} /> : (
        <Pressable onPress={start.skip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip Start here">
          <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Skip</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View>
      {head}
      <View style={{ flexDirection: row ? 'row' : 'column', gap: row ? 16 : 8 }}>
        {STEPS.map(s => {
          const done = start.done[s.n - 1];
          const props = { step: s, done, current: start.current === s.n, line: line(s.n), enabled: can(s.n), onPress: () => run(s.n) };
          return row ? <DeskStep key={s.n} {...props} /> : <PhoneStep key={s.n} {...props} />;
        })}
      </View>
    </View>
  );
}

type StepProps = {
  step: (typeof STEPS)[number]; done: boolean; current: boolean; line: string | null; enabled: boolean; onPress: () => void;
};

const said = ({ step, done, line }: StepProps) =>
  [`Step ${step.n} of 3`, step.title, line, done ? 'done' : null].filter(Boolean).join(', ');

/** A phone's step: the character, the step, one button; crossed off, a coral check and a quiet title. */
function PhoneStep(p: StepProps) {
  const t = useTheme();
  const { step, done, line } = p;
  return (
    <View accessible={done} accessibilityLabel={done ? said(p) : undefined}
      style={{ minHeight: 64, borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 9, paddingRight: 12, paddingVertical: 8 }}>
      <View {...decorative} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash, opacity: done ? 0.5 : 1 }}>
        <Image source={poseImage(step.who)} resizeMode="contain" style={{ width: 42, height: 42 }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: done ? t.ink3 : t.ink, fontSize: 16, fontFamily: T.brand, letterSpacing: -0.3, textDecorationLine: done ? 'line-through' : 'none' }}>{step.title}</Text>
        {!!line && !done && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand, marginTop: 1 }}>{line}</Text>}
      </View>
      {done ? <Check /> : <StepButton {...p} />}
    </View>
  );
}

/** The desktop's step: a card of its own, side by side with the others. */
function DeskStep(p: StepProps) {
  const t = useTheme();
  const { step, done, line } = p;
  return (
    <View style={{ flex: 1, minWidth: 0 }} accessible={done} accessibilityLabel={done ? said(p) : undefined}>
      <DeskCard style={{ flex: 1, paddingVertical: 18, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View {...decorative} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash, opacity: done ? 0.5 : 1 }}>
            <Image source={poseImage(step.who)} resizeMode="contain" style={{ width: 50, height: 50 }} />
          </View>
          {done && <Check />}
        </View>
        <Text numberOfLines={1} style={{ color: done ? t.ink3 : t.ink, fontSize: 19, fontFamily: T.display, letterSpacing: -0.5, marginTop: 14, textDecorationLine: done ? 'line-through' : 'none' }}>{step.title}</Text>
        <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 14.5, fontFamily: T.brand, marginTop: 3, minHeight: 20 }}>{!done && line ? line : ''}</Text>
        {!done && <View style={{ flexDirection: 'row', marginTop: 12 }}><StepButton {...p} /></View>}
      </DeskCard>
    </View>
  );
}

/** One button a step: filled for the step you're on, outlined for the ones after it. */
function StepButton({ step, current, enabled, onPress, line }: StepProps) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!enabled} hitSlop={6}
      accessibilityRole="button" accessibilityLabel={[step.said, line].filter(Boolean).join(', ')}
      aria-disabled={!enabled}
      style={({ pressed }) => ({
        height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: current ? t.nu : 'transparent', borderWidth: current ? 0 : 1, borderColor: t.strokeStrong,
        opacity: enabled ? 1 : 0.4, transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <Text style={{ color: current ? t.onNu : t.ink, fontSize: 14.5, fontFamily: T.display }}>{step.button}</Text>
    </Pressable>
  );
}

/** Crossed off: a coral check. */
function Check() {
  return (
    <View {...decorative} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center', opacity: 0.85 }}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3B1204" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}
