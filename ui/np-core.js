// np-core.js - National Parks: map reads, the park registry, and the rules for which land a park may take.
//
// A park is a founding tile (the IMPROVEMENT_NATIONAL_PARK constructible) plus the land added to it by the Expand
// National Park project. The registry lives in the save through a GameConfiguration key, the same store Canals and
// Geographic Labels use, so it survives save and reload.
//
// Record: { id, owner, anchor, tiles: [plot index], districts: [plot index], pending, autoName, customName, founded }
//   anchor   the founding tile; always tiles[0]
//   districts the rural districts the mod made under its markers (destroyed when the park lets go of land its
//            owner still holds, forgotten when the land passes to someone else)
//   pending  tiles the owner may still add from completed expansions
"use strict";

/**
 * The two kinds of park. A National Park pays Culture and Happiness and has a warden's lodge and cabins; a Wilderness
 * Area is its twin, paid in Influence and drawn without houses or shelters. Everything else (founding, growth,
 * protection, names) is shared. A record's `kind` is "park" when absent (older saves).
 *
 * `landLevels` are the land marker's size-bonus versions (see milestoneLevel below): every tile of a park of
 * the kind carries the one for the level its land has reached, `land` below the first.
 * `land` is the land marker every park tile carries; `wild`, which paid more on wild land in pre-release builds, is still
 * recognised so the sweep can swap it for `land` in older saves.
 */
export const KINDS = {
  park: { key: "park", improvement: "IMPROVEMENT_NATIONAL_PARK", land: "IMPROVEMENT_NATIONAL_PARK_LAND",
    wild: "IMPROVEMENT_NATIONAL_PARK_WILD", project: "PROJECT_EXPAND_NATIONAL_PARK", found: "PROJECT_FOUND_NATIONAL_PARK",
    landLevels: ["IMPROVEMENT_NATIONAL_PARK_LAND_8", "IMPROVEMENT_NATIONAL_PARK_LAND_16", "IMPROVEMENT_NATIONAL_PARK_LAND_24"],
    buildings: true },
  wilderness: { key: "wilderness", improvement: "IMPROVEMENT_WILDERNESS_AREA", land: "IMPROVEMENT_WILDERNESS_AREA_LAND",
    wild: "IMPROVEMENT_WILDERNESS_AREA_WILD", project: "PROJECT_EXPAND_WILDERNESS_AREA", found: "PROJECT_FOUND_WILDERNESS_AREA",
    landLevels: ["IMPROVEMENT_WILDERNESS_AREA_LAND_8", "IMPROVEMENT_WILDERNESS_AREA_LAND_16", "IMPROVEMENT_WILDERNESS_AREA_LAND_24"],
    buildings: false },
};
export function kindOf(park) { return KINDS[park && park.kind] || KINDS.park; }
/** The kind whose founding improvement, or whose Expand or Found project, a type name is; null for anything else. */
export function kindByImprovement(type) { return Object.values(KINDS).find((k) => k.improvement === type) || null; }
export function kindByProject(type) { return Object.values(KINDS).find((k) => k.project === type) || null; }
export function kindByFoundProject(type) { return Object.values(KINDS).find((k) => k.found === type) || null; }
export const PARK_TYPE = KINDS.park.improvement;
export const PARK_TYPES = new Set(Object.values(KINDS).map((k) => k.improvement));
export const PROJECT_TYPE = KINDS.park.project;
export const PROJECT_TYPES = new Set(Object.values(KINDS).map((k) => k.project));
/** Land markers: one per tile a park takes (never the founding tile). Each carries the tile's park yield. */
export const MARKER_TYPES = new Set(Object.values(KINDS).flatMap((k) => [k.land, k.wild, ...k.landLevels]));
export function tilesPerExpansion() {
  const age = safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), "");
  return age === "AGE_EXPLORATION" ? 1 : 3;
}
export const MAX_PARK_TILES = 24;
/** The cap in force; a probe may lower it to see a full park without growing one to 24 tiles. */
export const limits = { maxTiles: MAX_PARK_TILES };
export function isFull(park) { return !!park && park.tiles.length >= limits.maxTiles; }
/** How many more tiles a park may take before it is full. */
export function room(park) { return park ? Math.max(0, limits.maxTiles - park.tiles.length) : 0; }
const STORE_KEY = "NationalPark_Parks_v1";

/** Ring order used for edges and drawing; index i matches armAngle(i) in np-draw.js. */
export const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST",
  "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];

export function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
export function log(m) { safe(() => console.error("[NationalPark] " + m)); }

// map reads

export function idx(loc) { return GameplayMap.getIndexFromLocation(loc); }
export function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }

/** The six neighbors of a plot in RING order; -1 where the map ends. */
export function ringOf(i) {
  const loc = locOf(i);
  return RING.map((d) => {
    const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[d]), null);
    return n && n.x >= 0 && n.y >= 0 ? idx(n) : -1;
  });
}

export function terrainOf(i) {
  const l = locOf(i);
  return safe(() => String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y)).TerrainType), "");
}
export function biomeOf(i) {
  const l = locOf(i);
  return safe(() => String(GameInfo.Biomes.lookup(GameplayMap.getBiomeType(l.x, l.y)).BiomeType), "");
}
export function featureOf(i) {
  const l = locOf(i);
  return safe(() => {
    const f = GameplayMap.getFeatureType(l.x, l.y);
    return f == null || f < 0 ? "" : String(GameInfo.Features.lookup(f).FeatureType);
  }, "");
}
export function ownerOf(i) { const l = locOf(i); return safe(() => GameplayMap.getOwner(l.x, l.y), -1); }
export function isWater(i) { const l = locOf(i); return safe(() => GameplayMap.isWater(l.x, l.y), true); }
export function isMountain(i) { const l = locOf(i); return safe(() => GameplayMap.isMountain(l.x, l.y), false); }
export function isLake(i) { const l = locOf(i); return safe(() => GameplayMap.isLake(l.x, l.y), false); }
/** A minor river: it runs through the middle of its tile, not along an edge. */
export function isRiver(i) { const l = locOf(i); return safe(() => GameplayMap.isRiver(l.x, l.y), false); }
export function isNavRiver(i) { const l = locOf(i); return safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false); }
export function isRevealed(i) {
  const l = locOf(i);
  return safe(() => GameplayMap.getRevealedState(GameContext.localPlayerID, l.x, l.y) !== RevealedStates.HIDDEN, false);
}

let wonderFeatures = null;
export function isWonder(i) {
  if (!wonderFeatures) {
    wonderFeatures = new Set();
    safe(() => GameInfo.Feature_NaturalWonders.forEach((r) => wonderFeatures.add(String(r.FeatureType))));
  }
  const f = featureOf(i);
  return !!f && wonderFeatures.has(f);
}

function sameLoc(a, l) { return !!a && a.x === l.x && a.y === l.y; }

/**
 * What stands on a plot: { items: [{ type, complete, owner, id }], stray }. After a plot changes hands its ids can
 * resolve against the new owner's own objects elsewhere (a park tile bought by an AI city read as
 * a sawmill and an urban district 8 tiles away, and destroying "its" district destroyed that one). An entry whose
 * object is not on this plot is left out of `items` and counted in `stray`.
 */
export function readPlot(i) {
  const l = locOf(i);
  const out = { items: [], stray: 0 };
  for (const c of safe(() => MapConstructibles.getConstructibles(l.x, l.y), null) || []) {
    const inst = safe(() => Constructibles.getByComponentID(c), null);
    if (!inst || (inst.location && !sameLoc(inst.location, l))) { out.stray++; continue; }
    const type = safe(() => String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), "");
    out.items.push({ type, complete: inst.complete !== false, owner: inst.owner, id: inst.localId != null ? inst.localId : inst.id });
  }
  return out;
}
/** Constructibles on a plot: [{ type, complete, owner, id }], strays left out (see readPlot). */
export function constructiblesAt(i) { return readPlot(i).items; }
/** The district on a plot as { owner, id }, or null; one whose id resolves to another plot counts as none. */
export function districtIdAt(i) {
  const l = locOf(i);
  const id = safe(() => Districts.getIdAtLocation(l), null);
  if (!id) return null;
  const d = safe(() => Districts.get(id), null);
  return d && d.location && !sameLoc(d.location, l) ? null : id;
}
export function hasDistrict(i) { const l = locOf(i); return !!safe(() => Districts.getAtLocation(l), null); }
/** "none", "rural", "wild" (a wilderness district, which park land sits on), or "other" (urban, city center, wonder,
 *  or one whose id resolves to another plot). */
export function districtKind(i) {
  const l = locOf(i);
  const d = safe(() => Districts.getAtLocation(l), null);
  if (!d) return "none";
  if (d.location && !sameLoc(d.location, l)) return "other";
  const type = safe(() => String(GameInfo.Districts.lookup(d.type).DistrictType), "");
  return type === "DISTRICT_RURAL" ? "rural" : type === "DISTRICT_WILDERNESS" ? "wild" : "other";
}
/** The resource on a plot as its type name, or "". */
export function resourceAt(i) {
  const l = locOf(i);
  return safe(() => {
    const r = GameplayMap.getResourceType(l.x, l.y);
    return r != null && r >= 0 ? String(GameInfo.Resources.lookup(r).ResourceType) : "";
  }, "");
}
/** The rural improvements on a plot that a park would strip: every improvement but the park's own. */
export function strippableAt(i) {
  if (isStrewnResource(i)) return [];   // the tile is left as it stands (STREWN_RESOURCES)
  return constructiblesAt(i).filter((c) => isRuralImprovement(c.type));
}
export function hasResource(i) {
  const l = locOf(i);
  return safe(() => { const r = GameplayMap.getResourceType(l.x, l.y); return r != null && r >= 0; }, false);
}
/** Plain coast or ocean: water that is not a lake, a navigable river or a natural wonder. */
export function isOpenWater(i) { return isWater(i) && !isLake(i) && !isNavRiver(i) && !isWonder(i); }
export function hasParkImprovement(i) { return !!parkKindAt(i); }
/** The kind of park whose finished founding improvement stands on a plot, or null. */
export function parkKindAt(i) {
  const c = constructiblesAt(i).find((k) => PARK_TYPES.has(k.type) && k.complete);
  return c ? kindByImprovement(c.type).key : null;
}
export function isMarkerType(type) { return MARKER_TYPES.has(type); }
/** Improvements a park keeps where they stand: an Expedition Base lets a mountain or wonder be worked, and a park
 *  allows it (such a tile carries no marker). Both names are the Expedition Base in the Modern database. */
export const KEPT_IMPROVEMENTS = new Set(["IMPROVEMENT_EXPEDITION_BASE", "IMPROVEMENT_MOUNTAIN"]);
/**
 * Resources the game draws by strewing pieces over the tile itself, which nothing but the game can put back once a
 * district hides them (np-plan.js RESOURCE_MODELS has the rest, whose model a script can place). A tile with one of
 * these joins a park as a wonder's Expedition Base does: it keeps whatever stands on it, gets no district and no
 * marker, and so looks exactly as the game draws it, paying its own yields instead of the park's (owner's rule,
 * 2026-10-05).
 */
export const STREWN_RESOURCES = new Set(["RESOURCE_TEA", "RESOURCE_COTTON", "RESOURCE_CITRUS", "RESOURCE_SUGAR", "RESOURCE_JADE",
  "RESOURCE_NITER", "RESOURCE_SALT", "RESOURCE_RUBIES", "RESOURCE_IVORY", "RESOURCE_HORSES", "RESOURCE_WOOL", "RESOURCE_HIDES",
  "RESOURCE_FURS", "RESOURCE_TRUFFLES", "RESOURCE_CLOVES", "RESOURCE_LAPIS_LAZULI", "RESOURCE_NICKEL"]);
export function isStrewnResource(i) { return STREWN_RESOURCES.has(resourceAt(i).replace(/_DISTANT_LANDS$/, "")); }
/** What may stand on park land: the park's markers and a kept improvement. */
export function isParkCompatible(type) { return isMarkerType(type) || KEPT_IMPROVEMENTS.has(type); }
/** Constructibles that are not the park's own markers: what would make a tile someone else's. */
export function foreignConstructiblesAt(i) { return constructiblesAt(i).filter((c) => !isParkCompatible(c.type)); }
export function markersAt(i) { return constructiblesAt(i).filter((c) => isMarkerType(c.type)); }


// appeal
//
// A park is founded on Charming land, by the game's own appeal: the number its plot tooltip and appeal lens show. A
// tile's appeal is the sum of its six neighbours' Terrains.Appeal and Features.Appeal (mountain, coast and navigable
// river 1; forest, rainforest, taiga, savanna woodland and sagebrush steppe 1; a natural wonder 6), with a wonder tile
// counting its own 6 too and open water reading 0; rivers, resources, improvements and districts add nothing
// (engine-closed.md). Appeal sets nothing else: a park's yields do not depend on it, and no tile
// ever leaves a park, nor a founding tile moves, because its appeal fell.

/** Pure: whether an appeal is Charming or better against the game's thresholds { charming }. */
export function isCharming(appeal, th) { return appeal >= th.charming; }

let thresholdCache = null;
/** The game's Charming threshold (GlobalParameters APPEAL_FOR_HAPPINESS_TILE_YIELD), read once a game. */
export function appealThresholds() {
  if (thresholdCache) return thresholdCache;
  const charming = safe(() => Number([...GameInfo.GlobalParameters].find((r) => r.Name === "APPEAL_FOR_HAPPINESS_TILE_YIELD").Value), NaN);
  if (!Number.isFinite(charming)) {
    // Not cached: without the database row no tile reads as Charming yet.
    log("appeal threshold missing from GlobalParameters");
    return { charming: Infinity };
  }
  thresholdCache = { charming };
  return thresholdCache;
}
export function gameAppeal(i) { const l = locOf(i); return safe(() => GameplayMap.getAppeal(l.x, l.y), 0) || 0; }
export function charmingAt(i) { return isCharming(gameAppeal(i), appealThresholds()); }

/** Where a wall would stand in water or against rock: no wall on or facing a sea, lake, navigable river,
 *  mountain or natural wonder, nor at the map's edge. */
export function isImpassableEdgeTile(i) {
  return i < 0 || isWater(i) || isNavRiver(i) || isMountain(i) || isWonder(i);
}

// registry

let cache = null;

export function load() {
  if (cache) return cache;
  const raw = safe(() => Configuration.getGame().getValue(STORE_KEY), null);
  const parsed = safe(() => (raw ? JSON.parse(String(raw)) : null), null);
  cache = parsed && Array.isArray(parsed.parks) ? parsed : { nextId: 1, parks: [] };
  cache.parks = cache.parks.filter((p) => p && Array.isArray(p.tiles) && p.tiles.length);
  return cache;
}

export function save() {
  if (!cache) return false;
  if (readOnly) return true;   // a network game: the record lives in memory only (see setReadOnly)
  return safe(() => { Configuration.editGame().setValue(STORE_KEY, JSON.stringify(cache)); return true; }, false);
}

/** Forget the in-memory copy (after a reload the script re-reads the save). */
export function resetCache() { cache = null; }

export function parks() { return load().parks; }
export function parkById(id) { return parks().find((p) => p.id === id) || null; }
export function parkAtAnchor(i) { return parks().find((p) => p.anchor === i) || null; }
export function parkOfTile(i) { return parks().find((p) => p.tiles.includes(i)) || null; }
export function displayName(p) { return (p && (p.customName || p.autoName)) || ""; }

/** Every plot that belongs to some park. */
export function allParkTiles() {
  const s = new Set();
  for (const p of parks()) for (const t of p.tiles) s.add(t);
  return s;
}

export function createPark(anchor, owner, kind = "park") {
  const state = load();
  const park = { id: state.nextId++, kind, owner, anchor, tiles: [anchor], pending: 0, autoName: "", customName: "",
    founded: safe(() => Game.turn, 0) };
  state.parks.push(park);
  save();
  return park;
}

// milestones
//
// Each park reaches size levels at 8, 16 and 24 of its own tiles (its founding tile included), and every tile of that
// park then pays more: its land marker is swapped for the level's (data/national-parks-land.xml). Parks level apart:
// another park of the same owner, of either kind, does not count. The count is the land the park holds now, so land
// lost, built over or let go counts against it, and the markers step back down. (Until 2026-10-04 a player's parks of
// a kind counted together; changed to one park's own size.) The swap is in place: CREATE_ELEMENT of a marker on a plot replaces the one there (one improvement per
// plot), and markers house no one, so no citizen moves.
export const MILESTONES = [8, 16, 24];
/** Pure: the milestone level (0 to 3) of a number of park tiles. */
export function milestoneLevel(tiles) { return MILESTONES.filter((n) => tiles >= n).length; }
function parksOf(owner, kindKey) { return parks().filter((p) => p.owner === owner && (p.kind || "park") === kindKey); }
/** A player's park tiles of a kind, all parks together (probes and the lens; levels are per park). */
export function playerParkTiles(owner, kindKey) { return parksOf(owner, kindKey).reduce((n, p) => n + p.tiles.length, 0); }
/** A park's size level, from its own tiles. */
export function parkLevel(park) { return park ? milestoneLevel(park.tiles.length) : 0; }
/** The land marker for a kind at a level. */
export function landMarker(kind, level) { return level > 0 ? kind.landLevels[level - 1] : kind.land; }
/** The land marker every tile of a park should carry now, for the park's own size level. */
export function markerFor(park) { return landMarker(kindOf(park), parkLevel(park)); }

// foundings: a park paid for, waiting for the tile it will stand on
//
// Found National Park (a city's project, or a purchase in a city or town) does not place anything itself: the engine
// places an improvement only on a tile that already carries a rural district, and never on a bare one, so a park
// could only replace a farm. A completed or bought founding is recorded here and the park is
// placed by script on the empty tile its owner chooses (np-picker.js), or an AI's best one.
// Record: { id, kind, owner, city: ComponentID, made, paid, by, name, asked }
//   paid   the Gold the founding cost its owner: the price of a purchase, or a completed project's production at the
//          purchase rate. What goes back if the founding ends without a park. Absent in older saves (foundingRefund).
//   by     "gold" or "project"
//   name   the settlement's name as the game holds it, for a notice once the settlement is gone
//   asked  the turn its owner was last told it has no land (foundingFate); absent until then

export function foundings() { const s = load(); if (!Array.isArray(s.foundings)) s.foundings = []; return s.foundings; }
export function foundingById(id) { return foundings().find((f) => f.id === id) || null; }
export function addFounding(kind, owner, city, cost = {}) {
  const s = load();
  const f = { id: s.nextId++, kind, owner, city: { owner: city.owner, id: city.id, type: city.type }, made: safe(() => Game.turn, 0) };
  if (cost.paid > 0) { f.paid = Math.round(cost.paid); f.by = cost.by || "gold"; }
  if (cost.name) f.name = String(cost.name);
  foundings().push(f);
  save();
  return f;
}
export function dropFounding(id) { const s = load(); s.foundings = foundings().filter((f) => f.id !== id); save(); }

/** Pure: the Gold a founding gives back, what its record says was paid, or `price` (the price now) for an older
 *  save's record, which holds no figure. */
export function foundingRefund(f, price = 0) {
  const paid = Number(f && f.paid);
  return Math.max(0, Math.round(paid > 0 ? paid : Number(price) || 0));
}

/** Turns between reminders that a founding still has no land to stand on. */
export const FOUNDING_ASK_TURNS = 10;

/**
 * What becomes of a founding still waiting for its tile (pure). Facts: settlement (it stands and is still its owner's),
 * ownerAlive, human, tiles (how many tiles it could be founded on now), turn, asked (the turn its owner was last told
 * it has no land; null when never), paid, price (see foundingRefund), readOnly (a network game).
 * Returns { act, why, gold }:
 *   "keep"    it waits (an AI's with land is placed by the sweep)
 *   "refund"  it ends and `gold` goes back to its owner: the settlement is gone or changed hands ("settlement"), or
 *             an AI's has no land left ("no-land"; a human decides that for themselves, see "ask")
 *   "ask"     a human's has no land and its owner was never told, or not for FOUNDING_ASK_TURNS: they are told, and
 *             may give it up for the Gold
 *   "drop"    it ends with nothing to give back: its owner is out of the game, or the game is a network game, where
 *             nothing is written
 */
export function foundingFate(f) {
  const gold = foundingRefund(f, f.price);
  if (!f.settlement) {
    if (f.readOnly) return { act: "drop", why: "settlement", gold: 0 };
    if (!f.ownerAlive) return { act: "drop", why: "owner", gold: 0 };
    return gold > 0 ? { act: "refund", why: "settlement", gold } : { act: "drop", why: "settlement", gold: 0 };
  }
  if (f.readOnly || f.tiles > 0) return { act: "keep", why: "", gold: 0 };
  if (!f.human) return gold > 0 ? { act: "refund", why: "no-land", gold } : { act: "drop", why: "no-land", gold: 0 };
  // Never told yet, or a turn counter below the one recorded (a new age's): the reminder is due.
  const due = f.asked == null || f.turn - f.asked >= FOUNDING_ASK_TURNS || f.turn < f.asked;
  return { act: due ? "ask" : "keep", why: "no-land", gold };
}

/**
 * What a completed Found or Expand project does (pure). Facts: project ("found" or "expand"), settlement (the
 * completion names one, so there is someone to pay), hasKind (found: the settlement already holds that kind of park,
 * or one waiting for its tile), park and full (expand: its park was found, and is at its full size), price (the
 * project's cost at the purchase rate, what the same thing costs in Gold).
 * Returns { act, why, gold }: "found" or "expand" when it does what it was built for (`gold` is then what a founding
 * records as paid); "refund" when it can do nothing and its cost goes back as `gold` ("duplicate", "full", "no-park");
 * "drop" only when no settlement is named and so no one can be paid.
 */
export function completionOutcome(f) {
  const gold = Math.max(0, Math.round(Number(f.price) || 0));
  const back = (why) => (f.settlement && gold > 0 ? { act: "refund", why, gold } : { act: "drop", why, gold: 0 });
  if (f.project === "found") {
    if (!f.settlement) return { act: "drop", why: "no-settlement", gold: 0 };
    return f.hasKind ? back("duplicate") : { act: "found", why: "", gold };
  }
  if (!f.park) return back("no-park");
  if (f.full) return back("full");
  return { act: "expand", why: "", gold: 0 };
}

/**
 * Which entries of a settlement's build queue can no longer do anything (pure): a Found project where the settlement
 * has that kind of park or one waiting for its tile, any second copy of a Found project, and an Expand project for a
 * park at its full size. `queue` lists each entry's project type in queue order (null for anything else); `has(key)`
 * and `full(key)` answer for a kind's key. Returns the entries' positions, last first, so that taking one out leaves
 * the positions before it naming the same entries.
 */
export function staleQueueEntries(queue, has, full) {
  const out = [];
  for (const k of Object.values(KINDS)) {
    let one = !!has(k.key);
    const done = !!full(k.key);
    queue.forEach((type, i) => {
      if (type === k.found) { if (one) out.push(i); one = true; }
      else if (type === k.project && done) out.push(i);
    });
  }
  return out.sort((a, b) => b - a);
}

// notices: Gold given back, waiting to be told
//
// A refund can land while its owner is not the player at the screen (a hotseat seat's settlement falls on another
// seat's turn), and a pop-up raised then would be read by the wrong player. So each is recorded in the save's record
// and shown to its owner on their own turn (np-main.js deliverNotices), across a save and reload too.
// Record: { id, owner, why, gold, kind, name, park }: `why` as completionOutcome and foundingFate give it, `name` the
// settlement's name, `park` the park's.

export function notices() { const s = load(); if (!Array.isArray(s.notices)) s.notices = []; return s.notices; }
export function noticesFor(owner) { return notices().filter((n) => n.owner === owner); }
export function addNotice(n) {
  const s = load();
  const row = { ...n, id: s.nextId++ };
  notices().push(row);
  save();
  return row;
}
export function dropNotice(id) { const s = load(); s.notices = notices().filter((n) => n.id !== id); save(); }
/** Whether a settlement holds a park of `kind`, or has one paid for and waiting for its tile. */
export function settlementHasKind(city, kind) {
  if (!city) return false;
  if (parks().some((p) => (p.kind || "park") === kind && sameCity(cityIdOf(p), city))) return true;
  return foundings().some((f) => f.kind === kind && sameCity(f.city, city));
}

/**
 * The rule for a founding tile, on facts read from the map (pure): empty, Charming land the settlement itself holds.
 * Empty means nothing man-made on it: no district, no improvement, no building. A resource or a feature (forest, marsh)
 * is natural and does not bar it. The founding tile carries the park's buildings, so it is flat or hill land, not
 * water, a mountain or a natural wonder; those can join the park afterwards. Charming is the game's own appeal tier.
 */
export function foundable(f) {
  if (f.taken || f.stray || !f.ownCity) return false;
  if (!f.charming) return false;
  if (f.water || f.mountain || f.wonder) return false;
  if (f.terrain !== "TERRAIN_FLAT" && f.terrain !== "TERRAIN_HILL") return false;
  return !f.district && !f.items;
}

/** The facts `foundable` reads, for plot i and the settlement `city`. */
export function foundFacts(i, city, taken) {
  const plot = readPlot(i);
  return { taken: taken.has(i) || isSettling(i), stray: plot.stray > 0, ownCity: sameCity(tileCityOf(i), city),
    water: isWater(i) || isLake(i) || isNavRiver(i), mountain: isMountain(i), wonder: isWonder(i), terrain: terrainOf(i),
    district: hasDistrict(i), items: plot.items.length, charming: charmingAt(i) };
}

/** Plots a settlement may found a park on now: every empty, Charming flat or hill tile it holds, in plot order. */
export function foundingTiles(city) {
  if (!city) return [];
  const taken = allParkTiles();
  const plots = safe(() => Cities.get(city).getPurchasedPlots(), null) || [];
  return plots.filter((i) => foundable(foundFacts(i, city, taken))).sort((a, b) => a - b);
}

export function dissolvePark(id) {
  const state = load();
  const park = state.parks.find((p) => p.id === id);
  if (!park) return;
  for (const t of park.tiles) releaseTile(park, t);
  state.parks = state.parks.filter((p) => p.id !== id);
  save();
}

// rules

/**
 * The rule for joining, on facts read from the map (pure). A park takes its owner's land that no other park holds:
 * open land, forest, mountains, lakes, rivers, open sea and natural wonders. A rural improvement or a resource does
 * not bar a tile (a resource stays collected; the player is asked before an improvement goes; see needsConfirm), but a building, an urban or other non-rural district,
 * another park's founding tile, or a plot that cannot be read does.
 */
export function joinable(f) {
  if (f.taken || f.owner !== f.parkOwner || f.stray) return false;
  if (f.district === "other") return false;
  return !f.built;
}

/**
 * Whether joining costs the player something to confirm: an improvement stripped. On a resource tile the improvement
 * is the resource's own harvester, and the park's marker takes over collecting the resource
 * (data/national-parks-resources.sql), so that tile joins without a question.
 */
export function needsConfirm(f) { return !!f.improvement && !f.resource; }

/** The facts `joinable` and `needsConfirm` read, for plot i and a park owned by `owner`. */
export function joinFacts(i, owner, taken) {
  const plot = readPlot(i);
  const strip = plot.items.filter((c) => isRuralImprovement(c.type));
  return { taken: taken.has(i), owner: ownerOf(i), parkOwner: owner, stray: plot.stray > 0, district: districtKind(i),
    built: plot.items.some((c) => !isParkCompatible(c.type) && !strip.includes(c)), improvement: strip.length ? strip[0].type : "",
    resource: resourceAt(i) };
}

/** Whether a plot may join a park owned by `owner` (see joinable). */
export function canJoin(i, owner, taken) {
  return i >= 0 && joinable(joinFacts(i, owner, taken));
}

/** Which selected tiles still connect to the park through each other; the rest are dropped. */
export function connectedSelection(parkTiles, selected, ringFn = ringOf) {
  const kept = new Set();
  const reach = new Set(parkTiles);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of selected) {
      if (kept.has(t)) continue;
      if (ringFn(t).some((n) => reach.has(n))) { kept.add(t); reach.add(t); grew = true; }
    }
  }
  return selected.filter((t) => kept.has(t));
}

/** Plots that may be added to `park` now, in plot order. */
export function eligibleTiles(park) {
  if (!park || isFull(park)) return [];
  const taken = allParkTiles();
  const out = new Set();
  for (const t of park.tiles) for (const n of ringOf(t)) if (canJoin(n, park.owner, taken)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/**
 * Add a tile to a park. An improvement on it is taken off first (the player confirmed that in the picker); the rural
 * district under it stays and carries the marker, and is not the park's to destroy later.
 */
export function addTile(park, i) {
  if (!park || !eligibleTiles(park).includes(i)) return false;
  const strip = strippableAt(i);
  park.tiles.push(i);
  park.pending = isFull(park) ? 0 : Math.max(0, (park.pending || 0) - 1);
  save();
  if (readOnly) return true;
  if (strip.length) log(`park ${park.id}: stripping ${strip.map((c) => c.type).join(", ")} from plot ${i}`);
  inSequence(i, async () => {
    const city = tileCityOf(i);
    if (strip.length && !(await stripImprovements(i, strip, city))) return failed(park, i, "strip");
    if (city && stillParkLand(park, i)) await markTile(park, i, city);
  });
  return true;
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

function request(kind, args) {
  if (readOnly) return null;
  return safe(() => Game.PlayerOperations.sendRequest(GameContext.localPlayerID, kind, args), null);
}

// In a network game the mod writes nothing to the map or the save: CREATE_ELEMENT is a local call there, so a write
// would put the clients out of step. Parks are still read from the map, drawn, shaded and named (np-main.js).
let readOnly = false;
export function setReadOnly(on) { readOnly = !!on; }
export function isReadOnly() { return readOnly; }

/** An independent power (`isMajor` false; `isMinor` is false for them too, engine-closed.md). */
export function isIndependent(owner) { return owner >= 0 && safe(() => Players.get(owner).isMajor === false, false); }
function cityIdOf(park) {
  const l = locOf(park.anchor);
  return safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null);
}
/**
 * The settlement that holds plot i, as a ComponentID, or null. A park tile's district and marker belong to it, as every
 * worked tile belongs to the settlement that owns it. In pre-release builds they took the park's founding settlement, so a tile
 * taken from a neighbouring settlement carried a district its own settlement did not list.
 */
function tileCityOf(i) {
  const l = locOf(i);
  return safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.id !== -1 ? c : null; }, null);
}
function sameCity(a, b) { return !!a && !!b && a.owner === b.owner && a.id === b.id; }

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
const MAX_TRIES = 3;
const chains = new Map();    // plot -> the tail of its queue of sequences
const failures = new Map();  // plot -> sequences that ended with a step that never landed

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

function failed(park, i, step) {
  failures.set(i, (failures.get(i) || 0) + 1);
  log(`park ${park ? park.id : "-"}: plot ${i}: ${step} did not land (${failures.get(i)} of ${MAX_TRIES})`);
  return false;
}
function stillParkLand(park, i) { return parks().includes(park) && park.tiles.includes(i) && ownerOf(i) === park.owner; }

/** Request the removal of constructibles on plot i and wait until none of them reads back. */
async function removeAll(i, items) {
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
async function stripImprovements(i, items, city) {
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
 * snow, which a rural district leaves standing; coast, lake, resources and their animals (crabs, foxes, camels) and open
 * land were unchanged under both. No district keeps a tile's own trees or marsh: the park's dressing draws woods back.
 * The engine drops its own improvement (farm, mine, woodcutter, clay pit, fishing boat) on a new rural district; that
 * is taken off at once (makeParkDistrict). The cost: an AI may put a building on a park tile beside its city centre,
 * past the placement hook, and that tile then leaves the park (in pre-release builds a wilderness district prevented it).
 * Returns "rural"; "wild" districts from pre-release builds are rebuilt.
 */
export function parkDistrictKind(_i) { return "rural"; }
const DISTRICT_TYPES = { rural: "DISTRICT_RURAL", wild: "DISTRICT_WILDERNESS" };

/**
 * Make park land's district on plot i for `city` and take off the improvement the engine drops on a new rural district
 * (it housed no one, so no citizen is returned). `piece`, the park improvement the tile is to carry, is requested in
 * the same frame as the district, so it is on the tile before the engine picks one of its own. Resolves false when the
 * district never lands.
 */
async function makeParkDistrict(i, l, city, owner, piece = null) {
  request("CREATE_ELEMENT", { Kind: "DISTRICT", Type: DISTRICT_TYPES[parkDistrictKind(i)], Location: l, Parent: city, Owner: owner });
  if (piece) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: piece, Location: l, Parent: city, Owner: owner });
  if (!(await until(() => hasDistrict(i)))) return false;
  await until(() => constructiblesAt(i).some((c) => isRuralImprovement(c.type)), 1500);
  const dropped = constructiblesAt(i).filter((c) => isRuralImprovement(c.type));
  if (dropped.length) await removeAll(i, dropped);
  return true;
}

/** Make the tile's district (for `city`) if it has none, then its marker; each read back before the next. */
async function markTile(park, i, city) {
  const l = { ...locOf(i) };
  if (!stillParkLand(park, i)) return true;
  // A tile holding an Expedition Base or a worked mountain (KEPT_IMPROVEMENTS) keeps it and carries no marker, as
  // placeMarker already left it: a marker created there replaced the improvement in place (one improvement per plot)
  // and the citizen who worked it was lost (two AI cities lost a citizen
  // each when their park took a worked mountain, IMPROVEMENT_MOUNTAIN, through addTile).
  if (constructiblesAt(i).some((c) => KEPT_IMPROVEMENTS.has(c.type)) || isStrewnResource(i)) return true;
  const want = parkDistrictKind(i), have = districtKind(i);
  if ((have === "rural" || have === "wild") && have !== want) {
    // Park land sits on a wilderness district, not a rural one: the game offers a rural tile beside a city's urban core
    // to its buildings, and an AI builds there past the placement hook; it does not offer a wilderness tile.
    // A rural district left from the owner's improvement, or from a pre-release build, is replaced, marker first; so is
    // a mountain's wilderness district from a pre-release build, which drew the mountain flat.
    if (!(await removeAll(i, markersAt(i)))) return failed(park, i, "marker removal");
    if (!(await removeDistrict(park, i, city, park.owner))) return false;
    if (hasDistrict(i)) return failed(park, i, "district removal");
  }
  if (!stillParkLand(park, i)) return true;
  if (!hasDistrict(i)) {
    park.districts = park.districts || [];
    if (!park.districts.includes(i)) { park.districts.push(i); save(); }
    if (!(await makeParkDistrict(i, l, city, park.owner, markerFor(park)))) return failed(park, i, "district");
  }
  if (!stillParkLand(park, i) || markersAt(i).length) return true;
  request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: markerFor(park),
    Location: l, Parent: city, Owner: park.owner });
  if (!(await until(() => markersAt(i).length > 0))) return failed(park, i, "marker");
  failures.delete(i);
  return true;
}

/** Destroy the district the mod made on plot i and buy the plot back for `city`, which a district's removal releases. */
async function removeDistrict(park, i, city, owner) {
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
  if (readOnly || !park || i === park.anchor || ownerOf(i) !== park.owner || isSettling(i) || isIndependent(park.owner)) return false;
  if ((failures.get(i) || 0) >= MAX_TRIES || isStrewnResource(i)) return false;
  const plot = readPlot(i);
  if (plot.stray || plot.items.some((c) => isParkCompatible(c.type))) return false;
  const city = tileCityOf(i);
  if (!city) return false;
  inSequence(i, () => markTile(park, i, city));
  return true;
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
function misfiled(park, i) {
  const city = tileCityOf(i);
  if (!city) return false;
  const l = locOf(i);
  if (park.districts && park.districts.includes(i)) {
    const d = safe(() => Districts.getAtLocation(l), null);
    if (d && !sameCity(safe(() => d.cityId, null), city)) return true;
  }
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
function rehome(park, i) {
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
 * Swap a park tile's marker for the one its size level calls for (markerFor), or an older save's wild marker
 * (which paid more on wild land in pre-release builds) for it. The district stays. The new marker replaces the old in place (one
 * improvement per plot); any extra marker is taken off first. Returns true when a swap was started.
 */
function remark(park, i) {
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

/** Whether an AI's park takes a tile on its own: never one that would cost it an improvement. */
export function aiTakes(i, owner) { return !needsConfirm(joinFacts(i, owner, new Set())); }

// buying an expansion
//
// A town cannot build or buy Expand National Park: the engine refuses a project in a town by every route (build,
// purchase, town focus), and making the project non-CityOnly refused it in cities too. So a
// settlement with a park, town or city, may buy an expansion from this mod for Gold instead, at the game's usual
// price of 4 Gold per point of production.

/** Gold per point of production when buying, as the game prices its own purchases (Jinja 50 : 200, Grocer 535 : 2140). */
export const GOLD_PER_PRODUCTION = 4;

/** The settlement (city or town) that holds a park's founding tile, as a ComponentID, or null. */
export function settlementOf(park) { return park ? cityIdOf(park) : null; }

/** The Gold price of one expansion bought in a settlement. */
export function expansionPrice(cityId, kind = KINDS.park) {
  const cost = safe(() => Cities.get(cityId).Production.getProjectProductionCost(GameInfo.Projects.lookup(kind.project).$index), 300);
  return Math.round(GOLD_PER_PRODUCTION * (cost > 0 ? cost : 300));
}

/** How much the AI values protecting a plot: wonders and mountains first, then wild cover and water, then open land. */
export function aiScore(i) {
  if (isWonder(i)) return 5;
  if (isMountain(i)) return 4;
  if (featureOf(i)) return 3;
  if (isLake(i) || isNavRiver(i) || isWater(i)) return 2;
  return 1;
}

// whether an AI buys an expansion
//
// The game gives the AI no weighting for projects, so the mod decides for it, each turn, the way a player would: an
// expansion is worth buying when what it adds pays the price back soon enough, at peace, with Gold coming in. What it
// adds is the yield of the tiles it would take: the park's payout plus the tiles' own yields, which the settlement gets
// with no citizen spent; points of yield are valued at AI_GOLD_PER_POINT Gold a turn. An AI spends its Gold as it comes
// in (five AIs at 130 to 270 Gold a turn held 0 to 1,207 at the start of each turn), so it rarely
// holds the price; a worthwhile expansion is saved for instead, AI_SAVE_SHARE of its income a turn set aside in the
// park's fund, and bought when the fund covers the price. At war the fund goes back to the treasury.

/** Gold a turn one point of any yield is worth when an AI weighs an expansion. */
export const AI_GOLD_PER_POINT = 2;
/** Turns an expansion may take to pay for itself; longer when the AI sits on idle Gold. */
export const AI_PAYBACK_TURNS = 30;
export const AI_PAYBACK_TURNS_RICH = 50;
/** Idle Gold: a treasury and fund of this many times the price. */
export const AI_RICH_MULTIPLE = 3;
/** Share of its Gold income a turn an AI sets aside for a worthwhile expansion. */
export const AI_SAVE_SHARE = 0.25;
/** An AI pays the rest at once from its treasury when that leaves it, with AI_RESERVE_TURNS of income, at least
 *  AI_RESERVE_SHARE of the price. */
export const AI_RESERVE_SHARE = 0.5;
export const AI_RESERVE_TURNS = 3;

/**
 * Whether an expansion is worth it to an AI (pure). Facts: price, gold (treasury), fund (Gold already set aside),
 * goldPerTurn (net income), atWar (with another major civilization), gain (yield points a turn its tiles would add),
 * unhappy (the settlement's Happiness is falling), paysHappiness (the park pays Happiness), happinessGain (the
 * Happiness part of gain). Returns { worth, why, payback }.
 */
export function aiExpansionWorth(f) {
  if (!(f.gain > 0)) return { worth: false, why: "no land worth taking" };
  if (f.atWar) return { worth: false, why: "at war" };
  if (!(f.goldPerTurn > 0)) return { worth: false, why: "Gold income not positive" };
  const gain = f.gain + (f.unhappy && f.paysHappiness ? (f.happinessGain || 0) : 0);
  const payback = f.price / (gain * AI_GOLD_PER_POINT);
  const limit = (f.gold || 0) + (f.fund || 0) >= f.price * AI_RICH_MULTIPLE ? AI_PAYBACK_TURNS_RICH : AI_PAYBACK_TURNS;
  return payback <= limit ? { worth: true, why: "pays back", payback } : { worth: false, why: "too slow to pay back", payback };
}

/**
 * One turn of an AI's saving for an expansion (pure): how much Gold to move from the treasury into the park's fund,
 * and whether the fund then buys it. Returns { charge, buy, refund, worth, why, payback }: `refund` is fund Gold to give
 * back (at war), `charge` Gold to take from the treasury now.
 */
export function aiSavingStep(f) {
  const fund = f.fund || 0;
  const w = aiExpansionWorth(f);
  if (!w.worth) return { ...w, charge: 0, buy: false, refund: f.atWar ? fund : 0 };
  const need = Math.max(0, f.price - fund);
  const gold = Math.max(0, f.gold);
  const spare = gold - need + AI_RESERVE_TURNS * f.goldPerTurn >= f.price * AI_RESERVE_SHARE;
  const charge = gold >= need && spare ? need : Math.min(gold, need, Math.round(AI_SAVE_SHARE * f.goldPerTurn));
  return { ...w, charge, buy: fund + charge >= f.price, refund: 0 };
}

/** A land marker's payout in yield points and its Happiness part at a size level (data/national-parks-land.xml): a
 *  National Park's +1/+1, +2/+1, +2/+2, +3/+2 Culture/Happiness; a Wilderness Area's +3 to +6 Influence. */
const PARK_LEVELS = [[1, 1], [2, 1], [2, 2], [3, 2]];
export function landPayout(kindKey, level = 0) {
  if (kindKey === "wilderness") return { points: 3 + level, happiness: 0 };
  const [culture, happiness] = PARK_LEVELS[level];
  return { points: culture + happiness, happiness };
}

/** Yield points a turn a tile would add to a park: the land marker's payout at the park's level once the tile has
 *  joined, and the tile's own yields; `happiness` is the payout's Happiness part. */
export function tileGain(i, park) {
  const kind = kindOf(park), owner = park.owner;
  const { points: payout, happiness } = landPayout(kind.key, milestoneLevel(park.tiles.length + 1));
  const l = locOf(i);
  let own = 0;
  for (const y of ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"]) {
    own += safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes[y], owner), 0) || 0;
  }
  return { points: payout + own, happiness };
}

/** A rural improvement a park may strip (the owner's farm, camp or mine); anything else, a building or a wonder,
 *  is urban development, which a park never removes. */
export function isRuralImprovement(type) { return /^IMPROVEMENT_/.test(type) && !PARK_TYPES.has(type) && !isParkCompatible(type); }

/**
 * Put a park tile its owner has improved back to park land: the rural improvement is removed and the marker returns.
 * Park land cannot be developed, and the AI plans natively, past the placement hook that holds the players.
 */
function revertTile(park, i, intruders) {
  if (readOnly) return;
  log(`park ${park.id}: reverting ${intruders.map((c) => c.type).join(", ")} on plot ${i}`);
  inSequence(i, async () => {
    const city = tileCityOf(i);
    if (!(await stripImprovements(i, intruders, city))) return failed(park, i, "revert");
    if (city && stillParkLand(park, i)) await markTile(park, i, city);
    return true;
  });
}

/** Put the founding tile back: a rural improvement on it is removed, then the park improvement made again if it went. */
function restoreFoundingTile(park, rural, standing) {
  if (readOnly) return;
  const i = park.anchor, owner = park.owner, l = { ...locOf(i) }, city = cityIdOf(park);
  const type = kindOf(park).improvement;
  inSequence(i, async () => {
    if (!(await stripImprovements(i, rural, city))) return failed(park, i, "founding tile strip");
    if (standing || !parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!hasDistrict(i) && !(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (constructiblesAt(i).some((c) => c.type === type)) return true;
    request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    return true;
  });
}

/**
 * A park tile that can carry the park's founding improvement in place of a founding tile built over: the owner's land
 * in the founding settlement, flat or hill, holding only the park's own marker. One beside a natural wonder comes first,
 * then the nearest to the old founding tile. Returns the plot, or -1.
 */
export function newFoundingTile(park, old, city) {
  const ok = park.tiles.filter((t) => {
    if (t === old || isSettling(t) || ownerOf(t) !== park.owner || isWonder(t) || isWater(t) || isMountain(t)) return false;
    if (!sameCity(tileCityOf(t), city)) return false;
    if (!["TERRAIN_FLAT", "TERRAIN_HILL"].includes(terrainOf(t))) return false;
    const plot = readPlot(t);
    return !plot.stray && plot.items.every((c) => isMarkerType(c.type));
  });
  const near = (t) => ringOf(t).some((n) => n >= 0 && isWonder(n)) ? 0 : 1;
  const dist = (t) => { const a = locOf(t), b = locOf(old); return safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), 99); };
  ok.sort((a, b) => near(a) - near(b) || dist(a) - dist(b) || a - b);
  return ok.length ? ok[0] : -1;
}

/**
 * Move a park's founding improvement to another of its tiles after its founding tile was built over (an AI's own
 * building; the player's are refused by the placement hook). The built-over tile leaves the park with its building.
 * Returns false when no tile can take it, and the park is then dissolved.
 */
function moveFounding(park) {
  if (readOnly) return false;
  const old = park.anchor;
  const city = cityIdOf(park);
  const to = city ? newFoundingTile(park, old, city) : -1;
  if (to < 0) return false;
  park.tiles = park.tiles.filter((t) => t !== old);
  if (park.districts) park.districts = park.districts.filter((t) => t !== old);
  park.anchor = to;
  save();
  log(`park ${park.id}: founding tile ${old} built over; the park is now founded on ${to}`);
  const owner = park.owner, l = { ...locOf(to) }, type = kindOf(park).improvement;
  inSequence(to, async () => {
    if (!(await removeAll(to, markersAt(to)))) return failed(park, to, "marker removal");
    if (!parks().includes(park) || park.anchor !== to || ownerOf(to) !== owner) return true;
    request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(to).some((c) => c.type === type)))) return failed(park, to, "park improvement");
    return true;
  });
  return true;
}

/**
 * Found the park a founding paid for on plot i: the record is made at once (so the sweep does not take the plot for
 * someone else's), then a wilderness district and the founding improvement are placed by script for the settlement,
 * each read back before the next. On a resource tile the engine may drop the resource's own improvement onto a new
 * district (engine-closed.md, quarry on jade); that is taken off before the park goes on. Returns the park, or null.
 */
export function foundPark(founding, i) {
  if (readOnly || !founding || !foundable(foundFacts(i, founding.city, allParkTiles()))) return null;
  const owner = founding.owner, city = founding.city, kind = KINDS[founding.kind] || KINDS.park, type = kind.improvement;
  dropFounding(founding.id);
  const park = createPark(i, owner, kind.key);
  park.districts = [i];
  save();
  const l = { ...locOf(i) };
  log(`park ${park.id}: founded on plot ${i} (${l.x},${l.y})`);
  inSequence(i, async () => {
    if (!(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (!parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!constructiblesAt(i).some((c) => c.type === type)) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    failures.delete(i);
    return true;
  });
  return park;
}

const rewilded = new Set();   // plots moved onto a wilderness district this session; one try each

/** Move a park tile still on a rural district (the owner's, or a pre-release park's) onto a wilderness district. */
function rewild(park, i) {
  if (readOnly || rewilded.has(i)) return false;
  rewilded.add(i);
  const city = tileCityOf(i);
  if (!city) return false;
  log(`park ${park.id}: plot ${i} moved onto its ${parkDistrictKind(i)} district`);
  inSequence(i, () => markTile(park, i, city));
  return true;
}

/**
 * Move a founding tile from the rural district its settlement built it on to a wilderness district, which no building
 * is offered (see markTile): the park improvement comes off, the district goes and the plot is bought back, then the
 * wilderness district and the park improvement are made again.
 */
function rewildFounding(park) {
  const i = park.anchor;
  if (readOnly || rewilded.has(i)) return false;
  rewilded.add(i);
  const owner = park.owner, l = { ...locOf(i) }, city = cityIdOf(park), type = kindOf(park).improvement;
  if (!city) return false;
  log(`park ${park.id}: founding tile moved onto its ${parkDistrictKind(i)} district`);
  inSequence(i, async () => {
    if (!(await removeAll(i, constructiblesAt(i).filter((c) => c.type === type)))) return failed(park, i, "park improvement removal");
    if (!(await removeDistrict(park, i, city, owner))) return false;
    if (!parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!hasDistrict(i) && !(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (!constructiblesAt(i).some((c) => c.type === type)) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    return true;
  });
  return true;
}

/**
 * Bring a park back in line with the map. The owner follows the founding tile. Land lost to another owner is let go.
 * A rural improvement the owner puts on park land is reverted (revertTile); a building or an urban district is never
 * removed: that tile leaves the park instead. If it is the founding tile, the park's founding improvement moves to
 * another of its tiles (moveFounding); with none to take it the park is dissolved, as it is once its founding tile
 * belongs to no one. A full park's unused tiles lapse. Tiles the mod is
 * still writing to, and plots that cannot be read, are left for a later sweep. Returns "dissolved", "changed" or "".
 */
export function reconcile(park) {
  let changed = false;
  const owner = ownerOf(park.anchor);
  // While the founding tile is being rebuilt its plot is briefly unowned (a district's removal releases it).
  if (owner === -1) return isSettling(park.anchor) ? "" : "dissolved";
  // Gold an AI set aside for the park stays with the player that saved it; a new owner starts its own fund.
  if (owner !== park.owner) { park.owner = owner; park.aiFund = 0; changed = true; }
  if (isIndependent(owner)) return reconcileIndependent(park) || (changed ? "changed" : "");
  if (!isSettling(park.anchor)) {
    const a = readPlot(park.anchor);
    if (!a.stray) {
      const own = (t) => t === kindOf(park).improvement;
      const urban = districtKind(park.anchor) === "other" || a.items.some((c) => !own(c.type) && !isRuralImprovement(c.type));
      if (urban) return moveFounding(park) ? "changed" : "dissolved";
      const standing = a.items.some((c) => own(c.type) && c.complete);
      if (standing && districtKind(park.anchor) !== parkDistrictKind(park.anchor) && rewildFounding(park)) return "changed";
      const rural = a.items.filter((c) => c.owner === owner && isRuralImprovement(c.type));
      if ((rural.length || !standing) && !readOnly && (failures.get(park.anchor) || 0) < MAX_TRIES) {
        // A farm or the like put on the founding tile is stripped, and the park improvement put back if it went.
        restoreFoundingTile(park, rural, standing);
        log(`park ${park.id}: founding tile restored`);
        changed = true;
      }
    }
  }
  const lost = [];
  for (const t of park.tiles) {
    if (t === park.anchor || isSettling(t)) continue;
    if (ownerOf(t) !== park.owner) { lost.push(t); continue; }
    const plot = readPlot(t);
    if (plot.stray) continue;
    const intruders = plot.items.filter((c) => !isParkCompatible(c.type));
    if (!intruders.length && districtKind(t) === "rural" && misfiled(park, t)) { if (rehome(park, t)) changed = true; continue; }
    const dk = districtKind(t);
    if (!intruders.length && (dk === "rural" || dk === "wild") && dk !== parkDistrictKind(t) && markersAt(t).length) { if (rewild(park, t)) changed = true; continue; }
    if (!intruders.length && districtKind(t) !== "other") { if (remark(park, t)) changed = true; continue; }
    if (districtKind(t) === "other" || intruders.some((c) => !isRuralImprovement(c.type) || c.owner !== park.owner)) { lost.push(t); continue; }
    revertTile(park, t, intruders);
    changed = true;
  }
  if (lost.length) {
    park.tiles = park.tiles.filter((t) => !lost.includes(t));   // before any destroy: its removal event re-runs the sweep
    for (const t of lost) log(`park ${park.id}: tile ${t} left the park (${releaseTile(park, t)})`);
    changed = true;
  }
  if (isFull(park) && park.pending > 0) { park.pending = 0; changed = true; }
  return changed ? "changed" : "";
}

/**
 * An independent power's park is left to the game. A settlement that passes to one is taken apart a few districts a
 * turn until its land is released, park land and the rest alike; putting the park's pieces back
 * kept that settlement from ever going. So nothing is written: a tile whose district the game removed is forgotten,
 * and the park ends with its founding improvement. Returns "dissolved", "changed" or "".
 */
function reconcileIndependent(park) {
  const a = readPlot(park.anchor);
  if (!a.stray && !a.items.some((c) => c.type === kindOf(park).improvement)) return "dissolved";
  const kept = park.tiles.filter((t) => t === park.anchor || (ownerOf(t) === park.owner && districtKind(t) !== "none"));
  if (kept.length === park.tiles.length) return "";
  for (const t of park.tiles) if (!kept.includes(t)) log(`park ${park.id}: tile ${t} left the park (taken down by the game)`);
  park.tiles = kept;
  if (park.districts) park.districts = park.districts.filter((t) => kept.includes(t));
  return "changed";
}

/** One pass over the map: plots holding a finished park improvement, and plots holding a land marker. */
export function scanMap() {
  const anchors = [], markers = [], wilds = [];
  const w = safe(() => GameplayMap.getGridWidth(), 0);
  const h = safe(() => GameplayMap.getGridHeight(), 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const list = safe(() => MapConstructibles.getConstructibles(x, y), null);
    if (!list || !list.length) {
      // An empty wilderness district filed with a settlement: one a park made, on land that has since left it.
      const d = safe(() => Districts.getAtLocation({ x, y }), null);
      if (d) {
        const i = idx({ x, y });
        const filed = safe(() => d.cityId && d.cityId.id !== -1 && Players.get(d.cityId.owner).isMajor, false);
        if (filed && districtKind(i) === "wild") wilds.push(i);
      }
      continue;
    }
    const i = idx({ x, y });
    if (hasParkImprovement(i)) anchors.push(i);
    if (markersAt(i).length) markers.push(i);
  }
  return { anchors, markers, wilds };
}

/**
 * Take away the empty wilderness districts a park left on land it no longer holds (a tile that passed to another
 * player stays theirs, with its district): a wilderness tile can take no building and no farm, so it would be dead
 * land for its new owner. The plot, which the removal releases, is bought back for the settlement that held it. The
 * game's own wilderness districts belong to independent powers and have no settlement, so they are never touched.
 */
export function removeOrphanWilds(plots) {
  if (readOnly) return 0;
  const taken = allParkTiles();
  const orphans = (plots || []).filter((i) => !taken.has(i) && !isSettling(i));
  for (const i of orphans) {
    const city = tileCityOf(i), owner = ownerOf(i);
    if (!city || owner < 0) continue;
    log(`plot ${i}: an empty wilderness district no park holds; removed`);
    inSequence(i, () => removeDistrict(null, i, city, owner));
  }
  return orphans.length;
}

/** Plot indices that hold a finished National Park improvement, anywhere on the map. */
export function scanForParkImprovements() { return scanMap().anchors; }

/**
 * Marker plots no park holds, from a scan (pure given `taken` and `busy`). A marker outlives its park's record when
 * land passes to another owner (the park only forgets it) or a record is lost; it would pay park yields forever and
 * keep the tile from being improved.
 */
export function orphanMarkerPlots(markerPlots, taken, busy = () => false) {
  return markerPlots.filter((i) => !taken.has(i) && !busy(i));
}

/** Take the markers off plots no park holds. Returns how many plots were cleared. */
export function removeOrphanMarkers(markerPlots) {
  if (readOnly) return 0;
  const orphans = orphanMarkerPlots(markerPlots, allParkTiles(), isSettling).filter((i) => !isIndependent(ownerOf(i)));
  for (const i of orphans) {
    log(`plot ${i}: marker belongs to no park; removed`);
    inSequence(i, async () => { if (!(await removeAll(i, markersAt(i)))) failed(null, i, "orphan marker removal"); });
  }
  return orphans.length;
}

/** Deterministic 0..1 from a plot and a salt, so a park keeps its look across reloads. */
export function hash01(i, salt) {
  let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
