/**
 * Light — the reward economy.
 *
 * Almost every gamified app runs on streaks, and a streak is the single worst
 * mechanic you can hand someone with ADHD: it is a debt that grows silently and
 * then detonates on the first missed day, and the day after it breaks is the
 * day the app gets deleted. So there are no streaks here, and there is nothing
 * that can go down.
 *
 * What's here instead:
 *
 *  1. LIGHT is monotonic. Earned, never spent, never decayed, never lost.
 *  2. VARIABLE RATIO. The base award is fixed, but a bonus lands on an
 *     unpredictable fraction of actions. Unpredictable reward is what actually
 *     drives a dopamine response — a fixed +10 every time stops registering
 *     within a week. This is the one place in the app where randomness is the
 *     correct design, and it only ever adds.
 *  3. STOPPING EARLY PAYS. `partial` is worth most of `complete`. Time spent is
 *     the achievement; finishing is a bonus, not the entry fee.
 *  4. RANKS ONLY CLIMB. You can be short of the next one. You can never fall
 *     out of the one you have.
 */

export type RewardReason =
  | 'capture'    // wrote something down — tiny, but it's the habit that matters
  | 'enrich'     // answered Ra's one question
  | 'step'       // finished a micro-step
  | 'partial'    // stopped early, on purpose
  | 'complete'   // finished the thing
  | 'retro';     // logged something you'd already done

export const BASE: Record<RewardReason, number> = {
  capture: 1,
  enrich: 2,
  step: 4,
  partial: 9,
  complete: 12,
  retro: 3,
};

/** Only real effort rolls for a bonus. Capture is a habit, not a slot machine. */
const ROLLS: RewardReason[] = ['step', 'partial', 'complete'];

export interface Bonus { n: number; label: string | null; golden: boolean }

/**
 * The variable-ratio table. Expected value is ~+7, so a completion averages
 * around 19 light — but any single one might be 12, and about one in thirty is
 * a 60. That spread is the entire mechanism.
 */
function rollBonus(): Bonus {
  const r = Math.random();
  if (r < 0.55) return { n: 0,  label: null,            golden: false };
  if (r < 0.85) return { n: 5,  label: 'nice one',      golden: false };
  if (r < 0.97) return { n: 15, label: 'that was a big one', golden: false };
  return          { n: 60, label: 'GOLDEN HOUR',   golden: true  };
}

export interface Award { base: number; bonus: Bonus; total: number; reason: RewardReason }

export function award(reason: RewardReason): Award {
  const base = BASE[reason];
  const bonus = ROLLS.includes(reason) ? rollBonus() : { n: 0, label: null, golden: false };
  return { base, bonus, total: base + bonus.n, reason };
}

/* ------------------------------------------------------------------ *
 *  Ranks — named for where the sun is. They only ever climb.
 * ------------------------------------------------------------------ */

export interface Rank { at: number; name: string; blurb: string }

export const RANKS: Rank[] = [
  { at: 0,    name: 'First Light',  blurb: 'Something has begun.' },
  { at: 60,   name: 'Dawn',         blurb: 'It is happening more than once.' },
  { at: 200,  name: 'Sunrise',      blurb: 'This is a habit now, whatever it feels like.' },
  { at: 500,  name: 'Morning',      blurb: 'Long past the point most people stop.' },
  { at: 1200, name: 'High Sun',     blurb: 'Months of small starts add up to this.' },
  { at: 2600, name: 'Golden Hour',  blurb: 'Very few get here. You did.' },
  { at: 5000, name: 'Solstice',     blurb: 'The longest light there is.' },
];

export function rankFor(light: number): Rank {
  let out = RANKS[0];
  for (const r of RANKS) if (light >= r.at) out = r;
  return out;
}

export function nextRank(light: number): Rank | null {
  return RANKS.find(r => r.at > light) ?? null;
}

/** 0..1 through the current rank — the bar under the total. */
export function rankProgress(light: number): number {
  const cur = rankFor(light), next = nextRank(light);
  if (!next) return 1;
  return Math.max(0, Math.min(1, (light - cur.at) / (next.at - cur.at)));
}

/* ------------------------------------------------------------------ *
 *  The day's sun. Fills as you earn; a new day is a new sky.
 * ------------------------------------------------------------------ */

/**
 * Deliberately low. Two real actions fills it. A target you clear by lunch on a
 * mediocre day is a target that keeps paying out; one you miss four days a week
 * is just a streak wearing a different hat.
 */
export const DAY_TARGET = 30;

export function sunHeight(todayLight: number): number {
  return Math.max(0, Math.min(1, todayLight / DAY_TARGET));
}

/** Where the sun is, in words. Never negative, never a scolding. */
export function skyLabel(todayLight: number): string {
  const h = sunHeight(todayLight);
  if (h === 0)   return 'Before dawn';
  if (h < 0.25)  return 'First light';
  if (h < 0.55)  return 'Climbing';
  if (h < 0.85)  return 'High and warm';
  if (h < 1)     return 'Almost noon';
  return 'Full sun — anything past here is extra';
}

/* ------------------------------------------------------------------ *
 *  What Ra says. Rotated so it doesn't go stale, and never a comparison
 *  to yesterday, a percentage, or a count of anything you didn't do.
 * ------------------------------------------------------------------ */

const DONE_LINES = [
  'That one is gone. Really gone.',
  'You did the hard part — the starting.',
  'Logged. It counts exactly as much as a big one.',
  'That was on your mind. Now it is not.',
  'One less thing pulling at you.',
  'Done is done. Nothing to revisit.',
];

const PARTIAL_LINES = [
  'You showed up. That was the whole ask.',
  'Five minutes of it is five more than none.',
  'Stopping on purpose is not the same as not starting.',
  'You chose to stop. That is control, not failure.',
];

const STEP_LINES = [
  'One step down. The rest got smaller.',
  'That is how the big one disappears.',
  'Chipped.',
];

export function line(reason: RewardReason): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  if (reason === 'partial') return pick(PARTIAL_LINES);
  if (reason === 'step')    return pick(STEP_LINES);
  if (reason === 'retro')   return 'Backdated. Your day had more in it than you thought.';
  if (reason === 'capture') return 'Caught.';
  if (reason === 'enrich')  return 'Now it knows what to ask for.';
  return pick(DONE_LINES);
}
