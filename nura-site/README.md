# Nura — the site

Static site, six pages. No build step, no dependencies: drop the folder on any
host. It follows the app's own design rules (`../guidelines/`): Inter Tight,
flat surfaces, coral only for the one action — on a white page with light
orange accents, and Nu's deep blue for the night and the story.

```
index.html          the landing page: the intelligence first, then Nu and Ra
how-it-works.html   a tour of the app, screen by screen
about.html          the story behind Nura: Nun, the Benben, Heliopolis, Ra, then Nura
privacy.html        the Privacy Policy
terms.html          the Terms of Service
support.html        contact, and answers to the common questions
404.html            what Netlify shows for an address that doesn't exist (root paths only)
robots.txt, sitemap.xml  for search engines: the six pages, as https://risewithnura.com/<page>.html
site.css / site.js  shared by every page; bump ?v= in the pages after a change
story.css / story.js  the story on about.html: one pinned scene drawn by scroll

assets/app-*.avif|webp     real screenshots of the app — made by scripts/site-shots.sh
assets/nu-hug.webp …       the moving characters (see below), each with a -still.webp
assets/benben-rise.webp    the Benben rising out of the water, between Nu and Ra
assets/nu.png, ra.png      Nu and Ra cut out with alpha — independent assets
assets/*-full.png          full-resolution cut-outs, for print or larger renders
assets/wordmark.png        the wordmark, white on alpha, for CSS masking
assets/share.jpg           the link preview (og:image), 1200 x 630: headline, Home, Ra
assets/apple-touch-icon.png  the app icon at 180 px, from ../assets/brand/icon-nura.png
```

## Each page's head

Every page carries a canonical address (with `.html`, as the links between
pages use; the home page is `https://risewithnura.com/`), Open Graph and
Twitter tags pointing at `assets/share.jpg`, and a description of its own.
The home page has JSON-LD for Nura (the app, the organisation, the site);
support.html has a FAQPage block that repeats the questions and answers word
for word, so change both together. Add a new page to `sitemap.xml` too.

## The screenshots

They're the real app, so they go stale when the app changes. Re-take them with
Metro running:

```
bash scripts/site-shots.sh                     # Metro on 8081
METRO_PORT=8100 bash scripts/site-shots.sh     # Metro elsewhere
ONLY="home night" bash scripts/site-shots.sh   # just some
```

## A recorded demo in the hero

Record the screen on the iPhone, trim it to 10 to 15 seconds, and export it
about 780 px wide as `assets/demo.mp4` (and `assets/demo.webm` if you can).
Then swap the hero's `<picture>` for:

```html
<video autoplay muted loop playsinline preload="metadata" poster="assets/app-home.webp">
  <source src="assets/demo.webm" type="video/webm">
  <source src="assets/demo.mp4" type="video/mp4">
</video>
```

The phone frame already styles a video like the screenshot.

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

## The legal pages live twice

`privacy.html`, `terms.html` and `support.html` also sit in the app's
`../public/` folder, so the web app serves them next to itself
(`/privacy.html`, which Settings opens through `src/links.ts`). Those copies
share `public/legal.css` and Inter Tight from `public/fonts/`: the app host
sends `Cross-Origin-Embedder-Policy: require-corp`, so nothing there may load
from another origin (no Google Fonts, no images). The words are the same.
Change them here first, then paste each page's `<main>` into its copy in
`public/`.

## Viewing it locally

Open it through a server (`python3 -m http.server --directory nura-site`), not
as a file: some previews show a file from disk without its stylesheet.

## Deploying

Netlify or Cloudflare Pages: drag the folder in. Nothing to configure: both
read `_headers` (the content security policy, HSTS, no framing), and Netlify
runs the early-access form.

Not Vercel or GitHub Pages: neither reads `_headers`, so the site would go out
without its security headers, and the form would go nowhere.
