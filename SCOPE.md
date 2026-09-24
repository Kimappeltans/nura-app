# Nura — scope

Draft for Kim's approval, 24 September 2026. Built from a full audit of this repo
(every screen, the data model, the pick engine, notifications) and the market
review of the same week. Where this document and the code disagree, the code
is what exists today; this document is what should exist next.

## The job

Nura gets someone from a pile of intentions to **starting one thing**, and
**brings them back after a bad week**.

Capture and organising are becoming free everywhere (Apple Reminders, Todoist
voice capture), so Nura does not compete there. It wins on what happens after
capture: choosing the one task, starting it, and recovering when things slip.
People rarely quit a task app on a good day; they quit after falling behind.
Nura is designed for that day.

## Who it's for

People who struggle with list-based productivity: the capturer who never
starts, the person coming back after a bad week, the one with a full calendar
and uneven energy. These are proto-personas. **No one outside Kim has used the
app yet**, so everything below is a bet until it's tested.

## The core loop

Everything in scope serves this loop. Anything that doesn't is frozen or cut.

| Step | What happens | Today |
|---|---|---|
| **Capture** | Type anything into Nu. It costs nothing and sorts nothing. | Works |
| **Choose** | Say your energy; Ra shows exactly one task that fits. | Works, but the choice doesn't always stick (fix A) |
| **Start** | See the first physical action, pick a length, begin. Stopping early still counts. | Works, but stopping finishes the task (fix B) |
| **Recover** | No overdue state, reminders that back off, where-you-were breadcrumbs, the evening "what did you actually do?" | Built, but partly unreachable (fix C) |

## Keep

The core, unchanged in intent: Nu and Ra as the only navigation · the pick
engine · first physical action · micro-steps (one level) · the focus timer ·
reminders that soften and stop · breadcrumbs · the evening log · no overdue
state, anywhere · light that only rises · the characters and 36 activity
scenes · local-first, no account needed · read-only calendar · the on-device
sentence parser.

## Fix — build now (no Xcode needed)

### A. The one thing has to stay the one thing
1. **Choosing a task in Nu opens that task in Ra.** Today "Begin" pins it for
   today, then Ra re-runs the pick and can show a different task.
2. **"Something else" sticks.** Today the swap lives in screen state, and any
   refresh (answering an estimate, returning from a modal, reopening the app)
   can snap back to the task you just declined.
3. **Priority breaks ties.** It sorts after the creation timestamp, so it
   almost never changes anything. Put it before age within a tier, as the
   design always said.
4. **One source for "why this one".** `whyNow()` re-implements the pick rules
   and can drift; have `pickNow()` return the reason it used.

### B. Starting and stopping
5. **"Stop" ends the session, not the task.** Time spent still counts (light,
   the "it still counts" promise), but the task stays open with a breadcrumb.
   "Done" finishes it. Today both finish it.
6. **Timer copy says what happens.** "Five minutes done" only after a
   five-minute session; drop "Phone quiet" (nothing silences the phone).

### C. Recovery must be reachable
7. **The evening log is reachable in the app**, not only from the 20:00
   notification (which never fires on web, with reminders off, or once the
   ladder has gone quiet).
8. **Any action resets the reminder ladder**: capture, edit, energy, picking
   for today, habit logs. Today only completing and snoozing do, though the
   README promises "any action at all".
9. **Reminders are rescheduled when the app comes to the foreground**, not only
   on cold start, so a quietened day doesn't stay quiet for a week.
10. **Nu shows everything.** Undated tasks beyond the top five are hidden (the
    "Anytime" group is computed but never rendered). Nu's whole promise is
    "everything you're carrying".

### D. Honest copy (the voice rule: say what happens)
11. Settings shows Reminders "On" after the user said no.
12. The Settings footer says "nothing is uploaded" while signed in and syncing.
13. Sign-in claims an account "unlocks the calendar and work-app integrations".
14. Triage "Keep it today" does nothing for inbox tasks.
15. The softened deadline reminder offers "a smaller piece" that doesn't exist.

### E. Small bugs
16. Chat "Edit" opens Compose empty; the parsed draft is lost.
17. "Every weekday" is parsed as daily.
18. The Apple sign-in button shows on web, where it can't work.

## Measure — build now

The next phase has to be decided by data, not guesses. Add these local events
(nothing leaves the phone):

| Event | When | Answers |
|---|---|---|
| `shown` | Ra shows a task (with the rule that picked it) | How often is the one thing started? |
| `swapped` | "Something else" | Which picks get declined, and why? |
| `session_start` / `session_end` | Timer opens / stops, with planned minutes and the estimate at that moment | Estimate vs actual time |
| `resumed` | Coming back to a paused session | Do breadcrumbs bring people back? |
| `acted` | Any action that resets the ladder | Which reminders lead to action? |

The one number that proves the product: **start rate** — of the tasks Ra
shows, how many get started. Add a query for it and for estimate accuracy, and
a way to export the event log for the 14-day review. No dashboard in the app.

## Cut — remove from the app

- **The eight "SOON" integrations** on Connect: Google Calendar, Outlook,
  Asana, Notion, Slack, Jira, Linear, Microsoft To Do. They advertise a work
  hub Nura isn't going to be. Todoist and Apple Health move to the roadmap
  below and leave the UI until they're real.
- **"Give it to someone"** in triage. It only moves the task back to the
  inbox. It returns if real handoff is ever built.
- **Dead code**: `HeroDeck`, the unrendered `ActivityCard` import, unused `ui`
  components, the never-used `nudge` table and task columns, the `expo-blur`
  dependency.

## Freeze — keep working, no new work until the loop is proven

- **Habits** — outside the core loop and half-built (no edit, no un-pause).
- **Tide, Wins, and the two progress ladders** (nine ranks and seven growth
  stages on the same light total). They overlap; revisit after testing.
- **Accounts and sync** — optional and working for email and Google.
  Magic-link sign-in and account deletion get fixed before any public release.

## Later — needs a native build (Xcode)

Each is gated on the 14-day review and 5–10 people using Nura for two weeks.

1. **The one thing everywhere** — lock-screen widget, a Live Activity for the
   timer, Siri via App Intents ("what's my one thing?"). Nura has exactly one
   item to show, so it fits these surfaces better than list apps. First, since
   it also keeps Siri from sending people to Reminders.
2. **On-device AI** (Apple Foundation Models) — a first physical action and
   steps from a vague task, time estimates, one voice ramble into several
   draft tasks. Private and free per use; `assistant.ts` stays as the fast
   path and fallback. Needs an iPhone 15 Pro or later.
3. **Easier switching** — share-sheet capture; import from Todoist and Apple
   Reminders.
4. **Energy from sleep** (Apple Health) — suggest, never set, low energy after
   a short night.
5. **Adaptive picks** — once the measure events have two weeks of data, adjust
   picks and estimates from what was accepted, declined and actually took.

## Not doing

Automatic scheduling · team features, boards, assignees · analytics
dashboards · more game mechanics · overdue states of any kind · Android before
iOS is proven.

## Order

1. **Now:** Fix A–E, Measure, Cut. Test on the web build.
2. **With Xcode:** a development build in the iPhone Simulator; check
   notifications, calendar and sign-in natively; then the widget, Live
   Activity and App Intents.
3. **Test:** 14 days of Kim's own use, then 5–10 people for two weeks. The
   start rate and the event log decide what comes from "Later".
4. **Landing page:** rebuilt around the bad week and the core loop, claiming
   only what the app does.

## Status (24 September)

Built and checked on the web build: fixes 1–18, Measure (events, start rate,
estimate accuracy, "Export activity log" in Settings), and the Google
Calendar / Outlook cut. Added at Kim's request: the session length and the
estimate are chosen with a dial (`src/components/DurationDial.tsx`) instead of
rows of minute chips. Native-only parts (reminders rescheduling on
foreground, the Settings reminder status) still need checking in a
development build.

## Decisions (24 September)

1. **Stop keeps the task open** (fix 5) — agreed.
2. **The SOON integrations** — Google Calendar and Outlook are cut: Nura
   already reads every calendar on the phone, Google and Outlook accounts
   included. The six work apps (Asana, Notion, Slack, Jira, Linear, Microsoft
   To Do) are open; until Kim decides, they and "Give it to someone" stay.
3. **Habits** — agreed: frozen, left working.
4. **The two progress ladders** — agreed: keep both until testing.
