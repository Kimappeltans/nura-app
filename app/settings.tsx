import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Share, Animated, BackHandler } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore, appearanceName, type Appearance } from '../src/store';
import { getFlag, setFlag, exportLog, getNudges, setNudges, MORNING_TIMES, EVENING_TIMES, type Nudges } from '../src/db';
import { hasCalendarPermission, phoneCalendars, showCalendar, focusCalendar, setFocusCalendar, type PhoneCalendar } from '../src/calendar';
import { initNotifications, scheduleTransitionWarning } from '../src/notifications';
import { signOut } from '../src/account';
import { type as T } from '../src/theme';
import {
  Mica, IconChevron, IconCheck, IconBell, IconCalendar, IconClock, IconSun,
  IconSunrise, IconSunset, IconMoon, IconTimer, IconCup, IconPhone, IconTasks, IconTray, IconRepeat,
  IconLayers, IconCalendarPlus, IconContrast, IconGlobe, IconSpeaker, IconBubble, IconShield, IconExport,
  IconHelp, IconPlay, IconRestart,
} from '../src/ui';
import { Avatar } from '../src/components/Avatar';
import { Sheet } from '../src/components/Sheet';
import { askToReplayIntro } from '../src/intro';
import { LANGUAGES, getLanguage, setLanguage, languageName, type LangCode } from '../src/planner';
import { canSpeak, readsAloud, setReadsAloud, voicesForLanguage, chosenVoice, setChosenVoice, say, type VoiceOption } from '../src/voice';
import { DAY_ENDS, DAY_STARTS, dayEndLabel } from '../src/capacity';

/**
 * Settings: how the app behaves. Your account lives on Profile (the first
 * row here opens it).
 *
 * A list of sections, each opening its own page (← Back returns to the
 * list). Every row changes something real, and each section is its own small
 * component (PAGES below), so a wide screen can later show the list on the
 * left and the open section on the right.
 */

type Icon = (p: { size?: number; color: string }) => React.JSX.Element;
type PageKey = 'day' | 'focus' | 'tasks' | 'notifications' | 'calendar' | 'appearance' | 'language' | 'data' | 'help';

const clock = dayEndLabel;             // any minute after midnight, as the phone writes a time
const native = Platform.OS !== 'web';  // reminders and the calendar are the phone's

/* ─────────────── the parts every page is built from ─────────────── */

/** A group of rows: a flat card, a fill and a hairline. */
function Card({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden', marginTop: 16 }}>
      {children}
    </View>
  );
}

function Divider({ inset = 59 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: inset }} />;
}

/** One setting: its icon, its name, and its value, a switch or a tick on the right. */
function Row({ icon: I, title, value, right, onPress }: {
  icon?: Icon; title: string; value?: string; right?: React.ReactNode; onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined} disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      {!!I && (
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash, borderWidth: 1, borderColor: t.stroke }}>
          <I size={18} color={t.nu} />
        </View>
      )}
      <Text style={{ flex: 1, color: t.ink, fontSize: 16, fontFamily: T.brand, letterSpacing: -0.2 }}>{title}</Text>
      {value != null && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 15, fontFamily: T.brand, maxWidth: '48%' }}>{value}</Text>}
      {right ?? (onPress ? <IconChevron size={16} color={t.ink3} /> : null)}
    </Pressable>
  );
}

/** A switch, from the theme: coral when on. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const t = useTheme();
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: on ? 1 : 0, useNativeDriver: native, speed: 22, bounciness: 5 }).start();
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onChange(!on); }} hitSlop={8}
      accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={{
        width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center',
        backgroundColor: on ? t.ra : t.track, borderWidth: 1, borderColor: on ? t.ra : t.strokeStrong,
      }}>
      <Animated.View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: t.key === 'nu' ? t.ink : t.card,
        transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
      }} />
    </Pressable>
  );
}

/** A row that is a switch: the whole row flips it. */
function SwitchRow({ icon, title, on, onChange }: { icon?: Icon; title: string; on: boolean; onChange: (on: boolean) => void }) {
  return <Row icon={icon} title={title} right={<Toggle on={on} onChange={onChange} label={title} />} onPress={() => onChange(!on)} />;
}

function Tick({ on }: { on: boolean }) {
  const t = useTheme();
  return on ? <IconCheck size={18} color={t.ra} /> : <View style={{ width: 18 }} />;
}

/** Choose one (or, with `multi`, several) from a short list, in a sheet. */
function Picker<K extends string | number>({ visible, title, options, value, onPick, onClose, multi }: {
  visible: boolean; title: string;
  options: { key: K; label: string; note?: string; on?: boolean }[];
  value?: K; onPick: (k: K) => void; onClose: () => void; multi?: boolean;
}) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 22, fontFamily: T.display, letterSpacing: -0.4 }}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"
          style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: t.layer }}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={t.ink2} strokeWidth={2} strokeLinecap="round" /></Svg>
        </Pressable>
      </View>
      <Card>
        {options.map((o, i) => (
          <View key={String(o.key)}>
            {i > 0 && <Divider inset={14} />}
            <Row title={o.label} value={o.note} right={<Tick on={multi ? !!o.on : o.key === value} />}
              onPress={() => { onPick(o.key); if (!multi) onClose(); }} />
          </View>
        ))}
      </Card>
    </Sheet>
  );
}

/* ─────────────── the pages ─────────────── */

function YourDay() {
  const { dayStartMin, setDayStart, dayEndMin, setDayEnd } = useStore();
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  return (
    <>
      <Card>
        <Row icon={IconSunrise} title="Day starts" value={clock(dayStartMin)} onPress={() => setPick('start')} />
        <Divider />
        <Row icon={IconSunset} title="Day ends" value={clock(dayEndMin)} onPress={() => setPick('end')} />
      </Card>
      <Picker visible={pick === 'start'} title="Day starts" onClose={() => setPick(null)}
        options={DAY_STARTS.map(m => ({ key: m, label: clock(m) }))} value={dayStartMin} onPick={setDayStart} />
      <Picker visible={pick === 'end'} title="Day ends" onClose={() => setPick(null)}
        options={DAY_ENDS.map(m => ({ key: m, label: clock(m) }))} value={dayEndMin} onPick={setDayEnd} />
    </>
  );
}

/** Focus: what Begin starts with (the same length as Ra's Length knob), the
 *  break Done offers, and whether the screen stays on (app/timer.tsx). */
const LENGTHS = [0, 5, 10, 15, 25, 45, 60];
const BREAKS = ['', '5', '10', '15', 'off'];
const breakName = (b: string) => (b === 'off' ? 'Off' : Number(b) > 0 ? `${b} min` : 'Auto');

function Focus() {
  const [length, setLength] = useState(0);
  const [brk, setBrk] = useState('');
  const [awake, setAwake] = useState(false);
  const [pick, setPick] = useState<'length' | 'break' | null>(null);
  useEffect(() => {
    (async () => {
      setLength(Number(await getFlag('focus.timer')) || 0);
      setBrk((await getFlag('focus.break')) ?? '');
      setAwake((await getFlag('focus.awake')) === '1');
    })();
  }, []);
  return (
    <>
      <Card>
        <Row icon={IconTimer} title="Session length" value={length ? `${length} min` : 'Open'} onPress={() => setPick('length')} />
        <Divider />
        <Row icon={IconCup} title="Break" value={breakName(brk)} onPress={() => setPick('break')} />
        <Divider />
        <SwitchRow icon={IconPhone} title="Keep screen on" on={awake}
          onChange={on => { setAwake(on); setFlag('focus.awake', on ? '1' : ''); }} />
      </Card>
      <Picker visible={pick === 'length'} title="Session length" onClose={() => setPick(null)}
        options={LENGTHS.map(m => ({ key: m, label: m ? `${m} min` : 'Open' }))} value={length}
        onPick={m => { setLength(m); setFlag('focus.timer', m ? String(m) : ''); }} />
      <Picker visible={pick === 'break'} title="Break" onClose={() => setPick(null)}
        options={BREAKS.map(b => ({ key: b, label: breakName(b) }))} value={brk}
        onPick={b => { setBrk(b); setFlag('focus.break', b); }} />
    </>
  );
}

function Tasks() {
  return (
    <Card>
      <Row icon={IconTray} title="One pass through your backlog" onPress={() => router.push('/triage')} />
      <Divider />
      <Row icon={IconRepeat} title="Add a habit" onPress={() => router.push('/habit')} />
    </Card>
  );
}

/** Notifications: the three daily nudges and the heads up before an event
 *  (src/notifications.ts reads them). Only the phone can send them. */
function NotificationsPage() {
  const [allowed, setAllowed] = useState(false);
  const [n, setN] = useState<Nudges | null>(null);
  const [pick, setPick] = useState<'morning' | 'evening' | null>(null);
  // on focus: permission is granted on the Connect screen, on top of this one
  useFocusEffect(useCallback(() => {
    if (!native) return;
    Notifications.getPermissionsAsync().then(p => setAllowed(p.status === 'granted')).catch(() => {});
    getNudges().then(setN);
  }, []));

  if (!native) return <Card><Row icon={IconBell} title="Reminders" value="iPhone only" /></Card>;

  const change = async (p: Partial<Nudges>) => {
    setN(cur => (cur ? { ...cur, ...p } : cur));
    await setNudges(p);
    await initNotifications();          // rewrites the queue, if reminders are on
  };
  const time = (m: number | null) => (m == null ? 'Off' : clock(m));
  const times = (list: number[]) => [...list.map(m => ({ key: m, label: clock(m) })), { key: -1, label: 'Off' }];

  return (
    <>
      <Card>
        <Row icon={IconBell} title="Reminders" value={allowed ? 'On' : 'Off'} onPress={() => router.push('/integrations')} />
      </Card>
      {n && (
        <>
          {/* kept while reminders are off, and quieter: they start once they're on */}
          <View style={{ opacity: allowed ? 1 : 0.55 }}>
            <Card>
              <Row icon={IconSunrise} title="Morning plan" value={time(n.morning)} onPress={() => setPick('morning')} />
              <Divider />
              <SwitchRow icon={IconSun} title="Midday check in" on={n.midday} onChange={midday => change({ midday })} />
              <Divider />
              <Row icon={IconMoon} title="Evening look back" value={time(n.evening)} onPress={() => setPick('evening')} />
              <Divider />
              <SwitchRow icon={IconClock} title="2 minutes before events" on={n.events} onChange={events => change({ events })} />
            </Card>
          </View>
          <Picker visible={pick === 'morning'} title="Morning plan" onClose={() => setPick(null)}
            options={times(MORNING_TIMES)} value={n.morning ?? -1} onPick={m => change({ morning: m < 0 ? null : m })} />
          <Picker visible={pick === 'evening'} title="Evening look back" onClose={() => setPick(null)}
            options={times(EVENING_TIMES)} value={n.evening ?? -1} onPick={m => change({ evening: m < 0 ? null : m })} />
        </>
      )}
    </>
  );
}

/** Calendar: which of the phone's calendars Nura reads, and where a finished
 *  focus session is written (src/calendar.ts). */
function CalendarPage() {
  const [connected, setConnected] = useState(false);
  const [cals, setCals] = useState<PhoneCalendar[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [pick, setPick] = useState<'shown' | 'focus' | null>(null);
  useFocusEffect(useCallback(() => {
    if (!native) return;
    (async () => {
      const ok = await hasCalendarPermission();
      setConnected(ok);
      if (!ok) return;
      setCals(await phoneCalendars());
      setTarget(await focusCalendar());
    })();
  }, []));

  if (!native) return <Card><Row icon={IconCalendar} title="Calendar" value="iPhone only" /></Card>;

  const shown = cals.filter(c => c.shown).length;
  const writable = cals.filter(c => c.writable);
  const toggle = async (id: string) => {
    const c = cals.find(x => x.id === id);
    if (!c) return;
    await showCalendar(id, !c.shown);
    setCals(cs => cs.map(x => (x.id === id ? { ...x, shown: !x.shown } : x)));
    useStore.getState().refresh();      // today's events on Home follow at once
    scheduleTransitionWarning().catch(() => {});
  };

  return (
    <>
      <Card>
        <Row icon={IconCalendar} title="Calendar" value={connected ? 'Connected' : 'Off'} onPress={() => router.push('/integrations')} />
        {connected && (
          <>
            <Divider />
            <Row icon={IconLayers} title="Calendars shown" value={!cals.length ? 'None' : shown === cals.length ? 'All' : `${shown} of ${cals.length}`}
              onPress={cals.length ? () => setPick('shown') : undefined} />
            <Divider />
            <Row icon={IconCalendarPlus} title="Save focus sessions to" value={cals.find(c => c.id === target)?.title ?? 'Off'}
              onPress={() => setPick('focus')} />
          </>
        )}
      </Card>
      <Picker multi visible={pick === 'shown'} title="Calendars shown" onClose={() => setPick(null)}
        options={cals.map(c => ({ key: c.id, label: c.title, on: c.shown }))} onPick={toggle} />
      <Picker visible={pick === 'focus'} title="Save focus sessions to" onClose={() => setPick(null)}
        options={[{ key: '', label: 'Off' }, ...writable.map(c => ({ key: c.id, label: c.title }))]} value={target ?? ''}
        onPick={async id => { setTarget(id || null); await setFocusCalendar(id || null); }} />
    </>
  );
}

function AppearancePage() {
  const { appearance, setAppearance } = useStore();
  const looks: [Appearance, Icon][] = [['sun', IconSunrise], ['light', IconSun], ['dark', IconMoon]];
  return (
    <Card>
      {looks.map(([key, icon], i) => (
        <View key={key}>
          {i > 0 && <Divider />}
          <Row icon={icon} title={appearanceName[key]} right={<Tick on={appearance === key} />} onPress={() => setAppearance(key)} />
        </View>
      ))}
    </Card>
  );
}

function LanguageVoice() {
  const [lang, setLang] = useState<LangCode>('en');
  const [aloud, setAloud] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [pick, setPick] = useState<'lang' | 'voice' | null>(null);
  useEffect(() => {
    (async () => {
      setLang(await getLanguage());
      setAloud(await readsAloud());
      setVoices(await voicesForLanguage());
      setVoice(await chosenVoice());
    })();
  }, []);

  const pickLanguage = async (code: LangCode) => {
    await setLanguage(code);
    await setChosenVoice(null);          // a voice belongs to one language
    setLang(code); setVoice(null);
    setVoices(await voicesForLanguage());
  };
  const pickVoice = async (id: string) => {
    await setChosenVoice(id || null); setVoice(id || null);
    say('I’m here. Let’s find one place to begin.');
  };

  return (
    <>
      <Card>
        <Row icon={IconGlobe} title="Language for Nu and Ra" value={languageName(lang)} onPress={() => setPick('lang')} />
        {canSpeak() && (
          <>
            <Divider />
            <Row icon={IconSpeaker} title="Voice" value={voices.length ? voices.find(v => v.id === voice)?.name ?? 'Default' : 'None'}
              onPress={voices.length ? () => setPick('voice') : undefined} />
            <Divider />
            <SwitchRow icon={IconBubble} title="Read replies aloud" on={aloud}
              onChange={async on => { setAloud(on); await setReadsAloud(on); }} />
          </>
        )}
      </Card>
      <Picker visible={pick === 'lang'} title="Language for Nu and Ra" onClose={() => setPick(null)}
        options={LANGUAGES.map(l => ({ key: l.code as LangCode, label: l.name }))} value={lang} onPick={pickLanguage} />
      <Picker visible={pick === 'voice'} title="Voice" onClose={() => setPick(null)}
        options={[{ key: '', label: 'Default' }, ...voices.slice(0, 7).map(v => ({ key: v.id, label: v.name, note: v.enhanced ? 'Enhanced' : undefined }))]}
        value={voice ?? ''} onPick={pickVoice} />
    </>
  );
}

function YourData() {
  // what Nura has recorded (tasks shown, started, finished), as a file you keep
  const exportActivity = async () => {
    const json = await exportLog();
    const name = `nura-activity-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else {
      await Share.share({ title: name, message: json });
    }
  };
  return <Card><Row icon={IconExport} title="Export activity log" onPress={exportActivity} /></Card>;
}

function Help() {
  return (
    <Card>
      <Row icon={IconPlay} title="Watch the opening again" onPress={() => router.push('/opening')} />
      <Divider />
      <Row icon={IconRestart} title="Start from the beginning" onPress={askToReplayIntro} />
    </Card>
  );
}

/** The sections, in the order the list shows them; a gap between groups. */
const PAGES: { key: PageKey; title: string; icon: Icon; Page: () => React.JSX.Element; gap?: boolean }[] = [
  { key: 'day', title: 'Your day', icon: IconSunrise, Page: YourDay },
  { key: 'focus', title: 'Focus', icon: IconTimer, Page: Focus },
  { key: 'tasks', title: 'Tasks', icon: IconTasks, Page: Tasks },
  { key: 'notifications', title: 'Notifications', icon: IconBell, Page: NotificationsPage, gap: true },
  { key: 'calendar', title: 'Calendar', icon: IconCalendar, Page: CalendarPage },
  { key: 'appearance', title: 'Appearance', icon: IconContrast, Page: AppearancePage, gap: true },
  { key: 'language', title: 'Language and voice', icon: IconGlobe, Page: LanguageVoice },
  { key: 'data', title: 'Your data', icon: IconShield, Page: YourData, gap: true },
  { key: 'help', title: 'Help', icon: IconHelp, Page: Help },
];

/* ─────────────── the screen ─────────────── */

function Settings() {
  const t = useTheme();
  const { session, profile } = useStore();
  const [open, setOpen] = useState<PageKey | null>(null);
  const page = PAGES.find(p => p.key === open);

  // Android's back closes the open section first, like ← Back
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);

  // the list, as cards split where PAGES asks for a gap
  const groups = PAGES.reduce<(typeof PAGES)[]>((g, p) => {
    if (!g.length || p.gap) g.push([]);
    g[g.length - 1].push(p);
    return g;
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => (open ? setOpen(null) : goBack())} hitSlop={12} accessibilityRole="button" style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView key={open ?? 'list'} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, marginTop: 6, marginHorizontal: 4 }}>
          {page ? page.title : 'Settings'}
        </Text>

        {page ? <page.Page /> : (
          <>
            {/* you: Profile holds the account (email, sign out, delete) */}
            <Card>
              <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/profile'); }} accessibilityRole="button" accessibilityLabel="Profile"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: pressed ? t.subtle : 'transparent' })}>
                <Avatar size={48} edge />
                <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 18, fontFamily: T.display, letterSpacing: -0.4 }}>{profile.name.trim() || 'You'}</Text>
                <IconChevron size={16} color={t.ink3} />
              </Pressable>
            </Card>

            {groups.map((g, i) => (
              <Card key={i}>
                {g.map((p, j) => (
                  <View key={p.key}>
                    {j > 0 && <Divider />}
                    <Row icon={p.icon} title={p.title} onPress={() => setOpen(p.key)} />
                  </View>
                ))}
              </Card>
            ))}

            {!!session && (
              <Pressable onPress={() => { Haptics.selectionAsync(); signOut(); }} accessibilityRole="button"
                style={({ pressed }) => ({
                  marginTop: 28, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? t.subtle : t.layer, borderWidth: 1, borderColor: t.stroke,
                })}>
                <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.display }}>Log out</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default inWorld('utility', withTabs(Settings));
