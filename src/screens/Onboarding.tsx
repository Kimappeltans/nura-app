import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { logEvent, setBlockers, suggestions, getTask, pickForToday, getFlag, setFlag, type Blocker, type Task, type PickRule } from '../db';
// The Benben opening, then the original Welcome. To go back to the Welcome
// on its own, import './Welcome' here instead — both are kept.
import Welcome from './WelcomeBenben';
import Blockers from './Blockers';
import BrainDump from './BrainDump';
import RemindAsk from './RemindAsk';
import ProfileStep from './ProfileStep';
import OneRises from './OneRises';
import Auth from './Auth';

/**
 * From opening the app to starting one real task in about a minute
 * (SCOPE.md → Onboarding):
 *
 *   1. WELCOME        — the story: Nu (the water), the Benben, Ra (the sun).
 *   2. BLOCKERS       — "What usually gets in the way?" Each answer changes
 *                        something, and says what.
 *   3. BRAIN DUMP     — "What's on your mind?" Nu, learned by using it.
 *   4. REMINDERS      — only if "remembering" was picked, iPhone only.
 *   5. PROFILE        — "Create your profile", now that there's a list to
 *                        keep. Skippable; not shown when already signed in.
 *   6. ONE RISES      — your tasks sink, the sun rises, Ra suggests one and
 *                        you can pick another. Start it.
 *
 * The metaphor used to be explained on its own screen before you had written
 * anything down; now it happens to your own tasks. Every step can be
 * skipped, and each is logged as an `onboarding` event so the
 * first-minute funnel can be read back (SCOPE.md → Measure).
 */
type Step = 'welcome' | 'blockers' | 'dump' | 'remind' | 'profile' | 'rise' | 'auth';

export default function Onboarding() {
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const refresh = useStore(s => s.refresh);
  const focusOn = useStore(s => s.focusOn);
  const toNu = useStore(s => s.toNu);
  const session = useStore(s => s.session);

  const [step, setStep] = useState<Step>('welcome');
  const [picks, setPicks] = useState<Blocker[]>([]);
  const [rise, setRise] = useState<{ tasks: Task[]; pick: Task; rule: PickRule } | null>(null);
  const t0 = useRef(Date.now());
  const dumped = useRef<string[]>([]);   // held across the reminders detour
  // Dev only, like `dev.open` in app/_layout.tsx: start on the step named in
  // the flag `dev.onb`, to check each step's layout on a simulator.
  useEffect(() => {
    if (!__DEV__) return;
    (async () => {
      const s = (await getFlag('dev.onb')) as Step | null;
      if (!s) return;
      await setFlag('dev.onb', '');
      if (s === 'rise') {
        dumped.current = useStore.getState().inbox.map(x => x.id);
        return toRise(dumped.current);
      }
      setStep(s);
    })();
  }, []);

  const log = (s: string, meta: object = {}) =>
    logEvent('onboarding', undefined, { step: s, ms: Date.now() - t0.current, ...meta });

  const toRise = async (ids: string[]) => {
    const tasks = (await Promise.all(ids.map(getTask))).filter((x): x is Task => !!x);
    // the engine only suggests — the screen lets you pick a different one
    const p = (await suggestions(1))[0];
    if (!p) return finish(false);
    setRise({ tasks, pick: p.task, rule: p.rule });
    setStep('rise');
  };

  // after the brain dump (and reminders): the profile ask, unless there's
  // already an account, then the list rises — or Nu, if nothing was written
  const afterDump = () => (session ? afterProfile() : setStep('profile'));
  const afterProfile = () => (dumped.current.length ? toRise(dumped.current) : finish(false));

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
      <Blockers onBack={() => setStep('welcome')} onNext={async picked => {
        setPicks(picked);
        await setBlockers(picked);
        await log('blockers', { picked });
        setStep('dump');
      }} />
    );
  }

  if (step === 'dump') {
    return (
      <BrainDump onBack={() => setStep('blockers')} onNext={async ids => {
        await log('dump', { captured: ids.length });
        await refresh();
        dumped.current = ids;
        if (ids.length && picks.includes('remembering') && Platform.OS !== 'web') return setStep('remind');
        return afterDump();
      }} />
    );
  }

  if (step === 'remind') {
    return (
      <RemindAsk onDone={async granted => {
        await log('remind', { granted });
        afterDump();
      }} />
    );
  }

  if (step === 'profile') {
    return (
      <ProfileStep onDone={async () => {
        await log('profile', { signedIn: !!useStore.getState().session });
        afterProfile();
      }} />
    );
  }

  if (step === 'rise' && rise) {
    return (
      <OneRises tasks={rise.tasks} pick={rise.pick}
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
