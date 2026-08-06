import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { radius, raTheme, type as T } from '../theme';
import { getFlag, setFlag } from '../db';
import { requestPermission, setupSchedules } from '../notifications';
import { requestCalendarPermission, hasCalendarPermission } from '../calendar';
import { Primary, Mica, Surface, IconCalendar, IconBell, IconCheck } from '../ui';
import {
  GoogleCalIcon, GoogleCalColor, OutlookIcon, OutlookColor,
  AsanaIcon, AsanaColor, NotionIcon, NotionColor, SlackIcon, SlackColor,
  JiraIcon, JiraColor, LinearIcon, LinearColor, TodoistIcon, TodoistColor,
  MsTodoIcon, MsTodoColor, AppleIcon, AppleColor,
} from '../components/BrandIcons';

// tight crop — the original has ~10% invisible margin, see Welcome.tsx
const stone = require('../../assets/brand/nura-logo-tight.png');

export type SyncMode = 'read' | 'two';
type Status = 'idle' | 'busy' | 'connected' | 'soon';

interface Row {
  key: string;
  title: string;
  body: string;
  icon: (c: string) => React.ReactNode;
  status: Status;
  onPress?: () => void;
  /** calendars get a direction control once they're connected */
  syncable?: boolean;
  /** the brand's own colour, used to tint the icon's tile */
  tint?: string;
}

/**
 * Step two: connect what's already in your day.
 *
 * Two honesty rules hold this screen together, and they matter more than the
 * layout:
 *
 *  1. Anything that doesn't work yet says SOON and cannot be tapped. Faking
 *     eight integrations to look established is the fastest way to lose someone
 *     on day two, and App Review takes a dim view of it too.
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
  const t = raTheme;
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
  };

  const connectNotifications = async () => {
    setNotif('busy');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setFlag('notif_asked', '1');
    const ok = await requestPermission();
    if (ok) await setupSchedules();
    setNotif(ok ? 'connected' : 'idle');
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const chooseMode = async (m: SyncMode) => {
    Haptics.selectionAsync();
    setMode(m);
    await setFlag('sync.calendar', m);
  };

  const SECTIONS: { title: string; note?: string; rows: Row[] }[] = [
    {
      title: 'On this phone',
      rows: [
        {
          key: 'calendar', title: 'Calendar', syncable: true,
          body: 'Your real day, next to your tasks. Covers whatever is already in iOS — iCloud, Google, Outlook.',
          icon: c => <IconCalendar size={21} color={c} />,
          status: cal, onPress: connectCalendar,
        },
        {
          key: 'notifications', title: 'Reminders',
          body: 'A few a day, and they get quieter if you’re not answering.',
          icon: c => <IconBell size={21} color={c} />,
          status: notif, onPress: connectNotifications,
        },
      ],
    },
    {
      title: 'Calendars',
      note: 'Sign in directly, so changes you make in Nura appear in them and theirs appear here.',
      rows: [
        { key: 'gcal', title: 'Google Calendar', body: 'Changes sync both ways with your Google account.',
          icon: () => <GoogleCalIcon />, tint: GoogleCalColor, status: 'soon' },
        { key: 'outlook', title: 'Outlook', body: 'The same, for Microsoft and Exchange accounts.',
          icon: () => <OutlookIcon />, tint: OutlookColor, status: 'soon' },
      ],
    },
    {
      title: 'Work apps',
      note: 'Your assigned work turns up in Nura automatically, and finishing it here checks it off there.',
      rows: [
        { key: 'asana', title: 'Asana', body: 'Tasks assigned to you, with their due dates.',
          icon: () => <AsanaIcon />, tint: AsanaColor, status: 'soon' },
        { key: 'notion', title: 'Notion', body: 'Any database you use as a task list.',
          icon: () => <NotionIcon />, tint: NotionColor, status: 'soon' },
        { key: 'slack', title: 'Slack', body: 'Turn a saved message into a task without leaving the thread.',
          icon: () => <SlackIcon />, tint: SlackColor, status: 'soon' },
        { key: 'jira', title: 'Jira', body: 'Issues assigned to you, in the same list as everything else.',
          icon: () => <JiraIcon />, tint: JiraColor, status: 'soon' },
        { key: 'linear', title: 'Linear', body: 'Your assigned issues, with their cycle.',
          icon: () => <LinearIcon />, tint: LinearColor, status: 'soon' },
        { key: 'todoist', title: 'Todoist', body: 'Bring an existing list across, or keep both in step.',
          icon: () => <TodoistIcon />, tint: TodoistColor, status: 'soon' },
        { key: 'mstodo', title: 'Microsoft To Do', body: 'The same, for a Microsoft account.',
          icon: () => <MsTodoIcon />, tint: MsTodoColor, status: 'soon' },
      ],
    },
    {
      title: 'Health',
      rows: [
        { key: 'health', title: 'Apple Health', body: 'Reads last night’s sleep to set your energy for you.',
          icon: () => <AppleIcon />, tint: AppleColor, status: 'soon' },
      ],
    },
  ];

  const anyConnected = cal === 'connected' || notif === 'connected';

  const ModeButton = ({ m, label, sub }: { m: SyncMode; label: string; sub: string }) => {
    const on = mode === m;
    return (
      <Pressable onPress={() => chooseMode(m)} style={{
        flex: 1, paddingVertical: 9, paddingHorizontal: 11, borderRadius: radius.md,
        backgroundColor: on ? t.raWash : 'transparent',
        borderWidth: 1.5, borderColor: on ? t.ra : t.stroke,
      }}>
        <Text style={{ color: on ? t.raDeep : t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{label}</Text>
        <Text style={{ color: t.ink3, fontSize: 12, marginTop: 1.5, lineHeight: 15 }}>{sub}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica force="ra" />

      <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12 }}>
        {!!onBack && (
          <Pressable onPress={onBack} hitSlop={12} style={{ alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 2 }}>
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
          />
          <Text style={{
            color: t.ink, fontSize: 28, lineHeight: 36, fontFamily: T.display,
            letterSpacing: -0.9, textAlign: 'center',
          }}>
            Connect your day.
          </Text>
          <Text style={{
            color: t.ink2, fontSize: 14.5, lineHeight: 21, marginTop: 8,
            textAlign: 'center', maxWidth: 290,
          }}>
            Nura plans against the hours you actually have. You can change any of this later.
          </Text>
        </View>

        <ScrollView style={{ flex: 1, marginTop: 16 }} showsVerticalScrollIndicator={false}>
          {SECTIONS.map(sec => (
            <View key={sec.title} style={{ marginBottom: 18 }}>
              <Text style={{
                color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand,
                marginBottom: 6, marginLeft: 3,
              }}>{sec.title.toUpperCase()}</Text>
              {!!sec.note && (
                <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18, marginBottom: 8, marginLeft: 3 }}>
                  {sec.note}
                </Text>
              )}

              <Surface>
                {sec.rows.map((r, i) => {
                  const soon = r.status === 'soon';
                  const done = r.status === 'connected';
                  return (
                    <View key={r.key}>
                      {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 56 }} />}
                      <Pressable
                        disabled={soon || r.status === 'busy' || done}
                        onPress={r.onPress}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingHorizontal: 14, paddingVertical: 13,
                          backgroundColor: pressed ? t.subtle : 'transparent',
                          opacity: soon ? 0.72 : 1,
                        })}>
                        {/* Each brand's own colour, at 12% for the tile. A row
                            of identical coral squares made nine different
                            services look like nine copies of one thing. */}
                        <View style={{
                          width: 34, height: 34, borderRadius: radius.md,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: r.tint ? `${r.tint}1F` : t.raWash,
                        }}>{r.icon(r.tint ?? t.raDeep)}</View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand }}>{r.title}</Text>
                          <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 16.5, marginTop: 1.5 }}>{r.body}</Text>
                        </View>

                        {r.status === 'busy' ? <ActivityIndicator size="small" color={t.raDeep} />
                          : done ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <IconCheck size={16} color={t.raDeep} />
                              <Text style={{ color: t.raDeep, fontSize: 13, fontFamily: T.brand }}>On</Text>
                            </View>
                          ) : soon ? (
                            <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1, fontFamily: T.brand }}>SOON</Text>
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
                        <View style={{
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

          <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 17.5, marginBottom: 8, paddingHorizontal: 2 }}>
            Nothing is shared with anyone. Nura only ever edits events it created itself.
          </Text>
        </ScrollView>

        <View style={{ gap: 11, marginTop: 10 }}>
          <Primary label={anyConnected ? 'Done' : 'Continue'} tone="ra" onPress={finish} />
          {!anyConnected && (
            <Pressable onPress={finish} hitSlop={10}>
              <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>Skip for now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
