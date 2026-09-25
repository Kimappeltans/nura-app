import type React from 'react';
import { View } from 'react-native';

/** How big Nu is in each place — small enough to sit inside what he's on, as the design has him. */
export const NU_SIZE = { bar: 46, card: 56, sheet: 60, glance: 84 } as const;

/**
 * Was a pool of pale light behind Nu. Flat now (guidelines/Guidelines.md,
 * rule 1: no glow on a character) — it only keeps Nu's box the same size, so
 * the places that wrap Nu in it needn't change.
 */
export function NuGlow({ size, children }: { size: number; children: React.ReactNode }) {
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}
