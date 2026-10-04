// np-draw.js - National Parks: how a park looks on the map.
//
// The improvement has no model of its own (watched 2026-09-27: a completed park drew nothing), so everything is
// drawn by script from shipped meshes, as Canals draws its canals. Each asset below was auditioned on 1.5.0 on
// 2026-09-27; offsets use Canals' convention (x along a ring direction, 0.42-0.46 is at the edge).
//
// Layers per park:
//   border    a green outline around the whole park, the border overlay city borders use
//   walls     low dry-stone walls on most outer land edges, composed per edge from stone runs laid either way
//             round, boulders, shrubs and fallen stones by biome: the walls along a scenic parkway, not a
//             surveyed fence. Never on or facing water, a mountain or the wonder.
//   buoys     where park water meets open water, a buoy now and then; water gets no walls
//   wildlife  animated herds, birds, butterflies, fish and shore birds, chosen per tile (np-wildlife.js)
//   dressing  per tile, from its land: stands of trees in four shapes with a flowering accent, an understory,
//             stones and cairns on hills, lily pads and cattails on a lake, a rowboat on water, a warden's
//             station on the founding tile, a lookout tower on one hill, dirt trails. Nothing on the wonder.
//             Which tiles carry which accent is planned for the whole park (np-scene.js), so neighbors differ.
// Tiles just added are drawn in sequence, each wall run with a puff of dust, so the park visibly grows.
//
// Size levels: as a park reaches 8, 16 and 24 of its own tiles (np-core.js parkLevel), it draws richer. Each level
// gives a park a number of level sites (levelSites): a National Park a campsite, a cabin village or a shelter on each,
// and a lookout tower on another hill; a Wilderness Area a thicket on each, more meadow and undergrowth,
// rarer wildlife from 16 tiles and old-growth giants at 24, never more trees; both more animals (np-scene.js
// LEVEL_BOOST, herds in np-wildlife.js). Each level only adds to the one
// below, on tiles taken in a fixed order by hash, so stepping down takes exactly that away and a park looks the same
// after a reload.
"use strict";

import {
  safe, log, locOf, ringOf, terrainOf, biomeOf, featureOf, isMountain, isWater, isWonder, isLake, isNavRiver, isRiver,
  isImpassableEdgeTile, isRevealed, hash01, kindOf, parkLevel, parks,
} from "./np-core.js";
import { wildlifeFor, FAUNA_POOLS } from "./np-wildlife.js";
import { planScene } from "./np-scene.js";
import { refreshLens } from "./np-lens.js";
import { getMarks } from "./np-settings.js";

const WALL = "NAM_SWN_CityKit_RockFence";
/**
 * The pasture's split-rail fence, for open ground (fields, forest); hills and mountains keep dry stone. Sections:
 * [asset, length along the edge in tile units at scale 1, extra turn to lay it along the edge, weight]. Measured
 * 2026-10-02 (crash soak npr, rows at stepped spacings): A is a two-rail section about 0.1 long, B and C three-rail
 * sections about 0.12. All three take a quarter turn to lie along an edge, the gates none: watched on one tile's six
 * edges in one frame (crash soak npo4, 2026-10-03; C with no turn stood across its edge, as the player saw).
 */
const WOOD_SECTIONS = [["PROP_GEN_FenceBit_A", 0.1, 90, 5], ["PROP_GEN_FenceBit_B", 0.12, 90, 3], ["PROP_GEN_FenceBit_C", 0.12, 90, 2]];
// The gates lie along an edge with no turn (npo4; a quarter turn stood them across it).
const WOOD_GATES = [["PROP_Pasture_FenceDoor_Closed", 0.09, 0], ["PROP_Pasture_FenceDoor_Open", 0.09, 0]];
const GATE_SHARE = 0.3;           // open-ground fenced edges with a gate somewhere along them
const FENCED_EDGE_SHARE = 0.75;  // open-ground edges that are mostly fence; the rest are stone with a short fence now and then
const WALL_SHARE = 0.96;          // share of eligible outer edges that get walling
const INNER_WALL_SHARE = 0.05;    // share of edges between two of the park's own tiles that get walling (0.25 read as
                                  // walls across the middle of a park, 2026-10-04)
const BUOY = "PROP_MOD_Harbor_Buoy";
const BUOY_SHARE = 0.5;
const DUST = "VFX_Dust_In_Place_SquadCom_Tan";
const STAGGER_MS = 110;

const STATION = [
  ["IMP_Camp_BldA", -0.14, 0.12, 0.75, 30],           // log cabin, the warden's lodge
  ["PROP_Pasture_ANT_BldB", 0.2, -0.14, 0.7, 300],     // open picnic shelter
  ["NAM_SWN_Menagerie_Sign", 0.3, 0.12, 1, 0],
];
/** A lone picnic shelter or clapboard ranger house, now and then on a park's open land. */
const PARK_BUILDINGS = [["PROP_Pasture_ANT_BldB", 0.5], ["PROP_MOD_Farm_BldC", 0.42]];
const SHELTER_SHARE = 0.06;       // non-wooded National Park tiles with a lone shelter or ranger house
/**
 * A cabin village, as in the lodges of the American parks: three or four log cabins (IMP_Camp_BldA, the warden's
 * lodge, well scaled down) in two loose rows across a curving dirt trail, cabins and trees taking turns along each
 * row (cabinCluster). (A ring round a clearing read as a circle of houses; bare rows as a housing tract.)
 */
const CABIN = "IMP_Camp_BldA";
const CABIN_SHARE = 0.06;         // open flat National Park tiles with a cabin village
/**
 * The cabin village about (cx, cy): two loose rows facing each other across a dirt trail that curves over the tile
 * (across bearing `open`). Along each row cabins and trees take turns, a tree of the tile's kind (`trees`) in every
 * gap, so one row reads cabin, tree, cabin and the other tree, cabin, tree; setbacks, spacing and headings all vary a
 * little, and each cabin fronts the trail: [[asset, dx, dy, scale, angle]]. Three or four cabins. Pure.
 */
export function cabinCluster(t, cx, cy, open, trees = null) {
  const n = hash01(t, 420) < 0.5 ? 3 : 4;
  const lane = open + 90 + (hash01(t, 418) - 0.5) * 24;          // the trail's bearing, a little off square
  const bow = (hash01(t, 419) < 0.5 ? -1 : 1) * (0.4 + hash01(t, 417) * 0.5);   // which way it curves, and how much
  const u = along(lane, 1, 0), w = along(lane + 90, 1, 0);
  // A point s along the trail and d to its side.
  const at = (s, d) => { const c = d + bow * s * s; return [cx + u.x * s + w.x * c, cy + u.y * s + w.y * c]; };
  const stops = n === 3 ? [-0.11, 0, 0.11] : [-0.15, -0.05, 0.05, 0.15];
  const first = hash01(t, 416) < 0.5 ? 1 : -1;
  const out = [];
  stops.forEach((s0, k) => {
    const side = k % 2 === 0 ? first : -first;
    const s = s0 + (hash01(t, 421 + k) - 0.5) * 0.016;
    const [x, y] = at(s, side * (0.068 + hash01(t, 427 + k) * 0.016));
    const face = lane + (side > 0 ? -90 : 90) + (hash01(t, 439 + k) - 0.5) * 24;
    out.push([CABIN, x, y, 0.29 + hash01(t, 433 + k) * 0.05, Math.floor((face + 720) % 360)]);
    // The gap in the other row at this stop holds a tree.
    if (trees && trees.length) {
      const [tx, ty] = at(s0 + (hash01(t, 451 + k) - 0.5) * 0.016, -side * (0.072 + hash01(t, 455 + k) * 0.02));
      out.push([trees[Math.floor(hash01(t, 459 + k) * trees.length)], tx, ty, 0.8 + hash01(t, 463 + k) * 0.3, Math.floor(hash01(t, 467 + k) * 360)]);
    }
  });
  for (const s0 of [-0.075, 0.075]) { const [x, y] = at(s0, 0); out.push([TRAIL, x, y, 0.9, Math.floor((lane + bow * s0 * 115 + 720) % 360)]); }
  return out;
}
// IMP_Campfire was tried at the station and dropped: its light draws as a tall pale column at map zoom.
/**
 * A campsite, now and then on a park's open land: two or three of the woodcutter's purple ridge tents
 * (PROP_Tent_GEN_Sleeper_Standard_C, the one beside its fire), somewhat smaller, tinted in the park owner's colours as
 * the woodcutter's are, around a small fire pit that burns. A dressing entry's sixth field "owner" asks for that tint
 * (dressTile). Auditioned 2026-10-03 beside the game's own woodcutter (crash soak npcamp5); PROP_BonFire and
 * PROP_KettleFire are not models, and Camp_Tent_Single, _Light and _Heavy give no handle. At the woodcutter's size the
 * tents were drawn but went unseen at play zoom among the tile's shrubs (crash soak ncamp1, 2026-10-04), so they are
 * drawn larger, further from the fire, and the campsite's tile is a clearing with no grass tufts or undergrowth.
 */
const CAMP_TENT = "PROP_Tent_GEN_Sleeper_Standard_C";
const CAMP_FIRE = "PROP_Fire_Pit";
const CAMP_SHARE = 0.08;          // open flat National Park tiles with a campsite
/** The campsite's pieces around (cx, cy) on tile t: [[asset, dx, dy, scale, angle, tint?]]. Pure. */
export function campsite(t, cx, cy) {
  const out = [[CAMP_FIRE, cx, cy, 0.7, Math.floor(hash01(t, 401) * 360)]];
  const n = hash01(t, 402) < 0.5 ? 2 : 3;
  const a0 = hash01(t, 403) * 360;
  for (let k = 0; k < n; k++) {
    // Around the fire, each tent turned to face it, give or take.
    const a = a0 + k * (360 / n) + (hash01(t, 404 + k) - 0.5) * 30;
    const p = along(a, 0.13 + hash01(t, 405 + k) * 0.02, 0);
    out.push([CAMP_TENT, cx + p.x, cy + p.y, 1.1 + hash01(t, 409 + k) * 0.15,
      Math.floor((a + 90 + (hash01(t, 412 + k) - 0.5) * 30 + 360) % 360), "owner"]);
  }
  return out;
}
/**
 * Monuments dispersed over a park as it grows, like markers and memorials around a real park:
 * Map(tile -> [[asset, dx, dy, scale, angle]]). Each eligible tile (`open(t)`: open land, not the founding tile, not
 * taken by a camp, village, shelter or tower) has a fixed kind by hash, a stone cairn or the second kind (an obelisk in
 * a National Park, a dolmen of standing stones in a Wilderness Area), and tiles are taken in a fixed order by hash:
 * cairns from 8 tiles, the second kind from 16, more of both at 24. A higher level keeps a lower one's, and stepping
 * down takes them away. Never on two neighbouring tiles. Pure.
 * Auditioned 2026-10-04 at scale 1 beside the game's other monuments (crash soak naud1): these read at play zoom; the
 * city monuments looked urban, and the statues, flagpole and cairn gates were too small to see. A group at the founding
 * tile came first (cairn, obelisk, then a column or lion-capital pillar between two obelisks); spread over the park
 * they read better, and no central piece fit (naud2-statues, naud3-columns).
 */
const CAIRN_MOUND = "PROP_CairnBase", OBELISK = "NAF_EGY_CityHall_Obelisk", DOLMEN = "ANT_EEU_Monument_Rock_Structure";
export function monumentCounts(n, level) {
  const extra = level >= 3 ? Math.ceil(n / 12) : 0;
  return { cairn: level >= 1 ? Math.ceil(n / 6) + extra : 0, second: level >= 2 ? Math.ceil(n / 8) + extra : 0 };
}
export function monumentSites(tiles, anchor, level, buildings, open, ring = ringOf) {
  const out = new Map();
  if (!level) return out;
  // Spaced once for the most a park this size could carry (the 24-tile counts), then each level takes the first of
  // each kind in that order, so a higher level only ever adds.
  const most = monumentCounts(tiles.length, 3), want = monumentCounts(tiles.length, level);
  const order = tiles.filter((t) => t !== anchor && open(t)).sort((a, b) => hash01(a, 81) - hash01(b, 81));
  const placed = new Set(), lists = { cairn: [], second: [] };
  for (const t of order) {
    const kind = hash01(t, 82) < 0.55 ? "cairn" : "second";
    if (lists[kind].length >= most[kind] || ring(t).some((n) => placed.has(n))) continue;
    placed.add(t); lists[kind].push(t);
  }
  for (const kind of ["cairn", "second"]) for (const t of lists[kind].slice(0, want[kind])) {
    const asset = kind === "cairn" ? CAIRN_MOUND : buildings ? OBELISK : DOLMEN;
    const p = along(hash01(t, 83) * 360, 0.06 + hash01(t, 84) * 0.14, 0);
    out.set(t, [[asset, p.x, p.y, kind === "cairn" ? 0.85 + hash01(t, 85) * 0.2 : 0.95, Math.floor(hash01(t, 86) * 360)]]);
  }
  return out;
}
/** Drops what would stand inside the monument: dressing within `r` of (cx, cy), but never the tile's own feature model. */
function clearOf(list, cx, cy, r) { return list.filter(([a, x, y]) => /^FEATURE_/.test(a) || Math.hypot(x - cx, y - cy) > r); }

const LOOKOUT = "Camp_Lookout_Tower_Bin";
const CAIRN = "PROP_CairnRock_Stack";
const HAWK = "VFX_Bird_Hawk_C3";
const TRAIL = "ANT_Decal_Path_A_Dirt_CurvedSM";
const ACCENT = "BIN_FOL_Urban_Tree_Hero_A";   // a flowering tree; one in a while, never in the desert or tundra
const LILIES = [["FOL_LilyPad_Triple_Flower", 1.6], ["FOL_LilyPad_Double_Flower", 2]];
const CATTAIL = "FOL_Cattail_A";
const ROWBOAT = "PAC_HWI_Palace_RowBoat";

/** Per biome: tree bins, an understory bin (or null), and an accent. The animals are in np-wildlife.js. */
const KITS = {
  BIOME_GRASSLAND: { trees: ["BIN_FOL_Grassland_Trees_SM", "BIN_FOL_Grassland_Trees_LG", "FOL_Birch_Tall_Grove_A"], under: "BIN_FOL_Grassland_Shrubs", accent: ACCENT },
  BIOME_PLAINS: { trees: ["BIN_FOL_Plains_Trees_SM", "BIN_FOL_Elm_Tree_C"], under: null, accent: ACCENT },
  BIOME_DESERT: { trees: ["BIN_FOL_Desert_Trees_SM"], under: "BIN_FOL_Desert_Shrubs", accent: null, rocks: "BIN_FOL_Desert_Sm_Rocks" },
  BIOME_TUNDRA: { trees: ["BIN_FOL_Tundra_Trees_SM", "BIN_FOL_Tundra_Trees_LG", "FOL_Birch_Tall_Grove_A"], under: "BIN_FOL_Tundra_Shrubs", accent: null },
  BIOME_TROPICAL: { trees: ["BIN_FOL_Tropical_Trees_SM", "BIN_FOL_Tropical_Trees_MD"], under: "BIN_FOL_Tropical_Shrubs", accent: ACCENT },
};
const DEFAULT_KIT = KITS.BIOME_GRASSLAND;

/** A single dashed line: the green alone matched several civs' own border colors (23 of 83 color sets carry a
 *  green), so the park is set apart by the line's style, not its color (chosen 2026-09-29). */
const BORDER_STYLE = {
  style: "CultureBorder_CityState_Open",
  primaryColor: { x: 0.35, y: 0.75, z: 0.3, w: 1 },
  secondaryColor: { x: 0.1, y: 0.3, z: 0.1, w: 1 },
};

/** A Wilderness Area's border: the same dashed line in ocher, so the two kinds read apart. The overlay pales every
 *  color, and a sand tone came out near white on tundra and plains (2026-09-30). */
const WILD_BORDER_STYLE = {
  style: "CultureBorder_CityState_Open",
  primaryColor: { x: 0.8, y: 0.42, z: 0.08, w: 1 },
  secondaryColor: { x: 0.35, y: 0.16, z: 0.02, w: 1 },
};

/** Screen angle of ring direction i (Canals: the arm points east at 0 and turns counter-clockwise). */
export function armAngle(i) { return (360 - 60 * i) % 360; }
function along(deg, x, y) {
  const a = deg * Math.PI / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a), z: 0 };
}
/** Screen direction (degrees) from plot `from` toward plot `to`, near enough for a trail to lean that way. */
function bearing(from, to) {
  const a = locOf(from), b = locOf(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx === 0 && dy === 0 ? 0 : (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

// --- pure layout: what to draw for a park (testable without the engine) -------------------------------

/**
 * Walled edges of a park: [{ plot, dir, inner, foot }]. A wall needs passable land on both sides. Roughly WALL_SHARE
 * of the outer edges get walling, and `innerShare` (INNER_WALL_SHARE) of the edges between two of the park's own
 * tiles, each such edge counted once, from its lower plot. Where the border meets a mountain, the same share of edges
 * get a stone wall at the mountain's foot instead (`foot`, mountainWallPieces): when the mountain lies outside, and
 * when the park holds the mountain and passable land lies outside. All chosen per edge, so the pattern is stable.
 */
export function wallEdges(tiles, ringFn = ringOf, impassable = isImpassableEdgeTile, share = WALL_SHARE,
  innerShare = INNER_WALL_SHARE, mountain = (i) => safe(() => isMountain(i) && !isWonder(i), false)) {
  const inPark = new Set(tiles);
  const footShare = (d) => share * (isEastWest(d) ? MOUNTAIN_EW_SHARE : 1);
  const out = [];
  for (const t of tiles) {
    const blocked = impassable(t);
    if (blocked && !mountain(t)) continue;
    ringFn(t).forEach((n, dir) => {
      if (blocked) {
        // A mountain of the park: a wall at its foot where passable land lies outside.
        if (n >= 0 && !inPark.has(n) && !impassable(n) && hash01(t, 231 + dir) < footShare(dir))
          out.push({ plot: t, dir, inner: false, foot: true });
        return;
      }
      if (impassable(n)) {
        if (n >= 0 && !inPark.has(n) && mountain(n) && hash01(t, 231 + dir) < footShare(dir))
          out.push({ plot: t, dir, inner: false, foot: true });
        return;
      }
      if (!inPark.has(n)) { if (hash01(t, 31 + dir) < share) out.push({ plot: t, dir, inner: false, foot: false }); return; }
      if (t < n && hash01(t, 131 + dir) < innerShare) out.push({ plot: t, dir, inner: true, foot: false });
    });
  }
  return out;
}

/** Water edges of a park that meet open water outside it: [{ plot, dir }], thinned to BUOY_SHARE. */
export function buoyEdges(tiles, ringFn = ringOf, water = isWater, share = BUOY_SHARE) {
  const inPark = new Set(tiles);
  const out = [];
  for (const t of tiles) {
    if (!water(t)) continue;
    ringFn(t).forEach((n, dir) => {
      if (n < 0 || inPark.has(n) || !water(n)) return;
      if (hash01(t, 41 + dir) < share) out.push({ plot: t, dir });
    });
  }
  return out;
}

/**
 * Wall kits by biome. Each walled edge is composed from these, walking along the edge: stone runs of varying length
 * laid either way round (the mesh's two faces differ), boulders set into the line, shrubs growing through a gap,
 * and now and then a gap with a fallen stone. Weights are relative. Only pieces watched rendering are used;
 * CANDIDATE_PIECES lists meshes waiting for an in-game look before they join a kit.
 */
const WALL_KITS = {
  BIOME_GRASSLAND: { run: 2, rubble: 6, boulder: 1, shrub: 3, gap: 2, rock: "Plains", shrubAsset: "BIN_FOL_Grassland_Shrubs" },
  BIOME_PLAINS: { run: 2, rubble: 7, boulder: 1, shrub: 1, gap: 2, rock: "Plains", shrubAsset: "BIN_FOL_Grassland_Shrubs" },
  BIOME_DESERT: { run: 1, rubble: 7, boulder: 2, shrub: 1, gap: 3, rock: "Desert", shrubAsset: "BIN_FOL_Desert_Shrubs" },
  BIOME_TUNDRA: { run: 3, rubble: 5, boulder: 2, shrub: 1, gap: 2, rock: "Plains", shrubAsset: "BIN_FOL_Tundra_Shrubs" },
  BIOME_TROPICAL: { run: 2, rubble: 5, boulder: 1, shrub: 4, gap: 2, rock: "Plains", shrubAsset: "BIN_FOL_Tropical_Shrubs" },
};
const DEFAULT_WALL_KIT = WALL_KITS.BIOME_GRASSLAND;
/** Rubble: a short run of loose rocks laid along the edge. Only the plains (gray) and desert (red-brown) rock sets
 *  draw in their own color when placed by script; the grassland, tundra, tropical and generic sets draw navy blue
 *  (watched 2026-09-29), so every other biome uses the gray plains stone, which matches the map's own rocks. */
const RUBBLE_SHAPES = "ABCDE";
/** Auditioned and rejected (2026-09-29): PAC_HWI_CityHall_Fence_A/B are carved posts, not a stone wall. */
export const CANDIDATE_PIECES = [];

/** Length of edge (in offset units) each kind of piece takes up at scale 1. */
const SPAN = { run: 0.15, rubble: 0.17, boulder: 0.06, shrub: 0.08, gap: 0.05, fence: 0.24 };

function pickKind(kit, u) {
  const kinds = ["run", "rubble", "boulder", "shrub", "gap", "fence"];
  const total = kinds.reduce((s, k) => s + (kit[k] || 0), 0);
  let x = u * total;
  for (const k of kinds) { x -= kit[k] || 0; if (x < 0) return k; }
  return "run";
}

/**
 * The wall where a park's border meets a mountain: grey dry-stone runs (WALL) laid end to end along the edge, each
 * turned a little, standing on the flat just outside the mountain's tile edge, where the mountain's rock meets the land.
 * `r` is measured from `plot`'s center: 0.52 from a park mountain's center (just past its edge), 0.40 from a park tile
 * facing a mountain outside (the same line, seen from the flat side). Pure and hashed from the plot and direction.
 *
 * Auditioned 2026-10-04 (crash soaks nscreev, nscreew): rubble and the biome's wall kit vanished against the rock (a
 * desert edge is mostly red rubble), pieces at the tile edge sank into the mountain model, which spreads past its hex,
 * and the engine offers no placement that follows the model's surface (PlacementMode DEFAULT, FIXED, TERRAIN, WATER;
 * no surface pick). A run of grey sections just outside the edge read clearly from the back and the front of a
 * mountain; sections lifted onto the slope by the ground's rise broke into staggered, doubled runs.
 */
export const MOUNTAIN_WALL_R = { mountain: 0.52, land: 0.4 };
/**
 * How far a mountain wall runs each way from its edge's middle. A hex edge is about 0.53 long. The east and west edges
 * run up and down the screen, where the tilted camera sees a wall end-on and its far end climbs past the mountain onto
 * the next tile (watched 2026-10-04, crash soak nmtw3-ew). Those get a wall less often (MOUNTAIN_EW_SHARE, in
 * wallEdges), and when they do, half are the middle half of the edge and half a stub of two or three sections, chosen
 * per edge by hash; the other edges stop short of the corners. An end beside another mountain (`ends`: [before,
 * after] edge neighbours are mountains) is pulled in further, clear of that mountain's rock.
 */
export const MOUNTAIN_EW_SHARE = 0.45;
export function isEastWest(dir) { return dir === 0 || dir === 3; }
export function mountainWallSpan(dir, ends = [false, false], plot = 0) {
  const half = !isEastWest(dir) ? 0.2 : hash01(plot, 970 + dir) < 0.5 ? 0.06 : 0.13;
  const pull = half < 0.1 ? 0 : 0.07;
  return [ends[0] ? -half + pull : -half, ends[1] ? half - pull : half];
}
export function mountainWallPieces(plot, dir, r = MOUNTAIN_WALL_R.mountain, ends = [false, false]) {
  const d = armAngle(dir), a = d * Math.PI / 180;
  const at = (t, depth) => ({ dx: depth * Math.cos(a) - t * Math.sin(a), dy: depth * Math.sin(a) + t * Math.cos(a) });
  const [from, to] = mountainWallSpan(dir, ends, plot);
  const out = [];
  let k = 0;
  // Sections spread evenly from one end to the other, about 0.085 apart.
  const n = Math.max(1, Math.round((to - from) / 0.085));
  for (let j = 0; j <= n; j++, k++) {
    const t = from + (to - from) * j / n;
    const h = (salt) => hash01(plot, 960 + dir * 32 + k * 4 + salt);
    out.push({ asset: WALL, ...at(t, r + (h(0) - 0.5) * 0.012), z: 0, scale: 0.95 + h(1) * 0.15,
      angle: Math.floor((d + 90 + (h(2) < 0.5 ? 0 : 180) + (h(3) - 0.5) * 8 + 360) % 360) });
  }
  return out;
}

/**
 * The pieces along one walled edge: [{ asset, dx, dy, z, scale, angle }] in the tile's offsets. `r` is the edge's
 * distance from the tile center and `half` half its usable length, in Canals' offset units. Pure and hashed from
 * the plot and direction, so an edge looks the same after a reload.
 */
export function wallPieces(plot, dir, biome = "BIOME_GRASSLAND", r = 0.46, half = 0.24, ground = "open") {
  const base = WALL_KITS[biome] || DEFAULT_WALL_KIT;
  // On open ground (fields, forest) an edge is mostly wood fence with stone here and there, or stone with a short fence
  // now and then; on rough ground (hills, mountains, wonders) it is dry stone only.
  const rough = ground === "rough";
  const fenced = !rough && hash01(plot, 140 + dir) < FENCED_EDGE_SHARE;
  const kit = { ...base, fence: rough ? 0 : 1 };
  let salt = 0;
  const h = () => hash01(plot, 60 + dir * 64 + salt++);
  const d = armAngle(dir);
  const a = d * Math.PI / 180;
  const at = (t, depth) => ({ dx: depth * Math.cos(a) - t * Math.sin(a), dy: depth * Math.sin(a) + t * Math.cos(a) });
  const out = [];
  // Lay wood sections end to end from t until `to`; returns where the last one ended. One gate at most per edge.
  let gated = !fenced || h() >= GATE_SHARE;
  const gateAt = -half + 0.08 + h() * (2 * half - 0.16);
  const wood = (t, to) => {
    while (t < to - 0.03) {
      let piece;
      if (!gated && t >= gateAt) { piece = WOOD_GATES[h() < 0.7 ? 0 : 1]; gated = true; }
      else {
        let x = h() * WOOD_SECTIONS.reduce((n, w) => n + w[3], 0);
        piece = WOOD_SECTIONS.find((w) => (x -= w[3]) < 0) || WOOD_SECTIONS[0];
      }
      const [asset, len, turn] = piece;
      const sc = 0.95 + h() * 0.1;
      // Sections overlap a little at the posts, so a run reads as one fence (nsh1 showed gaps at the full length).
      const span = len * sc * 0.92;
      out.push({ asset, ...at(Math.min(t + span / 2, to), r + (h() - 0.5) * 0.01), z: 0, scale: sc,
        angle: (d + turn + (h() < 0.5 ? 0 : 180) + (h() - 0.5) * 4 + 360) % 360 });
      t += span;
      // Now and then a post leans out of line or a shrub grows at the foot of the fence.
      if (h() < 0.12) out.push({ asset: kit.shrubAsset, ...at(Math.min(t, to), r - 0.025), z: 0, scale: 0.6 + h() * 0.3, angle: Math.floor(h() * 360) });
    }
    return t;
  };
  if (fenced) {
    // A fenced edge: split rail end to end, broken once in a while by a bush grown into the line. A stone there drew
    // tan against tropical grass beside the map's own gray rocks (showcase nsh4-s4242).
    let t = -half + h() * 0.02;
    while (t < half - 0.03) {
      const to = Math.min(half, t + 0.14 + h() * 0.3);
      t = wood(t, to);
      if (t < half - 0.05 && h() < 0.3) {
        out.push({ asset: kit.shrubAsset, ...at(t + 0.03, r + (h() - 0.5) * 0.02), z: 0, scale: 0.8 + h() * 0.4, angle: Math.floor(h() * 360) });
        t += 0.06;
      }
    }
    return out;
  }
  let t = -half + h() * 0.04;
  let last = "";
  for (let guard = 0; t < half && guard < 12; guard++) {
    let kind = pickKind(kit, h());
    if (kind === last && kind !== "run") kind = "run";          // no two boulders or gaps in a row
    if (guard === 0 && kind !== "rubble" && !(fenced && kind === "fence")) kind = "run";   // stone first, or a fence
    const scale = kind === "run" ? 0.7 + h() * 0.5 : kind === "boulder" ? 0.22 + h() * 0.14 : kind === "shrub" ? 0.8 + h() * 0.4
      : kind === "fence" ? 1 + h() * 0.5 : 1;
    const span = SPAN[kind] * (kind === "run" || kind === "fence" ? scale : kind === "rubble" ? 0.8 + h() * 0.4 : 1);
    const mid = Math.min(t + span / 2, half);
    const depth = r + (h() - 0.5) * 0.05;
    if (kind === "rubble") {
      // Three to five loose rocks, each a different shape and size, jostled out of line.
      const n = 3 + Math.floor(h() * 3);
      for (let k = 0; k < n; k++) {
        const tt = Math.min(t + (k + 0.5) * span / n + (h() - 0.5) * 0.02, half);
        out.push({ asset: kit.rock + "_Rough_Rock_Rounded_" + RUBBLE_SHAPES[Math.floor(h() * 5)], ...at(tt, depth + (h() - 0.5) * 0.03),
          z: 0, scale: 0.24 + h() * 0.14, angle: Math.floor(h() * 360) });
      }
    } else if (kind === "run") {
      const flip = h() < 0.5 ? 90 : 270;
      out.push({ asset: WALL, ...at(mid, depth), z: 0, scale, angle: (d + flip + (h() - 0.5) * 20 + 360) % 360 });
    } else if (kind === "fence") {
      // A short stretch of split rail between the stone.
      t = wood(t, Math.min(half, t + span));
      last = kind;
      continue;
    } else if (kind === "boulder") {
      // A big stone of the local rock set into the line (the BIN_Boulder meshes drew near-black against it).
      out.push({ asset: kit.rock + "_Rough_Rock_Rounded_" + RUBBLE_SHAPES[Math.floor(h() * 5)], ...at(mid, depth), z: 0,
        scale: 0.42 + h() * 0.14, angle: Math.floor(h() * 360) });
    } else if (kind === "shrub") {
      out.push({ asset: kit.shrubAsset, ...at(mid, depth - 0.02), z: 0, scale, angle: Math.floor(h() * 360) });
    } else if (h() < 0.5) {
      // A gap, with a stone fallen out of the wall toward the park side.
      out.push({ asset: kit.rock + "_Rough_Rock_Rounded_" + RUBBLE_SHAPES[Math.floor(h() * 5)], ...at(mid, depth - 0.04 - h() * 0.03),
        z: 0, scale: 0.26 + h() * 0.1, angle: Math.floor(h() * 360) });
    }
    t += span + (kind === "run" ? h() * 0.025 : 0);
    last = kind;
  }
  return out;
}

/** The hill tile that carries the park's lookout tower, or -1 (a park needs three tiles to earn one). */
export function lookoutTile(tiles, anchor, terrain = terrainOf, wonder = isWonder) {
  if (tiles.length < 3) return -1;
  const hills = tiles.filter((t) => t !== anchor && terrain(t) === "TERRAIN_HILL" && !wonder(t));
  return hills.length ? Math.min(...hills) : -1;
}

/**
 * Every lookout tower of a park at a size level: the first (lookoutTile), and one more per level on other hills,
 * never beside another tower. Taken in a fixed order by hash, so a higher level keeps a lower one's towers.
 */
export function lookoutTiles(tiles, anchor, level = 0, ring = ringOf, terrain = terrainOf, wonder = isWonder) {
  const first = lookoutTile(tiles, anchor, terrain, wonder);
  if (first < 0) return [];
  const out = [first];
  const hills = tiles.filter((t) => t !== anchor && t !== first && terrain(t) === "TERRAIN_HILL" && !wonder(t))
    .sort((a, b) => hash01(a, 77) - hash01(b, 77));
  for (const t of hills) {
    if (out.length > level) break;
    if (out.some((o) => ring(o).includes(t))) continue;
    out.push(t);
  }
  return out;
}

/** What a level site carries, in turn: a National Park's, a Wilderness Area's. */
const SITE_KINDS = { park: ["camp", "village", "shelter"], wild: ["thicket"] };
/** Level sites per level for a park of n tiles: one per level up to 12 tiles, two from 13. */
export function sitesPerLevel(n) { return Math.max(1, Math.ceil(n / 12)); }
/**
 * A park's level sites: Map(tile -> "camp" | "village" | "shelter" | "thicket"), sitesPerLevel(tiles) of them per
 * level on the tiles `open(t)` allows, taken in a fixed order by hash (so a higher level keeps a lower one's) and never
 * on two neighboring tiles. `taken(t)` excludes tiles the base drawing already gives a camp, village or tower. Pure.
 */
export function levelSites(tiles, anchor, level, buildings, open, taken = () => false, ring = ringOf) {
  const out = new Map();
  if (!level) return out;
  const want = level * sitesPerLevel(tiles.length);
  const kinds = buildings ? SITE_KINDS.park : SITE_KINDS.wild;
  const order = tiles.filter((t) => t !== anchor && open(t) && !taken(t)).sort((a, b) => hash01(a, 79) - hash01(b, 79));
  for (const t of order) {
    if (out.size >= want) break;
    if (ring(t).some((n) => out.has(n))) continue;
    out.set(t, kinds[out.size % kinds.length]);
  }
  return out;
}

/** The tile the hawk circles once a park has three tiles: the first mountain, else the lookout, else the
 *  founding tile. -1 for a smaller park. */
export function hawkTile(tiles, anchor, lookout, mountain = isMountain) {
  if (tiles.length < 3) return -1;
  const m = tiles.filter(mountain);
  if (m.length) return Math.min(...m);
  return lookout >= 0 ? lookout : anchor;
}

/**
 * Trees for an open tile, in one of four shapes the plan spreads so neighbors differ: 0 a loose ring round a
 * center tree, 1 a clump to one side of a clearing, 2 two or three trees spread wide over a meadow, 3 a tight grove.
 * Most trees are the tile's `grove` kind, the rest mixed in; an accent now and then.
 */
function treeStand(t, kit, count, shape = 0, grove = 0) {
  const out = [];
  const pick = (salt) => kit.trees[hash01(t, salt) < 0.7 ? grove % kit.trees.length : Math.floor(hash01(t, salt + 90) * kit.trees.length)];
  const jit = (salt, r) => (hash01(t, salt) - 0.5) * r;
  const spin = Math.floor(hash01(t, 1) * 6);
  const side = hash01(t, 5) * 360;
  const n = shape === 2 ? Math.max(2, count - 2) : shape === 3 ? count + 1 : count;
  for (let k = 0; k < n; k++) {
    let p;
    if (shape === 1) p = along(side + jit(2 + k, 70), 0.14 + hash01(t, 8 + k) * 0.12, 0);
    else if (shape === 2) p = along(((spin + k * 2) % 6) * 60 + jit(2 + k, 50), 0.22 + hash01(t, 8 + k) * 0.12, 0);
    else if (shape === 3) p = along(((spin + k) % 6) * 60 + jit(2 + k, 40), 0.08 + hash01(t, 8 + k) * 0.1, 0);
    else p = along(((spin + k) % 6) * 60 + jit(2 + k, 40), 0.16 + hash01(t, 8 + k) * 0.14, 0);
    out.push([pick(10 + k), p.x, p.y, 1.1 + hash01(t, 13 + k) * 0.8, Math.floor(hash01(t, 14 + k) * 360)]);
  }
  if (shape === 0) out.push([pick(19), jit(20, 0.1), jit(21, 0.1), 1.3 + hash01(t, 22) * 0.5, Math.floor(hash01(t, 23) * 360)]);
  if (kit.accent && hash01(t, 24) < 0.3) out.push([kit.accent, jit(25, 0.3), jit(26, 0.3), 1 + hash01(t, 27) * 0.4, Math.floor(hash01(t, 28) * 360)]);
  return spaced(oneGrove(out, kit));
}

/**
 * Tree kinds that are already a whole grove of trees in one model. Placed like single trees, three to six to a stand
 * and all over a forest lattice, the yellow birch groves piled into each other in loud masses (watched 2026-10-04,
 * cap57-exp). A tile takes one at most (oneGrove), at a modest size, and the lattice and cabin rows take none (singles).
 */
const GROVES = new Set(["FOL_Birch_Tall_Grove_A"]);
export function singles(trees) { const s = trees.filter((a) => !GROVES.has(a)); return s.length ? s : trees; }
export function oneGrove(list, kit) {
  const single = singles(kit.trees)[0];
  let seen = false;
  return list.map((e) => {
    if (!GROVES.has(e[0])) return e;
    if (seen) return [single, e[1], e[2], e[3], e[4]];
    seen = true;
    return [e[0], e[1], e[2], Math.min(e[3], 1.2), e[4]];
  });
}
/** Drops a tree that would stand in another's crown: within 0.09 of an earlier one, 0.15 where either is a grove. Pure. */
export function spaced(list) {
  const kept = [];
  for (const e of list) {
    const need = (o) => (GROVES.has(e[0]) || GROVES.has(o[0]) ? 0.15 : 0.09);
    if (kept.every((o) => Math.hypot(e[1] - o[1], e[2] - o[2]) >= need(o))) kept.push(e);
  }
  return kept;
}

/** A loose rock of the local stone (the plains and desert sets draw in their own color; see WALL_KITS). */
function localRock(t, salt, biome) {
  const set = biome === "BIOME_DESERT" ? "Desert" : "Plains";
  return set + "_Rough_Rock_Rounded_" + RUBBLE_SHAPES[Math.floor(hash01(t, salt) * 5)];
}

/** The ring index of a land neighbor of a water tile, or -1. */
function shoreOf(t) { return ringOf(t).findIndex((n) => n >= 0 && !isWater(n) && !isNavRiver(n)); }

function waterDressing(t, slot) {
  const jit = (salt, r) => (hash01(t, salt) - 0.5) * r;
  const out = [];
  if (slot.lilies != null && isLake(t)) {
    // One kind of pad per tile, one to three rafts of it, placed and turned differently each time.
    const [asset, scale] = LILIES[(slot.lilies + Math.floor(hash01(t, 3) * 2)) % LILIES.length];
    const n = 1 + slot.lilies;
    for (let k = 0; k < n; k++) out.push([asset, jit(4 + k, 0.4), jit(14 + k, 0.4), scale * (0.7 + hash01(t, 24 + k) * 0.5), Math.floor(hash01(t, 6 + k) * 360)]);
  }
  const shore = shoreOf(t);
  if (slot.reeds != null && shore >= 0) {
    // One to three clumps along the shore, of different heights, leaning differently. A river's water runs narrower
    // than its hex, so on a river they keep close to the middle; at a lake's distance they stood on the far bank's
    // grass (showcase nsh-s4242).
    const n = 1 + slot.reeds;
    const [r0, dr] = isNavRiver(t) ? [0.08, 0.05] : [0.24, 0.08];
    for (let k = 0; k < n; k++) {
      const p = along(armAngle(shore) + jit(30 + k, 70), r0 + hash01(t, 33 + k) * dr, 0);
      out.push([CATTAIL, p.x, p.y, 1.1 + hash01(t, 36 + k) * 0.8, Math.floor(hash01(t, 39 + k) * 360)]);
    }
  }
  if (slot.boat != null) out.push([ROWBOAT, jit(8, 0.25), jit(9, 0.25), 1.2 + hash01(t, 11) * 0.4, Math.floor(hash01(t, 10) * 360)]);
  return out;
}

/**
 * Features the game draws from a model named after the feature itself, which the park can place back on its tile: the
 * game hides a plot's own vegetation under any district, park land included. Watched 2026-10-02 (crash soak npa1,
 * same-camera captures): marsh, rainforest and mangrove came back as the game draws them; forest and taiga only in part
 * (the game scatters more trees around them), so those also get the park's woods (forestCover); savanna woodland's model
 * drew nothing visible. Found by name in the game's asset archive (StandardAsset*.blp).
 */
export const FEATURE_MODELS = new Set(["FEATURE_FOREST", "FEATURE_RAINFOREST", "FEATURE_SAGEBRUSH_STEPPE",
  "FEATURE_SAVANNA_WOODLAND", "FEATURE_TAIGA", "FEATURE_MANGROVE", "FEATURE_MARSH", "FEATURE_OASIS", "FEATURE_TUNDRA_BOG",
  "FEATURE_WATERING_HOLE"]);
/** Features whose model alone is the whole look; the rest that are wooded get the park's woods as well. */
const MODEL_ALONE = new Set(["FEATURE_MARSH", "FEATURE_TUNDRA_BOG", "FEATURE_RAINFOREST", "FEATURE_MANGROVE",
  "FEATURE_OASIS", "FEATURE_WATERING_HOLE"]);
export function featureModel(t) { const f = featureOf(t); return f && FEATURE_MODELS.has(f) ? f : ""; }

/**
 * The game's own woods scatter by biome, drawn with the feature model on a wooded park tile where the model alone is
 * sparse. Matched 2026-10-02 against untouched tiles of the same feature, same camera (crash soak npt1): grassland
 * forest with the grassland tree sets, snowy taiga with the tundra cluster. Biomes not yet matched keep the park's
 * own woods (forestCover).
 */
export const GAME_SCATTER = { BIOME_GRASSLAND: ["BIN_FOL_Grassland_Trees_LG"], BIOME_TUNDRA: ["BIN_FOL_Tundra_Cluster_A_Large"] };
/** By feature where the biome's set does not fit (npt2): savanna woodland's broad-leaf trees match the desert small
 *  trees, more of them; sagebrush steppe, whose model draws nothing, desert shrubs with a few small trees. */
export const FEATURE_SCATTER = {
  FEATURE_SAVANNA_WOODLAND: { bins: ["BIN_FOL_Desert_Trees_SM"], spots: 8 },
  FEATURE_SAGEBRUSH_STEPPE: { bins: ["BIN_FOL_Desert_Shrubs", "BIN_FOL_Desert_Trees_SM"], spots: 5 },
};
const SCATTER_SPOTS = [[0, 0], [0.2, 0.1], [-0.2, 0.1], [0.05, -0.22], [-0.1, -0.2], [0.24, -0.1], [-0.25, -0.05], [0.02, 0.25]];
export function gameScatter(t, biome, feature = "") {
  const byFeature = FEATURE_SCATTER[feature];
  const bins = byFeature ? byFeature.bins : GAME_SCATTER[biome];
  if (!bins) return null;
  const n = byFeature ? byFeature.spots : 5;
  const out = [];
  SCATTER_SPOTS.slice(0, n).forEach(([x, y], k) => bins.forEach((b, j) =>
    out.push([b, x + j * 0.04, y - j * 0.03, 1, Math.floor(hash01(t, 220 + k * 3 + j) * 360)])));
  return out;
}

/** Whether the map has wetland on a plot (marsh, bog, oasis, watering hole); mangrove counts as woods. */
export function isWet(t) {
  const f = featureOf(t);
  if (!f || f === "FEATURE_MANGROVE") return false;
  return safe(() => GameInfo.Features.lookup(f).FeatureClassType === "FEATURE_CLASS_WET", false);
}

/**
 * Wetland over a whole tile: clumps of reeds across the hex. Like woods, the game draws no marsh on a plot that holds
 * a district (watched 2026-10-02, crash soak npg1: marsh under a rural or a wilderness district drew as plain grass).
 */
export function wetCover(t) {
  const out = [];
  const spots = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((k) => along(armAngle(k) + 30, 0.27, 0)).map((p) => [p.x, p.y]),
    ...[0, 1, 2, 3, 4, 5].map((k) => along(armAngle(k), 0.16, 0)).map((p) => [p.x, p.y])];
  spots.forEach(([x, y], k) => {
    if (hash01(t, 120 + k) < 0.25) return;
    out.push([CATTAIL, x + (hash01(t, 140 + k) - 0.5) * 0.08, y + (hash01(t, 160 + k) - 0.5) * 0.08,
      0.9 + hash01(t, 180 + k) * 0.8, Math.floor(hash01(t, 200 + k) * 360)]);
  });
  return out;
}

/** Whether the map has woods on a plot: a vegetated feature (forest, rainforest, taiga, woodland) or mangrove. */
export function isWooded(t) {
  const f = featureOf(t);
  if (!f) return false;
  if (f === "FEATURE_MANGROVE") return true;
  return safe(() => GameInfo.Features.lookup(f).FeatureClassType === "FEATURE_CLASS_VEGETATED", false);
}

/**
 * Woods over a whole tile: trees on a jittered lattice out to the hex's edge, so a wooded park tile reads as forest
 * that runs on into its neighbors. The game draws no vegetation on a plot that holds a district (watched 2026-10-01:
 * a rainforest park tile drew as bare grass under its wilderness district with nothing on it, and as rainforest with
 * the district removed, same camera), and park land needs its district, so the woods are drawn here instead.
 */
export function forestCover(t, kit, spacing = FOREST_SPACING) {
  const out = [];
  const rows = Math.ceil(FOREST_REACH / (spacing * 0.866));
  let k = 0;
  for (let r = -rows; r <= rows; r++) {
    const y = r * spacing * 0.866;
    const shift = (r & 1) ? spacing / 2 : 0;
    for (let x = -FOREST_REACH - shift; x <= FOREST_REACH; x += spacing) {
      k++;
      const px = x + shift + jit0(t, 200 + k, spacing * 0.6), py = y + jit0(t, 400 + k, spacing * 0.6);
      if (!inHex(px, py, FOREST_REACH)) continue;
      const kinds = singles(kit.trees);
      const pick = kinds[Math.floor(hash01(t, 600 + k) * kinds.length)];
      out.push([pick, px, py, 0.9 + hash01(t, 800 + k) * 0.6, Math.floor(hash01(t, 1000 + k) * 360)]);
      if (kit.under && hash01(t, 1200 + k) < 0.25) out.push([kit.under, px + jit0(t, 1400 + k, 0.08), py + jit0(t, 1600 + k, 0.08), 0.8 + hash01(t, 1800 + k) * 0.4, Math.floor(hash01(t, 2000 + k) * 360)]);
    }
  }
  return out;
}
/** Tree spacing and how far from the center trees go, in tile units (a hex edge is about 0.46 out). */
const FOREST_SPACING = 0.17;
const FOREST_REACH = 0.47;
/** Whether (x, y) lies within a pointy-top hex of apothem a around the center. */
function inHex(x, y, a) {
  for (let d = 0; d < 6; d++) {
    const ang = (30 + 60 * d) * Math.PI / 180;
    if (x * Math.cos(ang) + y * Math.sin(ang) > a) return false;
  }
  return true;
}

/**
 * Groundcover by biome for a park's open land: tufts of grass, and in the tropics flowering shrubs, so a meadow inside
 * the park reads as left to grow. Auditioned 2026-10-02 (crash soak npg2): these draw in their own colors;
 * BIN_FOL_Grass_SM drew navy blue and the tundra groundcover as heavy dark mounds, so tundra takes the grassland tufts.
 */
const MEADOW = { BIOME_GRASSLAND: "BIN_FOL_Grassland_Groundcover_B", BIOME_PLAINS: "BIN_FOL_Plains_Groundcover",
  BIOME_TUNDRA: "BIN_FOL_Grassland_Groundcover_B", BIOME_TROPICAL: "BIN_FOL_Tropical_Groundcover", BIOME_DESERT: "BIN_FOL_Desert_Grass_Patch" };
const MEADOW_SPOTS = [[0.18, 0.1], [-0.2, 0.12], [0.05, -0.24], [-0.16, -0.16], [0.26, -0.1], [-0.04, 0.27], [0.02, 0.02]];
export function meadow(t, biome, extra = 0) {
  const bin = MEADOW[biome];
  if (!bin) return [];
  const n = Math.min(MEADOW_SPOTS.length, 3 + Math.floor(hash01(t, 300) * 3) + extra);
  const turn = Math.floor(hash01(t, 301) * 7);
  const out = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = MEADOW_SPOTS[(turn + k) % MEADOW_SPOTS.length];
    out.push([bin, x + (hash01(t, 310 + k) - 0.5) * 0.08, y + (hash01(t, 320 + k) - 0.5) * 0.08, 0.8 + hash01(t, 330 + k) * 0.5, Math.floor(hash01(t, 340 + k) * 360)]);
  }
  return out;
}

/**
 * A Wilderness Area's growth shown by swapping, never adding trees (2026-10-04: extra trees crowded into each other).
 * At 24 tiles OLD_GROWTH_SHARE of the stands have one tree swapped for a giant of the biome, a coast redwood or, in the
 * tropics, a flowering tree. (Wildflower clumps among the grass from 8 tiles were tried and removed: FOL_Flowers_Small_*
 * read as loud yellow blots at play zoom.) Pure.
 */
const OLD_GROWTH_SHARE = 0.3;
export function oldGrowth(biome) {
  if (biome === "BIOME_TROPICAL") return ["FOL_HB_Flower_Tree_A", 1.4];
  if (biome === "BIOME_GRASSLAND" || biome === "BIOME_PLAINS" || biome === "BIOME_TUNDRA") return ["FOL_Coastal_Redwood_A", 1.1];
  return null;
}

/**
 * A tile's own vegetation, which the game stops drawing under a district: the game's feature model where it has one
 * (FEATURE_MODELS), its tree scatter where the model alone is sparse, the park's woods on wooded tiles with neither,
 * and reeds on wetland with no model. Empty on open ground.
 */
function ownLook(t, kit) {
  const out = [];
  const model = featureModel(t), wooded = isWooded(t);
  if (model) out.push([model, 0, 0, 1, 0]);
  const scatter = (wooded || FEATURE_SCATTER[featureOf(t)]) && !MODEL_ALONE.has(model) ? gameScatter(t, biomeOf(t), featureOf(t)) : null;
  if (scatter) out.push(...scatter);
  else if (wooded && !MODEL_ALONE.has(model)) out.push(...forestCover(t, kit));
  if (isWet(t) && !model) out.push(...wetCover(t));
  return out;
}

/**
 * Dressing for one tile: [[asset, dx, dy, scale, angle]]. `ctx` carries the anchor and lookout tiles and the park's
 * plan (np-scene.js), whose entry for the tile says which accents it carries; `level` is the park's size level, `lookouts` every lookout tower's tile at that level (lookoutTiles) and `sites` its level sites
 * (levelSites).
 */
export function dressingFor(t, ctx) {
  const mon = ctx.monuments && ctx.monuments.get(t);
  const out = tileDressing(t, ctx);
  // A monument (monumentSites) stands clear of the tile's trees and tufts around it.
  return keepClear(mon ? [...clearOf(out, mon[0][1], mon[0][2], 0.13), ...mon] : out);
}

/**
 * The built pieces of a tile's dressing and the room each needs: [[x, y, radius]]. Cabins, shelters and houses by
 * their scale, tents, fire pits, lookout towers, the park sign and the monuments.
 */
const HOUSES = new Set(["IMP_Camp_BldA", "PROP_Pasture_ANT_BldB", "PROP_MOD_Farm_BldC"]);
const FIXED_ROOM = { PROP_Tent_GEN_Sleeper_Standard_C: 0.05, PROP_Fire_Pit: 0.03, Camp_Lookout_Tower_Bin: 0.07,
  NAM_SWN_Menagerie_Sign: 0.04, PROP_CairnBase: 0.06, NAF_EGY_CityHall_Obelisk: 0.06, ANT_EEU_Monument_Rock_Structure: 0.08 };
export function solidSpots(list) {
  const out = [];
  for (const [asset, x, y, scale] of list) {
    if (HOUSES.has(asset)) out.push([x, y, 0.03 + 0.13 * scale]);
    else if (FIXED_ROOM[asset] != null) out.push([x, y, FIXED_ROOM[asset]]);
  }
  return out;
}
/**
 * Drops the trees, shrubs and grass tufts (FOL_ and BIN_FOL_ pieces) that would stand inside a built piece's room, so
 * nothing grows through a cabin, a tent or a monument. The tile's own feature model and everything built stay. Pure.
 */
export function keepClear(list) {
  const solids = solidSpots(list);
  if (!solids.length) return list;
  return list.filter(([asset, x, y]) => !/^(BIN_FOL_|FOL_)/.test(asset) || solids.every(([sx, sy, r]) => Math.hypot(x - sx, y - sy) >= r));
}
function tileDressing(t, { anchor, lookout, buildings = true, plan = null, level = 0, lookouts = null, sites = null }) {
  const slot = (plan && plan.get(t)) || {};
  if (isWonder(t)) return [];
  if (isMountain(t)) return slot.cairn != null ? [[CAIRN, jit0(t, 61, 0.2), jit0(t, 62, 0.2), 0.5 + hash01(t, 63) * 0.2, Math.floor(hash01(t, 3) * 360)]] : [];
  if (isWater(t) || isLake(t) || isNavRiver(t)) return waterDressing(t, slot);
  const jit = (salt, r) => jit0(t, salt, r);
  const biome = biomeOf(t);
  const kit = KITS[biome] || DEFAULT_KIT;
  const out = [];
  // The founding tile keeps its own look under the park's buildings: an oasis keeps its pond, woods their trees.
  const own = ownLook(t, kit);
  if (t === anchor && !buildings) {
    // A Wilderness Area has no warden's lodge: its founding tile is a stand of trees like any other.
    if (own.length) return own;
    out.push(...treeStand(t, kit, 4, 0, slot.grove || 0));
    if (kit.under && slot.under != null) out.push([kit.under, jit(40, 0.3), jit(41, 0.3), 0.8 + hash01(t, 42) * 0.4, Math.floor(hash01(t, 43) * 360)]);
    return out;
  }
  if (t === anchor) {
    for (const s of STATION) out.push(s);
    out.push(...own);
    if (!own.length) {
      // A stand behind the station, away from the arch and sign on the east side.
      for (const [k, x, y] of [[11, -0.3, -0.12], [12, -0.22, -0.3], [13, 0.02, 0.3]]) {
        out.push([kit.trees[k % kit.trees.length], x + jit(k, 0.06), y + jit(k + 3, 0.06), 1.4 + hash01(t, k + 6) * 0.4, Math.floor(hash01(t, k + 9) * 360)]);
      }
      if (kit.accent) out.push([kit.accent, -0.05, 0.22, 1.2, 0]);
      if (kit.under) out.push([kit.under, -0.15, -0.28, 1, 0]);
      out.push(...meadow(t, biomeOf(t)).slice(0, 3));
    }
    out.push([TRAIL, 0.12, 0.1, 1, 30]);
    return out;
  }
  const hill = terrainOf(t) === "TERRAIN_HILL";
  const wooded = isWooded(t);
  let clearing = false;
  // One draw picks a tile's camp, cabin village or lone shelter, so they never share a tile. A camp or village sits in
  // a clearing: the tile's trees keep to one side (treeStand shape 1, around the bearing hash01(t, 5)) and it sits
  // across from them. A minor river runs through its tile's middle, so neither goes there.
  const tower = t === lookout || !!(lookouts && lookouts.includes(t));
  const lone = buildings && !tower && !wooded;
  const open = lone && !hill && !featureModel(t) && !isRiver(t);
  const pick = hash01(t, 70);
  const away = hash01(t, 5) * 360 + 180;
  // A level site (levelSites) adds its camp, village or shelter where the base draw gave the tile none.
  const site = (sites && sites.get(t)) || "";
  let village = false, camp = false;
  if (open && (pick < CABIN_SHARE || site === "village")) {
    clearing = village = true;
    const c = along(away, 0.06, 0);
    out.push(...cabinCluster(t, c.x, c.y, away + 180, singles(kit.trees)));
  } else if (open && (pick < CABIN_SHARE + CAMP_SHARE || site === "camp")) {
    clearing = camp = true;
    const c = along(away, 0.18, 0);
    out.push(...campsite(t, c.x, c.y));
  } else if (lone && (pick > 1 - SHELTER_SHARE || site === "shelter")) {
    const [asset, sc] = PARK_BUILDINGS[Math.floor(hash01(t, 71) * PARK_BUILDINGS.length)];
    out.push([asset, jit(72, 0.2), jit(73, 0.2), sc * (0.9 + hash01(t, 74) * 0.2), Math.floor(hash01(t, 75) * 360)]);
  }
  if (tower) out.push([LOOKOUT, 0.05, 0.05, 0.5, Math.floor(hash01(t, 15) * 4) * 90]);
  // The tile's own vegetation, which its district hides (ownLook).
  const model = featureModel(t);
  out.push(...own);
  // A Wilderness Area thickens with its level through its undergrowth and meadow, never more trees: extra trees, a
  // second lattice of woods and four-tree thickets crowded into each other (watched 2026-10-04, nshow-exp).
  const denser = buildings ? 0 : level;
  if (!wooded && !model) {
    // A thicket (a Wilderness Area's level site) is the tile's own stand with a thick understory under it.
    const thicket = site === "thicket";
    if (thicket) for (let k = 0; k < 3; k++) {
      const p = along(hash01(t, 2700 + k) * 360, 0.12 + hash01(t, 2710 + k) * 0.14, 0);
      if (kit.under) out.push([kit.under, p.x, p.y, 0.8 + hash01(t, 2720 + k) * 0.4, Math.floor(hash01(t, 2730 + k) * 360)]);
    }
    // A cabin village's trees stand in its rows (cabinCluster), so it gets no stand of its own.
    const stand = village ? [] : treeStand(t, kit, tower ? 2 : 3 + (hash01(t, 16) < 0.5 ? 1 : 0),
      tower ? 2 : clearing ? 1 : slot.stand || 0, slot.grove || 0);
    // Old growth: at 24 tiles a Wilderness Area's stand on some tiles has one tree swapped for a giant (oldGrowth).
    if (denser >= 3 && stand.length && hash01(t, 2950) < OLD_GROWTH_SHARE) {
      const g = oldGrowth(biome);
      if (g) {
        // The giant takes the first tree's place, and the stand's other trees keep clear of it.
        const [, gx, gy, , ga] = stand[0];
        const rest = stand.slice(1).filter(([, x, y]) => Math.hypot(x - gx, y - gy) >= 0.13);
        stand.length = 0; stand.push([g[0], gx, gy, g[1], ga], ...rest);
      }
    }
    out.push(...stand);
    if ((slot.under != null || thicket || hash01(t, 2600) < 0.2 * denser) && !village && !camp) {
      // The understory, or in the desert its scatter of rocks, on some tiles only; on more of a Wilderness Area's as
      // it reaches each size level.
      const bin = kit.rocks && (!kit.under || hash01(t, 44) < 0.5) ? kit.rocks : kit.under;
      if (bin) out.push([bin, jit(40, 0.35), jit(41, 0.35), 0.8 + hash01(t, 42) * 0.4, Math.floor(hash01(t, 43) * 360)]);
    }
    if (slot.trail != null) out.push([TRAIL, jit(45, 0.25), jit(46, 0.25), 0.8 + hash01(t, 47) * 0.4, Math.floor(bearing(t, anchor) + jit(48, 40) + 360) % 360]);
    // A village's or a campsite's clearing is trodden ground: no tufts of grass under the cabins or the tents.
    if (!village && !camp) out.push(...meadow(t, biome, denser));
  }
  if (hill && slot.stones != null) {
    // Four arrangements of stone, spread by the plan so neighboring hills differ.
    const a = hash01(t, 49) * 360;
    const at = (r, da) => along(a + da, r, 0);
    const spin = (salt) => Math.floor(hash01(t, salt) * 360);
    if (slot.stones === 0) { const p = at(0.24, 0); out.push(["BIN_Boulder_C", p.x, p.y, 0.24 + hash01(t, 50) * 0.12, spin(51)]); }
    if (slot.stones === 1) { const p = at(0.22, 120); out.push(["BIN_Boulder_B", p.x, p.y, 0.2 + hash01(t, 52) * 0.1, spin(53)]); }
    if (slot.stones >= 2) {
      const n = slot.stones === 2 ? 2 : 3;
      for (let k = 0; k < n; k++) { const p = at(0.18 + hash01(t, 54 + k) * 0.12, k * 50); out.push([localRock(t, 57 + k, biome), p.x, p.y, 0.3 + hash01(t, 60 + k) * 0.2, spin(63 + k)]); }
    }
  }
  if (slot.cairn != null) out.push([CAIRN, jit(59, 0.35), jit(60, 0.35), 0.35 + hash01(t, 64) * 0.2, Math.floor(hash01(t, 65) * 360)]);
  return out;
}

function jit0(t, salt, r) { return (hash01(t, salt) - 0.5) * r; }

/**
 * A park's level sites as drawn: on open land a camp, village or thicket can stand on (flat, unwooded, no feature
 * model, no minor river), never where the base drawing already put a camp, village or tower.
 */
export function siteMap(tiles, anchor, level, buildings, lookouts = []) {
  const open = (t) => !isWater(t) && !isLake(t) && !isNavRiver(t) && !isMountain(t) && !isWonder(t) && !isWooded(t)
    && !featureModel(t) && terrainOf(t) !== "TERRAIN_HILL" && !isRiver(t);
  const taken = (t) => lookouts.includes(t) || (buildings && hash01(t, 70) < CABIN_SHARE + CAMP_SHARE);
  return levelSites(tiles, anchor, level, buildings, open, taken);
}

/** A park's monuments as drawn: on open land a monument can stand on, clear of camps, villages, shelters and towers. */
export function monumentMap(tiles, anchor, level, buildings, lookouts = [], sites = new Map()) {
  // Woods and sagebrush take one too (watched 2026-10-04, nlv6-park: a park of forest, water and sagebrush desert had
  // almost no bare open land and drew none); the tiles a feature model alone draws (marsh, oasis) do not.
  const open = (t) => !isWater(t) && !isLake(t) && !isNavRiver(t) && !isMountain(t) && !isWonder(t)
    && !MODEL_ALONE.has(featureModel(t)) && !lookouts.includes(t) && !sites.has(t)
    && !(buildings && (hash01(t, 70) < CABIN_SHARE + CAMP_SHARE || hash01(t, 70) > 1 - SHELTER_SHARE));
  return monumentSites(tiles, anchor, level, buildings, open);
}

/** A park's own size level (np-core.js parkLevel), which sets how rich it is drawn. */
export function levelOf(park) { return parkLevel(park); }

/**
 * What a park's drawing depends on: its owner, its tiles, which of them the local player can see, and its
 * size level. Pure given `revealed` and `level`. The sweep redraws a park only when this changes, so the walls are not
 * rebuilt and the animals do not restart their idle in step at every turn.
 */
export function drawSignature(park, revealed = isRevealed, level = levelOf(park)) {
  return `${park.owner}|${park.tiles.join(",")}|${park.tiles.filter(revealed).join(",")}|L${level}`;
}

/** Whether the park on the map is drawn as it stands now. */
export function isDrawnCurrent(park) { return drawn.get(park.id) === drawSignature(park); }

// --- drawing -----------------------------------------------------------------------------------------

const groups = new Map();   // park id -> { walls, dress, fx, wild }
const drawn = new Map();    // park id -> drawSignature at its last drawing
let borderGroup = null;
const borders = new Map();  // park id -> border overlay
// A drawing's later steps (waking the animals, the growth's walls, dressing and dust) run on timers, holding model
// handles and groups that the next drawing clears and clearPark destroys. Reading a freed model is a native crash that
// try/catch cannot catch (watched 2026-10-01: two drawings 0.5 s apart killed the game at the first wake-up; 8 s apart
// did not). Each drawing and clearing bumps the park's generation, and a step from an older one does nothing.
const generations = new Map(); // park id -> generation; kept after clearPark so old steps still see it moved
function nextGeneration(id) { const n = (generations.get(id) || 0) + 1; generations.set(id, n); return n; }
function isCurrent(id, n) { return generations.get(id) === n; }

function place(group, asset, plot, off, scale, angle, tint = null) {
  const l = locOf(plot);
  const opts = { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale, angle };
  if (tint) { opts.tintColor1 = tint[0]; opts.tintColor2 = tint[1]; }
  return safe(() => group.addModelAtPlot(asset, { i: l.x, j: l.y }, off, opts), null);
}
/** A player's colours as the game tints its own pieces with them (leader-model-manager.js), or null. */
function ownerTint(player) {
  const c1 = safe(() => UI.Player.getPrimaryColorValueAsHex(player), null), c2 = safe(() => UI.Player.getSecondaryColorValueAsHex(player), null);
  return c1 == null || c2 == null ? null : [c1, c2];
}

function groupsFor(id) {
  let g = groups.get(id);
  if (!g) {
    g = {
      walls: safe(() => WorldUI.createModelGroup("NationalPark_walls_" + id), null),
      dress: safe(() => WorldUI.createModelGroup("NationalPark_dress_" + id), null),
      fx: safe(() => WorldUI.createModelGroup("NationalPark_fx_" + id), null),
      wild: safe(() => WorldUI.createModelGroup("NationalPark_wild_" + id), null),
    };
    groups.set(id, g);
  }
  return g;
}

function drawBorder(park) {
  if (!borderGroup) borderGroup = safe(() => WorldUI.createOverlayGroup("NationalParkBorders", 1), null);
  if (!borderGroup) return;
  let b = borders.get(park.id);
  if (!b) { b = safe(() => borderGroup.addBorderOverlay(kindOf(park).buildings ? BORDER_STYLE : WILD_BORDER_STYLE), null); if (!b) return; borders.set(park.id, b); }
  safe(() => b.clear());
  // The border shows with the Options marks (np-settings.js getMarks), as the wash does (np-lens.js).
  const shown = getMarks() ? park.tiles.filter(isRevealed) : [];
  if (shown.length) safe(() => b.setPlotGroups(shown, 0));
}

/** Redraw every park's border, after the Options marks were turned on or off. */
export function refreshBorders() { for (const p of parks()) drawBorder(p); }

/** "rough" for a hill, mountain or natural wonder, whose walls are dry stone; "open" for fields and forest. */
export function groundOf(t) { return isWonder(t) || isMountain(t) || terrainOf(t) === "TERRAIN_HILL" ? "rough" : "open"; }

function wallRun(g, e) {
  // A mountain wall's ends: the tiles on either side of the edge, from the mountain's side (the plot when it is the
  // mountain, else the mountain beyond it).
  const footEnds = () => {
    const m = isMountain(e.plot) ? e.plot : ringOf(e.plot)[e.dir];
    const md = isMountain(e.plot) ? e.dir : (e.dir + 3) % 6;
    const nb = ringOf(m);
    const pair = [isMountain(nb[(md + 5) % 6]), isMountain(nb[(md + 1) % 6])];
    return isMountain(e.plot) ? pair : [pair[1], pair[0]];
  };
  const pieces = e.foot ? mountainWallPieces(e.plot, e.dir, isMountain(e.plot) ? MOUNTAIN_WALL_R.mountain : MOUNTAIN_WALL_R.land, footEnds())
    : wallPieces(e.plot, e.dir, biomeOf(e.plot), undefined, undefined, groundOf(e.plot));
  for (const p of pieces) place(g.walls, p.asset, e.plot, { x: p.dx, y: p.dy, z: p.z }, p.scale, p.angle);
}

function buoy(g, e) {
  const p = along(armAngle(e.dir), 0.44, (hash01(e.plot, 58 + e.dir) - 0.5) * 0.2);
  place(g.walls, BUOY, e.plot, p, 1.6, 0);
}

/** The land facts np-wildlife.js chooses from, read from the map. */
function landOf(t, anchor, level = 0) {
  const water = isWater(t), lake = isLake(t), river = isNavRiver(t);
  const shoreDir = water || lake || river ? ringOf(t).findIndex((n) => n >= 0 && !isWater(n) && !isNavRiver(n)) : -1;
  return { biome: biomeOf(t), water, lake, river, coast: water && !lake, hill: terrainOf(t) === "TERRAIN_HILL",
    mountain: isMountain(t), wonder: isWonder(t), wooded: isWooded(t), anchor: t === anchor, level,
    shore: shoreDir >= 0 ? armAngle(shoreDir) : null,
    treeKinds: (KITS[biomeOf(t)] || DEFAULT_KIT).trees.map((_x, i) => i) };
}

/** Rigged animals start their idle only once loaded; staggered so a herd does not move in step, and repeated
 *  once in case the first call came before the model was ready. */
function wakeAnimals(handles, id, gen) {
  handles.forEach((h, k) => {
    for (const at of [1500, 4500]) setTimeout(() => { if (isCurrent(id, gen)) safe(() => { if (h.state !== "IDLE") h.setState("IDLE"); }); }, at + (k * 373) % 1200);
  });
}

/** World units across a tile: model offsets are fractions of a tile, WorldUI.getPlotLocation's are world units. */
const TILE_WORLD = 64;
/** The ground's height at offset (dx, dy) on plot l, in world units, or 0 if it cannot be read. On a water tile the
 *  water's surface where it lies higher, so a crane at the shore or a crab stands on the water, not the bed. */
function groundAt(l, dx, dy, wet = false) {
  const read = (mode) => safe(() => WorldUI.getPlotLocation({ x: l.x, y: l.y }, { x: dx * TILE_WORLD, y: dy * TILE_WORLD, z: 0 }, mode).z, null);
  const land = read(PlacementMode.TERRAIN) ?? 0;
  if (!wet) return land;
  const water = read(PlacementMode.WATER);
  return water == null ? land : Math.max(land, water);
}

function populateTile(g, t, anchor, plan, level = 0, solids = []) {
  const l = locOf(t);
  const handles = [];
  const land = landOf(t, anchor, level);
  const wet = land.water || land.lake || land.river;
  for (const w of wildlifeFor(t, land, plan.get(t))) {
    // No animal stands in a cabin, a tent or a monument (solidSpots).
    if (w.kind !== "vfx" && solids.some(([sx, sy, r]) => Math.hypot(w.dx - sx, w.dy - sy) < r + 0.03)) continue;
    if (w.kind === "vfx") { safe(() => g.wild.addVFXAtPlot(w.asset, { x: l.x, y: l.y }, { x: w.dx, y: w.dy, z: w.z })); continue; }
    // A rigged animal is placed at an absolute height: set it on the ground under it (np-wildlife.js SPECIES).
    const z = groundAt(l, w.dx, w.dy, wet) + w.z;
    const h = safe(() => g.wild.addModelAtPlot(w.asset, { i: l.x, j: l.y }, { x: w.dx, y: w.dy, z },
      { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: w.scale, angle: w.angle }), null);
    if (h) handles.push(h);
  }
  return handles;
}

function dressTile(g, t, ctx) {
  for (const [asset, dx, dy, scale, angle, tint] of dressingFor(t, ctx)) {
    place(g.dress, asset, t, { x: dx, y: dy, z: 0 }, scale, angle, tint === "owner" ? ownerTint(ctx.owner) : null);
  }
  if (t === ctx.hawk) { const l = locOf(t); safe(() => g.dress.addVFXAtPlot(HAWK, { x: l.x, y: l.y }, { x: 0, y: 0, z: 0 })); }
}

/**
 * Draw a park. `fresh` lists tiles just added: their walls and dressing appear one after another with dust, and
 * everything else is drawn at once.
 */
export function drawPark(park, fresh = []) {
  if (typeof WorldUI === "undefined" || typeof PlacementMode === "undefined") return false;
  const g = groupsFor(park.id);
  if (!g.walls || !g.dress) return false;
  const gen = nextGeneration(park.id);
  safe(() => g.walls.clear()); safe(() => g.dress.clear()); safe(() => g.wild && g.wild.clear());
  const level = levelOf(park);
  drawn.set(park.id, drawSignature(park, isRevealed, level));
  drawBorder(park);
  const freshSet = new Set(fresh);
  const buildings = kindOf(park).buildings;
  const lookouts = buildings ? lookoutTiles(park.tiles, park.anchor, level) : [];
  const lookout = lookouts.length ? lookouts[0] : -1;
  const sites = siteMap(park.tiles, park.anchor, level, buildings, lookouts);
  const monuments = monumentMap(park.tiles, park.anchor, level, buildings, lookouts, sites);
  const plan = planScene(park.tiles, { land: (t) => landOf(t, park.anchor, level), ring: ringOf, fauna: FAUNA_POOLS, level, wild: !buildings });
  const ctx = { anchor: park.anchor, lookout, lookouts, sites, monuments, level, buildings, plan, owner: park.owner, hawk: hawkTile(park.tiles, park.anchor, lookout) };
  const edges = wallEdges(park.tiles).filter((e) => isRevealed(e.plot));
  const later = [];
  for (const e of edges) {
    if (freshSet.has(e.plot)) later.push(e);
    else wallRun(g, e);
  }
  for (const e of buoyEdges(park.tiles)) if (isRevealed(e.plot)) buoy(g, e);
  for (const t of park.tiles) if (!freshSet.has(t) && isRevealed(t)) dressTile(g, t, ctx);
  if (g.wild) {
    const handles = [];
    for (const t of park.tiles) if (isRevealed(t)) handles.push(...populateTile(g, t, park.anchor, plan, level, solidSpots(dressingFor(t, ctx))));
    wakeAnimals(handles, park.id, gen);
  }
  if (!later.length && !freshSet.size) { refreshLens(); return true; }
  // The growth: wall runs rise one by one with a puff of dust, then the new land is dressed.
  later.forEach((e, k) => setTimeout(() => {
    if (!isCurrent(park.id, gen)) return;
    wallRun(g, e);
    const l = locOf(e.plot);
    safe(() => g.fx.addVFXAtPlot(DUST, { x: l.x, y: l.y }, along(armAngle(e.dir), 0.46, 0)));
  }, k * STAGGER_MS));
  const done = later.length * STAGGER_MS + 150;
  setTimeout(() => { if (isCurrent(park.id, gen)) for (const t of fresh) if (isRevealed(t)) dressTile(g, t, ctx); }, done);
  setTimeout(() => { if (isCurrent(park.id, gen)) safe(() => g.fx.clear()); }, done + 3000);
  refreshLens();
  return true;
}

export function clearPark(id) {
  nextGeneration(id);
  const g = groups.get(id);
  if (g) for (const k of ["walls", "dress", "fx", "wild"]) { safe(() => g[k].clear()); safe(() => g[k].destroy()); }
  groups.delete(id);
  drawn.delete(id);
  const b = borders.get(id);
  if (b) safe(() => b.clear());
  borders.delete(id);
  refreshLens();
}

export function clearAll() {
  for (const id of [...groups.keys()]) clearPark(id);
  for (const id of [...borders.keys()]) clearPark(id);
  // The group itself is kept and reused: the next drawing would otherwise make a second group of the same name.
  if (borderGroup) safe(() => borderGroup.clearAll());
  log("drawings cleared");
}
