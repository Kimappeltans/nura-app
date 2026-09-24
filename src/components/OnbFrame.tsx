import type React from 'react';
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { Mica, IconChevron } from '../ui';
import { radius, type as T } from '../theme';

/**
 * The frame every onboarding step sits in, laid out the way other apps have
 * taught people to expect: back and a progress bar at the top, Skip at the
 * top right where people look for it, the question, and the main button
 * pinned to the bottom of the screen, where the thumb is. The footer stays
 * above the keyboard when one is open.
 *
 * Skip used to be a small grey word under the main button, easy to miss;
 * the button used to scroll with the content and could end up mid-screen.
 */
export const ONB_STEPS = 4;

/** Segments, one per step — how far along, without a "2 OF 4" to read. */
export function StepBar({ step, total = ONB_STEPS, light }: { step: number; total?: number; light?: boolean }) {
  const t = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${total}`}
      style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          backgroundColor: i < step
            ? (light ? '#FFF3EA' : t.ra)
            : (light ? 'rgba(255,255,255,0.22)' : t.strokeStrong),
        }} />
      ))}
    </View>
  );
}

export function OnbFrame({ step, onBack, onSkip, skipLabel = 'Skip', title, sub, children, footer }: {
  step: number;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
  /** pinned to the bottom: the main button, and at most one quiet link */
  footer: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 6, height: 50 }}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back"
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ transform: [{ rotate: '180deg' }] }}><IconChevron size={24} color={t.ink2} /></View>
            </Pressable>
          ) : <View style={{ width: 40 }} />}
          <StepBar step={step} />
          {onSkip ? (
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
                backgroundColor: pressed ? t.stroke : t.subtle, borderWidth: 1, borderColor: t.strokeStrong,
              })}>
              <Text style={{ color: t.ink, fontSize: 15, fontFamily: T.brand }}>{skipLabel}</Text>
            </Pressable>
          ) : <View style={{ width: 40 }} />}
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20 }}>
          <Text style={{ color: t.ink, fontSize: 30, lineHeight: 36, fontFamily: T.display, letterSpacing: -0.8 }}>
            {title}
          </Text>
          {!!sub && <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 23, marginTop: 8 }}>{sub}</Text>}
          {children}
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12, gap: 12 }}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The one quiet link a footer may carry under its main button. */
export function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 4 }}>
      <Text style={{ color: t.ink2, fontSize: 15, textAlign: 'center', fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );
}
