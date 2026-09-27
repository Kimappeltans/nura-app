import { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useStore, useTheme, PinnedPalette } from '../src/store';
import { nuTheme } from '../src/theme';
// Three rooms and one mode. The earlier homes — the river scene
// (NuHome) and the list-first home (Nu) — are kept in src/legacy.
import Home from '../src/screens/Home';
import Tasks from '../src/screens/Tasks';
import Calendar from '../src/screens/Calendar';
import You from '../src/screens/You';
import Ra from '../src/screens/Ra';
import Onboarding from '../src/screens/Onboarding';
import Auth from '../src/screens/Auth';
import Loading from '../src/screens/Loading';
import { TabBar, type Tab } from '../src/components/TabBar';
import { DeskRoom, DeskColumn } from '../src/components/Desk';
import { STAGE, useDesk } from '../src/screen';

/**
 * The app past onboarding is three rooms in the same dark water, with a tab
 * bar — Home (what should I do now?), Your tasks (what exists?), Calendar
 * (the month, and what's on a day) — and one mode: Focus, Ra's warm
 * room, which has no tab bar because you're doing one thing. Capture is a
 * sheet over whichever room you're in.
 */
export default function Index() {
  const t = useTheme();
  const { mode, onboarded, refresh, session, authLoading, devSkipAuth } = useStore();
  const tab = useStore(s => s.tab);
  const setTab = (k: Tab) => useStore.setState({ tab: k });
  const desk = useDesk();
  useFocusEffect(useCallback(() => { refresh(); }, []));

  if (onboarded === null || authLoading) return <Loading />;
  if (!onboarded) return <Onboarding />;
  // an account is required: signed out, the sign-in screen is all there is
  // (signing in brings the session, and this screen, back by itself)
  if (!session && !devSkipAuth) return <DeskColumn max={STAGE}><Auth onClose={() => {}} /></DeskColumn>;
  if (mode === 'ra') return <Ra />;

  // a wide web window: the tab bar is a sidebar, and the room uses the width
  if (desk) {
    return (
      <DeskRoom>
        {tab === 'home' && <Home onTab={setTab} />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'day' && <Calendar />}
        {tab === 'you' && <You />}
      </DeskRoom>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <Home onTab={setTab} />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'day' && <Calendar />}
        {tab === 'you' && <You />}
      </View>
      {/* over Your Tasks' deep water the bar is Nu's navy */}
      <PinnedPalette.Provider value={tab === 'tasks' ? nuTheme : null}><TabBar /></PinnedPalette.Provider>
    </View>
  );
}
