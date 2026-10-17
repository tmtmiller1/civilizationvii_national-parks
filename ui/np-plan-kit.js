// np-plan-kit.js - National Parks: what the park plan places, and the geometry it measures with.
//
// The art (assets, biome kits, woods fills, rocks), the hex geometry and the budgets that every step of the plan
// (np-plan.js) shares. Pure: it imports only hash01, so any step can import it without a cycle.
"use strict";

import { hash01 } from "./np-core.js";

// assets

// One scale for everything built, from the models' own sizes (asset catalog, 2026-10-04): about 1.1 model units to
// the metre. A cabin (12.7 tall as modelled) at 0.4 stands 5; the warden's lodge, the largest house in a park, 9.5; a
// picnic shelter 3.6; a wall tent 4.5; a lookout tower 18; a cairn mound (15.8) at 0.3 stands 4.7, an obelisk (13)
// at 0.6 stands 7.8, a dolmen (17.8) at 0.4 stands 7.1, a path's stone waymark (13.1) at 0.16 stands 2.1. The animals
// take the same care in np-wildlife.js (SPECIES). Trees and plants keep the game's sizes.
export const LODGE = "IMP_Camp_BldA", SHELTER = "PROP_Pasture_ANT_BldB", SIGN = "NAM_SWN_Menagerie_Sign";
export const CABIN = "IMP_Camp_BldA", CAMP_TENT = "PROP_Tent_GEN_Sleeper_Standard_C", CAMP_FIRE = "PROP_Fire_Pit";
export const LOOKOUT = "Camp_Lookout_Tower_Bin", WAYMARK = "PROP_CairnRock_Stack";
export const CAIRN_MOUND = "PROP_CairnBase", OBELISK = "NAF_EGY_CityHall_Obelisk", DOLMEN = "ANT_EEU_Monument_Rock_Structure";
export const TRAIL = "ANT_Decal_Path_A_Dirt_CurvedSM";
const LILIES = [["FOL_LilyPad_Triple_Flower", 1.6], ["FOL_LilyPad_Double_Flower", 2]];
const CATTAIL = "FOL_Cattail_A", ROWBOAT = "PAC_HWI_Palace_RowBoat";
/** Sponges on a cold sea floor off the shore: the game ships no sponge, and its arctic corals are the nearest look (the
 *  lumpy red and the pink brain-like ones). Asset catalog, 2026-10-16; not yet watched placed by script. */
const SPONGES = ["FOL_Arctic_Coral_C", "FOL_Arctic_Coral_D", "FOL_Arctic_Coral_E"];
/** Latitude from which a sea is cold: past the game's desert band (33 to 44 degrees, feature-biome-generator.js) and
 *  into the grassland one, so reef fish keep to warm water and a cold coast has crabs, sponges and whales instead. */
const COLD_WATER_LAT = 40;
/** Whether plot t lies in cold water, by the map's latitude (a map that gives none is warm). */
function coldWater(map, t) { return !!map.lat && Math.abs(map.lat(t) || 0) >= COLD_WATER_LAT; }
// The warden's station on the founding tile: the lodge, an open picnic shelter and the park sign. The one fixed group
// in a park; the footpaths leave from its door.
const STATION = [[LODGE, -0.14, 0.12, 0.75, 30], [SHELTER, 0.2, -0.14, 0.55, 300], [SIGN, 0.3, 0.12, 0.75, 0]];
const DOOR = [0.02, -0.03];

/** Per biome: tree kinds, an understory bin (or null), rocks, the game's own mixed clumps. */
export const KITS = {
  BIOME_GRASSLAND: { trees: ["BIN_FOL_Grassland_Trees_SM", "BIN_FOL_Grassland_Trees_LG", "FOL_Birch_Tall_Grove_A"], under: "BIN_FOL_Grassland_Shrubs", tuft: "BIN_FOL_Grassland_Groundcover_B" },
  BIOME_PLAINS: { trees: ["BIN_FOL_Plains_Trees_SM", "BIN_FOL_Elm_Tree_C"], under: null, tuft: "BIN_FOL_Plains_Groundcover",
    clusters: ["FOL_Plains_Cluster_G", "FOL_Plains_Cluster_F", "FOL_Plains_Cluster_I"] },
  BIOME_DESERT: { trees: ["BIN_FOL_Desert_Trees_SM"], under: "BIN_FOL_Desert_Shrubs", rocks: "BIN_FOL_Desert_Sm_Rocks", tuft: "BIN_FOL_Desert_Grass_Patch" },
  BIOME_TUNDRA: { trees: ["BIN_FOL_Tundra_Trees_SM", "BIN_FOL_Tundra_Trees_LG", "FOL_Birch_Tall_Grove_A"], under: "BIN_FOL_Tundra_Shrubs", tuft: "BIN_FOL_Grassland_Groundcover_B" },
  BIOME_TROPICAL: { trees: ["BIN_FOL_Tropical_Trees_SM", "BIN_FOL_Tropical_Trees_MD"], under: "BIN_FOL_Tropical_Shrubs", tuft: "BIN_FOL_Tropical_Groundcover" },
};
const kitOf = (biome) => KITS[biome] || KITS.BIOME_GRASSLAND;
/** Tree kinds that are already a whole grove in one model: a stand takes one at most, at a modest size. */
export const GROVES = new Set(["FOL_Birch_Tall_Grove_A", "FOL_Plains_Cluster_G", "FOL_Plains_Cluster_F", "FOL_Plains_Cluster_I"]);
export function singles(trees) { const s = trees.filter((a) => !GROVES.has(a)); return s.length ? s : trees; }
/** Features whose own model is the whole look of the tile: nothing else is planted there. */
export const MODEL_ALONE = new Set(["FEATURE_MARSH", "FEATURE_TUNDRA_BOG", "FEATURE_RAINFOREST", "FEATURE_MANGROVE",
  "FEATURE_OASIS", "FEATURE_WATERING_HOLE"]);
/**
 * What fills a tile the map covers with woods or scrub, and how far apart: by feature where the biome's trees do not
 * fit, else by biome. The spacings give what was matched against untouched tiles of the same feature (crash soaks
 * npt1, npt2, 2026-10-02): about six of the large grassland or tundra sets to a tile, eight savanna trees, and a
 * plains wood of about thirty single trees.
 */
function fillOf(f) {
  if (f.feature === "FEATURE_SAVANNA_WOODLAND") return { assets: [["BIN_FOL_Desert_Trees_SM", 1]], r0: 0.3 };
  if (f.feature === "FEATURE_SAGEBRUSH_STEPPE") return { assets: [["BIN_FOL_Desert_Shrubs", 3], ["BIN_FOL_Desert_Trees_SM", 1]], r0: 0.22, drift: true };
  if (f.biome === "BIOME_GRASSLAND") return { assets: [["BIN_FOL_Grassland_Trees_LG", 1]], r0: 0.27 };
  if (f.biome === "BIOME_TUNDRA") return { assets: [["BIN_FOL_Tundra_Cluster_A_Large", 1]], r0: 0.27 };
  const kit = kitOf(f.biome);
  return { assets: [...singles(kit.trees).map((a) => [a, 3]), ...(kit.clusters || []).map((a) => [a, 0.8])],
    r0: 0.14, under: kit.under };
}
/** A giant a Wilderness Area's stand gains at 24 tiles, by biome. */
export function oldGrowth(biome) {
  if (biome === "BIOME_TROPICAL") return ["FOL_HB_Flower_Tree_A", 1.4];
  if (biome === "BIOME_GRASSLAND" || biome === "BIOME_PLAINS" || biome === "BIOME_TUNDRA") return ["FOL_Coastal_Redwood_A", 1.1];
  return null;
}
const OLD_GROWTH_SHARE = 0.3;
/** The gravel strip the game lays for a road, drawn narrow: a trail that shows on sand and on snow, where the dirt
 *  path's decal does not (audition on snow, cap57-plan5, 2026-10-05: every road piece read clearly at 1.1). */
export const GRAVEL = "BIN_TER_Decal_Road_CP_Straight_Short_A";
const ROCK_SHAPES = "ABCDE";
/** A loose rock of the local stone: only the plains (gray) and desert (red-brown) sets draw in their own color. */
function localRock(id, salt, biome) {
  return (biome === "BIOME_DESERT" ? "Desert" : "Plains") + "_Rough_Rock_Rounded_" + ROCK_SHAPES[Math.floor(hash01(id, salt) * 5)];
}
/** Ground a dirt decal is faint on: its footpaths are marked with stone waymarks as well. */
const PALE_GROUND = new Set(["BIOME_DESERT", "BIOME_TUNDRA"]);

// geometry

/** Unit vector of ring direction i: east at 0, then clockwise on screen (north is +y, the viewer is to the south). */
const DIRS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (360 - 60 * i) * Math.PI / 180;
  return [Math.cos(a), Math.sin(a)];
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rot = (deg, x, y) => {
  const a = deg * Math.PI / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const deg = (v) => Math.floor(((v % 360) + 360) % 360);
const edgeId = (a, b) => (Math.min(a, b) * 7919 + Math.max(a, b)) | 0;
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const u = l2 ? clamp01(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2) : 0;
  return Math.hypot(p[0] - a[0] - vx * u, p[1] - a[1] - vy * u);
}
function weighted(list, u) {
  const total = list.reduce((n, v) => n + v[1], 0);
  let x = u * total;
  for (const v of list) { x -= v[1]; if (x < 0) return v[0]; }
  return list[list.length - 1][0];
}

// budgets

/** What a park of n tiles at a size level may carry. Per park, never per tile, and growing slower than the land. */
export function budgetsFor(n, level, buildings) {
  return {
    structures: buildings && n >= 3 ? Math.min(4, 1 + level) : 0,
    lookouts: buildings && n >= 3 ? [1, 2, 2, 3][Math.min(3, level)] : 0,
    monuments: Math.min(3, level),
    herds: 1 + Math.floor(Math.sqrt(n) / 1.6),
    rare: !buildings && level >= 2 ? level - 1 : 0,
    flocks: n >= 24 ? 3 : n >= 12 ? 2 : 1,
    climbers: level >= 2 ? 2 : 1,
  };
}
/** The order focal things join a park in, by the level that brings them, so a higher level keeps a lower one's. */
const FOCAL_ORDER = ["camp", "lookout", "village", "cairn", "lookout", "shelter", "second", "camp", "cairn", "lookout"];

export { LILIES, CATTAIL, ROWBOAT, SPONGES, COLD_WATER_LAT, coldWater, STATION, DOOR, kitOf, fillOf, OLD_GROWTH_SHARE,
  localRock, PALE_GROUND, DIRS, dist,
  clamp01, rot, deg, edgeId, segDist, weighted, FOCAL_ORDER };
