#!/bin/bash
# Double-click this file to see Nura in your browser.
# It serves the built app on your own machine and opens it. Nothing is uploaded.
cd "$(dirname "$0")/preview" || exit 1

PORT=4321
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done

echo ""
echo "  Nura is running at  http://localhost:$PORT"
echo "  Leave this window open. Close it to stop."
echo ""

python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
sleep 1
open "http://localhost:$PORT"

trap "kill $SERVER 2>/dev/null" EXIT
wait $SERVER
