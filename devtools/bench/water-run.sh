#!/bin/zsh
# water-run.sh <label> - dev only. In a running lab game: step the civic tree to the age's park civic, run
# water-probe.js (parks founded on water, 4-tile foundings, the 1-tile expansion), print its lines, and capture each
# park it asks for into working_screenshots/national-parks-water-founding/<label>/.
set -u
H=${0:A:h}
LABEL=${1:?usage: water-run.sh <label>}
OUT=$H/../../../../working_screenshots/national-parks-water-founding/$LABEL
mkdir -p $OUT
$H/guard.sh || exit 1

AGE=$($H/b eval 'String(GameInfo.Ages.lookup(Game.age).AgeType)' | tail -1)
NODE=NODE_CIVIC_EX_MAIN_SOCIETY
[[ $AGE == *MODERN* ]] && NODE=NODE_CIVIC_MO_MAIN_NATURAL_HISTORY
echo "age $AGE, civic $NODE"
STEP="(() => { const NODE = \"$NODE\"; const prereqs = new Map(); for (const r of GameInfo.ProgressionTreePrereqs) { const n = String(r.Node); if (!prereqs.has(n)) prereqs.set(n, []); prereqs.get(n).push(String(r.PrereqNode)); } const need = new Set(); const walk = (n) => { if (need.has(n)) return; need.add(n); for (const q of prereqs.get(n) || []) walk(q); }; walk(NODE); const done = (n) => Players.get(0).Culture.isNodeUnlocked(n); if (done(NODE)) return 'DONE'; const next = [...need].find((n) => !done(n) && (prereqs.get(n) || []).every(done)); if (next) Game.PlayerOperations.sendRequest(0, PlayerOperationTypes.SET_CULTURE_TREE_NODE, { ProgressionTreeNodeType: GameInfo.ProgressionTreeNodes.lookup(next).\$index }); Players.grantYield(0, YieldTypes.YIELD_CULTURE, 5000); return 'next ' + next; })()"
for k in $(seq 1 12); do
  r=$($H/b eval "$STEP" | tail -1); echo "civic $k: $r"
  [[ $r == *DONE* ]] && break
  $H/b lab turns 1 | tail -1
done
[[ $r == *DONE* ]] || { echo "the civic didn't complete" >&2; exit 1; }

# A second settlement, for a park on water beside land in a settlement whose National Park isn't the all-water one:
# a town on open land by the coast, clear of everyone's borders.
SITE=$($H/b eval '(() => { const s = Players.get(0).Cities.getCities(); if (s.length > 1) return "have"; const a = s[0].location; const W = GameplayMap.getGridWidth(), Hh = GameplayMap.getGridHeight(); const wet = (x, y) => GameplayMap.isWater(x, y); for (let d = 4; d <= 8; d++) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { if (GameplayMap.getPlotDistance(a.x, a.y, x, y) !== d || wet(x, y) || GameplayMap.isMountain(x, y) || GameplayMap.getOwner(x, y) !== -1) continue; const ring = [0,1,2,3,4,5].map(k => GameplayMap.getAdjacentPlotLocation({ x, y }, k)); if (ring.some(l => GameplayMap.getOwner(l.x, l.y) !== -1)) continue; const coast = ring.filter(l => wet(l.x, l.y)).length; if (coast >= 2 && coast <= 4) return x + " " + y; } return "none"; })()' | tail -1)
echo "town site: $SITE"
if [[ $SITE != have && $SITE != none ]]; then
  $H/b place town ${=SITE} --yes | tail -2
  sleep 3
fi

$H/b lab popups clear | tail -1
sleep 2
$H/b eval "(() => { void $(cat $H/water-probe.js); return 'started'; })()" | tail -1
seen=0
for k in $(seq 1 120); do
  sleep 5
  st=$($H/b eval '(() => { const o = globalThis.__npWater; return o ? JSON.stringify({ done: o.done, lines: o.lines }) : "{}"; })()' | tail -1)
  print -r -- "$st" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read() or '{}'); ls=d.get('lines',[])
for l in ls[$seen:]: print(l)
print('__N', len(ls), d.get('done'))" > $OUT/.tick
  grep -v '^__N' $OUT/.tick | tee -a $OUT/probe.log
  seen=$(grep '^__N' $OUT/.tick | awk '{print $2}')
  grep -q '^__N .* True' $OUT/.tick && break
done
rm -f $OUT/.tick

grep '^SHOT ' $OUT/probe.log | while read -r _ name x y; do
  $H/../shot.sh $OUT/$name.png $x $y 0.2 | tail -1
done
grep -E '^(FAIL|DONE)' $OUT/probe.log
