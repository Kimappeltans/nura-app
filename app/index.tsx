import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../src/store';
import Nu from '../src/screens/Nu';
import Ra from '../src/screens/Ra';

/**
 * The whole app is one screen in one of two states. There is no tab bar:
 * the Nu/Ra switch IS the navigation.
 */
export default function Index() {
  const { mode, refresh } = useStore();
  useFocusEffect(useCallback(() => { refresh(); }, []));
  return mode === 'ra' ? <Ra /> : <Nu />;
}
