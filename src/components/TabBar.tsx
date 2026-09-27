import type React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { LivePill } from './LivePill';
import { Avatar } from './Avatar';

const CORAL = '#FF6B35';

/**
 * Nura is three rooms and one mode:
 *   Home      — what should I do now?
 *   Your tasks — what exists?
 *   Calendar  — the month, and what's on a day?
 * and Focus (Ra), which has no tab bar at all: you're doing one thing.
 * Everything else (wins, the backlog pass, habits, settings…) is
 * reached from inside one of the three, not given a tab of its own.
 */
export type { Tab } from '../store';
import type { Tab } from '../store';

const TABS: { key: Tab; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'home', label: 'Home', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinejoin="round">
      <Path d="M4 11.2 12 4l8 7.2v7.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><Path d="M9.5 20v-5.5h5V20" />
    </Svg>) },
  { key: 'tasks', label: 'Your Tasks', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round">
      <Rect x={5} y={5} width={14} height={14} rx={3} /><Path d="M8 9h8M8 12h8M8 15h5" />
    </Svg>) },
  { key: 'day', label: 'Calendar', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round">
      <Path d="M4 8h16M8 4v4M16 4v4" /><Rect x={4} y={5} width={16} height={15} rx={4} /><Path d="M8 12h3M8 15h5" />
    </Svg>) },
];

/**
 * The tab bar is on the three rooms and on every screen you move through from
 * them (profile, settings, wins, a project…), so you can always
 * get back. Tapping a tab — even the one you're on — closes whatever is open
 * above the rooms and shows that room. Not on modes and self-contained tasks:
 * Focus, the timer, the composer, the planner, sign-in, the opening.
 */
export function TabBar() {
  const t = useTheme();
  const tab = useStore(s => s.tab);
  const path = usePathname();
  const onTab = (k: Tab) => {
    useStore.setState({ tab: k });
    // close what's open above the rooms; when this screen IS the bottom of the
    // stack (a reload, a link, a notification) there's nothing to close — go there
    if (router.canDismiss()) router.dismissAll();
    else if (path !== '/') router.replace('/');
  };
  const insets = useSafeAreaInsets();
  const running = useStore(s => s.running);
  const dark = t.key === 'nu';

  const Slot = ({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon: React.ReactNode }) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', gap: 4, paddingTop: 10 }}>
      {/* where you are: a small coral dot over the icon */}
      {on && <View style={{ position: 'absolute', top: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: CORAL }} />}
      {icon}
      <Text style={{ color: on ? t.ink : t.ink3, fontSize: 10.5, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: t.base }}>
      {/* a session left running with ⌄: tap to go back to it (room for the raised + under it) */}
      <View style={{ paddingHorizontal: 16, paddingBottom: running ? 16 : 0 }}><LivePill /></View>
      {/* B: a full-width bar; Tell Nu raised in the middle; You (More) at the end */}
      <View accessibilityRole="tablist" style={{
        flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8,
        paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderTopColor: t.stroke, backgroundColor: t.base,
      }}>
        {TABS.slice(0, 2).map(x => (
          <Slot key={x.key} label={x.key === 'tasks' ? 'Tasks' : x.label} on={x.key === tab}
            onPress={() => onTab(x.key)} icon={x.icon(x.key === tab ? t.ink : t.ink3)} />
        ))}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); useStore.setState({ telling: true }); }}
            accessibilityRole="button" accessibilityLabel="Tell Nu anything"
            style={({ pressed }) => ({
              width: 60, height: 60, marginTop: -22, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
              borderWidth: 4, borderColor: t.base, backgroundColor: dark ? '#1E2652' : '#1B1830',
              shadowColor: '#1B1830', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
        </View>
        {TABS.slice(2).map(x => (
          <Slot key={x.key} label={x.label} on={x.key === tab}
            onPress={() => onTab(x.key)} icon={x.icon(x.key === tab ? t.ink : t.ink3)} />
        ))}
        {/* You is a tab like the others: your screen, not a popup */}
        <Slot label="You" on={tab === 'you'} onPress={() => onTab('you')}
          icon={<Avatar size={22} ring={tab === 'you'} />} />
      </View>
    </View>
  );
}
