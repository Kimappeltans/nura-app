// Nura's coach — a Supabase Edge Function that calls Claude for the learning
// loop (src/learn, src/coach.ts). Same shape as nura-plan: the app never
// holds a model key; this function holds ANTHROPIC_API_KEY as a Supabase
// secret. Deploy and setup steps are in supabase/README.md.
//
// Every job goes to the cheapest thing that can do it; the phone does most
// of it before anything reaches here (src/coach.ts):
//   read            one typed/spoken sentence the phone wasn't sure about
//                   → StateRead. Haiku 4.5.
//   suggest         numbers-only behaviour summary + today's open tasks +
//                   working notes → ≤ 3 suggestions. Haiku 4.5.
//   reflect_submit  weekly: last notes + 7-day summary + which suggestion
//                   kinds helped → queued as a Message Batch (half price;
//                   can take hours). Sonnet 5. Returns the batch id.
//   reflect_collect the batch id → the new notes, or { pending: true }.
//
// What arrives is only ever a compact summary the phone computed, the
// titles of today's open tasks, and the person's working notes — never the
// raw event log. Nothing is stored here; only a per-key daily count is.
//
// Every request is size-checked, every answer is schema-checked before it
// leaves (a bad shape is an error, never half an answer), and there are
// daily limits, because the anon key ships inside the app.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { ACTIONS, KINDS, SCHEMAS, SYSTEM, userMessage, type Job } from './prompt.ts';

type Effort = 'low' | 'medium' | 'high';

/** Haiku 4.5 takes neither adaptive thinking nor `effort`; everything newer
 *  gets adaptive thinking at the configured effort. */
const thinks = (model: string) => !/^claude-haiku-/.test(model);

/** Per job: which model, how hard it thinks (when it can), and how long it
 *  may answer — short, because the answers are small JSON. */
const JOBS: Record<Job, { model: string; effort: Effort; maxTokens: number; thinkingMaxTokens: number }> = {
  read: {
    model: Deno.env.get('NURA_READ_MODEL') ?? 'claude-haiku-4-5-20251001',
    effort: 'low', maxTokens: 400, thinkingMaxTokens: 2000,
  },
  suggest: {
    model: Deno.env.get('NURA_COACH_MODEL') ?? 'claude-haiku-4-5-20251001',
    effort: (Deno.env.get('NURA_COACH_EFFORT') ?? 'low') as Effort, maxTokens: 900, thinkingMaxTokens: 3000,
  },
  reflect: {
    model: Deno.env.get('NURA_REFLECT_MODEL') ?? 'claude-sonnet-5',
    effort: (Deno.env.get('NURA_REFLECT_EFFORT') ?? 'medium') as Effort, maxTokens: 1000, thinkingMaxTokens: 4000,
  },
};
/** `off` sends the weekly reflection as a normal call instead of a batch. */
const REFLECT_BATCH = (Deno.env.get('NURA_REFLECT_BATCH') ?? 'on') !== 'off';

// suggest and reflect_submit share the planner's daily counters (same keys
// as nura-plan). nura_ai_hit() can only add 1, so a read can't count as a
// fraction of a call; instead reads (and batch collects, which cost no
// tokens) get their own counter with a higher cap, so they never eat into
// planning.
const PER_PERSON_PER_DAY = Number(Deno.env.get('NURA_DAILY_LIMIT') ?? 80);
const PER_IP_PER_DAY = Number(Deno.env.get('NURA_IP_DAILY_LIMIT') ?? 300);
const READS_PER_PERSON_PER_DAY = Number(Deno.env.get('NURA_READ_DAILY_LIMIT') ?? 200);
const READS_PER_IP_PER_DAY = Number(Deno.env.get('NURA_READ_IP_DAILY_LIMIT') ?? 600);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nura-device',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ---------------- what the app may send ---------------- */

const text = (max: number) => z.string().trim().max(max);
const language = text(40).default('English');

const Request = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read'), text: text(1000).min(1), language }),
  z.object({
    op: z.literal('suggest'),
    language,
    summary: text(4000).min(1),
    notes: text(2000).default(''),
    hour: z.number().int().min(0).max(23),
    tasks: z.array(z.object({
      id: text(60).min(1),
      title: text(200).min(1),
      minutes: z.number().int().min(0).max(10_000).nullable().default(null),
      priority: z.number().int().min(0).max(3).default(0),
    })).max(30),
  }),
  z.object({
    op: z.literal('reflect_submit'),
    language,
    previous: text(2000).default(''),
    summary: text(4000).min(1),
    outcomes: z.array(z.object({
      kind: z.enum(KINDS),
      accepted: z.number().int().min(0).max(10_000),
      dismissed: z.number().int().min(0).max(10_000),
      ignored: z.number().int().min(0).max(10_000).default(0),
    })).max(KINDS.length),
  }),
  z.object({ op: z.literal('reflect_collect'), batch: z.string().regex(/^msgbatch_[A-Za-z0-9]{1,100}$/), language }),
]);
type Body = z.infer<typeof Request>;

/* ---------------- what the model must answer ---------------- */

const line = (max: number) => z.string().trim().min(1).max(max);

const ReadAnswer = z.object({
  kind: z.enum(['task', 'tasks', 'project', 'feeling', 'question']),
  items: z.array(line(300)).max(12),
  load: z.enum(['calm', 'busy', 'overwhelmed', 'low', 'unknown']),
  reply: z.string().trim().max(300),
}).refine(a => a.kind !== 'tasks' || a.items.length >= 2, 'tasks needs at least two items');

const NEEDS_TASK = new Set(['focus', 'shrink', 'plan', 'set_minutes', 'schedule']);
const SuggestItem = z.object({
  kind: z.enum(KINDS),
  text: line(300),
  why: line(300),
  task_id: z.string().trim().max(60),
  action: z.object({
    type: z.enum(ACTIONS),
    minutes: z.number().int().min(0).max(600),
    at_hour: z.number().int().min(-1).max(23),
  }),
  confidence: z.number().min(0).max(1),
  who: z.enum(['nu', 'ra']),
})
  .refine(s => !NEEDS_TASK.has(s.action.type) || s.task_id !== '', 'action needs a task')
  .refine(s => s.action.type !== 'set_minutes' || s.action.minutes > 0, 'set_minutes needs minutes')
  .refine(s => s.action.type !== 'schedule' || s.action.at_hour >= 0, 'schedule needs an hour');
const SuggestAnswer = z.object({ suggestions: z.array(SuggestItem).max(3) });

const ReflectAnswer = z.object({ notes: z.array(line(300)).max(8) });

/* ---------------- plumbing ---------------- */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** The signed-in user's id, if any (see nura-plan: the gateway has already
 *  verified the token; the anon key has no `sub`). */
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
  if (error) { console.warn('[nura-coach] usage limits are off:', error.message); return false; }
  return typeof data === 'number' && data > limit;
}

// A key made outside a workspace has to name one on every request: set
// ANTHROPIC_WORKSPACE_ID (or use a key made inside a workspace instead).
const WORKSPACE = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  ...(WORKSPACE ? { defaultHeaders: { 'anthropic-workspace-id': WORKSPACE } } : {}),
});

class Failure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

/** One request's parameters — the same for a direct call and a batch entry. */
function params(job: Job, data: Record<string, unknown>, lang: string) {
  const { model, effort, maxTokens, thinkingMaxTokens } = JOBS[job];
  const think = thinks(model);
  return {
    model,
    max_tokens: think ? thinkingMaxTokens : maxTokens,
    ...(think ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: {
      ...(think ? { effort } : {}),
      format: { type: 'json_schema' as const, schema: SCHEMAS[job] },
    },
    // Fixed text, marked for caching. It only caches once it's over the
    // model's minimum (Haiku 4.5: 4096 tokens, Sonnet 5: 1024) — these
    // prompts are shorter, so today the marker is a no-op that costs
    // nothing; it pays off if a prompt grows.
    system: [{ type: 'text' as const, text: SYSTEM[job], cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: userMessage(job, data, lang) }],
  };
}

/** The answer's text, or a Failure for a refusal, a cut-off or nothing. */
function answerText(msg: Anthropic.Message): string {
  if (msg.stop_reason === 'refusal') throw new Failure(422, 'declined');
  if (msg.stop_reason === 'max_tokens') throw new Failure(502, 'too_long');
  const out = msg.content.find(b => b.type === 'text');
  if (!out || out.type !== 'text') throw new Failure(502, 'empty');
  return out.text;
}

async function ask(job: Job, data: Record<string, unknown>, lang: string): Promise<string> {
  return answerText(await anthropic.messages.create(params(job, data, lang)));
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: string): T {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Failure(502, 'shape'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Failure(502, 'shape');
  return parsed.data;
}

/** A batch entry's custom_id, derived from the device, so only the device
 *  that queued a reflection can collect it. Nothing is stored. */
async function tagFor(device: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nura-coach:${device}`));
  return `r_${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 40)}`;
}

async function handle(body: Body, device: string) {
  const lang = body.language;
  switch (body.op) {
    case 'read': {
      const a = parse(ReadAnswer, await ask('read', { text: body.text }, lang));
      return { kind: a.kind, items: a.kind === 'tasks' ? a.items : [], load: a.load, reply: a.reply };
    }
    case 'suggest': {
      const { op: _op, language: _l, ...data } = body;
      const a = parse(SuggestAnswer, await ask('suggest', data, lang));
      // An id the model made up, or an hour already gone, is a wrong answer,
      // not a detail to drop.
      const ids = new Set(body.tasks.map(t => t.id));
      if (a.suggestions.some(s => s.task_id !== '' && !ids.has(s.task_id))) throw new Failure(502, 'shape');
      if (a.suggestions.some(s => s.action.type === 'schedule' && s.action.at_hour < body.hour)) throw new Failure(502, 'shape');
      return a;
    }
    case 'reflect_submit': {
      const { op: _op, language: _l, ...data } = body;
      if (REFLECT_BATCH) {
        try {
          const batch = await anthropic.messages.batches.create({
            requests: [{ custom_id: await tagFor(device), params: params('reflect', data, lang) }],
          });
          return { batch: batch.id };
        } catch (e) {
          // Batches are half price but not essential: if the batch API
          // won't take it, answer now at the normal price instead.
          if (e instanceof Anthropic.RateLimitError) throw e;
          console.warn('[nura-coach] batch unavailable, reflecting directly:', e instanceof Anthropic.APIError ? e.status : e);
        }
      }
      return parse(ReflectAnswer, await ask('reflect', data, lang));
    }
    case 'reflect_collect': {
      const batch = await anthropic.messages.batches.retrieve(body.batch);
      if (batch.processing_status !== 'ended') return { pending: true };
      const tag = await tagFor(device);
      for await (const entry of await anthropic.messages.batches.results(body.batch)) {
        if (entry.custom_id !== tag) continue;
        // errored, expired or canceled — or an answer that won't ever pass:
        // it's finished either way, so the app should stop asking (410).
        if (entry.result.type !== 'succeeded') throw new Failure(410, 'batch');
        try {
          return parse(ReflectAnswer, answerText(entry.result.message));
        } catch (e) {
          if (e instanceof Failure) throw new Failure(410, 'batch');
          throw e;
        }
      }
      throw new Failure(404, 'gone');
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: Body;
  try {
    const parsed = Request.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'request' }, 400);
    body = parsed.data;
  } catch { return json({ error: 'request' }, 400); }

  const device = (req.headers.get('x-nura-device') ?? '').slice(0, 64);
  if (!device && (body.op === 'reflect_submit' || body.op === 'reflect_collect')) return json({ error: 'request' }, 400);
  const who = userIdOf(req) ?? `d:${device || 'unknown'}`;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const cheap = body.op === 'read' || body.op === 'reflect_collect';
  const limited = cheap
    ? await over(`read:${who}`, READS_PER_PERSON_PER_DAY) || await over(`read-ip:${ip}`, READS_PER_IP_PER_DAY)
    : await over(who, PER_PERSON_PER_DAY) || await over(`ip:${ip}`, PER_IP_PER_DAY);
  if (limited) return json({ error: 'limit' }, 429);

  try {
    return json(await handle(body, device));
  } catch (e) {
    if (e instanceof Failure) {
      if (e.code === 'shape') console.warn('[nura-coach] answer failed the check:', body.op);
      return json({ error: e.code }, e.status);
    }
    if (e instanceof Anthropic.NotFoundError) return json({ error: 'gone' }, 404);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error('[nura-coach] model error', body.op, e.status, e.message);
      return json({ error: 'model' }, 502);
    }
    console.error('[nura-coach]', body.op, e);
    return json({ error: 'server' }, 500);
  }
});
