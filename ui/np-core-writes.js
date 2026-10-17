// np-core-writes.js - National Parks: the write sequences that put park land on the map and take it off: districts,
// markers, and letting a tile go.
"use strict";

import { KEPT_IMPROVEMENTS, autoplaying, isMarkerType, isParkCompatible, isRuralImprovement, log, readOnly,
  safe } from "./np-core-base.js";
import { constructiblesAt, districtIdAt, districtKind, hasDistrict, isIndependent, isStrewnResource, locOf,
  markersAt, ownerOf, readPlot, sameCity, tileCityOf } from "./np-core-map.js";
import { load, markerFor, parks, save } from "./np-core-registry.js";

export function dissolvePark(id) {
  const state = load();
  const park = state.parks.find((p) => p.id === id);
  if (!park) return;
  for (const t of park.tiles) releaseTile(park, t);
  state.parks = state.parks.filter((p) => p.id !== id);
  save();
}

// markers
//
// A constructible needs a district under it and a parent city over it, or it belongs to no one and its modifiers
// attach to nothing (markers sent without Parent landed but moved no yield; with Parent, on a
// rural district the mod creates first, every marker's yield arrived). The district is the mod's own: it is
// recorded on the park, and destroyed again when the park lets go of land its owner still holds, after which the
// plot is bought back, since destroying a district releases it (as Canals found). Land that has passed to someone
// else is only forgotten. Requests go out as the local player naming the park's owner. The tile keeps its own yields
// alongside the marker's.

let autoplaySentAt = -Infinity;   // when a request last went out under Autoplay, which drops it

export function request(kind, args) {
  if (readOnly) return null;
  if (autoplaying()) autoplaySentAt = Date.now();
  return safe(() => Game.PlayerOperations.sendRequest(GameContext.localPlayerID, kind, args), null);
}

// writes in flight
//
// Every change to a tile is a short sequence of engine requests whose results land some time after the call: a district
// in about a second, a terrain edit in Canals once more than 3 s late. Each step waits until its result reads back
// before the next is sent (`until`), rather than for a fixed time, and a step that never lands ends the sequence with a
// log line; the next sweep tries the tile again, at most MAX_TRIES times a session. Sequences on one tile run one after
// another. While one runs, the tile is settling and the sweep does not judge it: creating a rural district on a
// resource tile makes the engine put the resource's own improvement there at once (a quarry on
// jade, until the marker replaced it), and a sweep in that window used to read it as the owner's build and let the tile
// go, after which the late marker landed outside any park.

const STEP_MS = 8000;
export const MAX_TRIES = 3;
const chains = new Map();    // plot -> the tail of its queue of sequences
export const failures = new Map();  // plot -> sequences that ended with a step that never landed

/** Re-read `test` until it holds or `ms` pass. Resolves true when it held. */
export function until(test, ms = STEP_MS, step = 150) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (safe(test, false)) { resolve(true); return; }
      if (Date.now() - t0 >= ms) { resolve(false); return; }
      setTimeout(tick, step);
    };
    tick();
  });
}

/** Run `fn` (async) after any sequence already queued on plot i. */
export function inSequence(i, fn) {
  const prev = chains.get(i) || Promise.resolve();
  const next = prev.then(fn).catch((e) => log(`plot ${i}: ${e}`)).finally(() => { if (chains.get(i) === next) chains.delete(i); });
  chains.set(i, next);
  return next;
}
export function isSettling(i) { return chains.has(i); }

export function failed(park, i, step) {
  // A step sent under Autoplay was dropped, not refused: it isn't counted, and the next sweep tries the tile again.
  if (autoplaying() || Date.now() - autoplaySentAt <= STEP_MS + 1000) {
    log(`park ${park ? park.id : "-"}: plot ${i}: ${step} did not land (Autoplay was on; tried again later)`);
    return false;
  }
  failures.set(i, (failures.get(i) || 0) + 1);
  log(`park ${park ? park.id : "-"}: plot ${i}: ${step} did not land (${failures.get(i)} of ${MAX_TRIES})`);
  return false;
}
export function stillParkLand(park, i) {
  return parks().includes(park) && park.tiles.includes(i) && ownerOf(i) === park.owner;
}

/** Request the removal of constructibles on plot i and wait until none of them reads back. */
export async function removeAll(i, items) {
  if (!items.length) return true;
  const ids = new Set(items.map((c) => c.id));
  for (const c of items) request("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: c.owner, LocalID: c.id });
  return until(() => !constructiblesAt(i).some((c) => ids.has(c.id)));
}

function populationOf(city) { return safe(() => Cities.get(city).population, -1); }

/**
 * Take rural improvements off plot i and give back the citizens they housed. Destroying a rural improvement takes one
 * population with it (engine-closed.md), so each point lost returns as pending population: the human places it on the
 * game's own Grow City screen, an AI places it itself (as Build Wonders Over Antiquated Buildings does). The loss is
 * read from the city's population, since an improvement the engine placed with a district housed no one.
 */
export async function stripImprovements(i, items, city) {
  const before = city ? populationOf(city) : -1;
  if (!(await removeAll(i, items))) return false;
  if (before < 0) return true;
  await until(() => populationOf(city) < before, 2500);
  const after = populationOf(city);
  const lost = after < 0 ? 0 : Math.min(items.length, Math.max(0, before - after));
  for (let k = 0; k < lost; k++) safe(() => Cities.get(city).addRuralPopulation(1));
  if (lost) log(`plot ${i}: ${lost} citizen(s) of the removed improvement returned as new population`);
  return true;
}

/**
 * The district park land sits on: the game's rural district, so a tile keeps its look. Same-camera captures on
 * 2026-10-02 (crash soak nps1, npg1/npg2): a wilderness district drew a mountain flat and stripped a hill's rocks and
 * snow, which a rural district leaves standing; coast, lake, resources and their animals (crabs, foxes, camels) and
 * open land were unchanged under both. No district keeps a tile's own trees or marsh: the park's dressing draws woods
 * back. The engine drops its own improvement (farm, mine, woodcutter, clay pit, fishing boat) on a new rural district;
 * that is taken off at once (makeParkDistrict). The cost: an AI may put a building on a park tile beside its city
 * centre, past the placement hook, and that tile then leaves the park (in pre-release builds a wilderness district
 * prevented it). Returns "rural"; "wild" districts from pre-release builds are rebuilt.
 */
export function parkDistrictKind(_i) { return "rural"; }
const DISTRICT_TYPES = { rural: "DISTRICT_RURAL", wild: "DISTRICT_WILDERNESS" };

/**
 * Make park land's district on plot i for `city` and take off the improvement the engine drops on a new rural district
 * (it housed no one, so no citizen is returned). `piece`, the park improvement the tile is to carry, is requested in
 * the same frame as the district, so it is on the tile before the engine picks one of its own. Resolves false when the
 * district never lands.
 */
export async function makeParkDistrict(i, l, city, owner, piece = null) {
  request("CREATE_ELEMENT", { Kind: "DISTRICT", Type: DISTRICT_TYPES[parkDistrictKind(i)], Location: l, Parent: city, Owner: owner });
  if (piece) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: piece, Location: l, Parent: city, Owner: owner });
  if (!(await until(() => hasDistrict(i)))) return false;
  await until(() => constructiblesAt(i).some((c) => isRuralImprovement(c.type)), 1500);
  const dropped = constructiblesAt(i).filter((c) => isRuralImprovement(c.type));
  if (dropped.length) await removeAll(i, dropped);
  return true;
}

/** Make the tile's district (for `city`) if it has none, then its marker; each read back before the next. */
export async function markTile(park, i, city) {
  const l = { ...locOf(i) };
  if (!stillParkLand(park, i) || carriesNoMarker(i)) return true;
  if (!(await replaceDistrict(park, i, city))) return false;
  if (!stillParkLand(park, i)) return true;
  if (!(await ensureDistrict(park, i, l, city))) return false;
  return placeLandMarker(park, i, l, city);
}

/**
 * A tile holding an Expedition Base or a worked mountain (KEPT_IMPROVEMENTS) keeps it and carries no marker, as
 * placeMarker already left it: a marker created there replaced the improvement in place (one improvement per plot)
 * and the citizen who worked it was lost (two AI cities lost a citizen each when their park took a worked mountain,
 * IMPROVEMENT_MOUNTAIN, through addTile). Nor does a resource tile.
 */
function carriesNoMarker(i) {
  return constructiblesAt(i).some((c) => KEPT_IMPROVEMENTS.has(c.type)) || isStrewnResource(i);
}

/**
 * Park land sits on a wilderness district, not a rural one: the game offers a rural tile beside a city's urban core
 * to its buildings, and an AI builds there past the placement hook; it does not offer a wilderness tile. A rural
 * district left from the owner's improvement, or from a pre-release build, is replaced, marker first; so is a
 * mountain's wilderness district from a pre-release build, which drew the mountain flat. Resolves false when a step
 * never landed.
 */
async function replaceDistrict(park, i, city) {
  const want = parkDistrictKind(i), have = districtKind(i);
  if (!((have === "rural" || have === "wild") && have !== want)) return true;
  if (!(await removeAll(i, markersAt(i)))) return failed(park, i, "marker removal");
  if (!(await removeDistrict(park, i, city, park.owner))) return false;
  if (hasDistrict(i)) return failed(park, i, "district removal");
  return true;
}

/** Make the tile's district if it has none, with the park's marker in the same frame. Resolves false when it never
 *  landed. */
async function ensureDistrict(park, i, l, city) {
  if (hasDistrict(i)) return true;
  park.districts = park.districts || [];
  if (!park.districts.includes(i)) { park.districts.push(i); save(); }
  if (!(await makeParkDistrict(i, l, city, park.owner, markerFor(park)))) return failed(park, i, "district");
  return true;
}

/** Put the park's marker on a tile that has none. */
async function placeLandMarker(park, i, l, city) {
  if (!stillParkLand(park, i) || markersAt(i).length) return true;
  request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: markerFor(park),
    Location: l, Parent: city, Owner: park.owner });
  if (!(await until(() => markersAt(i).length > 0))) return failed(park, i, "marker");
  failures.delete(i);
  return true;
}

/** Destroy the district the mod made on plot i and buy the plot back for `city`, which a district's removal
 *  releases. */
export async function removeDistrict(park, i, city, owner) {
  const d = districtIdAt(i);
  if (!d || d.owner !== owner) return true;
  request("DESTROY_ELEMENT", { Kind: "DISTRICT", Owner: d.owner, LocalID: d.id });
  if (!(await until(() => !hasDistrict(i)))) return failed(park, i, "district removal");
  await until(() => ownerOf(i) === -1, 2000);
  if (ownerOf(i) !== -1) return true;
  const l = { ...locOf(i) };
  safe(() => Cities.get(city).purchasePlot(l));
  if (!(await until(() => ownerOf(i) === owner))) return failed(park, i, "buy back");
  return true;
}

/** Put the right marker on a park tile, making its district first if the tile has none. The founding tile carries
 *  none, nor does a tile holding a kept improvement (an Expedition Base). Returns true when a sequence was started. */
export function placeMarker(park, i) {
  if (!wantsMarker(park, i)) return false;
  const city = tileCityOf(i);
  if (!city) return false;
  inSequence(i, () => markTile(park, i, city));
  return true;
}

/** Whether plot i is the park owner's land, not its founding tile, with nothing on it yet that a park keeps, and no
 *  sequence running or given up on. */
function wantsMarker(park, i) {
  if (readOnly || !ownLand(park, i) || isSettling(i)) return false;
  if ((failures.get(i) || 0) >= MAX_TRIES || isStrewnResource(i)) return false;
  const plot = readPlot(i);
  return !plot.stray && !plot.items.some((c) => isParkCompatible(c.type));
}

/** Land of the park's owner, a major civilization, other than the founding tile. */
function ownLand(park, i) {
  return !!park && i !== park.anchor && ownerOf(i) === park.owner && !isIndependent(park.owner);
}

/**
 * Let go of a tile. On land the park's owner no longer holds nothing is touched: the tile and its district are only
 * forgotten. On the owner's land the marker is taken off, and the district the park made with it unless something
 * else now stands there (the owner's own farm); the plot, which a district's removal releases, is then bought back
 * for the city. Returns what was done: "forgotten", "marker", "kept-district" or "district".
 */
export function releaseTile(park, i) {
  if (!park) return "forgotten";
  const made = !!(park.districts && park.districts.includes(i));
  if (made) park.districts = park.districts.filter((t) => t !== i);
  if (ownerOf(i) !== park.owner || readOnly || isIndependent(park.owner)) return "forgotten";
  const plot = readPlot(i);
  const markers = plot.items.filter((c) => isMarkerType(c.type));
  const kept = !made ? "marker" : plot.stray || plot.items.some((c) => !isMarkerType(c.type)) ? "kept-district" : "district";
  const owner = park.owner;
  const city = tileCityOf(i);   // read now: the district's removal releases the plot
  inSequence(i, async () => {
    if (!(await removeAll(i, markers))) return failed(park, i, "marker removal");
    if (kept !== "district") return true;
    const again = readPlot(i);
    if (ownerOf(i) !== owner || again.stray || again.items.length || !city) return true;
    return removeDistrict(park, i, city, owner);
  });
  return kept;
}

/**
 * Whether a park tile's district (one the mod made) or marker belongs to a settlement other than the one holding the
 * plot. Saves from 1.0.0 have them on every tile taken from a neighbouring settlement.
 */
export function misfiled(park, i) {
  const city = tileCityOf(i);
  if (!city) return false;
  const l = locOf(i);
  return districtMisfiled(park, i, l, city) || markerMisfiled(l, city);
}

/** The district the mod made on plot i, filed with another settlement than `city`. */
function districtMisfiled(park, i, l, city) {
  if (!(park.districts && park.districts.includes(i))) return false;
  const d = safe(() => Districts.getAtLocation(l), null);
  return !!d && !sameCity(safe(() => d.cityId, null), city);
}

/** A marker on the plot at `l`, filed with another settlement than `city`. */
function markerMisfiled(l, city) {
  for (const c of safe(() => MapConstructibles.getConstructibles(l.x, l.y), null) || []) {
    const inst = safe(() => Constructibles.getByComponentID(c), null);
    if (!inst || !isMarkerType(safe(() => String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), ""))) continue;
    if (!sameCity(safe(() => inst.cityId, null), city)) return true;
  }
  return false;
}

const rehomed = new Set();   // plots rebuilt this session; one try each, so an engine that refuses cannot loop
/**
 * Rebuild a misfiled tile for the settlement that holds it: the marker comes off, the district the mod made goes and
 * its plot is bought back by that settlement, and placeMarker makes both again. Returns true when anything was sent.
 */
export function rehome(park, i) {
  if (readOnly || rehomed.has(i)) return false;
  rehomed.add(i);
  const city = tileCityOf(i);
  const l = locOf(i);
  const district = !!(park.districts && park.districts.includes(i)
    && !sameCity(safe(() => Districts.getAtLocation(l).cityId, null), city));
  log(`park ${park.id}: plot ${i} rebuilt for its own settlement (${district ? "district and marker" : "marker"})`);
  inSequence(i, async () => {
    if (!(await removeAll(i, markersAt(i)))) return failed(park, i, "marker removal");
    if (district && !(await removeDistrict(park, i, city, park.owner))) return false;
    if (stillParkLand(park, i)) await markTile(park, i, city);
    return true;
  });
  return true;
}

/**
 * Swap a park tile's marker for the one its size level calls for (markerFor), or an older save's wild marker (which
 * paid more on wild land in pre-release builds) for it. The district stays. The new marker replaces the old in place
 * (one improvement per plot); any extra marker is taken off first. Returns true when a swap was started.
 */
export function remark(park, i) {
  if (readOnly || isSettling(i) || (failures.get(i) || 0) >= MAX_TRIES) return false;
  const want = markerFor(park);
  const have = markersAt(i);
  if (!have.length || (have.length === 1 && have[0].type === want)) return false;
  const city = tileCityOf(i);
  if (!city) return false;
  log(`park ${park.id}: plot ${i} marker ${have.map((c) => c.type).join(", ")} -> ${want}`);
  inSequence(i, async () => {
    if (markersAt(i).length > 1 && !(await removeAll(i, markersAt(i).slice(1)))) return failed(park, i, "marker removal");
    if (!stillParkLand(park, i)) return true;
    request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: want, Location: { ...locOf(i) }, Parent: city, Owner: park.owner });
    if (!(await until(() => markersAt(i).some((c) => c.type === want)))) return failed(park, i, "marker");
    failures.delete(i);
    return true;
  });
  return true;
}

/** Markers for every tile that lacks one (after a reload, or for an AI's park). Returns how many were requested. */
export function ensureMarkers(park) {
  let n = 0;
  for (const t of park.tiles) if (placeMarker(park, t)) n++;
  return n;
}
