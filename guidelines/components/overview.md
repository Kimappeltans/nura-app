# Components

The parts every screen is built from. The reference for how each one looks is
`../nura-design/nura-journey-blend-v5.html`. Resist adding a new visual weight — if a
screen needs more, it needs a More options sheet, not another button style.

## Buttons

| Kind | Looks like | Where |
|---|---|---|
| **The one action** | Coral circle, 108–124px, "Begin" / "Next" in 600 | Focus, Done. One per screen. |
| **Begin on a card** | Dark circle (`--ink-nu`), 70px | The front card on Home (already coral) |
| **Sheet action** | Full-width coral pill, 58px, "Begin · 15 min" | Bottom of the More options sheet |
| **Round controls** | 58px circles: light (`--layer`) for Stop, dark (`--ink-nu`) for Done, coral 84px for Pause | In session |
| **Text link** | 14–15px, 600, `--accent-nu` (the ink) | "More options", "Calendar ›", "+ a thought just arrived" |
| **Exit** | Top left: "← Everything", "← Back to Nu", or a ⌄ in a 40px circle | Every mode and pushed screen |

No gradient fills, no warm shadows under buttons.

## Tab bar

A flat pill (`--card-2`, hairline) with three labelled tabs — Home, Your
Tasks, Calendar — and a separate dark circle for Tell Nu (+): ink (`--ink-nu`)
by day, a lifted navy with a hairline at night. Not indigo. The active tab
is a soft coral pill (`rgba(255,107,53,.14)`) with its icon in `--warm`. It is
on the rooms and anything opened from them (Settings, Night); never
on a mode.

## In-progress pill

When a session runs and you leave it (⌄), a 62px pill sits just above the tab
bar in every room: Ra resting inside a coral progress ring, the task, "08:20
left", and a coral pause circle. Tap it to go back.

## Home: the stack

Today as stacked cards. The ones behind are in their label's colour, blended
soft so they sit with the coral and the ground: 30% of the label colour into
the cream by day, 20% into the navy at night (`labelTint` in
`src/components/TodayStack.tsx`) — never the raw label colour. The front card is coral:
"Nu found this one", the title at 23–26px, one line of facts under it
(Fits before 7:30 PM · High priority), Begin (dark circle), minutes at 58px. Nu (nu-hold) sits on the front card's corner. Above the stack: NU IS HOLDING · N.

## Home: the guide

One first-run guide, the same on the phone's Home and the desktop's (Kim,
28 September). Show first, then do: one step at full size, the others as a
quiet row above it (five marks, done ones a coral tick, the one showing
ringed, "2 of 5", Hide on the right; tap a mark still to do to see it). Each
step is a card: the character (Nu in his glow, Ra in the sun's), the step,
what it shows, one ink button. No step has a "mark done": each ticks itself
off from what you really did, and a ticked step stays ticked.

| Step | Shows | Does | Done when |
|---|---|---|---|
| **Put it all down** (nu-listen) | Examples you can tap, You say / Nu reads (the app's parser: dates, times, minutes, the pieces) | Tell Nu, with the example tapped (nothing goes in until you add it) | A task of your own, in any state |
| **Start your next move** (ra-hello) | The planner's pick, the same as Home's move | Begin · 5 minutes (on Today, the timer) | A session started |
| **Plan something bigger** (nu-ask) | "launch my website", and a small example path with the first move marked | Plan it with Nu (with the goal if tapped) | A project |
| **Change the day** (ra-sun) | Not now and Something changed, as on the move (the phone: More options, Something else, as on Focus) | Nothing extra: "On your next move." / "On Focus, under More options." | Either used once |
| **See what Nura learns** (nu-hello) | One row as the screen has it | What Nura has learned | Opened once |

All five done, or Hide, and it's gone for good. Never for someone who was
here before (a done task or a session older than when it was first offered),
nor for someone who put away Start here or Getting started, the two guides
it replaced. Not at night. `?guide=again` on the web starts it over,
counting only from then on. Phone: under the day's arc (the stack under it
once there's a move). Desktop: with nothing held it is the main card under
the arc, the step on one side and what it shows on the other; with a move in
front, a small card beside it. Logic: `src/guide.ts`; the card:
`src/components/Guide.tsx`.

## The day's path

The sun's path from the start of the day (Settings → Day starts, 7:00 by
default) to when it ends (the Day ends setting): solid while the day runs,
dotted below the horizon either side.
Ra rides it at the current time. Under it: 7:00 Start · N done · 11:45 Day
ends. The path is on Home only, on the phone and the desktop alike. After
the day ends, Ra sits down at the horizon (ra-rest).

**The marks on it** (Kim, 28 September; rules in `src/arcMarks.ts`, drawn by
`src/components/ArcMarks.tsx`). The path keeps its shape: it is the sun's
path, never a chart. What's on it:

| Mark | What it is | Tapped |
|---|---|---|
| Coral dot | Something finished, where it was finished | The day in the Calendar |
| Open ring | A task with a set time, still to come | Opens the task |
| Small dark mark | A calendar event | The day in the Calendar |
| A count | Marks within 20 px of each other, as one | The day in the Calendar |
| Coral ring at Ra, and the one name | Your next move, pinned at now whether or not it has a time | Start |

Only the next move is named, under the arc towards the middle of the day
(one line on the phone; left out where there's no room). Everything else
says what it is under the pointer on the desktop, and to a screen reader.
No other titles on the arc: the Calendar does detail.

## Your Tasks: the water

Everything sinks, one thing rises (`../nura-design/nura-journey-blend-v6.html`,
option C). The two-tone title ("Your Tasks / 1 now, 8 held."), a search
button top right, then the one Nu found above the water — Home's front card a
size down, the only thing here you can Begin. Then the surface: the story's
wave, with Nu floating on it. Underwater, everything else, deeper the later it
is: HABITS (with + New habit), TODAY (with Sort ›), THIS WEEK, PROJECTS,
SOMEDAY — each depth fainter. Habits come first: they come round every day, so
they sit at today's depth. The water is `--subtle` by day and `--layer` (navy)
at night. Rows are the task row below; a habit's row is the same, with the
repeat glyph and, on the right, a coral tick when it's done today (tap to take
it back) or how many times it has happened ("12 times", "New"; paused ones sit
last, fainter, saying Paused). No streaks, no week that empties.

## Focus and More options

Focus: exit, the two-tone title (task / ≈ 15 min), Nu handing the task to Ra
along a dotted line over the rising sun (`Sun`, halved on the horizon), the coral Begin circle, and
"More options". The sheet holds the knobs (Length, Energy — black dials with
a coral dot), Break it down, Remind me, Waiting on someone, and "Begin · N
min".

## The timer ring

60 ticks around a light disc (hairline edge); ticks behind you are coral and
longer. Ra (resting) walks the ring at the current point. In the middle the
time left in dot-matrix numbers, leading zeros muted, and "of 15 min". Below:
Stop · Pause · Done, "Stop here, it still counts", "+ a thought just arrived".

## Done

A soft ground: warm white at the top into a light orange at the bottom
(`doneGround`, the one gradient), the dotted sun in pale orange. The reward
moment just before it (+N light, a rank-up) sits on the same ground with dark
text. ← Back to Nu top left, "You did it / together." (two-tone),
what and how long, Ra holding up a tiny pebble (the moving clip, below) over a
glowing sun (`Sun`) with Nu beside it, then the Next circle and the next task.

## Calendar: a month of suns

The third room (it replaced Your Day, which repeated Home). The two-tone
title (September / 2026) with two arrow circles, then circles for days. A day with things done is a coral wash with a coral sun
inside: one done is already a clear sun (26px of the 40px day), and it grows
until five or more fill the day. A quiet day and a future day are the same
empty ring. Today has an
ink ring; ink dots under a day mean calendar events. Under the month,
the picked day as "Your flow" rows; for today, what Nu and Ra noticed
(Suggestions); for today and before, "Add something you did ›". When the day
ends is set in Settings → Day ends.

## Tell Nu

Full screen, in the room's light. Typing and voice together: the keyboard is up
and the headline is what you type ("Type it, or say it."); the mic at the
bottom left listens, and what's heard joins the headline, with your voice as a
grid of dots and Nu listening. Chips for what Nu understood (Tomorrow · 6:00
PM, People, 10 min, + Details). Bottom row: mic · ✓ (add, a dark circle —
near-white at night) · × (close).

## Characters

Nu and Ra only, from `assets/story/` and `assets/characters/` (see POSES in
`src/ui.tsx`). Which pose where:

| Moment | Nu | Ra |
|---|---|---|
| Home, the stack | nu-hold (hugging a stack of cards) on the front card | ra-hello on the path |
| Tell Nu | nu-listen | — |
| Focus | nu-hello handing over | ra-hello |
| In session, the pill | — | ra-rest |
| Done | nu-hello | ra-pebble (moving) |
| Night | nu-rest (lying down) | ra-rest at the horizon |

Nu keeps his pale glow (`NuGlow`); Ra stands in the sun's light. No drop shadows on characters.

Big enough to read on the smallest phone: 42pt inside a 46pt circle (the
corner tiles), 66pt on the path and on the water, 70pt on the front card,
34pt in the pill; the scenes (Focus, Done, Tell Nu, Night) 84pt and up.

On a short phone (under 740pt tall, an SE) Home tightens so Begin stays on
screen: a 30pt greeting, a lower path, one card behind the front one.

**Moving characters** (`src/components/Moving.tsx`) are real clips from the
Midjourney sources, cut out of their background, saved as animated WebP (360px,
12 fps, under 1 MB) and shown with expo-image. A clip plays once when its moment
arrives and rests on its last pose — never a loop; one per screen, only where
the character is big enough for the motion to read (not on the path, the pill
or the ring). With Reduce Motion on, only the last pose. No glowing water or
sparkling clips (rule 1). Now: Done (Ra holding up a pebble).

## Rows, chips, labels, icons

- **The task row** (`src/components/HeldRow.tsx`): label glyph in a circle ·
  title · one value on the right — its time if it has one today, else how long
  it takes, else its day — large, with a small unit. The same everywhere a task
  is listed; it sits on a card (Home's stack, Night) or bare (Your Tasks).
- **Rows** ("Your flow"): time (13px, `--sub`) · title · a 10px dot — coral
  filled when done (title struck through, `--sub`), coral ring when not yet (12px),
  ink for a calendar event.
- **Chips**: pill, `--card`, hairline, 13px ink with a line icon.
- **Label glyphs** (`src/components/LabelIcon.tsx`) sit in a 32px circle on
  `--glyph-bg`, stroked in the label's colour for that light.
- **Icons**: line icons, 1.7–1.8 stroke, round caps, `currentColor`. Tab
  icons are the ones in `TabBar.tsx`.

## The desktop (a web window wider than 900)

Code: `src/components/Desk.tsx` (the frame) and `src/desk/` (the rooms).
Reference: the redesign preview of 27 September.

- **Sidebar:** the wordmark, Home, Tasks, Calendar; your account at the
  foot (your picture, name and email; "Not signed in" with Sign in when
  there's no account), the running-session pill above it. Where you are is a
  soft fill. Under 1180 wide it's the icons only, so the room keeps the width.
- **Header:** each room's name, what belongs beside it (the date, search,
  the calendar's arrows and Week / Month), and Tell Nu on the right as a
  field with a mic. As you type, Nu shows what it read under the field, each
  part named (Task, When, How long, Kind; several things; or a goal it will
  plan); Enter adds it. ⌘K goes to the field, N opens Tell Nu anywhere. In a
  narrow room the name and Tell Nu keep the first row, the rest goes under.
- **Home (Kim, 28 September): what Nura figured out, not a dashboard.** Tell
  Nu across the top ("Tell Nu what's going on…"), then, as on the phone,
  the greeting centred over the sun's arc with Ra on it (Start, how many
  done, Day ends). Under it the one thing at full size: **Your next move** (what you put first on Today, else the planner's
  first), about how long it will really take you, up to three of the
  planner's facts as quiet chips (a day, a priority, a project first; "Fits
  before" last), and Start, Not now (passed on for today, the next one comes
  up) and Something changed (bigger than I thought, stuck or waiting, not
  today, already done, not needed). Under it **After that**: the next three,
  Today's first. Beside it **Your day**: the time you really have left
  (around your events), what Today holds, and what Nu suggests changing, one
  at a time with Yes and Undo. **The guide** (Home: the guide, above):
  with nothing held it is the main card, under the arc where the move will
  be (the arc keeps its place in every state); with a move in front it is
  a small card beside it. After the day's end: Nu resting, and what
  tomorrow starts with. The clock, the counts and the week are the
  Calendar's now; the sun's glow still rises behind the room (Mica).
- **Tasks:** Nu on the surface of the water, Today / This week / Someday as
  one list under it, habits and projects beside it (under it when narrow).
  With nothing on Today, Nu's pick sits there with Add to Today. A task's
  moves and a bin show under the pointer; J K pick, X ticks, T W S send,
  Delete deletes (with Undo).
- **Swipe (every task list, phone and desktop):** right for Done, left for
  the other two places and Delete; a long swipe does the outermost. A
  finger, a mouse drag, or two fingers on a trackpad. The first row peeks
  open once to show it (`src/components/SwipeRow.tsx`).
- **Calendar:** the week as hours (from Day starts to Day ends) or the month;
  the picked day beside it (under it in a narrow room) with a small month,
  what's on it, and a line to add a task (a day to come) or log what you did
  (today or a day gone by). A task sits on one day in every room
  (`calendarDay` in `src/desk/kit.tsx`): done, the day it was done, ticked
  and struck through; on Today, today; else its date.
- **The opening, onboarding and the sign-in** have the whole window from 600
  up: the opening's sea runs edge to edge with the story on a stage in the
  middle; each step and the sign-in sit in the middle of the window, back
  and the progress at the top, the main button right under the step (not
  pinned to the foot, where a phone's thumb is).
- Every surface uses the room's palette, so all of it works in Light, Dark
  and By the sun. Cards are a fill and a hairline, with a soft lift on cream.
