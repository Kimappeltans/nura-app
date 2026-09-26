# Nura — the site

Static site, four pages. No build step, no dependencies: drop the folder on any
host. It follows the app's own design rules (`../guidelines/`): Inter Tight,
flat surfaces, coral only for the one action — on a white page with light
orange accents, and Nu's deep blue for the night and the story.

```
index.html          the landing page: the intelligence first, then Nu and Ra
how-it-works.html   a tour of the app, screen by screen
about.html          the story behind Nura: Nun, the Benben, Heliopolis, Ra
privacy.html        your data in plain words (a DRAFT — see the note at its top)
site.css / site.js  shared by every page; bump ?v= in the pages after a change

assets/app-*.avif|webp     real screenshots of the app — made by scripts/site-shots.sh
assets/nu-hug.webp …       the moving characters (see below), each with a -still.webp
assets/benben-rise.webp    the Benben rising out of the water, between Nu and Ra
assets/nu.png, ra.png      Nu and Ra cut out with alpha — independent assets
assets/*-full.png          full-resolution cut-outs, for print or larger renders
assets/wordmark.png        the wordmark, white on alpha, for CSS masking
```

## The screenshots

They're the real app, so they go stale when the app changes. Re-take them with
Metro running:

```
bash scripts/site-shots.sh                     # Metro on 8081
METRO_PORT=8100 bash scripts/site-shots.sh     # Metro elsewhere
ONLY="home night" bash scripts/site-shots.sh   # just some
```

## The moving characters

Real clips from the Midjourney sources (`../nu-characters/`), cut out frame by
frame and saved as animated WebP at 12 frames a second. Every `<img data-clip>`
shows its still until it's on screen; `data-loop` ones (Nu hugging the cards,
Ra breathing) loop, the rest (Ra pointing, the pebble, the Benben) play each
time they come into view and rest on their last pose. Nothing moves with
reduced motion on.

## The early-access form

The form at the end of the landing page is set up for **Netlify Forms**: deploy
the folder on Netlify and signups appear under Forms → early-access, with a
honeypot against bots. Nothing else to configure. On another host, point the
form's `action` at your own endpoint — `site.js` posts it urlencoded and shows
"You're on the list" on any 2xx answer. (A local server rejects the post, so
locally you'll see the retry message.)

## Viewing it locally

Open it through a server (`python3 -m http.server --directory nura-site`), not
as a file: some previews show a file from disk without its stylesheet.

## Deploying

Netlify / Vercel / Cloudflare Pages: drag the folder in. Nothing to configure.
GitHub Pages: push it, set Pages to the branch root.
