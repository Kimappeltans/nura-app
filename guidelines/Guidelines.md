# Nura — design guidelines

Read this file first — it routes to everything else in this kit. Follow these
as instructions when generating screens or components, not as background
reading.

## What Nura is

A task app built around one idea: showing someone their whole list while
they're trying to do one thing is what kills follow-through. So the product
is two modes, not a list-plus-features:

- **Nu** — capture. Everything you have to do, unsorted, all visible. Nothing
  here is startable.
- **Ra** — focus. Exactly one task, full-screen, nothing else rendered. Not
  even a count of what's left.

Switching between them is the *only* navigation. No tab bar, no sidebar.

## Four rules that override anything else in this kit

1. **Mode ≠ theme.** Nu is navy/indigo, Ra is cream/coral — chosen by which
   task you're doing (capture vs. focus), never by OS light/dark mode. See
   `foundations/modes.md`.
2. **No number ever goes down.** No streaks, no red, no "you missed 3 days."
   A quiet week is a short bar, not a broken chain. If a design shows a metric
   that can decrease, or a failure state in red, it's wrong for this product.
3. **Layered, not flat.** Raised surfaces get a two-stop light wash, a
   hairline on the top edge, and a real shadow — never a single flat fill
   behind a rounded rect. See `styles.md`.
4. **One thing at full size.** The most important object on a screen never
   sits inside a small card with margin around it. If it's the point of the
   screen, it's the biggest thing on it, uncontained.

## Voice

Warm, plain, specific. Never clinical, never framed around a diagnosis or
medical label — the mechanics (gentle nudges, partial sessions that still
count, numbers that only rise) do that work without naming a condition. Copy
says what happens, not how the system works internally — "stop any time — it
still counts," not "session state: partial."

## What to avoid

- Red or amber "fail" states of any kind.
- Streak counters, "day 1 again" resets, or anything that visibly goes
  backward.
- Generic AI-design defaults: warm-cream-plus-serif, purple-to-blue gradient
  hero, `rounded-lg` everywhere with no radius hierarchy, emoji as section
  markers.
- Filling a screen with cards of equal visual weight — one thing should
  always read as the most important object on the page.

## Where to look next

| File | Covers |
|---|---|
| `setup.md` | Build/dependency notes — read before generating code |
| `tokens.md` | Every raw value: hex codes, spacing scale, radius scale |
| `styles.md` | How tokens are applied — color roles, type pairing, elevation |
| `components/overview.md` | Button, card, checkbox, icon patterns |
