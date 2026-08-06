# Components

Real, copy-pasteable patterns for the small set of primitives Nura's whole
UI is built from. Three tiers of button, one card family, one checkbox, one
icon style — resist adding a fourth visual weight of anything; the small
vocabulary is the point.

## Buttons — three tiers, never a fourth

```css
/* Primary — one per screen, max */
.btn-primary {
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--radius-pill);
  font-family: var(--font-display); font-weight: 600;
  background: linear-gradient(135deg, var(--ra-btn-a), var(--ra-btn-b));
  color: var(--on-ra);
  box-shadow: var(--shadow-warm);
  transition: transform 120ms;
}
.btn-primary:active { transform: scale(0.975); }

/* Ghost — secondary action */
.btn-ghost {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--stroke-strong);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--font-brand);
}

/* Everything else is a plain text link or a pill chip — see below.
   There is no third button style; if a screen needs a third weight of
   affordance, that's a sign it needs a menu or a sheet instead. */
```

**Decision tree:**
```
"What kind of button?"
├─ The one thing this screen wants you to do → .btn-primary
├─ A real alternative action, not just "cancel" → .btn-ghost
└─ Anything lower-stakes (dismiss, "skip", "later") → plain <a>/<button>, text only, var(--ink-3)
```

## Cards

```css
.card {
  background: var(--card);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
}

/* Hero variant — the one big object the screen is about. Bigger radius,
   real elevation, and it does NOT get a smaller sibling of equal weight
   next to it (rule 4 in Guidelines.md). */
.card--hero {
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-e16);
  padding: var(--sp-5);
}
```

## Checkbox

Binary only — no indeterminate state. Fills solid with an overshoot spring
on check (see `styles.md`), never a fade.

```css
.checkbox {
  width: 22px; height: 22px; border-radius: 11px;
  border: 1.8px solid var(--ink-3);
  background: transparent;
}
.checkbox.checked {
  border-color: var(--ra);
  background: var(--ra);
}
```

## Chips / pills

```css
.chip {
  display: inline-flex; align-items: center;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--stroke);
  color: var(--ink-3);
  font-size: var(--size-meta);
}
.chip.selected {
  border-color: var(--ra);
  background: color-mix(in srgb, var(--ra) 16%, transparent);
  color: var(--ra-deep);
  font-family: var(--font-brand); font-weight: 500;
}
```

## Icons

Line-drawn SVGs only, `stroke-width: 1.8`, `stroke-linecap: round`. Never mix
a filled icon into a screen that otherwise uses outline icons — pick one
treatment per screen, no exceptions. Icon color is always `var(--ink-2)` at
rest; only tint an icon with an accent color when it's inside an
accent-tinted container (e.g. a chip's icon slot), not standalone.

## Common mistakes

- **A second card competing with the hero.** If two cards on one screen both
  use `.card--hero`, neither one reads as the point of the screen anymore.
- **A ghost button styled to look almost-primary** (e.g. filled with a low-
  opacity accent). If it needs to look that prominent, it should be the
  primary — there's a reason there's only one per screen.
- **Mixing icon styles.** A filled checkmark next to an outline calendar icon
  on the same row reads as two different libraries, not one system.
