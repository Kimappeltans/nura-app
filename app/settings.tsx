import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { resetOnboarding, getFlag, setFlag, totalLight, totalWins } from '../src/db';
import { hasCalendarPermission } from '../src/calendar';
import { rankFor } from '../src/reward';
import { radius, type as T } from '../src/theme';
import { Mica, Surface, IconChevron, IconCalendar, IconBell, IconCheck, Character } from '../src/ui';

/**
 * Settings.
 *
 * This screen exists because of a genuine hole: onboarding is a one-time gate,
 * so once someone tapped through it there was NO route back — not to the
 * intro, not to the integrations list, not to sign-in. Every service on the
 * Connect screen is something people hook up weeks in rather than on day one,
 * and "Skip for now" was quietly permanent.
 */
export default function Settings() {
  const t = useTheme();
  const { light, total } = useStore();
  const [cal, setCal] = useState(false);
  const [notif, setNotif] = useState(false);

  // useFocusEffect, not a mount-only effect — this screen stays mounted
  // underneath Integrations/Connect while the user grants permissions there,
  // so a once-only effect left "Connected apps" and "Reminders" showing
  // stale, permanently-not-connected status after coming back.
  useFocusEffect(useCallback(() => {
    (async () => {
      setCal(await hasCalendarPermission());
      setNotif((await getFlag('notif_asked')) === '1');
    })();
  }, []));

  const replay = () => {
    Alert.alert(
      'Show the intro again?',
      'You will land back on the welcome screen. Nothing you have written down is touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show it', onPress: async () => {
            await resetOnboarding();
            await useStore.getState().refresh();
            router.replace('/');
          },
        },
      ],
    );
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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
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
          <Row
            title="Sign in or create an account"
            sub="Sync across devices and unlock the integrations that need a server."
            onPress={() => router.push('/auth')}
          />
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
            sub={notif ? 'Anchors are scheduled, and they soften if ignored.' : 'Not set up yet.'}
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
        </Group>

        <Group title="Help">
          <Row
            title="Show the intro again"
            sub="Replays the welcome and the connect step. Your tasks are untouched."
            onPress={replay}
          />
        </Group>

        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19, marginTop: 20, paddingHorizontal: 4 }}>
          Everything you write down is stored on this phone. Nothing is uploaded,
          and there is no account until you make one.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
