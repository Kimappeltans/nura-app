import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useStore, useTheme } from '../store';
import { getDb } from '../db';
import { hasCalendarPermission } from '../calendar';
import { canSpeak } from '../voice';
import { type as T } from '../theme';
import { IconSun, IconLink, IconGear } from '../ui';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';

/**
 * MORE, the tab bar's You. A tall sheet with you at the top (your picture
 * and name: tap for your Profile, one screen for all of it) and a gear for
 * Settings beside the close. Wins and Connected apps open inside the sheet
 * (← to come back), each with the few things you'd want at a glance and a
 * way to the full screen. The calendar is its own tab, the backlog pass and habits in Your
 * tasks. (The earlier every-place menu: src/legacy/AppMenu.tsx.)
 */
type View_ = 'menu' | 'wins' | 'connected';

const ITEMS: { key: Exclude<View_, 'menu'>; Icon: typeof IconSun; label: string }[] = [
  { key: 'wins', Icon: IconSun, label: 'Wins' },
  { key: 'connected', Icon: IconLink, label: 'Connected apps' },
];

export function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { wins, profile } = useStore();
  const [view, setView] = useState<View_>('menu');
  const [focusMin, setFocusMin] = useState<number | null>(null);
  const [calendar, setCalendar] = useState<boolean | null>(null);

  useEffect(() => { if (!visible) setView('menu'); }, [visible]);
  useEffect(() => {
    if (view === 'wins') {
      // focus time this week: the minutes of every session that ended since Monday
      (async () => {
        try {
          const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          const db = await getDb();
          const rows = await db.getAllAsync<{ meta: string | null }>(`SELECT meta FROM event WHERE kind = 'session_end' AND at >= ?`, d.getTime());
          setFocusMin(rows.reduce((s, r) => { try { return s + (JSON.parse(r.meta ?? '{}').minutes ?? 0); } catch { return s; } }, 0));
        } catch { setFocusMin(null); }
      })();
    }
    if (view === 'connected') hasCalendarPermission().then(setCalendar).catch(() => setCalendar(false));
  }, [view]);

  const go = (path: Parameters<typeof router.push>[0]) => { onClose(); setTimeout(() => router.push(path), 250); };
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = (() => { const d = new Date(dayStart); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  const winsToday = wins.filter(w => (w.completed_at ?? 0) >= dayStart).length;
  const winsWeek = wins.filter(w => (w.completed_at ?? 0) >= weekStart).length;
  const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  const Close = () => (
    <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"
      style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: t.layer }}>
      <Text style={{ color: t.ink2, fontSize: 18, lineHeight: 20 }}>×</Text>
    </Pressable>
  );

  const Row = ({ label, value, good, onPress, action }: { label: string; value?: string; good?: boolean; onPress?: () => void; action?: string }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({
      minHeight: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      borderBottomWidth: 1, borderBottomColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
    })}>
      <Text style={{ color: t.ink, fontSize: 15 }}>{label}</Text>
      {action ? <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.brand }}>{action}</Text>
        : <Text numberOfLines={1} style={{ color: good ? '#8FD4B3' : t.ink3, fontSize: 14.5, flexShrink: 1, textAlign: 'right', fontFamily: good ? T.brand : undefined }}>{value ?? '›'}</Text>}
    </Pressable>
  );
  const Panel = ({ children }: { children: React.ReactNode }) => (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.layer, overflow: 'hidden', marginBottom: -1 }}>{children}</View>
  );

  const title = ITEMS.find(i => i.key === view)?.label;

  return (
    <Sheet visible={visible} onClose={onClose} tall>
      {view === 'menu' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Pressable onPress={() => go('/profile')} accessibilityRole="button" accessibilityLabel="Profile"
              style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
              <Avatar size={56} edge />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.ink, fontSize: 23, fontFamily: T.display, letterSpacing: -0.4 }}>{profile.name.trim() || 'You'}</Text>
                <Text style={{ color: t.ink3, fontSize: 14, marginTop: 1 }}>Profile ›</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => go('/settings')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Settings"
              style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: pressed ? t.subtle : t.layer })}>
              <IconGear size={18} color={t.ink2} />
            </Pressable>
            <Close />
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: t.stroke }}>
            {ITEMS.map(i => (
              <Pressable key={i.key} onPress={() => setView(i.key)} accessibilityRole="button"
                style={({ pressed }) => ({
                  minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2,
                  borderBottomWidth: 1, borderBottomColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash, borderWidth: 1, borderColor: t.stroke }}>
                  <i.Icon size={18} color={t.nu} />
                </View>
                <Text style={{ flex: 1, color: t.ink, fontSize: 15.5 }}>{i.label}</Text>
                <Text style={{ color: t.ink3, fontSize: 17 }}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 18 }}>
            <Pressable onPress={() => setView('menu')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back"
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: t.layer }}>
              <Text style={{ color: t.ink, fontSize: 18, lineHeight: 20 }}>←</Text>
            </Pressable>
            <Text style={{ color: t.ink, fontSize: 22, fontFamily: T.display, letterSpacing: -0.4 }}>{title}</Text>
            <Close />
          </View>

          {view === 'wins' && (
            <Panel>
              <Row label="Today" value={String(winsToday)} />
              <Row label="This week" value={String(winsWeek)} />
              <Row label="Focus time this week" value={focusMin == null ? 'None yet' : span(Math.round(focusMin))} />
              <Row label="Everything you’ve finished" onPress={() => go('/wins')} />
            </Panel>
          )}
          {view === 'connected' && (
            <Panel>
              <Row label="Calendar" value={calendar ? 'Connected' : undefined} good={!!calendar}
                action={calendar === false ? 'Connect' : undefined} onPress={() => go('/integrations')} />
              <Row label="Reminders" action="Set up" onPress={() => go('/integrations')} />
              <Row label="Voice" value={canSpeak() ? 'On this phone' : undefined} action={canSpeak() ? undefined : 'Set up'}
                onPress={() => go('/settings')} />
            </Panel>
          )}
        </>
      )}
    </Sheet>
  );
}
