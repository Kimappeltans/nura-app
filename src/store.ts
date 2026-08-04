import { create } from 'zustand';
import { useColorScheme } from 'react-native';
import * as db from './db';
import { dark, light, type Theme } from './theme';

interface State {
  mode: db.Mode;
  energy: db.Energy;
  now: db.Task | null;
  crumb: { crumb: db.Crumb; task: db.Task } | null;
  inbox: db.Task[];
  wins: db.Task[];
  total: number;
  momentum: number;
  grid: { day: string; n: number }[];
  setEnergy: (e: db.Energy) => Promise<void>;
  toNu: () => Promise<void>;
  toRa: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  mode: 'nu', energy: 'steady', now: null, crumb: null,
  inbox: [], wins: [], total: 0, momentum: 0, grid: [],

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

  refresh: async () => {
    const [mode, now, inbox, wins, total, momentum, grid, energy, crumb] = await Promise.all([
      db.getMode(), db.pickNow(), db.inbox(), db.wins(), db.totalWins(),
      db.momentum(), db.dailyCounts(), db.getEnergy(), db.latestCrumb(),
    ]);
    set({ mode, now, inbox, wins, total, momentum, grid, energy, crumb });
  },
}));

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? (light as unknown as Theme) : dark;
}
