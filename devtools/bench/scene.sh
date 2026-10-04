#!/bin/zsh
# scene.sh <name> <x> <y> <zoom> [clean|ui]: frame the camera (x < 0 keeps it), clean = hide yields/resources,
${0:A:h}/guard.sh || exit 1
# hide tooltips, capture the game window into devtools/bench/shots/<name>.png (+ a 1400 px preview).
H=${0:A:h}; NAME=$1; X=$2; Y=$3; Z=$4; MODE=${5:-clean}
$H/b eval "(async () => { const LM = (await import('/core/ui/lenses/lens-manager.js')).default; const clean = '$MODE' === 'clean'; if (!globalThis.__npKeepLens) for (const l of ['fxs-yields-layer', 'fxs-resource-layer']) { try { clean ? LM.disableLayer(l) : LM.enableLayer(l); } catch (e) {} } let st = document.getElementById('np-shot-style'); if (!st) { st = document.createElement('style'); st.id = 'np-shot-style'; document.head.appendChild(st); } st.textContent = '[class*=tooltip], [class*=Tooltip], plot-tooltip, #emig-readout { visibility: hidden !important; }'; if ($X >= 0) Camera.lookAtPlot({ x: $X, y: $Y }, { zoom: $Z }); return 1; })()" >/dev/null
sleep 4
$H/../shot.sh $H/shots/$NAME.png || { sleep 4; $H/../shot.sh $H/shots/$NAME.png; }
[ -f $H/shots/$NAME.png ] && sips -Z 1400 $H/shots/$NAME.png --out $H/shots/$NAME-s.jpg -s format jpeg >/dev/null && echo "ok $NAME"
