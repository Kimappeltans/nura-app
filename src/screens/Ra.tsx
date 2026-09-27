import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Mica, Character, poseImage } from '../ui';
import { useStore, useTheme } from '../store';
import {
  notNow, dropTask, clearCrumbs, updateTask, getFlag, setFlag, logEvent, suggestions, type Pick,
} from '../db';
import { useTaskActions } from '../useTaskActions';
import { reconcileNudges } from '../notifications';
import { minutesUntil } from '../calendar';
import { radius, type as T, copy } from '../theme';
import { formatDue } from '../components/DatePicker';
import { MoveHelp } from '../components/MoveHelp';
import { Sheet } from '../components/Sheet';
import { Knob } from '../components/Knob';
import { Handoff } from '../components/Handoff';
import { stepForTask, type Project, type Step } from '../projects';
import type { Energy } from '../db';
import { STAGE, useDesk } from '../screen';

const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
/** Set a reminder: a few times, in a tap. This evening is an hour on if it's already evening. */
const REMIND_AT = [
  { label: 'In an hour', at: () => Date.now() + 3600_000 },
  { label: 'This evening', at: () => Math.max(at(0, 18), Date.now() + 3600_000) },
  { label: 'Tomorrow morning', at: () => at(1, 9) },
];

// Each task Ra shows is logged once per app session, not on every re-render.
let lastShown = '';

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

/**
 * RA — focus.
 *
 * One thing at a time, because that's what focus means — but it is a mode you
 * CHOOSE, not a cage you're locked in. The full list lives one tap away in Nu,
 * and "Something else" swaps the suggestion for a different task. An app that
 * refuses to show you your own tasks isn't disciplined, it's just missing a
 * feature; the value here is that Ra *decides for you* when you don't want to
 * decide, not that it withholds information.
 *
 * Cream, warm, one enormous line of type on the page. No card: putting the one
 * thing you are about to do inside a little floating rectangle, with margin all
 * around it, is how every other app makes the most important object on screen
 * look like a row in a table.
 */
export default function Ra() {
  const t = useTheme();
  const { now, nowRule, crumb, toNu, refresh, nextEvent, energy, setEnergy, inbox, passOn, focusOn, showToast } = useStore();
  const { tick } = useTaskActions();

  const [options, setOptions] = useState(false);    // More options, open
  const [reminding, setReminding] = useState(false);

  // A timer is an option, not the default: Begin starts an open session that
  // ends when you say so ("done"). Once you've chosen a length it sticks.
  const [timerMins, setTimerMins] = useState<number | null>(null);
  useEffect(() => {
    getFlag('focus.timer').then(v => setTimerMins(Number(v) > 0 ? Number(v) : null));
  }, []);
  const chooseTimer = async (m: number | null) => {
    Haptics.selectionAsync();
    setTimerMins(m);
    await setFlag('focus.timer', m ? String(m) : '');
  };

  // "how much time do you actually have" — read from the calendar, never
  // written to it. Only shown once it's close enough to matter.
  const constraint = nextEvent && minutesUntil(nextEvent) <= 180 ? nextEvent : null;

  const back = useCallback(async () => { await toNu(); }, [toNu]);

  // Is this task a project's move? Then Ra names the project, gives Nu's
  // reason for the move, and "too big" / "blocked" ask Nu for another.
  const [proj, setProj] = useState<{ project: Project; step: Step } | null>(null);
  useEffect(() => {
    let dead = false;
    if (!now) { setProj(null); return; }
    stepForTask(now.id).then(p => { if (!dead) setProj(p && p.project.state === 'active' ? p : null); });
    return () => { dead = true; };
  }, [now?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Done without a session (More options → Mark as done). Once only: a
   *  second tap while the first is finishing does nothing. */
  const finishing = useRef(false);
  const done = async () => {
    if (!now || finishing.current) return;
    finishing.current = true;
    try {
      await tick(now.id);
      // a project's move: what now — the next move, or enough for today
      if (proj) return router.push({ pathname: '/project/[id]', params: { id: proj.project.id, after: 'done' } });
      await toNu();     // finishing returns you to the water
    } finally {
      finishing.current = false;
    }
  };

  const later = async () => {
    if (!now) return;
    await notNow(now.id);            // steps out of the running for 3 hours
    await refresh(); await reconcileNudges();
    await toNu();
  };

  /**
   * "Something else" — the escape hatch that makes a single-task screen
   * bearable. It does NOT snooze or penalise the task; it passes it over for
   * the rest of today and asks the engine for a different one. The pass is
   * stored (db.passOn), so a refresh can't bring the declined task back —
   * it used to live in this screen's state and snapped back on the next
   * refresh. Once everything has been passed over, the round starts again.
   */
  const somethingElse = async () => {
    if (!now) return;
    Haptics.selectionAsync();
    await passOn();
  };

  // Nothing picked (your Today is empty, nothing chosen): Ra offers a few
  // suggestions and you choose. It never picks for you.
  const [sugs, setSugs] = useState<Pick[]>([]);
  useEffect(() => {
    if (now) return;
    suggestions(3).then(setSugs);
  }, [now?.id, energy, inbox.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  // What Ra showed, and why — the measure the start rate is built on.
  useEffect(() => {
    if (!now || now.id === lastShown) return;
    lastShown = now.id;
    logEvent('shown', now.id, { rule: nowRule, energy });
  }, [now?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** "Waiting on someone" — stays in the water, just stops being asked for a
   *  while longer than a plain "later". Not a real status field (that's a
   *  bigger data-model change than this screen should make on its own) — a
   *  longer, honestly-named snooze gets the same practical result: it drops
   *  out of rotation without pretending to be done or dropped. */
  const waitingOnSomeone = async () => {
    if (!now) return;
    await notNow(now.id, 3 * 24 * 60);   // three days, not three hours
    await refresh(); await reconcileNudges();
    await toNu();
  };

  const makeItSmaller = () => {
    if (!now) return;
    router.push({ pathname: '/task/[id]', params: { id: now.id, focus: 'steps' } });
  };

  const notRelevant = async () => {
    if (!now) return;
    await dropTask(now.id);
    await refresh();
    await toNu();
  };

  const begin = () => {
    if (!now) return;
    router.push({ pathname: '/timer', params: { id: now.id, mins: String(timerMins ?? 0) } });
  };

  /** A reminder is a time on the task — the nudges are built from it. Then back to Nu. */
  const remind = async (at: number) => {
    if (!now) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateTask(now.id, { due_at: at, has_time: 1 });
    showToast(`Reminder · ${formatDue(at, true)}`);
    await refresh(); await reconcileNudges();
    await toNu();
  };

  const OptionRow = ({ label, value, onPress, open, last }: {
    label: string; value?: string; onPress: () => void; open?: boolean; last?: boolean;
  }) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12,
        borderTopWidth: 1, borderTopColor: t.stroke, opacity: pressed ? 0.6 : 1,
        marginBottom: last ? 4 : 0,
      })}>
      <Text style={{ flex: 1, color: t.ink, fontSize: 15.5 }}>{label}</Text>
      {!!value && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 14, maxWidth: '45%' }}>{value}</Text>}
      {open !== undefined && <Text style={{ color: t.ink3, fontSize: 14 }}>{open ? '▴' : '▾'}</Text>}
    </Pressable>
  );

  // interruption recovery: if we left this task mid-flight, show WHERE YOU WERE
  // rather than the task — by the time you return the context is gone, and that
  // is the entire problem.
  const resume = crumb && now && crumb.task.id === now.id ? crumb : null;

  const Chip = ({ label }: { label: string }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
      backgroundColor: t.subtle,
    }}>
      <Text style={{ color: t.ink2, fontSize: 12.5 }}>{label}</Text>
    </View>
  );

  // a wide web window: still one thing, centred, the words a size up; the way out stays top left
  const desk = useDesk();
  const big = desk ? { fontSize: 44, lineHeight: 46, letterSpacing: -2 } : { fontSize: 34, lineHeight: 36, letterSpacing: -1.5 };

  const LENGTHS = [null, 5, 10, 15, 25, 45, 60] as const;
  const ENERGY: [Energy, string][] = [['low', 'Low'], ['steady', 'Okay'], ['focused', 'High']];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top', 'bottom']}>
      <Mica />
      {/* the way out, top left; Ra's tile on the right (guidelines, rule 6) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: desk ? 32 : 24, paddingTop: desk ? 24 : 8, height: desk ? 72 : 56 }}>
        <Pressable onPress={back} hitSlop={14} accessibilityRole="button">
          <Text style={{ color: t.ink3, fontSize: 15, fontFamily: T.brand }}>← Everything</Text>
        </Pressable>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.layer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image source={poseImage('ra-icon')} style={{ width: 42, height: 42, marginTop: 5 }} resizeMode="contain" />
        </View>
      </View>

      <ScrollView contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
        desk && { width: '100%', maxWidth: STAGE + 48, alignSelf: 'center', justifyContent: 'center', paddingTop: 24, paddingBottom: 96 }]}>
        {!now && sugs.length ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>
              What feels doable now?
            </Text>
            {sugs.map(sg => (
              <Pressable key={sg.task.id}
                onPress={async () => { Haptics.selectionAsync(); await focusOn(sg.task.id); }}
                style={({ pressed }) => ({
                  borderRadius: 22, padding: 16, gap: 4,
                  backgroundColor: pressed ? t.subtle : t.card, borderWidth: 1, borderColor: t.stroke,
                })}>
                <Text style={{ color: t.ink, fontSize: 17, lineHeight: 22, fontFamily: T.brand }} numberOfLines={2}>{sg.task.title}</Text>
                {!!sg.task.est_minutes && <Text style={{ color: t.ink3, fontSize: 13 }}>≈ {sg.task.est_minutes} min</Text>}
              </Pressable>
            ))}
          </View>
        ) : !now ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{copy.emptyTitle}</Text>
            <Text style={{ color: t.ink2, fontSize: 16.5, lineHeight: 23 }}>{copy.emptyBody}</Text>
          </View>
        ) : resume ? (
          <View style={{ gap: 14 }}>
            <Character name="ra-rest" size={120} motion="none" style={{ alignSelf: 'center' }} />
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>
              {now.title}
            </Text>
            {!!resume.crumb.note && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: t.ra, paddingLeft: 14 }}>
                <Text style={{ color: t.ink2, fontSize: 16.5, lineHeight: 23 }}>{resume.crumb.note}</Text>
              </View>
            )}
            <Text style={{ color: t.ink3, fontSize: 12.5 }}>
              {resume.crumb.context ? `${resume.crumb.context} · ` : ''}{ago(resume.crumb.at)}
            </Text>
            <View style={{ alignItems: 'center', gap: 18, marginTop: 18 }}>
              <BigCircle label="Pick it back up" onPress={() => {
                logEvent('resumed', now.id);
                router.push({ pathname: '/timer', params: { id: now.id, mins: String(timerMins ?? 0) } });
              }} />
              <Pressable hitSlop={8} onPress={async () => {
                await clearCrumbs(now.id); await refresh();
                router.push({ pathname: '/timer', params: { id: now.id, mins: String(timerMins ?? 0) } });
              }}><Text style={{ color: t.ink2, fontSize: 15, fontFamily: T.display }}>Start it fresh</Text></Pressable>
              <Pressable hitSlop={8} onPress={later}><Text style={{ color: t.ink3, fontSize: 15, fontFamily: T.brand }}>Not now</Text></Pressable>
            </View>
          </View>
        ) : (
          <View>
            {/* the one thing, two-tone: the task, then how long */}
            <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: now.id } })}>
              <Text style={{ color: t.ink, ...big, fontFamily: T.display }}>{now.title}</Text>
              {(!!now.est_minutes || !!proj) && (
                <Text style={{ color: t.mute ?? t.ink3, ...big, fontFamily: T.display }}>
                  {now.est_minutes ? `≈ ${now.est_minutes} min` : proj?.project.title}
                </Text>
              )}
            </Pressable>
            {!!now.first_action && (
              <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 21, marginTop: 10 }}>{now.first_action}</Text>
            )}
            {constraint && (
              <Text style={{ color: t.ink3, fontSize: 13.5, marginTop: 8 }}>before {constraint.title} · {minutesUntil(constraint)} min</Text>
            )}

            {/* Nu hands it to Ra */}
            <View style={{ marginHorizontal: -24, paddingHorizontal: 24, marginTop: 20 }}>
              <Handoff />
            </View>

            <View style={{ alignItems: 'center', gap: 22, marginTop: 36 }}>
              <BigCircle label={timerMins ? `Begin · ${timerMins}` : 'Begin'} onPress={begin} />
              <Pressable onPress={() => { Haptics.selectionAsync(); setOptions(true); }} hitSlop={10} accessibilityRole="button">
                <Text style={{ color: t.ink2, fontSize: 15, fontFamily: T.display }}>More options</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MORE OPTIONS — the knobs and everything else, when you want them (rule 5) */}
      {!!now && (
        <Sheet visible={options} onClose={() => setOptions(false)}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Knob label="Length" options={LENGTHS} value={(LENGTHS as readonly (number | null)[]).includes(timerMins) ? timerMins : null}
              onChange={m => chooseTimer(m)} format={m => (m ? String(m) : 'Open')} unit={m => (m ? 'min' : undefined)} />
            <Knob label="Energy" options={ENERGY.map(e => e[0])} value={energy}
              onChange={e => setEnergy(e)} format={e => ENERGY.find(x => x[0] === e)?.[1] ?? 'Okay'} />
          </View>
          <View style={{ marginTop: 10 }}>
            <OptionRow label="Something else" onPress={() => { setOptions(false); somethingElse(); }} />
            {proj
              ? <OptionRow label="See the whole path" value={proj.project.title}
                  onPress={() => { setOptions(false); router.push({ pathname: '/project/[id]', params: { id: proj.project.id } }); }} />
              : <OptionRow label="Break it down" onPress={() => { setOptions(false); makeItSmaller(); }} />}
            <OptionRow label="Remind me" open={reminding} onPress={() => setReminding(v => !v)} />
            {reminding && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 14 }}>
                {REMIND_AT.map(r => (
                  <Pressable key={r.label} onPress={() => { setOptions(false); remind(r.at()); }} accessibilityRole="button"
                    style={({ pressed }) => ({
                      paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1,
                      borderColor: t.strokeStrong, backgroundColor: pressed ? t.subtle : 'transparent',
                    })}>
                    <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <OptionRow label="Waiting on someone" onPress={() => { setOptions(false); waitingOnSomeone(); }} />
            <OptionRow label="Mark as done" onPress={() => { setOptions(false); done(); }} last />
          </View>
          {proj && (
            <View style={{ paddingBottom: 10 }}>
              <MoveHelp projectId={proj.project.id} onMoved={async taskId => {
                setOptions(false);
                if (taskId) await focusOn(taskId);
                await refresh();
              }} />
            </View>
          )}
          <Primary label={timerMins ? `Begin · ${timerMins} min` : 'Begin'} tone="ra"
            onPress={() => { setOptions(false); begin(); }} style={{ marginTop: 10 }} />
        </Sheet>
      )}
    </SafeAreaView>
  );
}

/** The one action (guidelines/components/overview.md): a coral circle. */
function BigCircle({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FF6B35', transform: [{ scale: pressed ? 0.96 : 1 }], paddingHorizontal: 10,
      })}>
      <Text style={{ color: '#3B1204', fontSize: 18, fontFamily: T.display, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}
