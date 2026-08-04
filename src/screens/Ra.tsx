import { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Card, Primary, Ghost, Title, Body } from '../ui';
import { useStore, useTheme } from '../store';
import { complete, notNow, clearCrumbs } from '../db';
import { reconcileNudges } from '../notifications';
import { radius, type as T, copy } from '../theme';

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

/**
 * RA — the light.
 *
 * Exactly one thing. The list is not rendered, not collapsed, not behind a tab —
 * the screen has no way to display a second task. No counts, no "3 remaining",
 * no peeking. The only way back to everything is back to Nu.
 */
export default function Ra() {
  const t = useTheme();
  const { now, crumb, toNu, refresh } = useStore();

  const back = useCallback(async () => { await toNu(); }, [toNu]);

  const done = async () => {
    if (!now) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await complete(now.id); await clearCrumbs(now.id);
    await refresh(); await reconcileNudges();
    await toNu();     // finishing returns you to the water
  };

  const later = async () => {
    if (!now) return;
    await notNow(now.id); await refresh(); await toNu();
  };

  // interruption recovery: if we left this task mid-flight, show WHERE YOU WERE
  // rather than the task — by the time you return the context is gone, and that
  // is the entire problem.
  const resume = crumb && now && crumb.task.id === now.id ? crumb : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Pressable onPress={back} hitSlop={12} style={{ padding: 18, paddingBottom: 0 }}>
        <Text style={{ color: t.ink3, fontSize: 15 }}>← Everything</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 18, gap: 12 }}>
        {!now ? (
          <Card>
            <Title>{copy.emptyTitle}</Title>
            <View style={{ height: 8 }} />
            <Body>{copy.emptyBody}</Body>
          </Card>
        ) : resume ? (
          <>
            <Card>
              <Text style={{ color: t.ra, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 }}>
                WHERE YOU WERE
              </Text>
              <Title>{now.title}</Title>
              {!!resume.crumb.note && (
                <View style={{ marginTop: 14, padding: 12, borderRadius: radius.md,
                  backgroundColor: t.raWash, borderWidth: 1, borderColor: t.stroke }}>
                  <Body>{resume.crumb.note}</Body>
                </View>
              )}
              {!!now.first_action && <View style={{ height: 8 }} />}
              {!!now.first_action && <Body dim>{now.first_action}</Body>}
              <Text style={{ color: t.ink3, fontSize: 12, marginTop: 12 }}>
                {resume.crumb.context ? `${resume.crumb.context} · ` : ''}{ago(resume.crumb.at)}
              </Text>
            </Card>
            <Primary label="Pick it back up" tone="ra"
              onPress={() => router.push({ pathname: '/timer', params: { id: now.id } })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ghost label="Start it fresh" onPress={async () => {
                await clearCrumbs(now.id); await refresh();
                router.push({ pathname: '/timer', params: { id: now.id } });
              }} />
              <Ghost label="Let it go" onPress={later} />
            </View>
          </>
        ) : (
          <>
            <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: now.id } })}>
              <Card>
                <Text style={{ color: t.ra, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 }}>
                  {copy.nextStep}
                </Text>
                <Title>{now.title}</Title>
                {!!now.first_action && (
                  <View style={{ marginTop: 14, padding: 12, borderRadius: radius.md,
                    backgroundColor: t.nuWash, borderWidth: 1, borderColor: t.stroke }}>
                    <Body>{now.first_action}</Body>
                  </View>
                )}
                {!!now.est_minutes && (
                  <Text style={{ color: t.ink3, fontSize: 12, marginTop: 12 }}>≈ {now.est_minutes} min</Text>
                )}
              </Card>
            </Pressable>

            <Primary label="Begin · 5 minutes" tone="ra"
              onPress={() => router.push({ pathname: '/timer', params: { id: now.id } })} />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ghost label="Done" onPress={done} />
              <Ghost label="Not now" onPress={later} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
