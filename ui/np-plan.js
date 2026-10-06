// np-plan.js - National Parks: the park planned as one place, before any tile is dressed.
//
// parkPlan() reads the whole park once and returns everything the drawing needs: regions and their character, the
// fields a placement is scored against, the destinations and the footpaths that join them, what is built and its
// setting, the vegetation and the wildlife. A tile then draws the pieces that fall inside its hex (plan.pieces,
// plan.wild). docs/DESIGN.md, "The composition", is the model this follows.
//
// Where a thing stands follows from the park's structure, the terrain, or something already placed. A hash breaks ties
// and adds small variation only, and each is taken from the identity of what it belongs to (a tile, a region, an edge,
// a feature), never from one running stream, so adding a monument or a far tile moves nothing elsewhere. Pure: the map
// is read through `map`, so the whole plan runs without the engine.
"use strict";

import { hash01 } from "./np-core.js";
import { FAUNA_POOLS, rareFor, animalAt } from "./np-wildlife.js";

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
  return { assets: [...singles(kit.trees).map((a) => [a, 3]), ...(kit.clusters || []).map((a) => [a, 0.8])], r0: 0.14, under: kit.under };
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
const DIRS = [0, 1, 2, 3, 4, 5].map((i) => { const a = (360 - 60 * i) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rot = (deg, x, y) => { const a = deg * Math.PI / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };
const deg = (v) => Math.floor(((v % 360) + 360) % 360);
const edgeId = (a, b) => (Math.min(a, b) * 7919 + Math.max(a, b)) | 0;
/** Distance from p to the segment a-b. */
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

/**
 * Plan a park. `tiles` in the order the park took them (the founding tile first), `map` the land:
 * { ring(t), biome(t), hill(t), sea(t), lake(t), nav(t), river(t), mountain(t), wonder(t), wooded(t), wet(t),
 * feature(t), model(t), resource(t), cliff(t) }. Returns the plan (docs/DESIGN.md lists its fields).
 */
export function parkPlan(tiles, anchor, { level = 0, buildings = true, map }) {
  const inPark = new Set(tiles);

  // positions: walk the rings out from the founding tile; one ring of land outside the park is placed too
  const pos = new Map();
  const seat = (seed, at) => {
    pos.set(seed, at);
    const queue = [seed];
    for (let q = 0; q < queue.length; q++) {
      const t = queue[q], p = pos.get(t);
      if (!inPark.has(t)) continue;
      map.ring(t).forEach((n, d) => { if (n >= 0 && !pos.has(n)) { pos.set(n, [p[0] + DIRS[d][0], p[1] + DIRS[d][1]]); queue.push(n); } });
    }
  };
  seat(anchor, [0, 0]);
  tiles.forEach((t, k) => { if (!pos.has(t)) seat(t, [1000 * (k + 1), 0]); });

  const facts = new Map();
  for (const t of pos.keys()) {
    const feature = map.feature(t) || "", model = map.model(t) || "";
    const f = { biome: map.biome(t), hill: !!map.hill(t), sea: !!map.sea(t), lake: !!map.lake(t), nav: !!map.nav(t),
      river: !!map.river(t), mountain: !!map.mountain(t), wonder: !!map.wonder(t), wooded: !!map.wooded(t), wet: !!map.wet(t),
      feature, model, alone: MODEL_ALONE.has(model), inPark: inPark.has(t), cliff: !!(map.cliff && map.cliff(t)),
      // A tile with a resource is left to the game to draw (the founding tile's station apart, which the park cannot
      // do without).
      resource: !!(map.resource && map.resource(t)) && !(t === anchor && buildings),
      resourceType: String((map.resource && map.resource(t)) || "") };
    // Every resource tile is left to the game (np-core.js isStrewnResource): no district, nothing placed.
    f.native = f.resource;
    f.water = f.sea || f.lake || f.nav;
    f.walk = !f.water && !f.mountain && !f.wonder;
    f.cover = f.walk && !f.resource && !f.alone && !f.wet && (f.wooded || feature === "FEATURE_SAGEBRUSH_STEPPE");
    f.open = f.walk && !f.resource && !f.wooded && !f.wet && !f.cover && !f.alone;
    facts.set(t, f);
  }
  const F = (t) => facts.get(t);
  const P = (t) => pos.get(t);
  const ringIn = (t) => map.ring(t).filter((n) => n >= 0 && inPark.has(n));
  /** The park tile whose hex holds p, or -1. */
  const tileAt = (p) => {
    let best = -1, bd = 0.6;
    for (const t of tiles) { const d = dist(p, P(t)); if (d < bd) { bd = d; best = t; } }
    if (best < 0) return -1;
    // The nearest park tile holds p only if p is inside its hex; past an edge it is land outside the park.
    const c = P(best);
    for (const d of DIRS) if ((p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1] > 0.5 + 1e-9) return -1;
    return best;
  };

  // regions: one biome in one connected piece, named by the first tile the park took there
  const regions = new Map(), character = new Map();
  for (const t of tiles) {
    if (regions.has(t) || !F(t).walk) continue;
    const queue = [t];
    regions.set(t, t);
    for (let q = 0; q < queue.length; q++) for (const n of ringIn(queue[q])) {
      if (!regions.has(n) && F(n).walk && F(n).biome === F(t).biome) { regions.set(n, t); queue.push(n); }
    }
    const d = hash01(t, 812), fauna = FAUNA_POOLS.biomes[F(t).biome] || FAUNA_POOLS.biomes.default;
    character.set(t, { biome: F(t).biome, tree: Math.floor(hash01(t, 811) * 97), base: d < 0.3 ? 0.3 : d < 0.75 ? 0.45 : 0.62,
      grain: hash01(t, 816) * 180, herd: weighted(fauna.land, hash01(t, 813)), hillHerd: weighted(fauna.hill, hash01(t, 814)),
      bird: fauna.air[Math.floor(hash01(t, 815) * fauna.air.length)], tiles: queue.length,
      open: queue.filter((x) => F(x).open).length });
  }
  const regionOf = (t) => (regions.has(t) ? character.get(regions.get(t)) : null);

  // walking distance from the lodge, and the least-cost way to every tile (the footpaths follow it)
  const steps = new Map([[anchor, 0]]);
  for (let q = 0, queue = [anchor]; q < queue.length; q++) for (const n of ringIn(queue[q])) {
    if (F(n).walk && !steps.has(n)) { steps.set(n, steps.get(queue[q]) + 1); queue.push(n); }
  }
  const pathable = (t) => F(t).walk && !F(t).wet;
  const cost = new Map([[anchor, 0]]), parent = new Map();
  for (const done = new Set(); ;) {
    let t = -1;
    for (const [k, c] of cost) if (!done.has(k) && (t < 0 || c < cost.get(t))) t = k;
    if (t < 0) break;
    done.add(t);
    for (const n of ringIn(t)) {
      if (done.has(n) || !pathable(n)) continue;
      const f = F(n), c = cost.get(t) + 1 + (f.hill ? 0.5 : 0) + (f.cover ? 0.35 : 0) + (f.river ? 0.8 : 0) + (f.resource ? 2.5 : 0) + hash01(edgeId(t, n), 320) * 0.1;
      if (!cost.has(n) || c < cost.get(n)) { cost.set(n, c); parent.set(n, t); }
    }
  }

  // water, as the land feels it: sea, lakes and navigable rivers in or beside the park, minor rivers, wetland
  const waterSrc = [];
  for (const [t, f] of facts) {
    if (f.water) waterSrc.push([P(t), 0.5, 1.3, 1]);
    else if (f.wet) waterSrc.push([P(t), 0.5, 1, 1]);
    else if (f.river && f.inPark) waterSrc.push([P(t), 0, 0.9, 0.7]);
  }
  const water = (p) => { let v = 0; for (const [c, r, fall, w] of waterSrc) v = Math.max(v, w * clamp01(1 - (dist(p, c) - r) / fall)); return v; };
  const woodSrc = tiles.filter((t) => F(t).cover && F(t).wooded).map(P);
  const wood = (p) => { let v = 0; for (const c of woodSrc) v = Math.max(v, clamp01(1 - (dist(p, c) - 0.5) / 0.8)); return v; };
  const roughSrc = [...facts].filter(([, f]) => f.hill || f.mountain).map(([t, f]) => [P(t), f.mountain ? 0.5 : 0, f.mountain ? 0.6 : 0.8]);
  const rough = (p) => { let v = 0; for (const [c, r, fall] of roughSrc) v = Math.max(v, clamp01(1 - (dist(p, c) - r) / fall)); return v; };
  const nearWater = (t) => map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n).water);
  const beside = (t, what) => map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n)[what]);
  /** The way from tile t's middle toward the open water beside it, as a unit vector, or null. */
  const seaward = (t) => {
    let x = 0, y = 0;
    map.ring(t).forEach((n, d) => { if (n >= 0 && facts.has(n) && F(n).water) { x += DIRS[d][0]; y += DIRS[d][1]; } });
    const l = Math.hypot(x, y);
    return l > 0.1 ? [x / l, y / l] : null;
  };
  // A minor river runs from its tile's middle to the middle of each edge it shares with more river or with open
  // water. Things stand beside that course, never on it (owner's rule, 2026-10-05): plants and built pieces keep off
  // it, animals graze its banks, and a footpath's bare earth stops at each bank.
  const riverSeg = [];
  for (const t of tiles) {
    if (!F(t).river) continue;
    const c = P(t);
    let any = false;
    map.ring(t).forEach((n, d) => {
      if (n < 0 || !facts.has(n) || !(F(n).river || F(n).water)) return;
      any = true;
      riverSeg.push([c, [c[0] + DIRS[d][0] * 0.5, c[1] + DIRS[d][1] * 0.5]]);
    });
    if (!any) riverSeg.push([c, c]);
  }
  const riverDist = (p) => { let v = 9; for (const [a, b] of riverSeg) v = Math.min(v, segDist(p, a, b)); return v; };
  const inRiver = (_t, p) => riverDist(p) < 0.12;
  /** The driest spot on tile t for something built: its middle, or on a river's tile the bank furthest from the water. */
  const bankOf = (t, id) => {
    const c = P(t);
    if (!F(t).river) { const j = rot(hash01(id, 83) * 360, 0.02 + hash01(id, 84) * 0.05, 0); return [c[0] + j[0], c[1] + j[1]]; }
    let best = null, bd = 0.18;
    DIRS.forEach((d, k) => { const p = [c[0] + d[0] * 0.27, c[1] + d[1] * 0.27], v = riverDist(p) + 0.02 * hash01(id, 60 + k); if (v > bd) { bd = v; best = p; } });
    return best;
  };

  // destinations: the focal things, each the best of its candidates, taken in FOCAL_ORDER
  const budgets = budgetsFor(tiles.length, level, buildings);
  const focal = new Map(buildings ? [[anchor, "lodge"]] : []);   // tile -> kind; one focal thing a tile, none beside another
  const besideFocal = (t) => map.ring(t).some((n) => focal.has(n) && n !== anchor);
  const flat = (t) => { const f = F(t); return f.open && !f.hill && !f.model && bankOf(t, t) != null; };
  const score = {
    village: (t) => 2 - 0.5 * Math.abs(steps.get(t) - 1),
    camp: (t) => 2 - 0.4 * Math.abs(steps.get(t) - 2) + 0.6 * water(P(t)) + 0.4 * wood(P(t)) + (F(t).river ? 0.3 : 0),
    shelter: (t) => 2 - 0.3 * Math.abs(steps.get(t) - 2.5) + 0.3 * water(P(t)),
    // A lookout is for looking out from: best on a cliff over the sea, then any coast, a cliff, a lake shore, a hill.
    lookout: (t) => {
      const f = F(t);
      let near = 9;
      for (const o of focal.keys()) near = Math.min(near, dist(P(t), P(o)));
      return (f.cliff && beside(t, "sea") ? 1.2 : 0) + (beside(t, "sea") ? 0.8 : beside(t, "lake") ? 0.5 : 0) + (f.cliff ? 0.6 : 0) + (f.hill ? 0.4 : 0)
        + 0.3 * map.ring(t).filter((n) => n >= 0 && facts.has(n) && !F(n).hill && !F(n).mountain).length / 6
        + 0.2 * Math.min(steps.get(t) || 4, 4) / 4 - (near < 2 ? 0.5 : 0);
    },
    monument: (t) => {
      const f = F(t), p = P(t);
      let near = 9;
      for (const o of focal.keys()) near = Math.min(near, dist(p, P(o)));
      return (f.hill ? 1 : 0) + 0.5 * rough(p) + (PALE_GROUND.has(f.biome) ? 0.2 : 0) - (f.cover ? 0.6 : 0)
        - 0.25 * Math.abs((steps.get(t) ?? 3.5) - 3.5) - (near < 2 ? 0.5 : 0) + (buildings && cost.has(t) ? 1.5 : 0);
    },
  };
  const can = {
    structure: (t) => flat(t) && steps.has(t) && steps.get(t) >= 1 && steps.get(t) <= 3 && cost.has(t),
    lookout: (t) => { const f = F(t); return f.walk && !f.wet && !f.alone && !f.resource && !f.cover && bankOf(t, t) != null && cost.has(t) && (f.hill || f.cliff || beside(t, "sea") || beside(t, "lake")); },
    // A monument is better at a path's end (scored), but land no path reaches can carry one too.
    monument: (t) => { const f = F(t); return f.walk && bankOf(t, t) != null && !f.wet && !f.alone && !f.resource && (!buildings || !steps.has(t) || steps.get(t) >= 2); },
  };
  const full = { structures: [], lookouts: [], monuments: [] };
  if (tiles.length >= 3 || !buildings) for (const kind of FOCAL_ORDER) {
    const group = kind === "lookout" ? "lookouts" : kind === "cairn" || kind === "second" ? "monuments" : "structures";
    if (group !== "monuments" && !buildings) continue;
    const ok = group === "structures" ? can.structure : group === "lookouts" ? can.lookout : can.monument;
    const rate = group === "monuments" ? score.monument : score[kind];
    let best = -1, bs = -Infinity;
    for (const t of tiles) {
      if (focal.has(t) || besideFocal(t) || !ok(t)) continue;
      const s = rate(t) + 0.15 * hash01(t, 70 + FOCAL_ORDER.indexOf(kind));
      if (s > bs) { bs = s; best = t; }
    }
    if (best < 0) { full[group].push(null); continue; }
    focal.set(best, kind);
    full[group].push({ kind, tile: best });
  }
  // What this level does not yet carry is taken back off the map of focal tiles.
  const destinations = [];
  for (const group of ["structures", "lookouts", "monuments"]) full[group].forEach((d, k) => {
    if (!d) return;
    if (k < budgets[group]) destinations.push({ id: d.tile * 16 + 12, kind: d.kind, tile: d.tile, at: null });
    else focal.delete(d.tile);
  });
  // A water's edge within the corner, where a path can end at the shore.
  if (buildings) {
    let best = -1, bs = -Infinity;
    for (const t of tiles) {
      if (focal.has(t) || !F(t).open || !cost.has(t) || !(steps.get(t) >= 1 && steps.get(t) <= 3) || !nearWater(t)) continue;
      const s = -0.3 * steps.get(t) + (map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n).lake) ? 0.5 : 0) + 0.15 * hash01(t, 88);
      if (s > bs) { bs = s; best = t; }
    }
    if (best >= 0) destinations.push({ id: best * 16 + 15, kind: "shore", tile: best, at: null });
  }

  // routes: each tile on the way has one waypoint, shared by every route through it, so branches join there
  const gradOf = (fn, p, h = 0.15) => [(fn([p[0] + h, p[1]]) - fn([p[0] - h, p[1]])) / (2 * h), (fn([p[0], p[1] + h]) - fn([p[0], p[1] - h])) / (2 * h)];
  const waypoint = new Map();
  const wayOf = (t) => {
    if (waypoint.has(t)) return waypoint.get(t);
    const p = P(t);
    let w;
    if (t === anchor && buildings) w = [p[0] + DOOR[0], p[1] + DOOR[1]];
    else if (F(t).river) w = [p[0], p[1]];            // a minor river is crossed at its tile's middle, square on
    else {
      const g = gradOf(water, p), gl = Math.hypot(g[0], g[1]);
      const j = rot(hash01(t, 331) * 360, 0.03 + hash01(t, 332) * 0.09, 0);
      w = [p[0] + j[0] - (gl > 0.05 ? g[0] / gl * 0.1 : 0), p[1] + j[1] - (gl > 0.05 ? g[1] / gl * 0.1 : 0)];
    }
    waypoint.set(t, w);
    return w;
  };
  const segments = [], segSeen = new Set(), onPath = new Set(), paths = [];
  const addSeg = (a, b, key) => { if (!segSeen.has(key) && dist(a, b) > 0.01) { segSeen.add(key); segments.push([a, b, key]); } };
  /** Where a focal thing stands on its tile: near the middle, a little off it by its own hash. */
  const standOf = (d) => bankOf(d.tile, d.id) || P(d.tile);
  // A destination's tile is passed at the thing's foot, to the side the path comes from, never under it: so a route
  // that ends there ends at the foot, and one that goes on passes by it. Nearer destinations are settled first.
  for (const d of destinations) {
    d.chain = [];
    for (let t = d.tile; t !== undefined; t = parent.get(t)) { d.chain.unshift(t); if (t === anchor) break; }
    d.reached = buildings && d.chain[0] === anchor && d.chain.length > 1;
    if (d.kind === "shore") {
      const wd = map.ring(d.tile).findIndex((n) => n >= 0 && facts.has(n) && F(n).water);
      d.at = [P(d.tile)[0] + DIRS[wd][0] * 0.34, P(d.tile)[1] + DIRS[wd][1] * 0.34];
    } else if (d.kind === "lookout" && seaward(d.tile) && !F(d.tile).river) {
      // At the water's side of its tile, on the edge it looks out over.
      const v = seaward(d.tile);
      d.at = [P(d.tile)[0] + v[0] * 0.27, P(d.tile)[1] + v[1] * 0.27];
    } else d.at = standOf(d);
  }
  for (const d of destinations.filter((x) => x.reached).sort((a, b) => a.chain.length - b.chain.length || a.id - b.id)) {
    const back = wayOf(d.chain[d.chain.length - 2]);
    const ux = d.at[0] - back[0], uy = d.at[1] - back[1], ul = Math.hypot(ux, uy) || 1;
    d.from = [ux / ul, uy / ul];
    d.foot = d.kind === "shore" || d.kind === "village" ? d.at : [d.at[0] - d.from[0] * 0.09, d.at[1] - d.from[1] * 0.09];
    waypoint.set(d.tile, d.foot);
  }
  for (const d of destinations) {
    const chain = d.chain;
    delete d.chain;
    if (!d.reached) { d.from = null; continue; }
    for (let k = 1; k < chain.length; k++) { addSeg(wayOf(chain[k - 1]), wayOf(chain[k]), "e" + edgeId(chain[k - 1], chain[k])); onPath.add(chain[k - 1]); }
    onPath.add(d.tile);
    paths.push({ to: d.id, tiles: chain, line: chain.map(wayOf) });
  }
  const pathDist = (p) => { let v = 9; for (const [a, b] of segments) v = Math.min(v, segDist(p, a, b)); return v; };

  // what is built, each with its setting; rooms nothing grows in; grounds animals keep off
  const built = [];           // [asset, x, y, scale, angle, tint?] in park coordinates
  const rooms = [];           // [x, y, r] closed to plants and animals
  const openings = [];        // [x, y, r] closed to trees only
  const grounds = [];         // [x, y, r] people's ground, closed to animals
  const HOUSE_ROOM = (scale) => 0.03 + 0.13 * scale;
  const put = (asset, x, y, scale, angle, room, tint) => {
    if (asset !== TRAIL && riverDist([x, y]) < 0.14 && !(asset === LODGE && scale > 0.6) && asset !== SIGN && !(asset === SHELTER && tileAt([x, y]) === anchor)) return;
    built.push(tint ? [asset, x, y, scale, deg(angle), tint] : [asset, x, y, scale, deg(angle)]); if (room) rooms.push([x, y, room]);
  };
  if (buildings) {
    const a = P(anchor);
    for (const [asset, x, y, sc, an] of STATION) put(asset, a[0] + x, a[1] + y, sc, an, asset === SIGN ? 0.04 : HOUSE_ROOM(sc));
    grounds.push([a[0] + STATION[0][1], a[1] + STATION[0][2], 0.3]);
    openings.push([a[0], a[1] - 0.1, 0.2]);
  }
  for (const d of destinations) {
    const id = d.id, at = d.at, h = (s) => hash01(id, s);
    const u = d.from || rot(h(90) * 360, 1, 0), side = [-u[1], u[0]];
    const rg = regionOf(d.tile), biome = F(d.tile).biome;
    if (d.kind === "village") {
      // A cabin village gathers round a small green beside the path's end, never in a row: the first cabin stands
      // off the path, and each one after is set off one already built, at its own bearing and distance, turned toward
      // the green.
      const n = h(420) < 0.5 ? 3 : 4, main = h(416) < 0.5 ? 1 : -1, w = wayOf(d.tile);
      const green = [w[0] + side[0] * main * 0.14 + u[0] * 0.05, w[1] + side[1] * main * 0.14 + u[1] * 0.05];
      const xs = [];
      for (let k = 0, tries = 0; xs.length < n && tries < 24; tries++) {
        const from = xs.length ? xs[Math.floor(h(470 + tries) * xs.length)] : green;
        const q = rot(h(443 + tries) * 360, xs.length ? 0.115 + h(427 + tries) * 0.06 : 0.07 + h(427 + tries) * 0.03, 0);
        const x = from[0] + q[0], y = from[1] + q[1];
        if (dist([x, y], green) < 0.06 || dist([x, y], green) > 0.2 || segDist([x, y], [w[0] - u[0] * 0.3, w[1] - u[1] * 0.3], w) < 0.075
          || xs.some((c) => dist(c, [x, y]) < 0.11) || tileAt([x, y]) !== d.tile || riverDist([x, y]) < 0.15) continue;
        const sc = 0.36 + h(433 + k) * 0.08;
        put(CABIN, x, y, sc, Math.atan2(green[1] - y, green[0] - x) * 180 / Math.PI + (h(439 + k) - 0.5) * 60, HOUSE_ROOM(sc));
        xs.push([x, y]); k++;
      }
      if (!xs.length) xs.push(green);
      grounds.push([xs.reduce((m, c) => m + c[0], 0) / xs.length, xs.reduce((m, c) => m + c[1], 0) / xs.length, 0.3]);
    } else if (d.kind === "camp") {
      // The fire just past the path's end, the tents in a crescent beyond it, open to the path, none the same
      // distance out and the gaps between them uneven.
      const fire = [d.foot[0] + u[0] * 0.07, d.foot[1] + u[1] * 0.07];
      put(CAMP_FIRE, fire[0], fire[1], 0.5, h(401) * 360, 0.03);
      const n = h(402) < 0.5 ? 2 : 3, toward = Math.atan2(u[1], u[0]) * 180 / Math.PI;
      let a = toward - (n === 2 ? 30 : 62) + (h(403) - 0.5) * 30;
      for (let k = 0; k < n; k++) {
        const p = rot(a, 0.085 + h(405 + k) * 0.05, 0);
        put(CAMP_TENT, fire[0] + p[0], fire[1] + p[1], 0.7 + h(409 + k) * 0.1, a + 90 + (h(412 + k) - 0.5) * 30, 0.05, "owner");
        a += 46 + h(404 + k) * 34;
      }
      grounds.push([fire[0], fire[1], 0.2]);
      openings.push([fire[0], fire[1], 0.2]);
    } else if (d.kind === "shelter") {
      const sd = h(71) < 0.5 ? 1 : -1, sc = 0.55 * (0.9 + h(74) * 0.2);
      d.at = [d.foot[0] + side[0] * sd * 0.1 + u[0] * 0.04, d.foot[1] + side[1] * sd * 0.1 + u[1] * 0.04];
      put(SHELTER, d.at[0], d.at[1], sc, Math.atan2(-side[1] * sd, -side[0] * sd) * 180 / Math.PI + (h(75) - 0.5) * 20, HOUSE_ROOM(sc));
      grounds.push([d.at[0], d.at[1], 0.16]);
      openings.push([d.at[0], d.at[1], 0.14]);
    } else if (d.kind === "lookout") {
      put(LOOKOUT, at[0], at[1], 0.4, Math.floor(h(15) * 4) * 90, 0.07);
      openings.push([at[0], at[1], 0.15]);
    } else if (d.kind === "cairn" || d.kind === "second") {
      // The monument and its setting: the region's rocks close against one side and trailing off, low scrub at the
      // fringe, trodden earth at the foot. Trees are held back to an opening round it.
      const asset = d.kind === "cairn" ? CAIRN_MOUND : buildings ? OBELISK : DOLMEN;
      put(asset, at[0], at[1], d.kind === "cairn" ? 0.3 + h(85) * 0.04 : buildings ? 0.6 : 0.4, h(86) * 360, d.kind === "cairn" ? 0.05 : 0.07);
      openings.push([at[0], at[1], 0.17]);
      const lee = Math.atan2(side[1], side[0]) * 180 / Math.PI + (h(87) < 0.5 ? 0 : 180) + (h(88) - 0.5) * 40;
      const rocks = 3 + Math.floor(h(89) * 3);
      let out = 0.065;
      for (let k = 0; k < rocks; k++) {
        const p = rot(lee + (h(91 + k) - 0.5) * (30 + k * 22), out, 0);
        put(localRock(id, 97 + k, biome), at[0] + p[0], at[1] + p[1], Math.max(0.16, 0.34 - k * 0.045 + (h(103 + k) - 0.5) * 0.05), h(109 + k) * 360, 0);
        out += 0.022 + h(115 + k) * 0.03 + k * 0.006;
      }
      const scrub = rg && kitOf(biome).under;
      if (scrub) for (let k = 0; k < 1 + (h(121) < 0.5 ? 1 : 0); k++) {
        const p = rot(lee + 150 + k * 70 + (h(123 + k) - 0.5) * 50, 0.13 + h(125 + k) * 0.05, 0);
        put(scrub, at[0] + p[0], at[1] + p[1], 0.45 + h(127 + k) * 0.15, h(129 + k) * 360, 0);
      }
      put(TRAIL, at[0] - u[0] * 0.03, at[1] - u[1] * 0.03, 0.9, Math.atan2(u[1], u[0]) * 180 / Math.PI + 70, 0);
    }
  }
  const people = (p) => {
    let v = 0;
    for (const [x, y, r] of grounds) v = Math.max(v, clamp01(1 - (dist(p, [x, y]) - r + 0.3) / 1.1));
    return v;
  };
  const CORRIDOR = 0.06;
  /** Whether a plant of half-width `pad` at p would stand in a room, an opening (trees only) or a path's corridor. */
  const blocked = (p, pad = 0, tree = true) => {
    for (const [x, y, r] of rooms) if (dist(p, [x, y]) < r + pad) return true;
    if (tree) for (const [x, y, r] of openings) if (dist(p, [x, y]) < r) return true;
    return pathDist(p) < CORRIDOR + pad;
  };
  /** On the founding tile no tree stands between the lodge and the viewer, who looks from the south. */
  const hidesLodge = (p) => { if (!buildings) return false; const a = P(anchor), x = p[0] - a[0], y = p[1] - a[1]; return Math.hypot(x, y) < 0.55 && y < 0.2 && Math.abs(x) < 0.38; };

  // herds: the ground each keeps to is reserved before anything is planted, so the trees leave it open
  const herdScore = (t) => {
    const p = P(t);
    return 1 - 0.6 * wood(p) + 0.5 * water(p) - 1.2 * people(p) - (onPath.has(t) ? 0.9 : pathDist(p) < 0.3 ? 0.5 : 0) - (F(t).river ? 0.2 : 0) + 0.2 * hash01(t, 601);
  };
  const within2 = (t) => { const s = new Set(); for (const n of ringIn(t)) { s.add(n); for (const m of ringIn(n)) s.add(m); } s.delete(t); return s; };
  const herdTiles = tiles.filter((t) => F(t).open && !focal.has(t) && regions.has(t));
  const herdRate = new Map(herdTiles.map((t) => [t, herdScore(t)]));
  // The best ground first, and no two herds on neighboring tiles while the land allows it; where rivers, resources
  // and built things leave too little open ground for that, the park still carries its herds, side by side.
  const herds = [], ranked = herdTiles.slice().sort((a, b) => herdRate.get(b) - herdRate.get(a) || a - b);
  for (const apart of [true, false]) for (const t of ranked) {
    if (herds.length >= budgets.herds) break;
    if (herds.some((h) => h.tile === t || (apart && map.ring(h.tile).includes(t)))) continue;
    herds.push({ id: t * 16 + 1, tile: t, species: F(t).hill ? regionOf(t).hillHerd : regionOf(t).herd, at: P(t) });
  }
  const openSrc = herds.map((h) => h.at);
  const open = (p) => { let v = 0; for (const c of openSrc) v = Math.max(v, clamp01(1 - dist(p, c) / 0.75)); return v; };
  const quiet = new Set(herds.map((h) => h.tile));

  /** How thickly trees stand at p on open land (docs/DESIGN.md). */
  const density = (p, base) => clamp01(base + 0.45 * water(p) + 0.55 * wood(p) - 0.7 * people(p) - 0.8 * open(p));

  // vegetation, in park coordinates: [asset, x, y, scale, angle, radius an animal keeps from it]
  const plants = [];
  const plant = (asset, x, y, scale, angle, cover = 0) => plants.push([asset, x, y, scale, deg(angle), cover]);
  const coverOf = (asset, scale) => (GROVES.has(asset) ? 0.09 * scale : /^BIN_FOL_.*(Trees|Cluster)/.test(asset) ? 0.1 * scale : /Shrub|Groundcover|Grass|Cattail|LilyPad|Rock/.test(asset) ? 0 : 0.055 * scale);

  /**
   * Fill a tile by growth: each new piece is set beside one already standing, at the spacing the ground allows there
   * (`dens` 0..1 thins it), and the fill stops where the ground gives out. Returns [[x, y, d]].
   */
  const grow = (id, origin, r0, dens, inside, max = 48) => {
    const pts = [];
    const add = (p) => {
      const d = dens(p);
      if (d <= 0.08) return false;
      const r = r0 / Math.sqrt(Math.max(0.2, d));
      if (!inside(p, r)) return false;
      for (const q of pts) if (dist(p, q) < Math.min(r, q[3])) return false;
      pts.push([p[0], p[1], d, r]);
      return true;
    };
    if (!add(origin)) for (let k = 0; k < 6 && !pts.length; k++) add([origin[0] + DIRS[k][0] * 0.12, origin[1] + DIRS[k][1] * 0.12]);
    for (let a = 0, n = 0; a < pts.length && pts.length < max; a++) {
      const q = pts[a];
      for (let k = 0; k < 18 && pts.length < max; k++, n++) {
        const p = rot(hash01(id, 1000 + n) * 360, q[3] * (1 + hash01(id, 3000 + n) * 0.9), 0);
        add([q[0] + p[0], q[1] + p[1]]);
      }
    }
    return pts;
  };
  /** How near p lies to an edge of tile t that open land or the park's border is beyond: 0 deep inside, 1 at the edge. */
  const fringe = (t, p, toward) => {
    const c = P(t);
    let v = 0;
    map.ring(t).forEach((n, d) => { if (toward(n)) v = Math.max(v, clamp01(((p[0] - c[0]) * DIRS[d][0] + (p[1] - c[1]) * DIRS[d][1] - 0.18) / 0.3)); });
    return v;
  };
  const inHex = (t, p, margin) => {
    const c = P(t);
    for (const d of DIRS) if ((p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1] > 0.5 - margin) return false;
    return true;
  };

  for (const t of tiles) {
    const f = F(t), c = P(t), kit = kitOf(f.biome);
    // Under the warden's station a wood's own model gives way to the park's trees, which can be kept from hiding the lodge.
    if (f.model && f.walk && !f.native && !(t === anchor && buildings && f.cover)) plants.push([f.model, c[0], c[1], 1, 0, 0]);
    if (f.cover) {
      // Woods and scrub: thick toward the heart of the wood, thinning where open land begins, parted by a corridor.
      // Under the warden's station the wood is the park's own single trees, close set, which can be kept from
      // hiding the lodge where the game's large sets cannot.
      const fill = t === anchor && buildings ? { assets: singles(kit.trees).map((a) => [a, 1]), r0: 0.14, under: kit.under } : fillOf(f);
      const sameCover = (n) => n >= 0 && inPark.has(n) && F(n).cover;
      let ox = 0, oy = 0;
      map.ring(t).forEach((n, d) => { if (sameCover(n)) { ox += DIRS[d][0]; oy += DIRS[d][1]; } });
      const ol = Math.hypot(ox, oy);
      const origin = ol > 0.1 ? [c[0] + ox / ol * 0.2, c[1] + oy / ol * 0.2] : c;
      const rg = regionOf(t), grain = rg ? rg.grain : 0;
      const dens = (p) => {
        if (blocked(p, 0.02) || inRiver(t, p) || (t === anchor && hidesLodge(p))) return 0;
        let d = 1 - 0.25 * fringe(t, p, (n) => n >= 0 && facts.has(n) && F(n).walk && !F(n).cover);
        // Scrub drifts in bands along the region's grain, thicker toward water.
        if (fill.drift) { const [, across] = rot(-grain, p[0], p[1]); d *= clamp01(0.3 + 0.35 * water(p) + 0.6 * (0.5 + 0.5 * Math.cos(across * 3.7 + (rg ? rg.tree : 0)))); }
        return d;
      };
      const pts = grow(t, origin, fill.r0, dens, (p, r) => inHex(t, p, fringe(t, p, sameCover) > 0 ? r * 0.45 : 0.03));
      pts.forEach(([x, y, d], k) => {
        const asset = weighted(fill.assets, hash01(t, 600 + k));
        const single = !/^BIN_FOL_.*(LG|Large|Shrubs)/.test(asset) && !GROVES.has(asset);
        const sc = GROVES.has(asset) ? 0.9 + hash01(t, 800 + k) * 0.3 : single ? 0.75 + hash01(t, 800 + k) * hash01(t, 801 + k) * 1.1 : 0.8 + hash01(t, 800 + k) * 0.5;
        plant(asset, x, y, sc, hash01(t, 1000 + k) * 360, coverOf(asset, sc));
        // An understory bush at the foot of a tree where the wood is thick.
        if (fill.under && d > 0.7 && hash01(t, 1200 + k) < 0.22) {
          const p = rot(hash01(t, 1400 + k) * 360, 0.05 + hash01(t, 1600 + k) * 0.03, 0);
          if (!blocked([x + p[0], y + p[1]], 0, false) && !inRiver(t, [x + p[0], y + p[1]]) && tileAt([x + p[0], y + p[1]]) === t) plant(fill.under, x + p[0], y + p[1], 0.6 + hash01(t, 1800 + k) * 0.4, hash01(t, 2000 + k) * 360);
        }
      });
    } else if (f.wet && !f.model && f.walk && !f.resource) {
      // Wetland the game draws no model for: reeds, thick at the heart of the pond and thinning to its edge.
      const pts = grow(t, c, 0.11, (p) => clamp01(1.15 - dist(p, c) / 0.42), (p) => inHex(t, p, 0.06), 16);
      pts.forEach(([x, y, d], k) => plant(CATTAIL, x, y, 0.9 + d * 0.6 + hash01(t, 180 + k) * 0.3, hash01(t, 200 + k) * 360));
    }
  }

  // stands on open land: one grows only at a local high point of the density field, from its origin along the contour
  const origins = [];
  for (const t of tiles) {
    const f = F(t), rg = regionOf(t);
    if (!f.open || !rg) continue;
    if (!(t === anchor && buildings)) origins.push({ id: t * 16 + 2, at: P(t), tile: t, rg });
    map.ring(t).forEach((n, d) => {
      if (n < 0 || !inPark.has(n)) return;
      const nf = F(n), c = P(t);
      // The edge shared with a neighbor: between two open tiles it is one origin for both; beside woods the origin
      // stands a little inside the open tile, where the wood's fringe falls.
      if (nf.open && regionOf(n) && t < n) origins.push({ id: edgeId(t, n) * 16 + 3, at: [c[0] + DIRS[d][0] * 0.5, c[1] + DIRS[d][1] * 0.5], tile: t, rg, shared: true });
      else if (nf.cover && nf.wooded) origins.push({ id: edgeId(t, n) * 16 + 4, at: [c[0] + DIRS[d][0] * 0.33, c[1] + DIRS[d][1] * 0.33], tile: t, rg });
    });
  }
  // A stand is chosen by the field alone, one on an edge two tiles share a little ahead of one on a single tile; a path or an opening that crosses it parts its trees and moves none.
  for (const o of origins) { o.dens = density(o.at, o.rg.base); o.score = o.dens + 0.22 * hash01(o.id, 5) + (o.shared ? 0.08 : 0); }
  // Stands keep further apart where the land is open: 0.7 of a tile in thick growth, about a tile in meadow.
  const apart = (o) => 0.7 + Math.max(0, 0.6 - o.dens) * 0.9;
  const stands = origins.filter((o) => o.dens >= 0.15 && origins.every((q) => q === o || dist(q.at, o.at) > apart(o) || q.score < o.score || (q.score === o.score && q.id < o.id)));
  // The founding tile's stand is behind the warden's lodge, to the north.
  if (buildings && F(anchor).open && regionOf(anchor)) {
    const a = P(anchor);
    stands.push({ id: anchor * 16 + 5, at: [a[0] - 0.05, a[1] + 0.36], tile: anchor, rg: regionOf(anchor), dens: 0.5, score: 9, heading: 4 });
  }
  const standTrees = [];
  for (const o of stands) {
    const kit = kitOf(o.rg.biome), h = (s) => hash01(o.id, s);
    const kind = kit.trees[o.rg.tree % kit.trees.length], plain = singles(kit.trees);
    const single = GROVES.has(kind) ? plain[o.rg.tree % plain.length] : kind;
    const lead = kit.clusters ? kit.clusters[o.rg.tree % kit.clusters.length] : kind;
    const n = Math.max(1, Math.min(7, Math.round(1 + o.dens * 6 + (h(16) - 0.5) * 1.5)));
    // Along the contour of the density field (so a stand lies along a shore or a wood's edge); on even ground along
    // the region's grain, which every stand of the region shares.
    const g = gradOf((p) => density(p, o.rg.base), o.at), gl = Math.hypot(g[0], g[1]);
    const heading = o.heading != null ? o.heading : gl > 0.08 ? Math.atan2(g[1], g[0]) * 180 / Math.PI + 90 + (h(6) - 0.5) * 30 : o.rg.grain + (h(6) - 0.5) * 40;
    const up = gl > 0.08 ? [g[0] / gl, g[1] / gl] : [0, 0];
    const mine = [];
    let reach = [0, 0];
    for (let k = 0; k < n; k++) {
      // The core first, then outward on alternate ends, each gap wider and each tree further off the line.
      const end = k === 0 ? 0 : k % 2 ? 1 : -1;
      if (k) reach[end > 0 ? 0 : 1] += 0.075 + h(8 + k) * 0.05 + k * 0.012;
      const along = end * reach[end > 0 ? 0 : 1], off = (h(2 + k) - 0.5) * (0.06 + k * 0.03);
      const p = rot(heading, along, off);
      const at = [o.at[0] + p[0] + up[0] * 0.03 * (n - k) / n, o.at[1] + p[1] + up[1] * 0.03 * (n - k) / n];
      const asset = k === 0 ? lead : single;
      const sc = GROVES.has(asset) ? 1 + h(288) * 0.2 : (k === 0 ? 1.35 : 1.25 - k * 0.07) + h(13 + k) * 0.3;
      mine.push([asset, at[0], at[1], sc, h(14 + k) * 360]);
    }
    // At 24 tiles some of a Wilderness Area's stands have their first tree swapped for a giant, never a tree added.
    const giant = !buildings && level >= 3 && h(2950) < OLD_GROWTH_SHARE ? oldGrowth(o.rg.biome) : null;
    if (giant) mine[0] = [giant[0], mine[0][1], mine[0][2], giant[1], mine[0][4]];
    standTrees.push({ o, trees: mine, heading, up });
  }
  const growsAt = (p, pad) => { const t = tileAt(p); return t >= 0 && F(t).open && !inRiver(t, p) && !blocked(p, pad) && !(t === anchor && hidesLodge(p)); };
  const patchSpots = [];     // where a shrub patch could start: the lee of a stand
  for (const s of standTrees) {
    const kept = [];
    for (const [asset, x, y, sc, an] of s.trees) {
      const need = GROVES.has(asset) ? 0.15 : 0.09;
      if (!growsAt([x, y], GROVES.has(asset) ? 0.05 : 0.02)) continue;
      if (kept.some((q) => dist(q, [x, y]) < need)) continue;
      // A tree gives way to one of a stronger stand it would stand in the crown of.
      if (standTrees.some((q) => q !== s && q.o.score > s.o.score && q.trees.some((e) => dist([e[1], e[2]], [x, y]) < need))) continue;
      kept.push([x, y]);
      plant(asset, x, y, sc, an, coverOf(asset, sc));
    }
    if (!kept.length) continue;
    // Tufts of grass on the stand's open side, under and just beyond its outer trees; a Wilderness Area's thicken
    // with its level.
    const kit = kitOf(s.o.rg.biome), h = (k) => hash01(s.o.id, k), lee = s.up[0] || s.up[1] ? [-s.up[0], -s.up[1]] : rot(s.heading + 90, 1, 0);
    const tufts = Math.min(kept.length + 1, 2 + Math.floor(h(300) * 2) + (buildings ? 0 : level));
    for (let k = 0; kit.tuft && k < tufts; k++) {
      const [x, y] = kept[(k * 2) % kept.length], j = rot((h(310 + k) - 0.5) * 110, 0.07 + h(320 + k) * 0.08, 0);
      const p = [x + lee[0] * j[0] - lee[1] * j[1], y + lee[1] * j[0] + lee[0] * j[1]];
      const pt = tileAt(p);
      if (pt >= 0 && F(pt).open && !inRiver(pt, p) && !blocked(p, 0, false) && people(p) < 0.75) plant(kit.tuft, p[0], p[1], 0.8 + h(330 + k) * 0.5, h(340 + k) * 360);
    }
    const tail = kept[kept.length - 1];
    patchSpots.push({ id: s.o.id + 6, at: [tail[0] + lee[0] * 0.1, tail[1] + lee[1] * 0.1], heading: s.heading, rg: s.o.rg, tile: s.o.tile });
  }

  // patches: shrubs and rocks grow from an origin, a dense core of large pieces and a fringe of small ones trailing
  // one way, with gaps. A region carries a few, where the score is best.
  const patch = (id, at, heading, assetOf, n, big, small, ok) => {
    const h = (s) => hash01(id, s);
    // Each piece is set off one already placed, the core close and to any side, the fringe further and mostly
    // down the patch's heading: a clump with a tail, never a line (pieces stepped along the heading read as a hedge,
    // watched 2026-10-05, cap57-plan3 and cap57-plan4).
    const pts = [at];
    for (let k = 0; k < n; k++) {
      const core = k < Math.ceil(n / 3), from = pts[Math.floor(h(40 + k) * pts.length)];
      const p = k === 0 ? [0, 0] : rot(core ? h(2 + k) * 360 : heading + (h(2 + k) - 0.5) * 150, core ? 0.035 + h(32 + k) * 0.025 : 0.06 + h(32 + k) * 0.06, 0);
      const q = [from[0] + p[0], from[1] + p[1]];
      if (pts.slice(1).some((o) => dist(o, q) < 0.03)) continue;
      pts.push(q);
      if (ok(q) && !(k > 1 && h(20 + k) < 0.18)) plant(assetOf(k), q[0], q[1], core ? big[0] + h(14 + k) * big[1] : small[0] + h(14 + k) * small[1], h(26 + k) * 360);
    }
  };
  const byRegion = new Map(), patches = [];
  for (const s of patchSpots) {
    s.score = 0.5 * wood(s.at) + 0.6 * water(s.at) - 0.8 * open(s.at) - (pathDist(s.at) < 0.12 ? 0.6 : 0) - 0.5 * people(s.at) + 0.2 * hash01(s.id, 1);
    const key = regions.get(s.tile);
    byRegion.set(key, [...(byRegion.get(key) || []), s]);
  }
  for (const [key, list] of byRegion) {
    const rg = character.get(key), kit = kitOf(rg.biome), bin = kit.under || kit.rocks;
    if (!bin) continue;
    const want = 1 + Math.floor(rg.open / 5) + (buildings ? 0 : Math.min(level, 2)), taken = [];
    for (const s of list.sort((a, b) => b.score - a.score || a.id - b.id)) {
      if (taken.length >= want) break;
      if (taken.some((q) => dist(q.at, s.at) < 0.9)) continue;
      taken.push(s);
      patches.push({ id: s.id, at: s.at });
      const useRocks = kit.rocks && (!kit.under || rough(s.at) > 0.4);
      patch(s.id, s.at, s.heading, () => (useRocks ? kit.rocks : kit.under), 4 + Math.floor(hash01(s.id, 3) * 4), [0.85, 0.3], [0.45, 0.25],
        (q) => { const t = tileAt(q); return t >= 0 && F(t).open && !inRiver(t, q) && !blocked(q, 0.02, false) && people(q) < 0.8; });
    }
  }
  // Outcrops on the park's roughest hills, toward the mountain where there is one.
  const hills = tiles.filter((t) => F(t).hill && F(t).walk && !focal.has(t) && !F(t).wet && !F(t).resource)
    .map((t) => [t, rough(P(t)) + map.ring(t).filter((n) => n >= 0 && facts.has(n) && F(n).mountain).length * 0.3 + 0.2 * hash01(t, 49)])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const crags = [];
  for (const [t] of hills) {
    if (crags.length >= Math.min(3, 1 + Math.floor(hills.length / 3))) break;
    if (crags.some((o) => map.ring(o).includes(t))) continue;
    crags.push(t);
    patches.push({ id: t * 16 + 7, at: P(t) });
    const g = gradOf(rough, P(t)), gl = Math.hypot(g[0], g[1]);
    const toward = gl > 0.05 ? Math.atan2(g[1], g[0]) * 180 / Math.PI : hash01(t, 50) * 360;
    const o = rot(toward, 0.2, 0), id = t * 16 + 7;
    patch(id, [P(t)[0] + o[0], P(t)[1] + o[1]], toward + 90, (k) => localRock(id, 57 + k, F(t).biome), 3 + Math.floor(hash01(id, 3) * 3), [0.4, 0.14], [0.2, 0.12],
      (q) => tileAt(q) === t && !inRiver(t, q) && !blocked(q, 0.02, false));
  }

  // decals end to end along every route; on pale ground stone waymarks at its bends and forks as well
  const decals = [];
  for (const [a, b, key] of segments) {
    const len = dist(a, b), n = Math.max(1, Math.round(len / 0.2)), id = [...key].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const t = tileAt(b), pale = t >= 0 && PALE_GROUND.has(F(t).biome);
    // Bare earth on grass; on sand and snow, where that hardly shows, the game's gravel strip drawn narrow.
    const m = pale ? Math.max(1, Math.round(len / 0.1)) : n;
    for (let k = 0; k < m; k++) {
      const u = (k + 0.5) / m;
      decals.push([pale ? GRAVEL : TRAIL, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, pale ? 0.5 : 1.1, deg(ang + (hash01(id, 340 + k) - 0.5) * (pale ? 6 : 16))]);
    }
    if (key[0] === "e" && t >= 0 && PALE_GROUND.has(F(t).biome) && !focal.has(t)) {
      const sd = hash01(id, 350) < 0.5 ? 1 : -1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const p = [b[0] + nx * sd * 0.075, b[1] + ny * sd * 0.075];
      if (!rooms.some(([x, y, r]) => dist(p, [x, y]) < r + 0.03)) decals.push([WAYMARK, p[0], p[1], 0.24 + hash01(id, 351) * 0.06, deg(hash01(id, 352) * 360)]);
    }
  }

  // water: lily pads and reeds as patches from the shore, a rowboat where the path meets the water
  const accents = [];
  const shoreDir = (t) => map.ring(t).findIndex((n) => n >= 0 && facts.has(n) && F(n).walk);
  const waterTiles = tiles.filter((t) => F(t).water && !F(t).wonder && !F(t).resource);
  const lakeShores = waterTiles.filter((t) => (F(t).lake || F(t).nav) && shoreDir(t) >= 0).sort((a, b) => hash01(a, 611) - hash01(b, 611));
  const reedy = [];
  for (const t of lakeShores) {
    if (reedy.length >= 1 + Math.floor(lakeShores.length / 3)) break;
    if (reedy.some((o) => map.ring(o).includes(t))) continue;
    reedy.push(t);
    const d = shoreDir(t), c = P(t), r0 = F(t).nav ? 0.1 : 0.3, id = t * 16 + 8;
    const at = [c[0] + DIRS[d][0] * r0, c[1] + DIRS[d][1] * r0], headingAlong = Math.atan2(DIRS[d][1], DIRS[d][0]) * 180 / Math.PI + 90;
    patches.push({ id, at });
    patch(id, at, headingAlong, () => CATTAIL, 3 + Math.floor(hash01(id, 3) * 3), [1.4, 0.5], [1, 0.4], (q) => tileAt(q) === t);
    if (F(t).lake) {
      const [asset, sc] = LILIES[Math.floor(hash01(id, 4) * LILIES.length)];
      const off = [c[0] + DIRS[d][0] * 0.12, c[1] + DIRS[d][1] * 0.12];
      patch(id + 1, off, headingAlong + 40, () => asset, 2 + Math.floor(hash01(id, 5) * 2), [sc * 0.9, sc * 0.3], [sc * 0.6, sc * 0.3], (q) => tileAt(q) === t);
    }
  }
  const landing = destinations.find((d) => d.kind === "shore");
  if (landing) {
    const wt = map.ring(landing.tile).find((n) => n >= 0 && inPark.has(n) && F(n).water);
    if (wt != null) { const c = P(wt), v = [landing.at[0] - c[0], landing.at[1] - c[1]], l = Math.hypot(v[0], v[1]) || 1; accents.push([ROWBOAT, c[0] + v[0] / l * 0.22, c[1] + v[1] / l * 0.22, 0.8, deg(hash01(wt, 10) * 360)]); }
  }

  // wildlife, on the ground that is left open
  const wild = new Map(tiles.map((t) => [t, []]));
  const cover = plants.filter((e) => e[5] > 0).map((e) => [e[1], e[2], e[5]]);
  const stood = [];
  const freeFor = (t, p) => tileAt(p) === t && !F(t).resource && riverDist(p) >= 0.1 && dist(p, P(t)) <= 0.42 && pathDist(p) >= CORRIDOR + 0.02
    && rooms.every(([x, y, r]) => dist(p, [x, y]) >= r + 0.03) && grounds.every(([x, y, r]) => dist(p, [x, y]) >= r)
    && cover.every(([x, y, r]) => dist(p, [x, y]) >= r) && stood.every((q) => dist(p, q) >= 0.1);
  const group = (id, t, species, n, heading) => {
    const c = P(t), h = (s) => hash01(id, 200 + s);
    // The herd's first animal takes the freest of a few spots about the tile's middle; each one after stands off the
    // one before it, loosely along the herd's heading, no two the same step or bearing apart.
    let at = null, bs = -1;
    for (let k = 0; k < 13; k++) {
      const out = k > 6 ? 0.32 : 0.2, p = k ? [c[0] + DIRS[(k - 1) % 6][0] * out, c[1] + DIRS[(k - 1) % 6][1] * out] : c;
      if (!freeFor(t, p)) continue;
      const s = Math.min(0.3, ...cover.map(([x, y, r]) => dist(p, [x, y]) - r), pathDist(p), riverDist(p)) + 0.05 * h(k);
      if (s > bs) { bs = s; at = p; }
    }
    for (let k = 0; at && k < n; k++) {
      stood.push(at);
      wild.get(t).push({ ...animalAt(species, id, k, heading + (h(60 + k) - 0.5) * 50), dx: at[0] - c[0], dy: at[1] - c[1] });
      let next = null;
      for (const turn of [0, 35, -35, 70, -70]) {
        const p = rot(heading + turn + (h(30 + k) - 0.5) * 70, 0.1 + h(10 + k) * 0.08, (h(20 + k) - 0.5) * 0.18), q = [at[0] + p[0], at[1] + p[1]];
        if (freeFor(t, q)) { next = q; break; }
      }
      at = next;
    }
  };
  const towardWater = (p, fallback) => { const g = gradOf(water, p), gl = Math.hypot(g[0], g[1]); return gl > 0.05 ? Math.atan2(g[1], g[0]) * 180 / Math.PI : fallback; };
  const sizeOf = (id, species, extra = 0) => 1 + Math.floor(hash01(id, 202) * hash01(id, 203) * animalAt(species, 0, 0, 0).max) + extra;
  for (const hd of herds) group(hd.id, hd.tile, hd.species, sizeOf(hd.id, hd.species, Math.max(0, level - 1)), towardWater(hd.at, regionOf(hd.tile).grain));
  // A Wilderness Area's rarer animals from 16 tiles: goats on hills, giraffes on open tropical and plains land,
  // turtles at a shore.
  const landFacts = (t) => { const f = F(t), sd = f.water ? shoreDir(t) : -1; return { ...f, coast: f.sea, shore: sd >= 0 ? sd : null }; };
  const rareTiles = tiles.filter((t) => !quiet.has(t) && !focal.has(t) && !F(t).wonder && !F(t).resource && rareFor(landFacts(t)).length && (F(t).walk ? !F(t).cover && !F(t).wet : shoreDir(t) >= 0))
    .sort((a, b) => hash01(a, 620) - hash01(b, 620));
  const rare = [];
  for (const t of rareTiles) {
    if (rare.length >= budgets.rare) break;
    if (rare.some((o) => within2(o).has(t)) || herds.some((hd) => map.ring(hd.tile).includes(t))) continue;
    rare.push(t);
    const species = rareFor(landFacts(t))[0], id = t * 16 + 9;
    if (F(t).walk) group(id, t, species, sizeOf(id, species), regionOf(t) ? regionOf(t).grain : 0);
    else { const d = shoreDir(t); wild.get(t).push({ ...animalAt(species, id, 0, hash01(id, 1) * 360), dx: DIRS[d][0] * 0.3, dy: DIRS[d][1] * 0.3 }); }
  }
  // Climbers on the park's mountains, a wader at a shore, birds over the woods and the water, fish in it.
  const vfx = (t, asset, dx, dy) => wild.get(t).push({ kind: "vfx", asset, dx, dy, z: 0 });
  const spread = (list, n, salt, each) => {
    const got = [];
    for (const t of list.slice().sort((a, b) => hash01(a, salt) - hash01(b, salt))) {
      if (got.length >= n) break;
      if (got.some((o) => within2(o).has(t))) continue;
      got.push(t); each(t, got.length - 1);
    }
    return got;
  };
  spread(tiles.filter((t) => F(t).mountain && !F(t).wonder && !F(t).resource), budgets.climbers, 603, (t, k) => {
    const id = t * 16 + 10, species = k % 2 ? "sheep" : "llama", a = hash01(id, 38) * 360, p = rot(a, 0.08, 0);
    for (let j = 0; j < 1 + Math.floor(hash01(id, 2) * 2); j++) wild.get(t).push({ ...animalAt(species, id, j, a + 90), dx: p[0] + j * 0.08 * Math.cos(a * Math.PI / 180 + 1.6), dy: p[1] + j * 0.08 * Math.sin(a * Math.PI / 180 + 1.6) });
  });
  spread(waterTiles.filter((t) => shoreDir(t) >= 0), 1 + (level >= 2 ? 1 : 0), 610, (t) => {
    const d = shoreDir(t), id = t * 16 + 11;
    wild.get(t).push({ ...animalAt(F(t).sea ? "crab" : "crane", id, 0, hash01(id, 1) * 360), dx: DIRS[d][0] * 0.33, dy: DIRS[d][1] * 0.33 });
  });
  // A region's one bird wheels over its thickest growth away from people; gulls over the sea.
  const airScore = (t) => wood(P(t)) + 0.5 * water(P(t)) - people(P(t)) + 0.2 * hash01(t, 604);
  const airTiles = tiles.filter((t) => F(t).walk && regions.has(t) && !focal.has(t) && !F(t).resource).sort((a, b) => airScore(b) - airScore(a) || a - b);
  const flocks = [];
  for (const t of airTiles) {
    if (flocks.length >= budgets.flocks) break;
    if (flocks.some((o) => within2(o).has(t) || regionOf(o) === regionOf(t))) continue;
    flocks.push(t); vfx(t, regionOf(t).bird, 0, 0.05);
  }
  const sea = waterTiles.filter((t) => F(t).sea), lakes = waterTiles.filter((t) => F(t).lake);
  spread(sea, 1, 605, (t) => vfx(t, FAUNA_POOLS.coastAir[Math.floor(hash01(t, 606) * FAUNA_POOLS.coastAir.length)], 0, 0));
  spread(sea, 1 + (sea.length >= 6 ? 1 : 0), 607, (t, k) => vfx(t, FAUNA_POOLS.schools[k % FAUNA_POOLS.schools.length], 0.05, -0.05));
  spread(sea.filter((t) => shoreDir(t) >= 0), 1, 608, (t) => { const d = shoreDir(t); vfx(t, FAUNA_POOLS.reef[Math.floor(hash01(t, 609) * FAUNA_POOLS.reef.length)], DIRS[d][0] * 0.22, DIRS[d][1] * 0.22); });
  spread(sea.filter((t) => shoreDir(t) < 0), sea.length >= 4 ? 1 : 0, 612, (t) => vfx(t, FAUNA_POOLS.whale, 0, 0));
  spread(lakes, 1 + (lakes.length >= 4 ? 1 : 0), 613, (t) => vfx(t, FAUNA_POOLS.lakeFish, 0.04, 0.02));
  spread(waterTiles.filter((t) => F(t).lake || F(t).nav), 1, 614, (t) => vfx(t, FAUNA_POOLS.leap, -0.05, 0.03));

  // each tile draws what falls inside its hex
  const pieces = new Map(tiles.map((t) => [t, []]));
  const drop = (e) => {
    const t = tileAt([e[1], e[2]]);
    // On a resource's tile only what the game itself would draw there: the tile's feature and the resource.
    if (t < 0 || F(t).native || (F(t).resource && !/^(FEATURE_|RESOURCE_)/.test(e[0]))) return;
    const c = P(t), out = [e[0], e[1] - c[0], e[2] - c[1], e[3], e[4]];
    if (e[5] === "owner") out.push("owner");
    pieces.get(t).push(out);
  };
  for (const e of plants) drop(e.slice(0, 5));
  // A footpath fords a river: its bare earth stops at each bank.
  for (const e of [...decals, ...accents]) { const t = tileAt([e[1], e[2]]); if (t >= 0 && (e[0] === ROWBOAT || (F(t).walk && riverDist([e[1], e[2]]) >= 0.1))) drop(e); }
  for (const e of built) drop(e);

  return { tiles, anchor, level, buildings, pos, facts, regions, character, steps, budgets,
    corner: new Set(tiles.filter((t) => steps.has(t) && steps.get(t) <= 3)),
    destinations, paths, segments, built, keepOut: { rooms, openings, grounds, corridor: CORRIDOR },
    herds, quiet, patches, stands: standTrees.map((s) => ({ id: s.o.id, at: s.o.at, density: s.o.dens })), focal,
    fields: { water, wood, rough, people, open, path: pathDist, river: riverDist, density }, tileAt, pieces, wild };
}

/** A plan as text, for a test or a probe to print. */
export function describePlan(plan) {
  const at = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const lines = [`park of ${plan.tiles.length} tiles, level ${plan.level}, ${plan.buildings ? "National Park" : "Wilderness Area"}`,
    `budgets ${JSON.stringify(plan.budgets)}`];
  for (const [id, c] of plan.character) lines.push(`region ${id}: ${c.biome} ${c.tiles} tiles (${c.open} open), base ${c.base}, herd ${c.herd}, bird ${c.bird.trim()}`);
  for (const d of plan.destinations) lines.push(`destination ${d.kind} on ${d.tile} at ${at(d.at)}${d.from ? "" : " (no path)"}`);
  for (const p of plan.paths) lines.push(`path to ${p.to}: ${p.tiles.join(" > ")}`);
  for (const h of plan.herds) lines.push(`herd ${h.species} on ${h.tile}`);
  for (const t of plan.tiles) lines.push(`tile ${t}: ${plan.pieces.get(t).length} pieces, ${plan.wild.get(t).length} wild`);
  return lines.join("\n");
}
