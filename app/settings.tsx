import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform, Share } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { getFlag, setFlag, totalLight, totalWins, exportLog } from '../src/db';
import { hasCalendarPermission } from '../src/calendar';
import { supabase } from '../src/supabase';
import { rankFor } from '../src/reward';
import { radius, type as T } from '../src/theme';
import { Mica, Surface, IconChevron, IconCalendar, IconBell, IconCheck, Character } from '../src/ui';
import { ActionSheet } from '../src/components/ActionSheet';
import { askToReplayIntro } from '../src/intro';
import { LANGUAGES, getLanguage, setLanguage, languageName, type LangCode } from '../src/planner';
import { canSpeak, readsAloud, setReadsAloud, voicesForLanguage, chosenVoice, setChosenVoice, say, type VoiceOption } from '../src/voice';

/**
 * Settings.
 *
 * This screen exists because of a genuine hole: onboarding is a one-time gate,
 * so once someone tapped through it there was NO route back — not to the
 * intro, not to the integrations list, not to sign-in. Every service on the
 * Connect screen is something people hook up weeks in rather than on day one,
 * and "Skip for now" was quietly permanent.
 */
function Settings() {
  const t = useTheme();
  const { light, total, session, appearance, setAppearance } = useStore();
  const [cal, setCal] = useState(false);
  const [notif, setNotif] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [lang, setLang] = useState<LangCode>('en');
  const [aloud, setAloud] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'lang' | 'voice' | null>(null);

  // useFocusEffect, not a mount-only effect — this screen stays mounted
  // underneath Integrations/Connect while the user grants permissions there,
  // so a once-only effect left "Connected apps" and "Reminders" showing
  // stale, permanently-not-connected status after coming back.
  useFocusEffect(useCallback(() => {
    (async () => {
      setCal(await hasCalendarPermission());
      // the real permission, not "was asked" — the flag is also set when
      // the answer was no, which made this row say On for someone who'd
      // turned reminders down
      setNotif(Platform.OS !== 'web' && (await Notifications.getPermissionsAsync()).status === 'granted');
      setLang(await getLanguage());
      setAloud(await readsAloud());
      setVoices(await voicesForLanguage());
      setVoice(await chosenVoice());
    })();
  }, []));

  const pickLanguage = async (code: LangCode) => {
    await setLanguage(code);
    await setChosenVoice(null);          // a voice belongs to one language
    setLang(code); setVoice(null);
    setVoices(await voicesForLanguage());
  };

  // The store's `session` clears itself — supabase.auth.onAuthStateChange
  // in app/_layout.tsx is the one listener for that, same as sign-in. This
  // never touches local data: everything captured stays on the phone,
  // signed in or not.
  const signOut = () => {
    Alert.alert('Sign out?', 'Your tasks stay on this phone either way — signing out only stops syncing them.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        setSigningOut(false);
      } },
    ]);
  };

  const rank = rankFor(light);

  const Row = ({ icon, title, sub, right, onPress }: {
    icon?: React.ReactNode; title: string; sub?: string;
    right?: React.ReactNode; onPress?: () => void;
  }) => (
    <Pressable
      onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 13,
        paddingHorizontal: 15, paddingVertical: 15,
        backgroundColor: pressed && onPress ? t.subtle : 'transparent',
      })}>
      {!!icon && (
        <View style={{
          width: 32, height: 32, borderRadius: radius.sm + 2,
          alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash,
        }}>{icon}</View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand }}>{title}</Text>
        {!!sub && <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <IconChevron size={16} color={t.ink3} /> : null)}
    </Pressable>
  );

  const Divider = () => <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 60 }} />;

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 20 }}>
      <Text style={{
        color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand,
        marginBottom: 8, marginLeft: 4,
      }}>{title.toUpperCase()}</Text>
      <Surface>{children}</Surface>
    </View>
  );

  const On = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <IconCheck size={16} color={t.ra} />
      <Text style={{ color: t.ra, fontSize: 13.5, fontFamily: T.brand }}>On</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => goBack()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>← Today</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>

        <Surface accent="ra">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
            <Character name="ra-celebrate" size={62} motion="bob" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 18, fontFamily: T.display }}>{rank.name}</Text>
              <Text style={{ color: t.ink3, fontSize: 13, marginTop: 2 }}>
                {light} light · {total} things done
              </Text>
            </View>
          </View>
        </Surface>

        <Group title="Account">
          {session ? (
            <Row
              title={session.user.email ?? 'Signed in'}
              sub={signingOut ? 'Signing out…' : 'Syncing your tasks across devices.'}
              right={signingOut ? undefined : <On />}
              onPress={signingOut ? undefined : signOut}
            />
          ) : (
            <Row
              title="Sign in or create an account"
              sub="Sync across devices and unlock the integrations that need a server."
              onPress={() => router.push('/auth')}
            />
          )}
        </Group>

        <Group title="Connections">
          <Row
            icon={<IconCalendar size={17} color={cal ? t.ra : t.nu} />}
            title="Connected apps"
            sub="Calendar, reminders, and the work apps."
            right={cal ? <On /> : undefined}
            onPress={() => router.push('/integrations')}
          />
          <Divider />
          <Row
            icon={<IconBell size={17} color={notif ? t.ra : t.nu} />}
            title="Reminders"
            sub={notif ? 'A few a day, and they get quieter if ignored.'
              : Platform.OS === 'web' ? 'Only in the iPhone app.' : 'Off.'}
            right={notif ? <On /> : undefined}
            onPress={() => router.push('/integrations')}
          />
        </Group>

        <Group title="Nu &amp; Ra">
          <Row
            title="Companions"
            sub="How far they've grown, and every scene you've found."
            onPress={() => router.push('/companions')}
          />
          <Divider />
          <Row
            title="Watch the opening again"
            sub="Where Nu and Ra come from. Nothing else changes."
            onPress={() => router.push('/opening')}
          />
        </Group>

        <Group title="Appearance">
          {([
            ['nura', 'Nu & Ra', 'Home dark, focus light, as Nura was designed'],
            ['light', 'Light', 'Every screen light'],
            ['dark', 'Dark', 'Every screen dark'],
          ] as const).map(([key, title, sub], i) => (
            <View key={key}>
              {i > 0 && <Divider />}
              <Row title={title} sub={sub}
                right={appearance === key ? <IconCheck size={18} color={t.ra} /> : <View style={{ width: 18 }} />}
                onPress={() => setAppearance(key)} />
            </View>
          ))}
        </Group>

        <Group title="Language &amp; voice">
          <Row
            title="Language for Nu and Ra"
            sub={`Nu plans, listens and answers in ${languageName(lang)}. The rest of the app stays in English for now.`}
            right={<Text style={{ color: t.ink2, fontSize: 14 }}>{languageName(lang)}</Text>}
            onPress={() => setSheet('lang')}
          />
          {canSpeak() && (
            <>
              <Divider />
              <Row
                title="Voice"
                sub={voices.length ? 'Which of this phone’s voices reads Nu and Ra aloud.'
                  : `This phone has no ${languageName(lang)} voice, so replies stay as text.`}
                right={<Text style={{ color: t.ink2, fontSize: 14 }} numberOfLines={1}>
                  {voices.find(v => v.id === voice)?.name ?? 'Default'}
                </Text>}
                onPress={voices.length ? () => setSheet('voice') : undefined}
              />
              <Divider />
              <Row
                title="Read replies aloud"
                sub={aloud ? 'Nu and Ra speak each new reply. Tap Stop to quiet one.' : 'Only when you tap “Hear it”.'}
                right={aloud ? <On /> : <Text style={{ color: t.ink3, fontSize: 13.5 }}>Off</Text>}
                onPress={async () => { await setReadsAloud(!aloud); setAloud(!aloud); }}
              />
            </>
          )}
        </Group>

        <Group title="Backlog">
          <Row
            title="One pass through your backlog"
            sub="Go through what's waiting, one decision each. Not graded."
            onPress={() => router.push('/triage')}
          />
        </Group>

        <Group title="Habits">
          <Row
            title="Add a habit"
            sub="A cue and a tiny action — not a recurring task, no streak."
            onPress={() => router.push('/habit')}
          />
        </Group>

        <Group title="Your data">
          <Row
            title="Export activity log"
            sub="What Nura has recorded — tasks shown, started, finished — as a file you keep. Nothing is sent anywhere."
            onPress={async () => {
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
            }}
          />
        </Group>

        <Group title="Help">
          <Row
            title="Start from the beginning"
            sub="The story and the first questions again. Your tasks are untouched."
            onPress={askToReplayIntro}
          />
        </Group>

        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19, marginTop: 20, paddingHorizontal: 4 }}>
          {session
            ? 'Everything you write down is stored on this phone, and your tasks and habits are copied to your account so they reach your other devices. Your activity history stays here.'
            : 'Everything you write down is stored on this phone, and there is no account until you make one.'}
          {' '}When you ask Nu to plan something bigger, that goal, your answers and the project’s steps are sent to Nura’s planner to work out the next move. They aren’t kept there.
        </Text>

        <ActionSheet visible={sheet === 'lang'} title="Language for Nu and Ra" dismissLabel="Close" onDismiss={() => setSheet(null)}
          actions={LANGUAGES.map(l => ({
            key: l.code, glyph: l.code === lang ? '✓' : '·', label: l.name, onPress: () => pickLanguage(l.code),
          }))} />
        <ActionSheet visible={sheet === 'voice'} title="Voice" subtitle={languageName(lang)} dismissLabel="Close" onDismiss={() => setSheet(null)}
          actions={[
            { key: 'default', glyph: voice ? '·' : '✓', label: 'The phone’s default',
              onPress: async () => { await setChosenVoice(null); setVoice(null); say('I’m here. Let’s find one place to begin.'); } },
            ...voices.slice(0, 7).map(v => ({
              key: v.id, glyph: v.id === voice ? '✓' : '·', label: v.name, sub: v.enhanced ? 'enhanced' : undefined,
              onPress: async () => { await setChosenVoice(v.id); setVoice(v.id); say('I’m here. Let’s find one place to begin.'); },
            })),
          ]} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default withTabs(Settings);
