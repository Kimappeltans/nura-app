import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import * as db from './db';
import { activeProjects, type ProjectSummary } from './projects';
import { nextEvent, todayEvents, type UpcomingEvent } from './calendar';
import { raTheme, mixedTheme, utilityTheme, type Theme } from './theme';
import { TRIALS, type Trial, type SheetTrial } from './themeTrials';
import { line as rewardLine, rankFor, type Award, type Rank } from './reward';
import { scheduleSync } from './sync';

export interface Celebration { award: Award; line: string; at: number; rankUp: Rank | null }

/** Settings → Appearance (guidelines/Guidelines.md, rule 3). Nu's rooms are
 *  light or navy; Ra's screens are cream in all three.
 *    sun    light while your day runs, navy once it has ended (the default)
 *    light  rooms always light
 *    dark   rooms always navy */
export type Appearance = 'sun' | 'light' | 'dark';
export const appearanceName: Record<Appearance, string> = { sun: 'By the sun', light: 'Light', dark: 'Dark' };

/** When the day starts (Settings → Day starts), minutes after midnight: By
 *  the sun turns the rooms light from here, and the day's path rises from
 *  here. Kept outside the store too, so isDaylight() needs no store to read. */
export const DAY_START_DEFAULT = 7 * 60;
let dayStart = DAY_START_DEFAULT;
/** Is it daytime — after the day starts and before the day you set ends (which can run past midnight)? */
export function isDaylight(dayEndMin: number, at = new Date()): boolean {
  const m = at.getHours() * 60 + at.getMinutes();
  return dayEndMin > 24 * 60 ? m >= dayStart || m < dayEndMin - 24 * 60 : m >= dayStart && m < dayEndMin;
}
/** A focus session that's running — kept here, not in the timer screen, so
 *  leaving it (⌄) doesn't stop it: it shows as the pill above the tab bar. */
export interface Running {
  id: string;
  title: string;
  startedAt: number;
  /** when a timed session ends; null for an open one (it runs until you say done) */
  endAt: number | null;
  /** the length of the current run, seconds */
  span: number;
  /** set while paused */
  pausedAt: number | null;
}

/** the three rooms — see components/TabBar.tsx */
export type Tab = 'home' | 'tasks' | 'day' | 'you';

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
  /** Save part of the profile, and show it at once everywhere it appears (Home's greeting, the You tab). */
  saveProfile: (p: Partial<db.Profile>) => Promise<void>;
  /** null = signed out. Distinct from authLoading, which is only true until
   *  the very first getSession() resolves on boot — see app/_layout.tsx. */
  session: Session | null;
  authLoading: boolean;
  /** Development only: past the sign-in gate without an account (the flag `dev.skipAuth`). */
  devSkipAuth: boolean;
  /** TRIAL — which lighter ground the rooms use; see themeTrials.ts */
  trial: Trial;
  /** which room is open; the tab bar on any screen changes it */
  tab: Tab;
  /** Tell Nu is open — the tab bar's round button, on every screen that has it */
  telling: boolean;
  /** what Tell Nu opens with, if anything (then cleared) */
  tellDraft: string | null;
  /** when the day ends, in minutes after midnight (1500 = 1:00 AM) — see capacity.ts */
  dayEndMin: number;
  setDayEnd: (min: number) => Promise<void>;
  /** when the day starts, in minutes after midnight — see isDaylight() */
  dayStartMin: number;
  setDayStart: (min: number) => Promise<void>;
  /** TRIAL — how light the Tell Nu sheet is over a dark room */
  sheetTrial: SheetTrial;
  appearance: Appearance;
  setAppearance: (a: Appearance) => Promise<void>;
  running: Running | null;
  setRunning: (r: Running | null) => void;
  pauseRunning: () => void;
  resumeRunning: () => void;
  /** By the sun: is the day still running? Kept current by a minute tick in app/_layout.tsx */
  daylight: boolean;
  tickDaylight: () => void;

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
  profile: { name: '', tagline: '', pronouns: '', avatar: '' },
  saveProfile: async (p) => {
    await db.setProfile(p);
    set({ profile: { ...get().profile, ...p } });
  },
  session: null, authLoading: true, devSkipAuth: false, trial: 'night', tab: 'home', telling: false, tellDraft: null, dayEndMin: 21 * 60, dayStartMin: DAY_START_DEFAULT, sheetTrial: 'dark', appearance: 'sun', daylight: isDaylight(21 * 60),
  setAppearance: async (appearance) => {
    await db.setFlag('appearance', appearance);
    set({ appearance });
  },
  running: null,
  setRunning: (running) => set({ running }),
  pauseRunning: () => {
    const r = get().running;
    if (r && !r.pausedAt) set({ running: { ...r, pausedAt: Date.now() } });
  },
  // a pause moves the whole session later, so time paused counts for nothing
  resumeRunning: () => {
    const r = get().running;
    if (!r?.pausedAt) return;
    const d = Date.now() - r.pausedAt;
    set({ running: { ...r, startedAt: r.startedAt + d, endAt: r.endAt ? r.endAt + d : null, pausedAt: null } });
  },
  tickDaylight: () => {
    const daylight = isDaylight(get().dayEndMin);
    if (daylight !== get().daylight) set({ daylight });
  },
  setSession: (session) => set({ session }),

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

  setDayEnd: async (min) => {
    await db.setFlag('day.end', String(min));
    set({ dayEndMin: min, daylight: isDaylight(min) });
  },
  setDayStart: async (min) => {
    await db.setFlag('day.start', String(min));
    dayStart = min;
    set({ dayStartMin: min, daylight: isDaylight(get().dayEndMin) });
  },

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
    const end = Number(await db.getFlag('day.end'));
    const dayEndMin = Number.isFinite(end) && end > 0 ? end : 21 * 60;
    const start = Number(await db.getFlag('day.start'));
    dayStart = Number.isFinite(start) && start > 0 ? start : DAY_START_DEFAULT;
    // 'nura' was Dark's name before By the sun
    const appearance: Appearance = look === 'light' || look === 'sun' ? look : look === 'dark' || look === 'nura' ? 'dark' : 'sun';
    set({ dayEndMin, dayStartMin: dayStart, appearance, daylight: isDaylight(dayEndMin), mode, now: now?.task ?? null, nowRule: now?.rule ?? null, inbox, todayPicked, projects, moveIds, wins, total, light, today, momentum, grid, energy, crumb, onboarded, nextEvent: upcoming, agenda, profile });
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
/** A whole palette for one part of a screen — a light sheet over a dark room. Wins over everything. */
export const PinnedPalette = createContext<Theme | null>(null);

export function useTheme(force?: db.Mode): Theme {
  const mode = useStore(s => s.mode);
  const pinned = useContext(PinnedMode);
  const trial = useStore(s => s.trial);
  const palette = useContext(PinnedPalette);
  const lit = useRoomsLight();
  const world = palette === mixedTheme || palette === utilityTheme;
  // a palette pinned for its own reasons (a sheet trial) always wins
  if (palette && !world) return palette;
  // Ra's screens are cream in every appearance
  if (!palette && (force ?? pinned ?? mode) === 'ra') return raTheme;
  // a room by daylight (By the sun) or always (Light)
  if (lit) return raTheme;
  // a room after dark: Nu's navy (Mixed and Utility are navies too)
  return palette ?? TRIALS[trial];
}

/** Are Nu's rooms light right now? (Appearance: Light, or By the sun while the day runs.) */
export function useRoomsLight(): boolean {
  const appearance = useStore(s => s.appearance);
  const daylight = useStore(s => s.daylight);
  return appearance === 'light' || (appearance === 'sun' && daylight);
}
