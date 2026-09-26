# Styles

How the tokens compose. If `tokens.md` is the alphabet, this is the grammar.

## Type

One family, Inter Tight. Hierarchy comes from size, weight and a second,
muted line — not from a second font.

**Two-tone headline.** The subject in `--text`, the next line in `--mh`:

```
Good morning.            ← --text, 600
5 things, 2 meetings.    ← --mh, 600
```

Use it for screen titles (Friday / 3 done, 2 to go.), a task on Focus
(title / ≈ 15 min) and Done (You did it / together.). The second line is
information, never decoration.

**Numbers are big, labels are small.** `15` at 58–84px with `min` at 12–14px
beside it; `7:00` over `Start`. Times and counts use tabular figures.

**Dot-matrix numbers** only where time itself is the subject: the session
timer (leading zeros muted) and the night clock.

## Surfaces — flat

```css
/* CORRECT */
.card { background: var(--card); border: 1px solid var(--line); border-radius: 22px; }

/* WRONG — gradient wash, glow, shadow */
.card { background: linear-gradient(...); box-shadow: 0 8px 24px ...; }
```

One coral surface per screen at most (the front card, Begin, or Done's
ground). Everything else is `--card`, `--card-2` or the ground.

## Appearance

Stored as a setting: `sun` (default), `light`, `dark`.

- **By the sun** — rooms use `.light` from the start of the day until the day
  ends (Settings → Day ends), then `.navy`.
- **Light** — rooms always `.light`. **Dark** — rooms always `.navy`.
- Ra's screens (Focus, More options, In session) are cream in all three;
  Done is warm white into light orange (`doneGround`) in all three.

## Motion

Spring-based, never linear for anything with weight. Ra climbs the day's path
and the timer ring continuously; everything else moves only in response to a
touch. Respect reduced motion: no ambient loops.

```css
--ease-press: cubic-bezier(0.34, 1.56, 0.64, 1);   /* press */
--ease-pop:   cubic-bezier(0.22, 1, 0.36, 1);      /* sheets, Done */
```
