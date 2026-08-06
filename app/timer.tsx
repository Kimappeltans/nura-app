import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { complete, logEvent, capture, dropCrumb, getFlag, getTask, updateTask, type Task } from '../src/db';
import { writeFocusBlock } from '../src/calendar';
import { reconcileNudges } from '../src/notifications';
import { Primary, Ghost, Mica, Character } from '../src/ui';
import { type as T, copy, radius } from '../src/theme';

const FIVE = 5 * 60;
const R = 89, C = 2 * Math.PI * R;

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
 * The 5-minute contract — now a chosen-length contract.
 *
 * At the end of the chosen span it asks permission to STOP, with "keep going"
 * as the loud option. Counter-intuitively that's what makes starting cheap:
 * quitting is allowed, so beginning costs nothing.
 *
 * And stopping early still logs a win, and still pays light. Time spent is the
 * achievement, not task completion — the most important behaviour in the app.
 */
export default function Timer() {
  const t = useTheme();
  const { id, mins } = useLocalSearchParams<{ id?: string; mins?: string }>();
  const refresh = useStore(s => s.refresh);
  const celebrate = useStore(s => s.celebrate);

  const initial = (Number(mins) || 5) * 60;

  // `span` is the length of the CURRENT run — work or break, they share the
  // same clock. Without it, "keep going · 10 more" set 600 seconds against a
  // 300-second denominator and the ring drew itself twice round backwards.
  const startedAt = useRef(Date.now());
  const [span, setSpan] = useState(initial);
  const [left, setLeft] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [catching, setCatching] = useState(false);
  const [thought, setThought] = useState('');
  // 'work' is the task itself; 'breakOffer' asks; 'break' is the pause running.
  const [phase, setPhase] = useState<'work' | 'breakOffer' | 'break'>('work');
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // The task actually being timed — NOT store.now. `now` is the engine's
  // independently-recomputed "best next pick," which can point at a
  // different task the moment anything else changes state (e.g. the app
  // refreshes on foreground). Reading it here meant the header — and the
  // calendar write below — could silently show or log the wrong task.
  const [task, setTask] = useState<Task | null>(null);
  useEffect(() => { if (id) getTask(id).then(setTask); }, [id]);

  /**
   * Driven off wall-clock time rather than by decrementing a counter once per
   * tick. setInterval is not a clock — it drifts, and iOS throttles it hard the
   * moment the screen dims, so a counting-down integer ends a "five minute"
   * session several minutes late. Comparing against a fixed end timestamp is
   * correct even if the interval misses thirty ticks. `onZero` is what to do at
   * zero — the work clock asks whether to stop, the break clock just ends.
   */
  const run = (secs: number, onZero: () => void) => {
    setSpan(secs); setLeft(secs);
    const endAt = Date.now() + secs * 1000;
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(tick.current!);
        onZero();
      }
    }, 250);
  };

  const runWork = (secs: number) => {
    setAsking(false);
    run(secs, () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAsking(true);
    });
  };

  const runBreak = (secs: number) => {
    setPhase('break');
    run(secs, () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    });
  };

  useEffect(() => {
    if (id) {
      logEvent('started', id);
      // Promotes the task above pickNow()'s tier 3 ("picked for today") to
      // tier 2 ("already started") — this state was defined and documented
      // in the NOW engine's priority order but never actually written
      // anywhere, so backgrounding mid-session and returning could hand you
      // a completely different task instead of resuming this one.
      updateTask(id, { state: 'doing' });
    }
    (globalThis as any).__nuraRunning?.(id ?? null);
    runWork(initial);
    return () => {
      if (tick.current) clearInterval(tick.current);
      (globalThis as any).__nuraRunning?.(null);
    };
  }, [id]);

  /**
   * Ends the WORK session — banks the award, then either offers a break or
   * goes straight back. `offerBreak` is false for the "I have to leave"
   * abandon path (a breadcrumb already covers that exit) and true for every
   * genuine stop, early or on time — that's the moment a pause actually helps.
   */
  const finish = async (partial: boolean, offerBreak = false) => {
    if (tick.current) clearInterval(tick.current);
    (globalThis as any).__nuraRunning?.(null);
    if (id) {
      const award = await complete(id, partial);
      celebrate(award);
      // Two-way sync, if it was turned on: the time you actually spent lands in
      // the same calendar as the meetings that ate the rest of the day. Fails
      // silently — a calendar problem must never spoil finishing something.
      if ((await getFlag('sync.calendar')) === 'two' && task?.title) {
        writeFocusBlock(task.title, startedAt.current, Date.now()).catch(() => {});
      }
    }
    await refresh();
    await reconcileNudges();
    if (offerBreak) { setPhase('breakOffer'); return; }
    router.back();
  };

  const stash = async () => {
    if (!thought.trim()) return;
    await capture(thought);          // straight into Nu; the clock keeps running
    setThought(''); setCatching(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const progress = asking ? 1 : 1 - left / span;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const onBreak = phase === 'break';
  // The break earned is sized to the ORIGINAL contract, not any "keep going"
  // extension — but the "Phone quiet · N minutes" caption describes the run
  // that's actually counting down right now, which is `span`, not `initial`.
  // They're the same number until "Keep going · 10 more" is tapped; after
  // that, using `initial` here left the caption reading the old length while
  // the ring underneath it visibly counted down from a different one.
  const breakMins = breakMinutesFor(Math.round(initial / 60));
  const spanMinsNum = Math.round(span / 60);
  const ringColors = onBreak ? t.nuBtn : t.raBtn;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 6 }}>
        <Text style={{ color: t.ink, fontSize: 21, fontFamily: T.display, textAlign: 'center' }}>
          {onBreak ? 'Step away' : task?.title ?? 'Focus'}
        </Text>
        <Text style={{ color: t.ink3, fontSize: 12.5, marginBottom: 20 }}>
          {phase === 'breakOffer'
            ? "you earned it"
            : onBreak ? `Phone quiet · back in ${breakMins} minutes` : `Phone quiet · ${spanMinsNum} minutes`}
        </Text>

        {phase !== 'breakOffer' && (
          <>
            {/* an analog ring, not digits — a shrinking arc is felt, "4:12" is read and forgotten */}
            <View style={{ width: 206, height: 206, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={206} height={206} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
                <Defs>
                  <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={ringColors[0]} /><Stop offset="1" stopColor={ringColors[1]} />
                  </LinearGradient>
                </Defs>
                <Circle cx={103} cy={103} r={R} stroke={t.track} strokeWidth={9} fill="none" />
                <Circle cx={103} cy={103} r={R} stroke="url(#g)" strokeWidth={9} fill="none"
                  strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
              </Svg>
              <Text style={{ color: t.ink, fontSize: 42, fontFamily: T.displayLight }}>{mm}:{ss}</Text>
              <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 2, marginTop: 6 }}>
                {onBreak ? 'BREAK' : asking ? 'COMPLETE' : 'REMAINING'}
              </Text>
            </View>

            {asking && <Character name="ra-celebrate" size={104} motion="celebrate" />}
          </>
        )}

        {phase === 'breakOffer' && <Character name="ra-celebrate" size={128} motion="celebrate" />}

        {/* a thought arrives mid-task. one tap parks it in Nu without leaving Ra —
            the alternative is how a five-minute task becomes a forty-minute detour.
            Only during the work clock — mid-break there's nothing to park it from. */}
        {phase === 'work' && (catching ? (
          <View style={{ width: '100%', marginTop: 10 }}>
            <TextInput
              autoFocus value={thought} onChangeText={setThought}
              onSubmitEditing={stash} returnKeyType="done"
              placeholder="park it and keep going…" placeholderTextColor={t.ink3}
              style={{
                color: t.ink, fontSize: 15, paddingVertical: 13, paddingHorizontal: 14,
                backgroundColor: t.card, borderRadius: radius.md,
                borderWidth: 1, borderColor: t.strokeStrong, borderLeftWidth: 3, borderLeftColor: t.nu,
              }}
            />
          </View>
        ) : (
          <Pressable onPress={() => setCatching(true)} hitSlop={10} style={{ marginTop: 10 }}>
            <Text style={{ color: t.ink3, fontSize: 13.5 }}>+ a thought just arrived</Text>
          </Pressable>
        ))}

        <View style={{ width: '100%', gap: 10, marginTop: 22 }}>
          {phase === 'breakOffer' ? (
            <>
              <Text style={{ color: t.ink2, fontSize: 14.5, textAlign: 'center', marginBottom: 4, lineHeight: 21 }}>
                Nice work. Want a {breakMins}-minute break before the next thing?
              </Text>
              <Primary label={`Take ${breakMins} minutes`} tone="nu" onPress={() => runBreak(breakMins * 60)} />
              <Ghost label="Skip, back to everything" onPress={() => router.back()} />
            </>
          ) : onBreak ? (
            <Ghost label="Skip the rest of the break" onPress={() => router.back()} />
          ) : asking ? (
            <>
              <Text style={{ color: t.ink2, fontSize: 14.5, textAlign: 'center', marginBottom: 4, lineHeight: 21 }}>
                {copy.contract}
              </Text>
              <Primary label="Keep going · 10 more" tone="ra" onPress={() => runWork(10 * 60)} />
              {/* stopping on purpose is not the same as not starting */}
              <Ghost label={copy.stop} onPress={() => finish(true, true)} />
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ghost label="Stop" onPress={async () => {
                if (id) await dropCrumb(id, thought.trim() || undefined);
                // "Stop" always completes the task (see finish/complete — time
                // spent counts, whether or not the task is actually done) —
                // which means it's marked done in the same beat this crumb is
                // written. latestCrumb() excludes done tasks by design, so
                // that note would otherwise be saved somewhere nothing ever
                // reads again. Anything typed but not yet submitted goes into
                // the inbox instead, the same way "+ a thought just arrived"
                // does when you do submit it — so it's not silently lost.
                if (thought.trim()) await capture(thought.trim());
                finish(true, false);
              }} />
              <Ghost label="Done" onPress={() => finish(false, true)} />
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
