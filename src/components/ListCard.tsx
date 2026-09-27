import type React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../store';
import { type as T } from '../theme';

/** A small caps label with, optionally, something on the right: TODAY · 2 ……… See all */
export function SectionHead({ label, action, onAction, note, style }: {
  label: string;
  action?: string;
  onAction?: () => void;
  /** a quiet hint on the right instead of an action */
  note?: string;
  style?: object;
}) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8, minHeight: 24 }, style]}>
      <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>{label.toUpperCase()}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={{ color: t.nu, fontSize: 13, fontFamily: T.brand }}>{action}</Text>
        </Pressable>
      ) : note ? (
        <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1.2, fontFamily: T.brand, opacity: 0.8 }}>{note.toUpperCase()}</Text>
      ) : null}
    </View>
  );
}

/** Rows in a quiet bordered card — the lists in the three rooms. */
export function ListCard({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 17, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.layer, paddingHorizontal: 14 }}>
      {children}
    </View>
  );
}
