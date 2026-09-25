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
  /** a two-tone headline's second line (guidelines/styles.md) */
  mute?: string;
  stroke: string; strokeStrong: string;

  // NU — links, rings and marks: ink, never indigo (guidelines/tokens.md)
  nu: string; nuSoft: string; nuWash: string;
  nuBtn: readonly [string, string]; onNu: string;
  // RA — the light, sunrise coral
  ra: string; raSoft: string; raDeep: string; raWash: string;
  raBtn: readonly [string, string]; onRa: string;

  brandSolid: string; onBrand: string; track: string;
  /** a picked chip (a filter, a day, a time): its fill and edge, when not the washes */
  pick?: string; pickEdge?: string;
  /** the two-stop wash every raised surface is filled with (Fluent's layering) */
  surface: readonly [string, string];
  /** how strongly the two ambient glows read on this ground */
  glowNu: number; glowRa: number;
  /** the diagonal three-stop background gradient */
  atmosphere: readonly [string, string, string];
  /** run the atmosphere top-to-bottom instead of diagonally (light from the surface) */
  atmosphereVertical?: boolean;
  /** the tile Nu sits on (the Tell Nu button) — lighter than the panels, so blue Nu reads */
  nuTile?: string;
  /** a bottom sheet's fill, top to bottom */
  sheet?: readonly [string, string];
  /** sequential ramp for the pixel grid, light -> saturated */
  scale: readonly string[];
  /**
   * The "one thing" wash — a diagonal warm-into-indigo 3-stop gradient for
   * whatever single card on the screen is meant to feel lifted and lit
   * (Nu's hero task card, a rank-up card). Warm at the top, cooling to indigo.
   */
  heroWash: readonly [string, string, string];
  /** the calmer, indigo-only cousin of heroWash — for a card that should read
   * "active" but not "the one warm thing" (a triage item mid-review, a ritual
   * card).
   */
  emphasisWash: readonly [string, string];
  statusBar: 'light' | 'dark';
}

/**
 * NU — the water. Deep navy by night; its accent is the ink itself (no indigo).
 * Everything lives here and none of it is startable, so the only warm thing on
 * the screen is the way out.
 */
export const nuTheme: Palette = {
  key: 'nu',
  base: '#0B1029',
  layer: '#111838',
  card: '#161D42',
  subtle: '#1D2551',
  ink: '#F2F4FB',
  ink2: '#AEB6D4',
  ink3: '#929CC5',
  mute: '#9FA8D0',
  stroke: 'rgba(170,185,255,0.14)',
  strokeStrong: 'rgba(170,185,255,0.22)',

  nu: '#F2F4FB',                     // the ink: links, rings, marks
  nuSoft: '#AEB6D4',
  nuWash: 'rgba(255,255,255,0.08)',
  nuBtn: ['#F2F4FB', '#F2F4FB'],
  onNu: '#0B1029',
  pick: 'rgba(255,255,255,0.10)',
  pickEdge: 'rgba(255,255,255,0.45)',

  ra: '#FF8A5C',                     // sunrise coral, lifted for a dark ground
  raSoft: '#FFB183',
  raDeep: '#FFA05C',
  raWash: 'rgba(255,107,53,0.16)',
  raBtn: ['#FF6B35', '#FFA05C'],
  onRa: '#3B1204',                   // near-black brown on coral, ~8:1

  brandSolid: '#FF8A5C',
  onBrand: '#3B1204',
  track: '#1E2652',
  // light lifted off the ground, not a lighter grey — this is what makes a
  // dark surface read as raised rather than merely different
  surface: ['rgba(255,255,255,0.085)', 'rgba(255,255,255,0.022)'],
  glowNu: 0.30, glowRa: 0.16,
  atmosphere: ['#0B1030', '#070C26', '#04091E'],
  scale: ['#161D42', '#3A2B45', '#6B3A3C', '#B8532F', '#FF6B35', '#FFA05C'],
  heroWash: ['rgba(255,150,100,0.30)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.03)'],
  emphasisWash: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)'],
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
  mute: '#958B77',                   // large display text only (>= 3:1)
  stroke: 'rgba(23,19,19,0.08)',
  strokeStrong: 'rgba(23,19,19,0.16)',

  nu: '#171313',                     // the ink: links, rings, marks
  nuSoft: '#4A4340',
  nuWash: 'rgba(23,19,19,0.06)',
  nuBtn: ['#1B1830', '#1B1830'],     // the dark of Begin and +
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
  heroWash: ['rgba(255,150,100,0.16)', 'rgba(23,19,19,0.04)', 'rgba(23,19,19,0.02)'],
  emphasisWash: ['rgba(23,19,19,0.06)', 'rgba(23,19,19,0.02)'],
  statusBar: 'dark',
};

/**
 * UTILITY — settings, the calendar, a task's details, sign-in. Nu's navy with
 * nothing in the water: no glows, no warmth, so a form reads as a form. It
 * ends in the same navy as the rooms, so the tab bar's fade is seamless.
 */
export const utilityTheme: Palette = {
  ...nuTheme,
  glowNu: 0.10, glowRa: 0,
  atmosphere: ['#0D1231', '#0B1029', '#0B1029'],
  heroWash: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)'],
};

/**
 * MIXED — where Nu and Ra meet: Your Day, Wins, reflection, the companions.
 * The same navy, with dawn in it — a warm glow that climbs as the day's
 * things get done (Mica's sunProgress). Still Nu's grammar, Ra's light.
 */
export const mixedTheme: Palette = {
  ...nuTheme,
  glowNu: 0.24, glowRa: 0.30,
  atmosphere: ['#121840', '#0D122F', '#0B1029'],
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
  warm: { shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
} as const;

/** Line icons everywhere are drawn at this weight. */
export const iconStroke = 1.8;

/** Inter Tight, only (guidelines/Guidelines.md, rule 2). */
export const type = {
  display: 'InterTight_600SemiBold',
  displayLight: 'InterTight_400Regular',
  brand: 'InterTight_500Medium',
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
  // said at the end of a session, whatever length it was
  contract: (m: number) => `${m} minute${m === 1 ? '' : 's'} done. Stop here — or keep the momentum.`,
  stop: 'Stop here — it still counts',
  nextStep: 'FOCUS',
} as const;

export const space = (n: number) => n * 4;
