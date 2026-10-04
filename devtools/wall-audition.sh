#!/bin/zsh
# wall-audition.sh - dev only. With a Modern lab game running on the Tower Bench (and the mod installed), draw the
# new composed walls on a staged plains park and each wall candidate on its own tile, and capture the game window.
# Frames land in $OUT (default: ./wall-audition-shots). Usage: devtools/wall-audition.sh [out-dir]
set -e
HERE=${0:A:h}; OUT=${1:-$HERE/wall-audition-shots}; mkdir -p "$OUT"
BENCH=$HERE/../../../tools/tower-bench
WINID=$HERE/../../../mod_ideas_tested/canals/devtools/harness/canal-winid.swift
cd "$BENCH"
shot() { # name x y zoom
  osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "CivilizationVII") to true'
  node tower-bench.mjs eval "Camera.lookAtPlot({x: $2, y: $3}); Camera.zoom($4); 1" >/dev/null; sleep 3
  local w=$(swift "$WINID" 2>/dev/null | awk '$3 > 600' | sort -k3 -n -r | head -1 | awk '{print $1}')
  screencapture -x -o -l "$w" "$OUT/$1.png" && echo "shot $1"
}
# 1. the composed walls: a six-tile park on the plains strip, drawn by the mod's own code
node tower-bench.mjs eval '(() => { const np = globalThis.__towerNationalPark; const c = np.core; const a = c.idx({ x: 60, y: 16 });
  const tiles = [a, ...c.ringOf(a).filter((n) => n >= 0 && !c.isWater(n) && !c.isMountain(n) && !c.hasDistrict(n)).slice(0, 5)];
  np.draw.drawPark({ id: 950, anchor: a, tiles }); return tiles.length; })()'
shot walls-composed-close 60 16 0
shot walls-composed-wide 60 16 0.06
node tower-bench.mjs eval '(() => { globalThis.__towerNationalPark.draw.clearPark(950); return 1; })()' >/dev/null
# 2. each candidate alone on a tile, as a three-piece run along the east edge and once in the center
node tower-bench.mjs eval '(() => { const C = globalThis.__towerNationalPark.draw.CANDIDATE_PIECES; const g = globalThis.__npWallAud || (globalThis.__npWallAud = WorldUI.createModelGroup("NP_wall_audition")); g.clear();
  const P = (s, a) => ({ placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: s, angle: a }); const r = [];
  C.forEach((asset, k) => { const plot = { i: 56 + k, j: 16 }; r.push(asset + ":" + (g.addModelAtPlot(asset, plot, { x: 0, y: 0, z: 0 }, P(1, 0)) ? "ok" : "null"));
    for (const [t, s] of [[-0.16, 1], [0.02, 0.9], [0.18, 1.1]]) g.addModelAtPlot(asset, plot, { x: 0.42, y: t, z: 0 }, P(s, 90)); });
  return r.join(" | "); })()'
shot candidates-left 57 16 0.02
shot candidates-right 61 16 0.02
node tower-bench.mjs eval '(() => { const g = globalThis.__npWallAud; if (g) { g.clear(); g.destroy(); delete globalThis.__npWallAud; } return 1; })()' >/dev/null
echo "frames in $OUT"
