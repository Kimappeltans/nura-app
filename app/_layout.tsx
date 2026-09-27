import { useEffect, useRef, useState } from 'react';
import { Stack, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, LogBox, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import {
  useFonts, InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold,
} from '@expo-google-fonts/inter-tight';
import { getDb, migrate, dropCrumb, onOpenElsewhere, getBlockers, getFlag, setFlag } from '../src/db';
import {
  initNotifications,
  attachResponseHandler, attachDeliveryHandler,
} from '../src/notifications';
import { useStore, useRoomsLight, useTheme, type Tab } from '../src/store';
import { supabase, loadSession, openedFromLink } from '../src/supabase';
import { runSync, adoptLocalData, hasAdopted } from '../src/sync';
import { claimDevice, toSignInNext } from '../src/account';
import { notify } from '../src/notify';
import { Celebrate, Toast } from '../src/ui';
import Loading from '../src/screens/Loading';
import { CaptureSheet } from '../src/components/CaptureSheet';
import { keepNameFrom } from '../src/useAuthActions';
import { COLUMN, isDesk, isWide } from '../src/screen';
import { type as T } from '../src/theme';

// An unsigned simulator build has no keychain access, so expo-notifications
// can't read its saved push registration and says so on every launch. It
// can't happen in a signed build; hidden in development only.
// On the web, the browser draws its own square focus ring inside our rounded
// fields — the fields show focus themselves (their border lights up).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'input, textarea { outline: none !important; box-shadow: none !important; }';
  document.head.appendChild(style);
}

if (__DEV__) LogBox.ignoreLogs(['[expo-notifications] Error reading persisted server registration']);

/** How long startup may take before it says something went wrong, instead of Loading for ever. */
const STARTUP_LIMIT = 20_000;

/**
 * Anything that breaks while drawing the app lands here (expo-router shows
 * it in place of the layout) instead of a blank or frozen screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { console.warn('[nura] screen failed', error); }, [error]);
  return <SomethingWrong onRetry={retry} />;
}

/** "Something went wrong." with Try again, and on the web a reload too. */
function SomethingWrong({ onRetry, reloadOnly }: { onRetry: () => void; reloadOnly?: boolean }) {
  const t = useTheme();
  const reload = () => window.location.reload();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 22 }}>
        <Text style={{ color: t.ink, fontSize: 24, lineHeight: 30, fontFamily: T.display, letterSpacing: -0.6, textAlign: 'center' }}>
          Something went wrong.
        </Text>
        <Pressable onPress={reloadOnly ? reload : onRetry} accessibilityRole="button"
          style={({ pressed }) => ({
            height: 52, borderRadius: 26, paddingHorizontal: 34, alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.raBtn[0], opacity: pressed ? 0.92 : 1,
          })}>
          <Text style={{ color: t.onRa, fontSize: 15.5, fontFamily: T.display }}>Try again</Text>
        </Pressable>
        {Platform.OS === 'web' && !reloadOnly && (
          <Pressable onPress={reload} hitSlop={10} accessibilityRole="button">
            <Text style={{ color: t.ink2, fontSize: 15, fontFamily: T.brand }}>Reload the page</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * After a sign-in (and a reset link, which signs in too). A different account
 * than this device's starts from a clean device (src/account.ts), then sync
 * adopts what's here or catches up.
 */
async function afterSignIn(session: Session) {
  await claimDevice(session.user.id);
  await keepNameFrom(session.user.user_metadata);
  if (await hasAdopted()) await runSync(); else await adoptLocalData();
  await useStore.getState().refresh();
}

/** Web: a link's code or error still in the address after startup means it didn't sign in here. */
function tidyAddress(session: Session | null) {
  if (Platform.OS !== 'web' || window.location.pathname === '/reset') return;   // reset.tsx says so itself
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const failed = q.has('error') || q.has('error_code') || h.has('error') || h.has('error_code');
  if (!q.has('code') && !failed) return;
  window.history.replaceState(null, '', window.location.pathname);
  if (session) return;
  // opened in a different browser from the one that asked for it: the email
  // is confirmed all the same, and signing in here carries on
  toSignInNext();
  if (failed) notify('This link has expired', 'Sign in, or ask for a new link.');
}

/**
 * The phone: a sign-in link or an email confirmation opens nura://?code=…,
 * and nothing else swaps that code for the session (the Google sheet swaps
 * its own; nura://reset is app/reset.tsx's).
 */
const swapped = new Set<string>();
async function signInFromLink(url: string) {
  let parsed: ReturnType<typeof Linking.parse>;
  try { parsed = Linking.parse(url); } catch { return; }
  // nura:///reset and nura://reset both
  if (/(^|\/)reset$/.test(`${parsed.hostname ?? ''}/${parsed.path ?? ''}`.replace(/\/+$/, ''))) return;
  const q = parsed.queryParams ?? {};
  if (q.error || q.error_code) {
    if (!useStore.getState().session) notify('This link has expired', 'Sign in, or ask for a new link.');
    return;
  }
  const code = typeof q.code === 'string' ? q.code : null;
  if (!code || swapped.has(code)) return;
  swapped.add(code);
  const { error } = await supabase.auth.exchangeCodeForSession(code).catch(e => ({ error: e }));
  if (error && !useStore.getState().session) {
    notify('That link didn’t sign you in', 'Sign in here, or ask for a new link.');
  }
}

export default function Root() {
  const refresh = useStore(s => s.refresh);
  const mode = useStore(s => s.mode);
  const roomsLight = useRoomsLight();
  const onboarded = useStore(s => s.onboarded);
  const [fontsLoaded, fontError] = useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold });
  const running = useRef<string | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  const elsewhereNow = useRef(false);
  /** startup failed, or never finished: "Something went wrong." */
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => onOpenElsewhere(v => { elsewhereNow.current = v; setElsewhere(v); }), []);
  // a font that won't load is no reason to stop: the system font stands in
  useEffect(() => { if (fontError) console.warn('[nura] fonts did not load', fontError); }, [fontError]);
  const fontsReady = fontsLoaded || !!fontError;

  // An account is required: signed out (a sign out, a deleted account, or a
  // web address typed straight in, before onboarding or after it), every
  // screen but a password reset goes home, where app/index.tsx shows the
  // onboarding or the sign-in. Onboarding itself never leaves home until the
  // account exists.
  const session = useStore(s => s.session);
  const authLoading = useStore(s => s.authLoading);
  const devSkipAuth = useStore(s => s.devSkipAuth);
  const pathname = usePathname();
  const ready = fontsReady && !elsewhere;
  useEffect(() => {
    if (!ready || authLoading || onboarded === null || session || devSkipAuth) return;
    if (pathname === '/' || pathname === '/reset') return;
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  }, [ready, authLoading, onboarded, session, devSkipAuth, pathname]);

  // By the sun: the rooms go navy when the day you set ends, without a reload
  useEffect(() => {
    const id = setInterval(() => useStore.getState().tickDaylight(), 60_000);
    return () => clearInterval(id);
  }, []);

  // the timer tells us which task is in flight, so backgrounding can leave a crumb
  useEffect(() => {
    (globalThis as any).__nuraRunning = (id: string | null) => { running.current = id; };
  }, []);

  // Startup. Every way it can fail ends in the app or in "Something went
  // wrong." with Try again, never in Loading for ever: the database not
  // opening, the first refresh() failing, or nothing answering in time (the
  // wait for another tab to let go of the database doesn't count).
  useEffect(() => {
    let finished = false;
    let late: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      late = setTimeout(() => {
        if (finished) return;
        if (elsewhereNow.current) watch(); else setBroken(true);
      }, STARTUP_LIMIT);
    };
    watch();

    (async () => {
      try {
        await getDb(); await migrate();
      } catch (e) {
        console.warn('[nura] the database did not open', e);
        finished = true; setBroken(true);
        return;
      }
      // Hydrate the session BEFORE the first refresh() — refresh() checks
      // `session` to decide whether to kick off a sync, so a session that
      // arrives after the first refresh would silently miss it until the
      // next mutation. Offline, the saved session still lets you in (supabase.ts).
      const session = await loadSession();
      useStore.getState().setSession(session);
      tidyAddress(session);
      // whose this device is, before anything is shown or synced (src/account.ts)
      if (session) await claimDevice(session.user.id).catch(e => console.warn('[nura] could not check the account', e));
      if (__DEV__) useStore.setState({ devSkipAuth: (await getFlag('dev.skipAuth').catch(() => null)) === '1' });
      useStore.setState({ authLoading: false });
      try {
        await refresh();
      } catch (e) {
        console.warn('[nura] the first refresh failed', e);
        finished = true; setBroken(true);
        return;
      }
      finished = true;
      setBroken(false);   // it was only slow
      try {
        // Someone who said choosing is what gets in the way opens on the one
        // thing, not the list (onboarding). Cold start only — coming back to
        // the app mid-use shouldn't move them.
        if (useStore.getState().onboarded && (await getBlockers()).includes('choosing')) {
          await useStore.getState().toRa();
        }
      } catch (e) { console.warn('[nura] could not open on the one thing', e); }
      // Returning users have already answered the permission prompt — see
      // Nu.tsx, where it is asked once, in context, after the first capture.
      // requestPermissionsAsync is a no-op re-check once decided, so this is
      // safe on every launch and pops nothing for a first-time user.
      // Not awaited: if the notifications module fails or never answers (it
      // does on an unsigned simulator build), the rest of startup still runs.
      if (useStore.getState().onboarded) {
        initNotifications().catch(e => console.warn('[nura] notifications not set up', e));
      }
      // Dev only: open a screen at launch, so each screen can be checked on
      // a simulator without tapping or the "Open in Nura?" prompt a link
      // brings — set the flag `dev.open` to a route and relaunch. Used once,
      // then cleared ("/" just clears it: the home screen, once it's ready).
      // Also `tab:tasks` / `tab:day` (a room) and `tell:<words>` (Tell Nu,
      // open with those words). scripts/screens.sh and scripts/site-shots.sh
      // use it. Compiled out of release builds.
      if (__DEV__) {
        // and on the web, where there's no sqlite3 to reach the database:
        // __nuraFlag('dev.planner', 'local') from the browser console
        (globalThis as any).__nuraFlag = setFlag;
        // TRIAL: __nuraBg('twilight') — see src/themeTrials.ts
        (globalThis as any).__nuraBg = (trial: string) => useStore.setState({ trial: trial as never });
        (globalThis as any).__nuraStore = useStore;
        (globalThis as any).__nuraSheet = (s: string) => useStore.setState({ sheetTrial: s as never });
        (globalThis as any).__nuraDb = require('../src/db');
        (globalThis as any).__nuraProjects = require('../src/projects');
        const route = await getFlag('dev.open').catch(() => null);
        if (route) {
          await setFlag('dev.open', '');
          if (route.startsWith('tab:')) useStore.setState({ tab: route.slice(4) as Tab });
          else if (route.startsWith('tell:')) setTimeout(() => useStore.setState({ telling: true, tellDraft: route.slice(5) }), 600);
          else if (route !== '/') setTimeout(() => router.push(route as never), 300);
        }
      }
    })();

    return () => { finished = true; if (late) clearTimeout(late); };
  }, [attempt]);

  useEffect(() => {
    const sub = attachResponseHandler(
      id => router.push({ pathname: '/timer', params: { id } }),
      () => router.push('/retro'),
    );
    const del = attachDeliveryHandler();

    // The one place the app reacts to a sign-in/out — Auth.tsx's job is
    // only ever "produce a session," never to know what sync is.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      // the first answer is startup's (loadSession, above), which keeps an
      // offline session this one would call signed out
      if (event === 'INITIAL_SESSION') return;
      useStore.getState().setSession(session);
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        // back from Google, a magic link or a reset link on the web: the code
        // has been swapped for the session, so take it out of the address
        if (Platform.OS === 'web' && /[?&](code|error)=/.test(window.location.search)) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        // after this callback returns: supabase-js is still inside it, and sync asks it for the session
        setTimeout(() => { afterSignIn(session).catch(e => console.warn('[nura] after sign-in', e)); }, 0);
      }
      // a reset link that came back as a recovery: straight to a new password
      if (event === 'PASSWORD_RECOVERY') router.push('/reset');
    });

    // the phone: links from an email come back through the nura:// scheme
    let link: { remove: () => void } | null = null;
    if (Platform.OS !== 'web') {
      Linking.getInitialURL().then(u => { if (u) signInFromLink(u); }).catch(() => {});
      link = Linking.addEventListener('url', ({ url }) => { signInFromLink(url); });
    }

    const app = AppState.addEventListener('change', async s => {
      if (s === 'active') {
        // The whole schedule, not just deadlines: the midday/evening anchors
        // were only written on cold start, so a day the ladder had quietened
        // stayed quiet until the app was killed and reopened. Checks the
        // permission itself and does nothing without it.
        refresh().catch(() => {}); initNotifications().catch(() => {});
        if (useStore.getState().session) runSync();
      }
      // leaving mid-task: drop a breadcrumb while the context still exists
      if (s === 'background' && running.current) await dropCrumb(running.current).catch(() => {});
    });

    return () => { sub.remove(); del.remove(); app.remove(); link?.remove(); authSub.subscription.unsubscribe(); };
  }, []);

  if (elsewhere) {
    return <Loading note={openedFromLink && session
      ? 'You’re signed in. Carry on in your other Nura tab.'
      : 'Nura is open in another tab. Close it and this one carries on.'} />;
  }
  // on the web Try again reloads: this tab already holds the database's lock (db.ts)
  if (broken) {
    return <SomethingWrong reloadOnly={Platform.OS === 'web'}
      onRetry={() => { setBroken(false); setAttempt(a => a + 1); }} />;
  }
  if (!fontsReady) return <Loading />;

  return (
    <>
      {/* Ra's world is cream; the rooms follow Settings → Appearance (src/world.tsx) */}
      <StatusBar style={mode === 'ra' || roomsLight ? 'dark' : 'light'} />
      <WebColumn>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wins" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" />
        <Stack.Screen name="companions" />
        <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="integrations" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reset" />
        <Stack.Screen name="retro" />
        <Stack.Screen name="triage" />
        <Stack.Screen name="tide" options={{ presentation: 'modal' }} />
        <Stack.Screen name="habit" />
        <Stack.Screen name="project/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="opening" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
      {/* Above everything, including the native modals — a reward that appears
          behind the screen you earned it on is not a reward. */}
      <TellNu />
      <Celebrate />
      <Toast />
      </WebColumn>
    </>
  );
}


/** Tell Nu, over whichever screen you're on — opened by the tab bar's round button. */
function TellNu() {
  const telling = useStore(s => s.telling);
  return <CaptureSheet visible={telling} onClose={() => useStore.setState({ telling: false })} />;
}

/**
 * On a middling web window (a small tablet, half a laptop), Nura is a
 * phone-width column in the middle, on the room's own ground, instead of
 * stretching the day's path and the front card across the screen
 * (src/screen.ts). Wider, it's the desktop layout: a sidebar and rooms that
 * use the width (src/components/Desk.tsx). Phones, and narrow windows, get
 * the app as it is.
 */
function WebColumn({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  if (!isWide(width) || isDesk(width)) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: t.base, alignItems: 'center' }}>
      <View style={{ flex: 1, width: COLUMN, overflow: 'hidden', borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.stroke }}>
        {children}
      </View>
    </View>
  );
}
