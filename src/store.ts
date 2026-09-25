import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import * as db from './db';
import { activeProjects, type ProjectSummary } from './projects';
import { nextEvent, todayEvents, type UpcomingEvent } from './calendar';
import { nuTheme, raTheme, type Theme } from './theme';
import { line as rewardLine, rankFor, type Award, type Rank } from './reward';
import { scheduleSync } from './sync';

export interface Celebration { award: Award; line: string; at: number; rankUp: Rank | null }

/** Settings → Appearance. 'nura' is the design: Nu dark, Ra light, and the
 *  switch between them changes the temperature of the screen. 'light' and
 *  'dark' put every screen in one palette, for people who find the navy
 *  hard to read, or the cream too bright at night. */
export type Appearance = 'nura' | 'light' | 'dark';

interface State {
  mode: db.Mode;
  energy: db.Energy;
  now: db.Task | null;
  /** which rule put `now` in front of you — see db.PickRule */
  nowRule: db.PickRule | null;
  crumb: { crumb: db.Crumb; task: db.Task } | null;
  inbox: db.Task[];
  /** Tasks explicitly picked for today (state 'today'/'doing') — a separate
   *  query from `inbox`, which only ever holds state:'inbox' rows. Without
   *  this, picking a task "for today" made it vanish from Home entirely: it
   *  left `inbox` but nothing else fed it back in. */
  todayPicked: db.Task[];
  /** projects under way, each with its current move (src/projects.ts) */
  projects: ProjectSummary[];
  /** tasks that are a project's current move — Nu lists them under the
   *  project, not a second time in "everything else" */
  moveIds: string[];
  wins: db.Task[];
  total: number;
  light: number;
  today: number;
  momentum: number;
  grid: { day: string; n: number }[];
  // null = not checked yet (don't render either the welcome screen or the
  // app — a brief blank frame beats flashing the wrong one)
  onboarded: boolean | null;
  // the next real calendar event, if calendar access was granted — the
  // "constraint feed" Ra reads to show how much time is actually there
  nextEvent: UpcomingEvent | null;
  /** everything on the calendar today — the home screen lays these alongside tasks */
  agenda: UpcomingEvent[];
  /** the reward currently being shown. One at a time, root-level, above modals. */
  celebration: Celebration | null;
  /** non-blocking micro-toast (captures, small events). */
  toast: { text: string; at: number } | null;
  profile: db.Profile;
  /** null = signed out. Distinct from authLoading, which is only true until
   *  the very first getSession() resolves on boot — see app/_layout.tsx. */
  session: Session | null;
  authLoading: boolean;
  appearance: Appearance;
  setAppearance: (a: Appearance) => Promise<void>;

  setEnergy: (e: db.Energy) => Promise<void>;
  setSession: (session: Session | null) => void;
  toNu: () => Promise<void>;
  toRa: () => Promise<void>;
  /** Open Ra on THIS task — you chose it, so it stays until it's done. */
  focusOn: (id: string) => Promise<void>;
  /** "Something else instead" — this one's passed over for today. */
  passOn: () => Promise<void>;
  refresh: () => Promise<void>;
  finishOnboarding: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
  celebrate: (award: Award) => void;
  dismissCelebration: () => void;
  showToast: (text: string) => void;
  dismissToast: () => void;
}

export const useStore = create<State>((set, get) => ({
  mode: 'nu', energy: 'steady', now: null, nowRule: null, crumb: null,
  inbox: [], todayPicked: [], projects: [], moveIds: [], wins: [], total: 0, light: 0, today: 0, momentum: 0, grid: [],
  onboarded: null, nextEvent: null, agenda: [], celebration: null, toast: null,
  profile: { name: '', tagline: '' },
  session: null, authLoading: true, appearance: 'nura',
  setSession: (session) => set({ session }),
  setAppearance: async (appearance) => {
    await db.setFlag('appearance', appearance);
    set({ appearance });
  },

  finishOnboarding: async () => {
    await db.completeOnboarding();
    set({ onboarded: true });
  },

  /** Dev-only — see the long-press on Nu's header and db.resetOnboarding(). */
  restartOnboarding: async () => {
    await db.resetOnboarding();
    set({ onboarded: false });
  },

  setEnergy: async (e) => {
    await db.setEnergy(e);
    const p = await db.currentPick();
    set({ energy: e, now: p?.task ?? null, nowRule: p?.rule ?? null });
  },

  // Nu -> Ra is the only way to start anything, and Ra never sees a list.
  // Every path reads db.currentPick(), which holds the one thing steady
  // instead of re-picking on every refresh.
  toRa: async () => {
    await db.setMode('ra');
    const p = await db.currentPick();
    set({ mode: 'ra', now: p?.task ?? null, nowRule: p?.rule ?? null, crumb: await db.latestCrumb() });
  },
  focusOn: async (id) => {
    await db.chooseTask(id);
    await get().toRa();
  },
  passOn: async () => {
    const { now } = get();
    if (!now) return;
    const p = await db.passOn(now.id);
    set({ now: p?.task ?? null, nowRule: p?.rule ?? null });
  },
  toNu: async () => {
    await db.setMode('nu');
    set({ mode: 'nu' });
    await get().refresh();
  },

  celebrate: (award) => {
    const { light } = get();
    const oldRank = rankFor(light);
    const newRank = rankFor(light + award.total);
    const rankUp = newRank.at > oldRank.at ? newRank : null;
    set({ celebration: { award, line: rewardLine(award.reason), at: Date.now(), rankUp } });
  },
  dismissCelebration: () => set({ celebration: null }),
  showToast: (text) => set({ toast: { text, at: Date.now() } }),
  dismissToast: () => set({ toast: null }),

  refresh: async () => {
    // projects first: reading them reconciles each step with its task (a
    // move ticked off anywhere is a step done), so the lists below agree
    const projects = await activeProjects();
    const moveIds = projects.map(p => p.current?.task_id).filter((x): x is string => !!x);
    const [mode, now, inbox, todayPicked, wins, total, light, today, momentum, grid, energy, crumb, onboarded, upcoming, agenda, profile, look] =
      await Promise.all([
        db.getMode(), db.currentPick(), db.inbox(), db.todayList(), db.wins(), db.totalWins(),
        db.totalLight(), db.todayLight(),
        db.momentum(), db.dailyCounts(), db.getEnergy(), db.latestCrumb(), db.hasOnboarded(),
        nextEvent(), todayEvents(), db.getProfile(), db.getFlag('appearance'),
      ]);
    const appearance: Appearance = look === 'light' || look === 'dark' ? look : 'nura';
    set({ appearance, mode, now: now?.task ?? null, nowRule: now?.rule ?? null, inbox, todayPicked, projects, moveIds, wins, total, light, today, momentum, grid, energy, crumb, onboarded, nextEvent: upcoming, agenda, profile });
    // Piggybacks the debounced sync onto refresh() rather than every
    // individual mutation — refresh() already runs after ~35 call sites
    // across the app, so no screen (compose, task detail, the action
    // sheets, habits) needs to know sync exists.
    if (get().session) scheduleSync();
  },
}));

/**
 * The theme follows the MODE, not the OS appearance setting.
 *
 * This is the whole design in one function. Nu is deep navy and Ra is cream, so
 * crossing between them changes the temperature of the entire screen before a
 * single word has been read — which is right, because you are switching mental
 * state, not tabs. Honouring the system dark-mode toggle here would flatten the
 * two into one skin and throw away the only structural idea the app has.
 */
/**
 * A screen that keeps one palette whatever the mode (Compose, the habit
 * screen, Connect, sign-in, the profile step) wraps itself in this, and every
 * component inside draws in that palette too. Without it a shared component
 * read the global mode: in Nu, Compose's activity chips drew Nu's near-white
 * labels on Compose's cream, and they vanished.
 */
export const PinnedMode = createContext<db.Mode | null>(null);

export function useTheme(force?: db.Mode): Theme {
  const mode = useStore(s => s.mode);
  const pinned = useContext(PinnedMode);
  const appearance = useStore(s => s.appearance);
  // chosen in Settings: one palette everywhere, over the mode and any pin
  if (appearance === 'light') return raTheme;
  if (appearance === 'dark') return nuTheme;
  return (force ?? pinned ?? mode) === 'ra' ? raTheme : nuTheme;
}
