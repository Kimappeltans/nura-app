# Nura — design guidelines

Read this file first — it routes to everything else in this kit. Follow these
as instructions when generating or changing any screen, component or copy,
not as background reading.

**The reference is `../nura-design/nura-journey-blend-v5.html`** — a day with Nu and
Ra, from 7:12 to 11:50 PM, with the By the sun / Light / Dark switch at the
top. Exported screens are in `../nura-design/export/Journey blended v5/`. Your Tasks, which v5 left out, is option C on
`../nura-design/nura-journey-blend-v6.html` ("everything sinks, one thing rises"). When this
file and an older mockup disagree, this file and that board win. Older boards
(`../nura-design/nura-direction-e.html`, `nura-journey.html`, blend v1–v4, the files
in `~/Downloads/Nura directions*`) are history, not reference.

## What Nura is

A task app built around one idea: showing someone their whole list while
they're trying to do one thing is what kills follow-through.

- **Nu** holds everything — the list, capture, the water. Navy at night; its
  links and marks are ink. No indigo in the interface.
- **Ra** is the one thing you're doing — the sun. Coral.

Three **rooms** — Home, Your Tasks, Calendar — each with the tab bar. And
**modes** where you're doing one thing, with no tab bar: Tell Nu (capture),
Focus, More options, In session, Done.

## Ten rules that override anything else in this kit

1. **Clean layouts, warm light.** The layout stays clean: cards are a fill
   and a hairline, no frosted glass. But light is what Nura is about, so the
   sun and its light keep their gradients and glows (Kim, 26 September):
   - the opening's dawn sky, glowing sun, rays and reflection (`Benben.tsx`),
     and the rising sun on "One thing rises" (`OneRises.tsx`);
   - the sun itself: a gradient disc with a halo and rays (`Sun` in
     `src/components/Handoff.tsx`), on Focus and in a session. Never a flat
     or dotted sun;
   - Home's sunrise: the background's coral glow climbs as things get done
     (`Mica` `sunProgress`), and the day's path has dawn under it and a glow
     around Ra;
   - Nu's pale glow (`NuGlow`), the rooms' ambient glows (`Mica`), and Done's
     warm-white-to-light-orange ground (`doneGround`).
2. **Inter Tight, only.** No Poppins anywhere (it was the old app font).
3. **Appearance is By the sun, Light or Dark** (Settings). By the sun is the
   default: Nu's rooms are light while your day runs and navy after it ends.
   Ra's screens (Focus, More options, In session) are always cream; Done is
   warm white into light orange. Never tie colour to the phone's own light/dark setting.
4. **One thing at full size.** The most important object on a screen is the
   biggest thing on it — the front card on Home, Begin on Focus, the timer
   ring in a session.
5. **Simple first, the rest in More options.** A screen shows its one action
   and a way to more. Knobs (length, energy), break it down, remind me,
   waiting on someone live in the More options sheet, not on Focus.
6. **One way out, top left.** Every mode has its exit in the top-left corner
   (← Everything, ⌄, ← Back to Nu). Sheets close with a swipe down or ×.
   Leaving a running session with ⌄ does not stop it — it becomes the
   in-progress pill above the tab bar in every room.
7. **Plain words; the story lives in the pictures.** "3 done, 2 to go", not
   "3 rose". Nu and Ra's roles are shown by what they do on screen, not by
   labels that need decoding. No filler: no subtitles that restate the
   heading, no "why this one" sentences, no corner notes. The one exception is
   the card in front, which carries one quiet line of facts (Fits before
   7:30 PM · High priority, from `factLine` in `src/priority.ts`): facts, at
   most two, never a sentence of reasons. No dashes in copy
   (— or –), in the app or on the site: use a comma, a full stop or a colon.
8. **No number ever goes down.** No streaks, no red, no "you missed". A quiet
   day is a small, empty circle — never a gap, never a warning.
9. **Our characters, our icons, our palette.** Nu and Ra only, in their poses
   (see `components/overview.md`). External references (Behance etc.) are for
   ideas — layout, type, graphic devices — never for their colours, mascots
   or icons.
10. **Every surface in both lights.** Anything in a room must work on cream
    (Light, By the sun by day) and on navy (Dark, By the sun at night), from
    the same tokens.

## Voice

Warm, plain, specific. Never clinical or framed around a diagnosis. Copy says
what happens: "Stop here, it still counts", "Your day is done. Anything now
is extra.", "You did it together."

## Where to look next

| File | Covers |
|---|---|
| `tokens.md` | Every raw value: colours for both lights, type, spacing, radius |
| `styles.md` | How they compose: two-tone headlines, numbers, flat surfaces, appearance |
| `components/overview.md` | The parts: buttons, stack, day's path, timer ring, month of suns, pill, sheets, tab bar, characters |
| `setup.md` | Fonts and build notes |
| `../nura-design/nura-journey-blend-v5.html` | The reference board — open it in a browser |
| `design-system/index.html` | **Out of date** (Poppins, glows). Kept for the old screenshots only. |

## Onboarding and the story

The opening story, onboarding and "What do you need to get done?" follow the
same rules: Inter Tight, flat surfaces, coral only for the one action, the
exit top left, the characters as they are. They are not a separate style.
