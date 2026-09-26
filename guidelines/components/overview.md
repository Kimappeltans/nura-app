# Components

The parts every screen is built from. The reference for how each one looks is
`design/nura-journey-blend-v5.html`. Resist adding a new visual weight — if a
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
"Nu found this one", the title at 23–26px, Begin (dark circle), minutes at
58px. Nu (nu-hold) sits on the front card's corner. Above the stack: NU IS HOLDING · N.

## The day's path

The sun's path from the start of the day (7:00) to when it ends (the Day ends
setting): solid while the day runs, dotted below the horizon either side.
Ra rides it at the current time; coral dots mark where things got done;
ticks under the horizon (`--sub`) are calendar events. Under it: 7:00 Start ·
N done · 11:45 Day ends. The path is on Home only.
After the day ends, Ra sits down at the horizon (ra-rest).

## Your Tasks: the water

Everything sinks, one thing rises (`design/nura-journey-blend-v6.html`,
option C). The two-tone title ("Your Tasks / 1 now, 8 held."), a search
button top right, then the one Nu found above the water — Home's front card a
size down, the only thing here you can Begin. Then the surface: the story's
wave, with Nu floating on it. Underwater, everything else, deeper the later it
is: TODAY (with Sort ›), THIS WEEK, PROJECTS, SOMEDAY — each depth fainter.
The water is `--subtle` by day and `--layer` (navy) at night. Rows are the
task row below.

## Focus and More options

Focus: exit, the two-tone title (task / ≈ 15 min), Nu handing the task to Ra
along a dotted line over a sun made of dots, the coral Begin circle, and
"More options". The sheet holds the knobs (Length, Energy — black dials with
a coral dot), Break it down, Remind me, Waiting on someone, and "Begin · N
min".

## The timer ring

60 ticks around a light disc (hairline edge); ticks behind you are coral and
longer. Ra (resting) walks the ring at the current point. In the middle the
time left in dot-matrix numbers, leading zeros muted, and "of 15 min". Below:
Stop · Pause · Done, "Stop here — it still counts", "+ a thought just arrived".

## Done

A soft ground: warm white at the top into a light orange at the bottom
(`doneGround`, the one gradient), the dotted sun in pale orange. The reward
moment just before it (+N light, a rank-up) sits on the same ground with dark
text. ← Back to Nu top left, "You did it / together." (two-tone),
what and how long, Ra holding up a tiny pebble (the moving clip, below) over a
cream sun made of dots with Nu beside it, then the Next circle and the next task.

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

No glow, halo or drop shadow on a character.

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
