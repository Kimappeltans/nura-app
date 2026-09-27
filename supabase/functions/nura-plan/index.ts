// Nura's planner — a Supabase Edge Function that calls Claude.
//
// The app never holds a model key: it calls this function with the signed-in
// session, and this function holds ANTHROPIC_API_KEY as a Supabase secret.
// Deploy and setup steps are in supabase/README.md.
//
// One endpoint, three actions (see prompt.ts):
//   start  — a goal: one task, or a project (one question, or a first path)
//   plan   — the first path, after the question was answered or skipped
//   replan — after "too big", "blocked", "done", or "have another look"
//
// Only a signed-in person gets through (the anon key ships inside the app,
// so it proves nothing). Every request is size-checked, every answer is
// schema-checked before it leaves, and there are daily limits per account
// and per IP. If the limits can't be counted, nothing reaches the model.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { LANGUAGES, SCHEMAS, SYSTEM, userMessage, type Action, type Language } from './prompt.ts';

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
// The app gives up after 60 s. Each try gets 45 s and there's one retry, but
// the whole answer (a replan's second model too) has to be back by 50 s.
const TRY_MS = 45_000;
const DEADLINE_MS = 50_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nura-device',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ---------------- what the app may send ---------------- */

const text = (max: number) => z.string().trim().max(max);
// only the app's own languages; anything else (or nothing) is English
const language = z.enum(LANGUAGES).catch('English');
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

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The signed-in person's id, or why there isn't one. The gateway checks
 *  the token's signature too (verify_jwt), but the anon key passes that, so
 *  this checks the claims itself: getClaims verifies the token (locally
 *  against the project's signing keys, or with the Auth server for the
 *  older shared secret) and its expiry. Only a real, non-anonymous account
 *  counts. */
async function userOf(req: Request): Promise<{ id: string } | { status: 401 | 503 }> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!token) return { status: 401 };
  try {
    const { data, error } = await admin.auth.getClaims(token);
    if (error) {
      // the Auth server being unreachable isn't the caller's fault
      const status = (error as { status?: number }).status ?? 0;
      if (error.name === 'AuthRetryableFetchError' || status >= 500) {
        console.error('[nura-plan] could not check the session:', error.message);
        return { status: 503 };
      }
      return { status: 401 };
    }
    const c = data?.claims;
    if (!c || c.role !== 'authenticated' || typeof c.sub !== 'string' || !c.sub || c.is_anonymous === true) return { status: 401 };
    return { id: c.sub };
  } catch (e) {
    console.error('[nura-plan] could not check the session:', e);
    return { status: 503 };
  }
}

/** The caller's address, for the second limit. On Supabase's edge
 *  cf-connecting-ip is set by Cloudflare and can't be forged through it; the
 *  first x-forwarded-for entry is whatever the client put there, so it's
 *  only the fallback. The account limit is the one that holds. */
function ipOf(req: Request): string {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0];
  return ip?.trim().slice(0, 64) || 'unknown';
}

/** Counts one call against `key` for today. 'off' when it can't be counted
 *  (supabase/ai-usage.sql not run, or the database erred): the caller must
 *  then refuse, never call the model uncounted. */
async function hit(key: string, limit: number): Promise<'ok' | 'over' | 'off'> {
  try {
    const { data, error } = await admin.rpc('nura_ai_hit', { k: key });
    if (error || typeof data !== 'number') {
      console.error('[nura-plan] usage limits unavailable, refusing:', error?.message ?? `got ${typeof data}`);
      return 'off';
    }
    return data > limit ? 'over' : 'ok';
  } catch (e) {
    console.error('[nura-plan] usage limits unavailable, refusing:', e);
    return 'off';
  }
}

// A key made outside a workspace has to name one on every request: set
// ANTHROPIC_WORKSPACE_ID (or use a key made inside a workspace instead).
const WORKSPACE = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  timeout: TRY_MS,
  maxRetries: 1,
  ...(WORKSPACE ? { defaultHeaders: { 'anthropic-workspace-id': WORKSPACE } } : {}),
});

async function ask(action: Action, data: Record<string, unknown>, lang: Language, signal: AbortSignal, model = MODEL) {
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
  }, { signal });
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
async function answer(action: Action, data: Record<string, unknown>, lang: Language, signal: AbortSignal) {
  if (action !== 'replan' || REPLAN_MODEL === MODEL) return ask(action, data, lang, signal);
  try {
    return await ask(action, data, lang, signal, REPLAN_MODEL);
  } catch (e) {
    if (!(e instanceof Failure) || !['shape', 'declined', 'empty', 'too_long'].includes(e.code)) throw e;
    console.warn('[nura-plan] replan retried on', MODEL, 'after', e.code);
    return ask(action, data, lang, signal);
  }
}

class Failure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // a signed-in person, or nothing: the anon key alone gets a 401
  const user = await userOf(req);
  if ('status' in user) return json({ error: user.status === 401 ? 'auth' : 'server' }, user.status);

  let body: z.infer<typeof Request>;
  try {
    const parsed = Request.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'request' }, 400);
    body = parsed.data;
  } catch { return json({ error: 'request' }, 400); }

  // the account first; the address second. Uncounted is refused.
  for (const [key, limit] of [[`u:${user.id}`, PER_PERSON_PER_DAY], [`ip:${ipOf(req)}`, PER_IP_PER_DAY]] as const) {
    const n = await hit(key, limit);
    if (n === 'off') return json({ error: 'limits' }, 503);
    if (n === 'over') return json({ error: 'limit' }, 429);
  }

  const { action, language: lang, ...data } = body;
  try {
    return json(await answer(action, data, lang, AbortSignal.timeout(DEADLINE_MS)));
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code }, e.status);
    // past the deadline (ours, or a try's own timeout)
    if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) {
      console.warn('[nura-plan] too slow:', action);
      return json({ error: 'slow' }, 504);
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error('[nura-plan] model error', e.status, e.message);
      return json({ error: 'model' }, 502);
    }
    console.error('[nura-plan]', e);
    return json({ error: 'server' }, 500);
  }
});
