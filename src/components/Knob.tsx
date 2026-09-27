import { View, Text, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { decorative } from '../a11y';

const INK_NU = '#1B1830';
const CORAL = '#FF6B35';

/**
 * A KNOB (guidelines/components/overview.md): a dark dial with a coral dot,
 * the value large at the bottom left, its name under it. Tap to turn it to the
 * next setting; screen readers get increment / decrement.
 */
export function Knob<V>({ label, options, value, onChange, format, unit }: {
  label: string;
  options: readonly V[];
  value: V;
  onChange: (v: V) => void;
  format: (v: V) => string;
  unit?: (v: V) => string | undefined;
}) {
  const t = useTheme();
  const i = Math.max(0, options.indexOf(value));
  const step = (d: number) => {
    const next = options[(i + d + options.length) % options.length];
    Haptics.selectionAsync();
    onChange(next);
  };
  // the dot sweeps from the lower left (first) over the top to the lower right (last)
  const a = (-225 + (i / Math.max(1, options.length - 1)) * 270) * Math.PI / 180;
  const R = 42, r = 30;
  const u = unit?.(value);
  // react-native-web ignores accessibility actions: on the web the arrow keys turn it
  const keys = Platform.OS === 'web' ? {
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); step(d); }
    },
  } : {};
  return (
    <Pressable onPress={() => step(1)} accessibilityRole="adjustable" accessibilityLabel={label}
      aria-valuetext={`${format(value)}${u ? ` ${u}` : ''}`}
      {...keys}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => step(e.nativeEvent.actionName === 'decrement' ? -1 : 1)}
      style={({ pressed }) => ({
        // grows with large text; the value stays anchored bottom left
        flex: 1, minHeight: 150, borderRadius: 26, padding: 16, paddingBottom: 14,
        justifyContent: 'flex-end',
        backgroundColor: pressed ? t.subtle : t.layer,
      })}>
      <View {...decorative} style={{ position: 'absolute', right: 16, top: 16, width: R * 2, height: R * 2, borderRadius: R, backgroundColor: INK_NU }}>
        <View style={{
          position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: CORAL,
          left: R + r * Math.cos(a) - 4.5, top: R + r * Math.sin(a) - 4.5,
        }} />
      </View>
      <View style={{ marginTop: 69 }}>
        <Text style={{ color: t.ink, fontSize: 28, letterSpacing: -1.4, fontFamily: T.displayLight }}>
          {format(value)}
          {!!u && <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 0, fontFamily: T.brand }}> {u}</Text>}
        </Text>
        <Text style={{ color: t.ink2, fontSize: 12.5, fontFamily: T.brand, marginTop: 2 }}>{label}</Text>
      </View>
    </Pressable>
  );
}
