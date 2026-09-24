import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { logEvent, setBlockers, suggestions, getTask, getEnergy, pickForToday, type Blocker, type Task, type PickRule } from '../db';
import { whyLine } from '../priority';
import Welcome from './Welcome';
import Blockers from './Blockers';
import BrainDump from './BrainDump';
import RemindAsk from './RemindAsk';
import OneRises from './OneRises';
import Auth from './Auth';

/**
 * From opening the app to starting one real task in about a minute
 * (SCOPE.md → Onboarding):
 *
 *   1. WELCOME        — Nu and Ra, the slogan.
 *   2. BLOCKERS       — "What usually gets in the way?" Each answer changes
 *                        something, and says what.
 *   3. BRAIN DUMP     — "What's on your mind?" Nu, learned by using it.
 *   4. REMINDERS      — only if "remembering" was picked, iPhone only.
 *   5. ONE RISES      — your tasks sink, the sun rises, Ra lifts one. Start it.
 *
 * The metaphor used to be explained on its own screen before you had written
 * anything down; now it happens to your own tasks. Sign-in isn't a step any
 * more — an account only adds sync, so it lives on the welcome screen's
 * "Sign in" link (for people who already have one) and in Settings. Every
 * step can be skipped, and each is logged as an `onboarding` event so the
 * first-minute funnel can be read back (SCOPE.md → Measure).
 */
type Step = 'welcome' | 'blockers' | 'dump' | 'remind' | 'rise' | 'auth';

export default function Onboarding() {
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const refresh = useStore(s => s.refresh);
  const focusOn = useStore(s => s.focusOn);
  const toNu = useStore(s => s.toNu);

  const [step, setStep] = useState<Step>('welcome');
  const [picks, setPicks] = useState<Blocker[]>([]);
  const [rise, setRise] = useState<{ tasks: Task[]; pick: Task; rule: PickRule; why: string | null } | null>(null);
  const t0 = useRef(Date.now());
  const dumped = useRef<string[]>([]);   // held across the reminders detour
  const log = (s: string, meta: object = {}) =>
    logEvent('onboarding', undefined, { step: s, ms: Date.now() - t0.current, ...meta });

  const toRise = async (ids: string[]) => {
    const tasks = (await Promise.all(ids.map(getTask))).filter((x): x is Task => !!x);
    // the engine only suggests — the screen lets you pick a different one
    const p = (await suggestions(1))[0];
    if (!p) return finish(false);
    setRise({ tasks, pick: p.task, rule: p.rule, why: whyLine(p.rule, p.task, await getEnergy()) });
    setStep('rise');
  };

  const finish = async (start: boolean, picked?: Task) => {
    const task = picked ?? rise?.pick;
    await log('done', { started: start, changedPick: !!picked && picked.id !== rise?.pick.id });
    await finishOnboarding();
    if (start && task) {
      await pickForToday(task.id, true);     // what you start is on your Today
      await focusOn(task.id);
      router.push({ pathname: '/timer', params: { id: task.id, mins: '5' } });
    } else {
      await toNu();
    }
  };

  if (step === 'auth') {
    return <Auth onClose={finishOnboarding} onBack={() => setStep('welcome')} />;
  }

  if (step === 'blockers') {
    return (
      <Blockers onNext={async picked => {
        setPicks(picked);
        await setBlockers(picked);
        await log('blockers', { picked });
        setStep('dump');
      }} />
    );
  }

  if (step === 'dump') {
    return (
      <BrainDump onNext={async ids => {
        await log('dump', { captured: ids.length });
        await refresh();
        if (!ids.length) return finish(false);
        dumped.current = ids;
        if (picks.includes('remembering') && Platform.OS !== 'web') return setStep('remind');
        return toRise(ids);
      }} />
    );
  }

  if (step === 'remind') {
    return (
      <RemindAsk onDone={async granted => {
        await log('remind', { granted });
        await toRise(dumped.current);
      }} />
    );
  }

  if (step === 'rise' && rise) {
    return (
      <OneRises tasks={rise.tasks} pick={rise.pick} why={rise.why}
        onStart={task => finish(true, task)} onEverything={() => finish(false)} />
    );
  }

  return (
    <Welcome
      onNext={async () => { await log('welcome'); setStep('blockers'); }}
      onSignIn={() => setStep('auth')}
    />
  );
}
