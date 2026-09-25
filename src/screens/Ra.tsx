import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Ghost, Mica, Surface, Character, Eyebrow, SunArc, vary } from '../ui';
import { useStore, useTheme } from '../store';
import {
  complete, notNow, dropTask, clearCrumbs, updateTask, getFlag, setFlag, logEvent, suggestions, type Pick,
} from '../db';
import { reconcileNudges } from '../notifications';
import { minutesUntil } from '../calendar';
import { radius, type as T, copy } from '../theme';
import { activityById, SCENES, isCustom, type ActivityId } from '../activities';
import { DurationDial, SESSION_STOPS } from '../components/DurationDial';
import { formatDue } from '../components/DatePicker';
import { PriorityChip } from '../components/PriorityChip';
import { MoveHelp } from '../components/MoveHelp';
import { RoomBar } from '../components/RoomBar';
import { VoiceCommandButton } from '../components/Voice';
import { useVoiceCommands } from '../voice';
import { stepForTask, type Project, type Step } from '../projects';
import type { Energy } from '../db';

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
  const { now, nowRule, crumb, toNu, refresh, nextEvent, celebrate, today, energy, setEnergy, inbox, passOn, focusOn, showToast } = useStore();
  const [wave, setWave] = useState(true);

  const act = activityById(now?.activity);
  const raPose = vary(['ra-hello', 'ra-wave', 'ra-sun'] as const, now?.id);
  const scene = act && !isCustom(now?.activity) ? SCENES[act.id as ActivityId] : null;
  const [options, setOptions] = useState(false);    // More options, open
  const [timing, setTiming] = useState(false);      // the timer's dial, open
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
    if (m == null) setTiming(false);
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

  const done = async () => {
    if (!now) return;
    const award = await complete(now.id);
    await clearCrumbs(now.id);
    celebrate(award);
    await refresh(); await reconcileNudges();
    // a project's move: what now — the next move, or enough for today
    if (proj) return router.push({ pathname: '/project/[id]', params: { id: proj.project.id, after: 'done' } });
    await toNu();     // finishing returns you to the water
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
  const voice = useVoiceCommands([{ words: ['begin', 'start', 'go'], run: begin }]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top', 'bottom']}>
      <Mica />
      {/* the logo and the menu, as in the rooms */}
      <RoomBar who="ra" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: -6 }}>
        <Pressable onPress={back} hitSlop={14} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink2, fontSize: 15 }}>← Everything</Text>
        </Pressable>
        <SunArc light={today} size={78} compact />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20, gap: 14 }}>
        {/* The task's OWN scene, not a generic wave.
            Focus is the screen where you look at one thing before doing it —
            showing Ra waving there is a mascot saying hello when what you need
            is a picture of the thing itself. Falls back to the wave only when
            the task has no activity, so the slot is never empty. */}
        {(!now || resume) && (scene ? (
          <Image source={scene} style={{ width: 210, height: 168, alignSelf: 'center' }} resizeMode="contain" />
        ) : (
          <Character name={resume ? 'ra-rest' : 'ra-hello'} size={128} motion={wave ? 'greet' : 'bob'}
            onDone={() => setWave(false)} style={{ alignSelf: 'center' }} />
        ))}

        {!now && sugs.length ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: t.ink, fontSize: 30, lineHeight: 36, fontFamily: T.display, letterSpacing: -0.8 }}>
              What feels doable now?
            </Text>
            {sugs.map(sg => {
              const pr = sg.task.priority ?? 0;
              return (
                <Pressable key={sg.task.id}
                  onPress={async () => { Haptics.selectionAsync(); await focusOn(sg.task.id); }}
                  style={({ pressed }) => ({
                    borderRadius: radius.lg, padding: 16, gap: 5,
                    backgroundColor: pressed ? t.subtle : t.card,
                    borderWidth: 1, borderColor: t.strokeStrong,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: t.ink, fontSize: 18, lineHeight: 24, fontFamily: T.brand }} numberOfLines={2}>
                      {sg.task.title}
                    </Text>
                    {pr > 0 && <PriorityChip n={pr} />}
                  </View>
                  {!!sg.task.est_minutes && (
                    <Text style={{ color: t.ink3, fontSize: 13.5 }}>≈ {sg.task.est_minutes} min</Text>
                  )}
                </Pressable>
              );
            })}
            <Pressable onPress={back} hitSlop={10} style={{ alignSelf: 'center', paddingVertical: 6 }}>
              <Text style={{ color: t.nu, fontSize: 14 }}>See everything ›</Text>
            </Pressable>
          </View>
        ) : !now ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 41, fontFamily: T.display, letterSpacing: -0.9 }}>
              {copy.emptyTitle}
            </Text>
            <Text style={{ color: t.ink2, fontSize: 16.5, lineHeight: 23 }}>{copy.emptyBody}</Text>
            <View style={{ height: 8 }} />
            <Primary label="Back to Nu" tone="ra" onPress={back} />
          </View>
        ) : resume ? (
          <View style={{ gap: 14 }}>
            <Eyebrow label="Where you were" />
            <Text style={{ color: t.ink, fontSize: 32, lineHeight: 39, fontFamily: T.display, letterSpacing: -0.9 }}>
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
            <View style={{ height: 4 }} />
            <Primary label="Pick it back up" tone="ra"
              onPress={() => {
                logEvent('resumed', now.id);
                router.push({ pathname: '/timer', params: { id: now.id, mins: String(timerMins ?? 0) } });
              }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ghost style={{ flex: 1 }} label="Start it fresh" onPress={async () => {
                await clearCrumbs(now.id); await refresh();
                router.push({ pathname: '/timer', params: { id: now.id, mins: String(timerMins ?? 0) } });
              }} />
              <Ghost style={{ flex: 1 }} label="Not now" onPress={later} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* the one thing, with Ra (or the task's own scene) beside it */}
            <Surface>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 18, minHeight: 168 }}>
                <View style={{ flex: 1, gap: 8 }}>
                  {!!proj && <Eyebrow label={proj.project.title} />}
                  <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: now.id } })}>
                    <Text style={{ color: t.ink, fontSize: 24, lineHeight: 30, fontFamily: T.display, letterSpacing: -0.6 }}>
                      {now.title}
                    </Text>
                  </Pressable>
                  {!!now.first_action && (
                    <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21 }}>{now.first_action}</Text>
                  )}
                  {(!!now.est_minutes || !!constraint) && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 }}>
                      {!!now.est_minutes && <Chip label={`≈ ${now.est_minutes} min`} />}
                      {constraint && <Chip label={`before ${constraint.title} · ${minutesUntil(constraint)}m`} />}
                    </View>
                  )}
                </View>
                {scene
                  ? <Image source={scene} style={{ width: 100, height: 100 }} resizeMode="contain" />
                  : <Character name={raPose} size={100} motion={wave ? 'greet' : 'bob'} onDone={() => setWave(false)} />}
              </View>
            </Surface>

            {/* Begin — or say it */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Primary label={timerMins ? `Begin · ${timerMins} min` : 'Begin'} tone="ra" onPress={begin} style={{ flex: 1 }} />
              <VoiceCommandButton listening={voice.state === 'listening'} unavailable={voice.state === 'unavailable'}
                onPress={voice.toggle} label="Say “begin”" />
            </View>
            {voice.state === 'listening' && (
              <Text style={{ color: t.ink3, fontSize: 13.5, textAlign: 'center' }}>Say “begin”</Text>
            )}
            {!!voice.note && <Text style={{ color: t.ink3, fontSize: 13, textAlign: 'center' }}>{voice.note}</Text>}

            <Pressable onPress={() => { Haptics.selectionAsync(); setOptions(o => !o); }} hitSlop={8}
              accessibilityRole="button" accessibilityState={{ expanded: options }}
              style={{ alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: t.key === 'ra' ? t.raDeep : t.nu, fontSize: 14.5, fontFamily: T.brand }}>
                {options ? 'Hide options' : 'More options'}
              </Text>
            </Pressable>

            {options && (
              <Surface raised={false}>
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
                  <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>ENERGY</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 }}>
                    {([['low', 'Low'], ['steady', 'Okay'], ['focused', 'High']] as [Energy, string][]).map(([k, lbl]) => {
                      const on = energy === k;
                      return (
                        <Pressable key={k} onPress={async () => { Haptics.selectionAsync(); await setEnergy(k); }}
                          accessibilityRole="button" accessibilityState={{ selected: on }}
                          style={{
                            paddingHorizontal: 15, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1,
                            borderColor: on ? t.ra : t.strokeStrong, backgroundColor: on ? t.raWash : 'transparent',
                          }}>
                          <Text style={{ color: on ? (t.key === 'ra' ? t.raDeep : t.ra) : t.ink2, fontSize: 14, fontFamily: T.brand }}>{lbl}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <OptionRow label="Use a timer" value={timerMins ? `${timerMins} min` : 'Off'} open={timing}
                    onPress={() => setTiming(v => !v)} />
                  {timing && (
                    <View style={{ alignItems: 'center', gap: 10, paddingBottom: 14 }}>
                      <DurationDial stops={SESSION_STOPS} value={timerMins ?? 25}
                        onChange={m => setTimerMins(m)} onRelease={chooseTimer} size={148} />
                      {!!timerMins && (
                        <Pressable onPress={() => chooseTimer(null)} hitSlop={8}>
                          <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>No timer</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {proj
                    ? <OptionRow label="See the whole path" value={proj.project.title}
                        onPress={() => router.push({ pathname: '/project/[id]', params: { id: proj.project.id } })} />
                    : <OptionRow label="Break this down" onPress={makeItSmaller} />}

                  <OptionRow label="Set a reminder" open={reminding} onPress={() => setReminding(v => !v)} />
                  {reminding && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 14 }}>
                      {REMIND_AT.map(r => (
                        <Pressable key={r.label} onPress={() => remind(r.at())} accessibilityRole="button"
                          style={({ pressed }) => ({
                            paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1,
                            borderColor: t.strokeStrong, backgroundColor: pressed ? t.subtle : 'transparent',
                          })}>
                          <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>{r.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <OptionRow label="Mark as waiting" onPress={waitingOnSomeone} />
                  <OptionRow label="Later today" onPress={later} />
                  <OptionRow label="Something else" onPress={somethingElse} />
                  <OptionRow label="Already done" onPress={done} />
                  <OptionRow label="Let it go" onPress={notRelevant} last />
                </View>
                {/* a project's move can be too big, or stuck — Nu finds another */}
                {proj && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                    <MoveHelp projectId={proj.project.id} onMoved={async taskId => {
                      if (taskId) await focusOn(taskId);
                      await refresh();
                    }} />
                  </View>
                )}
              </Surface>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
