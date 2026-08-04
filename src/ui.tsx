import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, type as T } from './theme';
import { useTheme } from './store';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[{
      backgroundColor: t.card, borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.stroke, padding: 18,
    }, style]}>{children}</View>
  );
}

export function Primary(
  { label, onPress, tone = 'nu' }: { label: string; onPress: () => void; tone?: 'nu' | 'ra' },
) {
  const t = useTheme();
  const colors: [string, string] = tone === 'ra' ? [t.ra, t.raSoft] : [t.nu, t.nuSoft];
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, borderRadius: radius.md, overflow: 'hidden' })}>
      <LinearGradient
        colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ color: tone === 'ra' ? '#1A1206' : '#FFFFFF', fontSize: 16, fontWeight: '600' }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function Ghost({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.strokeStrong,
      backgroundColor: pressed ? t.subtle : t.card,
    })}>
      <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.ink, fontSize: 28, lineHeight: 34, fontFamily: T.display }}>{children}</Text>;
}

export function Body({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: dim ? t.ink3 : t.ink2, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}
