import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { AppMenu } from './AppMenu';
import { NuGlow } from './NuGlow';

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
  // below the status bar with room to breathe; where there's no status bar
  // (the web, some iPads) it still keeps off the top edge
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18,
      paddingTop: insets.top > 20 ? 8 : 20, paddingBottom: 18,
    }}>
      {title === 'Nura'
        // the name as it is in the opening: the wordmark, not typed out
        ? <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
            style={{ height: 24, width: 24 * 799 / 222, tintColor: t.ink }} />
        : <Text style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontFamily: T.display, letterSpacing: -0.3 }}>{title}</Text>}
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => { Haptics.selectionAsync(); setMore(true); }} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="More — profile, settings and wins"
        style={({ pressed }) => ({
          width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          backgroundColor: pressed ? t.strokeStrong : t.nuTile ?? t.subtle, borderWidth: 1, borderColor: t.strokeStrong,
        })}>
        {who === 'nu'
          ? <NuGlow size={42}><Image source={poseImage('nu-listen')} style={{ width: 42, height: 42 }} resizeMode="contain" /></NuGlow>
          : <Image source={poseImage('ra-icon')} style={{ width: 42, height: 42 }} resizeMode="contain" />}
      </Pressable>
      <AppMenu visible={more} onClose={() => setMore(false)} />
    </View>
  );
}
