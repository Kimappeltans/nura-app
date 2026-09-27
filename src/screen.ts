import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/**
 * Nura is a phone app. On a wide web window (a laptop, a desktop) it sits in
 * a phone-width column in the middle (app/_layout.tsx) instead of stretching
 * the day's path and the front card across the whole screen. These report
 * the column's size, not the window's, so anything laid out from the width
 * (the opening, the timer, Tell Nu) lands where it would on a phone.
 */
export const COLUMN = 460;
/** wider than this, and the app is a column */
export const WIDE = 600;

export const isWide = (width: number) => Platform.OS === 'web' && width > WIDE;

/** useWindowDimensions, with the width of the column on a wide web window. */
export function useScreen() {
  const d = useWindowDimensions();
  return isWide(d.width) ? { ...d, width: COLUMN } : d;
}

/** The same, outside a component (Dimensions.get('window')). */
export function screenSize() {
  const d = Dimensions.get('window');
  return isWide(d.width) ? { ...d, width: COLUMN } : d;
}
