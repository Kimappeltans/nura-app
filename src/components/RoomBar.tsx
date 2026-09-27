import { useEffect } from 'react';
import { startEngine } from '../learn/engine';
import { View, Text, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { useDesk } from '../screen';

const wordmark = require('../../assets/brand/wordmark-tight.webp');

/**
 * The top of each of the three rooms: the room's name, the wordmark on Home.
 * More (profile, settings, wins…) is the tab bar's You now, not a button here.
 */
export function RoomBar({ title = 'Nura', who = 'nu' }: { title?: string; who?: 'nu' | 'ra' }) {
  const t = useTheme();
  // the learning's weekly notes: collected or queued once a day, from whichever room opens first
  useEffect(() => { startEngine(); }, []);
  // below the status bar with room to breathe; where there's no status bar
  // (the web, some iPads) it still keeps off the top edge
  const insets = useSafeAreaInsets();
  // a wide web window: the wordmark is at the top of the sidebar
  const desk = useDesk();
  if (desk) return null;
  return (
    // v5: a 44px bar — the wordmark at 20, the companion in a 40px tile
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 24, paddingRight: 20,
      paddingTop: insets.top > 20 ? 8 : 16, height: (insets.top > 20 ? 8 : 16) + 44,
    }}>
      {title === 'Nura'
        // the name as it is in the opening: the wordmark, not typed out
        ? <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
            style={{ height: 20, width: 20 * 799 / 222, tintColor: t.ink }} />
        : <Text style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.3 }}>{title}</Text>}
    </View>
  );
}
