// np-plan.js - National Parks: the park planned as one place, before any tile is dressed.
//
// parkPlan() reads the whole park once and returns everything the drawing needs: regions and their character, the
// fields a placement is scored against, the destinations and the footpaths that join them, what is built and its
// setting, the vegetation and the wildlife. A tile then draws the pieces that fall inside its hex (plan.pieces,
// plan.wild). docs/DESIGN.md, "The composition", is the model this follows.
//
// The plan is made in steps, in that section's order: the land, regions and fields (here); destinations and routes
// (np-plan-routes.js); people's things and monuments (np-plan-built.js); corridors and decals
// (np-plan-corridors.js); vegetation (np-plan-vegetation.js); wildlife (np-plan-wildlife.js). The art, the geometry
// and the budgets they share are in np-plan-kit.js. Each step reads what the steps before it put on one context
// object and adds its own.
//
// Where a thing stands follows from the park's structure, the terrain, or something already placed. A hash breaks ties
// and adds small variation only, and each is taken from the identity of what it belongs to (a tile, a region, an edge,
// a feature), never from one running stream, so adding a monument or a far tile moves nothing elsewhere. Pure: the map
// is read through `map`, so the whole plan runs without the engine.
"use strict";

import { hash01 } from "./np-core.js";
import { FAUNA_POOLS } from "./np-wildlife.js";
import { ROWBOAT, MODEL_ALONE, DIRS, dist, clamp01, rot, edgeId, segDist, weighted } from "./np-plan-kit.js";
import { chooseDestinations, layRoutes } from "./np-plan-routes.js";
import { buildThings } from "./np-plan-built.js";
import { keepOuts, layDecals } from "./np-plan-corridors.js";
import { startPlanting, growWoods, growStands, growPatches, growCrags, growWaterPlants } from "./np-plan-vegetation.js";
import { reserveHerds, placeAnimals, placeAirAndWater } from "./np-plan-wildlife.js";

export { LODGE, SHELTER, SIGN, CABIN, CAMP_TENT, CAMP_FIRE, LOOKOUT, WAYMARK, CAIRN_MOUND, OBELISK, DOLMEN, TRAIL, KITS,
  GROVES, singles, MODEL_ALONE, oldGrowth, GRAVEL, budgetsFor } from "./np-plan-kit.js";

/** Where each tile sits in park coordinates, and what its land is. */
function placeTiles(ctx) {
  const { tiles, map } = ctx;
  const inPark = new Set(tiles);
  const pos = seatTiles(ctx, inPark);
  const facts = new Map();
  for (const t of pos.keys()) facts.set(t, tileFacts(ctx, t, inPark));
  const F = (t) => facts.get(t);
  const P = (t) => pos.get(t);
  const ringIn = (t) => map.ring(t).filter((n) => n >= 0 && inPark.has(n));
  const tileAt = tileFinder(tiles, P);
  Object.assign(ctx, { inPark, pos, facts, F, P, ringIn, tileAt });
}

/** Positions: walk the rings out from the founding tile; one ring of land outside the park is placed too. */
function seatTiles({ tiles, anchor, map }, inPark) {
  const pos = new Map();
  const seat = (seed, at) => {
    pos.set(seed, at);
    const queue = [seed];
    for (let q = 0; q < queue.length; q++) {
      const t = queue[q], p = pos.get(t);
      if (!inPark.has(t)) continue;
      map.ring(t).forEach((n, d) => {
        if (n >= 0 && !pos.has(n)) { pos.set(n, [p[0] + DIRS[d][0], p[1] + DIRS[d][1]]); queue.push(n); }
      });
    }
  };
  seat(anchor, [0, 0]);
  tiles.forEach((t, k) => { if (!pos.has(t)) seat(t, [1000 * (k + 1), 0]); });
  return pos;
}

/** What a tile's land is, as the plan reads it. */
function tileFacts({ anchor, buildings, map }, t, inPark) {
  const feature = map.feature(t) || "", model = map.model(t) || "";
  const found = map.resource ? map.resource(t) : undefined;
  const f = { biome: map.biome(t), hill: !!map.hill(t), sea: !!map.sea(t), lake: !!map.lake(t), nav: !!map.nav(t),
    river: !!map.river(t), mountain: !!map.mountain(t), wonder: !!map.wonder(t), wooded: !!map.wooded(t),
    wet: !!map.wet(t), feature, model, alone: MODEL_ALONE.has(model), inPark: inPark.has(t),
    cliff: !!(map.cliff && map.cliff(t)),
    // A tile with a resource is left to the game to draw (the founding tile's station apart, which the park cannot
    // do without).
    resource: !!found && !(t === anchor && buildings),
    resourceType: String(found || "") };
  return settleFacts(f, feature);
}

/** What the plan derives from a tile's land, set in this order on its facts. */
function settleFacts(f, feature) {
  // Every resource tile is left to the game (np-core.js isStrewnResource): no district, nothing placed.
  f.native = f.resource;
  f.water = f.sea || f.lake || f.nav;
  f.walk = !f.water && !f.mountain && !f.wonder;
  f.cover = isCover(f, feature);
  f.open = isOpen(f);
  return f;
}
const isCover = (f, feature) => f.walk && !f.resource && !f.alone && !f.wet && (f.wooded || feature === "FEATURE_SAGEBRUSH_STEPPE");
const isOpen = (f) => f.walk && !f.resource && !f.wooded && !f.wet && !f.cover && !f.alone;

/** The park tile whose hex holds p, or -1. */
function tileFinder(tiles, P) {
  return (p) => {
    let best = -1, bd = 0.6;
    for (const t of tiles) { const d = dist(p, P(t)); if (d < bd) { bd = d; best = t; } }
    if (best < 0) return -1;
    // The nearest park tile holds p only if p is inside its hex; past an edge it is land outside the park.
    const c = P(best);
    for (const d of DIRS) if ((p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1] > 0.5 + 1e-9) return -1;
    return best;
  };
}

/** Regions, one biome in one connected piece, and each region's character. */
function findRegions(ctx) {
  const { tiles, F } = ctx;
  // regions: one biome in one connected piece, named by the first tile the park took there
  const regions = new Map(), character = new Map();
  for (const t of tiles) {
    if (regions.has(t) || !F(t).walk) continue;
    character.set(t, regionCharacter(F, t, floodRegion(ctx, t, regions)));
  }
  const regionOf = (t) => (regions.has(t) ? character.get(regions.get(t)) : null);
  Object.assign(ctx, { regions, character, regionOf });
}

/** The connected land of t's biome that no region holds yet, named by t; returns its tiles. */
function floodRegion({ F, ringIn }, t, regions) {
  const queue = [t];
  regions.set(t, t);
  for (let q = 0; q < queue.length; q++) for (const n of ringIn(queue[q])) {
    if (!regions.has(n) && F(n).walk && F(n).biome === F(t).biome) { regions.set(n, t); queue.push(n); }
  }
  return queue;
}

function regionCharacter(F, t, queue) {
  const d = hash01(t, 812), fauna = FAUNA_POOLS.biomes[F(t).biome] || FAUNA_POOLS.biomes.default;
  return { biome: F(t).biome, tree: Math.floor(hash01(t, 811) * 97),
    base: d < 0.3 ? 0.3 : d < 0.75 ? 0.45 : 0.62, grain: hash01(t, 816) * 180,
    herd: weighted(fauna.land, hash01(t, 813)), hillHerd: weighted(fauna.hill, hash01(t, 814)),
    bird: fauna.air[Math.floor(hash01(t, 815) * fauna.air.length)], tiles: queue.length,
    open: queue.filter((x) => F(x).open).length };
}

/** Walking distance from the lodge, and the least-cost way to every tile (the footpaths follow it). */
function walkWays(ctx) {
  const { anchor, F, ringIn } = ctx;
  const steps = new Map([[anchor, 0]]);
  for (let q = 0, queue = [anchor]; q < queue.length; q++) for (const n of ringIn(queue[q])) {
    if (F(n).walk && !steps.has(n)) { steps.set(n, steps.get(queue[q]) + 1); queue.push(n); }
  }
  const { cost, parent } = leastCost(ctx);
  Object.assign(ctx, { steps, cost, parent });
}

function leastCost({ anchor, F, ringIn }) {
  const pathable = (t) => F(t).walk && !F(t).wet;
  const cost = new Map([[anchor, 0]]), parent = new Map();
  for (const done = new Set(); ;) {
    const t = cheapest(cost, done);
    if (t < 0) break;
    done.add(t);
    for (const n of ringIn(t)) {
      if (done.has(n) || !pathable(n)) continue;
      const c = stepCost(cost.get(t), F(n), t, n);
      if (!cost.has(n) || c < cost.get(n)) { cost.set(n, c); parent.set(n, t); }
    }
  }
  return { cost, parent };
}

/** The tile not yet done with the least cost so far, the first reached among equals; -1 when none is left. */
function cheapest(cost, done) {
  let t = -1;
  for (const [k, c] of cost) if (!done.has(k) && (t < 0 || c < cost.get(t))) t = k;
  return t;
}

/** The cost of a way that has come `from` (its cost so far) through t onto n: a step, more on hills, through cover,
 *  across a river or over a resource, and a hash for ties. */
function stepCost(from, f, t, n) {
  return from + 1 + (f.hill ? 0.5 : 0) + (f.cover ? 0.35 : 0) + (f.river ? 0.8 : 0)
    + (f.resource ? 2.5 : 0) + hash01(edgeId(t, n), 320) * 0.1;
}

/** The water, wood and rough fields, a minor river's course, and the driest spot on a tile to build on. */
function landFields(ctx) {
  const { map, facts, F } = ctx;
  const { water, wood, rough } = fieldsOf(ctx);
  const nearWater = (t) => map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n).water);
  const beside = (t, what) => map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n)[what]);
  /** The way from tile t's middle toward the open water beside it, as a unit vector, or null. */
  const seaward = (t) => {
    let x = 0, y = 0;
    map.ring(t).forEach((n, d) => { if (n >= 0 && facts.has(n) && F(n).water) { x += DIRS[d][0]; y += DIRS[d][1]; } });
    const l = Math.hypot(x, y);
    return l > 0.1 ? [x / l, y / l] : null;
  };
  const riverSeg = riverCourse(ctx);
  const riverDist = (p) => { let v = 9; for (const [a, b] of riverSeg) v = Math.min(v, segDist(p, a, b)); return v; };
  const inRiver = (_t, p) => riverDist(p) < 0.12;
  const bankOf = bankFinder(ctx, riverDist);
  Object.assign(ctx, { water, wood, rough, nearWater, beside, seaward, riverDist, inRiver, bankOf });
}

/** Water, as the land feels it (sea, lakes and navigable rivers in or beside the park, minor rivers, wetland); wood;
 *  and rough ground. Each is 0..1 at a point. */
function fieldsOf({ tiles, facts, F, P }) {
  const waterSrc = [];
  for (const [t, f] of facts) {
    if (f.water) waterSrc.push([P(t), 0.5, 1.3, 1]);
    else if (f.wet) waterSrc.push([P(t), 0.5, 1, 1]);
    else if (f.river && f.inPark) waterSrc.push([P(t), 0, 0.9, 0.7]);
  }
  const water = (p) => {
    let v = 0;
    for (const [c, r, fall, w] of waterSrc) v = Math.max(v, w * clamp01(1 - (dist(p, c) - r) / fall));
    return v;
  };
  const woodSrc = tiles.filter((t) => F(t).cover && F(t).wooded).map(P);
  const wood = (p) => {
    let v = 0;
    for (const c of woodSrc) v = Math.max(v, clamp01(1 - (dist(p, c) - 0.5) / 0.8));
    return v;
  };
  const roughSrc = [...facts].filter(([, f]) => f.hill || f.mountain)
    .map(([t, f]) => [P(t), f.mountain ? 0.5 : 0, f.mountain ? 0.6 : 0.8]);
  const rough = (p) => {
    let v = 0;
    for (const [c, r, fall] of roughSrc) v = Math.max(v, clamp01(1 - (dist(p, c) - r) / fall));
    return v;
  };
  return { water, wood, rough };
}

/**
 * A minor river runs from its tile's middle to the middle of each edge it shares with more river or with open water.
 * Things stand beside that course, never on it (owner's rule, 2026-10-05): plants and built pieces keep off it,
 * animals graze its banks, and a footpath's bare earth stops at each bank.
 */
function riverCourse({ tiles, map, facts, F, P }) {
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
  return riverSeg;
}

/** The driest spot on tile t for something built: its middle, or on a river's tile the bank furthest from the water. */
function bankFinder({ F, P }, riverDist) {
  return (t, id) => {
    const c = P(t);
    if (!F(t).river) {
      const j = rot(hash01(id, 83) * 360, 0.02 + hash01(id, 84) * 0.05, 0);
      return [c[0] + j[0], c[1] + j[1]];
    }
    let best = null, bd = 0.18;
    DIRS.forEach((d, k) => {
      const p = [c[0] + d[0] * 0.27, c[1] + d[1] * 0.27], v = riverDist(p) + 0.02 * hash01(id, 60 + k);
      if (v > bd) { bd = v; best = p; }
    });
    return best;
  };
}

/** The plan's steps in the order "The composition" gives them. The herds' ground is reserved before anything
 *  is planted, so the trees leave it open. */
const STEPS = [placeTiles, findRegions, walkWays, landFields, chooseDestinations, layRoutes, buildThings, keepOuts,
  layDecals, reserveHerds, startPlanting, growWoods, growStands, growPatches, growCrags, growWaterPlants, placeAnimals,
  placeAirAndWater];

/**
 * Plan a park. `tiles` in the order the park took them (the founding tile first), `map` the land:
 * { ring(t), biome(t), hill(t), sea(t), lake(t), nav(t), river(t), mountain(t), wonder(t), wooded(t), wet(t),
 * feature(t), model(t), resource(t), cliff(t) }. Returns the plan (docs/DESIGN.md lists its fields).
 */
export function parkPlan(tiles, anchor, { level = 0, buildings = true, map }) {
  const ctx = { tiles, anchor, level, buildings, map };
  for (const step of STEPS) step(ctx);
  return pieceTiles(ctx);
}

/** What falls inside each tile's hex, and the finished plan. */
function pieceTiles(ctx) {
  const { tiles, anchor, level, buildings, pos, facts, F, P, tileAt, regions, character, steps, water, wood, rough,
    riverDist, budgets, focal, destinations, segments, paths, pathDist, built, rooms, openings, grounds, people,
    CORRIDOR, herds, open, quiet, density, plants, standTrees, patches, decals, accents, wild } = ctx;
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
  for (const e of [...decals, ...accents]) {
    const t = tileAt([e[1], e[2]]);
    if (t >= 0 && (e[0] === ROWBOAT || (F(t).walk && riverDist([e[1], e[2]]) >= 0.1))) drop(e);
  }
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
