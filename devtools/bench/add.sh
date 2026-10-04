#!/bin/zsh
# add.sh <parkId> "x,y x,y ...": place pending tiles for a park through the picker.
${0:A:h}/guard.sh || exit 1
H=${0:A:h}; ID=$1; P=""; for xy in ${=2}; do P="${P}[${xy}],"; done
$H/b eval "$(cat $H/pick.js)($ID, [${P%,}])"; sleep 7
$H/b eval "(() => { const p = globalThis.__towerNationalPark.core.parkById($ID); return 'park $ID tiles=' + p.tiles.length + ' pending=' + p.pending; })()"
