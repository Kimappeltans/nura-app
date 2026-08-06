import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../src/store';
import Nu from '../src/screens/Nu';
import Ra from '../src/screens/Ra';
import Onboarding from '../src/screens/Onboarding';
import Loading from '../src/screens/Loading';

/**
 * The whole app is one screen in one of three states: not-yet-checked
 * (Loading), first-launch (Onboarding — welcome, then connect), or Home/Focus.
 * There is no tab bar: the Home/Focus switch IS the navigation, and onboarding
 * is a one-time gate in front of it.
 */
export default function Index() {
  const { mode, onboarded, refresh } = useStore();
  useFocusEffect(useCallback(() => { refresh(); }, []));

  if (onboarded === null) return <Loading />;
  if (!onboarded) return <Onboarding />;
  return mode === 'ra' ? <Ra /> : <Nu />;
}
