# Nura — landing page

Static site. No build step, no dependencies. Drop the folder on any host.

```
index.html          the whole page
assets/icon.png     app icon
assets/nu.png       Nu, cut out with an alpha channel — independent asset
assets/ra.png       Ra, same
assets/*-full.png   full-resolution cutouts, for print or larger renders
assets/wordmark.png the wordmark as white-on-alpha, for CSS masking
```

## Deploying

Netlify / Vercel / Cloudflare Pages: drag the folder in. Nothing to configure.
GitHub Pages: push it, set Pages to the branch root.

## Notes

**Nu and Ra are separate files**, cut from your render with soft alpha edges. That's
deliberate — when you rig them in Rive they stay independent, and the site can swap
each `<img>` for a `<canvas>` without touching the layout.

**The characters float** on a slow 6s loop. Everything else only animates once, on
scroll-in. Both are disabled under `prefers-reduced-motion`, which matters more than
usual for this audience.

**Poppins loads from Google Fonts.** If you'd rather self-host, the woff2 files are in
the app package under `fonts/`.

**The phone mock is real HTML**, not a screenshot — it renders the actual Now screen,
so it stays honest as the app changes.
