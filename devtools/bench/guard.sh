#!/bin/zsh
# guard.sh: exit 1 unless the running game is the current lab run's process (another session may have relaunched it).
LAB=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.tower-bench/runs/current.json')))['pid'])" 2>/dev/null)
NOW=$(pgrep -x CivilizationVII)
[[ -n $LAB && $LAB == $NOW ]] || { echo "guard: game pid '$NOW' is not the lab's '$LAB'; stopping" >&2; exit 1; }
