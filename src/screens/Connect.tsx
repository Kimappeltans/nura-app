import { useTheme } from '../store';
import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { radius, type as T } from '../theme';
import { StatusBar } from 'expo-status-bar';
import { getFlag, setFlag } from '../db';
import { requestPermission, setupSchedules } from '../notifications';
import { requestCalendarPermission, hasCalendarPermission } from '../calendar';
import { Primary, Mica, Surface, IconCalendar, IconBell, IconCheck } from '../ui';
import { announce, decorative } from '../a11y';

// tight crop — the original has ~10% invisible margin, see Welcome.tsx
const stone = require('../../assets/brand/nura-logo-tight.webp');

export type SyncMode = 'read' | 'two';
type Status = 'idle' | 'busy' | 'connected' | 'phone';

/** The calendar and reminders are the phone's: on the web they can only be pointed at. */
const web = Platform.OS === 'web';

interface Row {
  key: string;
  title: string;
  /** one fact, when the title needs it */
  body?: string;
  icon: (c: string) => React.ReactNode;
  status: Status;
  onPress?: () => void;
  /** calendars get a direction control once they're connected */
  syncable?: boolean;
}

/**
 * Connect what's already in your day: the phone's calendar and reminders,
 * opened from Settings (app/integrations.tsx).
 *
 * Two honesty rules hold this screen together, and they matter more than the
 * layout:
 *
 *  1. Only what works is listed. The work apps and Apple Health were cut
 *     (SCOPE.md) rather than shown as SOON, and on the web the two rows say
 *     iPhone only instead of offering a Connect that can't work there.
 *  2. Direction is explicit. A calendar is READ ONLY until you say otherwise —
 *     nothing gets written into someone's work calendar because a default was
 *     set that way.
 */
export default function Connect(
  { onDone, onBack }: { onDone: () => void; onBack?: () => void },
) {
  // Fixed bright, like Auth.tsx and Compose.tsx — this is onboarding chrome,
  // not the Nu/Ra experience, so it shouldn't inherit whatever mode happens
  // to be active (which, before you've ever touched the mode switch, is Nu).
  const t = useTheme();
  const [cal, setCal] = useState<Status>('idle');
  const [notif, setNotif] = useState<Status>('idle');
  const [mode, setMode] = useState<SyncMode>('read');

  useEffect(() => {
    (async () => {
      if (await hasCalendarPermission()) setCal('connected');
      setMode(((await getFlag('sync.calendar')) as SyncMode) ?? 'read');
    })();
  }, []);

  // Seeing this screen IS being asked. Without this, skipping here meant Home
  // opened and immediately asked for the same two permissions again.
  const finish = async () => {
    await setFlag('cal_asked', '1');
    await setFlag('notif_asked', '1');
    onDone();
  };

  const connectCalendar = async () => {
    setCal('busy');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setFlag('cal_asked', '1');
    const ok = await requestCalendarPermission();
    setCal(ok ? 'connected' : 'idle');
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    announce(ok ? 'Calendar on' : 'Calendar not connected');
  };

  const connectNotifications = async () => {
    setNotif('busy');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setFlag('notif_asked', '1');
    const ok = await requestPermission();
    if (ok) await setupSchedules();
    setNotif(ok ? 'connected' : 'idle');
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    announce(ok ? 'Reminders on' : 'Reminders not connected');
  };

  const chooseMode = async (m: SyncMode) => {
    Haptics.selectionAsync();
    setMode(m);
    await setFlag('sync.calendar', m);
  };

  const SECTIONS: { title: string; rows: Row[] }[] = [
    {
      title: web ? 'On iPhone' : 'On this phone',
      rows: [
        {
          key: 'calendar', title: 'Calendar', syncable: true,
          body: 'iCloud, Google, Outlook',
          icon: c => <IconCalendar size={21} color={c} />,
          status: web ? 'phone' : cal, onPress: connectCalendar,
        },
        {
          key: 'notifications', title: 'Reminders',
          icon: c => <IconBell size={21} color={c} />,
          status: web ? 'phone' : notif, onPress: connectNotifications,
        },
      ],
    },
  ];

  const anyConnected = cal === 'connected' || notif === 'connected';

  const ModeButton = ({ m, label, sub }: { m: SyncMode; label: string; sub: string }) => {
    const on = mode === m;
    return (
      <Pressable onPress={() => chooseMode(m)}
        accessibilityRole="radio" aria-checked={on} accessibilityLabel={`${label}. ${sub}`}
        style={{
        flex: 1, paddingVertical: 9, paddingHorizontal: 11, borderRadius: radius.md,
        backgroundColor: on ? t.raWash : 'transparent',
        // the ring is the chosen one's mark: text coral, so it holds 3:1
        borderWidth: 1.5, borderColor: on ? t.raDeep : t.stroke,
      }}>
        <Text style={{ color: on ? t.raDeep : t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{label}</Text>
        <Text style={{ color: t.ink3, fontSize: 12, marginTop: 1.5, lineHeight: 15 }}>{sub}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
        <Mica />

        <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12 }}>
          {!!onBack && (
            <Pressable onPress={onBack} hitSlop={12} style={{ alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 2 }}
              accessibilityRole="button" accessibilityLabel="Back">
              <Text style={{ color: t.ink3, fontSize: 16 }}>← Back</Text>
            </Pressable>
          )}

          {/* Centred title with the mark parked in the corner. The icon is
              absolutely positioned rather than sitting in the flow, so the
              heading stays centred on the SCREEN rather than centred in the
              space the icon happens to leave over. */}
          <View style={{ alignItems: 'center' }}>
            <Image
              source={stone}
              style={{ position: 'absolute', left: 0, top: 0, width: 33, height: 37 }}
              resizeMode="contain"
              {...decorative}
            />
            <Text accessibilityRole="header" style={{
              color: t.ink, fontSize: 28, lineHeight: 36, fontFamily: T.display,
              letterSpacing: -0.9, textAlign: 'center',
            }}>
              Connect your day.
            </Text>
          </View>

          <ScrollView style={{ flex: 1, marginTop: 16 }} showsVerticalScrollIndicator={false}>
            {SECTIONS.map(sec => (
              <View key={sec.title} style={{ marginBottom: 18 }}>
                <Text accessibilityRole="header" style={{
                  color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand,
                  marginBottom: 6, marginLeft: 3,
                }}>{sec.title.toUpperCase()}</Text>

                <Surface>
                  {sec.rows.map((r, i) => {
                    const phone = r.status === 'phone';
                    const done = r.status === 'connected';
                    return (
                      <View key={r.key}>
                        {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 56 }} />}
                        <Pressable
                          disabled={phone || r.status === 'busy' || done}
                          onPress={r.onPress}
                          accessibilityRole="button"
                          accessibilityLabel={
                            r.status === 'busy' ? `${r.title}, connecting`
                            : done ? `${r.title}, on`
                            : phone ? `${r.title}, iPhone only${r.body ? `. ${r.body}` : ''}`
                            : `Connect ${r.title}${r.body ? `. ${r.body}` : ''}`}
                          aria-disabled={phone || r.status === 'busy' || done}
                          aria-busy={r.status === 'busy'}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            paddingHorizontal: 14, paddingVertical: 13,
                            backgroundColor: pressed ? t.subtle : 'transparent',
                          })}>
                          <View style={{
                            width: 34, height: 34, borderRadius: radius.md,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: t.raWash,
                          }}>{r.icon(t.raDeep)}</View>

                          <View style={{ flex: 1 }}>
                            {/* not available here: the second ink, not a faded row (opacity took ink3 under 4.5:1) */}
                            <Text style={{ color: phone ? t.ink2 : t.ink, fontSize: 16, fontFamily: T.brand }}>{r.title}</Text>
                            {!!r.body && <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 16.5, marginTop: 1.5 }}>{r.body}</Text>}
                          </View>

                          {r.status === 'busy' ? <ActivityIndicator size="small" color={t.raDeep} />
                            : done ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <IconCheck size={16} color={t.raDeep} />
                                <Text style={{ color: t.raDeep, fontSize: 13, fontFamily: T.brand }}>On</Text>
                              </View>
                            ) : phone ? (
                              <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>iPhone only</Text>
                            ) : (
                              <View style={{
                                paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill,
                                borderWidth: 1.5, borderColor: t.ra,
                              }}>
                                <Text style={{ color: t.raDeep, fontSize: 13, fontFamily: T.brand }}>Connect</Text>
                              </View>
                            )}
                        </Pressable>

                        {/* Direction, shown only once a calendar is actually on. */}
                        {r.syncable && done && (
                          <View accessibilityRole="radiogroup" accessibilityLabel="Calendar access" style={{
                            flexDirection: 'row', gap: 8,
                            paddingHorizontal: 14, paddingBottom: 13, paddingTop: 2,
                          }}>
                            <ModeButton m="read" label="Read only" sub="Nura never adds anything" />
                            <ModeButton m="two" label="Read &amp; write" sub="Adds your focus sessions" />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </Surface>
              </View>
            ))}
          </ScrollView>

          <View style={{ gap: 11, marginTop: 10 }}>
            <Primary label={anyConnected || onBack ? 'Done' : 'Continue'} tone="ra" onPress={finish} />
            {!anyConnected && !onBack && (
              <Pressable onPress={finish} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 6, marginVertical: -6 }}>
                <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>Skip for now</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
