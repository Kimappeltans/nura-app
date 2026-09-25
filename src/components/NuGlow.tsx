import type React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../store';

/** Nu is the same size wherever he appears in the three rooms and the Tell Nu sheet. */
export const NU_SIZE = 104;

/**
 * A pool of pale light behind Nu. Nu is blue glass, and on the navy of the
 * three rooms a blue figure on a blue ground all but disappears — the glow
 * lifts it off the water, the way Ra's warm glow does on the next-step card.
 */
export function NuGlow({ size, children }: { size: number; children: React.ReactNode }) {
  const t = useTheme();
  const g = size * 1.5;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={g} height={g} style={{ position: 'absolute', left: (size - g) / 2, top: (size - g) / 2 }}>
        <Defs>
          <RadialGradient id="nuglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={t.key === 'nu' ? '#B6C4FF' : '#8C97F6'} stopOpacity={t.key === 'nu' ? 0.75 : 0.35} />
            <Stop offset="0.55" stopColor="#8C97F6" stopOpacity={t.key === 'nu' ? 0.28 : 0.12} />
            <Stop offset="1" stopColor="#8C97F6" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={g / 2} cy={g / 2} r={g / 2} fill="url(#nuglow)" />
      </Svg>
      {children}
    </View>
  );
}
