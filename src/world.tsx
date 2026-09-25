import type React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PinnedMode, PinnedPalette } from './store';
import { mixedTheme, utilityTheme } from './theme';

/**
 * Every screen lives in one of four worlds. Dark is not "dark mode" and light
 * is not "light mode": dark is Nu — thinking, holding, deciding; light is Ra —
 * clarity, acting, doing. Between both worlds the grammar never changes (type
 * scale, the buttons in ui.tsx, spacing, headers, radii, icons, how a task is
 * drawn); only the light, the character and the accent do. Nu, Mixed and
 * Utility are on the navy; Ra is light.
 *
 *   nu       Home, Your Tasks, Tell Nu, the backlog pass, habits, the planner,
 *            onboarding's questions, chat                    — tab bar in rooms
 *   ra       Focus (getting ready), the timer, too big / later, a finished
 *            project — Ra's light cream; the sun arc is Ra's signature here                       — no tab bar
 *   mixed    Your Day, Wins, reflection (retro), the companions — dawn in the
 *            navy, the scenes live here                      — via Your Day
 *   utility  a task's details, the composer, the calendar, profile, settings,
 *            connected apps, sign-in — no character, no glow — secondary
 *
 * The opening and "one thing rises" are cinematic and draw their own world.
 */
export type WorldKind = 'nu' | 'ra' | 'mixed' | 'utility';

export function World({ kind, children }: { kind: WorldKind; children: React.ReactNode }) {
  const body = (
    <>
      <StatusBar style={kind === 'ra' ? 'dark' : 'light'} />
      {children}
    </>
  );
  if (kind === 'mixed') return <PinnedPalette.Provider value={mixedTheme}>{body}</PinnedPalette.Provider>;
  if (kind === 'utility') return <PinnedPalette.Provider value={utilityTheme}>{body}</PinnedPalette.Provider>;
  // nu and ra go through the mode pin, so Nu keeps whichever ground trial is on
  return <PinnedMode.Provider value={kind}><PinnedPalette.Provider value={null}>{body}</PinnedPalette.Provider></PinnedMode.Provider>;
}

/** A route in a world: `export default inWorld('utility', Settings)`. */
export function inWorld<P extends object>(kind: WorldKind, Screen: React.ComponentType<P>) {
  return function InWorld(props: P) {
    return <World kind={kind}><Screen {...props} /></World>;
  };
}
