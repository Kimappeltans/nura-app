import type React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';

/**
 * Nura is three rooms and one mode:
 *   Home      — what should I do now?
 *   My tasks  — what exists?
 *   Your day  — what's happening today, and what happened?
 * and Focus (Ra), which has no tab bar at all: you're doing one thing.
 * Everything else (calendar, wins, the backlog pass, habits, settings…) is
 * reached from inside one of the three, not given a tab of its own.
 */
export type Tab = 'home' | 'tasks' | 'day';

const TABS: { key: Tab; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'home', label: 'Home', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinejoin="round">
      <Path d="M4 11.2 12 4l8 7.2v7.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><Path d="M9.5 20v-5.5h5V20" />
    </Svg>) },
  { key: 'tasks', label: 'My tasks', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round">
      <Rect x={5} y={5} width={14} height={14} rx={3} /><Path d="M8 9h8M8 12h8M8 15h5" />
    </Svg>) },
  { key: 'day', label: 'Your day', icon: c => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round">
      <Path d="M4 8h16M8 4v4M16 4v4" /><Rect x={4} y={5} width={16} height={15} rx={4} /><Path d="M8 12h3M8 15h5" />
    </Svg>) },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flexDirection: 'row', paddingHorizontal: 15, paddingTop: 6, paddingBottom: Math.max(insets.bottom - 6, 10),
      backgroundColor: t.base, borderTopWidth: 1, borderTopColor: t.stroke,
    }} accessibilityRole="tablist">
      {TABS.map(x => {
        const on = x.key === tab;
        return (
          <Pressable key={x.key} onPress={() => { if (!on) { Haptics.selectionAsync(); onTab(x.key); } }}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 4 }}>
            {on && (
              <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ position: 'absolute', top: 0, width: 22, height: 2.5, borderRadius: 2 }} />
            )}
            {x.icon(on ? (t.key === 'nu' ? t.raSoft : t.raDeep) : t.ink3)}
            <Text style={{ color: on ? t.ink : t.ink3, fontSize: 11, fontFamily: T.brand }}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
