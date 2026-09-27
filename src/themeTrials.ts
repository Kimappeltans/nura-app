/**
 * TRIAL — lighter grounds for the three rooms, to choose between.
 * Nu is deep blue glass and the rooms were near-black navy, so Nu all but
 * disappeared. Here the navy is a dark veil over a lighter water blue, and
 * the trial is how opaque that veil is; panels (the lists, the tile Nu sits
 * on) are see-through light laid over it, so they're always a step lighter
 * than the ground. Dev only: __nuraBg('veil65') from the console.
 * Once one is chosen it goes into theme.ts and this file goes.
 * The state before the trial is tagged `before-background-trials`.
 */
import { nuTheme, raTheme, type Palette } from './theme';

export type SheetTrial = 'dark' | 'mist' | 'pale' | 'white';
export type Trial = 'night' | 'panels' | 'veil80' | 'veil65' | 'veil50' | 'surface' | 'pale';

/** the water under the veil, and the veil itself */
const WATER = [52, 66, 143];
const NAVY = [11, 16, 41];
const hex = (c: number[]) => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
/** the navy veil at `o` opacity over the water */
const veil = (o: number, deeper = 0) =>
  hex(NAVY.map((n, i) => Math.max(0, n * o + WATER[i] * (1 - o) - deeper)));

/** a Nu room at veil opacity `o` (top of the screen) to `bottom` (foot) */
function room(o: number, bottom = o): Palette {
  const lift = 1 - o;            // how far the ground has lightened
  return {
    ...nuTheme,
    base: veil(bottom),
    layer: `rgba(255,255,255,${(0.05 + lift * 0.10).toFixed(3)})`,
    card: `rgba(255,255,255,${(0.07 + lift * 0.12).toFixed(3)})`,
    subtle: `rgba(255,255,255,${(0.09 + lift * 0.12).toFixed(3)})`,
    stroke: `rgba(190,205,255,${(0.13 + lift * 0.08).toFixed(3)})`,
    strokeStrong: `rgba(190,205,255,${(0.24 + lift * 0.10).toFixed(3)})`,
    ink3: lift > 0.3 ? '#9AA3C8' : '#8C95BA',
    track: veil(Math.min(1, o + 0.1), -12),
    atmosphere: [veil(o), veil((o + bottom) / 2), veil(bottom, 4)],
    atmosphereVertical: o !== bottom,
    nuTile: `rgba(200,212,255,${(0.16 + lift * 0.20).toFixed(3)})`,
    sheet: [veil(Math.max(0, o - 0.12)), veil(Math.min(1, o + 0.05))],
  };
}

export const TRIAL_NAMES: Record<Trial, string> = {
  night: 'Now',
  panels: 'Lighter panels',
  veil80: 'Veil 80%',
  veil65: 'Veil 65%',
  veil50: 'Veil 50%',
  surface: 'Surface light',
  pale: 'Pale water',
};

export const TRIALS: Record<Trial, Palette> = {
  night: nuTheme,
  // the ground stays as it is; what sits on it is lifted
  panels: {
    ...nuTheme,
    layer: '#232D63',
    card: '#28336D',
    subtle: '#2E3A78',
    stroke: 'rgba(170,185,255,0.18)',
    strokeStrong: 'rgba(170,185,255,0.30)',
    nuTile: '#2E3A7C',
  },
  veil80: room(0.8),
  veil65: room(0.65),
  veil50: room(0.5),
  // lighter at the top where Nu and the capture row sit, deeper toward the lists
  surface: room(0.45, 0.85),

  // the rooms go pale, cool and misty; Focus stays warm cream
  pale: {
    ...raTheme,
    base: '#ECEFF8',
    layer: '#F6F7FC',
    card: '#FFFFFF',
    subtle: '#E1E6F4',
    ink: '#141833',
    ink2: '#434A6B',
    ink3: '#5F6689',
    stroke: 'rgba(20,24,51,0.10)',
    strokeStrong: 'rgba(20,24,51,0.18)',
    track: '#DCE2F1',
    surface: ['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)'],
    atmosphere: ['#F4F6FC', '#ECEFF8', '#E2E7F5'],
    glowNu: 0.12, glowRa: 0.08,
    heroWash: ['rgba(255,150,100,0.14)', 'rgba(67,56,202,0.07)', 'rgba(67,56,202,0.04)'],
    nuTile: '#DDE4F6',
  },
};

/**
 * The Tell Nu sheet, over a dark room: Nu's own space, light, so blue Nu reads.
 * `dark` keeps the room's palette (the sheet as it was).
 */
const sheetOn = (sheet: readonly [string, string], layer: string, base: string): Palette => ({
  ...TRIALS.pale, base, layer, card: '#FFFFFF', sheet,
  strokeStrong: 'rgba(20,24,51,0.20)',
});
export const SHEETS: Record<SheetTrial, Palette | null> = {
  dark: null,
  mist: sheetOn(['#E3E9FA', '#D3DBF3'], '#F1F4FD', '#D9E0F5'),
  pale: sheetOn(['#F6F8FE', '#E7ECF8'], '#FFFFFF', '#EEF1F9'),
  white: sheetOn(['#FFFFFF', '#F7F8FC'], '#F2F4FA', '#FFFFFF'),
};
