import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { search as searchTasks, type Task } from '../db';
import { radius, type as T } from '../theme';
import { LabelTile } from '../components/LabelIcon';
import { formatDue } from '../components/DatePicker';
import { PriorityChip } from '../components/PriorityChip';
import { TaskSheet } from '../components/TaskSheet';
import { AppMenu } from '../components/AppMenu';
import { IconButton, MenuGlyph } from '../components/IconButton';
import { SearchField } from '../components/SearchField';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';
import { AddToToday } from '../components/TaskRow';
import { useTaskActions } from '../useTaskActions';
import { Mica, Surface, Character, Primary, IconChevron, IconCalendar, IconSearch, Check, Press, poseImage } from '../ui';

const wordmark = require('../../assets/brand/wordmark-tight.png');

/** A calm sea for the top of Nu: a gentle wave at `y`, filled to the bottom. */
const seaLine = (w: number, y: number, amp: number) =>
  `M0 ${y} Q ${w * 0.125} ${y - amp} ${w * 0.25} ${y} T ${w * 0.5} ${y} T ${w * 0.75} ${y} T ${w} ${y}`;
const sea = (w: number, y: number, amp: number) => `${seaLine(w, y, amp)} V 150 H 0 Z`;

/** High before Medium before Low before none; then the soonest date; then the oldest. */
const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

const dueOf = (x: Task) => (x.due_at ? formatDue(x.due_at, !!x.has_time) : null);

function Header({ title, count }: { title: string; count?: number }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand, marginBottom: 8, marginLeft: 4 }}>
      {title.toUpperCase()}{count ? `  ·  ${count}` : ''}
    </Text>
  );
}

function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 58 }} />;
}

/** A task on your Today: tick it off, tap to focus on it, hold for more. */
function TodayRow({ task, first, project, onFocus, onHold, onTick }: {
  task: Task; first: boolean; project?: string; onFocus: () => void; onHold: () => void; onTick: () => void;
}) {
  const t = useTheme();
  const due = dueOf(task);
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onFocus(); }}
      onLongPress={() => { Haptics.selectionAsync(); onHold(); }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: first ? 16 : 13,
        backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      <Check tone="ra" onPress={onTick} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: t.ink, fontSize: first ? 17.5 : 16, fontFamily: first ? T.brand : undefined }}>
          {task.title}
        </Text>
        {(!!due || !!task.est_minutes || !!project) && (
          <Text style={{ color: t.ink3, fontSize: 12.5 }} numberOfLines={1}>
            {[project, due, task.est_minutes ? `${task.est_minutes} min` : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <PriorityChip n={task.priority ?? 0} />
      <IconChevron size={15} color={t.ink3} />
    </Pressable>
  );
}

/** A task in everything else: tap for details, "+" puts it on Today. */
function RestRow({ task, onOpen, onHold, onAdd }: { task: Task; onOpen: () => void; onHold: () => void; onAdd: () => void }) {
  const t = useTheme();
  const later = !!task.snoozed_until && task.snoozed_until > Date.now();
  const due = dueOf(task);
  return (
    <Pressable onPress={onOpen} onLongPress={() => { Haptics.selectionAsync(); onHold(); }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: pressed ? t.subtle : 'transparent', opacity: later ? 0.55 : 1,
      })}>
      {!!task.label && <LabelTile id={task.label} size={30} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15.5 }}>{task.title}</Text>
        {(later || !!due) && <Text style={{ color: t.ink3, fontSize: 12 }}>{later ? 'later' : due}</Text>}
      </View>
      <PriorityChip n={task.priority ?? 0} />
      <AddToToday title={task.title} onPress={onAdd} size={32} />
    </Pressable>
  );
}

/**
 * NU — everything you're carrying, and what you've picked for today. The
 * list-first home, kept alongside NuHome (index.tsx picks one); both are
 * built from the same shared pieces (useTaskActions, TaskSheet, AppMenu,
 * HomeAsks, SlippingCheckIn…).
 *
 *   1. ADD — one tap to put something down (or say it to Ra).
 *   2. TODAY — what YOU picked, in the order Focus will take it: your
 *      priority labels, then the date. Tap one to focus on it.
 *   3. PROJECTS — each with the one move that's up next.
 *   4. EVERYTHING ELSE — the plain list, High first. "+" puts a task on
 *      Today; hold any task to set its priority or do something else with it.
 */
export default function Nu() {
  const t = useTheme();
  const { width: W } = useWindowDimensions();
  const { inbox, todayPicked, projects, moveIds, toRa, focusOn, wins, profile } = useStore();
  const { tick, addToToday } = useTaskActions();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [searching, setSearching] = useState(false);
  const [held, setHeld] = useState<Task | null>(null);        // the long-press sheet
  const [nav, setNav] = useState(false);                      // the menu

  const today = useMemo(() => [...todayPicked].filter(x => !x.parent_id).sort(byPriority), [todayPicked]);
  // a project's current move is listed under its project, not a second time here
  const rest = useMemo(() => {
    const now = Date.now();
    const snoozed = (x: Task) => !!x.snoozed_until && x.snoozed_until > now;
    return [...inbox].filter(x => !moveIds.includes(x.id))
      .sort((a, b) => Number(snoozed(a)) - Number(snoozed(b)) || byPriority(a, b));
  }, [inbox, moveIds]);
  const watched = useMemo(() => [...today, ...rest], [today, rest]);   // for the slipping check-in
  /** which project a task on Today is the move for */
  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p.project.title])), [projects]);

  const doneToday = wins.filter(w => w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      {/* the name, and the tools: calendar, search, the menu */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        {searching ? (
          <SearchField value={q} onChange={setQ} onCancel={() => setSearching(false)} />
        ) : (
          <>
            <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
              style={{ width: 70, height: 20, tintColor: t.ink, flexShrink: 0 }} />
            <View style={{ flex: 1 }} />
            <IconButton label="Calendar" size={44} onPress={() => router.push('/calendar')}><IconCalendar size={21} color={t.ink} /></IconButton>
            <IconButton label="Search" size={44} onPress={() => setSearching(true)}><IconSearch size={21} color={t.ink} /></IconButton>
            <IconButton label="Menu" size={44} onPress={() => setNav(true)}><MenuGlyph /></IconButton>
          </>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 18 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Nu's water — your greeting over a calm sea, and Nu in it */}
        <View style={{ height: 150, marginHorizontal: -16, marginTop: -6 }}>
          <View style={{ position: 'absolute', left: 20, top: 8, right: 138 }}>
            <Text style={{ color: t.ink, fontSize: 28, fontFamily: T.display, letterSpacing: -0.7, lineHeight: 34 }}>
              {greeting}{firstName ? `,\n${firstName}` : ''}.
            </Text>
            <Pressable onPress={() => router.push('/tide')} hitSlop={6}>
              <Text style={{ color: t.ink2, fontSize: 14, marginTop: 5 }}>
                {doneToday ? `${doneToday} done today · ` : ''}<Text style={{ color: t.nu, fontFamily: T.brand }}>Your day ›</Text>
              </Text>
            </Pressable>
          </View>
          <Image source={poseImage('nu-surface')} resizeMode="contain"
            style={{ position: 'absolute', right: 18, top: 24, width: 116, height: 116 }} />
          <Svg width={W} height={150} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Defs>
              <SvgGradient id="nu-sea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.key === 'nu' ? '#153E6A' : '#C9CCF2'} stopOpacity={t.key === 'nu' ? 0.8 : 0.7} />
                <Stop offset="1" stopColor={t.base} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Path d={sea(W, 112, 6)} fill="url(#nu-sea)" />
            <Path d={seaLine(W, 112, 6)} stroke={t.key === 'nu' ? 'rgba(184,229,248,0.6)' : 'rgba(67,56,202,0.3)'} strokeWidth={2} fill="none" />
          </Svg>
        </View>

        {/* 1. ADD — and, for something too big to be one task, Nu's planner */}
        <View style={{ gap: 10 }}>
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
          <Pressable onPress={() => router.push('/project/new')} hitSlop={6}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
            <Character name="nu-thinking" size={26} motion="none" />
            <Text style={{ flex: 1, color: t.ink2, fontSize: 14 }}>
              Something bigger? <Text style={{ color: t.nu, fontFamily: T.brand }}>Plan it with Nu ›</Text>
            </Text>
          </Pressable>
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
                    <Pressable onPress={() => open(task)}
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
                    <TodayRow task={task} first={i === 0} project={projectOf.get(task.id)}
                      onFocus={() => focusOn(task.id)} onHold={() => setHeld(task)} onTick={() => tick(task.id)} />
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

            {/* 3. PROJECTS — each with the one move that's up next. The path
                itself stays behind "Path", never spread out on this screen. */}
            {!!projects.length && (
              <View>
                <Header title="Projects" count={projects.length} />
                <View style={{ gap: 10 }}>
                  {projects.map(p => (
                    <Surface key={p.project.id} accent="nu">
                      <Pressable onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })}
                        style={({ pressed }) => ({ padding: 14, gap: 9, backgroundColor: pressed ? t.subtle : 'transparent' })}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ flex: 1, color: t.ink, fontSize: 16.5, fontFamily: T.brand }} numberOfLines={1}>{p.project.title}</Text>
                          <Text style={{ color: t.ink3, fontSize: 12.5 }}>
                            {p.done ? `${p.done} done · ` : ''}<Text style={{ color: t.nu }}>Path ›</Text>
                          </Text>
                        </View>
                        {p.current ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.6, fontFamily: T.brand }}>UP NEXT</Text>
                              <Text style={{ color: t.ink, fontSize: 15, lineHeight: 21 }} numberOfLines={2}>{p.current.title}</Text>
                            </View>
                            <Pressable onPress={() => { Haptics.selectionAsync(); if (p.current?.task_id) focusOn(p.current.task_id); }}
                              accessibilityLabel={`Focus on ${p.current.title}`}
                              style={({ pressed }) => ({
                                paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill,
                                backgroundColor: t.ra, opacity: pressed ? 0.85 : 1,
                              })}>
                              <Text style={{ color: t.onRa, fontSize: 13.5, fontFamily: T.brand }}>Focus</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Text style={{ color: t.ink2, fontSize: 14 }}>
                            No move chosen yet. <Text style={{ color: t.nu }}>Find the next one ›</Text>
                          </Text>
                        )}
                      </Pressable>
                    </Surface>
                  ))}
                </View>
              </View>
            )}

            {/* 4. EVERYTHING ELSE — the plain list, High first */}
            {!!rest.length && (
              <View>
                <Header title="Everything else" count={rest.length} />
                <Surface>
                  {rest.map((task, i) => (
                    <View key={task.id}>
                      {i > 0 && <Divider />}
                      <RestRow task={task} onOpen={() => open(task)} onHold={() => setHeld(task)} onAdd={() => addToToday(task)} />
                    </View>
                  ))}
                </Surface>
                <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 8, marginLeft: 4 }}>
                  Hold a task to set its priority.
                </Text>
              </View>
            )}

            <HomeAsks taskCount={inbox.length + todayPicked.length} />
          </>
        )}
      </ScrollView>

      {/* pinned to the bottom, where the thumb is — it opens the task it names */}
      {!q.trim() && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
          <Primary label={today.length ? `Focus · ${today[0].title}` : 'Focus'} tone="ra"
            onPress={() => (today.length ? focusOn(today[0].id) : toRa())} />
        </View>
      )}

      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <AppMenu visible={nav} onClose={() => setNav(false)} />
      <SlippingCheckIn tasks={watched} paused={!!q.trim()} />
    </SafeAreaView>
  );
}
