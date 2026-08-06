# Tokens

This kit has no published npm package or connected Figma library, so there's
no separate "compiled stylesheet" to point Make at — the CSS block below
*is* the source of truth. Copy it in directly. Everything after it is usage
guidance: which token to reach for, and why.

```css
[data-mode="nu"] {
  --base: #0B1029; --layer: #111838; --card: #161D42; --subtle: #1D2551;
  --ink: #F2F4FB; --ink-2: #B7BFDB; --ink-3: #949DC0;
  --stroke: rgba(170,185,255,0.14); --stroke-strong: rgba(170,185,255,0.26);
  --nu: #8C97F6; --ra: #FF8A5C; --ra-deep: #FFA05C;
  --ra-btn-a: #FF6B35; --ra-btn-b: #FFA05C; --on-ra: #3B1204; --track: #1E2652;
}
[data-mode="ra"] {
  --base: #FAF7F0; --layer: #F3EEE2; --card: #FFFFFF; --subtle: #EFE9DB;
  --ink: #171313; --ink-2: #413A37; --ink-3: #6B6350;
  --stroke: rgba(23,19,19,0.10); --stroke-strong: rgba(23,19,19,0.18);
  --nu: #4338CA; --ra: #FF6B35; --ra-deep: #C2410C;
  --ra-btn-a: #FF6B35; --ra-btn-b: #FFA05C; --on-ra: #3B1204; --track: #E8E1D2;
}
:root {
  --font-display: 'Poppins', system-ui, sans-serif;   /* 600 */
  --font-brand: 'Poppins', system-ui, sans-serif;      /* 500 */
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --size-display: 34px; --size-title: 21px; --size-body: 16.5px;
  --size-body-sm: 15px; --size-meta: 12.5px; --size-label: 12px;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;
  --radius-sm: 6px; --radius-md: 12px; --radius-lg: 18px;
  --radius-xl: 26px; --radius-pill: 999px;
  --shadow-e2: 0 1px 3px rgba(0,0,0,.16); --shadow-e4: 0 4px 10px rgba(0,0,0,.20);
  --shadow-e8: 0 8px 18px rgba(0,0,0,.26); --shadow-e16: 0 12px 28px rgba(0,0,0,.32);
  --shadow-warm: 0 8px 20px rgba(255,107,53,.38);
}
```

## Design philosophy

Nura's palette is almost entirely neutral (`--base` / `--card` / `--ink*`) —
the accent (`--ra`, the coral) is used sparingly, only for the primary
action, active/selected states, and small highlights. If more than one
element per screen is drawing in full-saturation coral, that's a sign
something is competing with the primary action rather than supporting it.
`--nu` (indigo) is the secondary accent — capture-mode chrome, links, and
anything that needs to read as interactive without claiming the primary slot.

## Naming pattern

`--{category}-{role}`, where category is one of: `base` / `layer` / `card` /
`subtle` (surfaces, light → raised), `ink` (text, numbered by how muted —
no number = darkest/highest-contrast), `stroke` (borders), or a bare accent
name (`nu`, `ra`) for brand color. `--sp-*`, `--radius-*`, `--shadow-*`,
`--size-*` are numbered scales, low → high magnitude.

## Token groups

| Group | Tokens | Frequency | Semantic purpose |
|---|---|---|---|
| Surface | `--base`, `--layer`, `--card`, `--subtle` | Every screen | Ground → raised, in ascending order. `--base` is the screen background; `--card` is what sits on top of it. |
| Text | `--ink`, `--ink-2`, `--ink-3` | Every screen | `--ink` for anything that's the point of the sentence, `--ink-3` for metadata (timestamps, chip labels) — never skip straight to `--ink-3` for primary content. |
| Border | `--stroke`, `--stroke-strong` | Common | `--stroke` for the default 1px card hairline; `--stroke-strong` only for a border that needs to read as a control boundary (inputs, active pills). |
| Accent | `--nu`, `--ra`, `--ra-deep` | Sparse, by design | `--ra` is a fill/stroke color (icons, chip backgrounds). `--ra-deep` is the only accent variant safe as **text** — `--ra` alone fails contrast on the Ra (cream) mode. |
| Spacing | `--sp-1` … `--sp-8` | Every layout | 4pt scale. Gaps between sibling elements are almost always `--sp-4` (16px); use `--sp-2`/`--sp-3` only inside a tight control (a chip, a button's internal padding). |
| Radius | `--radius-sm` … `--radius-pill` | Every surface | Scales with the size of the thing: chip → sm, input/control → md, card → lg, hero → xl, anything pill-shaped → pill. |
| Elevation | `--shadow-e2` … `--shadow-warm` | Rare | Most cards use `--stroke` alone, no shadow. Shadow is reserved for the primary button (`--shadow-warm`) and the hero/celebration surface (`--shadow-e16`). |

## Decision tree

```
"What background color?"
├─ Full screen ground?           → --base
├─ Header/nav bar?                → --layer
├─ A card sitting on the ground? → --card
└─ Pressed/hover state of a row? → --subtle

"What text color?"
├─ The sentence's own subject?    → --ink
├─ A secondary/supporting line?   → --ink-2
└─ Timestamp, chip, meta detail?  → --ink-3

"What accent color?"
├─ Primary button, active state, small highlight? → --ra (fill) / --ra-deep (if it's text)
├─ Secondary interactive element, capture-mode chrome? → --nu
└─ Anything else                  → don't reach for an accent — use ink/stroke
```

## Correct / incorrect usage

```css
/* CORRECT — semantic token, follows the surface scale */
.card { background: var(--card); border: 1px solid var(--stroke); }

/* WRONG — hardcoded hex bypasses mode-switching entirely */
.card { background: #161D42; border: 1px solid rgba(170,185,255,0.14); }
```

```css
/* CORRECT — --ra-deep for coral text, passes contrast in both modes */
.link { color: var(--ra-deep); }

/* WRONG — --ra as text color; fails contrast on the Ra (cream) mode */
.link { color: var(--ra); }
```

```css
/* CORRECT — 4pt scale */
.row { padding: var(--sp-4); gap: var(--sp-3); }

/* WRONG — arbitrary values off the scale */
.row { padding: 14px; gap: 10px; }
```

## Common mistakes

- **Reaching for `--ra` on more than one element per screen.** It's the
  primary-action color specifically because it's rare — a screen with three
  coral buttons has no primary action anymore, it has three.
- **Using `--shadow-*` on an ordinary card.** Elevation is reserved (see
  `Guidelines.md`, rule 3) — a plain `--stroke` border is correct for almost
  every surface.
- **Binding color to `prefers-color-scheme`.** Mode is a product state
  (`[data-mode]`), not a display preference — see `Guidelines.md`, rule 1.
