import type React from 'react';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { AppMenu } from './AppMenu';

/**
 * The top of each of the three rooms: whatever the room puts on the left
 * (Home's calendar button) or its name, and your avatar on the right — which
 * opens More, where everything secondary lives.
 */
export function RoomBar({ title, left }: { title?: string; left?: React.ReactNode }) {
  const t = useTheme();
  const name = useStore(s => s.profile.name);
  const [more, setMore] = useState(false);
  const initial = (name || '').trim().charAt(0).toUpperCase();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8, minHeight: 56 }}>
      {left}
      {!!title && <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.display }}>{title}</Text>}
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => { Haptics.selectionAsync(); setMore(true); }} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="More — profile and settings"
        style={({ pressed }) => ({
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: pressed ? t.strokeStrong : t.nuWash, borderWidth: 1, borderColor: t.strokeStrong,
        })}>
        {initial
          ? <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.display }}>{initial}</Text>
          : <PersonGlyph color={t.ink} />}
      </Pressable>
      <AppMenu visible={more} onClose={() => setMore(false)} />
    </View>
  );
}

function PersonGlyph({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.7, borderColor: color }} />
      <View style={{ width: 16, height: 7, marginTop: 2, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1.7, borderBottomWidth: 0, borderColor: color }} />
    </View>
  );
}
