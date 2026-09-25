import { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useStore, useTheme } from '../src/store';
// Three rooms and one mode. The earlier homes — the river scene
// (NuHome) and the list-first home (Nu) — are kept in src/legacy.
import Home from '../src/screens/Home';
import Tasks from '../src/screens/Tasks';
import Calendar from '../src/screens/Calendar';
import Ra from '../src/screens/Ra';
import Onboarding from '../src/screens/Onboarding';
import Loading from '../src/screens/Loading';
import { TabBar, type Tab } from '../src/components/TabBar';

/**
 * The app past onboarding is three rooms in the same dark water, with a tab
 * bar — Home (what should I do now?), Your tasks (what exists?), Calendar
 * (the month, and what's on a day) — and one mode: Focus, Ra's warm
 * room, which has no tab bar because you're doing one thing. Capture is a
 * sheet over whichever room you're in.
 */
export default function Index() {
  const t = useTheme();
  const { mode, onboarded, refresh } = useStore();
  const tab = useStore(s => s.tab);
  const setTab = (k: Tab) => useStore.setState({ tab: k });
  useFocusEffect(useCallback(() => { refresh(); }, []));

  if (onboarded === null) return <Loading />;
  if (!onboarded) return <Onboarding />;
  if (mode === 'ra') return <Ra />;

  return (
    <View style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <Home onTab={setTab} />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'day' && <Calendar />}
      </View>
      <TabBar />
    </View>
  );
}
