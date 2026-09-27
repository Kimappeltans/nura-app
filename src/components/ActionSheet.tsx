import type React from 'react';
import { Modal, View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, elevation, type as T } from '../theme';
import { useTheme } from '../store';
import { COLUMN, DIALOG, useDesk } from '../screen';
import { decorative } from '../a11y';

export interface SheetAction {
  key: string;
  label: string;
  sub?: string;
  glyph: string;
  /** destructive actions get the same treatment as "Let it go" — quieter, not alarming red */
  tone?: 'default' | 'quiet';
  onPress: () => void;
}

/**
 * The one bottom sheet in the app.
 *
 * Every screen that used to grow its own ad hoc "what do you want to do with
 * this" menu shares this instead — same scrim, same slide, same row shape.
 * Deliberately not a generic "menu" component: it always has a title, always
 * a plain-language subtitle under each action (what actually happens, not
 * just the verb), and always one unstyled way out ("Keep it") that isn't
 * itself styled as an action, so dismissing never reads as a sixth choice.
 */
export function ActionSheet(
  { visible, title, subtitle, actions, dismissLabel = 'Keep it', onDismiss, children }: {
    visible: boolean;
    title: string;
    subtitle?: string;
    /** extra controls above the actions, e.g. a priority picker */
    children?: React.ReactNode;
    actions: SheetAction[];
    dismissLabel?: string;
    onDismiss: () => void;
  },
) {
  const t = useTheme();
  // never taller than the screen: the actions scroll, the title and the way
  // out stay put (the menu has nine places — it used to run off the top)
  const { height } = useWindowDimensions();
  // a wide web window: a centred dialog rather than a sheet from the bottom
  const desk = useDesk();
  return (
    <Modal transparent visible={visible} animationType={desk ? 'fade' : 'slide'} onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: desk ? 'center' : 'flex-end', padding: desk ? 32 : 0 }}>
        {/* the scrim sits behind the sheet, not around it: a sheet inside a
            button would hide its actions from a screen reader */}
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close"
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(5,8,26,0.55)' }} />
        <View accessibilityViewIsModal onAccessibilityEscape={onDismiss} style={[{
          backgroundColor: t.layer, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
          borderWidth: 1, borderColor: t.strokeStrong, borderBottomWidth: 0,
          paddingTop: 18, paddingBottom: 34, paddingHorizontal: 18, maxHeight: height * 0.88,
          width: '100%', maxWidth: COLUMN, alignSelf: 'center',   // a phone's width on a wide screen
        }, desk && {
          borderRadius: radius.xl, borderBottomWidth: 1, maxWidth: DIALOG, maxHeight: height - 64,
          paddingTop: 24, paddingBottom: 16, paddingHorizontal: 24,
        }]}>
          {!desk && <View {...decorative} style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.strokeStrong, alignSelf: 'center', marginBottom: 16 }} />}

          <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 19, fontFamily: T.display, letterSpacing: -0.4 }}>{title}</Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 14, marginTop: 3 }}>{subtitle}</Text>
          )}

          {children}

          <ScrollView style={{ marginTop: 14, flexShrink: 1 }} contentContainerStyle={{ gap: 6 }}
            showsVerticalScrollIndicator bounces={false}>
            {actions.map(a => (
              <Pressable key={a.key}
                onPress={() => { Haptics.selectionAsync(); onDismiss(); a.onPress(); }}
                accessibilityRole="button" accessibilityLabel={a.sub ? `${a.label}, ${a.sub}` : a.label}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 13,
                  paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.lg,
                  backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                <View {...decorative} style={{
                  width: 34, height: 34, borderRadius: radius.md,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: t.nuWash,
                }}>
                  <Text style={{ color: t.nu, fontSize: 15 }}>{a.glyph}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{a.label}</Text>
                  {!!a.sub && <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 1 }}>{a.sub}</Text>}
                </View>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: t.ink3, fontSize: 14.5, fontFamily: T.brand }}>{dismissLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
