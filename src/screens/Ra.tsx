import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Image } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Ghost, Mica, Surface, Character, Eyebrow, SunArc } from '../ui';
import { useStore, useTheme } from '../store';
import {
  complete, notNow, clearCrumbs, updateTask, grantLight, getFlag, setFlag, pickNow, pickForToday,
} from '../db';
import { reconcileNudges } from '../notifications';
import { minutesUntil, hasCalendarPermission, requestCalendarPermission } from '../calendar';
import { radius, type as T, copy } from '../theme';
import { activityById, SCENES, isCustom, type ActivityId } from '../activities';
import type { Energy } from '../db';

const MINUTES = [2, 5, 10, 15, 30, 60];
const SESSIONS = [5, 15, 25, 45];

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
  const { now, crumb, toNu, refresh, nextEvent, celebrate, today, energy, setEnergy, inbox } = useStore();
  const [wave, setWave] = useState(true);
  const [firstAction, setFirstAction] = useState('');
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [calAsk, setCalAsk] = useState(false);

  const act = activityById(now?.activity);
  const scene = act && !isCustom(now?.activity) ? SCENES[act.id as ActivityId] : null;
  const [passed, setPassed] = useState<string[]>([]);   // seen-and-swapped this sitting
  const [picking, setPicking] = useState(false);   // task picker expanded
  const [pickingMins, setPickingMins] = useState(false);   // session-length chips expanded
  const [more, setMore] = useState(false);   // secondary escape hatches expanded

  // How long the next session should be. Sticky across sittings — once you've
  // told it you like 25s, it stops asking, the same courtesy as skip.est/first.
  const [sessionMins, setSessionMins] = useState(5);
  useEffect(() => {
    (async () => {
      const saved = await getFlag('session_mins');
      if (saved) setSessionMins(Number(saved));
    })();
  }, []);
  const chooseSession = async (m: number) => {
    Haptics.selectionAsync();
    setSessionMins(m);
    await setFlag('session_mins', String(m));
  };

  // "how much time do you actually have" — read from the calendar, never
  // written to it. Only shown once it's close enough to matter.
  const constraint = nextEvent && minutesUntil(nextEvent) <= 180 ? nextEvent : null;

  /**
   * The calendar permission, asked here rather than in onboarding — at the one
   * moment where granting it visibly changes the screen in front of you, from
   * "25 min" to "25 min, and you have 47 before your 3 o'clock".
   */
  useEffect(() => {
    (async () => {
      if (await getFlag('cal_asked')) return;
      if (await hasCalendarPermission()) return;
      setCalAsk(true);
    })();
  }, []);

  const askCalendar = async () => {
    setCalAsk(false);
    await setFlag('cal_asked', '1');
    await requestCalendarPermission();
    await refresh();
  };

  // What Ra is missing, and therefore what it should ask for. One question at a
  // time, never two, and never before you have seen the task itself.
  const [needs, setNeeds] = useState<'est' | 'first' | null>(null);
  useEffect(() => {
    (async () => {
      if (!now) return setNeeds(null);
      setFirstAction(now.first_action ?? '');
      if (!now.est_minutes && !(await getFlag(`skip.est.${now.id}`))) return setNeeds('est');
      if (!now.first_action && !(await getFlag(`skip.first.${now.id}`))) return setNeeds('first');
      setNeeds(null);
    })();
  }, [now?.id, now?.est_minutes, now?.first_action, skipped]);

  const back = useCallback(async () => { await toNu(); }, [toNu]);

  const done = async () => {
    if (!now) return;
    const award = await complete(now.id);
    await clearCrumbs(now.id);
    celebrate(award);
    await refresh(); await reconcileNudges();
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
   * bearable. It does NOT snooze or penalise the task; it just asks the
   * engine for a different one, remembering what you've already been shown so
   * it can't loop. Falls back to the first suggestion once you've seen them all.
   */
  const somethingElse = async () => {
    if (!now) return;
    Haptics.selectionAsync();
    const seen = [...passed, now.id];
    const next = await pickNow(seen);
    if (next) { setPassed(seen); useStore.setState({ now: next }); }
    else { setPassed([]); useStore.setState({ now: await pickNow() }); }
  };

  const answerEst = async (m: number) => {
    if (!now) return;
    Haptics.selectionAsync();
    await updateTask(now.id, { est_minutes: m });
    await grantLight('enrich', now.id);
    await refresh();
  };

  const saveFirst = async () => {
    if (!now || !firstAction.trim()) return;
    await updateTask(now.id, { first_action: firstAction.trim() });
    await grantLight('enrich', now.id);
    await refresh();
  };

  const skip = async (which: 'est' | 'first') => {
    if (!now) return;
    await setFlag(`skip.${which}.${now.id}`, '1');
    setSkipped(s => ({ ...s, [`${which}.${now.id}`]: true }));
  };

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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 2 }}>
        <Pressable onPress={back} hitSlop={14} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Everything</Text>
        </Pressable>
        <SunArc light={today} size={78} compact />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 20, gap: 14 }}>
        {/* The task's OWN scene, not a generic wave.
            Focus is the screen where you look at one thing before doing it —
            showing Ra waving there is a mascot saying hello when what you need
            is a picture of the thing itself. Falls back to the wave only when
            the task has no activity, so the slot is never empty. */}
        {scene ? (
          <Image
            source={scene}
            style={{ width: 210, height: 168, alignSelf: 'center' }}
            resizeMode="contain"
          />
        ) : (
          <Character
            name="ra-wave" size={128} motion={wave ? 'greet' : 'none'}
            onDone={() => setWave(false)}
            style={{ alignSelf: 'center' }}
          />
        )}

        {!now ? (
          <View style={{ gap: 10 }}>
            <Eyebrow label="Nothing pending" />
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
              onPress={() => router.push({ pathname: '/timer', params: { id: now.id, mins: String(sessionMins) } })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ghost label="Start it fresh" onPress={async () => {
                await clearCrumbs(now.id); await refresh();
                router.push({ pathname: '/timer', params: { id: now.id, mins: String(sessionMins) } });
              }} />
              <Ghost label="Not now" onPress={later} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {/* Energy lives here now.
                It was on the capture screen, which asked how you FEEL while you
                were busy writing down what you have to DO — and it changed
                nothing on that screen, because only this one reads it. Asked
                here it is a real question with a visible consequence: it caps
                how long the thing you're about to be handed can be. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Text style={{ color: t.ink3, fontSize: 13.5, flex: 1 }}>How much have you got?</Text>
              <View style={{
                flexDirection: 'row', gap: 3, padding: 3,
                borderRadius: radius.pill, backgroundColor: t.layer,
                borderWidth: 1, borderColor: t.stroke,
              }}>
                {([['low', 'A little'], ['steady', 'Some'], ['focused', 'Plenty']] as [Energy, string][]).map(([k, lbl]) => {
                  const on = energy === k;
                  return (
                    <Pressable key={k}
                      onPress={async () => { Haptics.selectionAsync(); await setEnergy(k); }}
                      style={{
                        paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
                        backgroundColor: on ? t.ra : 'transparent',
                      }}>
                      <Text style={{
                        color: on ? t.onRa : t.ink2, fontSize: 12.5,
                        fontFamily: on ? T.brand : undefined,
                      }}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Eyebrow label={act ? act.name : copy.nextStep} />
            <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: now.id } })}>
              <Text style={{ color: t.ink, fontSize: 36, lineHeight: 43, fontFamily: T.display, letterSpacing: -1 }}>
                {now.title}
              </Text>
            </Pressable>

            {!!now.first_action && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: t.ra, paddingLeft: 14 }}>
                <Text style={{ color: t.ink2, fontSize: 16.5, lineHeight: 23 }}>{now.first_action}</Text>
              </View>
            )}

            {/* ------------------------------------------------------------ *
              *  The one question.
              *
              *  Capture writes a title and nothing else — which is right, it
              *  has to cost nothing — but it means the fields the NOW engine
              *  actually reads are empty forever, and the app quietly degrades
              *  into "oldest thing first". Every other app fixes this with a
              *  form at capture time, which is precisely the friction that
              *  stops you capturing.
              *
              *  So Ra asks for exactly one missing field, once, at the moment
              *  it is about to matter, and taking the trouble to answer pays
              *  light. Skipping is a real answer and is never asked again for
              *  this task.
              * ------------------------------------------------------------ */}
            {needs === 'est' && (
              <View style={{ gap: 9 }}>
                <Text style={{ color: t.ink2, fontSize: 14.5 }}>How long, roughly? Guessing is fine.</Text>
                <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  {MINUTES.map(m => (
                    <Pressable key={m} onPress={() => answerEst(m)} style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
                      borderWidth: 1.5, borderColor: t.ra, backgroundColor: t.raWash,
                    }}>
                      <Text style={{ color: t.raDeep, fontSize: 14, fontFamily: T.brand }}>{m}m</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => skip('est')} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 9 }}>
                    <Text style={{ color: t.ink3, fontSize: 13.5 }}>skip</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {needs === 'first' && (
              <View style={{ gap: 9 }}>
                <Text style={{ color: t.ink2, fontSize: 14.5 }}>
                  What's the first physical move? The smaller the better.
                </Text>
                <TextInput
                  value={firstAction} onChangeText={setFirstAction}
                  onSubmitEditing={saveFirst} returnKeyType="done"
                  placeholder="e.g. open the doc that's already on the second screen"
                  placeholderTextColor={t.ink3}
                  style={{
                    color: t.ink, fontSize: 16.5, paddingVertical: 13, paddingHorizontal: 14,
                    backgroundColor: t.card, borderRadius: radius.md,
                    borderWidth: 1, borderColor: t.strokeStrong, borderLeftWidth: 3, borderLeftColor: t.ra,
                  }}
                />
                <Pressable onPress={() => skip('first')} hitSlop={10}>
                  <Text style={{ color: t.ink3, fontSize: 13.5 }}>skip — I'll just start</Text>
                </Pressable>
              </View>
            )}

            {(!!now.est_minutes || constraint) && needs === null && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {!!now.est_minutes && <Chip label={`≈ ${now.est_minutes} min`} />}
                {constraint && <Chip label={`before ${constraint.title} · ${minutesUntil(constraint)}m`} />}
              </View>
            )}

            {calAsk && !constraint && (
              <Pressable onPress={askCalendar} style={{ paddingVertical: 4 }}>
                <Text style={{ color: t.raDeep, fontSize: 14, fontFamily: T.brand }}>
                  Show how long until my next thing →
                </Text>
              </Pressable>
            )}

            {/* The session length and the button that uses it are ONE control.
                They were two stacked blocks with a gap, so the chips read as a
                separate question and the CTA looked stranded — you had to tap
                a chip and then watch the button's label change to work out they
                were connected. Sharing a surface makes the relationship
                structural instead of inferred.
                The four durations used to sit here as equal chips every time —
                which is one recommendation and three distractions dressed up
                as four choices, on the one screen whose whole job is to hand
                you a single thing to do. `sessionMins` is already sticky (see
                above), so most sittings never need the alternatives at all;
                they're a tap away behind "change" instead of always on. */}
            <Surface accent="ra">
              <View style={{ padding: 14, gap: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: t.ink2, fontSize: 13.5 }}>How long this time?</Text>
                  <Pressable onPress={() => { Haptics.selectionAsync(); setPickingMins(v => !v); }} hitSlop={8}>
                    <Text style={{ color: t.nu, fontSize: 13, fontFamily: T.brand }}>
                      {pickingMins ? 'Done' : `${sessionMins}m · change`}
                    </Text>
                  </Pressable>
                </View>

                {pickingMins && (
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {SESSIONS.map(m => {
                      const on = sessionMins === m;
                      return (
                        <Pressable key={m} onPress={() => { chooseSession(m); setPickingMins(false); }} style={{
                          flex: 1, alignItems: 'center',
                          paddingVertical: 9, borderRadius: radius.pill,
                          borderWidth: 1.5, borderColor: on ? t.ra : t.strokeStrong,
                          backgroundColor: on ? t.raWash : 'transparent',
                        }}>
                          <Text style={{
                            color: on ? t.raDeep : t.ink, fontSize: 13.5,
                            fontFamily: on ? T.brand : undefined,
                          }}>{m}m</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Primary label={`Begin · ${sessionMins} minutes`} tone="ra"
                  sub="stop any time — it still counts"
                  onPress={() => router.push({ pathname: '/timer', params: { id: now.id, mins: String(sessionMins) } })} />
              </View>
            </Surface>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ghost label="Something else" onPress={somethingElse} />
              <Ghost label="Already done" onPress={done} />
            </View>

            {/* Everything past "something else" and "already done" is a
                second tier of escape hatches — useful, but not something
                every visit needs to see laid out. Tucked behind one more
                toggle instead of three permanent rows. */}
            {!more ? (
              <Pressable onPress={() => { Haptics.selectionAsync(); setMore(true); }}
                hitSlop={10} style={{ alignSelf: 'center', paddingVertical: 6 }}>
                <Text style={{ color: t.ink3, fontSize: 13.5 }}>More options</Text>
              </Pressable>
            ) : (
              <View style={{ gap: 10, alignItems: 'center' }}>
                {/* Task picker — lets you choose a specific task without going back to Nu. */}
                {!picking ? (
                  <Pressable onPress={() => { Haptics.selectionAsync(); setPicking(true); }}
                    hitSlop={10} style={{ paddingVertical: 6 }}>
                    <Text style={{ color: t.nu, fontSize: 13.5 }}>Choose something specific →</Text>
                  </Pressable>
                ) : (
                  <View style={{
                    width: '100%', backgroundColor: t.layer, borderRadius: radius.lg,
                    borderWidth: 1, borderColor: t.strokeStrong, overflow: 'hidden',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
                      <Text style={{ flex: 1, color: t.ink2, fontSize: 13, fontFamily: T.brand }}>YOUR LIST</Text>
                      <Pressable onPress={() => setPicking(false)} hitSlop={10}>
                        <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                      </Pressable>
                    </View>
                    {inbox.filter(x => x.id !== now?.id).slice(0, 12).map((task, i) => (
                      <Pressable key={task.id}
                        onPress={async () => {
                          Haptics.selectionAsync();
                          await pickForToday(task.id, true);
                          useStore.setState({ now: task });
                          setPassed([]);
                          setPicking(false);
                        }}
                        style={({ pressed }) => ({
                          padding: 12, paddingLeft: 14,
                          borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.stroke,
                          backgroundColor: pressed ? t.subtle : 'transparent',
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                        })}>
                        <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 21 }} numberOfLines={2}>
                          {task.title}
                        </Text>
                        {!!task.est_minutes && (
                          <Text style={{ color: t.ink3, fontSize: 12, flexShrink: 0 }}>{task.est_minutes}m</Text>
                        )}
                      </Pressable>
                    ))}
                    {inbox.length === 0 && (
                      <Text style={{ color: t.ink3, fontSize: 14, padding: 14 }}>Nothing else to pick from.</Text>
                    )}
                  </View>
                )}

                <Pressable onPress={later} hitSlop={10} style={{ paddingVertical: 6 }}>
                  <Text style={{ color: t.ink3, fontSize: 13.5 }}>Not today — put it back</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
