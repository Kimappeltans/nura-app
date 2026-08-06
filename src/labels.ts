/**
 * Labels — the one axis of organisation the app has.
 *
 * Deliberately a FIXED set, not user-created projects. Letting people build
 * their own taxonomy is how a task app turns into a filing system you have to
 * maintain before you're allowed to use it, and maintaining the system becomes
 * the procrastination. Eight is enough to make the list scannable and few
 * enough to pick from without thinking.
 *
 * Each carries a colour AND an icon, because colour alone fails for the ~8% of
 * men with a colour-vision deficiency, and a coloured dot on its own is
 * meaningless until you've memorised the legend.
 */

export type LabelId =
  | 'work' | 'personal' | 'health' | 'errands'
  | 'money' | 'study' | 'people' | 'home';

export interface Label {
  id: LabelId;
  name: string;
  /** on dark ground */
  color: string;
  /** the same hue, darkened enough to read on cream (>= 4.5:1) */
  onLight: string;
}

export const LABELS: Label[] = [
  { id: 'work',     name: 'Work',     color: '#8C97F6', onLight: '#4338CA' },
  { id: 'personal', name: 'Personal', color: '#5EDCC0', onLight: '#0F766E' },
  { id: 'health',   name: 'Health',   color: '#7BE495', onLight: '#15803D' },
  { id: 'errands',  name: 'Errands',  color: '#FFB183', onLight: '#C2410C' },
  { id: 'money',    name: 'Money',    color: '#C79BF5', onLight: '#7E22CE' },
  { id: 'study',    name: 'Study',    color: '#7FC4FF', onLight: '#0369A1' },
  { id: 'people',   name: 'People',   color: '#FF9BC2', onLight: '#BE185D' },
  { id: 'home',     name: 'Home',     color: '#F5D07A', onLight: '#A16207' },
];

export const labelById = (id?: string | null): Label | null =>
  LABELS.find(l => l.id === id) ?? null;

/**
 * A first guess from the words someone typed, offered the moment they capture.
 *
 * It only ever SUGGESTS — the chip appears pre-selected and can be changed or
 * cleared in one tap. Auto-filing that can't be seen or undone is worse than no
 * filing at all, because you stop trusting where things went.
 */
const HINTS: Record<LabelId, RegExp> = {
  work:     /\b(email|meeting|slide|deck|report|invoice|client|standup|deploy|pr|ticket|boss|colleague|presentation|deadline)\b/i,
  personal: /\b(haircut|birthday|gift|holiday|pack|passport|renew|licen[cs]e|insurance)\b/i,
  health:   /\b(gym|run|walk|dentist|doctor|gp|appointment|prescription|therapy|physio|sleep|water|stretch|yoga)\b/i,
  errands:  /\b(buy|shop|groceries|pick up|drop off|post|parcel|return|collect|bins?|laundry|petrol|fuel)\b/i,
  money:    /\b(pay|bill|rent|tax|bank|transfer|refund|budget|subscription|cancel the trial|invoice)\b/i,
  study:    /\b(read|reading|essay|thesis|revise|revision|study|lecture|assignment|exam|library|paper|notes)\b/i,
  people:   /\b(call|ring|text|reply|mum|mom|dad|gran|friend|birthday|rsvp|thank you|catch up)\b/i,
  home:     /\b(clean|tidy|dishes|hoover|vacuum|bed|plant|water the|fix|repair|bulb|bin|garden|cook)\b/i,
};

export function guessLabel(title: string): LabelId | null {
  for (const [id, re] of Object.entries(HINTS) as [LabelId, RegExp][]) {
    if (re.test(title)) return id;
  }
  return null;
}
