import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';

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
  return (
    <Pressable onPress={() => step(1)} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ text: `${format(value)}${u ? ` ${u}` : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => step(e.nativeEvent.actionName === 'decrement' ? -1 : 1)}
      style={({ pressed }) => ({
        flex: 1, height: 150, borderRadius: 26, padding: 16,
        backgroundColor: pressed ? t.subtle : t.layer,
      })}>
      <View style={{ position: 'absolute', right: 16, top: 16, width: R * 2, height: R * 2, borderRadius: R, backgroundColor: INK_NU }}>
        <View style={{
          position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: CORAL,
          left: R + r * Math.cos(a) - 4.5, top: R + r * Math.sin(a) - 4.5,
        }} />
      </View>
      <View style={{ position: 'absolute', left: 16, bottom: 14 }}>
        <Text style={{ color: t.ink, fontSize: 28, letterSpacing: -1.4, fontFamily: T.displayLight }}>
          {format(value)}
          {!!u && <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 0, fontFamily: T.brand }}> {u}</Text>}
        </Text>
        <Text style={{ color: t.ink2, fontSize: 12.5, fontFamily: T.brand, marginTop: 2 }}>{label}</Text>
      </View>
    </Pressable>
  );
}
