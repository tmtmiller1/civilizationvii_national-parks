#!/bin/zsh
# reload.sh <name>: save the lab game under <name>, load it back (fresh drawings), wait for the game and start the turn.
${0:A:h}/guard.sh || exit 1
H=${0:A:h}; N=$1
A="{ Location: SaveLocations.LOCAL_STORAGE, LocationCategories: SaveLocationCategories.NORMAL, Type: GameStateStorage.getGameConfigurationSaveType(), ContentType: SaveFileTypes.GAME_STATE, FileName: \"$N\" }"
$H/b eval "(() => String(Network.saveGame($A)))()"; sleep 8
$H/b eval "(() => String(Network.loadGame($A, ServerType.SERVER_TYPE_NONE)))()"; sleep 15
for k in $(seq 1 150); do curl -s http://127.0.0.1:9444/json 2>/dev/null | grep -q "root-game" && break; sleep 2; done
for k in $(seq 1 60); do R=$($H/b eval "(() => typeof globalThis.__towerNationalPark === 'object' && GameContext.localPlayerID >= 0 ? 'ready' : 'no')()" 2>/dev/null); [[ $R == *ready* ]] && break; sleep 3; done
sleep 10; $H/b eval "$(cat $H/clearscreens.js)" >/dev/null 2>&1; $H/b eval "$(cat $H/press.js)" 2>/dev/null | tail -1; echo "RELOAD_DONE $R"
