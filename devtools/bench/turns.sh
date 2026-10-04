#!/bin/zsh
# turns.sh <n>: end n turns (no Autoplay), log each settlement's plot count and the Redwood town's developed tiles.
H=${0:A:h}; LOG=$H/shots/turns.log; : > $LOG
for k in $(seq 1 ${1:-8}); do
  $H/b lab turns 1 >> $LOG 2>&1 || { echo "TURN_FAILED" >> $LOG; break; }
  sleep 3; $H/b eval "$(cat $H/clearscreens.js)" >/dev/null 2>&1
  $H/b eval '(() => { const c = globalThis.__towerNationalPark.core; const t = Players.get(0).Cities.getCities().find(x => x.location.x === 55 && x.location.y === 10); const dev = t ? t.getPurchasedPlots().filter(i => c.districtKind(i) === "rural" && c.ringOf(i).some(n => n >= 0 && c.featureOf(n) === "FEATURE_REDWOOD_FOREST")).map(i => { const l = c.locOf(i); return l.x + "," + l.y; }) : []; return JSON.stringify({ t: Game.turn, plots: Players.get(0).Cities.getCities().map(x => x.location.x + "," + x.location.y + "=" + x.getPurchasedPlots().length), redwoodDev: dev }); })()' >> $LOG 2>&1
done
echo "TURNS_DONE" >> $LOG
