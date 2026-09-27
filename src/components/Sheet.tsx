import type React from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import Svg, { Path } from 'react-native-svg';
import { COLUMN, DIALOG, useDesk } from '../screen';
import { decorative } from '../a11y';

/**
 * The bottom sheet the redesign is built from: a dimmed room behind, a grab
 * bar, the sheet's own gradient. `tall` makes it nearly full height (More),
 * otherwise it's as tall as what's in it (a task, Tell Nu, the day's end).
 * On a wide web window it's a centred dialog instead.
 */
export function Sheet({ visible, onClose, tall, onShow, children }: {
  visible: boolean;
  onClose: () => void;
  tall?: boolean;
  onShow?: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const desk = useDesk();
  // one flat fill (rule 1): a navy card on the navy, the cream ground in the light
  const fill = t.key === 'nu' ? t.layer : t.base;
  const scrim = t.key === 'nu' ? 'rgba(5,8,23,0.62)' : 'rgba(23,19,19,0.30)';
  if (desk) {
    // a wide web window: a centred dialog, closed with × (top left) or by clicking outside
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} onShow={onShow}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ position: 'absolute', inset: 0, backgroundColor: scrim }} />
          <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{
            width: '100%', maxWidth: DIALOG, height: tall ? Math.min(760, height - 64) : undefined, maxHeight: height - 64,
            borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: fill,
          }}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"
              style={({ pressed }) => ({
                width: 36, height: 36, borderRadius: 18, marginTop: 14, marginLeft: 14, marginBottom: 4,
                alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.stroke : t.subtle,
              })}>
              <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={t.ink2} strokeWidth={2} strokeLinecap="round" /></Svg>
            </Pressable>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 24 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1, backgroundColor: scrim }} />
        {/* no × on a phone: VoiceOver's escape (two-finger Z) closes it, and so does the scrim */}
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{
          height: tall ? height - Math.max(insets.top, 20) - 18 : undefined, maxHeight: height * 0.94,
          width: '100%', maxWidth: COLUMN, alignSelf: 'center',   // a phone's width on a wide screen (src/screen.ts)
          borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden',
          borderWidth: 1, borderBottomWidth: 0, borderColor: t.strokeStrong,
        }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: fill }} />
          <View {...decorative} style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.strokeStrong, alignSelf: 'center', marginTop: 10, marginBottom: 14 }} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 18) + 6 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
