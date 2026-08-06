# Styles

How the tokens in `tokens.md` compose into the patterns you'll actually
reach for — typography pairing, surface layering, and mode-switching. If
`tokens.md` is the alphabet, this is the grammar.

## Typography pairing

Two families, deliberately not one:

```css
h1, h2, h3, .display  { font-family: var(--font-display); font-weight: 600; letter-spacing: -0.02em; }
.brand, button, .label { font-family: var(--font-brand);   font-weight: 500; }
body, p, li            { font-family: var(--font-body); }
```

**Naming pattern:** `--font-display`/`--font-brand` both resolve to Poppins
at different weights — `display` for headings, `brand` for anything with a
smaller, punchier voice (buttons, labelled chips, section captions).
`--font-body` is the platform system stack.

**Common mistake:** setting Poppins on paragraph-length body text. It reads
fine in a headline and noticeably worse at reading length — this is a hard
rule, not a preference. If a design has more than ~2 lines of Poppins
running text, that's the signal it should be `--font-body` instead.

## Surface layering

Every raised surface gets three things, not one flat fill:

```css
/* CORRECT — layered: fill, hairline, and (sparingly) shadow */
.card {
  background: var(--card);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  /* shadow only if this card is the primary action or a hero surface —
     see tokens.md's elevation frequency note */
}

/* WRONG — flat fill with no hairline reads as a wireframe, not a raised surface */
.card {
  background: var(--card);
  border-radius: var(--radius-lg);
}
```

An accent rule (2px gradient) along a card's top edge marks it as tied to an
action, e.g. the primary CTA's own card, or a card that a completion pays
into:

```css
.card--accent::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--ra-btn-a), var(--ra-btn-b));
}
```

## Mode switching

Mode (`nu` / `ra`) is a data attribute on a root element, set by product
state — never CSS media queries:

```css
/* CORRECT */
[data-mode="ra"] .card { /* --card, --ink etc. already resolve to Ra's values */ }

/* WRONG — ties the product's mode to the OS theme, which is a different axis entirely */
@media (prefers-color-scheme: dark) { .card { background: #161D42; } }
```

If you need a component to render on a fixed mode regardless of the current
product state (e.g. onboarding chrome that's always cream, independent of
whatever mode the rest of the app happens to be in) — set `data-mode="ra"`
directly on that subtree rather than threading a theme prop through every
child.

## Motion

Spring-based, never linear ease for anything with weight behind it. The
`cubic-bezier` values below are the closest CSS approximation of the native
spring physics (RN's `Animated.spring` friction/tension) the product actually
runs on — use them as real `transition`/`animation` timing functions, not
just a reference table.

```css
:root {
  --ease-press: cubic-bezier(0.34, 1.56, 0.64, 1);      /* press-in: friction 7, tension 220 */
  --ease-overshoot: cubic-bezier(0.68, -0.55, 0.27, 1.55); /* checkbox fill: friction 4→6 */
  --ease-pop: cubic-bezier(0.22, 1, 0.36, 1);            /* modal/celebration entrance: friction 6, tension 90 */
}

/* any tappable card/button, on press */
.pressable { transition: transform 120ms var(--ease-press); }
.pressable:active { transform: scale(0.975); }

/* checkbox fill, small confirmations */
.checkbox.checked { animation: overshoot 220ms var(--ease-overshoot); }
@keyframes overshoot {
  0%   { transform: scale(1); }
  60%  { transform: scale(1.18); }
  100% { transform: scale(1); }
}

/* modal / celebration entrance */
.modal-enter { animation: pop-in 320ms var(--ease-pop) both; }
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  /* kill ambient/looping motion; keep state-change transitions above —
     they convey response to input, not ambience */
  .float, .pulse { animation: none !important; }
}
```
