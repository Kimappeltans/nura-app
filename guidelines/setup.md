# Setup

## No npm package (yet)

Nura's production app is React Native (Expo), not a web component library —
there's no publishable web package to `npm install` here. Treat this kit as a
**visual/token reference only**: apply the colors, type, spacing, and
component patterns described in this kit's other files using plain CSS /
Tailwind / whatever the target project already uses. Don't attempt to import
`react-native`-specific primitives (`View`, `Pressable`,
`expo-linear-gradient`, etc.) — they don't run in a browser.

## Fonts

Headlines, buttons, and labels use **Poppins** (weights 500 and 600). Body
copy uses the platform's default system font stack — do not set Poppins on
paragraph-length text.

```css
font-family: 'Poppins', system-ui, sans-serif;   /* headings, buttons, labels only */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;  /* body */
```

Poppins loads from Google Fonts in the existing marketing site
(`nura-site/index.html`) — self-host or use a CDN link depending on the
target project's constraints.

## Theming

Two full palettes exist (`tokens.md`), applied per **mode** (Nu or Ra), not
per OS light/dark preference. If the target project only supports a single
light/dark toggle, default to Nu's navy palette — it's the "everything lives
here" surface and reads correctly as the primary ground.
