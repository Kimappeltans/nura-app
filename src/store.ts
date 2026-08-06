import { create } from 'zustand';
import * as db from './db';
import { nextEvent, todayEvents, type UpcomingEvent } from './calendar';
import { nuTheme, raTheme, type Theme } from './theme';
import { line as rewardLine, rankFor, type Award, type Rank } from './reward';

export interface Celebration { award: Award; line: string; at: number; rankUp: Rank | null }

interface State {
  mode: db.Mode;
  energy: db.Energy;
  now: db.Task | null;
  crumb: { crumb: db.Crumb; task: db.Task } | null;
  inbox: db.Task[];
  /** Tasks explicitly picked for today (state 'today'/'doing') — a separate
   *  query from `inbox`, which only ever holds state:'inbox' rows. Without
   *  this, picking a task "for today" made it vanish from Home entirely: it
   *  left `inbox` but nothing else fed it back in. */
  todayPicked: db.Task[];
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

  setEnergy: (e: db.Energy) => Promise<void>;
  toNu: () => Promise<void>;
  toRa: () => Promise<void>;
  refresh: () => Promise<void>;
  finishOnboarding: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
  celebrate: (award: Award) => void;
  dismissCelebration: () => void;
  showToast: (text: string) => void;
  dismissToast: () => void;
}

export const useStore = create<State>((set, get) => ({
  mode: 'nu', energy: 'steady', now: null, crumb: null,
  inbox: [], todayPicked: [], wins: [], total: 0, light: 0, today: 0, momentum: 0, grid: [],
  onboarded: null, nextEvent: null, agenda: [], celebration: null, toast: null,
  profile: { name: '', tagline: '' },

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
    set({ energy: e, now: await db.pickNow() });
  },

  // Nu -> Ra is the only way to start anything, and Ra never sees a list.
  toRa: async () => {
    await db.setMode('ra');
    set({ mode: 'ra', now: await db.pickNow(), crumb: await db.latestCrumb() });
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
    const [mode, now, inbox, todayPicked, wins, total, light, today, momentum, grid, energy, crumb, onboarded, upcoming, agenda, profile] =
      await Promise.all([
        db.getMode(), db.pickNow(), db.inbox(), db.todayList(), db.wins(), db.totalWins(),
        db.totalLight(), db.todayLight(),
        db.momentum(), db.dailyCounts(), db.getEnergy(), db.latestCrumb(), db.hasOnboarded(),
        nextEvent(), todayEvents(), db.getProfile(),
      ]);
    set({ mode, now, inbox, todayPicked, wins, total, light, today, momentum, grid, energy, crumb, onboarded, nextEvent: upcoming, agenda, profile });
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
export function useTheme(force?: db.Mode): Theme {
  const mode = useStore(s => s.mode);
  return (force ?? mode) === 'ra' ? raTheme : nuTheme;
}
