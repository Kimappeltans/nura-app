/**
 * Nura design tokens — matched to the landing page.
 *
 * Two accents with two jobs, because the brand has two characters:
 *   NU  · the water · indigo   — capture, calm, receiving
 *   RA  · the light · amber    — activation, the next step, momentum
 *
 * Everything else is neutral. A colour that appears everywhere stops meaning
 * anything.
 */

export const dark = {
  base: '#0B1029',
  layer: '#101636',
  card: '#161D42',
  subtle: '#1D2551',
  ink: '#F2F4FB',
  ink2: '#AEB6D4',
  ink3: '#7E87AC',
  stroke: 'rgba(170,185,255,0.10)',
  strokeStrong: 'rgba(170,185,255,0.18)',

  // NU — the water
  nu: '#5B6CF0',
  nuSoft: '#8C97F6',
  nuWash: 'rgba(91,108,240,0.14)',
  // RA — the light
  ra: '#E8A33D',
  raSoft: '#F3C176',
  raWash: 'rgba(232,163,61,0.14)',

  brandA: '#5B6CF0',
  brandB: '#8C97F6',
  brandSolid: '#8C97F6',
  onBrand: '#FFFFFF',
  track: '#1E2652',
  // sequential ramp for the pixel grid: one hue, light -> dark
  scale: ['#161D42', '#222C68', '#2F3D93', '#4150C4', '#5B6CF0', '#95A0F8'],
} as const;

export const light = {
  base: '#FAF7F0',     // the cream the landing page alternates into
  layer: '#F4F0E6',
  card: '#FFFFFF',
  subtle: '#EFEBE0',
  ink: '#101838',
  ink2: '#454E73',
  ink3: '#6B7490',
  stroke: 'rgba(16,24,56,0.08)',
  strokeStrong: 'rgba(16,24,56,0.14)',

  nu: '#4338CA',
  nuSoft: '#6B5FE0',
  nuWash: 'rgba(67,56,202,0.10)',
  ra: '#B87316',
  raSoft: '#D89434',
  raWash: 'rgba(184,115,22,0.12)',

  brandA: '#4338CA',
  brandB: '#6B5FE0',
  brandSolid: '#3D32BE',
  onBrand: '#FFFFFF',
  track: '#E5E0D3',
  scale: ['#EAE7F6', '#CBC5EF', '#A79EE3', '#7C70D4', '#4338CA', '#2C2494'],
} as const;

export type Theme = typeof dark;

/** Fluent radius scale — 4 controls, 8 large controls & cards, 12 popovers. */
export const radius = { sm: 4, md: 8, lg: 12, xl: 18, pill: 999 } as const;

export const type = {
  // Poppins for display, system for body — Poppins' small x-height costs
  // legibility below ~16px, and most of a reminder app is small text.
  display: 'Poppins_600SemiBold',
  displayLight: 'Poppins_400Regular',
  brand: 'Poppins_500Medium',
} as const;

/** The landing page's voice. Warm, never disappointed, never a count of failures. */
export const copy = {
  greeting: "Good morning. Let's make today feel possible.",
  nextStep: 'YOUR NEXT CLEAR STEP',
  captureTitle: 'Tell me everything.',
  captureSub: 'We can sort it later.',
  energyAsk: 'How is your energy?',
  emptyTitle: 'Nothing urgent.',
  emptyBody: 'Want to do something small, or call it a day?',
  contract: 'Five minutes done. Stop here — or keep the momentum.',
  stop: 'Stop here — that counts',
} as const;

export const space = (n: number) => n * 4;
