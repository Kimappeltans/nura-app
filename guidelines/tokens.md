# Tokens

The CSS block below is the source of truth for the reference board
(`../nura-design/nura-journey-blend-v5.html`) and must match `src/theme.ts`. Change
one, change the other.

```css
:root {
  /* the light: cream ground, Ra's coral */
  --cream: #FAF7F0; --layer: #F3EEE2; --subtle: #EFE9DB; --track: #E8E1D2; --card: #FFFFFF;
  --ink: #171313; --ink-2: #4A4340; --ink-3: #6E6654; --mute: #796E59;   /* darkened 26 and 27 Sep: 4.7:1 on cream */
  --hair: rgba(23,19,19,.08);
  --coral: #FF6B35; --coral-deep: #C2410C; --on-coral: #3B1204;
  /* the water: Nu's navy. No indigo in the interface — links, rings and marks
     are the ink (--accent-nu below); coral is the only colour that acts.
     Nu the character stays blue; label colours are the labels' own. */
  --navy: #0B1029; --navy-2: #111838; --navy-3: #161D42; --navy-4: #1E2652;
  /* dark round controls (Begin on a coral card, Done, Next, the knobs) */
  --ink-nu: #1B1830;
  /* labels — fill on navy / text on cream */
  --people: #FF9BC2 / #BE185D;  --work: #8C97F6 / #4338CA;  --home: #F5D07A / #A16207;
  --money: #C79BF5 / #7E22CE;   --study: #7FC4FF / #0369A1; --health: #7BE495 / #15803D;
  --personal: #5EDCC0 / #0F766E; --errands: #FFB183 / #C2410C;

  --font: 'Inter Tight', system-ui, sans-serif;
  --tight: -0.045em;            /* display tracking */
}

/* A room (Home, Your Tasks, Calendar, Tell Nu) has two lights,
   chosen by Appearance — same variables, different values. */
.room.navy {
  --bg: var(--navy); --text: #F2F4FB; --sub: #929CC5; --mh: #9FA8D0;   /* mh = a headline's second line */
  --line: rgba(170,185,255,.14); --card: var(--navy-3); --card-2: var(--navy-2);
  --glyph-bg: rgba(170,185,255,.09); --pick: rgba(255,255,255,.10); --pick-edge: rgba(255,255,255,.45);
  --accent-nu: var(--text); --warm: #FFB183; --dot-off: var(--navy-4); --pill: var(--navy-4);
}
.room.light {
  --bg: var(--cream); --text: var(--ink); --sub: var(--ink-3); --mh: var(--mute);
  --line: rgba(23,19,19,.08); --card: #FFFFFF; --card-2: var(--layer);
  --glyph-bg: rgba(23,19,19,.06); --pick: rgba(23,19,19,.06); --pick-edge: var(--ink);
  --accent-nu: var(--ink); --warm: var(--coral-deep); --dot-off: var(--track); --pill: var(--ink-nu);
}
```

## Type scale

| Use | Size / line | Weight | Tracking |
|---|---|---|---|
| Display headline (two-tone) | 34–38 / 1.02 | 600 | −0.045em |
| Done headline | 50–64 / 1.02 | 600 | −0.045em |
| Card title (front of the stack) | 23–26 / 1.04 | 600 | −0.045em |
| Row / task title | 15.5–16.5 | 500 | −0.02em |
| Body, buttons | 14–16 | 500–600 | −0.01em |
| Meta, captions | 12–13 | 500 | 0 |
| Section label (NU IS HOLDING · 5) | 11, uppercase | 600 | +1.7px |
| Numbers (15 min, 6:00, 11:45) | 22–84 | 400 | −0.05em, tabular |
| Dot-matrix numbers (timer, night clock) | 5×7 dots, 6–9px pitch | — | — |

## Spacing and radius

4pt scale; screen side padding 24; stacks and grids inset 12.
Radius: chips and pills 999 · day pills 14 · stones 22 · tiles and knobs 24–26
· stacked cards 28 · sheets 30 (top only) · tab bar 31.

## No elevation

There is no shadow scale. Cards are flat fills with a `--line` hairline. The
only shadow in the product is none.
