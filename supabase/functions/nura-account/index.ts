/**
 * nura-account: delete the signed-in person's account.
 *
 * Only the server can delete an account (it needs the service role key, which
 * never leaves Supabase). The caller proves who they are with their own
 * session token; the function deletes exactly that user and nothing else.
 * Their synced rows (task, habit, habit_log) go with them: every table in
 * schema.sql references auth.users with `on delete cascade`. The app then
 * clears the device it was deleted from (src/account.ts); other devices keep
 * what they hold until they log out.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

/** Browsers may call from these pages only; the phone sends no Origin at all. */
const ORIGINS = new Set([
  'https://app.risewithnura.com',
  'https://nura-app-811.netlify.app',
  'http://localhost:8081',
  'http://localhost:8120',
]);
/** Nothing this function takes needs more (it reads no body at all). */
const MAX_BODY = 64 * 1024;

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get('Origin');
  if (origin && ORIGINS.has(origin)) res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res;
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(413, { error: 'request' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  // the anon key is a valid JWT too, but it isn't a person: only a real session gets past here
  if (error || !user) return reply(401, { error: 'Sign in first.' });

  // the daily AI counts keyed to this account go too (privacy.html promises it)
  const { error: counts } = await admin.from('ai_usage').delete().in('key', [`u:${user.id}`, `read:u:${user.id}`]);
  if (counts) console.error('[nura-account] could not delete usage counts:', counts.message);

  const { error: del } = await admin.auth.admin.deleteUser(user.id);
  if (del) {
    // the detail is for the log, not the caller
    console.error('[nura-account] could not delete the account:', del.message);
    return reply(500, { error: 'server' });
  }
  return reply(200, { deleted: true });
}

Deno.serve(async req => withCors(req, await serve(req)));
