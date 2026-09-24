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
#
# Needs Metro running (npx expo start). It uses its own simulator, not the
# one you work in, and fills it with a few example tasks. A simulator it had
# to boot is shut down again at the end. Takes about three minutes.
set -euo pipefail
cd "$(dirname "$0")/.."

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SIM="${SIM:-iPhone Air}"
BUNDLE=com.yourname.nura
OUT=screens

die() { echo "screens: $*" >&2; exit 1; }

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

rm -rf "$OUT"; mkdir -p "$OUT/shots"
SECTIONS=()   # "section|name|label" per shot, in order

# shot <section> <name> <label> <mode nu|ra> <onboarded 0|1> <flag> <value> [settle seconds]
shot() {
  local section=$1 name=$2 label=$3 mode=$4 onboarded=$5 flag=$6 value=$7 settle=${8:-3}
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
  sips -s format jpeg -s formatOptions 82 -Z 1100 "$OUT/shots/$name.png" --out "$OUT/shots/$name.jpg" >/dev/null
  rm "$OUT/shots/$name.png"
  SECTIONS+=("$section|$name|$label")
  echo "  $label"
}

echo "Screens on $SIM:"
shot Intro welcome  "Welcome"                     nu 0 dev.onb welcome 7
shot Intro blockers "What do you want help with?" nu 0 dev.onb blockers
shot Intro dump     "What do you need to get done?" nu 0 dev.onb dump
shot Intro remind   "Reminders"                   nu 0 dev.onb remind
shot Intro profile  "Create your profile"         nu 0 dev.onb profile
shot Intro rise     "One thing rises"             nu 0 dev.onb rise 7
shot App home       "Home (Nu)"                   nu 1 dev.open /
shot App focus      "Focus (Ra)"                  ra 1 dev.open /
shot App timer      "Timer"                       ra 1 dev.open "/timer?id=demo_2&mins=25"
shot App task       "Task details"                nu 1 dev.open /task/demo_1
shot App compose    "Add a task"                  nu 1 dev.open /compose
shot App chat       "Say it"                      nu 1 dev.open /chat
shot App tide       "Your day"                    nu 1 dev.open /tide
shot App calendar   "Calendar"                    nu 1 dev.open /calendar
shot App wins       "Wins"                        nu 1 dev.open /wins
shot App triage     "One pass through the backlog" nu 1 dev.open /triage
shot App retro      "What did you actually do?"   nu 1 dev.open /retro
shot App habit      "New habit"                   nu 1 dev.open /habit
shot App you        "Profile"                     nu 1 dev.open /profile
shot App companions "Companions"                  nu 1 dev.open /companions
shot App settings   "Settings"                    nu 1 dev.open /settings
shot App connect    "Connected apps"              nu 1 dev.open /integrations
shot App auth       "Sign in"                     nu 1 dev.open /auth

xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
if [ $BOOTED_HERE = 1 ]; then xcrun simctl shutdown "$UDID"; fi

# one self-contained page: the images are inlined, so it opens anywhere
{
  cat <<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nura screens</title>
<style>
  :root { --bg: #F4F1EA; --ink: #171313; --ink2: #6B6350; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0B1029; --ink: #F2F4FB; --ink2: #9AA3C7; --card: #141B3F; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.4 -apple-system, system-ui, sans-serif; }
  header { padding: 28px 24px 8px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  header p { margin: 6px 0 0; color: var(--ink2); }
  h2 { margin: 28px 24px 12px; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink2); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--w, 200px), 1fr)); gap: 22px; padding: 0 24px; }
  figure { margin: 0; }
  figure img { width: 100%; display: block; border-radius: 22px; background: var(--card); box-shadow: 0 8px 24px rgba(0,0,0,.14); cursor: zoom-in; }
  figcaption { margin-top: 8px; font-size: 13.5px; }
  .size { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; padding: 10px 24px; background: var(--bg); z-index: 1; color: var(--ink2); font-size: 13px; }
  dialog { border: 0; padding: 0; background: transparent; max-height: 96vh; }
  dialog img { max-height: 94vh; border-radius: 28px; display: block; }
  dialog::backdrop { background: rgba(0,0,0,.7); }
  footer { padding: 32px 24px 40px; color: var(--ink2); font-size: 13px; }
</style></head><body>
<header><h1>Nura screens</h1><p>$SIM · $(date '+%-d %B %Y, %H:%M') · every screen, as the iPhone draws it</p></header>
<div class="size">Size <input type="range" min="140" max="420" value="200" oninput="document.documentElement.style.setProperty('--w', this.value + 'px')"></div>
HTML
  current=""
  for entry in "${SECTIONS[@]}"; do
    IFS='|' read -r section name label <<<"$entry"
    if [ "$section" != "$current" ]; then
      [ -n "$current" ] && echo "</div>"
      echo "<h2>$section</h2><div class=\"grid\">"
      current=$section
    fi
    echo "<figure><img alt=\"$label\" src=\"data:image/jpeg;base64,$(base64 -i "$OUT/shots/$name.jpg")\"><figcaption>$label</figcaption></figure>"
  done
  cat <<'HTML'
</div>
<footer>Made by scripts/screens.sh — run <code>npm run screens</code> again after a change. Click a screen to enlarge it.</footer>
<dialog id="big" onclick="this.close()"><img alt=""></dialog>
<script>
  const big = document.getElementById('big');
  document.querySelectorAll('figure img').forEach(img => img.addEventListener('click', () => {
    big.querySelector('img').src = img.src; big.showModal();
  }));
</script>
</body></html>
HTML
} > "$OUT/index.html"

echo "Done: $OUT/index.html"
