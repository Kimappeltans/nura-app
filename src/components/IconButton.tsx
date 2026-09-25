import type React from 'react';
import { View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';

/**
 * A round tool button for a screen's top bar — calendar, search, the menu.
 * The icon inside is drawn in the full ink colour on a lifted circle, so it
 * can actually be seen; `label` is what a screen reader says.
 */
export function IconButton({ label, onPress, children, size = 46 }: {
  label: string; onPress: () => void; children: React.ReactNode; size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} hitSlop={6}
      accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', gap: 4,
        backgroundColor: pressed ? t.strokeStrong : t.subtle, borderWidth: 1, borderColor: t.strokeStrong,
      })}>
      {children}
    </Pressable>
  );
}

/** Three bars: the menu. */
export function MenuGlyph() {
  const t = useTheme();
  return (
    <>
      {[0, 1, 2].map(i => <View key={i} style={{ width: 18, height: 2.2, borderRadius: 1.1, backgroundColor: t.ink }} />)}
    </>
  );
}
