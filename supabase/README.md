# Supabase

Two things live here:

- **`schema.sql`**: sign-in and sync (tasks, habits). Run once in the SQL Editor.
- **`functions/nura-plan`**: Nu's planner. When someone asks Nu to plan a
  project, the app sends the goal (and later the project's compact state) to
  this function, which calls Claude and returns a checked, structured answer.
  The app never holds a model key.

## Deploying the planner

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and an
Anthropic API key.

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>      # the part before .supabase.co
supabase secrets set ANTHROPIC_API_KEY=<your key>
supabase functions deploy nura-plan
```

Then paste `ai-usage.sql` into the SQL Editor and run it. It adds the daily
limits: by default 80 calls a day per device (or signed-in account) and 300
per IP address. Without it the function still works, with no limits.

Optional secrets:

| Secret | Default | What it does |
|---|---|---|
| `NURA_MODEL` | `claude-opus-5` | The Claude model |
| `NURA_EFFORT` | `medium` | `low` answers faster; `high` thinks longer |
| `NURA_DAILY_LIMIT` | `80` | Calls per device or account per day |
| `NURA_IP_DAILY_LIMIT` | `300` | Calls per IP address per day |

The function keeps JWT verification on (the default). The app calls it with
the anon key when signed out, or the session when signed in.

## Trying the app without deploying

In a development build, set the flag `dev.planner` to `local` and the app
uses a stand-in planner (`src/planner.ts` → `localPlanner`) that returns fixed
wording. It is only for clicking through the screens and is compiled out of
release builds.
