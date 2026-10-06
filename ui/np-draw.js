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
//   dressing  everything else on the land: the warden's station, a village, camp and shelter, lookouts, monuments,
//   wildlife  footpaths, woods, stands, patches of shrub and rock, reeds, herds, birds and fish. All of it is planned
//             for the park as a whole (np-plan.js) and a tile draws the part that falls on it. Nothing on the wonder.
// Tiles just added are drawn in sequence, each wall run with a puff of dust, so the park visibly grows.
//
// Size levels: as a park reaches 8, 16 and 24 of its own tiles (np-core.js parkLevel), its plan's budgets grow
// (np-plan.js budgetsFor): a National Park gains a structure a level, a second lookout and monuments; a Wilderness
// Area monuments, thicker groundcover, rarer wildlife from 16 tiles and old-growth giants at 24, never more trees.
// Each level only adds to the one below, so stepping down takes exactly that away and a park looks the same after a
// reload.
"use strict";

import {
  safe, log, locOf, ringOf, terrainOf, biomeOf, featureOf, isMountain, isWater, isWonder, isLake, isNavRiver, isRiver,
  isImpassableEdgeTile, isRevealed, hash01, kindOf, parkLevel, parks, resourceAt,
} from "./np-core.js";
import { parkPlan } from "./np-plan.js";
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

const HAWK = "VFX_Bird_Hawk_C3";
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

/** The tile the hawk circles once a park has three tiles: the first mountain, else the lookout, else the
 *  founding tile. -1 for a smaller park. */
export function hawkTile(tiles, anchor, lookout, mountain = isMountain) {
  if (tiles.length < 3) return -1;
  const m = tiles.filter(mountain);
  if (m.length) return Math.min(...m);
  return lookout >= 0 ? lookout : anchor;
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
export function featureModel(t) { const f = featureOf(t); return f && FEATURE_MODELS.has(f) ? f : ""; }
/** Whether the map has wetland on a plot (marsh, bog, oasis, watering hole); mangrove counts as woods. */
export function isWet(t) {
  const f = featureOf(t);
  if (!f || f === "FEATURE_MANGROVE") return false;
  return safe(() => GameInfo.Features.lookup(f).FeatureClassType === "FEATURE_CLASS_WET", false);
}

/** Whether the map has woods on a plot: a vegetated feature (forest, rainforest, taiga, woodland) or mangrove. */
export function isWooded(t) {
  const f = featureOf(t);
  if (!f) return false;
  if (f === "FEATURE_MANGROVE") return true;
  return safe(() => GameInfo.Features.lookup(f).FeatureClassType === "FEATURE_CLASS_VEGETATED", false);
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

/** The land as np-plan.js reads it, from the map. */
export const LIVE_MAP = {
  ring: ringOf, biome: biomeOf, feature: featureOf, model: featureModel, hill: (t) => terrainOf(t) === "TERRAIN_HILL",
  sea: (t) => isWater(t) && !isLake(t), lake: isLake, nav: isNavRiver, river: isRiver, mountain: isMountain, wonder: isWonder,
  wooded: isWooded, wet: isWet, resource: resourceAt,
  cliff: (t) => { const l = locOf(t); return [0, 1, 2, 3, 4, 5].some((d) => safe(() => GameplayMap.isCliffCrossing(l.x, l.y, d), false)); },
};
/** A park's plan (np-plan.js) at its present size. */
export function planFor(park) {
  return parkPlan(park.tiles, park.anchor, { level: levelOf(park), buildings: kindOf(park).buildings, map: LIVE_MAP });
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

function populateTile(g, t, plan) {
  const l = locOf(t);
  const handles = [];
  const wet = isWater(t) || isLake(t) || isNavRiver(t);
  // The plan has already set every animal on open ground (np-plan.js), so none is moved or dropped here.
  for (const w of plan.wild.get(t) || []) {
    if (w.kind === "vfx") { safe(() => g.wild.addVFXAtPlot(w.asset, { x: l.x, y: l.y }, { x: w.dx, y: w.dy, z: w.z })); continue; }
    // A rigged animal is placed at an absolute height: set it on the ground under it (np-wildlife.js SPECIES).
    const z = groundAt(l, w.dx, w.dy, wet) + w.z;
    const h = safe(() => g.wild.addModelAtPlot(w.asset, { i: l.x, j: l.y }, { x: w.dx, y: w.dy, z },
      { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: w.scale, angle: w.angle }), null);
    if (h) handles.push(h);
  }
  return handles;
}

/** A tile's part of the park's plan: [[asset, dx, dy, scale, angle, tint?]]. A sixth field "owner" asks for the park
 *  owner's colours, as the woodcutter's tents take them. */
function dressTile(g, t, ctx) {
  for (const [asset, dx, dy, scale, angle, tint] of ctx.plan.pieces.get(t) || []) {
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
  const plan = safe(() => planFor(park), null);
  if (!plan) { log(`park ${park.id}: no plan, dressing skipped`); }
  const lookout = plan ? (plan.destinations.find((d) => d.kind === "lookout") || { tile: -1 }).tile : -1;
  const ctx = { plan: plan || { pieces: new Map(), wild: new Map() }, owner: park.owner, hawk: hawkTile(park.tiles, park.anchor, lookout) };
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
    for (const t of park.tiles) if (isRevealed(t)) handles.push(...populateTile(g, t, ctx.plan));
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
