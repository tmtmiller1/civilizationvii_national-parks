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
//   Nothing paid for is lost. A Found or Expand project that completes with nothing left to do (a second founding, a
//     full park) is paid back in Gold at the purchase rate, as is a founding whose settlement is lost before its park
//     is placed; a human is told why, on their own turn. A project that can no longer do anything is taken out of the
//     player's build queue.
//   Network games: CREATE_ELEMENT and the save's record are local, so there the mod writes nothing (np-core.js
//     setReadOnly). Parks are read from the map at load and each turn, drawn, shaded and named; the founding rule and
//     park-land protection apply; parks do not grow (Expand National Park is refused).
"use strict";

import * as core from "./np-core.js";
import * as draw from "./np-draw.js";
import { KINDS, kindOf, kindByProject, kindByFoundProject, parkKindAt, tilesPerExpansion, safe, log, idx, ownerOf,
  parks, parkAtAnchor, createPark, dissolvePark, reconcile, eligibleTiles, aiSavingStep, save, displayName,
  ensureMarkers, isFull, expansionPrice, settlementOf, scanMap, removeOrphanMarkers, removeOrphanWilds, setReadOnly,
  isIndependent, foundings, settlementHasKind, foundingTiles, completionOutcome, notices, noticesFor,
  autoplaying } from "./np-core.js";
import { drawPark, clearPark, clearAll, isDrawnCurrent, refreshBorders } from "./np-draw.js";
import { registerLens, applySettings } from "./np-lens.js";
import { aiFacts, autoPick, foundAiPass, growAiParks } from "./np-main-ai.js";
import { autoFound, buyFounding, cancelFounding, charge, deliverNotices, foundPrice, foundingRefusal, nameOfCity,
  offerFounding, parkOfCity, pruneQueue, pruneQueues, queuedProjects, refund, settleFounding,
  startFounding } from "./np-main-founding.js";
import { wrapCanStart, wrapSendRequest } from "./np-main-guard.js";
import { isHuman, isLocal, later, state } from "./np-main-state.js";
import { generateName, registerWithGeoLabels, unregisterFromGeoLabels, refreshGeoLabels } from "./np-names.js";
import { openPicker, openFoundingPicker, chooseTile, confirmChoice, finishChoice } from "./np-picker.js";
import { noticeNoLand } from "./np-picker-notices.js";
import { startPrompt, stopPrompt, setBuyHandler, buySelected } from "./np-picker-prompt.js";
import { setPurchaseHandler } from "./np-purchase.js";

const G = globalThis;
const KEY = "__towerNationalPark";
const VERSION = "1.1.3";
const SETTLE_MS = 600;
const EVENT_SETTLE_MS = 1500;
// A park piece landing is drawn sooner, so new park land is not left bare while the dressing waits (about 2 s before).
const PARK_EVENT_MS = 250;

// The lens registers as the script loads, before the lens menu is built (as Cultural Diffusion does).
registerLens();

// projects completed, and expansions bought

function onProjectCompleted(data) {
  if (state.multiplayer) return;
  // A completion that can do nothing has still cost its city the production: that goes back as Gold, at the rate the
  // same thing is sold for (np-core.js completionOutcome), and its owner is told.
  const cityID = data.cityID || null;
  const founding = kindByFoundProject(safe(() => GameInfo.Projects.lookup(data.projectType).ProjectType, null));
  if (founding) { foundCompleted(cityID, founding); return; }
  const kind = kindByProject(safe(() => GameInfo.Projects.lookup(data.projectType).ProjectType, null));
  if (kind) expandCompleted(data, cityID, kind);
}

/** A Found project done: a founding waits for its tile, or what it cost goes back. */
function foundCompleted(cityID, founding) {
  const out = completionOutcome({ project: "found", settlement: !!cityID,
    hasKind: !!cityID && settlementHasKind(cityID, founding.key), price: cityID ? foundPrice(cityID, founding) : 0 });
  if (out.act !== "found") {
    log(`Found ${founding.key} completed with nothing to found (${out.why})`);
    if (out.act === "refund") refund(cityID.owner, out.gold, out.why, { kind: founding.key, name: nameOfCity(cityID) });
    return;
  }
  const f = startFounding(founding, cityID.owner, cityID, "project", out.gold);
  if (f && isLocal(f.owner)) later(`offer:${f.owner}`, () => offerFounding(f.id), 1500);
}

/** An Expand project done: its park may take more land, or, full or gone, what it cost goes back. */
function expandCompleted(data, cityID, kind) {
  const anchor = safe(() => idx(data.location), -1);
  const find = () => {
    const a = parkAtAnchor(anchor);
    return a && kindOf(a) === kind ? a : parkOfCity(cityID, kind.key);
  };
  let park = find();
  if (!park) { sweep("project"); park = find(); }
  const out = completionOutcome({ project: "expand", settlement: !!cityID, park: !!park, full: isFull(park),
    price: cityID ? expansionPrice(cityID, kind) : 0 });
  if (out.act !== "expand") expandWasted(park, anchor, out, { cityID, kind });
  else growPark(park);
}

function expandWasted(park, anchor, out, { cityID, kind }) {
  log(park ? `park ${park.id} is at its full size; the expansion adds nothing` : `Expand National Park completed at plot ${anchor} with no park there`);
  if (out.act === "refund") refund(cityID.owner, out.gold, out.why, { kind: kind.key, name: nameOfCity(cityID), park: park ? displayName(park) : "" });
}

/** The park may take another expansion's tiles. A human's tiles wait for the Choose land prompt; the picker is not
 *  opened over the start of their turn. An AI's are picked at once. */
function growPark(park) {
  park.pending = (park.pending || 0) + tilesPerExpansion();
  save();
  log(`park ${park.id} "${displayName(park)}" may take ${park.pending} tile(s)`);
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
  if (!charge(owner, price)) return "LOC_NP_BUY_GOLD";
  park.pending = (park.pending || 0) + tilesPerExpansion();
  save();
  log(`park ${park.id}: expansion bought for ${price} Gold; ${park.pending} tile(s) to take`);
  if (!eligibleTiles(park).length) setTimeout(() => noticeNoLand(park), 300);
  else later(`offer:${owner}`, () => offerPicker(owner), 300);
  return "";
}

/** Open the picker for a player's first park with land to take, right after that player bought an expansion, retrying
 *  while a screen or another chooser is open; it ends once another player is at the screen. Otherwise the picker opens
 *  only from the Choose land prompt. */
function offerPicker(owner = safe(() => GameContext.localPlayerID, -1), tries = 0) {
  if (!isLocal(owner)) return;
  const park = parks().find((p) => p.owner === owner && p.pending > 0 && eligibleTiles(p).length);
  if (!park || openPicker(park.id, "a Gold purchase")) return;
  if (tries < 120) later(`offer:${owner}`, () => offerPicker(owner, tries + 1), 2500);
}

// sweep

/** Reconcile the registry with the map. Every park is drawn on load; after that a park is redrawn only when its
 *  record changed or its drawing is out of date (new tiles, a new owner, fog lifted over it). */
function sweep(reason) {
  if (!state.on) return;
  reason = heldOrNow(reason);
  if (!reason) return;
  const redrawAll = reason === "load" || reason === "manual";
  const touched = reconcileAll();
  // The whole map is read only when a new park may have appeared: on load, at turn start, and when a park improvement
  // is placed. Other constructions only re-check the parks' own tiles.
  const scan = redrawAll || SCANNED.has(reason);
  const map = scan ? scanMap() : { anchors: [], markers: [] };
  const created = registerNew(map, touched);
  tidy(map, scan, touched);
  pickAiLand();
  aiTurn(reason);
  settleFoundings(reason);
  turnChores(reason);
  placeMarkers();
  redraw(created, touched, redrawAll);
  if (touched.size) refreshGeoLabels();
  logSweep(reason, created);
}
const SCANNED = new Set(["turn", "park", "project"]);

const AUTOPLAY_POLL_MS = 500;
const REASON_RANK = ["changed", "project", "park", "turn", "manual", "load"];
function widerReason(a, b) { return REASON_RANK.indexOf(b) > REASON_RANK.indexOf(a) ? b : a; }

/** Autoplay drops every write and reads the human as an AI (np-core-base.js), so while it runs the widest sweep asked
 *  for is kept and run once it has stopped. Returns the reason to sweep for now, or null while held. */
function heldOrNow(reason) {
  const wide = widerReason(reason, state.heldReason);
  if (autoplaying()) {
    state.heldReason = wide;
    later("autoplay", () => sweep(wide), AUTOPLAY_POLL_MS);
    return null;
  }
  state.heldReason = null;
  return wide;
}

/** Save what changed, and after a full scan take off the park pieces no park holds. */
function tidy(map, scan, touched) {
  if (touched.size) save();
  if (scan) { removeOrphanMarkers(map.markers); removeOrphanWilds(map.wilds); }
}

function aiTurn(reason) {
  if (reason === "turn") { growAiParks(); foundAiPass(); }
}

function logSweep(reason, created) {
  if (reason !== "project") log(`sweep (${reason}): ${parks().length} park(s)${created.length ? `, ${created.length} new` : ""}`);
}

/** Bring every park in line with the map (np-core.js reconcile). Returns the ids of the parks that changed. */
function reconcileAll() {
  const touched = new Set();
  for (const p of [...parks()]) {
    const r = reconcile(p);
    if (r === "dissolved") dissolve(p, touched);
    else if (r === "changed") touched.add(p.id);
  }
  return touched;
}

function dissolve(p, touched) {
  // Gold an AI set aside for the park goes back to its treasury.
  if (p.aiFund > 0 && !isHuman(p.owner) && !state.multiplayer)
    safe(() => Players.grantYield(p.owner, YieldTypes.YIELD_GOLD, p.aiFund));
  clearPark(p.id); dissolvePark(p.id); touched.add(p.id); log(`park ${p.id} dissolved: its founding improvement is gone`);
}

/** Register the park improvements on the map that no park holds yet, each named. Returns the new parks. */
function registerNew(map, touched) {
  const created = [];
  for (const i of map.anchors) {
    if (parkAtAnchor(i)) continue;
    const p = createPark(i, ownerOf(i), parkKindAt(i) || "park");
    p.autoName = generateName(p);
    created.push(p);
    touched.add(p.id);
  }
  return created;
}

/** An AI's park picks its land when an expansion completes; one inherited from a human with tiles waiting picks now. */
function pickAiLand() {
  for (const p of parks()) if (p.pending > 0 && !isHuman(p.owner) && !isIndependent(p.owner)
    && eligibleTiles(p).length) autoPick(p);
}

/** A founding whose settlement is gone or changed hands is let go, and what it cost goes back to its owner; an AI's
 *  with land is placed. */
function settleFoundings(reason) {
  for (const f of [...foundings()]) settleFounding(f, reason);
  for (const f of foundings()) if (!isHuman(f.owner) && foundingTiles(f.city).length) autoFound(f);
}

/** At a turn's start the stale projects leave the queue; at a turn's start or a load, waiting notices are shown. */
function turnChores(reason) {
  if (reason !== "turn" && reason !== "load") return;
  const me = safe(() => GameContext.localPlayerID, -1);
  if (reason === "turn") pruneQueues();
  if (noticesFor(me).length) later(`notice:${me}`, () => deliverNotices(me), 500);
}

function placeMarkers() {
  for (const p of parks()) { const n = ensureMarkers(p); if (n) log(`park ${p.id}: ${n} land marker(s) placed`); }
}

/** Every park is drawn on load; after that a park is redrawn only when its record changed or its drawing is out of date
 *  (new tiles, a new owner, fog lifted over it). A new park grows in from its founding tile. */
function redraw(created, touched, redrawAll) {
  for (const p of parks()) {
    if (created.includes(p)) drawPark(p, [p.anchor]);
    else if (redrawAll || touched.has(p.id) || !isDrawnCurrent(p)) drawPark(p);
  }
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
  for (const k of Object.values(KINDS)) readKeys(k);
  state.multiplayer = !!state.forceMultiplayer || !!safe(() => Configuration.getGame().isNetworkMultiplayer, false);
  const tables = hookTables();
  if (!tables) return false;
  setReadOnly(state.multiplayer);
  hook(tables.ops, tables.cmds);
  state.on = true;
  listenAll();
  registerWithGeoLabels();
  setHandlers();
  startPrompt();
  setTimeout(() => sweep("load"), 5000);
  log(state.multiplayer ? `v${VERSION} active in a network game: parks are read from the map and drawn; nothing is written`
    : `v${VERSION} active: parks founded on empty land and grown with Expand National Park`);
  return true;
}

/** The game's placement tables the mod wraps, or null (logged) when they can't be wrapped. */
function hookTables() {
  const ops = safe(() => Game.CityOperations, null);
  const cmds = safe(() => Game.CityCommands, null);
  if (ops && cmds && typeof ops.canStart === "function" && typeof cmds.canStart === "function") return { ops, cmds };
  log("Game.CityOperations / CityCommands not wrappable; inactive");
  return null;
}

/** The Gold purchases the picker and the production list offer; none in a network game. */
function setHandlers() {
  setBuyHandler(state.multiplayer ? null : buyExpansion);
  setPurchaseHandler(state.multiplayer ? null : buyExpansion,
    state.multiplayer ? null : { buy: buyFounding, price: foundPrice, refusal: foundingRefusal });
}

/** The raw ids and hashes the game's events name a kind's park improvement, land markers and projects by. */
function readKeys(k) {
  const def = safe(() => GameInfo.Constructibles.lookup(k.improvement), null);
  if (def) {
    state.parkKeys.add(def.$index);
    safe(() => state.parkKeys.add(GameInfo.Types.lookup(k.improvement).Hash));
  }
  for (const m of [k.land, k.wild, ...k.landLevels]) {
    const md = safe(() => GameInfo.Constructibles.lookup(m), null);
    if (md) { state.markerKeys.add(md.$index); safe(() => state.markerKeys.add(GameInfo.Types.lookup(m).Hash)); }
  }
  const project = safe(() => GameInfo.Projects.lookup(k.project), null);
  if (project) {
    state.projectKeys.add(project.$index);
    safe(() => state.projectKeys.add(GameInfo.Types.lookup(k.project).Hash));
  }
  const found = safe(() => GameInfo.Projects.lookup(k.found), null);
  if (found) {
    state.foundKeys.set(found.$index, k);
    safe(() => state.foundKeys.set(GameInfo.Types.lookup(k.found).Hash, k));
  }
}

/** Wrap the game's placement queries and requests (np-main-guard.js), keeping the originals for stop. */
function hook(ops, cmds) {
  state.originals = { opsCan: ops.canStart, opsSend: ops.sendRequest,
    cmdCan: cmds.canStart, cmdSend: cmds.sendRequest };
  state.wrappers = { opsCan: wrapCanStart(ops.canStart.bind(ops)), cmdCan: wrapCanStart(cmds.canStart.bind(cmds)),
    opsSend: typeof ops.sendRequest === "function" ? wrapSendRequest(ops.sendRequest.bind(ops)) : null,
    cmdSend: typeof cmds.sendRequest === "function" ? wrapSendRequest(cmds.sendRequest.bind(cmds)) : null };
  ops.canStart = state.wrappers.opsCan;
  cmds.canStart = state.wrappers.cmdCan;
  if (state.wrappers.opsSend) ops.sendRequest = state.wrappers.opsSend;
  if (state.wrappers.cmdSend) cmds.sendRequest = state.wrappers.cmdSend;
}

function listenAll() {
  const onChange = (d) => isParkEvent(d) ? scheduleSweep("park", PARK_EVENT_MS)
    : scheduleSweep("changed", isMarkerEvent(d) ? PARK_EVENT_MS : EVENT_SETTLE_MS);
  listen("ConstructibleBuildCompleted", onChange);
  listen("ConstructibleAddedToMap", onChange);
  listen("ConstructibleRemovedFromMap", onChange);
  listen("CityProjectCompleted", (d) => safe(() => onProjectCompleted(d)));
  listen("PlayerTurnActivated", (d) => {
    if (d && isLocal(d.player ?? d.Player)) setTimeout(() => sweep("turn"), SETTLE_MS);
  });
}

function stop() {
  unhook(safe(() => Game.CityOperations, null), safe(() => Game.CityCommands, null));
  for (const [name, fn] of state.listeners) safe(() => engine.off(name, fn));
  state.listeners = [];
  state.originals = null;
  state.wrappers = null;
  state.on = false;
  clearTimeout(state.sweepTimer);
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  stopPrompt();
  clearAll();
  unregisterFromGeoLabels();
  return "off";
}

/**
 * Put back a function only where ours is still the outermost: another mod may have wrapped ours since, and replacing
 * its wrapper would drop its rules. Ours, left in a chain, passes everything through once state.on is off.
 */
function unhook(ops, cmds) {
  const o = state.originals, w = state.wrappers;
  if (!o || !w) return;
  restore(ops, "canStart", w.opsCan, o.opsCan);
  restore(cmds, "canStart", w.cmdCan, o.cmdCan);
  restore(ops, "sendRequest", w.opsSend, o.opsSend);
  restore(cmds, "sendRequest", w.cmdSend, o.cmdSend);
}
function restore(table, key, ours, original) {
  if (table && ours && table[key] === ours) table[key] = original;
}

if (G[KEY] && typeof G[KEY].stop === "function") safe(() => G[KEY].stop());
G[KEY] = {
  version: VERSION,
  start, stop, sweep: () => sweep("manual"), offerPicker: () => offerPicker(), choose: chooseTile, confirm: confirmChoice,
  done: finishChoice, buySelected, open: (id) => openPicker(id, "a probe"),
  parks: () => parks().map((p) => ({ ...p, name: displayName(p) })),
  core, draw, // the mod's own module instances, for the bench and probes
  applySettings: () => { applySettings(); refreshBorders(); },
  status: () => ({ on: state.on, multiplayer: state.multiplayer, hooks: state.originals ? 4 : 0, parks: parks().length,
    aiRuns: state.aiRuns }),
  // Probes only: run as in a network game (read-only) from the next start().
  simulateNetworkGame: (on) => { state.forceMultiplayer = !!on; },
  // Probes only: the AI's purchase pass, and the game's own placement checks without this mod's rules.
  growAiParks: () => { state.aiTurn = null; growAiParks(); },
  foundAiParks: () => { state.foundTurn = null; foundAiPass(); },
  foundings: () => foundings().map((f) => ({ ...f, tiles: foundingTiles(f.city).length })),
  buyFounding: (cityID, key = "park") => buyFounding(cityID, KINDS[key]),
  // Probes only: give up a founding for its Gold, the refund notices waiting, a city's queued projects and its pruning.
  cancelFounding, notices: () => notices().map((n) => ({ ...n })), queuedProjects, pruneQueue,
  projectCompleted: (data) => onProjectCompleted(data),
  // Probes only: a founding's pop-up and picker, as the purchase opens them.
  offerFounding: (id) => offerFounding(id), openFoundingPicker: (id) => openFoundingPicker(id, "a probe"),
  foundingRefusal: (cityID, key = "park") => foundingRefusal(cityID, KINDS[key]),
  aiFacts: (id) => {
    const p = core.parkById(id);
    if (!p) return null;
    const f = { ...aiFacts(p), fund: p.aiFund || 0 };
    return { ...f, step: aiSavingStep(f) };
  },
  nativeCanStart: () => state.originals && { ops: state.originals.opsCan, cmds: state.originals.cmdCan },
  // Probes only: show a park's no-land notice; name a park founded by script as the picker would.
  notice: (id) => noticeNoLand(core.parkById(id)),
  name: (id) => { const p = core.parkById(id); if (!p) return ""; p.autoName = generateName(p); save(); refreshGeoLabels(); return p.autoName; },
};
start();
