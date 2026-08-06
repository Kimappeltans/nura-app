import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import {
  useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { getDb, migrate, dropCrumb } from '../src/db';
import {
  initNotifications, reconcileNudges, scheduleTransitionWarning,
  attachResponseHandler, attachDeliveryHandler,
} from '../src/notifications';
import { useStore } from '../src/store';
import { Celebrate, Toast } from '../src/ui';
import Loading from '../src/screens/Loading';

export default function Root() {
  const refresh = useStore(s => s.refresh);
  const mode = useStore(s => s.mode);
  const onboarded = useStore(s => s.onboarded);
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  const running = useRef<string | null>(null);

  // the timer tells us which task is in flight, so backgrounding can leave a crumb
  useEffect(() => {
    (globalThis as any).__nuraRunning = (id: string | null) => { running.current = id; };
  }, []);

  useEffect(() => {
    (async () => {
      await getDb(); await migrate();
      await refresh();
      // Returning users have already answered the permission prompt — see
      // Nu.tsx, where it is asked once, in context, after the first capture.
      // requestPermissionsAsync is a no-op re-check once decided, so this is
      // safe on every launch and pops nothing for a first-time user.
      if (useStore.getState().onboarded) await initNotifications();
    })();

    const sub = attachResponseHandler(
      id => router.push({ pathname: '/timer', params: { id } }),
      () => router.push('/retro'),
    );
    const del = attachDeliveryHandler();

    const app = AppState.addEventListener('change', async s => {
      if (s === 'active') { refresh(); reconcileNudges(); scheduleTransitionWarning(); }
      // leaving mid-task: drop a breadcrumb while the context still exists
      if (s === 'background' && running.current) await dropCrumb(running.current);
    });

    return () => { sub.remove(); del.remove(); app.remove(); };
  }, []);

  if (!fontsLoaded) return <Loading />;

  // The welcome screen is dark navy now (it's painted the intro clip's own
  // background colour), so the bar goes light there. Connect, the second
  // onboarding screen, is still cream — but it owns its own bar via the
  // gradient, and a light bar on cream is unreadable, so onboarding as a whole
  // stays dark-bar and Welcome sets its own.
  const light = onboarded === false ? false : mode !== 'ra';

  return (
    <>
      <StatusBar style={light ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wins" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="companions" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="integrations" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="retro" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Above everything, including the native modals — a reward that appears
          behind the screen you earned it on is not a reward. */}
      <Celebrate />
      <Toast />
    </>
  );
}
