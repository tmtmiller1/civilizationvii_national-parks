// np-main.js - National Park, a Civilization VII mod. Game scope, Exploration and Modern Ages.
//
//   Founding. Found National Park (a city's project, or a purchase in a city or town, np-purchase.js) records a
//     founding; the park is then placed by script on an empty, Charming tile its settlement holds (np-core.js
//     charmingAt), chosen in np-picker.js from the Choose land prompt (an AI's is chosen for it). The engine cannot
//     place it there itself (np-core.js). The projects are gated here, through the wrapped placement query: hidden
//     until the age's civic is done and once the settlement has that kind of park, grayed when it holds no such tile.
//   Protection. Park land is refused to every other build, purchase and city growth (the same wrap), and a
//     request aimed at it is not sent. The AI plans natively and is not held; land it builds on leaves the park.
//   Growth. Each Expand National Park completion (CityProjectCompleted, whose location is the park's founding
//     tile) gives the park TILES_PER_EXPANSION tiles to take: the local player picks them in np-picker.js from the
//     Choose land prompt, an AI's are picked for it. An AI's park also buys expansions with Gold (growAiParks).
//   Safety net. On load and at the start of every local turn the map is swept: new parks are registered and named,
//     parks follow their founding tile's owner, lost or built-on land is dropped, and a park is redrawn when its
//     tiles, owner or visible tiles changed.
//   Full size. A park stops at MAX_PARK_TILES; Expand National Park is then refused in its city.
//   Network games: CREATE_ELEMENT and the save's record are local, so there the mod writes nothing (np-core.js
//     setReadOnly). Parks are read from the map at load and each turn, drawn, shaded and named; the founding rule and
//     park-land protection apply; parks do not grow (Expand National Park is refused).
"use strict";

import {
  KINDS, kindOf, kindByProject, kindByFoundProject, parkKindAt, tilesPerExpansion, safe, log, idx, locOf, ringOf, isWonder, ownerOf, parks,
  parkAtAnchor, allParkTiles, createPark, dissolvePark, reconcile, eligibleTiles, addTile,
  aiScore, aiTakes, aiSavingStep, tileGain, room, save, displayName, ensureMarkers, isFull, expansionPrice, settlementOf, scanMap, removeOrphanMarkers, removeOrphanWilds,
  setReadOnly, until, isIndependent, foundings, foundingById, addFounding, settlementHasKind, foundingTiles, foundPark,
  dropFounding, GOLD_PER_PRODUCTION, gameAppeal,
} from "./np-core.js";
import * as core from "./np-core.js";
import * as draw from "./np-draw.js";
import { drawPark, clearPark, clearAll, isDrawnCurrent, refreshBorders } from "./np-draw.js";
import { registerLens, applySettings } from "./np-lens.js";
import { setPurchaseHandler } from "./np-purchase.js";
import { generateName, registerWithGeoLabels, unregisterFromGeoLabels, refreshGeoLabels } from "./np-names.js";
import { openPicker, openFoundingPicker, offerFoundingDialog, chooseTile, confirmChoice, finishChoice, startPrompt, stopPrompt, noticeNoLand,
  setBuyHandler, buySelected } from "./np-picker.js";

const G = globalThis;
const KEY = "__towerNationalPark";
const VERSION = "1.0.2";
const SETTLE_MS = 600;
const EVENT_SETTLE_MS = 1500;
// A park piece landing is drawn sooner, so new park land is not left bare while the dressing waits (about 2 s before).
const PARK_EVENT_MS = 250;

// The lens registers as the script loads, before the lens menu is built (as Cultural Diffusion does).
registerLens();

const state = { originals: null, wrappers: null, listeners: [], multiplayer: false, parkKeys: new Set(), projectKeys: new Set(),
  foundKeys: new Map(),   // Found project raw id or hash -> kind
  markerKeys: new Set(),  // park land markers (raw id and hash), whose landing redraws a park at once
  on: false, sweepTimer: 0, sweepReason: null, offerTimer: 0, spending: 0, aiTurn: null, aiRuns: 0 };

// placement

function isParkType(raw) { return raw != null && state.parkKeys.has(raw); }
function plotOfArgs(args) {
  if (!args || args.X == null || args.Y == null || args.X < 0 || args.Y < 0) return -1;
  return safe(() => idx({ x: args.X, y: args.Y }), -1);
}
function wonderAdjacent(i) { return ringOf(i).some((n) => n >= 0 && isWonder(n)); }

/** Which plots a request may use, or null when this mod has no say in it: park land is refused to every build. */
function ruleFor(type, args) {
  const building = type === CityOperationTypes.BUILD || type === CityCommandTypes.PURCHASE;
  const expanding = type === CityCommandTypes.EXPAND;
  if (!(building && args && args.ConstructibleType != null) && !expanding) return null;
  const land = allParkTiles();
  if (!land.size) return null;
  return { keep: (p) => !land.has(p), reason: "LOC_NP_TILE_IS_PARKLAND" };
}

// founding

/** The civic that unlocks a kind in this age (its ProgressionTreeNodeUnlocks row), and whether `owner` has it. */
function civicDone(owner, kind) {
  const row = safe(() => [...GameInfo.ProgressionTreeNodeUnlocks].find((r) => r.TargetType === kind.improvement), null);
  if (!row) return false;
  return !!safe(() => Players.get(owner).Culture.isNodeUnlocked(row.ProgressionTreeNodeType), false);
}

/** The kind a Found project request is for, or null. */
function foundKindOf(type, args) {
  if (type !== CityOperationTypes.BUILD || !args || args.ProjectType == null) return null;
  return state.foundKeys.get(args.ProjectType) || null;
}

/**
 * Whether a settlement may found a park of `kind` now: "" when it may, else "hide" (the network game, the civic not
 * yet done, or a park of that kind already there or waiting for its tile) or the text tag of why it is grayed.
 */
function foundingRefusal(cityID, kind) {
  if (state.multiplayer || isIndependent(cityID && cityID.owner)) return "hide";
  if (!civicDone(cityID.owner, kind)) return "hide";
  if (settlementHasKind(cityID, kind.key)) return "hide";
  if (!foundingTiles(cityID).length) return "LOC_NP_FOUND_NO_LAND";
  return "";
}

/** The Gold price of founding a park in a settlement, at the game's 4 Gold per point of production. */
function foundPrice(cityID, kind) {
  const cost = safe(() => Cities.get(cityID).Production.getProjectProductionCost(GameInfo.Projects.lookup(kind.found).$index), 400);
  return Math.round(GOLD_PER_PRODUCTION * (cost > 0 ? cost : 400));
}

/** A founding was paid for: a human chooses the tile from the Choose land prompt, an AI's park is placed at once. */
function startFounding(kind, owner, cityID, from) {
  const f = addFounding(kind.key, owner, cityID);
  log(`founding ${f.id}: ${kind.key} for ${owner}:${cityID.id} (${from})`);
  if (!isHuman(owner)) autoFound(f);
  else if (isLocal(owner) && !foundingTiles(cityID).length) setTimeout(() => noticeNoLand(null, f), 1500);
  return f;
}

/** Place an AI's founding on its best tile (every candidate is Charming or better): beside a natural wonder first, then
 *  the most appealing, then among the wildest land. */
function autoFound(f) {
  const tiles = foundingTiles(f.city);
  if (!tiles.length) return null;
  const score = (t) => (wonderAdjacent(t) ? 100 : 0) + 10 * gameAppeal(t) + ringOf(t).filter((n) => n >= 0).reduce((s, n) => s + aiScore(n), 0);
  tiles.sort((a, b) => score(b) - score(a) || a - b);
  const park = foundPark(f, tiles[0]);
  if (park) { park.autoName = generateName(park); save(); drawPark(park, [park.anchor]); refreshGeoLabels(); }
  return park;
}

/** Buy a founding for Gold in a city or town. Returns "" on success, else the reason's text tag. */
function buyFounding(cityID, kind) {
  const owner = cityID && cityID.owner;
  if (!isLocal(owner) || state.multiplayer) return "LOC_NP_BUY_NONE";
  const why = foundingRefusal(cityID, kind);
  if (why) return why === "hide" ? "LOC_NP_BUY_NONE" : why;
  const price = foundPrice(cityID, kind);
  const balance = () => safe(() => Players.get(owner).Treasury.goldBalance, 0);
  const gold = balance();
  if (gold - state.spending < price) return "LOC_NP_BUY_GOLD";
  state.spending += price;
  safe(() => Players.grantYield(owner, YieldTypes.YIELD_GOLD, -price));
  until(() => balance() <= gold - price + 0.5, 10000).then(() => { state.spending = Math.max(0, state.spending - price); });
  const f = startFounding(kind, owner, cityID, `bought for ${price} Gold`);
  setTimeout(() => offerFounding(f.id), 300);
  return "";
}

/** Offer a founding's pop-up (Choose land or Later) once nothing else is on screen, retrying meanwhile. */
function offerFounding(id, tries = 0) {
  clearTimeout(state.offerTimer);
  const f = foundingById(id);
  if (!f || !isLocal(f.owner) || !foundingTiles(f.city).length || offerFoundingDialog(f)) return;
  if (tries < 120) state.offerTimer = setTimeout(() => offerFounding(id, tries + 1), 2500);
}

// The AI weighs founding once a turn with its own Gold, as it weighs expansions: at peace, with Gold coming in, it
// founds a park where a settlement holds empty land beside a natural wonder (as the AIs did when they built the
// improvement themselves), one founding a turn for each AI.
function foundAiParks() {
  for (const pid of safe(() => Players.getAliveMajorIds(), []) || []) {
    if (isHuman(pid) || atWarWithMajor(pid)) continue;
    const player = safe(() => Players.get(pid), null);
    const income = safe(() => player.Stats.getNetYield(YieldTypes.YIELD_GOLD), 0);
    if (!player || income <= 0) continue;
    let done = false;
    for (const city of safe(() => player.Cities.getCities(), []) || []) {
      if (done) break;
      for (const kind of Object.values(KINDS)) {
        if (foundingRefusal(city.id, kind)) continue;
        if (!foundingTiles(city.id).some(wonderAdjacent)) continue;
        const price = foundPrice(city.id, kind);
        if (safe(() => player.Treasury.goldBalance, 0) < price * 1.5) continue;
        safe(() => Players.grantYield(pid, YieldTypes.YIELD_GOLD, -price));
        startFounding(kind, pid, city.id, `AI, ${price} Gold`);   // an AI's founding is placed at once (autoFound)
        done = true;
        break;
      }
    }
  }
}

/** The park of the given kind ("park" or "wilderness") in the settlement a request names, or null. */
function parkOfCity(cityID, kind = null) {
  return parks().find((p) => {
    if (kind && kindOf(p).key !== kind) return false;
    const l = locOf(p.anchor);
    const c = safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null);
    return !!c && !!cityID && c.id === cityID.id && c.owner === cityID.owner;
  }) || null;
}

function isExpandProject(type, args) {
  return type === CityOperationTypes.BUILD && !!args && args.ProjectType != null && state.projectKeys.has(args.ProjectType);
}

/** The kind ("park" or "wilderness") an Expand project raw id belongs to, or null. */
function projectKind(raw) {
  const k = kindByProject(safe(() => GameInfo.Projects.lookup(raw).ProjectType, null));
  return k ? k.key : null;
}

/** An Expand request from a settlement whose park of that kind is at its full size. */
function expandsFullPark(cityID, type, args) {
  return isExpandProject(type, args) && isFull(parkOfCity(cityID, projectKind(args.ProjectType)));
}

function refuse(res, reason) {
  return { ...(res || {}), Success: false, Plots: [], ExpandUrbanPlots: [], FailureReasons: [safe(() => Locale.compose(reason), reason)] };
}

function wrapCanStart(original) {
  return function (cityID, type, args, ...rest) {
    const res = original(cityID, type, args, ...rest);
    if (!state.on) return res;
    try {
      // A park does not grow in a network game (nothing answers the project's completion there).
      if (state.multiplayer && isExpandProject(type, args)) return refuse(res, "LOC_NP_MULTIPLAYER");
      // Refused, not hidden: the production list shows the project grayed out, and its text names the size limit.
      if (expandsFullPark(cityID, type, args)) return { ...(res || {}), Success: false };
      const fk = foundKindOf(type, args);
      if (fk) {
        const why = foundingRefusal(cityID, fk);
        if (why === "hide") return { ...(res || {}), Success: false, Requirements: { ...((res && res.Requirements) || {}), MeetsRequirements: false } };
        if (why) return refuse(res, why);
        return res;
      }
      const rule = ruleFor(type, args);
      if (!rule || !res) return res;
      const at = plotOfArgs(args);
      if (at >= 0) return rule.keep(at) ? res : refuse(res, rule.reason);
      const had = (res.Plots && res.Plots.length) || (res.ExpandUrbanPlots && res.ExpandUrbanPlots.length);
      if (!had) return res;
      const out = { ...res };
      if (Array.isArray(res.Plots)) out.Plots = res.Plots.filter(rule.keep);
      if (Array.isArray(res.ExpandUrbanPlots)) out.ExpandUrbanPlots = res.ExpandUrbanPlots.filter(rule.keep);
      if (!(out.Plots && out.Plots.length) && !(out.ExpandUrbanPlots && out.ExpandUrbanPlots.length)) return refuse(res, rule.reason);
      return out;
    } catch (_e) { return res; }
  };
}

function wrapSendRequest(original) {
  return function (cityID, type, args, ...rest) {
    if (state.on) {
      if (state.multiplayer && safe(() => isExpandProject(type, args), false)) { log("Expand National Park refused: network game"); return false; }
      if (safe(() => expandsFullPark(cityID, type, args), false)) { log("Expand National Park refused: the park is at its full size"); return false; }
      const fk = safe(() => foundKindOf(type, args), null);
      if (fk && safe(() => foundingRefusal(cityID, fk), "hide")) { log(`Found ${fk.key} refused in ${cityID && cityID.id}`); return false; }
      const rule = safe(() => ruleFor(type, args), null);
      const at = plotOfArgs(args);
      if (rule && at >= 0 && !rule.keep(at)) {
        const l = locOf(at);
        log(`request refused at ${l.x},${l.y}: ${rule.reason}`);
        return false;
      }
    }
    return original(cityID, type, args, ...rest);
  };
}

// growth

function isLocal(owner) { return owner === safe(() => GameContext.localPlayerID, -99); }
/** A human's park waits for its owner to choose (in hotseat too, on that player's turn); an AI's is chosen for it. */
function isHuman(owner) { return !!safe(() => Players.get(owner).isHuman, false); }

/** An AI's park takes its best land at once: wonders, then mountains, then wild cover, then open ground. */
function autoPick(park) {
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

// The AI never builds Expand National Park: the game has no AI weighting for projects (no AiLists system for them),
// and none queued it in 35 turns. So each turn an AI's park weighs buying one with the AI's own Gold, at the
// price a player pays, saving for it when it is worth it (aiSavingStep in np-core.js).

function atWarWithMajor(pid) {
  const me = safe(() => Players.get(pid), null);
  if (!me || !me.Diplomacy) return false;
  // Independent powers always read as at war (engine-closed.md); only other major civilizations count.
  return safe(() => Players.getAlive().some((o) => o.id !== pid && o.isMajor && me.Diplomacy.isAtWarWith(o.id)), false);
}

/** The facts an AI weighs for one park (np-core.js aiSavingStep). */
function aiFacts(park) {
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
function foundAiPass() {
  if (state.multiplayer) return;
  const turn = safe(() => Game.turn, -1);
  if (state.foundTurn === turn) return;
  state.foundTurn = turn;
  foundAiParks();
}

function growAiParks() {
  if (state.multiplayer) return;
  // Once a game turn: in hotseat every human seat's turn start sweeps, and an AI saves and buys once a turn, not once a seat.
  const turn = safe(() => Game.turn, -1);
  if (state.aiTurn === turn) return;
  state.aiTurn = turn;
  state.aiRuns++;
  for (const park of parks()) {
    if (isHuman(park.owner) || isIndependent(park.owner) || isFull(park) || park.pending > 0) continue;
    const f = { ...aiFacts(park), fund: park.aiFund || 0 };
    const step = aiSavingStep(f);
    const gold = (n) => safe(() => Players.grantYield(park.owner, YieldTypes.YIELD_GOLD, n));
    if (step.refund > 0) { gold(step.refund); park.aiFund = 0; save(); log(`AI park ${park.id}: ${step.refund} Gold set aside returned (${step.why})`); }
    if (!step.worth) continue;
    if (step.charge > 0) { gold(-step.charge); park.aiFund = (park.aiFund || 0) + step.charge; }
    if (step.buy) {
      park.aiFund = Math.max(0, park.aiFund - f.price);
      park.pending = tilesPerExpansion();
      log(`AI park ${park.id}: expansion bought for ${f.price} Gold (gain ${f.gain}/turn, pays back in ${Math.round(step.payback)} turns)`);
      autoPick(park);
    } else if (step.charge > 0) {
      log(`AI park ${park.id}: ${step.charge} Gold set aside for an expansion (${park.aiFund} of ${f.price})`);
    }
    save();
  }
}

function onProjectCompleted(data) {
  if (state.multiplayer) return;
  const founding = kindByFoundProject(safe(() => GameInfo.Projects.lookup(data.projectType).ProjectType, null));
  if (founding) {
    const cityID = data.cityID;
    if (!cityID || settlementHasKind(cityID, founding.key)) { log(`Found ${founding.key} completed with one already there`); return; }
    const f = startFounding(founding, cityID.owner, cityID, "project");
    if (f && isLocal(f.owner)) setTimeout(() => offerFounding(f.id), 1500);
    return;
  }
  const kind = kindByProject(safe(() => GameInfo.Projects.lookup(data.projectType).ProjectType, null));
  if (!kind) return;
  const anchor = safe(() => idx(data.location), -1);
  const find = () => { const a = parkAtAnchor(anchor); return a && kindOf(a) === kind ? a : parkOfCity(data.cityID, kind.key); };
  let park = find();
  if (!park) { sweep("project"); park = find(); }
  if (!park) { log(`Expand National Park completed at plot ${anchor} with no park there`); return; }
  if (isFull(park)) { log(`park ${park.id} is at its full size; the expansion adds nothing`); return; }
  park.pending = (park.pending || 0) + tilesPerExpansion();
  save();
  log(`park ${park.id} "${displayName(park)}" may take ${park.pending} tile(s)`);
  // A human's tiles wait for the Choose land prompt; the picker is not opened over the start of their turn.
  if (!isHuman(park.owner)) autoPick(park);
  else if (isLocal(park.owner) && !eligibleTiles(park).length) setTimeout(() => noticeNoLand(park), 1500);
}

/**
 * Buy one expansion for Gold (the way a town grows its park; a city may too). Refused while the park is full or the
 * treasury is short. Returns "" on success, else the reason's text tag.
 */
function buyExpansion(park) {
  const owner = park && park.owner;
  if (!park || !isLocal(owner) || state.multiplayer) return "LOC_NP_BUY_NONE";
  if (isFull(park)) return "LOC_NP_BUY_FULL";
  const price = expansionPrice(settlementOf(park), kindOf(park));
  const balance = () => safe(() => Players.get(owner).Treasury.goldBalance, 0);
  // The Gold leaves the treasury a few seconds after the call, so a second purchase in that window
  // counts what is still on its way out.
  const gold = balance();
  if (gold - state.spending < price) return "LOC_NP_BUY_GOLD";
  state.spending += price;
  safe(() => Players.grantYield(owner, YieldTypes.YIELD_GOLD, -price));
  until(() => balance() <= gold - price + 0.5, 10000).then(() => { state.spending = Math.max(0, state.spending - price); });
  park.pending = (park.pending || 0) + tilesPerExpansion();
  save();
  log(`park ${park.id}: expansion bought for ${price} Gold; ${park.pending} tile(s) to take`);
  if (!eligibleTiles(park).length) setTimeout(() => noticeNoLand(park), 300);
  else setTimeout(offerPicker, 300);
  return "";
}

/** Open the picker for the first local park with land to take, right after the player bought an expansion, retrying
 *  while a screen or another chooser is open. Otherwise the picker opens only from the Choose land prompt. */
function offerPicker(tries = 0) {
  clearTimeout(state.offerTimer);
  const park = parks().find((p) => isLocal(p.owner) && p.pending > 0 && eligibleTiles(p).length);
  if (!park || openPicker(park.id, "a Gold purchase")) return;
  if (tries < 120) state.offerTimer = setTimeout(() => offerPicker(tries + 1), 2500);
}

// sweep

/** Reconcile the registry with the map. Every park is drawn on load; after that a park is redrawn only when its
 *  record changed or its drawing is out of date (new tiles, a new owner, fog lifted over it). */
function sweep(reason) {
  if (!state.on) return;
  const redrawAll = reason === "load" || reason === "manual";
  const touched = new Set();
  for (const p of [...parks()]) {
    const r = reconcile(p);
    if (r === "dissolved") {
      // Gold an AI set aside for the park goes back to its treasury.
      if (p.aiFund > 0 && !isHuman(p.owner) && !state.multiplayer) safe(() => Players.grantYield(p.owner, YieldTypes.YIELD_GOLD, p.aiFund));
      clearPark(p.id); dissolvePark(p.id); touched.add(p.id); log(`park ${p.id} dissolved: its founding improvement is gone`);
    }
    else if (r === "changed") touched.add(p.id);
  }
  const created = [];
  // The whole map is read only when a new park may have appeared: on load, at turn start, and when a park improvement
  // is placed. Other constructions only re-check the parks' own tiles.
  const scan = redrawAll || reason === "turn" || reason === "park" || reason === "project";
  const map = scan ? scanMap() : { anchors: [], markers: [] };
  for (const i of map.anchors) {
    if (parkAtAnchor(i)) continue;
    const p = createPark(i, ownerOf(i), parkKindAt(i) || "park");
    p.autoName = generateName(p);
    created.push(p);
    touched.add(p.id);
  }
  if (touched.size) save();
  if (scan) { removeOrphanMarkers(map.markers); removeOrphanWilds(map.wilds); }
  // An AI's park picks its land when an expansion completes; one inherited from a human with tiles waiting picks now.
  for (const p of parks()) if (p.pending > 0 && !isHuman(p.owner) && !isIndependent(p.owner) && eligibleTiles(p).length) autoPick(p);
  if (reason === "turn") { growAiParks(); foundAiPass(); }
  // A founding whose settlement is gone or changed hands is let go.
  for (const f of [...foundings()]) if (!safe(() => Cities.get(f.city), null) || safe(() => Cities.get(f.city).owner, -1) !== f.owner) { dropFounding(f.id); log(`founding ${f.id} let go: its settlement changed hands`); }
  for (const f of foundings()) if (!isHuman(f.owner) && foundingTiles(f.city).length) autoFound(f);
  for (const p of parks()) { const n = ensureMarkers(p); if (n) log(`park ${p.id}: ${n} land marker(s) placed`); }
  for (const p of parks()) {
    if (created.includes(p)) drawPark(p, [p.anchor]);
    else if (redrawAll || touched.has(p.id) || !isDrawnCurrent(p)) drawPark(p);
  }
  if (touched.size) refreshGeoLabels();
  if (reason !== "project") log(`sweep (${reason}): ${parks().length} park(s)${created.length ? `, ${created.length} new` : ""}`);
}

/** Whether a construction event is about a park improvement (so a new park may need registering). */
function isParkEvent(d) {
  const t = safe(() => d.constructibleType ?? d.ConstructibleType ?? d.type, null);
  return t != null && state.parkKeys.has(t);
}
function isMarkerEvent(d) {
  const t = safe(() => d.constructibleType ?? d.ConstructibleType ?? d.type, null);
  return t != null && state.markerKeys.has(t);
}

function scheduleSweep(reason, ms = SETTLE_MS) {
  // A pending park sweep is not pushed back by the events that follow it (the engine's own improvement coming off).
  if (state.sweepReason === "park" && state.sweepDue && state.sweepDue <= Date.now() + ms) return;
  state.sweepDue = Date.now() + ms;
  clearTimeout(state.sweepTimer);
  // A burst of events keeps one pending sweep; a park event widens it to a full scan.
  if (state.sweepReason !== "park") state.sweepReason = reason;
  state.sweepTimer = setTimeout(() => { const r = state.sweepReason; state.sweepReason = null; sweep(r); }, ms);
}

// install

function listen(name, fn) {
  if (safe(() => { engine.on(name, fn); return true; }, false)) state.listeners.push([name, fn]);
}

function start() {
  if (!safe(() => GameInfo.Constructibles.lookup(KINDS.park.improvement), null)) {
    log("no National Park in the database (the Antiquity Age); inactive");
    return false;
  }
  for (const k of Object.values(KINDS)) {
    const def = safe(() => GameInfo.Constructibles.lookup(k.improvement), null);
    if (def) { state.parkKeys.add(def.$index); safe(() => state.parkKeys.add(GameInfo.Types.lookup(k.improvement).Hash)); }
    for (const m of [k.land, k.wild, ...k.landLevels]) {
      const md = safe(() => GameInfo.Constructibles.lookup(m), null);
      if (md) { state.markerKeys.add(md.$index); safe(() => state.markerKeys.add(GameInfo.Types.lookup(m).Hash)); }
    }
    const project = safe(() => GameInfo.Projects.lookup(k.project), null);
    if (project) { state.projectKeys.add(project.$index); safe(() => state.projectKeys.add(GameInfo.Types.lookup(k.project).Hash)); }
    const found = safe(() => GameInfo.Projects.lookup(k.found), null);
    if (found) { state.foundKeys.set(found.$index, k); safe(() => state.foundKeys.set(GameInfo.Types.lookup(k.found).Hash, k)); }
  }
  state.multiplayer = !!state.forceMultiplayer || !!safe(() => Configuration.getGame().isNetworkMultiplayer, false);
  const ops = safe(() => Game.CityOperations, null);
  const cmds = safe(() => Game.CityCommands, null);
  if (!ops || !cmds || typeof ops.canStart !== "function" || typeof cmds.canStart !== "function") {
    log("Game.CityOperations / CityCommands not wrappable; inactive");
    return false;
  }
  setReadOnly(state.multiplayer);
  state.originals = { opsCan: ops.canStart, opsSend: ops.sendRequest, cmdCan: cmds.canStart, cmdSend: cmds.sendRequest };
  state.wrappers = { opsCan: wrapCanStart(ops.canStart.bind(ops)), cmdCan: wrapCanStart(cmds.canStart.bind(cmds)),
    opsSend: typeof ops.sendRequest === "function" ? wrapSendRequest(ops.sendRequest.bind(ops)) : null,
    cmdSend: typeof cmds.sendRequest === "function" ? wrapSendRequest(cmds.sendRequest.bind(cmds)) : null };
  ops.canStart = state.wrappers.opsCan;
  cmds.canStart = state.wrappers.cmdCan;
  if (state.wrappers.opsSend) ops.sendRequest = state.wrappers.opsSend;
  if (state.wrappers.cmdSend) cmds.sendRequest = state.wrappers.cmdSend;
  state.on = true;
  const onChange = (d) => isParkEvent(d) ? scheduleSweep("park", PARK_EVENT_MS)
    : scheduleSweep("changed", isMarkerEvent(d) ? PARK_EVENT_MS : EVENT_SETTLE_MS);
  listen("ConstructibleBuildCompleted", onChange);
  listen("ConstructibleAddedToMap", onChange);
  listen("ConstructibleRemovedFromMap", onChange);
  listen("CityProjectCompleted", (d) => safe(() => onProjectCompleted(d)));
  listen("PlayerTurnActivated", (d) => {
    if (d && isLocal(d.player ?? d.Player)) setTimeout(() => sweep("turn"), SETTLE_MS);
  });
  registerWithGeoLabels();
  setBuyHandler(state.multiplayer ? null : buyExpansion);
  setPurchaseHandler(state.multiplayer ? null : buyExpansion,
    state.multiplayer ? null : { buy: buyFounding, price: foundPrice, refusal: foundingRefusal });
  startPrompt();
  setTimeout(() => sweep("load"), 5000);
  log(state.multiplayer ? `v${VERSION} active in a network game: parks are read from the map and drawn; nothing is written`
    : `v${VERSION} active: parks founded on empty land and grown with Expand National Park`);
  return true;
}

function stop() {
  const ops = safe(() => Game.CityOperations, null);
  const cmds = safe(() => Game.CityCommands, null);
  // Put back a function only where ours is still the outermost: another mod may have wrapped ours since, and
  // replacing its wrapper would drop its rules. Ours, left in a chain, passes everything through once state.on is off.
  const o = state.originals, w = state.wrappers;
  if (o && w) {
    if (ops && ops.canStart === w.opsCan) ops.canStart = o.opsCan;
    if (cmds && cmds.canStart === w.cmdCan) cmds.canStart = o.cmdCan;
    if (ops && w.opsSend && ops.sendRequest === w.opsSend) ops.sendRequest = o.opsSend;
    if (cmds && w.cmdSend && cmds.sendRequest === w.cmdSend) cmds.sendRequest = o.cmdSend;
  }
  for (const [name, fn] of state.listeners) safe(() => engine.off(name, fn));
  state.listeners = [];
  state.originals = null;
  state.wrappers = null;
  state.on = false;
  clearTimeout(state.sweepTimer);
  clearTimeout(state.offerTimer);
  stopPrompt();
  clearAll();
  unregisterFromGeoLabels();
  return "off";
}

if (G[KEY] && typeof G[KEY].stop === "function") safe(() => G[KEY].stop());
G[KEY] = {
  version: VERSION,
  start, stop, sweep: () => sweep("manual"), offerPicker: () => offerPicker(), choose: chooseTile, confirm: confirmChoice,
  done: finishChoice, buySelected, open: (id) => openPicker(id, "a probe"),
  parks: () => parks().map((p) => ({ ...p, name: displayName(p) })),
  core, draw, // the mod's own module instances, for the bench and probes
  applySettings: () => { applySettings(); refreshBorders(); },
  status: () => ({ on: state.on, multiplayer: state.multiplayer, hooks: state.originals ? 4 : 0, parks: parks().length, aiRuns: state.aiRuns }),
  // Probes only: run as in a network game (read-only) from the next start().
  simulateNetworkGame: (on) => { state.forceMultiplayer = !!on; },
  // Probes only: the AI's purchase pass, and the game's own placement checks without this mod's rules.
  growAiParks: () => { state.aiTurn = null; growAiParks(); },
  foundAiParks: () => { state.foundTurn = null; foundAiPass(); },
  foundings: () => foundings().map((f) => ({ ...f, tiles: foundingTiles(f.city).length })),
  buyFounding: (cityID, key = "park") => buyFounding(cityID, KINDS[key]),
  foundingRefusal: (cityID, key = "park") => foundingRefusal(cityID, KINDS[key]),
  aiFacts: (id) => { const p = core.parkById(id); if (!p) return null; const f = { ...aiFacts(p), fund: p.aiFund || 0 }; return { ...f, step: aiSavingStep(f) }; },
  nativeCanStart: () => state.originals && { ops: state.originals.opsCan, cmds: state.originals.cmdCan },
  // Probes only: show a park's no-land notice; name a park founded by script as the picker would.
  notice: (id) => noticeNoLand(core.parkById(id)),
  name: (id) => { const p = core.parkById(id); if (!p) return ""; p.autoName = generateName(p); save(); refreshGeoLabels(); return p.autoName; },
};
start();
