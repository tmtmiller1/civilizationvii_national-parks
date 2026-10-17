// np-plan-wildlife.js - National Parks: where the park plan's animals, birds and fish go.
//
// docs/DESIGN.md, "Order of placement", step 8; the species are in np-wildlife.js. The herds' ground is reserved
// before anything is planted (reserveHerds), and the animals are placed once the planting is done. Reads the
// plan's context and adds to it (np-plan.js parkPlan).
"use strict";

import { hash01 } from "./np-core.js";
import { FAUNA_POOLS, rareFor, animalAt } from "./np-wildlife.js";
import { DIRS, dist, clamp01, rot, coldWater } from "./np-plan-kit.js";

/** Where each herd keeps to, reserved before anything is planted so the trees leave it open. */
export function reserveHerds(ctx) {
  const { tiles, map, F, P, ringIn, regions, regionOf, water, wood, budgets, focal, onPath, pathDist, people } = ctx;
  // herds: the ground each keeps to is reserved before anything is planted, so the trees leave it open
  const herdScore = (t) => {
    const p = P(t);
    return 1 - 0.6 * wood(p) + 0.5 * water(p) - 1.2 * people(p) - (onPath.has(t) ? 0.9 : pathDist(p) < 0.3 ? 0.5 : 0)
      - (F(t).river ? 0.2 : 0) + 0.2 * hash01(t, 601);
  };
  const within2 = (t) => {
    const s = new Set();
    for (const n of ringIn(t)) { s.add(n); for (const m of ringIn(n)) s.add(m); }
    s.delete(t);
    return s;
  };
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
  const open = (p) => {
    let v = 0;
    for (const c of openSrc) v = Math.max(v, clamp01(1 - dist(p, c) / 0.75));
    return v;
  };
  const quiet = new Set(herds.map((h) => h.tile));
  Object.assign(ctx, { within2, herds, open, quiet });
}

/** The herds' animals and a Wilderness Area's rarer ones, on the ground the earlier steps left open. */
export function placeAnimals(ctx) {
  const { tiles, level, regionOf, water, gradOf, herds } = ctx;
  // wildlife, on the ground that is left open
  const wild = new Map(tiles.map((t) => [t, []]));
  const { group, sizeOf } = herdPlacer(ctx, wild);
  const towardWater = (p, fallback) => {
    const g = gradOf(water, p), gl = Math.hypot(g[0], g[1]);
    return gl > 0.05 ? Math.atan2(g[1], g[0]) * 180 / Math.PI : fallback;
  };
  for (const hd of herds) group(hd.id, hd.tile, hd.species, sizeOf(hd.id, hd.species, Math.max(0, level - 1)),
    towardWater(hd.at, regionOf(hd.tile).grain));
  placeRare(ctx, wild, { group, sizeOf });
  Object.assign(ctx, { wild });
}

/** How a herd is set down: `group` places one, each animal on ground nothing else holds; `sizeOf` is how many. */
function herdPlacer(ctx, wild) {
  const { F, P, tileAt, riverDist, pathDist, rooms, grounds, CORRIDOR, plants } = ctx;
  const cover = plants.filter((e) => e[5] > 0).map((e) => [e[1], e[2], e[5]]);
  const stood = [];
  const freeFor = (t, p) => tileAt(p) === t && !F(t).resource && riverDist(p) >= 0.1 && dist(p, P(t)) <= 0.42
    && pathDist(p) >= CORRIDOR + 0.02
    && rooms.every(([x, y, r]) => dist(p, [x, y]) >= r + 0.03) && grounds.every(([x, y, r]) => dist(p, [x, y]) >= r)
    && cover.every(([x, y, r]) => dist(p, [x, y]) >= r) && stood.every((q) => dist(p, q) >= 0.1);
  const group = (id, t, species, n, heading) => {
    const c = P(t), h = (s) => hash01(id, 200 + s);
    let at = herdStart(t, c, h, { freeFor, cover, pathDist, riverDist });
    for (let k = 0; at && k < n; k++) {
      stood.push(at);
      wild.get(t).push({ ...animalAt(species, id, k, heading + (h(60 + k) - 0.5) * 50), dx: at[0] - c[0],
        dy: at[1] - c[1] });
      at = nextAnimal(freeFor, t, at, { heading, h, k });
    }
  };
  const sizeOf = (id, species, extra = 0) =>
    1 + Math.floor(hash01(id, 202) * hash01(id, 203) * animalAt(species, 0, 0, 0).max) + extra;
  return { group, sizeOf };
}

/** The herd's first animal takes the freest of a few spots about the tile's middle. */
function herdStart(t, c, h, { freeFor, cover, pathDist, riverDist }) {
  let at = null, bs = -1;
  for (let k = 0; k < 13; k++) {
    const out = k > 6 ? 0.32 : 0.2,
      p = k ? [c[0] + DIRS[(k - 1) % 6][0] * out, c[1] + DIRS[(k - 1) % 6][1] * out] : c;
    if (!freeFor(t, p)) continue;
    const s = Math.min(0.3, ...cover.map(([x, y, r]) => dist(p, [x, y]) - r), pathDist(p), riverDist(p))
      + 0.05 * h(k);
    if (s > bs) { bs = s; at = p; }
  }
  return at;
}

/** Each animal after the first stands off the one before it, loosely along the herd's heading, no two the same step
 *  or bearing apart; null when there's no room. */
function nextAnimal(freeFor, t, at, { heading, h, k }) {
  for (const turn of [0, 35, -35, 70, -70]) {
    const p = rot(heading + turn + (h(30 + k) - 0.5) * 70, 0.1 + h(10 + k) * 0.08, (h(20 + k) - 0.5) * 0.18),
      q = [at[0] + p[0], at[1] + p[1]];
    if (freeFor(t, q)) return q;
  }
  return null;
}

/** A Wilderness Area's rarer animals from 16 tiles: goats on hills, giraffes on open tropical and plains land, turtles
 *  at a shore. */
function placeRare(ctx, wild, { group, sizeOf }) {
  const { tiles, map, F, regionOf, budgets, focal, within2, herds, quiet, shoreDir } = ctx;
  const landFacts = (t) => {
    const f = F(t), sd = f.water ? shoreDir(t) : -1;
    return { ...f, coast: f.sea, shore: sd >= 0 ? sd : null };
  };
  const rareTiles = tiles.filter((t) => !quiet.has(t) && !focal.has(t) && !F(t).wonder && !F(t).resource
    && rareFor(landFacts(t)).length && (F(t).walk ? !F(t).cover && !F(t).wet : shoreDir(t) >= 0))
    .sort((a, b) => hash01(a, 620) - hash01(b, 620));
  const rare = [];
  for (const t of rareTiles) {
    if (rare.length >= budgets.rare) break;
    if (rare.some((o) => within2(o).has(t)) || herds.some((hd) => map.ring(hd.tile).includes(t))) continue;
    rare.push(t);
    const species = rareFor(landFacts(t))[0], id = t * 16 + 9;
    if (F(t).walk) group(id, t, species, sizeOf(id, species), regionOf(t) ? regionOf(t).grain : 0);
    else {
      const d = shoreDir(t);
      wild.get(t).push({ ...animalAt(species, id, 0, hash01(id, 1) * 360), dx: DIRS[d][0] * 0.3,
        dy: DIRS[d][1] * 0.3 });
    }
  }
}

/** One whale out at sea from four sea tiles; a sea that is mostly cold has one from two tiles, and two from six. */
function whalesFor(sea, cold) {
  if (sea.filter(cold).length * 2 < sea.length || !sea.length) return sea.length >= 4 ? 1 : 0;
  return (sea.length >= 2 ? 1 : 0) + (sea.length >= 6 ? 1 : 0);
}

/** Two or three crabs at the waterline of a cold sea shore, where a warm one has its reef. */
function crabs(ctx, t) {
  const d = ctx.shoreDir(t), id = t * 16 + 13, n = 2 + Math.floor(hash01(id, 2) * 2);
  for (let j = 0; j < n; j++) {
    const p = rot(hash01(id, 20 + j) * 360, 0.03 + hash01(id, 30 + j) * 0.05, 0);
    ctx.wild.get(t).push({ ...animalAt("crab", id, j, hash01(id, 40 + j) * 360), dx: DIRS[d][0] * 0.26 + p[0],
      dy: DIRS[d][1] * 0.26 + p[1] });
  }
}

/** Climbers, a wader, each region's bird overhead, and life in the sea and the lakes. */
export function placeAirAndWater(ctx) {
  const { within2, wild } = ctx;
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
  placeClimbersAndWader(ctx, spread);
  placeFlocks(ctx, vfx);
  placeWaterLife(ctx, { vfx, spread });
}

function placeClimbersAndWader(ctx, spread) {
  const { tiles, level, F, budgets, shoreDir, waterTiles, wild } = ctx;
  spread(tiles.filter((t) => F(t).mountain && !F(t).wonder && !F(t).resource), budgets.climbers, 603, (t, k) => {
    const id = t * 16 + 10, species = k % 2 ? "sheep" : "llama", a = hash01(id, 38) * 360, p = rot(a, 0.08, 0);
    for (let j = 0; j < 1 + Math.floor(hash01(id, 2) * 2); j++)
      wild.get(t).push({ ...animalAt(species, id, j, a + 90), dx: p[0] + j * 0.08 * Math.cos(a * Math.PI / 180 + 1.6),
        dy: p[1] + j * 0.08 * Math.sin(a * Math.PI / 180 + 1.6) });
  });
  spread(waterTiles.filter((t) => shoreDir(t) >= 0), 1 + (level >= 2 ? 1 : 0), 610, (t) => {
    const d = shoreDir(t), id = t * 16 + 11;
    wild.get(t).push({ ...animalAt(F(t).sea ? "crab" : "crane", id, 0, hash01(id, 1) * 360), dx: DIRS[d][0] * 0.33, dy: DIRS[d][1] * 0.33 });
  });
}

/** A region's one bird wheels over its thickest growth away from people. */
function placeFlocks(ctx, vfx) {
  const { tiles, F, P, regions, regionOf, water, wood, budgets, focal, people, within2 } = ctx;
  const airScore = (t) => wood(P(t)) + 0.5 * water(P(t)) - people(P(t)) + 0.2 * hash01(t, 604);
  const airTiles = tiles.filter((t) => F(t).walk && regions.has(t) && !focal.has(t) && !F(t).resource)
    .sort((a, b) => airScore(b) - airScore(a) || a - b);
  const flocks = [];
  for (const t of airTiles) {
    if (flocks.length >= budgets.flocks) break;
    if (flocks.some((o) => within2(o).has(t) || regionOf(o) === regionOf(t))) continue;
    flocks.push(t); vfx(t, regionOf(t).bird, 0, 0.05);
  }
}

/** Gulls over the sea, schools in it, a reef by a warm shore and crabs on a cold one, whales out from it (more in a
 *  cold sea); fish and a leaper in the lakes. */
function placeWaterLife(ctx, { vfx, spread }) {
  const { map, F, shoreDir, waterTiles } = ctx;
  const sea = waterTiles.filter((t) => F(t).sea), lakes = waterTiles.filter((t) => F(t).lake);
  const cold = (t) => coldWater(map, t);
  spread(sea, 1, 605, (t) => vfx(t, FAUNA_POOLS.coastAir[Math.floor(hash01(t, 606) * FAUNA_POOLS.coastAir.length)],
    0, 0));
  spread(sea, 1 + (sea.length >= 6 ? 1 : 0), 607,
    (t, k) => vfx(t, FAUNA_POOLS.schools[k % FAUNA_POOLS.schools.length], 0.05, -0.05));
  spread(sea.filter((t) => shoreDir(t) >= 0 && !cold(t)), 1, 608, (t) => {
    const d = shoreDir(t);
    vfx(t, FAUNA_POOLS.reef[Math.floor(hash01(t, 609) * FAUNA_POOLS.reef.length)],
      DIRS[d][0] * 0.22, DIRS[d][1] * 0.22);
  });
  spread(sea.filter((t) => shoreDir(t) >= 0 && cold(t)), 1 + (sea.length >= 6 ? 1 : 0), 615, (t) => crabs(ctx, t));
  spread(sea.filter((t) => shoreDir(t) < 0), whalesFor(sea, cold), 612, (t) => vfx(t, FAUNA_POOLS.whale, 0, 0));
  spread(lakes, 1 + (lakes.length >= 4 ? 1 : 0), 613, (t) => vfx(t, FAUNA_POOLS.lakeFish, 0.04, 0.02));
  spread(waterTiles.filter((t) => F(t).lake || F(t).nav), 1, 614, (t) => vfx(t, FAUNA_POOLS.leap, -0.05, 0.03));
}
