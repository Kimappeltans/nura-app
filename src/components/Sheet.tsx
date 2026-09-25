import type React from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
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
  // one flat fill (rule 1): a navy card on the navy, the cream ground in the light
  const fill = t.key === 'nu' ? t.layer : t.base;
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: t.key === 'nu' ? 'rgba(5,8,23,0.62)' : 'rgba(23,19,19,0.30)' }} />
        <View style={{
          height: tall ? height - Math.max(insets.top, 20) - 18 : undefined, maxHeight: height * 0.94,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden',
          borderWidth: 1, borderBottomWidth: 0, borderColor: t.strokeStrong,
        }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: fill }} />
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
