import { useCallback, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { getDb } from '../db';
import { hasCalendarPermission } from '../calendar';
import { canSpeak } from '../voice';
import { type as T } from '../theme';
import { Mica, IconGear, IconChevron } from '../ui';
import { Avatar } from '../components/Avatar';
import { READ_MAX, useDesk } from '../screen';
import { spokenDuration } from '../a11y';

/**
 * YOU, the fourth tab. A screen like the other tabs (a tab opens a place,
 * not a popup): you at the top, your picture and name (tap for your
 * Profile), with the gear for Settings; below, how it's going, what Nura
 * has learned about how you work, and what Nura is connected to. (It used
 * to be a sheet: src/legacy has the earlier menus.)
 */
export default function You() {
  const t = useTheme();
  const { wins, profile } = useStore();
  const [focusMin, setFocusMin] = useState<number | null>(null);
  const [calendar, setCalendar] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    // focus time this week: every session that ended since Monday, each
    // counted as Done showed it (at least a minute), so the two agree
    (async () => {
      try {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const db = await getDb();
        const rows = await db.getAllAsync<{ meta: string | null }>(`SELECT meta FROM event WHERE kind = 'session_end' AND at >= ?`, d.getTime());
        setFocusMin(rows.reduce((s, r) => { try { const m = JSON.parse(r.meta ?? '{}').minutes; return typeof m === 'number' ? s + Math.max(1, Math.round(m)) : s; } catch { return s; } }, 0));
      } catch { setFocusMin(null); }
    })();
    hasCalendarPermission().then(setCalendar).catch(() => setCalendar(false));
  }, []));

  const dayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = (() => { const d = new Date(dayStart); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  const today = wins.filter(w => (w.completed_at ?? 0) >= dayStart).length;
  const week = wins.filter(w => (w.completed_at ?? 0) >= weekStart).length;
  const focus = focusMin == null ? null : Math.round(focusMin);
  // calendar and reminders need the phone; the web says so, like Settings
  const web = Platform.OS === 'web';
  const go = (path: Parameters<typeof router.push>[0]) => { Haptics.selectionAsync(); router.push(path); };
  // a wide web window: a readable column in the middle of the room
  const desk = useDesk();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 }, desk && { width: '100%', maxWidth: READ_MAX, alignSelf: 'center', paddingTop: 48 }]}
        showsVerticalScrollIndicator={false}>

        {/* you, and the gear */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
          <Pressable onPress={() => go('/profile')} accessibilityRole="button" accessibilityLabel={`${profile.name.trim() || 'You'}, Profile`}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.7 : 1 })}>
            <Avatar size={64} edge />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.ink, fontSize: 28, lineHeight: 32, fontFamily: T.display, letterSpacing: -1 }}>
                {profile.name.trim() || 'You'}
              </Text>
              <Text style={{ color: t.ink3, fontSize: 14, marginTop: 2, fontFamily: T.brand }}>Profile ›</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => go('/settings')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Settings"
            style={({ pressed }) => ({
              width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
            })}>
            <IconGear size={20} color={t.ink2} />
          </Pressable>
        </View>

        {/* how it's going: three numbers, then everything */}
        <Group title="Wins">
          <View style={{ flexDirection: 'row' }}>
            <Stat big={String(today)} small="today" />
            <View style={{ width: 1, backgroundColor: t.stroke }} />
            <Stat big={String(week)} small="this week" />
            <View style={{ width: 1, backgroundColor: t.stroke }} />
            <Stat big={focus == null ? '0' : focus >= 60 ? `${Math.floor(focus / 60)}h` : String(focus)}
              unit={focus != null && focus >= 60 ? (focus % 60 ? `${focus % 60}m` : '') : 'min'} small="focus this week"
              said={`${spokenDuration((focus ?? 0) * 60)} focus this week`} />
          </View>
          <Line />
          <Row label="Everything you’ve finished" onPress={() => go('/wins')} />
        </Group>

        {/* what Nura has learned about how you work, and the way to change it */}
        <Group title="How you work">
          <Row label="What Nura has learned" onPress={() => go('/learned')} />
        </Group>

        <Group title="Connected apps">
          <Row label="Calendar" value={web ? 'iPhone only' : calendar ? 'Connected' : 'Connect'} onPress={() => go('/integrations')} />
          <Line />
          <Row label="Reminders" value={web ? 'iPhone only' : 'Set up'} onPress={() => go('/integrations')} />
          <Line />
          <Row label="Voice" value={canSpeak() ? (web ? 'In this browser' : 'On this phone') : 'Set up'} onPress={() => go('/settings')} />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

/* Out here, like Profile's, so they aren't redefined on every render. */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 26 }}>
      <Text accessibilityRole="header" style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 8, marginLeft: 4 }}>
        {title.toUpperCase()}
      </Text>
      {/* flat: a fill and a hairline */}
      <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Line() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 16 }} />;
}

function Stat({ big, unit, small, said }: { big: string; unit?: string; small: string; said?: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={said ?? `${big} ${small}`} style={{ flex: 1, paddingVertical: 16, alignItems: 'center' }}>
      <Text style={{ color: t.ink, fontSize: 30, letterSpacing: -1.2, fontFamily: T.displayLight }}>
        {big}{!!unit && <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 0, fontFamily: T.brand }}>{unit}</Text>}
      </Text>
      <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 2, fontFamily: T.brand }}>{small}</Text>
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({
        minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: t.ink3, fontSize: 15, textAlign: 'right' }}>{value}</Text>
      <IconChevron size={16} color={t.ink3} />
    </Pressable>
  );
}
