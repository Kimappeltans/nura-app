# Nura — mobile app (Expo / React Native)

**This is the app. The landing page is a separate project (`nura-site/`) — plain
static HTML with no shared code.**

Local-only: no accounts, no server, no analytics. Nothing leaves the device.

## The architecture — Nu and Ra are modes, not branding

The app is one screen in one of two states, and **the switch between them is the
only navigation there is.** No tab bar.

| | Nu — the water | Ra — the light |
|---|---|---|
| Shows | everything, unsorted | exactly one thing |
| Can you start something? | **No** | Yes, only this |
| Is the list visible? | it's all there is | **it is not rendered** |

Every to-do app shows you the list while you're trying to do one thing. That's the
mechanism that turns "I have 30 tasks" into zero action. In Ra there is no code
path that can display a second task — no count, no "3 remaining", no peeking.

## Run it

```bash
npm install
npx expo start
```

Press `i` for the iOS simulator. **Notifications don't fire in Expo Go** — for
the real thing you need a development build:

```bash
npx expo run:ios          # needs Xcode 26+ (mandatory for App Store since Apr 2026)
```

To get it onto your actual phone, which is the point:

```bash
npm install -g eas-cli
eas build --profile development --platform ios
```

## What's here

| File | What it does |
|---|---|
| `src/db.ts` | SQLite schema, the NOW engine, momentum, the wins/grid queries |
| `src/notifications.ts` | The nudge engine — anchors, deadlines, the 64-slot reconciler |
| `src/theme.ts` | Brand tokens. Violet is reserved for the primary action and anything live |
| `app/index.tsx` | Renders Nu or Ra from the persisted mode |
| `src/screens/Nu.tsx` | Capture, everything, energy. Nothing is startable here |
| `src/screens/Ra.tsx` | One task. Or the breadcrumb, if you were interrupted |
| `app/task/[id].tsx` | Task detail — first action, estimate, due, micro-steps |
| `app/timer.tsx` | The 5-minute contract, with capture-without-leaving |
| `app/retro.tsx` | "What did you actually do?" — backdated logging |
| `app/wins.tsx` | Total, momentum, pixel grid, done-list. Reachable from Nu only |

## v2 features in this build

**The softening ladder** (`src/notifications.ts`). Every reminder app escalates when
ignored; this one de-escalates. Two ignores and it swaps to the shortest task there
is. Three and it drops to ≤2 minutes and changes from a prompt to an offer. Four and
it stops for the day, with one re-entry tomorrow that makes no reference to today.
Any action at all resets it, and the count is never displayed.

**Breadcrumbs** (`dropCrumb` / `latestCrumb`). Backgrounding mid-task writes where
you were. Come back an hour or three days later and Ra shows *"Where you were"*
instead of a task — by the time you return the context is gone, and that is the
whole problem.

**Retro-capture** (`app/retro.tsx`). The evening anchor asks what you *did*, not
what you will do, and backdates it. An ADHD day usually contains real work that
never got logged, which is exactly why it feels empty.

**Capture without leaving the timer.** A thought arrives mid-task; one tap parks it
in Nu and the clock never stops.

## The shape of a task

Capture writes only a title — that's the point, it has to cost nothing. Everything
that makes the NOW engine work gets added later, in the detail sheet:

- **First physical action** — the sentence that collapses the gap between intending
  and starting. It rides in the notification body too.
- **Estimate** — what the energy filter compares against.
- **Due** — the only thing that overrides your energy level.
- **Micro-steps** — one level deep, never two. Completing the last step completes
  the parent, so the big scary thing disappears by attrition.

Edits write through immediately. There is no save button to forget.

"Let it go" sets `state = 'dropped'`. It is never a DELETE — the event log keeps it,
it just stops asking.

## The two constraints worth not breaking

**No overdue state.** There's no overdue column in the schema. Not rendering one
is different from being unable to represent one — this is the latter, and it's
the thing that can't erode as you add features.

**Stopping early logs a win.** `complete(id, partial = true)` still writes a
`completed` event. Time spent is the achievement, not task completion.

## The 64-slot problem

iOS allows only **64 pending scheduled local notifications**. The limit is on
*requests*, not deliveries — a repeating trigger is one request that fires
forever. So the three daily anchors cost 3 slots total, and the remaining ~55 go
to the nearest deadlines.

iOS also won't reliably run code in the background, so the queue can't be topped
up by a background task. `reconcileNudges()` runs on app foreground and on every
task mutation instead. Because the anchors repeat, **the app still nudges you
correctly if you don't open it for a week** — that's the property that makes it
trustworthy, and it's the one thing here worth writing a test for.

## Next

1. Run it. Add three real tasks. Use it as your daily driver.
2. **Then add nothing for fourteen days.** Put feature ideas in Capture.
3. After two weeks, read the `event` table — it will tell you which nudges you
   actually act on, and that's what Phase 2 should be built from.

Phase 2 is in the spec: deadline + follow-through nudges, the momentum
visualisation, the home-screen widget, micro-step breakdown.

## Before submitting

`app.json` already carries the privacy manifest (React Native touches
`UserDefaults`, a required-reason API — without this the upload is rejected) and
`usesNonExemptEncryption: false`. Change `bundleIdentifier` to your own before
building. The rest is in `nura-appstore-checklist.md`.
