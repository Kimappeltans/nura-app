# Supabase

Three things live here:

- **`schema.sql`**: sign-in and sync (tasks, habits). Run once in the SQL Editor.
- **`migrations/`**: changes for a project made before them, pasted into the
  SQL Editor by hand, oldest first. A new project doesn't need them:
  `schema.sql` and `ai-usage.sql` already end in the same state.
- **`migrations/2026-09-27-planner-sync.sql`**: the adaptive planner's
  tables (projects, steps, learned patterns, decision feedback, the day plan)
  so they follow the account. Until it has run, the app syncs tasks and
  habits as before and skips these.
- **`functions/nura-plan`**: Nu's planner. When someone asks Nu to plan a
  project, the app sends the goal (and later the project's compact state) to
  this function, which calls Claude and returns a checked, structured answer.
- **`functions/nura-account`**: deletes the signed-in person's account (Settings,
  Delete account). Their synced rows go with it, and the app clears the device
  they deleted it from, as Log out does.
- **`functions/nura-coach`**: the model half of the learning loop
  (`src/coach.ts`, `src/learn/`): reading a sentence the phone wasn't sure
  about, suggestions for today, and the weekly working notes.

The app never holds a model key. The AI functions hold it as a Supabase secret.

## Which model does what

Every job goes to the cheapest thing that can do it, and the phone goes
first. Most of what Nura does never reaches a model.

| Job | Runs on | Model (secret to change it) | When it's called |
|---|---|---|---|
| Speech to text | the phone (`src/voice.ts`) | none | always, free |
| Quick capture: parse a task | the phone (`src/assistant.ts`) | none | always, free |
| Read a sentence (task / tasks / project / feeling / question, and how you seem) | the phone first; `nura-coach` op `read` only when the phone isn't sure (`localIsSure` in `src/coach.ts`: long run-on sentences, several sentences, a feeling mixed with tasks) | `claude-haiku-4-5-20251001` (`NURA_READ_MODEL`) | offline, over the limit or on any error, the phone's read is used |
| Local suggestions | the phone (`src/learn/`) | none | always, free |
| Model suggestions | `nura-coach` op `suggest` | `claude-haiku-4-5-20251001` (`NURA_COACH_MODEL`) | when the app asks for today's suggestions; any failure is `[]` |
| Weekly working notes | `nura-coach` ops `reflect_submit` then `reflect_collect`, as a Message Batch | `claude-sonnet-5` (`NURA_REFLECT_MODEL`) | at most once every 7 days, with at least 5 active days; collected on a later app open |
| Plan a project (first answer, first path) | `nura-plan` actions `start`, `plan` | `claude-sonnet-5` (`NURA_MODEL`) | when you ask Nu to plan |
| Replan (too big, blocked, done, another look) | `nura-plan` action `replan` | `claude-haiku-4-5-20251001` (`NURA_REPLAN_MODEL`), then once more on `NURA_MODEL` if Haiku's answer fails the check or is refused | when you tap one of those |

Opus is still available for planning by setting `NURA_MODEL=claude-opus-5`
(and then Anthropic's server-side refusal fallback is switched on for it).
The default moved from Opus 5 to Sonnet 5 for cost.

## Deploying

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and an
Anthropic API key.

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>      # the part before .supabase.co
supabase secrets set ANTHROPIC_API_KEY=<your key>
supabase secrets set NURA_AI_ALLOWLIST=<emails or user ids, comma-separated>
supabase secrets set NURA_IP_SALT=<a long random string>   # e.g. openssl rand -hex 32
supabase functions deploy nura-plan --use-api        # --use-api: no Docker needed
supabase functions deploy nura-coach --use-api
supabase functions deploy nura-account --use-api
```

If the planner answers "The planner is having a moment" and Anthropic says the
key "is not scoped to a workspace", the key was made outside a workspace. Either
make a new key inside a workspace in the Anthropic Console and set it again, or
name the workspace (its ID is on the workspace's page in the Console):

```bash
supabase secrets set ANTHROPIC_WORKSPACE_ID=<workspace id>
```

### Sign-in links and emails

**Redirect URLs.** In the Supabase dashboard, Authentication, URL
Configuration, **Redirect URLs** must list every address a link comes back to:

- `nura://**` for the phone app (password resets come back to `nura://reset`,
  sign-in links and confirmations to `nura://`). Without it, a link asked for
  on the phone is sent to the Site URL, the web app, instead.
- every web address the app runs on (your site's `https://…/**`). Keep
  `http://localhost…` out of the live project's list: a local dev server
  belongs on a separate dev project.

Google sign-in, magic links, confirmations and password resets come back to
these; one that isn't listed is sent to the Site URL instead.

**Email templates.** Supabase's own emails link to its `ConfirmationURL`,
which ends in a code that only the device that asked for the email can use
(the app signs in with PKCE, `src/supabase.ts`). Opened anywhere else, the
link uses the email up and signs nobody in: that's what a reset asked for in
the Simulator and opened on a Mac did. So each email carries a code to type
in, and a link with its own token that works on any device where it opens.

In Authentication, Emails, Templates, set the body of these three (the
subject can stay):

**Reset password**

```html
<h2>A new password for Nura</h2>
<p>Enter this code in Nura: <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">set a new password here</a>.</p>
```

**Magic link**

```html
<h2>Sign in to Nura</h2>
<p>Enter this code in Nura: <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">sign in here</a>.</p>
```

**Confirm signup**

```html
<h2>Confirm your email for Nura</h2>
<p>Enter this code in Nura: <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">confirm your email here</a>.</p>
```

`{{ .RedirectTo }}` is where the app asked the link to go (`nura://reset`
from the phone, `https://…/reset` from the web; the Site URL if that isn't a
Redirect URL). The app verifies `token_hash` itself (`verifyLink` in
`src/supabase.ts`, `app/reset.tsx`, `app/_layout.tsx`), so the link needs
nothing from the device that asked. The code goes in on "Check your email"
(`withCode` in `src/useAuthActions.ts`), which takes 6 to 10 digits, so the
Email OTP Length (Authentication, Providers, Email) can stay at its default.
A code and its link are one: using either one uses up the other.

Until the templates are changed, emails still arrive with Supabase's own
link, which works on the device that asked. Opened on another one, the web
app says so ("This link was opened on a different device.") instead of
showing the usual home.

Then paste `ai-usage.sql` into the SQL Editor and run it (running it again
is harmless). It adds the daily limits for both functions, and it is
required: the limits fail closed, so without it (or if the database call
errors) every `nura-plan` and `nura-coach` call is refused with a 503
`limits` and a log line `usage limits unavailable, refusing`. Nothing
reaches Claude uncounted.

### Who can call them

Only a signed-in person. Both functions keep JWT verification on (the
default), but the anon key ships inside the app and passes that check, so
each function also checks the token's claims itself with
`auth.getClaims()` (signature and expiry) and answers 401 unless
`role` is `authenticated`, there is a `sub`, and the account isn't
anonymous. The app sends the session's access token
(`supabase.functions.invoke` does that on its own) and never calls them
signed out. `nura-account` checks the session with `auth.getUser()`.

Until there's billing, AI is only for the accounts in `NURA_AI_ALLOWLIST`
(emails and/or user ids, comma-separated, any case). An email only counts
once that account has confirmed it (the function asks the Auth server), so
signing up with a listed address isn't enough; user ids are the surest.
Anyone else signed in
gets a 403 `ai_access` from `nura-plan` and `nura-coach`, before anything is
counted or sent to Claude. Unset or empty, nobody gets AI. The app says "AI
help isn't open yet" on Plan a project (writing the first move yourself
still works) and quietly uses the phone's own reads and suggestions.

Browsers may only call the functions from `https://app.risewithnura.com`,
`https://nura-app-811.netlify.app`, plus any address in `NURA_DEV_ORIGINS`
(none unless set, e.g. `http://localhost:8081` while developing): only those get an `Access-Control-Allow-Origin`, and it names the page
itself. The phone sends no Origin, so it isn't affected. A request body over
64 KB is refused with a 413 before it's read.

The limits count per account (`u:<user id>`, `read:u:<user id>`), then per
IP (`ip:…`, `read-ip:…`), then for everyone together (`global`,
`read:global`), in that order, so someone over their own limit stops before
they count against everyone's. The IP is `cf-connecting-ip` only;
`x-forwarded-for` is whatever the client put there, so it isn't used, and
without `cf-connecting-ip` only the account limit holds. Each function logs
once per cold start which of `cf-connecting-ip`, `x-forwarded-for` and
`x-real-ip` arrived (names only), to see what the edge really sends. The IP
is stored as an HMAC under `NURA_IP_SALT` (the service role key when that
isn't set), never as itself. The `x-nura-device` header is no longer used
for limits, only to tell a person's devices apart for the weekly batch.

Each Claude call has a 45 s timeout and one retry, and every job must be
back before the app stops waiting: 50 s for planning, suggestions and the
weekly notes, 9 s for a read (the app waits 10), 25 s for a batch collect.
Past that the function answers 504 `slow`.

### Daily limits

`nura_ai_hit()` can only count whole calls, so a cheap call can't count as
a fraction of one. Instead there are two counters:

- **Planning counter**: every `nura-plan` call, plus `nura-coach` `suggest`
  and `reflect_submit`. A replan that is retried on the second model still
  counts once.
- **Read counter**: `nura-coach` `read` and `reflect_collect` (which costs
  no tokens), so capture never eats into planning.

Each counter also has a ceiling for everyone together, a cap on the day's
bill: `NURA_GLOBAL_DAILY_LIMIT` and `NURA_READ_GLOBAL_DAILY_LIMIT`. Over it,
every account gets the same 429 as its own limit until the next day (UTC).

### Secrets

All optional except `ANTHROPIC_API_KEY`, and `NURA_AI_ALLOWLIST` for anyone
to get AI at all.

| Secret | Default | What it does |
|---|---|---|
| `NURA_MODEL` | `claude-sonnet-5` | Planner model: `start`, `plan`, and the replan retry |
| `NURA_EFFORT` | `medium` | Planner thinking effort (`low` / `medium` / `high`); not used on Haiku |
| `NURA_REPLAN_MODEL` | `claude-haiku-4-5-20251001` | First try for replans. Set it to the same as `NURA_MODEL` to turn the routing off |
| `NURA_READ_MODEL` | `claude-haiku-4-5-20251001` | Coach `read` |
| `NURA_COACH_MODEL` | `claude-haiku-4-5-20251001` | Coach `suggest` |
| `NURA_COACH_EFFORT` | `low` | Only used if `NURA_COACH_MODEL` is set to a model that thinks (not Haiku) |
| `NURA_REFLECT_MODEL` | `claude-sonnet-5` | Weekly working notes |
| `NURA_REFLECT_EFFORT` | `medium` | Thinking effort for the weekly notes |
| `NURA_REFLECT_BATCH` | `on` | `off` sends the weekly notes as a normal call (full price, answered at once) |
| `NURA_DAILY_LIMIT` | `80` | Planning counter: calls per account per day |
| `NURA_IP_DAILY_LIMIT` | `300` | Planning counter: calls per IP address per day |
| `NURA_READ_DAILY_LIMIT` | `200` | Read counter: calls per account per day |
| `NURA_READ_IP_DAILY_LIMIT` | `600` | Read counter: calls per IP address per day |
| `NURA_GLOBAL_DAILY_LIMIT` | `3000` | Planning counter: calls per day for everyone together |
| `NURA_READ_GLOBAL_DAILY_LIMIT` | `6000` | Read counter: calls per day for everyone together |
| `NURA_AI_ALLOWLIST` | none: nobody | Who may use AI: emails and/or user ids, comma-separated. Everyone else gets a 403 `ai_access` |
| `NURA_DEV_ORIGINS` | none | Extra web addresses allowed to call the functions from a browser, comma-separated (a local dev server) |
| `NURA_IP_SALT` | the service role key | The key the IP address is hashed with (HMAC-SHA-256) before it's counted |

Haiku 4.5 doesn't take adaptive thinking or `effort`, so both functions
leave them out for any `claude-haiku-*` model and use short answers
instead. Every other model gets adaptive thinking at the effort above.

## What each call sends

Nothing leaves the phone until the person has said yes to AI help, once:
the app asks the first time it matters (Find my first move on Plan a
project, or the first sentence in Tell Nu the phone isn't sure about), and
Settings, Language and voice, AI help turns it on or off (`src/ai.ts`, flag
`ai.ok`). Without it, reads are the phone's own, suggestions are the
phone's own, no weekly notes are queued, and the planner offers to write
the first move by hand.

Nothing is stored on the server: no goals, notes or titles, only a count per
key per day (`ai-usage.sql`). What leaves the phone:

- **`nura-plan`**: the goal, your answers to Nu's question, and for replans
  the project's compact state (steps, notes, the last few events).
- **`nura-coach` `read`**: the one sentence the phone wasn't sure about.
  Speech is turned into text on the phone; audio never leaves it.
- **`nura-coach` `suggest`**: a numbers-only summary of how you work
  (computed on the phone), today's open tasks (id, title, minutes,
  priority; at most 30), your working notes, and the local hour.
- **`nura-coach` `reflect_submit`**: your previous working notes, the
  7-day numbers-only summary, and how many suggestions of each kind were
  accepted, dismissed or ignored. `reflect_collect` sends only the batch id.

Never the raw event log, never other task fields.

The weekly batch is tied to the account and device that queued it: its
`custom_id` is a hash of the user id and the device id, and
`reflect_collect` only returns an answer whose `custom_id` matches the
caller's. (A batch queued before this changed no longer matches; the app
drops it and queues the next week's as usual.) Anthropic keeps batch
results for 29 days.

Every system prompt tells the model not to use em or en dashes, and the app
takes out any that come back anyway (`noDashes` in `src/ai.ts`).

## Cost notes

Rough per-call estimates from the prompt sizes, at list prices (Haiku 4.5:
$1 / $5 per million input / output tokens; Sonnet 5: $2 / $10; batches are
half price). They are not measured; check real numbers in the Anthropic
Console under Usage.

| Call | Roughly | Notes |
|---|---|---|
| `read` | ~$0.001 | ~800 tokens in, ~60 out. Only when the phone isn't sure, which should be a small share of captures |
| `suggest` | ~$0.003–0.004 | ~1.5–2k in, ~300 out |
| weekly notes | ~$0.01 a week | Sonnet 5 at batch price, with thinking at `medium`; one per person per week at most |
| replan | ~$0.005 on Haiku | about twice that plus a Sonnet call when it has to retry |
| `start` / `plan` | a few cents | Sonnet 5 with thinking at `medium` |

**Prompt caching.** Every fixed system prompt is marked for caching, but a
prompt only caches once it's over the model's minimum: 4096 tokens on Haiku
4.5, 1024 on Sonnet 5. The planner's prompt is over that on Sonnet 5, so
`start` and `plan` cache it. The coach's prompts, and the planner's on
Haiku for replans, are under it, so they don't cache today; the marker costs
nothing when it doesn't apply. The weekly batch is one request per person,
so caching doesn't help it.

**Refusals.** On Opus or Fable (`NURA_MODEL=claude-opus-5`), the planner
opts into Anthropic's server-side refusal fallback. On Sonnet and Haiku it
doesn't: that fallback's documented targets are Opus-tier models. A refusal
is a 422 there, and for a replan it triggers the retry on `NURA_MODEL`.

## Trying the app without deploying

In a development build, set these flags to `local` and the app uses fixed
stand-ins instead of the functions. They're only for clicking through the
screens and are compiled out of release builds.

- `dev.planner`: `src/planner.ts` → `localPlanner`
- `dev.coach`: `src/coach.ts` → `localCoach` (the phone's own read,
  placeholder suggestions from today's tasks, and placeholder working notes
  that go through the batch submit and collect steps)
