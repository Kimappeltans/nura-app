import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import {
  capture, complete, pickForToday, getFlag, setFlag, notNow, dropTask,
  checkInDue, markCheckInSeen, listHabits, habitLogs, logHabit, pauseHabit,
  type Task, type Energy, type Habit,
} from '../db';
import { priorityOf, whyLine } from '../priority';
import { statsFor, rateLine, type HabitStats } from '../habits';
import { requestPermission, setupSchedules } from '../notifications';
import { requestCalendarPermission, hasCalendarPermission, type UpcomingEvent } from '../calendar';
import { radius, elevation, type as T, copy } from '../theme';
import { rankFor, DAY_TARGET } from '../reward';
import { stageFor } from '../growth';
import { search as searchTasks } from '../db';
import { LabelTile, LabelGlyph } from '../components/LabelIcon';
import { ActivityCard, HeroCard } from '../components/ActivityCard';
import { formatDue } from '../components/DatePicker';
import { Mica, Surface, Character, Primary, IconChevron, IconClock, IconCalendar, IconSearch, Check, Enter, Press, Bar, Count, animateNext } from '../ui';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';

const stone = require('../../assets/brand/nura-logo-tight.png');

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

type Item =
  | { kind: 'event'; event: UpcomingEvent }
  | { kind: 'task'; task: Task };

/**
 * HOME — everything you owe today, in one place.
 *
 * Laid out as a phone screen, not a shrunk desktop one. Two rules do most of
 * that work:
 *
 *  1. ONE scroll region, nothing pinned outside it. A pinned bottom button
 *     used to sit as a sibling below a `flex: 1` ScrollView — which pins the
 *     button, yes, but a `flex: 1` region also always fills the remaining
 *     screen height, so any day short enough not to fill the screen left a
 *     dead, unexplained band between the last card and the button. "Focus on
 *     one thing" now flows as the last item in the same scroll region: no gap
 *     on a short day, and on a long one it's one scroll away, same as
 *     everything above it.
 *  2. INSET GROUPED SECTIONS. Full-bleed rows separated by hairlines read as a
 *     web table; rounded, inset groups with the separator indented past the
 *     bullet is the native idiom, and it gives the eye something to hold.
 */
export default function Nu() {
  const t = useTheme();
  const [thinking, setThinking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [askNudge, setAskNudge] = useState(false);
  const [calAsk, setCalAsk] = useState(false);
  const [checkInTask, setCheckInTask] = useState<Task | null>(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitStats, setHabitStats] = useState<Record<string, HabitStats>>({});
  const { inbox, todayPicked, agenda, energy, setEnergy, toRa, focusOn, refresh, light, today, wins, celebrate, now, nowRule, profile } = useStore();
  const showToast = useStore(s => s.showToast);

  useEffect(() => {
    (async () => {
      if (!(await getFlag('notif_asked')) && inbox.length + todayPicked.length >= 1) setAskNudge(true);
      if (!(await getFlag('cal_asked')) && !(await hasCalendarPermission())) setCalAsk(true);
    })();
  }, [inbox.length, todayPicked.length]);

  const loadHabits = useCallback(async () => {
    const list = await listHabits();
    setHabits(list);
    const stats: Record<string, HabitStats> = {};
    for (const h of list) stats[h.id] = statsFor(await habitLogs(h.id), h.created_at);
    setHabitStats(stats);
  }, []);
  useEffect(() => { loadHabits(); }, [loadHabits]);

  const markHabit = useCallback(async (h: Habit, minimum: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logHabit(h.id, minimum);
    showToast(minimum ? 'Counted — the small version counts the same' : 'Counted ✓');
    await loadHabits();
  }, [loadHabits, showToast]);

  // Pausing, not deleting — a habit that isn't fitting your life yet is a
  // sign the cue was wrong, not a failure to log against. The history
  // stays; turning it back on later doesn't start from zero.
  const pauseThisHabit = useCallback(async (h: Habit) => {
    Alert.alert('Pause this habit?', 'It stops asking. Nothing about it is held against you, and its history stays if you start it again.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Pause it', onPress: async () => { await pauseHabit(h.id); await loadHabits(); } },
    ]);
  }, [loadHabits]);

  // "This one keeps slipping" — a task that's been snoozed past the
  // threshold gets one compassionate check-in, not a growing red badge. At
  // most one task asks at a time, and it never interrupts a capture in
  // progress or a search.
  useEffect(() => {
    (async () => {
      if (checkInTask || q.trim()) return;
      for (const task of [...todayPicked, ...inbox]) {
        if (await checkInDue(task)) { setCheckInTask(task); return; }
      }
    })();
  }, [inbox, todayPicked, checkInTask, q]);

  const checkInActions: SheetAction[] = checkInTask ? [
    { key: 'smaller', glyph: '◊', label: 'Too big — make it smaller', sub: 'break it into a first, smaller step',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: checkInTask.id, focus: 'steps' } }) },
    { key: 'waiting', glyph: '⋯', label: "Blocked — I'm waiting on someone", sub: 'stays in the water, stops being asked',
      onPress: async () => { await notNow(checkInTask.id, 3 * 24 * 60); await refresh(); } },
    { key: 'when', glyph: '↓', label: 'Wrong time — change the date', sub: 'open it and pick a date that actually fits',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: checkInTask.id } }) },
    { key: 'drop', glyph: '×', label: 'Not important anymore', sub: 'gone, no explanation needed',
      onPress: async () => { await dropTask(checkInTask.id); await refresh(); } },
  ] : [];

  const answerNudge = useCallback(async (yes: boolean) => {
    setAskNudge(false);
    await setFlag('notif_asked', '1');
    if (yes && await requestPermission()) await setupSchedules();
  }, []);

  const connectCalendar = useCallback(async () => {
    setCalAsk(false);
    await setFlag('cal_asked', '1');
    await requestCalendarPermission();
    await refresh();
  }, [refresh]);

  /**
   * Tick it off from the list.
   *
   * The list previously had no way to complete anything — the only route was
   * Home → Focus → Begin → Done, which is right for the thing you're actually
   * working on and absurd for "oh, I already did that". The checkbox fills, the
   * row animates out from under it, and it pays the same light as any other
   * completion.
   */
  const tick = async (id: string) => {
    const award = await complete(id);
    celebrate(award);
    animateNext('remove');
    await refresh();
  };

  /** The day, merged: what's still ahead on the calendar, interleaved by time.
   *
   *  "Picked for today" tasks come from `todayPicked` (state 'today'/'doing'),
   *  a separate store field — `inbox` only ever holds state:'inbox' rows, so
   *  a task moved to today by `pickForToday()` leaves `inbox` and previously
   *  had nothing bringing it back into view here. */
  const groups = useMemo(() => {
    const nowMs = Date.now();
    const endOfDay = new Date().setHours(23, 59, 59, 999);
    const ahead = agenda.filter(e => e.startsAt > nowMs);
    const dated = inbox.filter(x => x.due_at && x.due_at <= endOfDay);
    const rest = inbox.filter(x => !(x.due_at && x.due_at <= endOfDay));
    const todayItems: Item[] = [
      ...dated.map(task => ({ kind: 'task' as const, task })),
      ...todayPicked.map(task => ({ kind: 'task' as const, task })),
      ...ahead.map(event => ({ kind: 'event' as const, event })),
    ].sort((a, b) => {
      const at = a.kind === 'event' ? a.event.startsAt : (a.task.due_at ?? 0);
      const bt = b.kind === 'event' ? b.event.startsAt : (b.task.due_at ?? 0);
      return at - bt;
    });
    return [
      ...(todayItems.length ? [{ title: 'Today', data: todayItems }] : []),
      ...(rest.length ? [{ title: 'Anytime', data: rest.map(task => ({ kind: 'task' as const, task })) }] : []),
    ];
  }, [inbox, todayPicked, agenda]);

  /**
   * The Today receipt: what's already done, next to what's still ahead —
   * chronological, not two separate counts. "2 done · 3 to do" answers HOW
   * MANY; this answers WHICH ONES, which is the question the number can't.
   * The current Up Next pick is left out — it's already the hero above.
   */
  const todayRows = useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const done = wins
      .filter(w => w.completed_at && w.completed_at >= startOfDay)
      .map(task => ({ kind: 'done' as const, task, at: task.completed_at! }));
    const todayGroup = groups.find(g => g.title === 'Today');
    const pending = (todayGroup?.data ?? [])
      .filter(it => !(it.kind === 'task' && it.task.id === now?.id))
      .map(it => it.kind === 'event'
        ? { kind: 'event' as const, event: it.event, at: it.event.startsAt }
        : { kind: 'task' as const, task: it.task, at: it.task.due_at ?? Infinity });
    return [...done, ...pending].sort((a, b) => a.at - b.at);
  }, [wins, groups, now]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const r = q.trim() ? await searchTasks(q) : [];
      if (!dead) setHits(r);
    })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  /** Time-of-day greeting. Never a scold, never a count of what's outstanding. */
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up'
    : hour < 12 ? 'Good morning'
    : hour < 18 ? 'Good afternoon'
    : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];

  /** What rides in the deck: the NOW pick first, then the rest of today, then
   *  whatever is waiting. Capped at five — a deck you scroll for a minute is a
   *  list with extra steps. */
  const upNext = useMemo(() => {
    const seen = new Set<string>();
    const out: Task[] = [];
    const push = (x?: Task | null) => {
      if (x && !seen.has(x.id) && x.state !== 'done') { seen.add(x.id); out.push(x); }
    };
    push(now);
    todayPicked.forEach(push);
    inbox.filter(x => x.due_at).forEach(push);
    inbox.forEach(push);
    return out.slice(0, 5);
  }, [now, inbox, todayPicked]);

  /** Chose a card that isn't the current pick: it goes on today's plan and
   *  Focus opens on exactly that task. It used to mark it for today and then
   *  let Focus re-run the pick, which could hand you a different task. */
  const pickThen = useCallback(async (id: string) => {
    await pickForToday(id, true);
    await focusOn(id);
  }, [focusOn]);

  /** Everything else in the water — undated, not already in the deck above.
   *  Nu's promise is "everything you're carrying"; these used to be computed
   *  and never drawn, so past the first five they only surfaced in search. */
  const anytime = useMemo(() => {
    const inDeck = new Set(upNext.map(x => x.id));
    return (groups.find(g => g.title === 'Anytime')?.data ?? [])
      .flatMap(it => it.kind === 'task' && !inDeck.has(it.task.id) ? [it.task] : []);
  }, [groups, upNext]);

  const rank = rankFor(light);
  const dayPct = Math.min(1, today / DAY_TARGET);
  const doneToday = wins.filter(w =>
    w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  // count what's actually open, not just what happens to carry a date —
  // "0 left today" while four things sat in Anytime was simply untrue.
  // todayPicked included: those tasks left `inbox` the moment they were
  // picked for today, but they're still open work, not done work.
  const openCount = inbox.length + todayPicked.length;

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // Whole-day recovery — the "planned six, did one" moment. Evening,
  // several things still sitting in Today, and nothing has landed yet: a
  // gentle nudge toward One Pass rather than a growing, silent list. Never
  // framed as a miss — there is no "overdue" concept in this app to have
  // triggered it (see db.ts), just an honest amount still in the water.
  const todayPendingCount = groups.find(g => g.title === 'Today')?.data.length ?? 0;
  const showRecovery = !recoveryDismissed && hour >= 17 && doneToday === 0 && todayPendingCount >= 3;

  /** One inset, rounded group — the native list idiom. */
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 16 }}>
      <Text style={{
        color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand,
        marginBottom: 7, marginLeft: 4,
      }}>{title.toUpperCase()}</Text>
      <Surface>{children}</Surface>
    </View>
  );

  const Divider = () => (
    <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 86 }} />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      {/* The sun climbs and warms as the day's completions add up — literal
          feedback that finishing things changes the light in the room, not
          just a number somewhere on a stats screen. */}
      <Mica sunProgress={Math.min(4, doneToday) / 4} />

      {/* Top bar: search, then you. The mark moves into the greeting below —
          an app icon inside the app is decoration, and this row is for tools.
          Both side buttons are 44pt — the HIG minimum tap target, and it's
          what makes the search field between them read as centered instead
          of nudged. paddingTop gives the row breathing room under the safe
          area inset rather than sitting flush against a notch/Dynamic Island. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
        <Pressable onPress={() => router.push('/calendar')} hitSlop={8}
          style={{
            width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.layer, borderWidth: 1, borderColor: t.stroke,
          }}>
          <IconCalendar size={19} color={t.ink2} />
        </Pressable>

        <Surface style={{ flex: 1 }} raised={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <IconSearch size={17} color={t.ink3} />
            <TextInput
              value={q} onChangeText={setQ}
              placeholder="Search" placeholderTextColor={t.ink3}
              style={{ flex: 1, paddingVertical: 10, paddingLeft: 9, color: t.ink, fontSize: 15 }}
            />
            {!!q && (
              <Pressable onPress={() => setQ('')} hitSlop={10}>
                <Text style={{ color: t.ink3, fontSize: 17 }}>×</Text>
              </Pressable>
            )}
          </View>
        </Surface>

        <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
          <View style={{
            width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.layer, borderWidth: 2, borderColor: t.ra,
          }}>
            <Character
              key={thinking ? 'think' : 'idle'}
              name={thinking ? 'nu-thinking' : 'nu-idle'}
              motion="greet"
              onDone={() => thinking && setTimeout(() => setThinking(false), 900)}
              size={40}
            />
          </View>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 22 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* The greeting does the work the app icon was doing, and does it
            better: it says the date, and it says your name. */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: t.ink, fontSize: 27, fontFamily: T.display, letterSpacing: -0.6, lineHeight: 34 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
          <Text style={{ color: t.ink3, fontSize: 13.5, marginTop: 2 }}>{dateLine}</Text>
          {/* The receipt: which ones, not how many — "2 risen" says something
              happened, "5 still in the water" says the rest is held, not lost. */}
          {(doneToday > 0 || openCount > 0) && (
            <Pressable onPress={() => router.push('/tide')} hitSlop={6}>
              <Text style={{ color: t.ink3, fontSize: 13, marginTop: 3 }}>
                {doneToday} risen · {openCount} still in the water
                <Text style={{ color: t.nu }}> · see the tide ›</Text>
              </Text>
            </Pressable>
          )}
        </View>

        {/* THE HERO — one recommended task, at full size and with its scene.
            Everything else that's queued up sits below it as a plain
            compact list: a deck of five equally-sized cards made every
            option look like it mattered the same amount, which is the
            opposite of what "focus on one thing" is supposed to say before
            you've even left Home. Tapping the hero — or any row below it —
            goes straight into Focus rather than the detail sheet: the card
            should DO the thing, not describe it. */}
        {!q && !!upNext.length && (
          <View style={{ marginBottom: 16 }}>
            <HeroCard
              task={upNext[0]}
              why={upNext[0].id === now?.id ? whyLine(nowRule, upNext[0], energy) : null}
              onStart={() => {
                // the hero is what Focus would hand you anyway; picking a row
                // below means "I want THAT one", so it's pinned before switching
                if (upNext[0].id === now?.id) toRa();
                else pickThen(upNext[0].id);
              }}
            />

            {upNext.length > 1 && (
              <View style={{ marginTop: 10 }}>
                <Surface>
                  {upNext.slice(1).map((task, i) => (
                    // Each row down recedes a little — the further something
                    // sits below the hero, the more it reads as "still under",
                    // not "less important".
                    <View key={task.id} style={{ opacity: Math.max(0.55, 1 - i * 0.11) }}>
                      {i > 0 && <Divider />}
                      <Pressable
                        onPress={() => { Haptics.selectionAsync(); task.id === now?.id ? toRa() : pickThen(task.id); }}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingHorizontal: 14, paddingVertical: 13,
                          backgroundColor: pressed ? t.subtle : 'transparent',
                        })}>
                        <LabelTile id={task.label} size={30} />
                        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15.5, flex: 1 }}>
                          {task.title}
                        </Text>
                        {!!task.est_minutes && (
                          <Text style={{ color: t.ink3, fontSize: 12.5 }}>{task.est_minutes}m</Text>
                        )}
                        <IconChevron size={15} color={t.ink3} />
                      </Pressable>
                    </View>
                  ))}
                </Surface>
              </View>
            )}
          </View>
        )}

        {/* Progress — one compact strip, not a headline. */}
        <Press onPress={() => router.push('/profile')}>
          <Surface accent="ra">
            <View style={{ padding: 15, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand, flex: 1 }}>
                  {doneToday} done · {openCount} to do
                </Text>
                <Count value={today} style={{ color: t.ra, fontSize: 21, fontFamily: T.display }} />
                <Text style={{ color: t.ink3, fontSize: 12.5, marginLeft: 5 }}>light</Text>
              </View>
              <Bar pct={dayPct} height={7} />

            </View>
          </Surface>
        </Press>

        {/* Today, itemized. The strip above answers HOW MANY; this answers
            WHICH ONES — done items keep their line-through and a timestamp
            instead of vanishing, because "what did I actually get to today"
            is a real question and a growing light total doesn't answer it. */}
        {!q && !!todayRows.length && (
          <Group title="Today">
            {(() => {
              // Depth-fade tracks how far UNDER the surface a pending row
              // sits — completed rows have already risen, so they stay at
              // full strength regardless of position.
              let pendingIdx = -1;
              return todayRows.map((row, i) => {
                const key = row.kind === 'event' ? `e-${row.event.id}` : `${row.kind}-${row.task.id}`;
                const opacity = row.kind === 'done' ? 1 : Math.max(0.6, 1 - (++pendingIdx) * 0.09);
                return (
                <View key={key} style={{ opacity }}>
                  {i > 0 && <Divider />}
                  {row.kind === 'event' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                      <View style={{
                        width: 30, height: 30, borderRadius: radius.sm + 2,
                        alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash,
                      }}>
                        <IconClock size={16} color={t.nu} />
                      </View>
                      <Text style={{ color: t.ink2, fontSize: 16, flex: 1 }} numberOfLines={1}>{row.event.title}</Text>
                      <Text style={{ color: t.ink3, fontSize: 12.5 }}>{clock(row.event.startsAt)}</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                      <LabelTile id={row.task.label} />
                      <Pressable style={{ flex: 1 }}
                        onPress={() => router.push({ pathname: '/task/[id]', params: { id: row.task.id } })}>
                        <Text numberOfLines={1} style={{
                          color: row.kind === 'done' ? t.ink3 : t.ink, fontSize: 16,
                          textDecorationLine: row.kind === 'done' ? 'line-through' : 'none',
                        }}>{row.task.title}</Text>
                      </Pressable>
                      {row.kind === 'done'
                        ? <Text style={{ color: t.ra, fontSize: 12.5 }}>{clock(row.at)}</Text>
                        : !!row.task.due_at && row.task.has_time && (
                            <Text style={{ color: t.ink3, fontSize: 12.5 }}>{clock(row.task.due_at)}</Text>
                          )}
                      {row.kind !== 'done' && <Check tone="ra" onPress={() => tick(row.task.id)} />}
                    </View>
                  )}
                </View>
                );
              });
            })()}
          </Group>
        )}

        {/* The evening log, reachable any time — not only from the 20:00
            reminder, which never fires on web, with reminders off, or once
            the ladder has gone quiet. */}
        {!q && (
          <Pressable onPress={() => router.push('/retro')} hitSlop={8}
            style={{ alignSelf: 'flex-start', marginTop: 10, marginLeft: 4 }}>
            <Text style={{ color: t.nu, fontSize: 13.5 }}>Did something that isn't on here? Log it ›</Text>
          </Pressable>
        )}

        {/* Anytime — the rest of the water, all of it. */}
        {!q && !!anytime.length && (
          <Group title="Anytime">
            {anytime.map((task, i) => (
              <View key={task.id} style={{ opacity: Math.max(0.6, 1 - i * 0.06) }}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <LabelTile id={task.label} />
                  <Pressable style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}>
                    <Text numberOfLines={1} style={{ color: t.ink, fontSize: 16 }}>{task.title}</Text>
                  </Pressable>
                  {!!task.est_minutes && (
                    <Text style={{ color: t.ink3, fontSize: 12.5 }}>{task.est_minutes}m</Text>
                  )}
                  <Check tone="ra" onPress={() => tick(task.id)} />
                </View>
              </View>
            ))}
          </Group>
        )}

        {/* Habits — cue-linked, not clock-linked, and never a streak. See
            src/habits.ts for why a recurring task can't do this job. */}
        {!q && !!habits.length && (
          <Group title="Habits">
            {habits.map((h, i) => {
              const stats = habitStats[h.id];
              const done = stats?.doneToday ?? false;
              return (
                <View key={h.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    onLongPress={() => pauseThisHabit(h)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20 }} numberOfLines={2}>
                        {h.cue}, {h.action.charAt(0).toLowerCase()}{h.action.slice(1)}
                      </Text>
                      <Text style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>
                        {stats ? rateLine(stats) : ''} · hold to pause
                      </Text>
                    </View>
                    {done ? (
                      <Text style={{ color: t.ra, fontSize: 13, fontFamily: T.brand }}>Done today</Text>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {!!h.minimum && (
                          <Pressable onPress={() => markHabit(h, true)} style={{
                            paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill,
                            borderWidth: 1, borderColor: t.strokeStrong,
                          }}>
                            <Text style={{ color: t.ink2, fontSize: 12.5 }}>Minimum</Text>
                          </Pressable>
                        )}
                        <Check tone="ra" onPress={() => markHabit(h, false)} />
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
            <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 14 }} />
            <Pressable onPress={() => router.push('/habit')} style={{ padding: 14 }}>
              <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>+ New habit</Text>
            </Pressable>
          </Group>
        )}

        {/* Capture. */}
        {/* Two ways in: the form, and the sentence. */}
        {/* Opens the composer rather than accepting a bare title inline.
            The composer autofocuses the same field, so typing + return is still
            the whole interaction if that's all you want — but the type, the
            estimate, the date, the repeat and the priority are all VISIBLE at
            the one moment you have the context to set them. */}
        {/* Two ways in, side by side and equal: the FORM, and the SENTENCE.
            Some things are easier to tap than to say ("30m, Tuesday") and some
            are far easier to say than to tap ("gym tues and thurs at 7"). */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Press onPress={() => router.push('/compose')} scale={0.99} style={{ flex: 1 }}>
            <Surface>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 }}>
                <LinearGradient colors={t.nuBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 19, lineHeight: 22, fontFamily: T.brand }}>+</Text>
                </LinearGradient>
                <Text style={{ flex: 1, paddingLeft: 12, color: t.ink3, fontSize: 15.5 }}>Add anything…</Text>
              </View>
            </Surface>
          </Press>

          <Press onPress={() => router.push('/chat')} scale={0.97}>
            <Surface accent="ra">
              <View style={{ width: 58, height: 54, alignItems: 'center', justifyContent: 'center' }}>
                <Character name="ra-wave" size={40} motion="none" />
              </View>
            </Surface>
          </Press>
        </View>

        {/* The empty state is the only teaching this app gets, so it has to
            do real work: say what the two screens are FOR, and hand over three
            things to tap that leave something real behind. A blank list with
            "nothing here yet" tells a first-time user precisely nothing. */}
        {openCount === 0 && !q.trim() && (
          <Surface style={{ marginTop: 16 }}>
            <View style={{ padding: 18, gap: 14 }}>
              <Text style={{ color: t.ink, fontSize: 18, fontFamily: T.display, lineHeight: 25 }}>
                Two screens, that's all.
              </Text>

              <View style={{ gap: 11 }}>
                <View style={{ flexDirection: 'row', gap: 11 }}>
                  <Text style={{ color: t.nu, fontSize: 15, fontFamily: T.brand, width: 20 }}>1</Text>
                  <Text style={{ color: t.ink2, fontSize: 14.5, flex: 1, lineHeight: 21 }}>
                    <Text style={{ color: t.ink, fontFamily: T.brand }}>Here</Text> is everything you
                    have to do, next to what's already in your calendar. Nothing starts from this screen.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 11 }}>
                  <Text style={{ color: t.ra, fontSize: 15, fontFamily: T.brand, width: 20 }}>2</Text>
                  <Text style={{ color: t.ink2, fontSize: 14.5, flex: 1, lineHeight: 21 }}>
                    <Text style={{ color: t.ink, fontFamily: T.brand }}>Focus</Text> hands you exactly
                    one of them and hides the rest. That's where things actually get done.
                  </Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: t.stroke, marginVertical: 2 }} />

              <Text style={{ color: t.ink3, fontSize: 13.5 }}>Put something in — try one of these:</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['email the registrar', 'book the dentist', 'take out the bins'].map(x => (
                  <Pressable key={x}
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      animateNext('add');
                      await capture(x);
                      showToast('+1 \u2726');
                      setThinking(true);
                      await refresh();
                    }}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill,
                      borderWidth: 1.5, borderColor: t.stroke, backgroundColor: t.nuWash,
                    }}>
                    <Text style={{ color: t.ink2, fontSize: 13.5 }}>{x}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Surface>
        )}

        {!!q.trim() && (
          <Group title={`${hits.length} match${hits.length === 1 ? '' : 'es'}`}>
            {!hits.length ? (
              <Text style={{ color: t.ink3, fontSize: 14, padding: 16 }}>Nothing matches “{q}”.</Text>
            ) : hits.map((task, i) => (
              <View key={task.id}>
                {i > 0 && <Divider />}
                <Pressable
                  onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 11,
                    paddingHorizontal: 14, paddingVertical: 13,
                    backgroundColor: pressed ? t.subtle : 'transparent',
                  })}>
                  <LabelTile id={task.label} size={28} />
                  <Text style={{
                    color: task.state === 'done' ? t.ink3 : t.ink, fontSize: 16, flex: 1,
                    textDecorationLine: task.state === 'done' ? 'line-through' : 'none',
                  }} numberOfLines={2}>{task.title}</Text>
                  <IconChevron size={15} color={t.ink3} />
                </Pressable>
              </View>
            ))}
          </Group>
        )}

        {/* Energy used to sit here, and it was the wrong place: it asks how you
            FEEL on the screen where you're writing down what you have to DO,
            and it does nothing until Focus reads it. It now lives in Focus,
            asked at the one moment it changes what happens next. */}

        {/* Contextual asks, one at a time. */}
        {calAsk && (
          <Pressable onPress={connectCalendar} style={{ marginTop: 16 }}>
            <Surface accent="ra">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, paddingHorizontal: 14 }}>
                <IconClock size={18} color={t.ra} />
                <Text style={{ color: t.ink2, fontSize: 14, flex: 1, lineHeight: 19 }}>
                  Show your calendar here — read only.
                </Text>
                <Text style={{ color: t.ra, fontSize: 14, fontFamily: T.brand }}>Connect</Text>
              </View>
            </Surface>
          </Pressable>
        )}
        {askNudge && !calAsk && (
          <Surface style={{ marginTop: 16 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingVertical: 13, paddingHorizontal: 14,
          }}>
            <Text style={{ color: t.ink2, fontSize: 14, flex: 1, lineHeight: 19 }}>
              Reminders? They get quieter if you're not answering.
            </Text>
            <Pressable onPress={() => answerNudge(false)} hitSlop={8}>
              <Text style={{ color: t.ink3, fontSize: 13.5 }}>No</Text>
            </Pressable>
            <Pressable onPress={() => answerNudge(true)} hitSlop={8}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: t.nu }}>
              <Text style={{ color: '#0B1029', fontSize: 14, fontFamily: T.brand }}>Yes</Text>
            </Pressable>
          </View>
          </Surface>
        )}

        {showRecovery && (
          <Surface accent="nu" style={{ marginTop: 16 }}>
            <View style={{ padding: 14, gap: 10 }}>
              <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 19 }}>
                {todayPendingCount} things still waiting on today, and none of them have landed yet.
                Want a quick pass through them instead?
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setRecoveryDismissed(true)} hitSlop={8} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: t.ink3, fontSize: 13.5 }}>Not now</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => router.push('/triage')}
                    style={{ paddingVertical: 10, borderRadius: radius.pill, backgroundColor: t.nu, alignItems: 'center' }}>
                    <Text style={{ color: '#0B1029', fontSize: 14, fontFamily: T.brand }}>One pass</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Surface>
        )}

        {/* The primary action — last in flow, not pinned outside it. See the
            note at the top of this file for why. */}
        <View style={{ marginTop: 16 }}>
          <Primary label="Focus on one thing" tone="ra" onPress={toRa}
            icon={<IconChevron size={21} color={t.onRa} />} />
        </View>
      </ScrollView>

      {!!checkInTask && (
        <ActionSheet
          visible
          title="This one keeps slipping"
          subtitle={checkInTask.title}
          actions={checkInActions}
          dismissLabel="Not now"
          onDismiss={async () => {
            const seen = checkInTask;
            setCheckInTask(null);
            await markCheckInSeen(seen);
          }}
        />
      )}
    </SafeAreaView>
  );
}
