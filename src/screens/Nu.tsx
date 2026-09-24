import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import {
  complete, pickForToday, getFlag, setFlag, notNow, dropTask, updateTask,
  checkInDue, markCheckInSeen, getBlockers, search as searchTasks, type Task,
} from '../db';
import { PRIORITIES } from '../priority';
import { requestPermission, setupSchedules } from '../notifications';
import { radius, type as T } from '../theme';
import { LabelTile } from '../components/LabelIcon';
import { formatDue } from '../components/DatePicker';
import { PriorityChip } from '../components/PriorityChip';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';
import { Mica, Surface, Character, Primary, IconChevron, IconCalendar, IconSearch, Check, Press, animateNext } from '../ui';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/**
 * NU — everything you're carrying, and what you've picked for today.
 *
 * Three things, and only three, because the whole idea of Nura is that a
 * busy list is what stops people starting — and this screen had become the
 * busiest in the app (a hero card, a deck, a progress strip, a done-list with
 * calendar events, habits, two permission cards, two evening cards, a tide
 * line). Kim, using it for real: "extremely busy, and goes against Nura's
 * idea". What's left:
 *
 *   1. ADD — one tap to put something down (or say it to Ra).
 *   2. TODAY — what YOU picked, in the order Focus will take it: your
 *      priority labels, then the date. Tap one to focus on it.
 *   3. EVERYTHING ELSE — the plain list, High first. "+" puts a task on
 *      Today; hold any task to set its priority or do something else with it.
 *
 * Nothing is chosen for you here, and Focus only works from your Today (or
 * offers suggestions when it's empty). Progress, the done-list and the day's
 * shape live on "Your day" (the tide), one tap from the greeting.
 */
export default function Nu() {
  const t = useTheme();
  const { inbox, todayPicked, toRa, focusOn, refresh, wins, profile } = useStore();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [menu, setMenu] = useState<Task | null>(null);        // the long-press sheet
  const [checkInTask, setCheckInTask] = useState<Task | null>(null);
  const [askNudge, setAskNudge] = useState(false);
  const [eveningAsk, setEveningAsk] = useState(false);

  const today = useMemo(() => [...todayPicked].filter(x => !x.parent_id).sort(byPriority), [todayPicked]);
  const rest = useMemo(() => {
    const now = Date.now();
    const snoozed = (x: Task) => !!x.snoozed_until && x.snoozed_until > now;
    // "later" and "waiting" tasks stay in the list — Nu holds everything —
    // but sink to the bottom, quieter
    return [...inbox].sort((a, b) => Number(snoozed(a)) - Number(snoozed(b)) || byPriority(a, b));
  }, [inbox]);

  const doneToday = wins.filter(w => w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];

  /* ---- search ---- */
  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  /* ---- the few things that still ask, each once, in context ---- */
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web' && !(await getFlag('notif_asked')) && inbox.length + todayPicked.length >= 1) setAskNudge(true);
    })();
  }, [inbox.length, todayPicked.length]);

  const eveningKey = `evening.asked.${new Date().toDateString()}`;
  useEffect(() => {
    (async () => {
      if (new Date().getHours() < 18 || (await getFlag(eveningKey))) return;
      setEveningAsk((await getBlockers()).includes('returning'));   // promised in onboarding
    })();
  }, [eveningKey]);

  // a task that keeps slipping gets one kind check-in, never a red badge
  useEffect(() => {
    (async () => {
      if (checkInTask || q.trim()) return;
      for (const task of [...today, ...rest]) if (await checkInDue(task)) { setCheckInTask(task); return; }
    })();
  }, [today, rest, checkInTask, q]);

  /* ---- actions ---- */
  const tick = async (id: string) => {
    const award = await complete(id);
    useStore.getState().celebrate(award);
    animateNext('remove');
    await refresh();
  };
  const addToToday = async (task: Task) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateNext('move');
    await pickForToday(task.id, true);
    await refresh();
  };
  const setPriority = async (task: Task, n: number) => {
    Haptics.selectionAsync();
    await updateTask(task.id, { priority: n });
    setMenu(m => (m ? { ...m, priority: n } : m));
    await refresh();
  };
  const answerNudge = async (yes: boolean) => {
    setAskNudge(false);
    await setFlag('notif_asked', '1');
    if (yes && await requestPermission()) await setupSchedules();
  };
  const closeEvening = async (log: boolean) => {
    setEveningAsk(false);
    await setFlag(eveningKey, '1');
    if (log) router.push('/retro');
  };

  const menuActions: SheetAction[] = menu ? [
    { key: 'focus', glyph: '▶', label: 'Focus on this now', onPress: () => focusOn(menu.id) },
    menu.state === 'inbox'
      ? { key: 'today', glyph: '+', label: 'Add to Today', onPress: () => addToToday(menu) }
      : { key: 'today', glyph: '−', label: 'Take off Today', sub: 'back into everything else',
          onPress: async () => { await pickForToday(menu.id, false); await refresh(); } },
    { key: 'open', glyph: '✎', label: 'Details', sub: 'first move, length, date, steps',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: menu.id } }) },
    { key: 'later', glyph: '↓', label: 'Later today', sub: 'out of the way for a few hours',
      onPress: async () => { await notNow(menu.id); await refresh(); } },
    { key: 'drop', glyph: '×', label: 'Let it go', sub: 'gone, no explanation needed',
      onPress: async () => { await dropTask(menu.id); await refresh(); } },
  ] : [];

  const checkInActions: SheetAction[] = checkInTask ? [
    { key: 'smaller', glyph: '◊', label: 'Too big — make it smaller', sub: 'break it into a first, smaller step',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: checkInTask.id, focus: 'steps' } }) },
    { key: 'waiting', glyph: '⋯', label: "Blocked — I'm waiting on someone", sub: 'stays in the list, stops being asked',
      onPress: async () => { await notNow(checkInTask.id, 3 * 24 * 60); await refresh(); } },
    { key: 'when', glyph: '↓', label: 'Wrong time — change the date', sub: 'open it and pick a date that fits',
      onPress: () => router.push({ pathname: '/task/[id]', params: { id: checkInTask.id } }) },
    { key: 'drop', glyph: '×', label: 'Not important anymore', sub: 'gone, no explanation needed',
      onPress: async () => { await dropTask(checkInTask.id); await refresh(); } },
  ] : [];

  /* ---- pieces ---- */
  const Header = ({ title, count }: { title: string; count?: number }) => (
    <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand, marginBottom: 8, marginLeft: 4 }}>
      {title.toUpperCase()}{count ? `  ·  ${count}` : ''}
    </Text>
  );
  const Divider = () => <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 58 }} />;
  const due = (x: Task) => (x.due_at ? formatDue(x.due_at, !!x.has_time) : null);

  const TodayRow = ({ task, first }: { task: Task; first: boolean }) => (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); focusOn(task.id); }}
      onLongPress={() => { Haptics.selectionAsync(); setMenu(task); }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: first ? 16 : 13,
        backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      <Check tone="ra" onPress={() => tick(task.id)} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: t.ink, fontSize: first ? 17.5 : 16, fontFamily: first ? T.brand : undefined }}>
          {task.title}
        </Text>
        {(!!due(task) || !!task.est_minutes) && (
          <Text style={{ color: t.ink3, fontSize: 12.5 }}>
            {[due(task), task.est_minutes ? `${task.est_minutes} min` : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <PriorityChip n={task.priority ?? 0} />
      <IconChevron size={15} color={t.ink3} />
    </Pressable>
  );

  const RestRow = ({ task }: { task: Task }) => {
    const later = !!task.snoozed_until && task.snoozed_until > Date.now();
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
        onLongPress={() => { Haptics.selectionAsync(); setMenu(task); }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: pressed ? t.subtle : 'transparent', opacity: later ? 0.55 : 1,
        })}>
        <LabelTile id={task.label} size={30} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15.5 }}>{task.title}</Text>
          {(later || !!due(task)) && (
            <Text style={{ color: t.ink3, fontSize: 12 }}>{later ? 'later' : due(task)}</Text>
          )}
        </View>
        <PriorityChip n={task.priority ?? 0} />
        <Pressable onPress={() => addToToday(task)} hitSlop={8}
          accessibilityLabel={`Add ${task.title} to Today`}
          style={{
            width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: t.strokeStrong,
          }}>
          <Text style={{ color: t.ink2, fontSize: 18, lineHeight: 20 }}>+</Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      {/* tools: calendar, search, you */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
        <Pressable onPress={() => router.push('/calendar')} hitSlop={8} style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.layer, borderWidth: 1, borderColor: t.stroke,
        }}>
          <IconCalendar size={19} color={t.ink2} />
        </Pressable>
        <Surface style={{ flex: 1 }} raised={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <IconSearch size={17} color={t.ink3} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.ink3}
              style={{ flex: 1, paddingVertical: 10, paddingLeft: 9, color: t.ink, fontSize: 15 }} />
            {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Text style={{ color: t.ink3, fontSize: 17 }}>×</Text></Pressable>}
          </View>
        </Surface>
        <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
          <View style={{
            width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.layer, borderWidth: 2, borderColor: t.ra,
          }}>
            <Character name="nu-idle" motion="none" size={40} />
          </View>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 18 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* greeting, and the one door to everything about your day */}
        <View>
          <Text style={{ color: t.ink, fontSize: 26, fontFamily: T.display, letterSpacing: -0.6, lineHeight: 32 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
          <Pressable onPress={() => router.push('/tide')} hitSlop={6}>
            <Text style={{ color: t.ink3, fontSize: 13.5, marginTop: 3 }}>
              {doneToday ? `${doneToday} done today · ` : ''}<Text style={{ color: t.nu }}>Your day ›</Text>
            </Text>
          </Pressable>
        </View>

        {/* 1. ADD */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
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
              <View style={{ width: 54, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <Character name="ra-wave" size={38} motion="none" />
              </View>
            </Surface>
          </Press>
        </View>

        {!!q.trim() ? (
          <View>
            <Header title={`${hits.length} match${hits.length === 1 ? '' : 'es'}`} />
            <Surface>
              {!hits.length
                ? <Text style={{ color: t.ink3, fontSize: 14, padding: 16 }}>Nothing matches “{q}”.</Text>
                : hits.map((task, i) => (
                  <View key={task.id}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 13 }}>
                      <LabelTile id={task.label} size={28} />
                      <Text numberOfLines={2} style={{
                        flex: 1, fontSize: 16, color: task.state === 'done' ? t.ink3 : t.ink,
                        textDecorationLine: task.state === 'done' ? 'line-through' : 'none',
                      }}>{task.title}</Text>
                    </Pressable>
                  </View>
                ))}
            </Surface>
          </View>
        ) : (
          <>
            {/* 2. TODAY — yours, in your order */}
            <View>
              <Header title="Today" count={today.length || undefined} />
              <Surface accent={today.length ? 'ra' : undefined}>
                {today.length ? today.map((task, i) => (
                  <View key={task.id}>
                    {i > 0 && <Divider />}
                    <TodayRow task={task} first={i === 0} />
                  </View>
                )) : (
                  <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 21, padding: 16 }}>
                    {rest.length
                      ? 'Nothing picked yet. Tap + on anything below to put it on Today.'
                      : 'Nothing here yet. Add what’s on your plate.'}
                  </Text>
                )}
              </Surface>
            </View>

            {/* 3. EVERYTHING ELSE — the plain list, High first */}
            {!!rest.length && (
              <View>
                <Header title="Everything else" count={rest.length} />
                <Surface>
                  {rest.map((task, i) => (
                    <View key={task.id}>
                      {i > 0 && <Divider />}
                      <RestRow task={task} />
                    </View>
                  ))}
                </Surface>
                <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 8, marginLeft: 4 }}>
                  Hold a task to set its priority.
                </Text>
              </View>
            )}

            {/* at most one quiet, contextual ask at a time */}
            {eveningAsk ? (
              <Surface accent="ra">
                <View style={{ padding: 14, gap: 10 }}>
                  <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>What did you actually do today?</Text>
                  <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 19 }}>Small things count — they’re usually the ones that never get written down.</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => closeEvening(false)} hitSlop={8} style={{ paddingVertical: 8 }}>
                      <Text style={{ color: t.ink3, fontSize: 13.5 }}>Not tonight</Text>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Pressable onPress={() => closeEvening(true)}
                        style={{ paddingVertical: 10, borderRadius: radius.pill, backgroundColor: t.ra, alignItems: 'center' }}>
                        <Text style={{ color: t.onRa, fontSize: 14, fontFamily: T.brand }}>Log it</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Surface>
            ) : askNudge ? (
              <Surface>
                <View style={{ padding: 14, gap: 10 }}>
                  <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 19 }}>
                    Want a nudge now and then? They get quieter if you’re not answering.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => answerNudge(false)} hitSlop={8} style={{ paddingVertical: 8 }}>
                      <Text style={{ color: t.ink3, fontSize: 13.5 }}>No thanks</Text>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Pressable onPress={() => answerNudge(true)}
                        style={{ paddingVertical: 10, borderRadius: radius.pill, backgroundColor: t.nu, alignItems: 'center' }}>
                        <Text style={{ color: '#0B1029', fontSize: 14, fontFamily: T.brand }}>Yes</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Surface>
            ) : null}

            {/* opens the task it names — toRa() would reopen whatever was
                picked earlier, even after a higher priority went on top */}
            <Primary label={today.length ? `Focus · ${today[0].title}` : 'Focus'} tone="ra"
              onPress={() => (today.length ? focusOn(today[0].id) : toRa())} />
          </>
        )}
      </ScrollView>

      {/* hold a task: its priority, and what else you can do with it */}
      <ActionSheet visible={!!menu} title={menu?.title ?? ''} actions={menuActions}
        dismissLabel="Done" onDismiss={() => setMenu(null)}>
        {!!menu && (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 8 }}>PRIORITY</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[...PRIORITIES].reverse().map(p => {
                const on = (menu.priority ?? 0) === p.n;
                const c = p.n ? p.color : t.ink2;
                return (
                  <Pressable key={p.n} onPress={() => setPriority(menu, p.n)} style={{
                    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill,
                    borderWidth: 1.5, borderColor: on ? c : t.strokeStrong, backgroundColor: on ? `${c}26` : 'transparent',
                  }}>
                    <Text style={{ color: on ? c : t.ink2, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ActionSheet>

      <ActionSheet visible={!!checkInTask} title="This one keeps slipping" subtitle={checkInTask?.title}
        actions={checkInActions} dismissLabel="It's fine, keep it"
        onDismiss={async () => { if (checkInTask) await markCheckInSeen(checkInTask); setCheckInTask(null); }} />
    </SafeAreaView>
  );
}
