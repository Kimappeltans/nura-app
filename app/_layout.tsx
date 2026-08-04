import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { getDb, migrate, dropCrumb, getMode } from '../src/db';
import {
  initNotifications, reconcileNudges, attachResponseHandler, attachDeliveryHandler,
} from '../src/notifications';
import { useStore } from '../src/store';

export default function Root() {
  const refresh = useStore(s => s.refresh);
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
      await initNotifications();
    })();

    const sub = attachResponseHandler(
      id => router.push({ pathname: '/timer', params: { id } }),
      () => router.push('/retro'),
    );
    const del = attachDeliveryHandler();

    const app = AppState.addEventListener('change', async s => {
      if (s === 'active') { refresh(); reconcileNudges(); }
      // leaving mid-task: drop a breadcrumb while the context still exists
      if (s === 'background' && running.current) await dropCrumb(running.current);
    });

    return () => { sub.remove(); del.remove(); app.remove(); };
  }, []);

  if (!fontsLoaded) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wins" options={{ presentation: 'modal' }} />
        <Stack.Screen name="retro" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
