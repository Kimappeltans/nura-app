// Nura's planner — a Supabase Edge Function that calls Claude.
//
// The app never holds a model key: it calls this function with the Supabase
// anon key (or the signed-in session), and this function holds
// ANTHROPIC_API_KEY as a Supabase secret. Deploy and setup steps are in
// supabase/README.md.
//
// One endpoint, three actions (see prompt.ts):
//   start  — a goal: one task, or a project (one question, or a first path)
//   plan   — the first path, after the question was answered or skipped
//   replan — after "too big", "blocked", "done", or "have another look"
//
// Every request is size-checked, every answer is schema-checked before it
// leaves, and there are daily limits per device/account and per IP, because
// the anon key ships inside the app and anyone who has it can call this.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { SCHEMAS, SYSTEM, userMessage, type Action } from './prompt.ts';

const MODEL = Deno.env.get('NURA_MODEL') ?? 'claude-sonnet-5';   // Opus: set NURA_MODEL=claude-opus-5
// Replans (too big / blocked / done / another look) change a path that
// already exists, so they go to the small model first; a wrong shape or a
// refusal gets one more try on MODEL.
const REPLAN_MODEL = Deno.env.get('NURA_REPLAN_MODEL') ?? 'claude-haiku-4-5-20251001';
/** Haiku 4.5 takes neither adaptive thinking nor `effort`. */
const thinks = (model: string) => !/^claude-haiku-/.test(model);
const EFFORT = (Deno.env.get('NURA_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high';
const PER_PERSON_PER_DAY = Number(Deno.env.get('NURA_DAILY_LIMIT') ?? 80);
const PER_IP_PER_DAY = Number(Deno.env.get('NURA_IP_DAILY_LIMIT') ?? 300);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nura-device',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ---------------- what the app may send ---------------- */

const text = (max: number) => z.string().trim().max(max);
const language = text(40).default('English');
const Note = z.object({ q: text(400), a: text(800) });

const Request = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), goal: text(1200).min(1), language }),
  z.object({ action: z.literal('plan'), goal: text(1200).min(1), notes: z.array(Note).max(8).default([]), language }),
  z.object({
    action: z.literal('replan'),
    language,
    event: z.object({ kind: z.enum(['too_big', 'blocked', 'done', 'replan']), note: text(600).nullable() }),
    state: z.object({
      goal: text(1200),
      title: text(200),
      done_means: text(400).nullable(),
      assumptions: z.array(text(300)).max(10),
      notes: z.array(Note).max(12),
      steps: z.array(z.object({
        ref: text(60),
        title: text(200),
        first_action: text(300).nullable(),
        est_minutes: z.number().int().min(0).max(10_000).nullable(),
        state: z.enum(['done', 'current', 'todo']),
        edited: z.boolean(),
      })).max(40),
      history: z.array(z.object({
        kind: text(30), note: text(600).nullable(), step: text(200).nullable(), hours_ago: z.number(),
      })).max(12),
    }),
  }),
]);

/* ---------------- what the model must answer ---------------- */

const Move = z.object({
  ref: z.string(), title: z.string().min(1), first_action: z.string(), why: z.string(), est_minutes: z.number().int(),
});
const Answers = {
  start: z.object({
    kind: z.enum(['task', 'project']), title: z.string(), reply: z.string(), question: z.string(),
    options: z.array(z.string()), done_means: z.string(), assumptions: z.array(z.string()),
    steps: z.array(Move), current: z.number().int(),
  }),
  plan: z.object({
    title: z.string(), reply: z.string(), done_means: z.string(), assumptions: z.array(z.string()),
    steps: z.array(Move).min(1), current: z.number().int(),
  }),
  replan: z.object({
    reply: z.string(), steps: z.array(Move), current: z.number().int(),
    question: z.string(), options: z.array(z.string()), maybe_done: z.boolean(),
  }),
} as const;

/* ---------------- plumbing ---------------- */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** The signed-in user's id, if any. The gateway has already verified the
 *  token (verify_jwt), so reading its payload is enough; the anon key has
 *  no `sub`. */
function userIdOf(req: Request): string | null {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Counts one call against `key` for today; true when it's over `limit`.
 *  Fails open (with a log line) if supabase/ai-usage.sql hasn't been run. */
async function over(key: string, limit: number): Promise<boolean> {
  const { data, error } = await admin.rpc('nura_ai_hit', { k: key });
  if (error) { console.warn('[nura-plan] usage limits are off:', error.message); return false; }
  return typeof data === 'number' && data > limit;
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

async function ask(action: Action, data: Record<string, unknown>, lang: string, model = MODEL) {
  const think = thinks(model);
  const msg = await anthropic.beta.messages.create({
    model,
    max_tokens: think ? 8000 : 3000,
    // On Opus/Fable: if a safety classifier declines, the API retries on its
    // recommended fallback model instead of returning a refusal. Only sent to
    // those models — its documented targets are Opus-tier; elsewhere a
    // refusal is simply a 422 'declined', as before.
    ...(/^claude-(opus|fable)-/.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    ...(think ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: { ...(think ? { effort: EFFORT } : {}), format: { type: 'json_schema', schema: SCHEMAS[action] } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage(action, data, lang) }],
  });
  if (msg.stop_reason === 'refusal') throw new Failure(422, 'declined');
  if (msg.stop_reason === 'max_tokens') throw new Failure(502, 'too_long');
  const out = msg.content.find(b => b.type === 'text');
  if (!out || out.type !== 'text') throw new Failure(502, 'empty');
  let value: unknown;
  try { value = JSON.parse(out.text); } catch { throw new Failure(502, 'shape'); }
  const parsed = Answers[action].safeParse(value);
  if (!parsed.success) throw new Failure(502, 'shape');
  return parsed.data;
}

/** start and plan go to MODEL. replan tries REPLAN_MODEL first, and only a
 *  wrong or missing answer or a refusal goes once more to MODEL. */
async function answer(action: Action, data: Record<string, unknown>, lang: string) {
  if (action !== 'replan' || REPLAN_MODEL === MODEL) return ask(action, data, lang);
  try {
    return await ask(action, data, lang, REPLAN_MODEL);
  } catch (e) {
    if (!(e instanceof Failure) || !['shape', 'declined', 'empty', 'too_long'].includes(e.code)) throw e;
    console.warn('[nura-plan] replan retried on', MODEL, 'after', e.code);
    return ask(action, data, lang);
  }
}

class Failure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: z.infer<typeof Request>;
  try {
    const parsed = Request.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'request' }, 400);
    body = parsed.data;
  } catch { return json({ error: 'request' }, 400); }

  const who = userIdOf(req) ?? `d:${(req.headers.get('x-nura-device') ?? '').slice(0, 64) || 'unknown'}`;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (await over(who, PER_PERSON_PER_DAY) || await over(`ip:${ip}`, PER_IP_PER_DAY)) {
    return json({ error: 'limit' }, 429);
  }

  const { action, language: lang, ...data } = body;
  try {
    return json(await answer(action, data, lang));
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code }, e.status);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error('[nura-plan] model error', e.status, e.message);
      return json({ error: 'model' }, 502);
    }
    console.error('[nura-plan]', e);
    return json({ error: 'server' }, 500);
  }
});
