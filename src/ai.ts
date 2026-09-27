import { supabase } from './supabase';
import { getFlag, setFlag } from './db';

/**
 * What every call to Claude (planner.ts, coach.ts) checks first, and the
 * net under what comes back.
 *
 * Consent: nothing you type goes to Claude until you've said yes once (the
 * AiConsent sheet, or AI help in Settings). Kept on the phone in app_state
 * as `ai.ok`: '1' yes, '0' not now or turned off, nothing when never asked.
 */

export type AiConsent = 'yes' | 'no' | 'ask';

const KEY = 'ai.ok';

export async function aiConsent(): Promise<AiConsent> {
  try {
    const v = await getFlag(KEY);
    return v === '1' ? 'yes' : v === '0' ? 'no' : 'ask';
  } catch { return 'ask'; }
}

export const aiAllowed = async () => (await aiConsent()) === 'yes';

export async function setAiConsent(ok: boolean) { await setFlag(KEY, ok ? '1' : '0'); }

/** Whether there's a session to call the functions with. They only answer a
 *  signed-in person, so without one there's no point asking. */
export async function signedIn(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch { return false; }
}

const DASH = /[\u2013\u2014]/;

/**
 * No dashes in anything Nura shows (the prompts ask for none; this is the
 * net under them): a number range "5–10" reads "5 to 10", a dash between
 * words or clauses becomes a comma, and one that opens or closes a line
 * goes. Hyphens stay.
 */
export function noDashes(s: string): string {
  if (!DASH.test(s)) return s;
  return s
    .replace(/(\d)\s*[\u2013\u2014]+\s*(?=[$€£]?\d)/g, '$1 to ')
    .replace(/^[ \t]*[\u2013\u2014]+[ \t]*/gm, '')
    .replace(/[ \t]*[\u2013\u2014]+[ \t]*$/gm, '')
    .replace(/[ \t]*[\u2013\u2014]+[ \t]*/g, ', ')
    .replace(/,\s*([,.;:!?])/g, '$1');
}
