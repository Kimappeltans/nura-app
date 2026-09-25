import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { useStore, useTheme } from '../store';
import { getDb } from '../db';
import { hasCalendarPermission } from '../calendar';
import { canSpeak } from '../voice';
import { askToReplayIntro } from '../intro';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { Sheet } from './Sheet';

/**
 * MORE — behind the round button top right. A tall sheet with Nu at the top:
 * Profile, Companions, Wins, Connected apps and Settings open inside it (← to
 * come back), each with the few things you'd want at a glance and a way to
 * the full screen. The calendar lives in Your day, the backlog pass and
 * habits in Your tasks. (The earlier every-place menu: src/legacy/AppMenu.tsx.)
 */
type View_ = 'menu' | 'profile' | 'companions' | 'wins' | 'connected' | 'settings';

const ITEMS: { key: Exclude<View_, 'menu'>; glyph: string; label: string }[] = [
  { key: 'profile', glyph: '◎', label: 'Profile' },
  { key: 'companions', glyph: '✦', label: 'Companions' },
  { key: 'wins', glyph: '✓', label: 'Wins' },
  { key: 'connected', glyph: '↗', label: 'Connected apps' },
  { key: 'settings', glyph: '⚙', label: 'Settings' },
];

const APPEARANCE = { nura: 'Nu & Ra', light: 'Light', dark: 'Dark' } as const;

export function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { session, wins, appearance, dayEndMin, profile } = useStore();
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
  const endLabel = new Date(new Date().setHours(0, dayEndMin, 0, 0)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Image source={poseImage('nu-listen')} style={{ width: 56, height: 56 }} resizeMode="contain" />
            <Text style={{ color: t.ink, fontSize: 23, fontFamily: T.display, letterSpacing: -0.4 }}>More</Text>
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
                  <Text style={{ color: t.nu, fontSize: 14 }}>{i.glyph}</Text>
                </View>
                <Text style={{ flex: 1, color: t.ink, fontSize: 15.5 }}>{i.label}</Text>
                <Text style={{ color: t.ink3, fontSize: 17 }}>›</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 26, gap: 16 }}>
            <Quiet label="Plan something bigger" onPress={() => go('/project/new')} />
            <Quiet label="Watch the opening again" onPress={() => go('/opening')} />
            <Quiet label="Start from the beginning" onPress={() => { onClose(); setTimeout(askToReplayIntro, 250); }} />
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

          {view === 'profile' && (
            <Panel>
              <Row label="Account" value={session ? 'Signed in' : 'Not signed in'} good={!!session}
                onPress={session ? () => go('/settings') : () => go('/auth')} />
              <Row label="Personal details" action="Edit" onPress={() => go('/profile')} />
              <Row label="Name" value={profile.name || '—'} />
              <Row label="Preferences" onPress={() => go('/settings')} />
            </Panel>
          )}
          {view === 'companions' && (
            <Panel>
              {([['nu-listen', 'Nu', 'Capture and organise'], ['ra-icon', 'Ra', 'Focus and action']] as const).map(([pose, name, role]) => (
                <Pressable key={name} onPress={() => go('/companions')} style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderBottomWidth: 1, borderBottomColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                  <Image source={poseImage(pose)} style={{ width: 52, height: 52 }} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15, fontFamily: T.display }}>{name}</Text>
                    <Text style={{ color: t.ink3, fontSize: 13, marginTop: 1 }}>{role}</Text>
                  </View>
                  <Text style={{ color: t.ink3, fontSize: 17 }}>›</Text>
                </Pressable>
              ))}
            </Panel>
          )}
          {view === 'wins' && (
            <Panel>
              <Row label="Today" value={String(winsToday)} />
              <Row label="This week" value={String(winsWeek)} />
              <Row label="Focus time this week" value={focusMin == null ? '—' : span(Math.round(focusMin))} />
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
          {view === 'settings' && (
            <Panel>
              <Row label="Day ends" value={endLabel} onPress={() => { onClose(); useStore.setState({ tab: 'day' }); }} />
              <Row label="Appearance" value={APPEARANCE[appearance]} onPress={() => go('/settings')} />
              <Row label="Reminders, language & voice" onPress={() => go('/settings')} />
              <Row label="All settings" onPress={() => go('/settings')} />
            </Panel>
          )}
        </>
      )}
    </Sheet>
  );
}

function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button">
      <Text style={{ color: t.ink2, fontSize: 14.5 }}>{label}</Text>
    </Pressable>
  );
}
