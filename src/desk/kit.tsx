import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, TextInput, Pressable, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { create } from 'zustand';
import { useStore, useTheme } from '../store';
import { pickForToday, updateTask, capture, type Task } from '../db';
import { parseTask } from '../assistant';
import { router } from 'expo-router';
import { understandLocal } from '../understand';
import { getLanguage } from '../planner';
import { readOf } from '../components/CaptureSheet';
import { type as T, type Theme } from '../theme';
import { poseImage } from '../ui';
import { Image } from 'react-native';
import { decorative } from '../a11y';

/**
 * THE DESKTOP KIT (src/components/Desk.tsx is the frame). The pieces the three
 * desktop rooms share: a card, the room's header with Tell Nu, a task as a row
 * with its moves on hover, and a line to add one. Every colour comes from the
 * room's palette, so each piece works on cream and on navy (rule 10).
 */

export const CORAL = '#FF6B35';
export const ON_CORAL = '#3B1204';
export const DAY = 86400_000;
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const day0 = (d: Date | number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d: Date | number, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a: Date | number | null | undefined, b: Date | number | null | undefined) =>
  a != null && b != null && day0(a).getTime() === day0(b).getTime();

/** "Today", "Tomorrow", a weekday this week, else "Oct 12". */
export function rel(ms: number | null | undefined) {
  if (ms == null) return '';
  const d = new Date(ms);
  const diff = Math.round((day0(d).getTime() - day0(Date.now()).getTime()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return WD[d.getDay()];
  return `${MO[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** "7:00" and "am" for minutes after midnight (past midnight wraps). */
export function clockParts(min: number) {
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  return { time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ampm: h < 12 ? 'am' : 'pm' };
}

/** What the desktop rooms remember between them: the Calendar's view and its picked day (Home's week opens it). */
export const useDeskState = create<{ calMode: 'week' | 'month'; calOff: number; calDay: number | null }>(() => ({
  calMode: 'week', calOff: 0, calDay: null,
}));

/** The colours the desktop adds on top of the room's palette, for each light. */
export function useDeskTokens() {
  const t = useTheme();
  return deskTokens(t);
}
export function deskTokens(t: Theme) {
  const dark = t.key === 'nu';
  return {
    dark,
    /** the text coral: readable on either ground */
    raText: dark ? '#FF9A70' : t.raDeep,
    /** a hover or a quiet fill */
    wash: dark ? 'rgba(255,255,255,0.07)' : 'rgba(23,19,19,0.05)',
    pick: dark ? 'rgba(255,255,255,0.12)' : 'rgba(23,19,19,0.08)',
    /** a field's fill (Tell Nu, search) */
    field: dark ? 'rgba(16,22,58,0.85)' : '#FFFFFF',
    /** the sidebar over the room's ground */
    side: dark ? 'rgba(3,6,24,0.35)' : 'rgba(243,238,226,0.65)',
    /** a card's lift: none on navy, a soft one on cream */
    shadow: dark ? null : { shadowColor: '#171313', shadowOpacity: 0.05, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } },
    /** the water on Tasks */
    sea: dark ? ['#2B4A7C', '#1F3764', '#131F45'] as const : ['#C9DAEE', '#DCE6F1', '#EEF1F2'] as const,
    seaLine: dark ? 'rgba(255,255,255,0.55)' : 'rgba(43,74,124,0.35)',
    lane: dark ? 'rgba(6,12,38,0.28)' : 'rgba(255,255,255,0.7)',
    seaInk: dark ? '#A9B8DC' : '#4A4340',
    /** the ghost of a dot-matrix digit */
    ghost: dark ? 'rgba(255,255,255,0.12)' : 'rgba(23,19,19,0.10)',
  };
}

/** A card: a fill and a hairline (rule 1), a soft lift on cream. */
export function DeskCard({ children, style, onPress, accessibilityLabel }: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const k = deskTokens(t);
  const [hover, setHover] = useState(false);
  const body = (
    <>
      <LinearGradient pointerEvents="none" colors={t.surface} style={{ position: 'absolute', inset: 0, borderRadius: 20 }} />
      {children}
    </>
  );
  const frame: ViewStyle = {
    borderRadius: 20, borderWidth: 1, borderColor: onPress && hover ? t.ra : t.stroke,
    paddingVertical: 22, paddingHorizontal: 24, ...(k.shadow ?? {}),
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
        accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[frame, style]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[frame, style]}>{body}</View>;
}

/** A small uppercase label over a card's contents. */
export function Label({ children, color, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ color: color ?? t.ink3, fontSize: 12.5, letterSpacing: 1.5, fontFamily: T.display, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** A text button: ink, coral under the pointer. */
export function LinkButton({ label, onPress, size = 15, accessibilityLabel }: { label: string; onPress: () => void; size?: number; accessibilityLabel?: string }) {
  const t = useTheme();
  const k = deskTokens(t);
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} hitSlop={6}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      <Text style={{ color: hover ? k.raText : t.ink, fontSize: size, fontFamily: T.display }}>{label}</Text>
    </Pressable>
  );
}

/** A key, drawn as a keycap. */
export function Key({ k }: { k: string }) {
  const t = useTheme();
  return (
    <View style={{ minWidth: 23, height: 23, paddingHorizontal: 5, borderRadius: 5, borderWidth: 1, borderColor: t.strokeStrong, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 }}>
      <Text style={{ color: t.ink, fontSize: 12.5, fontFamily: T.brand }}>{k}</Text>
    </View>
  );
}

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName));
};
/** Is this room the screen in front? (It stays mounted under a screen pushed over it.) */
function useInFront() {
  const front = useRef(true);
  useFocusEffect(useCallback(() => { front.current = true; return () => { front.current = false; }; }, []));
  return front;
}

/** How many rooms in front have a Tell Nu field, so ⌘K knows where to go (src/components/Desk.tsx). */
let tellFields = 0;
export const hasTellField = () => tellFields > 0;

/** A key pressed on the room in front, not in a field and without a modifier held. */
export function usePageKeys(fn: (e: KeyboardEvent) => void, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  const front = useInFront();
  useEffect(() => {
    if (Platform.OS !== 'web' || !on) return;
    const onKey = (e: KeyboardEvent) => {
      if (!front.current || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (useStore.getState().telling) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
}

/**
 * The room's header: its name, what belongs beside it (the date, search, the
 * calendar's arrows), and Tell Nu on the right. Enter puts it down right there
 * (a goal goes to the planner); ⌘K comes here.
 */
export function DeskHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ height: 96, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 0, color: t.ink, fontSize: 32, letterSpacing: -1, fontFamily: T.display }}>{title}</Text>
      {children}
      <TellNuField />
    </View>
  );
}

/**
 * Tell Nu on the desk. Enter puts it down where you are: Nu reads it the way
 * the Tell Nu sheet does (the phone's own read, instant), a goal goes straight
 * to the planner, and the field stays ready for the next one. Nu, on the
 * left, opens the whole sheet (When, How long, voice) with what's typed.
 * `stacked`: the full-width bar across the top of Home, not the end of a
 * header row.
 */
export function TellNuField({ stacked }: { stacked?: boolean } = {}) {
  const t = useTheme();
  const k = deskTokens(t);
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const input = useRef<TextInput>(null);
  // ⌘K (Ctrl K) comes here from anywhere in the room, while it's in front
  useFocusEffect(useCallback(() => { tellFields++; return () => { tellFields--; }; }, []));
  const front = useInFront();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (!front.current || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const sheet = () => {
    const v = text.trim();
    setText('');
    useStore.setState({ telling: true, tellDraft: v || null });
  };
  const send = async () => {
    const v = text.trim();
    if (!v) return sheet();
    const u = understandLocal(v, await getLanguage().catch(() => 'en'));
    const read = readOf([v], u);
    if (!read) return;
    setText('');
    if (read.kind === 'project') {
      input.current?.blur();
      router.push({ pathname: '/project/new', params: { goal: u?.text || v, auto: '1' } });
      return;
    }
    const drafts = read.kind === 'many' ? read.drafts : [read.draft];
    for (const d of drafts) {
      await capture(d.title, {
        activity: d.activity, label: d.label, est_minutes: d.est_minutes, due_at: d.due_at, has_time: d.has_time,
        repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
      });
    }
    await useStore.getState().refresh();
    useStore.getState().showToast(drafts.length > 1 ? `${drafts.length} things put down` : `Put down: ${drafts[0].title}`);
    // ready for the next one
    input.current?.focus();
  };
  const mac = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}
      style={{
        ...(stacked ? {} : { marginLeft: 'auto', flexShrink: 1, flexBasis: 520, minWidth: 160 }), height: stacked ? 64 : 56, borderRadius: stacked ? 18 : 16,
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 10,
        backgroundColor: k.field, borderWidth: 1, borderColor: focus ? t.ra : t.strokeStrong,
        ...(k.shadow ?? {}), cursor: 'text',
      } as unknown as ViewStyle}>
      <Pressable onPress={sheet} accessibilityRole="button" accessibilityLabel="Open Tell Nu" hitSlop={6}>
        <Image {...decorative} source={poseImage('nu-rest')} resizeMode="contain" style={{ width: stacked ? 42 : 36, height: stacked ? 42 : 36 }} />
      </Pressable>
      <TextInput ref={input} value={text} onChangeText={setText} onSubmitEditing={send}
        {...({ dataSet: { ownFocus: '1' } } as object)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        placeholder="Tell Nu anything…" placeholderTextColor={t.ink3} accessibilityLabel="Tell Nu anything"
        onKeyPress={e => { if ((e.nativeEvent as { key: string }).key === 'Escape') { setText(''); input.current?.blur(); } }}
        style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: stacked ? 19 : 17, fontFamily: T.brand, outlineStyle: 'none' } as unknown as TextStyle} />
      <View {...decorative} style={{ borderWidth: 1, borderColor: t.strokeStrong, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color: t.ink3, fontSize: 12.5, fontFamily: T.brand }}>{mac ? '⌘K' : 'Ctrl K'}</Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 *  Where a task sits: Today, This week or Someday, the same three the
 *  phone's Your Tasks holds them at (src/screens/Tasks.tsx).
 * ------------------------------------------------------------------ */

export type Col = 'today' | 'week' | 'someday';
export const COL_NAME: Record<Col, string> = { today: 'Today', week: 'This week', someday: 'Someday' };

/** Today, This week and Someday, from what the store holds. Every task is in one of them. */
export function columns(inbox: Task[], todayPicked: Task[], order: (a: Task, b: Task) => number) {
  const tonight = new Date().setHours(23, 59, 59, 999);
  const weekEnd = tonight + 7 * DAY;
  const at = Date.now();
  const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
  const today = [...todayPicked].filter(x => !x.parent_id).sort(order);
  const open = [...inbox].filter(x => !later(x)).sort(order);
  const seen = new Set<string>();
  const take = (xs: Task[]) => xs.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  return {
    today: take([...today, ...open.filter(x => !!x.due_at && x.due_at <= tonight)]),
    week: take(open.filter(x => !!x.due_at && x.due_at <= weekEnd).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0))),
    someday: take(open),
  };
}

/** This week's last day, Sunday (a week on, when today is Sunday), at 9 with no time shown. */
const weekLastDay = () => { const n = new Date().getDay(); return day0(addDays(Date.now(), n === 0 ? 7 : 7 - n)).setHours(9); };

/** Move a task to a column: Today picks it for today, This week gives it a day this week, Someday takes its date off. */
export async function moveTo(task: Task, col: Col) {
  const tonight = new Date().setHours(23, 59, 59, 999);
  if (col === 'today') {
    await pickForToday(task.id, true);
  } else if (col === 'week') {
    if (task.state === 'today' || task.state === 'doing') await pickForToday(task.id, false);
    // already this week (and not today): it keeps its day; else the week's last day
    const inWeek = !!task.due_at && task.due_at > tonight && task.due_at <= tonight + 7 * DAY;
    if (!inWeek) await updateTask(task.id, { due_at: weekLastDay(), has_time: 0 });
  } else {
    if (task.state === 'today' || task.state === 'doing') await pickForToday(task.id, false);
    if (task.due_at) await updateTask(task.id, { due_at: null, has_time: 0 });
  }
  await useStore.getState().refresh();
}

/** Put something down straight into a column (or on a day), the words read for dates and lengths first. */
export async function addTo(text: string, where: Col | { day: number }) {
  const d = parseTask(text);
  if (!d.title.trim()) return;
  let due = d.due_at, hasTime = d.has_time;
  if (typeof where === 'object') {
    if (!due) { due = new Date(where.day).setHours(9, 0, 0, 0); hasTime = false; }
  } else if (where === 'week' && !due) {
    due = weekLastDay(); hasTime = false;
  }
  const id = await capture(d.title, {
    activity: d.activity, label: d.label, est_minutes: d.est_minutes, due_at: due, has_time: hasTime,
    repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
  });
  const onToday = where === 'today' || (typeof where === 'object' && sameDay(where.day, Date.now()));
  if (onToday) await pickForToday(id, true);
  await useStore.getState().refresh();
}

/* ------------------------------------------------------------------ *
 *  A task as a row, and a line to add one.
 * ------------------------------------------------------------------ */

const CHECK = (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={ON_CORAL} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

/**
 * A task: the tick, its title, a star when it's high priority, its day. Under
 * the pointer (or picked with J and K), the columns it could move to.
 */
export function DeskRow({ task, col, selected, hideDue, ink, meta, onOpen, onHold, onDone, onMove }: {
  task: Task;
  /** where it is now, so its moves are the other two; none: no moves */
  col?: Col;
  selected?: boolean;
  hideDue?: boolean;
  /** the row's ink on the water */
  ink?: string;
  /** a quiet second line (a project's name) */
  meta?: string | null;
  onOpen: () => void;
  onHold?: () => void;
  onDone: () => void;
  onMove?: (c: Col) => void;
}) {
  const t = useTheme();
  const k = deskTokens(t);
  const [hover, setHover] = useState(false);
  const [checkHover, setCheckHover] = useState(false);
  const done = task.state === 'done';
  const showActs = (hover || selected) && !!col && !!onMove;
  // its time, when it has one today; else its day
  const due = !task.due_at || hideDue ? ''
    : task.has_time && sameDay(task.due_at, Date.now()) ? new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
    : rel(task.due_at);
  return (
    // not a button itself: its tick and its moves are buttons inside it (a button can't hold a button)
    <Pressable onPress={onOpen} onLongPress={onHold} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityLabel={[task.title, meta, due, task.priority === 3 ? 'High priority' : null].filter(Boolean).join(', ')}
      {...({ onContextMenu: (e: { preventDefault: () => void }) => { if (onHold) { e.preventDefault(); onHold(); } } } as object)}
      style={{
        minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6, paddingHorizontal: 8,
        marginHorizontal: -8, borderRadius: 10,
        backgroundColor: hover || selected ? k.wash : 'transparent',
        borderWidth: 1, borderColor: selected ? t.ra : 'transparent',
      }}>
      <Pressable onPress={onDone} hitSlop={6} onHoverIn={() => setCheckHover(true)} onHoverOut={() => setCheckHover(false)}
        accessibilityRole="checkbox" aria-checked={done} accessibilityLabel={`Done: ${task.title}`}
        style={{
          width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
          borderColor: done ? t.ra : checkHover ? t.ra : t.strokeStrong, backgroundColor: done ? t.ra : 'transparent',
        }}>
        {done && CHECK}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{
          color: done ? t.ink3 : ink ?? t.ink, fontSize: 16.5, lineHeight: 21, letterSpacing: -0.2, fontFamily: T.brand,
          textDecorationLine: done ? 'line-through' : 'none',
        }}>{task.title}</Text>
        {!!meta && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand, marginTop: 1 }}>{meta}</Text>}
      </View>
      {task.priority === 3 && !showActs && <Text {...decorative} style={{ color: t.ra, fontSize: 14 }}>★</Text>}
      {!!due && !showActs && (
        <View style={{ backgroundColor: k.wash, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ color: t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{due}</Text>
        </View>
      )}
      {showActs && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['today', 'week', 'someday'] as Col[]).filter(c => c !== col).map(c => (
            <ActButton key={c} label={COL_NAME[c]} onPress={() => onMove!(c)} accessibilityLabel={`Move to ${COL_NAME[c]}`} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

function ActButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const k = deskTokens(t);
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      style={{ height: 30, paddingHorizontal: 11, borderRadius: 7, justifyContent: 'center', backgroundColor: hover ? k.pick : k.wash }}>
      <Text style={{ color: hover ? t.ink : t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );
}

/** A line to put something down, with a dashed + before it. Enter adds it and keeps the line open for the next. */
export function AddRow({ placeholder, onAdd, ink }: { placeholder: string; onAdd: (text: string) => Promise<void> | void; ink?: string }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    await onAdd(v);
    setTimeout(() => input.current?.focus(), 0);
  };
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, cursor: 'text' } as unknown as ViewStyle}>
      <View {...decorative} style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.strokeStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.ink3, fontSize: 15, lineHeight: 17 }}>+</Text>
      </View>
      <TextInput ref={input} value={text} onChangeText={setText} onSubmitEditing={submit} blurOnSubmit={false}
        placeholder={placeholder} placeholderTextColor={ink ?? t.ink3} accessibilityLabel={placeholder.replace(/…$/, '')}
        onKeyPress={e => { if ((e.nativeEvent as { key: string }).key === 'Escape') { setText(''); input.current?.blur(); } }}
        style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: 16.5, fontFamily: T.brand, outlineStyle: 'none' } as unknown as TextStyle} />
    </Pressable>
  );
}

/** A quiet line when there's nothing there. */
export function Empty({ children, color }: { children: React.ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color ?? t.ink3, fontSize: 16, lineHeight: 24, fontFamily: T.brand, paddingVertical: 8 }}>{children}</Text>;
}
