// np-main-ai.js - National Parks: the AI's parks: founding one, buying expansions with Gold, and picking land.
"use strict";

import { KINDS, addTile, aiSavingStep, aiScore, aiTakes, eligibleTiles, expansionPrice, foundingTiles, isFull,
  isIndependent, kindOf, log, parks, room, safe, save, settlementOf, tileGain, tilesPerExpansion } from "./np-core.js";
import { drawPark } from "./np-draw.js";
import { foundPrice, foundingRefusal, startFounding, wonderAdjacent } from "./np-main-founding.js";
import { isHuman, state } from "./np-main-state.js";
import { refreshGeoLabels } from "./np-names.js";

// The AI weighs founding once a turn with its own Gold, as it weighs expansions: at peace, with Gold coming in, it
// founds a park where a settlement holds empty land beside a natural wonder (as the AIs did when they built the
// improvement themselves), one founding a turn for each AI.
export function foundAiParks() {
  for (const pid of safe(() => Players.getAliveMajorIds(), []) || []) {
    if (isHuman(pid) || atWarWithMajor(pid)) continue;
    const player = safe(() => Players.get(pid), null);
    const income = safe(() => player.Stats.getNetYield(YieldTypes.YIELD_GOLD), 0);
    if (!player || income <= 0) continue;
    foundForAi(pid, player);
  }
}

/** The first of an AI's settlements and kinds that may found a park beside a wonder, and can pay half again the price,
 *  founds one; the rest wait for another turn. */
function foundForAi(pid, player) {
  for (const city of safe(() => player.Cities.getCities(), []) || []) {
    for (const kind of Object.values(KINDS)) if (aiFounds(pid, player, city, kind)) return;
  }
}

function aiFounds(pid, player, city, kind) {
  if (foundingRefusal(city.id, kind)) return false;
  if (!foundingTiles(city.id).some(wonderAdjacent)) return false;
  const price = foundPrice(city.id, kind);
  if (safe(() => player.Treasury.goldBalance, 0) < price * 1.5) return false;
  safe(() => Players.grantYield(pid, YieldTypes.YIELD_GOLD, -price));
  startFounding(kind, pid, city.id, "gold", price);   // an AI's founding is placed at once (autoFound)
  return true;
}

// The AI never builds Expand National Park: the game has no AI weighting for projects (no AiLists system for them),
// and none queued it in 35 turns. So each turn an AI's park weighs buying one with the AI's own Gold, at the
// price a player pays, saving for it when it is worth it (aiSavingStep in np-core.js).

/** An AI's park takes its best land at once: wonders, then mountains, then wild cover, then open ground. */
export function autoPick(park) {
  if (state.multiplayer) return;
  const added = [];
  while (park.pending > 0) {
    const options = eligibleTiles(park).filter((t) => aiTakes(t, park.owner));
    if (!options.length) break;
    options.sort((a, b) => aiScore(b) - aiScore(a) || a - b);
    if (!addTile(park, options[0])) break;
    added.push(options[0]);
  }
  if (isFull(park)) park.pending = 0;
  save();
  if (added.length) { drawPark(park, added); refreshGeoLabels(); log(`AI park ${park.id} took ${added.length} tile(s)`); }
}

function atWarWithMajor(pid) {
  const me = safe(() => Players.get(pid), null);
  if (!me || !me.Diplomacy) return false;
  // Independent powers always read as at war (engine-closed.md); only other major civilizations count.
  return safe(() => Players.getAlive().some((o) => o.id !== pid && o.isMajor && me.Diplomacy.isAtWarWith(o.id)), false);
}

/** The facts an AI weighs for one park (np-core.js aiSavingStep). */
export function aiFacts(park) {
  const kind = kindOf(park);
  const owner = park.owner;
  const best = eligibleTiles(park).filter((t) => aiTakes(t, owner)).sort((a, b) => aiScore(b) - aiScore(a) || a - b)
    .slice(0, Math.min(tilesPerExpansion(), room(park)));
  const gains = best.map((t) => tileGain(t, park));
  const city = safe(() => Cities.get(settlementOf(park)), null);
  const player = safe(() => Players.get(owner), null);
  return {
    price: expansionPrice(settlementOf(park), kind),
    gold: safe(() => player.Treasury.goldBalance, 0),
    goldPerTurn: safe(() => player.Stats.getNetYield(YieldTypes.YIELD_GOLD), 0),
    atWar: atWarWithMajor(owner),
    gain: gains.reduce((n, g) => n + g.points, 0),
    happinessGain: gains.reduce((n, g) => n + g.happiness, 0),
    paysHappiness: kind.key === "park",
    unhappy: safe(() => city.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0) < 0,
    tiles: best.length,
  };
}

/** The AI founding pass, once a game turn (hotseat sweeps once per human seat). */
export function foundAiPass() {
  if (state.multiplayer) return;
  const turn = safe(() => Game.turn, -1);
  if (state.foundTurn === turn) return;
  state.foundTurn = turn;
  foundAiParks();
}

export function growAiParks() {
  if (state.multiplayer) return;
  // Once a game turn: in hotseat every human seat's turn start sweeps, and an AI saves and buys once a turn, not once a
  // seat.
  const turn = safe(() => Game.turn, -1);
  if (state.aiTurn === turn) return;
  state.aiTurn = turn;
  state.aiRuns++;
  for (const park of parks()) if (weighsExpansion(park)) expansionTurn(park);
}

/** An AI's park with room and no land waiting weighs an expansion each turn, once its founding improvement stands. */
function weighsExpansion(park) {
  return !(isHuman(park.owner) || isIndependent(park.owner) || isFull(park) || park.pending > 0 || park.founding);
}

/** One turn of an AI's park saving for an expansion, and buying it once the fund covers the price. */
function expansionTurn(park) {
  const f = { ...aiFacts(park), fund: park.aiFund || 0 };
  const step = aiSavingStep(f);
  const gold = (n) => safe(() => Players.grantYield(park.owner, YieldTypes.YIELD_GOLD, n));
  if (step.refund > 0) { gold(step.refund); park.aiFund = 0; save(); log(`AI park ${park.id}: ${step.refund} Gold set aside returned (${step.why})`); }
  if (!step.worth) return;
  if (step.charge > 0) { gold(-step.charge); park.aiFund = (park.aiFund || 0) + step.charge; }
  if (step.buy) buyForAi(park, f, step);
  else if (step.charge > 0) log(`AI park ${park.id}: ${step.charge} Gold set aside for an expansion (${park.aiFund} of ${f.price})`);
  save();
}

function buyForAi(park, f, step) {
  park.aiFund = Math.max(0, park.aiFund - f.price);
  park.pending = tilesPerExpansion();
  log(`AI park ${park.id}: expansion bought for ${f.price} Gold (gain ${f.gain}/turn, pays back in ${Math.round(step.payback)} turns)`);
  autoPick(park);
}
