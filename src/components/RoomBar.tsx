import { useEffect, useState } from 'react';
import { startEngine } from '../learn/engine';
import { View, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { AppMenu } from './AppMenu';

const wordmark = require('../../assets/brand/wordmark-tight.webp');

/**
 * The top of each of the three rooms: the room's name on the left ("Nura"
 * on Home and Your tasks, "Your day" there), and on the right a round button
 * with the companion of the room in it — Nu, or Ra on Your day — which opens
 * More, where everything secondary lives (profile, settings, wins…).
 */
export function RoomBar({ title = 'Nura', who = 'nu' }: { title?: string; who?: 'nu' | 'ra' }) {
  const t = useTheme();
  const [more, setMore] = useState(false);
  // the learning's weekly notes: collected or queued once a day, from whichever room opens first
  useEffect(() => { startEngine(); }, []);
  // below the status bar with room to breathe; where there's no status bar
  // (the web, some iPads) it still keeps off the top edge
  const insets = useSafeAreaInsets();
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
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => { Haptics.selectionAsync(); setMore(true); }} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="More — profile, settings and wins"
        style={({ pressed }) => ({
          width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          backgroundColor: pressed ? t.subtle : t.card, borderWidth: 1, borderColor: t.stroke,
        })}>
        <Image source={poseImage(who === 'nu' ? 'nu-hello' : 'ra-icon')} style={{ width: 42, height: 42, marginTop: 5 }} resizeMode="contain" />
      </Pressable>
      <AppMenu visible={more} onClose={() => setMore(false)} />
    </View>
  );
}
