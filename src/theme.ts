/**
 * Nura design tokens.
 *
 * The one rule this file exists to enforce: NU AND RA DO NOT LOOK THE SAME.
 *
 * Nu is the water — deep navy, cool, crowded, nothing on it is startable.
 * Ra is the light — cream, warm, bright, exactly one thing on it.
 *
 * So the palette is not "dark mode / light mode". It is *mode* mode: the theme
 * is chosen by which of the two you are in, never by the OS appearance setting.
 * Switching from Nu to Ra changes the temperature of the whole screen before
 * you have read a single word, which is the point — you are switching mental
 * state, not tabs. See useTheme() in store.ts.
 */

export interface Palette {
  /** which mode this palette belongs to */
  key: 'nu' | 'ra';
  base: string; layer: string; card: string; subtle: string;
  ink: string; ink2: string; ink3: string;
  stroke: string; strokeStrong: string;

  // NU — the water, indigo
  nu: string; nuSoft: string; nuWash: string;
  nuBtn: readonly [string, string]; onNu: string;
  // RA — the light, sunrise coral
  ra: string; raSoft: string; raDeep: string; raWash: string;
  raBtn: readonly [string, string]; onRa: string;

  brandSolid: string; onBrand: string; track: string;
  /** the two-stop wash every raised surface is filled with (Fluent's layering) */
  surface: readonly [string, string];
  /** how strongly the two ambient glows read on this ground */
  glowNu: number; glowRa: number;
  /** the diagonal three-stop background gradient */
  atmosphere: readonly [string, string, string];
  /** sequential ramp for the pixel grid, light -> saturated */
  scale: readonly string[];
  statusBar: 'light' | 'dark';
}

/**
 * NU — the water. Deep navy, indigo accent. Everything lives here and none of
 * it is startable, so the only warm thing on the screen is the way out.
 */
export const nuTheme: Palette = {
  key: 'nu',
  base: '#0B1029',
  layer: '#111838',
  card: '#161D42',
  subtle: '#1D2551',
  ink: '#F2F4FB',
  ink2: '#AEB6D4',
  ink3: '#7E87AC',
  stroke: 'rgba(170,185,255,0.12)',
  strokeStrong: 'rgba(170,185,255,0.22)',

  nu: '#8C97F6',                     // accent ON navy, so it's the light one
  nuSoft: '#B6BEFA',
  nuWash: 'rgba(91,108,240,0.16)',
  nuBtn: ['#3E45C9', '#5C67E8'],     // white text sits at ~4.6:1 on the light end
  onNu: '#FFFFFF',

  ra: '#FF8A5C',                     // sunrise coral, lifted for a dark ground
  raSoft: '#FFB183',
  raDeep: '#FFA05C',
  raWash: 'rgba(255,107,53,0.16)',
  raBtn: ['#FF6B35', '#FFA05C'],
  onRa: '#3B1204',                   // near-black brown on coral, ~8:1

  brandSolid: '#8C97F6',
  onBrand: '#FFFFFF',
  track: '#1E2652',
  // light lifted off the ground, not a lighter grey — this is what makes a
  // dark surface read as raised rather than merely different
  surface: ['rgba(255,255,255,0.085)', 'rgba(255,255,255,0.022)'],
  glowNu: 0.30, glowRa: 0.16,
  atmosphere: ['#0B1030', '#070C26', '#04091E'],
  scale: ['#161D42', '#222C68', '#2F3D93', '#4150C4', '#5B6CF0', '#95A0F8'],
  statusBar: 'light',
};

/**
 * RA — the light. Cream, sunrise coral accent. One thing, warm, bright.
 * Every ink value here is contrast-checked against `base`.
 */
export const raTheme: Palette = {
  key: 'ra',
  base: '#FAF7F0',
  layer: '#F3EEE2',
  card: '#FFFFFF',
  subtle: '#EFE9DB',
  ink: '#171313',                    // 16.4:1
  ink2: '#4A4340',                   // 8.6:1
  ink3: '#7B7360',                   // 4.5:1 — the floor, nothing dimmer than this
  stroke: 'rgba(23,19,19,0.10)',
  strokeStrong: 'rgba(23,19,19,0.18)',

  nu: '#4338CA',
  nuSoft: '#6B5FE0',
  nuWash: 'rgba(67,56,202,0.09)',
  nuBtn: ['#3E36B8', '#5B51DC'],
  onNu: '#FFFFFF',

  ra: '#FF6B35',                     // the sunrise itself — fills and strokes
  raSoft: '#FFA05C',
  raDeep: '#C2410C',                 // 5.3:1 on cream — this is the TEXT coral
  raWash: 'rgba(255,107,53,0.12)',
  raBtn: ['#FF6B35', '#FFA05C'],
  onRa: '#3B1204',

  brandSolid: '#C2410C',
  onBrand: '#FFFFFF',
  track: '#E8E1D2',
  surface: ['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.80)'],
  glowNu: 0.07, glowRa: 0.10,
  atmosphere: ['#FFFDF8', '#FAF7F0', '#F4EDDF'],
  scale: ['#F0EADC', '#FBD9C4', '#FCB995', '#FB8A54', '#F2621F', '#C2410C'],
  statusBar: 'dark',
};

export type Theme = Palette;

/** Back-compat aliases — a few screens still import these names. */
export const dark = nuTheme;
export const light = raTheme;

/** Radius scale — 4 controls, 8 large controls, 12 sheets, 20 hero surfaces. */
export const radius = { sm: 6, md: 12, lg: 18, xl: 26, pill: 999 } as const;

/**
 * Elevation. Deliberately much softer than before: the old e2/e4 on every card
 * produced a stack of little floating rectangles, which is exactly what made
 * the app read as a generic productivity template. Shadow is now reserved for
 * things that actually lift off the page — the primary action, and celebration.
 */
export const elevation = {
  e0: {},
  e2: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  e4: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  e8: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 8 },
  e16: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.20, shadowRadius: 28, elevation: 12 },
  /** the coral glow under anything that starts something */
  warm: { shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 8 },
} as const;

/** Line icons everywhere are drawn at this weight. */
export const iconStroke = 1.8;

export const type = {
  display: 'Poppins_600SemiBold',
  displayLight: 'Poppins_400Regular',
  brand: 'Poppins_500Medium',
} as const;

/**
 * The voice. Warm, plain, never a count of failures.
 *
 * Nura is a productivity app, full stop — no clinical framing anywhere in the
 * product. The mechanics that make it gentle (nudges that quieten, a partial
 * session that still counts, no number that can go down) are simply better
 * product design, and they need no diagnosis attached to justify them. They
 * also keep the App Store listing clear of the health-claims review track.
 */
export const copy = {
  // The slogan — yours, from the site. Three beats: the list, the start, the
  // follow-through. It says what the app is without a single invented tagline.
  slogan: ['Find clarity.', 'Begin gently.', 'Move forward.'] as const,
  welcomeSub: 'Your tasks and your calendar,\nin one place.',
  welcomeCta: 'Get started',
  captureTitle: 'Today',
  captureSub: 'Everything you owe today, in one place.',
  energyAsk: 'Energy',
  emptyTitle: 'Nothing left today.',
  emptyBody: 'Want to pull something forward, or call it a day?',
  contract: 'Five minutes done. Stop here — or keep the momentum.',
  stop: 'Stop here — that counts',
  nextStep: 'FOCUS',
} as const;

export const space = (n: number) => n * 4;
