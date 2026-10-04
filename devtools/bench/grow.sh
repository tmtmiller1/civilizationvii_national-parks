#!/bin/zsh
# grow.sh <parkId> "x,y x,y ...": buy one expansion for that park from its settlement's Gold panel, then add the tiles.
${0:A:h}/guard.sh || exit 1
H=${0:A:h}; ID=$1; TILES=$2
$H/b eval "(async () => { const { InterfaceMode } = await import('/core/ui/interface-modes/interface-modes.js'); InterfaceMode.switchToDefault(); const np = globalThis.__towerNationalPark; const p = np.core.parkById($ID); UI.Player.selectCity(np.core.settlementOf(p)); await new Promise(r => setTimeout(r, 1500)); const why = np.buySelected(np.core.kindOf(p).key); InterfaceMode.switchToDefault(); return 'buy ' + (why || 'ok') + ' pending=' + p.pending; })()"
P=""; for xy in ${=TILES}; do P="${P}[${xy}],"; done
$H/b eval "$(cat $H/pick.js)($ID, [${P%,}])"
sleep 7
$H/b eval "(() => { const p = globalThis.__towerNationalPark.core.parkById($ID); return 'park $ID tiles=' + p.tiles.length + ' pending=' + p.pending; })()"
