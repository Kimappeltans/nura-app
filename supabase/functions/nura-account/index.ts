/**
 * nura-account: delete the signed-in person's account.
 *
 * Only the server can delete an account (it needs the service role key, which
 * never leaves Supabase). The caller proves who they are with their own
 * session token; the function deletes exactly that user and nothing else.
 * Their synced rows (task, habit, habit_log) go with them: every table in
 * schema.sql references auth.users with `on delete cascade`. Whatever is on
 * the phone or in the browser stays there; the app only stops syncing it.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  // the anon key is a valid JWT too, but it isn't a person: only a real session gets past here
  if (error || !user) return reply(401, { error: 'Sign in first.' });

  // the daily AI counts keyed to this account go too (privacy.html promises it)
  const { error: counts } = await admin.from('ai_usage').delete().in('key', [`u:${user.id}`, `read:u:${user.id}`]);
  if (counts) console.error('[nura-account] could not delete usage counts:', counts.message);

  const { error: del } = await admin.auth.admin.deleteUser(user.id);
  if (del) return reply(500, { error: del.message });
  return reply(200, { deleted: true });
});
