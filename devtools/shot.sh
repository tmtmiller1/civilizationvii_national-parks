#!/bin/zsh
# shot.sh - DEV ONLY. Capture the Civilization VII window, and nothing else, into a PNG.
#
#   devtools/shot.sh <out.png> [x y [zoom]]
#
# With x y the camera is first moved to that plot through the Tower Bench (zoom 0 is closest, 1 far out). The game is
# brought to the front, a few throwaway frames advance the render (a covered window returns its previous view), and
# the window is captured by its id (screencapture -l), never the display. If the game was not the frontmost app just
# before and just after the capture the frame is deleted and the script exits 2, since it may be stale. Exits 1 when
# there is no game window.
set -u
HERE=${0:A:h}
OUT=${1:?usage: shot.sh <out.png> [x y [zoom]]}
BENCH=$HERE/../../../tools/tower-bench
WINID=$HERE/../../../mod_ideas_tested/canals/devtools/harness/canal-winid.swift

frontmost() { lsappinfo info -only bundleid "$(lsappinfo front)" 2>/dev/null | grep -q '"com.2k.civ7"'; }

pgrep -x CivilizationVII >/dev/null || { echo "shot: the game is not running" >&2; exit 1; }
WIN=$(swift "$WINID" 2>/dev/null | sort -k3 -n -r | head -1 | awk '{print $1}')
[[ -n "$WIN" ]] || { echo "shot: no game window found" >&2; exit 1; }

osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "CivilizationVII") to true' >/dev/null 2>&1
if (( $# >= 3 )); then
  (cd "$BENCH" && node tower-bench.mjs eval "Camera.lookAtPlot({ x: $2, y: $3 }); Camera.zoom(${4:-0.3}); 1" >/dev/null)
  sleep 3
fi
mkdir -p "${OUT:h}"
for k in 1 2 3; do screencapture -x -o -l "$WIN" "$OUT" 2>/dev/null; sleep 1.5; done
frontmost || { rm -f "$OUT"; echo "shot: the game was not in front; frame discarded" >&2; exit 2; }
screencapture -x -o -l "$WIN" "$OUT"
frontmost || { rm -f "$OUT"; echo "shot: focus changed during the capture; frame discarded" >&2; exit 2; }
echo "shot: $OUT"
