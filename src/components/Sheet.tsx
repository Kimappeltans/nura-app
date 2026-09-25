import type React from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';

/**
 * The bottom sheet the redesign is built from: a dimmed room behind, a grab
 * bar, the sheet's own gradient. `tall` makes it nearly full height (More),
 * otherwise it's as tall as what's in it (a task, Tell Nu, the day's end).
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
  const fill = t.sheet ?? (t.key === 'nu' ? ['#1E2750', '#121833'] as const : [t.card, t.base] as const);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(5,8,23,0.72)' }} />
        <View style={{
          height: tall ? height - Math.max(insets.top, 20) - 18 : undefined, maxHeight: height * 0.94,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden',
          borderWidth: 1, borderBottomWidth: 0, borderColor: t.strokeStrong,
        }}>
          <LinearGradient colors={fill} style={{ position: 'absolute', inset: 0 }} />
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.strokeStrong, alignSelf: 'center', marginTop: 10, marginBottom: 14 }} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 18) + 6 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
