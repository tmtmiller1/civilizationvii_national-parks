// np-main-state.js - National Parks: what the game script keeps while it runs (hooks, listeners, timers), and who
// is playing: the player at the screen, humans and AIs.
"use strict";

import { autoplaying, safe } from "./np-core.js";

export const state = { originals: null, wrappers: null, listeners: [], multiplayer: false, parkKeys: new Set(),
  projectKeys: new Set(),
  foundKeys: new Map(),   // Found project raw id or hash -> kind
  markerKeys: new Set(),  // park land markers (raw id and hash), whose landing redraws a park at once
  on: false, sweepTimer: 0, sweepReason: null, aiTurn: null, aiRuns: 0,
  // Per player, as hotseat seats share this script: a pop-up waiting for a clear screen ("offer:<player>",
  // "notice:<player>", "noland:<founding>" -> timer), and Gold charged that has not left the treasury yet
  // (player -> Gold).
  timers: new Map(), spending: new Map() };

/** Run `fn` after `ms`, in place of whatever was waiting under `key`. */
export function later(key, fn, ms) {
  clearTimeout(state.timers.get(key));
  state.timers.set(key, setTimeout(fn, ms));
}

export function isAlive(owner) {
  const alive = safe(() => Players.isAlive(owner), null);
  return alive == null ? !!safe(() => Players.get(owner), null) : !!alive;
}

export function isLocal(owner) { return owner === safe(() => GameContext.localPlayerID, -99); }

/** A human's park waits for its owner to choose (in hotseat too, on that player's turn); an AI's is chosen for it.
 *  Under Autoplay the game reads the human as an AI; Autoplay.returnAsPlayer still names them. */
export function isHuman(owner) {
  if (safe(() => Players.get(owner).isHuman, false)) return true;
  return autoplaying() && owner === safe(() => Autoplay.returnAsPlayer, -1);
}
