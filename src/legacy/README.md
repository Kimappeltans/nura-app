# Legacy screens

Screens and pieces the three-room app (Home · My tasks · Your day, with Focus
as a mode) replaced. Nothing here is deleted or reachable from the app; each
still compiles, so any of them can be put back by importing it again.

| File | What it was | To restore |
|---|---|---|
| `NuHome.tsx` | The home with the river scene and "One thing to begin" | import it in `app/index.tsx` in place of `src/screens/Home` |
| `Nu.tsx` | The earlier list-first home | same |
| `HomeScene.tsx` | The drawn river / boulders / Ra's path illustration | used by `NuHome.tsx` |
| `OneThing.tsx` | "ONE THING TO BEGIN" + "Begin with Ra" | used by `NuHome.tsx` |
| `HomeFirst.tsx` | Home, the first three-room version: search, Add anything + Nu, next step, Today, everything else | import it in `app/index.tsx` in place of `src/screens/Home` |
| `Tasks.tsx` | My tasks, the first three-room version: filters and plain lists | import it in `app/index.tsx` in place of `src/screens/Tasks` |
| `AppMenu.tsx` | The single menu listing every place in the app | used by both homes above |

The design these were replaced by is `design/nura-redesign-prototype.html`.

Still routes, no longer linked from the new navigation: `app/chat.tsx` ("Say it to Ra" —
Capture does its job now) and `app/tide.tsx` (Your day as a modal — it's a tab now).

`Day.tsx` is the Your Day tab, replaced by the Calendar tab (`src/screens/Calendar.tsx`) on 25 September 2026 — Home already shows how today is going. Import it in `app/index.tsx` in place of `Calendar` to restore it. `src/screens/Tide.tsx` (its first version, with `room`) still backs the `/tide` route.
The original Nu (`nu-listen`, dark engraved features) is `assets/legacy/story/nu-listen.webp`.
