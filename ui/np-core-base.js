// np-core-base.js - National Parks: the two kinds of park, what may stand on park land, size levels, and the
// network-game switch. Reads nothing from the map.
"use strict";

/**
 * The two kinds of park. A National Park pays Culture and Happiness and has a warden's lodge and cabins; a Wilderness
 * Area is its twin, paid in Influence and drawn without houses or shelters. Everything else (founding, growth,
 * protection, names) is shared. A record's `kind` is "park" when absent (older saves).
 *
 * `landLevels` are the land marker's size-bonus versions (see milestoneLevel below): every tile of a park of the kind
 * carries the one for the level its land has reached, `land` below the first. `land` is the land marker every park tile
 * carries; `wild`, which paid more on wild land in pre-release builds, is still recognised so the sweep can swap it for
 * `land` in older saves.
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

/** Ring order used for edges and drawing; index i matches armAngle(i) in np-draw.js. */
export const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST",
  "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];

export function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
export function log(m) { safe(() => console.error("[NationalPark] " + m)); }
export function isMarkerType(type) { return MARKER_TYPES.has(type); }
/** Improvements a park keeps where they stand: an Expedition Base lets a mountain or wonder be worked, and a park
 *  allows it (such a tile carries no marker). Both names are the Expedition Base in the Modern database. */
export const KEPT_IMPROVEMENTS = new Set(["IMPROVEMENT_EXPEDITION_BASE", "IMPROVEMENT_MOUNTAIN"]);
/** What may stand on park land: the park's markers and a kept improvement. */
export function isParkCompatible(type) { return isMarkerType(type) || KEPT_IMPROVEMENTS.has(type); }

// milestones
//
// Each park reaches size levels at 8, 16 and 24 of its own tiles (its founding tile included), and every tile of that
// park then pays more: its land marker is swapped for the level's (data/national-parks-land.xml). Parks level apart:
// another park of the same owner, of either kind, does not count. The count is the land the park holds now, so land
// lost, built over or let go counts against it, and the markers step back down. (Until 2026-10-04 a player's parks of a
// kind counted together; changed to one park's own size.) The swap is in place: CREATE_ELEMENT of a marker on a plot
// replaces the one there (one improvement per plot), and markers house no one, so no citizen moves.
export const MILESTONES = [8, 16, 24];
/** Pure: the milestone level (0 to 3) of a number of park tiles. */
export function milestoneLevel(tiles) { return MILESTONES.filter((n) => tiles >= n).length; }
/** The land marker for a kind at a level. */
export function landMarker(kind, level) { return level > 0 ? kind.landLevels[level - 1] : kind.land; }

// In a network game the mod writes nothing to the map or the save: CREATE_ELEMENT is a local call there, so a write
// would put the clients out of step. Parks are still read from the map, drawn, shaded and named (np-main.js).
export let readOnly = false;
export function setReadOnly(on) { readOnly = !!on; }
export function isReadOnly() { return readOnly; }

// While Autoplay runs (a tuner and test tool), the game carries out no CREATE_ELEMENT request and reads every seat as
// an AI: GameContext.localPlayerID is -1 and Players.get(id).isHuman false, with Autoplay.returnAsPlayer naming the
// human. Watched 2026-10-17 (Modern lab game, seed 9001; tests/np-autoplay.test.mjs). Gold grants still go through.
export function autoplaying() { return !!safe(() => Autoplay.isActive, false); }

/** A land marker's payout in yield points and its Happiness part at a size level (data/national-parks-land.xml): a
 *  National Park's +1/+1, +2/+1, +2/+2, +3/+2 Culture/Happiness; a Wilderness Area's +3 to +6 Influence. */
const PARK_LEVELS = [[1, 1], [2, 1], [2, 2], [3, 2]];
export function landPayout(kindKey, level = 0) {
  if (kindKey === "wilderness") return { points: 3 + level, happiness: 0 };
  const [culture, happiness] = PARK_LEVELS[level];
  return { points: culture + happiness, happiness };
}

/** A rural improvement a park may strip (the owner's farm, camp or mine); anything else, a building or a wonder,
 *  is urban development, which a park never removes. */
export function isRuralImprovement(type) { return /^IMPROVEMENT_/.test(type) && !PARK_TYPES.has(type) && !isParkCompatible(type); }

/** Deterministic 0..1 from a plot and a salt, so a park keeps its look across reloads. */
export function hash01(i, salt) {
  let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
