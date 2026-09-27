import type { LabelId } from './labels';

/**
 * Activities — 36 things people actually do, each with its own scene.
 *
 * NO DEFAULT DURATIONS. An earlier version shipped one per activity — Yoga 20m,
 * Coding 1h — and it was wrong on principle: how long your yoga takes is not a
 * property of yoga. A pre-filled guess is worse than an empty field, because
 * the estimate feeds the energy filter, so a wrong number quietly changes what
 * you get handed. If you want an estimate, you set it; the app doesn't invent
 * one about your life.
 *
 * What an activity still does:
 *
 *  1. Fills in the label, which IS a property of the activity — yoga is health
 *     whoever is doing it.
 *  2. Gives the thing a PICTURE. A list of grey sentences is the reason a
 *     to-do list feels like homework; "Yoga · 20 min" with Nu and Ra on a mat
 *     is a different object entirely, and for anyone whose problem is
 *     initiation rather than memory, that difference is most of the game.
 *
 * The catalogue is fixed and not user-extensible. Custom activities would mean
 * either commissioning art per user or falling back to a grey card, and a
 * half-illustrated list looks broken rather than personal. Anything outside it
 * is just a normal task, which is still the default.
 *
 * The set deliberately covers the unglamorous and the restful as well as the
 * productive — Laundry, Waiting on hold, Bedtime, Self-care, Therapy. An app
 * that only illustrates work is an app that teaches you the rest doesn't count.
 */

export type ActivityId =
  // body & rest
  | 'exercise' | 'yoga' | 'mindfulness' | 'walking-dog' | 'self-care' | 'bedtime' | 'therapy'
  // work
  | 'coding' | 'writing' | 'email' | 'meeting' | 'presenting' | 'planning' | 'preparing'
  | 'brainstorming' | 'deep-focus' | 'weekly-review' | 'job-interview'
  // mind
  | 'studying' | 'reading'
  // life admin
  | 'finances' | 'phone-call' | 'waiting-on-hold' | 'pickup' | 'grocery-shopping'
  | 'cleaning' | 'laundry' | 'cooking' | 'commuting'
  // care
  | 'doctor' | 'beauty-salon'
  // off
  | 'social-plans' | 'watching-movie' | 'time-off' | 'vacation' | 'flying';

export interface Activity {
  id: ActivityId;
  name: string;
  /** what the card is tinted with, on a dark ground */
  tint: string;
  /** the same hue at a strength that reads on cream */
  onLight: string;
  label: LabelId;
  /** shown before you search — the handful most people reach for */
  common?: boolean;
}

export const ACTIVITIES: Activity[] = [
  // ---- body & rest ----
  { id: 'exercise', common: true,       name: 'Exercise',       tint: '#7BE495', onLight: '#15803D', label: 'health' },
  { id: 'yoga',           name: 'Yoga',           tint: '#5EDCC0', onLight: '#0F766E', label: 'health' },
  { id: 'mindfulness',    name: 'Mindfulness',    tint: '#9AE6D0', onLight: '#0E7490', label: 'health' },
  { id: 'walking-dog',    name: 'Walk the dog',   tint: '#A7E27C', onLight: '#4D7C0F', label: 'home' },
  { id: 'self-care',      name: 'Self-care',      tint: '#F0A6D0', onLight: '#A21CAF', label: 'health' },
  { id: 'bedtime',        name: 'Bedtime',        tint: '#A5A0F0', onLight: '#5B21B6', label: 'health' },
  { id: 'therapy',        name: 'Therapy',        tint: '#8FE0B0', onLight: '#047857', label: 'health' },
  // ---- work ----
  { id: 'deep-focus',     name: 'Deep focus',     tint: '#8C97F6', onLight: '#4338CA', label: 'work' },
  { id: 'coding', common: true,         name: 'Coding',         tint: '#8C97F6', onLight: '#4338CA', label: 'work' },
  { id: 'writing',        name: 'Writing',        tint: '#93B4FF', onLight: '#1D4ED8', label: 'work' },
  { id: 'email', common: true,          name: 'Email',          tint: '#7FC4FF', onLight: '#0369A1', label: 'work' },
  { id: 'meeting', common: true,        name: 'Meeting',        tint: '#A5A0F0', onLight: '#5B21B6', label: 'work' },
  { id: 'presenting',     name: 'Presenting',     tint: '#B8A6F5', onLight: '#6D28D9', label: 'work' },
  { id: 'brainstorming',  name: 'Brainstorming',  tint: '#C79BF5', onLight: '#7E22CE', label: 'work' },
  { id: 'planning',       name: 'Planning',       tint: '#93B4FF', onLight: '#1D4ED8', label: 'work' },
  { id: 'preparing',      name: 'Preparing',      tint: '#9FC0FF', onLight: '#1E40AF', label: 'work' },
  { id: 'weekly-review',  name: 'Weekly review',  tint: '#8FD3F4', onLight: '#0E7490', label: 'work' },
  { id: 'job-interview',  name: 'Interview',      tint: '#B8A6F5', onLight: '#6D28D9', label: 'work' },
  // ---- mind ----
  { id: 'studying', common: true,       name: 'Studying',       tint: '#7FC4FF', onLight: '#0369A1', label: 'study' },
  { id: 'reading',        name: 'Reading',        tint: '#8FD3F4', onLight: '#0E7490', label: 'study' },
  // ---- life admin ----
  { id: 'finances',       name: 'Finances',       tint: '#C79BF5', onLight: '#7E22CE', label: 'money' },
  { id: 'phone-call', common: true,     name: 'Phone call',     tint: '#FF9BC2', onLight: '#BE185D', label: 'people' },
  { id: 'waiting-on-hold',name: 'Waiting on hold',tint: '#FFB8D2', onLight: '#9D174D', label: 'errands' },
  { id: 'pickup',         name: 'Pick up',        tint: '#FFB183', onLight: '#C2410C', label: 'errands' },
  { id: 'grocery-shopping',name:'Groceries',      tint: '#FFC48F', onLight: '#B45309', label: 'errands' },
  { id: 'cleaning', common: true,       name: 'Cleaning',       tint: '#A7E27C', onLight: '#4D7C0F', label: 'home' },
  { id: 'laundry',        name: 'Laundry',        tint: '#9AE6D0', onLight: '#0E7490', label: 'home' },
  { id: 'cooking',        name: 'Cooking',        tint: '#F5D07A', onLight: '#A16207', label: 'home' },
  { id: 'commuting',      name: 'Commute',        tint: '#9FC0FF', onLight: '#1E40AF', label: 'personal' },
  // ---- care ----
  { id: 'doctor', common: true,         name: 'Doctor',         tint: '#8FE0B0', onLight: '#047857', label: 'health' },
  { id: 'beauty-salon',   name: 'Appointment',    tint: '#F0A6D0', onLight: '#A21CAF', label: 'personal' },
  // ---- off ----
  { id: 'social-plans',   name: 'Seeing people',  tint: '#FF9BC2', onLight: '#BE185D', label: 'people' },
  { id: 'watching-movie', name: 'Watch something',tint: '#F5D07A', onLight: '#A16207', label: 'personal' },
  { id: 'time-off',       name: 'Time off',       tint: '#FFC48F', onLight: '#B45309', label: 'personal' },
  { id: 'vacation',       name: 'Holiday',        tint: '#FFD79A', onLight: '#92400E', label: 'personal' },
  { id: 'flying',         name: 'Travel',         tint: '#9FC0FF', onLight: '#1E40AF', label: 'personal' },
];

export const activityById = (id?: string | null): Activity | null =>
  ACTIVITIES.find(a => a.id === id) ?? null;

/** Metro cannot resolve a computed require path, so every scene is listed. */
export const SCENES: Record<ActivityId, any> = {
  'exercise':         require('../assets/activities/exercise.webp'),
  'yoga':             require('../assets/activities/yoga.webp'),
  'mindfulness':      require('../assets/activities/mindfulness.webp'),
  'walking-dog':      require('../assets/activities/walking-dog.webp'),
  'self-care':        require('../assets/activities/self-care.webp'),
  'bedtime':          require('../assets/activities/bedtime.webp'),
  'therapy':          require('../assets/activities/therapy.webp'),
  'deep-focus':       require('../assets/activities/deep-focus.webp'),
  'coding':           require('../assets/activities/coding.webp'),
  'writing':          require('../assets/activities/writing.webp'),
  'email':            require('../assets/activities/email.webp'),
  'meeting':          require('../assets/activities/meeting.webp'),
  'presenting':       require('../assets/activities/presenting.webp'),
  'brainstorming':    require('../assets/activities/brainstorming.webp'),
  'planning':         require('../assets/activities/planning.webp'),
  'preparing':        require('../assets/activities/preparing.webp'),
  'weekly-review':    require('../assets/activities/weekly-review.webp'),
  'job-interview':    require('../assets/activities/job-interview.webp'),
  'studying':         require('../assets/activities/studying.webp'),
  'reading':          require('../assets/activities/reading.webp'),
  'finances':         require('../assets/activities/finances.webp'),
  'phone-call':       require('../assets/activities/phone-call.webp'),
  'waiting-on-hold':  require('../assets/activities/waiting-on-hold.webp'),
  'pickup':           require('../assets/activities/pickup.webp'),
  'grocery-shopping': require('../assets/activities/grocery-shopping.webp'),
  'cleaning':         require('../assets/activities/cleaning.webp'),
  'laundry':          require('../assets/activities/laundry.webp'),
  'cooking':          require('../assets/activities/cooking.webp'),
  'commuting':        require('../assets/activities/commuting.webp'),
  'doctor':           require('../assets/activities/doctor.webp'),
  'beauty-salon':     require('../assets/activities/beauty-salon.webp'),
  'social-plans':     require('../assets/activities/social-plans.webp'),
  'watching-movie':   require('../assets/activities/watching-movie.webp'),
  'time-off':         require('../assets/activities/time-off.webp'),
  'vacation':         require('../assets/activities/vacation.webp'),
  'flying':           require('../assets/activities/flying.webp'),
};

/**
 * A first guess from what was typed. Order matters — the FIRST match wins, so
 * the specific patterns sit above the general ones ("walk the dog" before
 * "walk", "grocery" before "shop").
 */
const HINTS: [ActivityId, RegExp][] = [
  ['walking-dog',     /\b(walk the dog|dog walk|walkies)\b/i],
  ['grocery-shopping',/\b(groceries|grocery|supermarket|food shop|weekly shop)\b/i],
  ['waiting-on-hold', /\b(on hold|call centre|call center|customer service|chase up)\b/i],
  ['job-interview',   /\b(interview)\b/i],
  ['weekly-review',   /\b(weekly review|week review|retro|review the week)\b/i],
  ['deep-focus',      /\b(deep work|deep focus|focus block|heads down)\b/i],
  ['exercise',        /\b(gym|workout|work out|exercise|run|running|lift|weights|swim|cycle)\b/i],
  ['yoga',            /\b(yoga|stretch|pilates)\b/i],
  ['mindfulness',     /\b(meditate|meditation|mindful|breathe|breathing)\b/i],
  ['therapy',         /\b(therapy|therapist|counsell?ing|psych)\b/i],
  ['self-care',       /\b(self-?care|skincare|bath|unwind|pamper)\b/i],
  ['bedtime',         /\b(bed|bedtime|sleep|wind down|early night)\b/i],
  ['coding',          /\b(cod(e|ing)|debug|refactor|deploy|pull request|\bpr\b|bug|feature)\b/i],
  ['writing',         /\b(writ(e|ing)|draft|blog|essay|article|copy|newsletter)\b/i],
  ['email',           /\b(e-?mail|inbox|reply|send.*(mail|note))\b/i],
  ['meeting',         /\b(meeting|standup|stand-up|1:1|one on one|catch-?up|sync)\b/i],
  ['presenting',      /\b(present|presentation|demo|pitch|talk|slides|deck)\b/i],
  ['brainstorming',   /\b(brainstorm|ideate|ideas|workshop)\b/i],
  ['planning',        /\b(plan|planning|roadmap|organise|organize)\b/i],
  ['preparing',       /\b(prep|prepare|pack|get ready|set up)\b/i],
  ['studying',        /\b(stud(y|ying)|revise|revision|exam|assignment|homework|course|lecture)\b/i],
  // NOT bare "book" — "book the dentist" and "book a flight" use it as a verb
  // for scheduling, and matched here first (this pattern sits above 'doctor'
  // and 'flying'), so every booked appointment got guessed as light reading.
  ['reading',         /\b(read|reading|chapter|book club|paper)\b/i],
  ['finances',        /\b(bill|pay|tax|budget|bank|invoice|rent|expenses|accounts)\b/i],
  ['phone-call',      /\b(call|ring|phone|dial)\b/i],
  ['pickup',          /\b(pick up|collect|parcel|post office|drop off)\b/i],
  ['cleaning',        /\b(clean|tidy|hoover|vacuum|dishes|declutter)\b/i],
  ['laundry',         /\b(laundry|washing|iron|fold)\b/i],
  ['cooking',         /\b(cook|dinner|lunch|meal|bake|recipe)\b/i],
  ['commuting',       /\b(commute|train|drive to|bus|travel to work)\b/i],
  ['doctor',          /\b(doctor|gp|dentist|clinic|prescription|physio|appointment)\b/i],
  ['beauty-salon',    /\b(haircut|hair|salon|barber|nails|massage)\b/i],
  ['social-plans',    /\b(drinks|dinner with|see |meet |party|birthday|coffee with)\b/i],
  ['watching-movie',  /\b(watch|movie|film|series|episode|netflix)\b/i],
  ['time-off',        /\b(rest|break|day off|chill|relax|nap)\b/i],
  ['vacation',        /\b(holiday|vacation|trip away)\b/i],
  ['flying',          /\b(flight|fly|airport|plane|check in)\b/i],
];

export function guessActivity(title: string): ActivityId | null {
  for (const [id, re] of HINTS) if (re.test(title)) return id;
  return null;
}

/** Fuzzy match for the picker's search box. */
export function searchActivities(q: string): Activity[] {
  const term = q.trim().toLowerCase();
  if (!term) return ACTIVITIES.filter(a => a.common);
  const starts = ACTIVITIES.filter(a => a.name.toLowerCase().startsWith(term));
  const contains = ACTIVITIES.filter(a =>
    !a.name.toLowerCase().startsWith(term) &&
    (a.name.toLowerCase().includes(term) || a.id.includes(term)));
  return [...starts, ...contains];
}

/* ------------------------------------------------------------------ *
 *  Your own.
 *
 *  The 36 are a starting point, not a worldview — nobody's life fits a
 *  fixed list, and being told "your thing isn't a thing" is a bad first
 *  impression. A custom activity gets a name and a colour and behaves like
 *  any other; it just has no scene, so its card shows the label's glyph
 *  instead. That's an honest gap rather than a wrong picture.
 * ------------------------------------------------------------------ */

export const CUSTOM_PREFIX = 'custom:';
export const isCustom = (id?: string | null) => !!id?.startsWith(CUSTOM_PREFIX);
export const customName = (id: string) => id.slice(CUSTOM_PREFIX.length);
export const makeCustomId = (name: string) =>
  CUSTOM_PREFIX + name.trim().replace(/\s+/g, ' ');
