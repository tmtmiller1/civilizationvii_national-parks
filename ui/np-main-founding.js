// np-main-founding.js - National Parks: foundings, from the Found project or a purchase to the park on its tile, the
// build queue's stale projects, and Gold in and out with the notices that tell a player why.
"use strict";

import { GOLD_PER_PRODUCTION, KINDS, addFounding, addNotice, aiScore, dropFounding, dropNotice, foundPark,
  foundingById, foundingFate, foundingRefund, foundingTiles, gameAppeal, isFull, isIndependent, isWonder, kindOf,
  locOf, log, noticesFor, parks, ringOf, safe, save, settlementHasKind, staleQueueEntries, until } from "./np-core.js";
import { drawPark } from "./np-draw.js";
import { isAlive, isHuman, isLocal, later, state } from "./np-main-state.js";
import { generateName, refreshGeoLabels } from "./np-names.js";
import { noticeNoLand, noticeRefund, offerFoundingDialog } from "./np-picker-notices.js";

export function wonderAdjacent(i) { return ringOf(i).some((n) => n >= 0 && isWonder(n)); }

/** The civic that unlocks a kind in this age (its ProgressionTreeNodeUnlocks row), and whether `owner` has it. */
function civicDone(owner, kind) {
  const row = safe(() => [...GameInfo.ProgressionTreeNodeUnlocks].find((r) => r.TargetType === kind.improvement), null);
  if (!row) return false;
  return !!safe(() => Players.get(owner).Culture.isNodeUnlocked(row.ProgressionTreeNodeType), false);
}

/**
 * Whether a settlement may found a park of `kind` now: "" when it may, else "hide" (the network game, the civic not
 * yet done, or a park of that kind already there or waiting for its tile) or the text tag of why it is grayed.
 */
export function foundingRefusal(cityID, kind) {
  if (state.multiplayer || isIndependent(cityID && cityID.owner)) return "hide";
  if (!civicDone(cityID.owner, kind)) return "hide";
  if (settlementHasKind(cityID, kind.key)) return "hide";
  if (!foundingTiles(cityID).length) return "LOC_NP_FOUND_NO_LAND";
  return "";
}

/** The Gold price of founding a park in a settlement, at the game's 4 Gold per point of production. */
export function foundPrice(cityID, kind) {
  const cost = safe(() => Cities.get(cityID).Production
    .getProjectProductionCost(GameInfo.Projects.lookup(kind.found).$index), 400);
  return Math.round(GOLD_PER_PRODUCTION * (cost > 0 ? cost : 400));
}

/** The price to give back for a founding whose record holds none (an older save's), when its own settlement may be
 *  gone: the price in any settlement its owner still holds, else the project's listed cost at the purchase rate. */
function foundPriceNow(owner, kind) {
  const city = safe(() => Players.get(owner).Cities.getCities()[0], null);
  if (city) return foundPrice(city.id, kind);
  return Math.round(GOLD_PER_PRODUCTION * safe(() => GameInfo.Projects.lookup(kind.found).Cost, 400));
}

/** A settlement's name as the game holds it (a text tag, or the player's own words), or "". */
export function nameOfCity(cityID) { return safe(() => String(Cities.get(cityID).name || ""), ""); }

// the build queue
//
// The wrapped placement query refuses a new Found request, but a project already in a build queue is the engine's and
// completes whatever the mod answers. So a Found project is not queued twice, and a queued one that can no longer
// found anything (the same founding was bought for Gold meanwhile) is taken out with the game's own queue edit, the
// request its build queue panel sends for the remove button (model-build-queue.js cancelItem): a BUILD request with
// InsertMode RemoveAt and the entry's position. A copy that completes all the same is paid back (onProjectCompleted).

/** The project type of each entry in a settlement's build queue, in queue order; null for anything but a project. */
export function queuedProjects(cityID) {
  const queue = safe(() => Cities.get(cityID).BuildQueue.getQueue(), null) || [];
  return [...queue].map((e) => {
    if (!e || e.projectType == null || !safe(() => e.orderType === OrderTypes.ORDER_ADVANCE, true)) return null;
    return safe(() => GameInfo.Projects.lookup(e.projectType).ProjectType, null);
  });
}

export function foundQueued(cityID, kind) { return queuedProjects(cityID).includes(kind.found); }

/**
 * Take out of a settlement's build queue the entries that can no longer do anything (np-core.js staleQueueEntries).
 * Only the player at the screen's own queue, on their own turn: the request is the player's, and between the read and
 * the request the queue must not move. Returns how many removals were sent.
 */
export function pruneQueue(cityID) {
  if (state.multiplayer || !cityID || !isLocal(cityID.owner)
    || safe(() => GameContext.hasSentTurnComplete(), false)) return 0;
  const queue = queuedProjects(cityID);
  if (!queue.some((t) => t)) return 0;
  const stale = staleQueueEntries(queue, (key) => settlementHasKind(cityID, key),
    (key) => isFull(parkOfCity(cityID, key)));
  let sent = 0;
  for (const at of stale) {
    const args = { InsertMode: CityOperationsParametersValues.RemoveAt, QueueLocation: at };
    if (!safe(() => Game.CityOperations.canStart(cityID, CityOperationTypes.BUILD, args, false).Success, false)) {
      log(`build queue of ${cityID.id}: ${queue[at]} at ${at} could not be removed`);
      continue;
    }
    safe(() => Game.CityOperations.sendRequest(cityID, CityOperationTypes.BUILD, args));
    log(`build queue of ${cityID.id}: ${queue[at]} at ${at} removed; it could no longer do anything`);
    sent++;
  }
  return sent;
}

/** pruneQueue for every settlement of the player at the screen. */
export function pruneQueues() {
  const me = safe(() => GameContext.localPlayerID, -1);
  for (const city of safe(() => Players.get(me).Cities.getCities(), []) || []) pruneQueue(city.id);
}

// Gold in and out

/**
 * Take `price` Gold from a player's treasury; false when it is short. The Gold leaves a few seconds after the call, so
 * what is still on its way out counts against that player's next purchase.
 */
export function charge(owner, price) {
  const balance = () => safe(() => Players.get(owner).Treasury.goldBalance, 0);
  const gold = balance();
  if (gold - (state.spending.get(owner) || 0) < price) return false;
  state.spending.set(owner, (state.spending.get(owner) || 0) + price);
  safe(() => Players.grantYield(owner, YieldTypes.YIELD_GOLD, -price));
  until(() => balance() <= gold - price + 0.5, 10000)
    .then(() => { state.spending.set(owner, Math.max(0, (state.spending.get(owner) || 0) - price)); });
  return true;
}

/**
 * Give `gold` back to a player for something paid for that came to nothing. A human is told why: the notice is kept
 * in the save's record and shown on that player's own turn (deliverNotices), at once when they are at the screen.
 * `about` names the kind and the settlement or park for the notice; `tell` false when the player asked for it.
 */
export function refund(owner, gold, why, about = {}, tell = true) {
  if (state.multiplayer || !(gold > 0) || !isAlive(owner)) return false;
  safe(() => Players.grantYield(owner, YieldTypes.YIELD_GOLD, gold));
  log(`${gold} Gold returned to player ${owner} (${why})`);
  if (tell && isHuman(owner)) { addNotice({ owner, why, gold, ...about }); later(`notice:${owner}`, () => deliverNotices(owner), 500); }
  return true;
}

/** Show the player at the screen their waiting refund notices, one at a time, once nothing else is on screen. */
export function deliverNotices(owner, tries = 0) {
  if (state.multiplayer || !isLocal(owner)) return;   // another seat's stay in the record until its own turn
  const n = noticesFor(owner)[0];
  if (!n) return;
  if (noticeRefund(n)) { dropNotice(n.id); tries = 0; }
  if (tries < 120 && noticesFor(owner).length) later(`notice:${owner}`, () => deliverNotices(owner, tries + 1), 2500);
}

/** A founding was paid for (`by` "gold" or "project", `paid` its price in Gold): a human chooses the tile from the
 *  Choose land prompt, an AI's park is placed at once. */
export function startFounding(kind, owner, cityID, by, paid) {
  const f = addFounding(kind.key, owner, cityID, { paid, by, name: nameOfCity(cityID) });
  log(`founding ${f.id}: ${kind.key} for ${owner}:${cityID.id} (${by}, ${paid} Gold)`);
  if (!isHuman(owner)) autoFound(f);
  else if (isLocal(owner) && !foundingTiles(cityID).length) later(`noland:${f.id}`, () => tellNoLand(f.id), 1500);
  return f;
}

/** Tell the player at the screen that their founding has no land to stand on; it may wait, or be given up for what it
 *  cost. The turn is recorded, and the reminder comes again FOUNDING_ASK_TURNS later (np-core.js foundingFate). */
function tellNoLand(id) {
  const f = foundingById(id);
  if (!f || !isLocal(f.owner)) return;
  f.asked = safe(() => Game.turn, 0);
  save();
  const gold = foundingRefund(f, foundPriceNow(f.owner, KINDS[f.kind] || KINDS.park));
  noticeNoLand(null, f, { gold, run: () => cancelFounding(id) });
}

/** Give up a founding of the player at the screen for the Gold it cost. Returns the Gold returned. */
export function cancelFounding(id) {
  const f = foundingById(id);
  if (!f || !isLocal(f.owner) || state.multiplayer) return 0;
  const gold = foundingRefund(f, foundPriceNow(f.owner, KINDS[f.kind] || KINDS.park));
  dropFounding(id);
  log(`founding ${id} given up by its owner`);
  return refund(f.owner, gold, "cancelled", {}, false) ? gold : 0;
}

/** Settle one waiting founding (np-core.js foundingFate): a founding that cannot become a park gives its Gold back. */
export function settleFounding(f, reason) {
  const kind = KINDS[f.kind] || KINDS.park;
  const fate = foundingFate(foundingFacts(f, kind));
  if (fate.act === "refund" || fate.act === "drop") letFoundingGo(f, fate, kind);
  else if (fate.act === "ask" && reason === "turn" && isLocal(f.owner)) later(`noland:${f.id}`, () => tellNoLand(f.id), 1500);
}

/** The facts foundingFate weighs for a waiting founding, read now. */
function foundingFacts(f, kind) {
  const city = safe(() => Cities.get(f.city), null);
  return {
    settlement: !!city && safe(() => city.owner, -1) === f.owner, ownerAlive: isAlive(f.owner), human: isHuman(f.owner),
    tiles: foundingTiles(f.city).length, turn: safe(() => Game.turn, 0), asked: f.asked,
    paid: f.paid, price: f.paid > 0 ? 0 : foundPriceNow(f.owner, kind), readOnly: state.multiplayer,
  };
}

function letFoundingGo(f, fate, kind) {
  dropFounding(f.id);
  log(`founding ${f.id} let go (${fate.why}${fate.gold ? `, ${fate.gold} Gold to return` : ""})`);
  if (fate.act === "refund") refund(f.owner, fate.gold, fate.why, { kind: kind.key, name: f.name || "" });
}

/** Place an AI's founding on its best tile (every candidate is Charming or better): beside a natural wonder first, then
 *  the most appealing, then among the wildest land. */
export function autoFound(f) {
  const tiles = foundingTiles(f.city);
  if (!tiles.length) return null;
  const score = (t) => (wonderAdjacent(t) ? 100 : 0) + 10 * gameAppeal(t)
    + ringOf(t).filter((n) => n >= 0).reduce((s, n) => s + aiScore(n), 0);
  tiles.sort((a, b) => score(b) - score(a) || a - b);
  const park = foundPark(f, tiles[0]);
  if (park) { park.autoName = generateName(park); save(); drawPark(park, [park.anchor]); refreshGeoLabels(); }
  return park;
}

/** Buy a founding for Gold in a city or town. Returns "" on success, else the reason's text tag. */
export function buyFounding(cityID, kind) {
  const owner = cityID && cityID.owner;
  if (!isLocal(owner) || state.multiplayer) return "LOC_NP_BUY_NONE";
  const why = foundingRefusal(cityID, kind);
  if (why) return why === "hide" ? "LOC_NP_BUY_NONE" : why;
  const price = foundPrice(cityID, kind);
  if (!charge(owner, price)) return "LOC_NP_BUY_GOLD";
  const f = startFounding(kind, owner, cityID, "gold", price);
  // The same project in this city's build queue could now found nothing: it comes out.
  pruneQueue(cityID);
  later(`offer:${owner}`, () => offerFounding(f.id), 300);
  return "";
}

/** Offer a founding's pop-up (Choose land or Later) once nothing else is on screen, retrying meanwhile. It is its
 *  owner's: once another player is at the screen the offer ends, and the Choose land prompt is the way in. */
export function offerFounding(id, tries = 0) {
  const f = foundingById(id);
  if (!f || !isLocal(f.owner) || !foundingTiles(f.city).length || offerFoundingDialog(f)) return;
  if (tries < 120) later(`offer:${f.owner}`, () => offerFounding(id, tries + 1), 2500);
}

/** The park of the given kind ("park" or "wilderness") in the settlement a request names, or null. */
export function parkOfCity(cityID, kind = null) {
  return parks().find((p) => {
    if (kind && kindOf(p).key !== kind) return false;
    const l = locOf(p.anchor);
    const c = safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null);
    return !!c && !!cityID && c.id === cityID.id && c.owner === cityID.owner;
  }) || null;
}
