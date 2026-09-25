# Setup

## The app

Nura is React Native (Expo Router) and runs on iOS and the web from the same
code. Tokens live in `src/theme.ts`; `useTheme()` in `src/store.ts` picks the
light for the current screen; `inWorld()` in `src/world.tsx` says which world
a route belongs to.

## Fonts

**Inter Tight** everywhere, from `@expo-google-fonts/inter-tight`, loaded in
`app/_layout.tsx` (400, 500, 600). Poppins is retired — do not add it back.

For HTML mockups:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

## Reference boards

`design/nura-journey-blend-v5.html` is self-contained (characters, icons and
wordmark are embedded; only the font loads from Google). Append `#sun`,
`#light` or `#dark` to open it in one appearance, and `&only=N` to show one
screen edge to edge — that is how `design/export/` is rendered with headless
Chrome.

## Running it

- Web: `npx expo start --web` (see `.claude/launch.json`: `nura-web` on 8099,
  `nura-web-2` on 8100).
- iOS: a development build (`npx expo run:ios`).
