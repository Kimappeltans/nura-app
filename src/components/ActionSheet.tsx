import { Modal, View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, elevation, type as T } from '../theme';
import { useTheme } from '../store';

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
  { visible, title, subtitle, actions, dismissLabel = 'Keep it', onDismiss }: {
    visible: boolean;
    title: string;
    subtitle?: string;
    actions: SheetAction[];
    dismissLabel?: string;
    onDismiss: () => void;
  },
) {
  const t = useTheme();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={{ flex: 1, backgroundColor: 'rgba(5,8,26,0.55)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={[{
          backgroundColor: t.layer, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
          borderWidth: 1, borderColor: t.strokeStrong, borderBottomWidth: 0,
          paddingTop: 18, paddingBottom: 34, paddingHorizontal: 18,
        }, elevation.e16]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.strokeStrong, alignSelf: 'center', marginBottom: 16 }} />

          <Text style={{ color: t.ink, fontSize: 19, fontFamily: T.display, letterSpacing: -0.4 }}>{title}</Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 14, marginTop: 3 }}>{subtitle}</Text>
          )}

          <View style={{ marginTop: 14, gap: 6 }}>
            {actions.map(a => (
              <Pressable key={a.key}
                onPress={() => { Haptics.selectionAsync(); onDismiss(); a.onPress(); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 13,
                  paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.lg,
                  backgroundColor: pressed ? t.subtle : 'transparent',
                })}>
                <View style={{
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
          </View>

          <Pressable onPress={onDismiss} hitSlop={10} style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: t.ink3, fontSize: 14.5, fontFamily: T.brand }}>{dismissLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
