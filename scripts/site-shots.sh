#!/bin/bash
# The app screenshots on the landing page: nura-site/assets/app-*.{avif,webp}.
#
# Opens the development build on its own iPhone simulator, fills it with one
# believable day (a few things done this morning, a month of suns behind it)
# and shoots each screen the page shows, steered with the dev-only flag
# `dev.open` (see app/_layout.tsx) — nothing is tapped. Re-run it after a
# visible change so the page never shows an app that no longer exists.
#
#   bash scripts/site-shots.sh                    # Metro on 8081, iPhone 17
#   METRO_PORT=8100 bash scripts/site-shots.sh    # Metro elsewhere
#   SIM="iPhone Air" bash scripts/site-shots.sh   # another simulator
#
# Needs Metro running (npx expo start) and the app built once (npx expo
# run:ios). A simulator it had to boot is shut down again at the end.
set -euo pipefail
cd "$(dirname "$0")/.."

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SIM="${SIM:-iPhone 17}"
METRO_PORT="${METRO_PORT:-8081}"
BUNDLE=com.yourname.nura
OUT=nura-site/assets
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

die() { echo "site-shots: $*" >&2; exit 1; }

curl -s "http://localhost:$METRO_PORT/status" | grep -q running || die "start Metro first (port $METRO_PORT)"
UDID=$(xcrun simctl list devices available | grep -E "^ +$SIM \(" | head -1 | grep -oE '[0-9A-F-]{36}' || true)
[ -n "$UDID" ] || die "no simulator named \"$SIM\""

BOOTED_HERE=0
if ! xcrun simctl list devices | grep "$UDID" | grep -q Booted; then
  xcrun simctl boot "$UDID"; BOOTED_HERE=1
fi
xcrun simctl bootstatus "$UDID" -b >/dev/null

# the newest development build, and point it at this Metro
APP=$(ls -dt ~/Library/Developer/Xcode/DerivedData/*/Build/Products/Debug-iphonesimulator/Nura.app 2>/dev/null | head -1)
[ -n "$APP" ] || die "build the app once first: npx expo run:ios"
xcrun simctl install "$UDID" "$APP"
xcrun simctl spawn "$UDID" defaults write "$BUNDLE" RCT_jsLocation "localhost:$METRO_PORT"
# iOS's one-time keyboard tip ("slide to type") would cover Tell Nu
xcrun simctl spawn "$UDID" defaults write com.apple.Preferences DidShowContinuousPathIntroduction -bool true

DB="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)/Documents/SQLite/nura.db"
if [ ! -f "$DB" ]; then   # first launch creates the database
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  for _ in $(seq 90); do sqlite3 "$DB" "select 1 from app_state" >/dev/null 2>&1 && break; sleep 1; done
fi
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true

# a clean status bar, at the real time (the app draws the day by it)
xcrun simctl status_bar "$UDID" override --time "$(date '+%-I:%M')" --batteryState charged --batteryLevel 100 \
  --wifiBars 3 --cellularMode active --cellularBars 4 >/dev/null

# ms since the epoch for today at H:M, or N days ago at H:M
at() { echo $(($(date -v"$1"H -v"$2"M -v0S +%s) * 1000)); }
ago() { echo $(($(date -v-"$1"d -v"$2"H -v"$3"M -v0S +%s) * 1000)); }
NOW=$(($(date +%s) * 1000))
HOUR=$(date +%-H)

# One day, the same in every shot: three things done this morning, five held,
# and the month behind it — suns sized by what got done, quiet days empty.
SUNS=""
for spec in 1:2 2:4 3:1 5:3 6:5 8:2 9:3 10:1 12:4 13:2 15:3 16:6 17:2 19:1 20:3; do
  d=${spec%%:*}; n=${spec##*:}
  for k in $(seq "$n"); do
    t=$(ago "$d" $((9 + k)) 20)
    SUNS="$SUNS ('sun_${d}_$k', 'Something done', 'done', $t, $t, $t),"
  done
done
SEED="
delete from task; delete from event; delete from breadcrumb;
insert into task (id, title, state, created_at, priority, label, est_minutes, due_at, has_time, updated_at) values
  ('demo_1', 'Draft the proposal outline',   'today', $NOW, 3, 'work',     25,   NULL, 0, $NOW),
  ('demo_2', 'Prepare slides for Monday',    'today', $NOW, 2, 'work',     45,   NULL, 0, $NOW),
  ('demo_3', 'Send invoice to Studio North', 'inbox', $NOW, 1, 'money',    10,   NULL, 0, $NOW),
  ('demo_4', 'Renew passport',               'inbox', $NOW, 0, 'personal', NULL, NULL, 0, $NOW),
  ('demo_5', 'Call mum',                     'today', $NOW, 1, 'people',   10,   $(at $((HOUR < 20 ? HOUR + 1 : 20)) 30), 1, $NOW),
  ('demo_6', 'Run 5k',                       'inbox', $NOW, 0, 'health',   30,   NULL, 0, $NOW);
insert into task (id, title, state, created_at, completed_at, updated_at) values
  ('done_1', 'Reply to Sam',       'done', $(at 9 0),  $(at 9 40),  $(at 9 40)),
  ('done_2', 'Review the budget',  'done', $(at 9 0),  $(at 11 30), $(at 11 30)),
  ('done_3', 'Book the dentist',   'done', $(at 9 0),  $(at 14 10), $(at 14 10)),
  ${SUNS%,};
insert into event (task_id, kind, at) select id, 'completed', completed_at from task where state = 'done';
insert or replace into app_state values ('notif_asked', '1'), ('energy', 'steady'), ('ra.pin', 'null'),
  ('onboarded', '1'), ('appearance', 'sun'), ('day.end', '$((23 * 60))');"

# only some shots: ONLY="night done" bash scripts/site-shots.sh
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }

# shot <name> <mode nu|ra> <dev.open value> <settle seconds> [day end, minutes] [more SQL]
shot() {
  local name=$1 mode=$2 open=$3 settle=$4 end=${5:-$((23 * 60))} more=${6:-}
  want "$name" || return 0
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  sqlite3 "$DB" "$SEED $more
    insert or replace into app_state values ('mode', '$mode'), ('day.end', '$end'), ('dev.open', '$open');"
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  local waited=0   # the app clears the flag once it has opened the screen
  until [ -z "$(sqlite3 "$DB" "select v from app_state where k = 'dev.open'")" ]; do
    sleep 1; waited=$((waited + 1))
    [ $waited -lt 90 ] || { echo "  $name: the app never picked up dev.open; shooting anyway" >&2; break; }
  done
  sleep "$settle"
  xcrun simctl io "$UDID" screenshot "$TMP/$name.png" >/dev/null 2>&1
  # 780 px wide: twice the size the page ever draws a phone
  sips -s format png --resampleWidth 780 "$TMP/$name.png" --out "$TMP/$name.s.png" >/dev/null
  avifenc -q 62 -s 6 "$TMP/$name.s.png" "$OUT/app-$name.avif" >/dev/null
  cwebp -quiet -q 80 "$TMP/$name.s.png" -o "$OUT/app-$name.webp"
  echo "  $name"
}

echo "Site shots on $SIM:"
shot home     nu '/'                                          4
shot tell     nu 'tell:Call mum tomorrow at 6pm'              4
shot focus    ra '/'                                          4
shot session  ra '/timer?id=demo_1&mins=25'                   6
shot done     ra '/timer?id=demo_1&mins=22&dev=done'          9
shot tasks    nu 'tab:tasks'                                  4
shot calendar nu 'tab:day'                                    4
# after the day ends: the day's end set to an hour ago, and two things waiting for tomorrow
TOMORROW="update task set due_at = $(($(date -v+1d -v18H -v0M -v0S +%s) * 1000)), has_time = 1 where id = 'demo_5';
  update task set due_at = $(($(date -v+1d -v10H -v0M -v0S +%s) * 1000)), has_time = 1 where id = 'demo_2';"
shot night    nu '/'                                          4 $(( HOUR * 60 - 60 > 5 * 60 ? HOUR * 60 - 60 : 5 * 60 )) "$TOMORROW"

xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl status_bar "$UDID" clear
if [ $BOOTED_HERE = 1 ]; then xcrun simctl shutdown "$UDID"; fi
echo "Done: $OUT/app-*.avif / .webp"
