import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useStore, useTheme } from '../src/store';
// Three rooms and one mode. The earlier homes — the river scene
// (NuHome) and the list-first home (Nu) — are kept in src/legacy.
import Home from '../src/screens/Home';
import Tasks from '../src/screens/Tasks';
import Day from '../src/screens/Day';
import Ra from '../src/screens/Ra';
import Onboarding from '../src/screens/Onboarding';
import Loading from '../src/screens/Loading';
import { TabBar, type Tab } from '../src/components/TabBar';
import { CaptureSheet } from '../src/components/CaptureSheet';

/**
 * The app past onboarding is three rooms in the same dark water, with a tab
 * bar — Home (what should I do now?), Your tasks (what exists?), Your day
 * (what's happening, and what happened?) — and one mode: Focus, Ra's warm
 * room, which has no tab bar because you're doing one thing. Capture is a
 * sheet over whichever room you're in.
 */
export default function Index() {
  const t = useTheme();
  const { mode, onboarded, refresh } = useStore();
  const tab = useStore(s => s.tab);
  const setTab = (k: Tab) => useStore.setState({ tab: k });
  const [capturing, setCapturing] = useState(false);
  useFocusEffect(useCallback(() => { refresh(); }, []));

  if (onboarded === null) return <Loading />;
  if (!onboarded) return <Onboarding />;
  if (mode === 'ra') return <Ra />;

  const capture = () => setCapturing(true);
  return (
    <View style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <Home onTab={setTab} onCapture={capture} />}
        {tab === 'tasks' && <Tasks onCapture={capture} />}
        {tab === 'day' && <Day />}
      </View>
      <TabBar />
      <CaptureSheet visible={capturing} onClose={() => setCapturing(false)} />
    </View>
  );
}
