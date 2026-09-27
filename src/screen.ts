import { createContext, useContext } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/**
 * Nura is a phone app first. On the web it has three sizes:
 *
 *   - a phone, or a window up to WIDE: the app as it is on a phone;
 *   - a window between WIDE and DESK (a small tablet, a half-width window):
 *     a phone-width column in the middle (app/_layout.tsx);
 *   - a laptop or a desktop, wider than DESK: the tab bar becomes a sidebar
 *     and the rooms use the width (src/components/Desk.tsx). Focus, a
 *     session, Done and the opening stay one thing, centred.
 *
 * useScreen() and screenSize() report the width something should be laid out
 * in, not the window's: the column's, a room's, or the centred stage of a
 * one-thing screen. Phones and the iOS app always get the window.
 */
export const COLUMN = 460;
/** wider than this, and the app is a column */
export const WIDE = 600;
/** wider than this, and the app is the desktop layout */
export const DESK = 900;
/** the desktop's sidebar */
export const SIDEBAR = 256;
/** a room's content, at most (Home, Your Tasks, Calendar) */
export const ROOM_MAX = 1100;
/** a pushed screen's content, at most (You, Settings, a task…) */
export const READ_MAX = 640;
/** a one-thing screen's content, at most (Focus, a session, Done, onboarding) */
export const STAGE = 560;
/** a sheet, as a centred dialog */
export const DIALOG = 560;

export const isWide = (width: number) => Platform.OS === 'web' && width > WIDE;
export const isDesk = (width: number) => Platform.OS === 'web' && width > DESK;

/**
 * The width a part of the desktop layout gives what's inside it: a room gives
 * its own width, a readable column its column. Unset, a one-thing screen
 * gets STAGE.
 */
export const ScreenWidth = createContext<number | null>(null);

/** Mica is drawn by the page around a readable column, not inside it (src/components/Desk.tsx). */
export const MicaHosted = createContext(false);

/** Is this the desktop layout (a wide web window)? */
export function useDesk() {
  return isDesk(useWindowDimensions().width);
}

/** useWindowDimensions, with the width of the column, room or stage on a wide web window. */
export function useScreen() {
  const d = useWindowDimensions();
  const given = useContext(ScreenWidth);
  if (!isWide(d.width)) return d;
  if (!isDesk(d.width)) return { ...d, width: COLUMN };
  return { ...d, width: given ?? Math.min(d.width, STAGE) };
}

/** The same, outside a component (Dimensions.get('window')): a column or the stage. */
export function screenSize() {
  const d = Dimensions.get('window');
  if (!isWide(d.width)) return d;
  return { ...d, width: isDesk(d.width) ? STAGE : COLUMN };
}
