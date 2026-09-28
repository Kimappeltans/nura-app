import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTheme, useStore } from '../src/store';
import { complete, endSession, logEvent, capture, dropCrumb, getFlag, getTask, updateTask, type Task } from '../src/db';
import { writeFocusBlock } from '../src/calendar';
import { reconcileNudges } from '../src/notifications';
import { stepForTask } from '../src/projects';
import { Primary, Ghost, Mica, poseImage } from '../src/ui';
import { type as T, copy, radius, doneGround, doneStops } from '../src/theme';
import { DotMatrix } from '../src/components/DotMatrix';
import { Sun } from '../src/components/Handoff';
import { Moving } from '../src/components/Moving';
import { announce, decorative, spokenDuration } from '../src/a11y';
import { useScreen, useDesk, STAGE } from '../src/screen';

const CORAL = '#FF6B35';
const ON_CORAL = '#3B1204';
const INK_NU = '#1B1830';
const CREAM = '#FAF7F0';

const mmss = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

/** Break length follows the session that earned it — a five-minute dash and a
 *  forty-five-minute block don't deserve the same pause. Roughly the Pomodoro
 *  ratios, not because Pomodoro is sacred but because they're already tested. */
function breakMinutesFor(sessionMins: number) {
  if (sessionMins <= 5) return 2;
  if (sessionMins <= 15) return 3;
  if (sessionMins <= 25) return 5;
  return 10;
}

/**
 * IN SESSION (design/nura-journey-blend-v5.html, 9:36) and DONE (9:45).
 *
 * The chosen-length contract: at the end of the span it asks permission to
 * STOP, with "keep going" as the loud option — quitting is allowed, so
 * beginning costs nothing. Stopping early still counts: it pays light, because
 * time spent is the achievement; only Done finishes the task.
 *
 * The session lives in the store (store.running), not here: ⌄ leaves it
 * running, as the pill above the tab bar, and coming back picks it up.
 */
function Timer() {
  const t = useTheme();
  const { width, height } = useScreen();
  // a wide web window: still one thing, centred; the way out stays top left
  const desk = useDesk();
  const stage = desk ? { flex: 1, width: '100%', maxWidth: STAGE + 48, alignSelf: 'center', paddingHorizontal: 24 } as const : null;
  // the window's own insets: inside a full-screen modal the safe-area view can
  // report none on iOS, and the top row slid under the status bar
  const insets = useSafeAreaInsets();
  const safe = { flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom } as const;
  // `dev=done` (dev builds only) opens straight on Done, for screenshots
  const { id, mins, dev } = useLocalSearchParams<{ id?: string; mins?: string; dev?: string }>();
  const devDone = __DEV__ && dev === 'done';
  const refresh = useStore(s => s.refresh);
  const celebrate = useStore(s => s.celebrate);
  const next = useStore(s => s.now);          // what Nu has next, once this one is done
  const focusOn = useStore(s => s.focusOn);
  const toNu = useStore(s => s.toNu);
  const running = useStore(s => s.running);
  const setRunning = useStore(s => s.setRunning);
  const pauseRunning = useStore(s => s.pauseRunning);
  const resumeRunning = useStore(s => s.resumeRunning);

  // mins=0 is an open session: no countdown, it runs until you say done
  // no length, or 0: an open session, however long the task is; a length only when a timer was chosen
  const open = !mins || Number(mins) === 0;
  const initial = (open ? 0 : Number(mins) || 5) * 60;

  // The task actually being timed — NOT store.now, which the engine can
  // re-point at a different task the moment anything else changes.
  const [task, setTask] = useState<Task | null>(null);
  const [asking, setAsking] = useState(false);
  const [catching, setCatching] = useState(false);
  const [thought, setThought] = useState('');
  const [parkFocus, setParkFocus] = useState(false);
  // 'work' is the task itself; 'breakOffer' is Done; 'break' is the pause running
  const [phase, setPhase] = useState<'work' | 'breakOffer' | 'break'>(devDone ? 'breakOffer' : 'work');
  const [spent, setSpent] = useState(devDone ? Number(mins ?? 0) : 0);      // minutes, for Done
  const [breakEnd, setBreakEnd] = useState(0);
  const [, setTick] = useState(0);
  // Settings → Focus: the break ('' follows the session, a number of minutes,
  // or 'off'), and whether the screen stays on while the clock runs
  const [breakPref, setBreakPref] = useState('');
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    getFlag('focus.break').then(v => setBreakPref(v ?? ''));
    getFlag('focus.awake').then(v => setAwake(v === '1'));
  }, []);
  useEffect(() => {
    if (!awake || phase === 'breakOffer') return;
    activateKeepAwakeAsync('nura.focus').catch(() => {});
    return () => { deactivateKeepAwake('nura.focus').catch(() => {}); };
  }, [awake, phase]);

  // begin — or pick up the session that's already running for this task. The
  // task is read first: a done one is never begun again, it goes home (the web
  // reloading on Done lands back here with the same id and nothing running).
  useEffect(() => {
    if (!id) return;
    const r = useStore.getState().running;
    const fresh = !r || r.id !== id;
    const now = Date.now();     // the clock starts here, not when the read comes back
    let live = true;
    getTask(id).then(tk => {
      if (!live) return;
      if (fresh && tk?.state === 'done') { goBack(); return; }
      setTask(tk);
      if (fresh) {
        setRunning({ id, title: tk?.title ?? '', startedAt: now, endAt: open ? null : now + initial * 1000, span: initial, pausedAt: null });
        logEvent('started', id);
        // the estimate as it stood when you began — est_minutes gets edited in
        // place later, so this is the only record of the guess being tested
        logEvent('session_start', id, { planned: Math.round(initial / 60), est: tk?.est_minutes ?? null });
        // tier 2 in the NOW engine ("already started"), so coming back resumes this one
        updateTask(id, { state: 'doing' });
      } else {
        const cur = useStore.getState().running;
        if (tk && cur && cur.id === id && !cur.title) setRunning({ ...cur, title: tk.title });
      }
      (globalThis as any).__nuraRunning?.(id);
    });
    return () => { live = false; };
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The clock is wall time (store.running), so this only has to redraw — it
  // can miss ticks (iOS throttles hard when the screen dims) without drifting.
  useEffect(() => {
    const h = setInterval(() => setTick(n => n + 1), 250);
    return () => clearInterval(h);
  }, []);

  const r = running && running.id === id ? running : null;
  const at = r?.pausedAt ?? Date.now();
  // until that read is back there's no session yet: the clock shows its full length, not 00:00
  const left = r?.endAt ? Math.max(0, Math.round((r.endAt - at) / 1000)) : (r || task ? 0 : initial);
  const elapsed = r ? Math.max(0, Math.round((at - r.startedAt) / 1000)) : 0;
  const span = r?.span ?? initial;
  const paused = !!r?.pausedAt;

  // the end of the span: ask
  useEffect(() => {
    if (phase === 'work' && r?.endAt && left === 0 && !asking) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAsking(true);
      announce(copy.contract(Math.max(1, Math.round(elapsed / 60))));
    }
  }, [left, phase, r?.endAt]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the break just ends
  const breakLeft = phase === 'break' ? Math.max(0, Math.round((breakEnd - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (phase === 'break' && breakEnd && breakLeft === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      announce('Your break is over');
      goBack();
    }
  }, [breakLeft, phase, breakEnd]);

  const runWork = (secs: number) => {
    setAsking(false);
    const cur = useStore.getState().running;
    if (cur) setRunning({ ...cur, endAt: Date.now() + secs * 1000, span: secs, pausedAt: null });
  };
  const runBreak = (secs: number) => { setPhase('break'); setBreakEnd(Date.now() + secs * 1000); };

  /**
   * Ends the WORK session — banks the award, then shows Done (with a break on
   * offer) or goes straight back. `done` finishes the task; otherwise the
   * session ends and the task stays open (db.endSession), still paying for the
   * time. `offerBreak` is false for the mid-session Stop (a breadcrumb covers
   * that exit).
   */
  const finish = async (done: boolean, offerBreak = false) => {
    const cur = useStore.getState().running;
    const startedAt = cur && cur.id === id ? cur.startedAt : Date.now();
    const endedAt = cur?.pausedAt ?? Date.now();
    setRunning(null);
    (globalThis as any).__nuraRunning?.(null);
    if (id) {
      const minutes = Math.round((endedAt - startedAt) / 6000) / 10;
      setSpent(Math.max(1, Math.round(minutes)));
      await logEvent('session_end', id, { minutes, planned: Math.round(span / 60), est: task?.est_minutes ?? null, done });
      const award = done ? await complete(id) : await endSession(id);
      celebrate(award);
      // two-way sync, if it's on: the time spent lands next to the meetings.
      // Fails silently — a calendar problem must never spoil finishing something.
      if ((await getFlag('sync.calendar')) === 'two' && task?.title) {
        writeFocusBlock(task.title, startedAt, endedAt).catch(() => {});
      }
    }
    await refresh();
    await reconcileNudges();
    // a project's move, done: Nu can find the next one (or you stop there)
    const proj = done && id ? await stepForTask(id) : null;
    if (proj && proj.project.state === 'active') {
      router.replace({ pathname: '/project/[id]', params: { id: proj.project.id, after: 'done' } });
      return;
    }
    if (offerBreak) { setPhase('breakOffer'); return; }
    goBack();
  };

  const stopHere = async () => {
    if (id) await dropCrumb(id);
    if (thought.trim()) await capture(thought.trim());
    finish(false, false);
  };

  const stash = async () => {
    if (!thought.trim()) return;
    await capture(thought);          // straight into Nu; the clock keeps running
    setThought(''); setCatching(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const breakMins = Number(breakPref) > 0 ? Number(breakPref)
    : breakMinutesFor(open ? Math.max(1, Math.round(elapsed / 60)) : Math.round(initial / 60));

  // Done arrives: say what the screen says
  useEffect(() => {
    if (phase === 'breakOffer') announce(`You did it together. ${task?.title ?? ''}, ${spent} minute${spent === 1 ? '' : 's'}`);
  }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────── DONE — warm light, together ───────────── */
  if (phase === 'breakOffer') {
    const hasNext = !!next && next.id !== id;
    return (
      <View style={{ flex: 1, backgroundColor: doneGround[1] }}>
        {/* white into a light orange, so Ra and Nu stand out (the one gradient — guidelines, rule 1) */}
        <LinearGradient colors={doneGround} locations={doneStops} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={safe}>
          {(() => {
            const out = (
              <Pressable onPress={async () => { await toNu(); goBack(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to Nu" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                <Text style={{ color: ON_CORAL, fontSize: 15, fontFamily: T.display }}>← Back to Nu</Text>
              </Pressable>
            );
            const headline = (
              <>
                <Text accessibilityRole="header" accessibilityLabel="You did it together." style={{ color: ON_CORAL, fontSize: desk ? 64 : 50, lineHeight: desk ? 65 : 51, letterSpacing: desk ? -2.8 : -2.2, fontFamily: T.display, marginTop: 14 }}>You did it</Text>
                <Text {...decorative} style={{ color: 'rgba(59,18,4,0.6)', fontSize: desk ? 64 : 50, lineHeight: desk ? 65 : 51, letterSpacing: desk ? -2.8 : -2.2, fontFamily: T.display }}>together.</Text>
                <Text numberOfLines={1} style={{ color: 'rgba(59,18,4,0.72)', fontSize: 16, fontFamily: T.brand, marginTop: 10 }}>
                  {task?.title ?? ''} · {spent} minute{spent === 1 ? '' : 's'}
                </Text>
              </>
            );
            const scene = (
              <View {...decorative} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                <View style={{ width: 300, height: 300 }}>
                  <View style={{ position: 'absolute', left: -24, top: -24 }}><Sun size={340} /></View>
                  <Moving name="ra-pebble" style={{ position: 'absolute', left: 50, top: 20, width: 220, height: 220 }} />
                  <Image source={poseImage('nu-hello')} resizeMode="contain" style={{ position: 'absolute', left: 4, top: 140, width: 120, height: 120 }} />
                </View>
              </View>
            );
            const after = (
              <View style={{ paddingHorizontal: stage ? 0 : 24, paddingBottom: desk ? 40 : 18, gap: 16 }}>
                {hasNext && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    <Pressable onPress={async () => { await focusOn(next!.id); goBack(); }} accessibilityRole="button" accessibilityLabel={`Next: ${next!.title}${next!.est_minutes ? `, ${next!.est_minutes} min` : ''}`}
                      style={({ pressed }) => ({ width: 96, height: 96, borderRadius: 48, backgroundColor: INK_NU, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                      <Text style={{ color: CREAM, fontSize: 18, fontFamily: T.display }}>Next</Text>
                    </Pressable>
                    <View style={{ flex: 1, gap: 3 }}>
                      {!!next!.est_minutes && <Text style={{ color: 'rgba(59,18,4,0.72)', fontSize: 12, fontFamily: T.display }}>{next!.est_minutes} min</Text>}
                      <Text numberOfLines={2} style={{ color: ON_CORAL, fontSize: 19, fontFamily: T.display, letterSpacing: -0.4 }}>{next!.title}</Text>
                    </View>
                  </View>
                )}
                {!hasNext && breakPref !== 'off' && (
                  <Pressable onPress={() => runBreak(breakMins * 60)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                    <Text style={{ color: ON_CORAL, fontSize: 14.5, fontFamily: T.display, opacity: 0.8 }}>Take a {breakMins}-minute break</Text>
                  </Pressable>
                )}
              </View>
            );
            if (stage) {
              return (
                <>
                  <View style={{ paddingHorizontal: 32, paddingTop: 24 }}>{out}</View>
                  <View style={stage}>{headline}{scene}{after}</View>
                </>
              );
            }
            return (
              <>
                <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>{out}{headline}</View>
                {scene}
                {after}
              </>
            );
          })()}
        </View>
      </View>
    );
  }

  const onBreak = phase === 'break';
  const progress = onBreak ? 1 - breakLeft / Math.max(1, breakMins * 60)
    : open ? Math.min(1, elapsed / ((task?.est_minutes || 25) * 60))
    : asking ? 1 : 1 - left / Math.max(1, span);
  const shown = onBreak ? breakLeft : open ? elapsed : left;
  const words = (onBreak ? 'Step away' : task?.title ?? '').split(' ');
  const cut = words.length >= 4 ? Math.ceil(words.length / 2) : words.length;
  const ring = desk ? Math.max(260, Math.min(360, height - 470)) : Math.min(300, width - 48);

  /* ───────────── IN SESSION — cream, Ra on the ring ───────────── */
  return (
    <View style={[safe, { backgroundColor: t.base }]}>
      <Mica />
      {/* the way out, top left: it keeps running, as the pill above the tabs */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: desk ? 32 : 20, paddingTop: desk ? 24 : 8, height: desk ? 72 : 56 }}>
        <Pressable onPress={async () => { Haptics.selectionAsync(); if (!onBreak) await toNu(); goBack(); }} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Keep it running and go back"
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.layer, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 9l6 6 6-6" fill="none" stroke={t.ink2} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Pressable>
        <View {...decorative} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.layer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image source={poseImage('ra-icon')} style={{ width: 42, height: 42, marginTop: 5 }} resizeMode="contain" />
        </View>
      </View>

      <View style={stage ? [stage, { justifyContent: 'center', paddingBottom: 72 }] : { flex: 1, paddingHorizontal: 24 }}>
        <Text accessibilityRole="header" accessibilityLabel={words.join(' ')} style={{ color: t.ink, fontSize: 30, lineHeight: 31, fontFamily: T.display, letterSpacing: -1.3, marginTop: 6 }}>
          {words.slice(0, cut).join(' ')}
        </Text>
        {cut < words.length && (
          <Text {...decorative} style={{ color: t.mute ?? t.ink3, fontSize: 30, lineHeight: 31, fontFamily: T.display, letterSpacing: -1.3 }}>
            {words.slice(cut).join(' ')}
          </Text>
        )}

        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <Ring size={ring} progress={progress} tone={onBreak ? 'nu' : 'ra'}>
            <DotMatrix text={mmss(shown)} dot={ring / 48} color={t.ink} muted="rgba(23,19,19,0.22)" muteLeadingZeros
              label={onBreak ? `${spokenDuration(shown)} of break left` : open ? `${spokenDuration(shown)} so far` : `${spokenDuration(shown)} left`} />
            <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand, marginTop: 12 }}>
              {onBreak ? `break · ${breakMins} min` : paused ? 'paused' : open ? 'so far' : `of ${Math.round(span / 60)} min`}
            </Text>
          </Ring>
        </View>

        {onBreak ? (
          <View style={{ marginTop: 28 }}>
            <Ghost label="Skip the rest of the break" onPress={() => goBack()} />
          </View>
        ) : asking ? (
          <View style={{ gap: 10, marginTop: 22 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: t.ink2, fontSize: 14.5, textAlign: 'center', lineHeight: 21 }}>
              {copy.contract(Math.max(1, Math.round(elapsed / 60)))}
            </Text>
            <Primary label="Keep going · 10 more" tone="ra" onPress={() => runWork(10 * 60)} />
            <Ghost label={copy.stop} onPress={async () => { if (id) await dropCrumb(id); finish(false, true); }} />
            <Ghost label="It's done" onPress={() => finish(true, true)} />
          </View>
        ) : (
          <>
            {/* Stop · Pause · Done */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 26, marginTop: 24 }}>
              <RoundButton label="Stop" size={58} fill={t.layer} onPress={stopHere}>
                <Path d="M6 6l12 12M18 6L6 18" stroke={t.ink} strokeWidth={2} strokeLinecap="round" />
              </RoundButton>
              <RoundButton label={paused ? 'Resume' : 'Pause'} size={84} fill={CORAL} onPress={() => { Haptics.selectionAsync(); paused ? resumeRunning() : pauseRunning(); }}>
                {paused
                  ? <Path d="M8 5.5v13l10.5-6.5z" fill={ON_CORAL} />
                  : <><Rect x={5.5} y={4} width={4.5} height={16} rx={1.6} fill={ON_CORAL} /><Rect x={14} y={4} width={4.5} height={16} rx={1.6} fill={ON_CORAL} /></>}
              </RoundButton>
              <RoundButton label="Done" size={58} fill={INK_NU} onPress={() => finish(true, true)}>
                <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={CREAM} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </RoundButton>
            </View>

            {/* a thought arrives mid-task: one tap parks it in Nu without leaving */}
            {catching ? (
              <TextInput autoFocus value={thought} onChangeText={setThought} onSubmitEditing={stash} returnKeyType="done"
                placeholder="park it and keep going…" placeholderTextColor={t.ink3}
                accessibilityLabel="A thought to park"
                onFocus={() => setParkFocus(true)} onBlur={() => setParkFocus(false)}
                style={{
                  marginTop: 14, color: t.ink, fontSize: 15, paddingVertical: 13, paddingHorizontal: 14,
                  // focused, the edge is ink3 (5.3:1), so you can see where you're typing
                  backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: parkFocus ? t.ink3 : t.strokeStrong,
                }} />
            ) : (
              <Pressable onPress={() => setCatching(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="A thought just arrived"
                style={{ alignSelf: 'center', marginTop: 8, paddingVertical: 4 }}>
                <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>+ a thought just arrived</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * THE TIMER RING (guidelines/components/overview.md): 60 ticks round a light
 * disc; the ones behind you coral and longer; Ra resting on the ring where you
 * are.
 */
function Ring({ size, progress, tone, children }: { size: number; progress: number; tone: 'ra' | 'nu'; children: React.ReactNode }) {
  const t = useTheme();
  const c = size / 2, R = size * 0.4267, N = 60;
  const on = tone === 'nu' ? '#171313' : CORAL;
  const a = -Math.PI / 2 + progress * Math.PI * 2;
  const raSize = size * 0.21;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={R - size * 0.073} fill={t.layer} stroke="rgba(23,19,19,0.08)" strokeWidth={1} />
        {Array.from({ length: N }, (_, i) => {
          const ang = -Math.PI / 2 + (i / N) * Math.PI * 2, lit = i / N < progress, big = i % 5 === 0;
          const r1 = R - (big ? 12 : 7), r2 = R + (lit ? 4 : 0);
          return (
            <Line key={i} x1={c + r1 * Math.cos(ang)} y1={c + r1 * Math.sin(ang)} x2={c + r2 * Math.cos(ang)} y2={c + r2 * Math.sin(ang)}
              stroke={lit ? on : 'rgba(23,19,19,0.30)'} strokeWidth={lit ? 3 : 1.6} strokeLinecap="round" />
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      <Image {...decorative} source={poseImage('ra-rest')} resizeMode="contain"
        style={{ position: 'absolute', width: raSize, height: raSize, left: c + (R + 6) * Math.cos(a) - raSize / 2, top: c + (R + 6) * Math.sin(a) - raSize * 0.62 }} />
    </View>
  );
}

function RoundButton({ label, size, fill, onPress, children }: { label: string; size: number; fill: string; onPress: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24">{children}</Svg>
      </Pressable>
      <Text {...decorative} style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand }}>{label}</Text>
    </View>
  );
}

export default inWorld('ra', Timer);
