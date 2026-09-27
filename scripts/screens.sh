#!/bin/bash
# Every Nura screen on one page: screens/index.html.
#
# Opens the app on an iPhone simulator screen by screen, screenshots each one
# and lays them side by side in one self-contained HTML file. It steers the
# app with the dev-only flags `dev.open` (a route) and `dev.onb` (an
# onboarding step) — see app/_layout.tsx and src/screens/Onboarding.tsx — so
# nothing is tapped and no "Open in Nura?" prompt appears.
#
#   npm run screens                    # on the iPhone Air simulator
#   SIM="iPhone 17e" npm run screens   # any installed iPhone simulator
#   npm run screens -- --page          # rebuild the page from the last shots
#
# Needs Metro running (npx expo start). It uses its own simulator, not the
# one you work in, and fills it with a few example tasks. A simulator it had
# to boot is shut down again at the end. Takes about three minutes.
set -euo pipefail
cd "$(dirname "$0")/.."

PAGE_ONLY=0
if [ "${1:-}" = "--page" ]; then PAGE_ONLY=1; fi

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SIM="${SIM:-iPhone Air}"
BUNDLE=com.yourname.nura
OUT=screens

die() { echo "screens: $*" >&2; exit 1; }

# encode <image> <output path without extension> <max width> <AVIF quality> <WebP/JPEG quality>
# Writes AVIF when avifenc is installed (brew install libavif), else WebP
# (cwebp), else JPEG, never larger than the source; prints the file written.
encode() {
  local in=$1 out=$2 w=$3 qa=$4 qw=$5 tmp="$2.tmp.png" src_w
  src_w=$(sips -g pixelWidth "$in" | awk '/pixelWidth/ { print $2 }')
  if [ "$src_w" -lt "$w" ]; then w=$src_w; fi
  sips -s format png --resampleWidth "$w" "$in" --out "$tmp" >/dev/null
  if command -v avifenc >/dev/null; then
    avifenc -q "$qa" -s 6 "$tmp" "$out.avif" >/dev/null; echo "$out.avif"
  elif command -v cwebp >/dev/null; then
    cwebp -quiet -q "$qw" "$tmp" -o "$out.webp"; echo "$out.webp"
  else
    sips -s format jpeg -s formatOptions "$qw" "$tmp" --out "$out.jpg" >/dev/null; echo "$out.jpg"
  fi
  rm -f "$tmp"
}

# the saved shot for <name>, whichever format it was written in
source_of() {
  local ext
  for ext in avif webp jpg; do
    if [ -f "$OUT/shots/$1.$ext" ]; then echo "$OUT/shots/$1.$ext"; return; fi
  done
}

if [ $PAGE_ONLY = 0 ]; then
  curl -s http://localhost:8081/status | grep -q running || die "start Metro first: npx expo start"

  UDID=$(xcrun simctl list devices available | grep -E "^ +$SIM \(" | head -1 | grep -oE '[0-9A-F-]{36}' || true)
  [ -n "$UDID" ] || die "no simulator named \"$SIM\" (xcrun simctl list devices)"

  BOOTED_HERE=0
  if ! xcrun simctl list devices | grep "$UDID" | grep -q Booted; then
    xcrun simctl boot "$UDID"; BOOTED_HERE=1
  fi
  xcrun simctl bootstatus "$UDID" -b >/dev/null

  # the development build, from the newest Xcode or expo run:ios build
  if ! xcrun simctl get_app_container "$UDID" "$BUNDLE" >/dev/null 2>&1; then
    APP=$(ls -dt ~/Library/Developer/Xcode/DerivedData/*/Build/Products/Debug-iphonesimulator/Nura.app 2>/dev/null | head -1)
    [ -n "$APP" ] || die "build the app once first: npx expo run:ios"
    xcrun simctl install "$UDID" "$APP"
  fi

  DB="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)/Documents/SQLite/nura.db"
  if [ ! -f "$DB" ]; then   # first launch creates the database
    xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
    for _ in $(seq 60); do sqlite3 "$DB" "select 1 from app_state" >/dev/null 2>&1 && break; sleep 1; done
  fi

  # The same example day for every shot, reset each time (the timer shot marks
  # a task started, for one).
  NOW=$(($(date +%s) * 1000))
  TOMORROW_10=$(($(date -v+1d -v10H -v0M -v0S +%s) * 1000))
  TODAY_18=$(($(date -v18H -v0M -v0S +%s) * 1000))
  SEED="
  insert or replace into task (id, title, state, created_at, priority, label, est_minutes, due_at, has_time, updated_at) values
    ('demo_1', 'Email the landlord about the heating', 'today', $NOW, 3, 'home',     15,   NULL,         0, $NOW),
    ('demo_2', 'Prepare slides for Monday',           'today', $NOW, 2, 'work',     45,   $TOMORROW_10, 1, $NOW),
    ('demo_3', 'Pay the phone bill',                  'inbox', $NOW, 1, 'money',    5,    NULL,         0, $NOW),
    ('demo_4', 'Book a haircut',                      'inbox', $NOW, 0, 'personal', NULL, NULL,         0, $NOW),
    ('demo_5', 'Call mum',                            'inbox', $NOW, 0, 'people',   10,   $TODAY_18,    1, $NOW);
  delete from breadcrumb where task_id like 'demo_%';
  insert or replace into app_state values ('notif_asked', '1'), ('energy', 'steady'), ('ra.pin', 'null');"
fi

# The page: one self-contained HTML file, the screenshots inlined at 600 px
# wide (see encode for the format), so it opens anywhere, offline.
page() {
  local taken src img type
  taken=$(date -r "$(source_of home)" '+%-d %B %Y, %H:%M' 2>/dev/null || date '+%-d %B %Y')
  {
    cat <<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nura screens</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600&display=swap">
<style>
  /* Nura's own palette: Ra's cream by day, Nu's navy by night */
  :root { --ground: #FAF7F0; --raised: #FFFFFF; --ink: #171313; --ink-2: #4A4340; --ink-3: #7B7360;
          --indigo: #4338CA; --coral: #C2410C; --line: rgba(23,19,19,.10); --lift: 0 10px 26px rgba(60,40,20,.16); }
  @media (prefers-color-scheme: dark) {
    :root { --ground: #0B1029; --raised: #141B3F; --ink: #F2F4FB; --ink-2: #AEB6D4; --ink-3: #7E87AC;
            --indigo: #8C97F6; --coral: #FF8A5C; --line: rgba(170,185,255,.16); --lift: 0 10px 26px rgba(0,0,0,.5); color-scheme: dark; }
  }
  body { margin: 0; background: var(--ground); color: var(--ink); padding-inline: clamp(16px, 4vw, 40px);
         font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  header { padding-block: 32px 4px; }
  h1 { margin: 0; font: 600 30px/1.1 Poppins, -apple-system, system-ui, sans-serif; letter-spacing: -0.02em; }
  header p { margin: 8px 0 0; color: var(--ink-2); max-width: 60ch; }
  .bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center;
         padding-block: 12px; background: var(--ground); border-bottom: 1px solid var(--line); }
  .bar a { color: var(--indigo); text-decoration: none; font-weight: 600; }
  .bar a:hover { text-decoration: underline; }
  .bar label { margin-left: auto; display: flex; gap: 10px; align-items: center; color: var(--ink-3); font-size: 13px; }
  .bar input { accent-color: var(--coral); }
  h2 { margin: 30px 0 14px; font: 500 12.5px/1 Poppins, -apple-system, system-ui, sans-serif; letter-spacing: .16em;
       text-transform: uppercase; color: var(--ink-3); scroll-margin-top: 64px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--w, 190px), 100%), 1fr)); gap: 28px 20px; }
  figure { margin: 0; }
  .shot { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: 12% / 5.5%; }
  .shot:focus-visible { outline: 3px solid var(--indigo); outline-offset: 4px; }
  .shot img { display: block; width: 100%; border-radius: 12% / 5.5%; background: var(--raised); box-shadow: var(--lift); }
  figcaption { margin-top: 10px; display: grid; gap: 2px; }
  figcaption b { font-weight: 600; font-size: 14px; }
  figcaption code { font: 12px/1.35 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-3); }
  dialog { border: 0; padding: 0; background: none; max-width: 96vw; }
  dialog img { display: block; max-height: 92vh; max-width: 96vw; border-radius: 40px; }
  dialog::backdrop { background: rgba(11,16,41,.78); }
  footer { padding-block: 40px 48px; color: var(--ink-3); font-size: 13px; }
  footer code { font: 12.5px ui-monospace, "SF Mono", Menlo, monospace; }
</style></head><body>
<header>
  <h1>Nura screens</h1>
  <p>Every screen as the iPhone draws it, on the $SIM simulator with an example day. Taken $taken.</p>
</header>
<div class="bar">
  <a href="#intro">Intro</a><a href="#app">App</a>
  <label for="size">Size <input id="size" type="range" min="130" max="420" value="190"></label>
</div>
HTML
    local current=""
    for spec in "${SPECS[@]}"; do
      IFS='|' read -r section name label _ _ _ _ _ note <<<"$spec"
      src=$(source_of "$name")
      [ -n "$src" ] || continue
      if [ "$section" != "$current" ]; then
        [ -n "$current" ] && echo "</div>"
        echo "<h2 id=\"$(echo "$section" | tr 'A-Z' 'a-z')\">$section</h2><div class=\"grid\">"
        current=$section
      fi
      img=$(encode "$src" "$OUT/shots/$name.page" 600 50 72)
      case $img in *.avif) type=avif ;; *.webp) type=webp ;; *) type=jpeg ;; esac
      echo "<figure><button class=\"shot\" type=\"button\" aria-label=\"Enlarge $label\"><img alt=\"$label\" src=\"data:image/$type;base64,$(base64 -i "$img")\"></button><figcaption><b>$label</b><code>$note</code></figcaption></figure>"
    done
    cat <<'HTML'
</div>
<footer>Made by <code>scripts/screens.sh</code>. After a change, run <code>npm run screens</code> for new screenshots, or <code>npm run screens -- --page</code> to rebuild this page from the last ones.</footer>
<dialog id="big"><img alt=""></dialog>
<script>
  const big = document.getElementById('big');
  big.addEventListener('click', () => big.close());
  document.querySelectorAll('.shot').forEach(b => b.addEventListener('click', () => {
    big.querySelector('img').src = b.querySelector('img').src;
    big.querySelector('img').alt = b.querySelector('img').alt;
    big.showModal();
  }));
  document.getElementById('size').addEventListener('input', e =>
    document.documentElement.style.setProperty('--w', e.target.value + 'px'));
</script>
</body></html>
HTML
  } > "$OUT/index.html"
  rm -f "$OUT"/shots/*.page.*
  echo "Done: $OUT/index.html ($(du -h "$OUT/index.html" | cut -f1 | tr -d ' '))"
}

# section|name|label|mode|onboarded|flag|value|settle seconds|caption note
SPECS=(
  "Intro|welcome|Welcome|nu|0|dev.onb|welcome|7|first launch"
  "Intro|blockers|What do you want help with?|nu|0|dev.onb|blockers|3|step 1 of 4"
  "Intro|dump|What do you need to get done?|nu|0|dev.onb|dump|3|step 2 of 4"
  "Intro|remind|Reminders|nu|0|dev.onb|remind|3|only after “Remembering”, iPhone only"
  "Intro|profile|Create your profile|nu|0|dev.onb|profile|3|step 3 of 4, skipped when signed in"
  "Intro|rise|One thing rises|nu|0|dev.onb|rise|7|step 4 of 4"
  "App|home|Home (Nu)|nu|1|dev.open|/|3|/"
  "App|focus|Focus (Ra)|ra|1|dev.open|/|3|/ in Ra"
  "App|timer|Timer|ra|1|dev.open|/timer?id=demo_2&mins=25|3|/timer"
  "App|task|Task details|nu|1|dev.open|/task/demo_1|3|/task/:id"
  "App|compose|Add a task|nu|1|dev.open|/compose|3|/compose"
  "App|chat|Say it|nu|1|dev.open|/chat|3|/chat"
  "App|tide|Your day|nu|1|dev.open|/tide|3|/tide"
  "App|calendar|Calendar|nu|1|dev.open|/calendar|3|/calendar"
  "App|wins|Wins|nu|1|dev.open|/wins|3|/wins"
  "App|triage|One pass through the backlog|nu|1|dev.open|/triage|3|/triage"
  "App|retro|What did you actually do?|nu|1|dev.open|/retro|3|/retro"
  "App|habit|New habit|nu|1|dev.open|/habit|3|/habit"
  "App|you|Profile|nu|1|dev.open|/profile|3|/profile"
  "App|companions|Companions|nu|1|dev.open|/companions|3|/companions"
  "App|settings|Settings|nu|1|dev.open|/settings|3|/settings"
  "App|connect|Connected apps|nu|1|dev.open|/integrations|3|/integrations"
  "App|auth|Sign in|nu|1|dev.open|/auth|3|/auth"
)

# shot <name> <label> <mode nu|ra> <onboarded 0|1> <flag> <value> <settle seconds>
shot() {
  local name=$1 label=$2 mode=$3 onboarded=$4 flag=$5 value=$6 settle=$7
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  sqlite3 "$DB" "$SEED
    insert or replace into app_state values ('mode', '$mode'), ('onboarded', '$onboarded'), ('$flag', '$value');"
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  # the app clears the flag once it has opened the screen
  local waited=0
  until [ -z "$(sqlite3 "$DB" "select v from app_state where k = '$flag'")" ]; do
    sleep 1; waited=$((waited + 1))
    [ $waited -lt 60 ] || { echo "  $name: the app never picked up $flag; shooting anyway" >&2; break; }
  done
  sleep "$settle"   # animations in
  xcrun simctl io "$UDID" screenshot "$OUT/shots/$name.png" >/dev/null 2>&1
  # kept at 1400 px wide, ~40 KB as AVIF; the full PNG is ~1.5 MB
  encode "$OUT/shots/$name.png" "$OUT/shots/$name" 1400 70 85 >/dev/null
  rm "$OUT/shots/$name.png"
  echo "  $label"
}

if [ $PAGE_ONLY = 0 ]; then
  rm -rf "$OUT"; mkdir -p "$OUT/shots"
  echo "Screens on $SIM:"
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r _ name label mode onboarded flag value settle _ <<<"$spec"
    shot "$name" "$label" "$mode" "$onboarded" "$flag" "$value" "$settle"
  done
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  if [ $BOOTED_HERE = 1 ]; then xcrun simctl shutdown "$UDID"; fi
fi

page
