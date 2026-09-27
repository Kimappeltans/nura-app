# Learning how you work

Nura gets better at helping you without training a model on you. There are four parts:

**Capture** (`signals.ts`). Nothing new gets logged. The profile is counted from what the app already records: focus sessions (`session_start` / `session_end` in the event table), completions, "not now"s and swaps, when tasks were captured and finished, and how project steps ended (done, too big or blocked). From those it works out when you usually finish things, how your estimates compare with the time things really take, how long a session usually lasts, which labels get put off, and how many days it has been since you last used the app. It looks back six weeks and caches the result for three hours. Until there are five days of history it doesn't guess at patterns.

**Suggest** (`suggest.ts`). A few plain rules run over the profile and what's open right now:
- a good hour for a task
- shrinking a task that keeps getting moved
- a more honest estimate
- one small thing after time away
- planning a task that's really a project
- stopping for the day
- doing small admin tasks in one sitting

Every suggestion says what it's based on, with the real numbers. None of them says "overdue", counts a streak or brings up what didn't get done.

**Learn** (`feedback.ts`). Each suggestion shown is logged in `suggestion_log`, along with what happened to it: taken, waved away, or left alone. Each kind of suggestion has an acceptance rate that starts at 50/50. Older answers count for less (half-life three weeks), so the kinds that help you rise and the ones you dismiss fade, but never to zero. A suggestion you dismiss stays away for a week. One you take rests for a day.

**Rank** (`useSuggestions.ts`). Suggestions are ordered by how sure the rule is × how often that kind has helped you. A screen shows the top one or two, never two about the same task and never two of the same kind.

## What stays on the phone

Everything above. The only thing from here meant for the model (`src/coach.ts` makes that call) is `profileSummary()`: a few factual sentences with counts, rates, hours of the day and the eight fixed label names. It never contains a task title, a note or anything you typed. The event log, the task list and `suggestion_log` are never sent or synced.
