// np-plan-vegetation.js - National Parks: the park plan's woods, stands, patches, outcrops and water plants.
//
// docs/DESIGN.md, "Order of placement", step 7. Reads the plan's context and adds to it (np-plan.js parkPlan).
"use strict";

import { hash01 } from "./np-core.js";
import { LILIES, CATTAIL, ROWBOAT, SPONGES, coldWater, kitOf, GROVES, singles, fillOf, oldGrowth, OLD_GROWTH_SHARE,
  localRock, DIRS, dist, clamp01, rot, deg, edgeId, weighted } from "./np-plan-kit.js";

/** The tree density field, and the planting tools the vegetation steps share. */
export function startPlanting(ctx) {
  const { map, P, water, wood, people, open } = ctx;
  /** How thickly trees stand at p on open land (docs/DESIGN.md). */
  const density = (p, base) => clamp01(base + 0.45 * water(p) + 0.55 * wood(p) - 0.7 * people(p) - 0.8 * open(p));

  // vegetation, in park coordinates: [asset, x, y, scale, angle, radius an animal keeps from it]
  const plants = [];
  const plant = (asset, [x, y], scale, angle, cover = 0) => plants.push([asset, x, y, scale, deg(angle), cover]);
  const coverOf = (asset, scale) => (GROVES.has(asset) ? 0.09 * scale : /^BIN_FOL_.*(Trees|Cluster)/.test(asset) ? 0.1 * scale : /Shrub|Groundcover|Grass|Cattail|LilyPad|Rock/.test(asset) ? 0 : 0.055 * scale);

  /**
   * Fill a tile by growth: each new piece is set beside one already standing, at the spacing the ground allows there
   * (`dens` 0..1 thins it), and the fill stops where the ground gives out. Returns [[x, y, d]].
   */
  const grow = (id, origin, { r0, dens, inside, max = 48 }) => {
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
    if (!add(origin)) for (let k = 0; k < 6 && !pts.length; k++)
      add([origin[0] + DIRS[k][0] * 0.12, origin[1] + DIRS[k][1] * 0.12]);
    for (let a = 0, n = 0; a < pts.length && pts.length < max; a++) {
      const q = pts[a];
      for (let k = 0; k < 18 && pts.length < max; k++, n++) {
        const p = rot(hash01(id, 1000 + n) * 360, q[3] * (1 + hash01(id, 3000 + n) * 0.9), 0);
        add([q[0] + p[0], q[1] + p[1]]);
      }
    }
    return pts;
  };
  /** How near p lies to an edge of tile t that open land or the park's border is beyond: 0 deep inside, 1 at the
   *  edge. */
  const fringe = (t, p, toward) => {
    const c = P(t);
    let v = 0;
    map.ring(t).forEach((n, d) => {
      if (toward(n)) v = Math.max(v, clamp01(((p[0] - c[0]) * DIRS[d][0] + (p[1] - c[1]) * DIRS[d][1] - 0.18) / 0.3));
    });
    return v;
  };
  const inHex = (t, p, margin) => {
    const c = P(t);
    for (const d of DIRS) if ((p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1] > 0.5 - margin) return false;
    return true;
  };
  Object.assign(ctx, { density, plants, plant, coverOf, grow, fringe, inHex });
}

/** Woods and scrub on wooded tiles; reeds on wetland the game draws no model for. */
export function growWoods(ctx) {
  for (const t of ctx.tiles) {
    const f = ctx.F(t), c = ctx.P(t), kit = kitOf(f.biome);
    if (drawsOwnModel(ctx, t, f)) ctx.plants.push([f.model, c[0], c[1], 1, 0, 0]);
    if (f.cover) plantWood(ctx, t, { f, c, kit });
    else if (f.wet && !f.model && f.walk && !f.resource) plantReeds(ctx, t, c);
  }
}

/** A wood's own model, except under the warden's station, where it gives way to the park's trees, which can be kept
 *  from hiding the lodge. */
function drawsOwnModel(ctx, t, f) {
  return f.model && f.walk && !f.native && !(t === ctx.anchor && ctx.buildings && f.cover);
}

/**
 * Woods and scrub: thick toward the heart of the wood, thinning where open land begins, parted by a corridor. Under
 * the warden's station the wood is the park's own single trees, close set, which can be kept from hiding the lodge
 * where the game's large sets cannot.
 */
function plantWood(ctx, t, { f, c, kit }) {
  const { anchor, buildings, map, inPark, F, fringe, inHex, grow } = ctx;
  const fill = t === anchor && buildings
    ? { assets: singles(kit.trees).map((a) => [a, 1]), r0: 0.14, under: kit.under } : fillOf(f);
  const sameCover = (n) => n >= 0 && inPark.has(n) && F(n).cover;
  let ox = 0, oy = 0;
  map.ring(t).forEach((n, d) => { if (sameCover(n)) { ox += DIRS[d][0]; oy += DIRS[d][1]; } });
  const ol = Math.hypot(ox, oy);
  const origin = ol > 0.1 ? [c[0] + ox / ol * 0.2, c[1] + oy / ol * 0.2] : c;
  const dens = woodDensity(ctx, t, fill);
  const pts = grow(t, origin, { r0: fill.r0, dens,
    inside: (p, r) => inHex(t, p, fringe(t, p, sameCover) > 0 ? r * 0.45 : 0.03) });
  pts.forEach((pt, k) => plantWoodPiece(ctx, t, fill, pt, k));
}

/** How thickly a wood grows at p: thinning toward open land; scrub drifts in bands along the region's grain,
 *  thicker toward water. */
function woodDensity(ctx, t, fill) {
  const { anchor, facts, F, regionOf, water, inRiver, blocked, hidesLodge, fringe } = ctx;
  const rg = regionOf(t), grain = rg ? rg.grain : 0;
  return (p) => {
    if (blocked(p, 0.02) || inRiver(t, p) || (t === anchor && hidesLodge(p))) return 0;
    let d = 1 - 0.25 * fringe(t, p, (n) => n >= 0 && facts.has(n) && F(n).walk && !F(n).cover);
    if (fill.drift) {
      const [, across] = rot(-grain, p[0], p[1]);
      d *= clamp01(0.3 + 0.35 * water(p) + 0.6 * (0.5 + 0.5 * Math.cos(across * 3.7 + (rg ? rg.tree : 0))));
    }
    return d;
  };
}

function plantWoodPiece(ctx, t, fill, [x, y, d], k) {
  const asset = weighted(fill.assets, hash01(t, 600 + k));
  const single = !/^BIN_FOL_.*(LG|Large|Shrubs)/.test(asset) && !GROVES.has(asset);
  const sc = GROVES.has(asset) ? 0.9 + hash01(t, 800 + k) * 0.3
    : single ? 0.75 + hash01(t, 800 + k) * hash01(t, 801 + k) * 1.1 : 0.8 + hash01(t, 800 + k) * 0.5;
  ctx.plant(asset, [x, y], sc, hash01(t, 1000 + k) * 360, ctx.coverOf(asset, sc));
  // An understory bush at the foot of a tree where the wood is thick.
  if (fill.under && d > 0.7 && hash01(t, 1200 + k) < 0.22) {
    const p = rot(hash01(t, 1400 + k) * 360, 0.05 + hash01(t, 1600 + k) * 0.03, 0);
    const q = [x + p[0], y + p[1]];
    if (!ctx.blocked(q, 0, false) && !ctx.inRiver(t, q) && ctx.tileAt(q) === t)
      ctx.plant(fill.under, q, 0.6 + hash01(t, 1800 + k) * 0.4, hash01(t, 2000 + k) * 360);
  }
}

/** Wetland the game draws no model for: reeds, thick at the heart of the pond and thinning to its edge. */
function plantReeds(ctx, t, c) {
  const pts = ctx.grow(t, c, { r0: 0.11, dens: (p) => clamp01(1.15 - dist(p, c) / 0.42),
    inside: (p) => ctx.inHex(t, p, 0.06), max: 16 });
  pts.forEach(([x, y, d], k) => ctx.plant(CATTAIL, [x, y], 0.9 + d * 0.6 + hash01(t, 180 + k) * 0.3,
    hash01(t, 200 + k) * 360));
}

/** Stands of trees on open land, with tufts of grass on their open side. */
export function growStands(ctx) {
  const { anchor, F, tileAt, inRiver, blocked, hidesLodge } = ctx;
  const standTrees = chooseStands(ctx, standOrigins(ctx)).map((o) => layStand(ctx, o));
  const growsAt = (p, pad) => {
    const t = tileAt(p);
    return t >= 0 && F(t).open && !inRiver(t, p) && !blocked(p, pad) && !(t === anchor && hidesLodge(p));
  };
  const patchSpots = [];     // where a shrub patch could start: the lee of a stand
  for (const s of standTrees) {
    const kept = plantStand(ctx, s, standTrees, growsAt);
    if (!kept.length) continue;
    const lee = plantTufts(ctx, s, kept);
    const tail = kept[kept.length - 1];
    patchSpots.push({ id: s.o.id + 6, at: [tail[0] + lee[0] * 0.1, tail[1] + lee[1] * 0.1], heading: s.heading,
      rg: s.o.rg, tile: s.o.tile });
  }
  Object.assign(ctx, { standTrees, patchSpots });
}

/** Where a stand may grow from on open land: a tile's middle (not the founding tile's under the station), the edge
 *  two open tiles share (one origin for both), and just inside an open tile beside woods, where the wood's fringe
 *  falls. */
function standOrigins(ctx) {
  const { tiles, anchor, buildings, F, P, regionOf } = ctx;
  const origins = [];
  for (const t of tiles) {
    const f = F(t), rg = regionOf(t);
    if (!f.open || !rg) continue;
    if (!(t === anchor && buildings)) origins.push({ id: t * 16 + 2, at: P(t), tile: t, rg });
    edgeOrigins(ctx, t, rg, origins);
  }
  return origins;
}

function edgeOrigins(ctx, t, rg, origins) {
  const { map, inPark, F, P, regionOf } = ctx;
  map.ring(t).forEach((n, d) => {
    if (n < 0 || !inPark.has(n)) return;
    const nf = F(n), c = P(t);
    if (nf.open && regionOf(n) && t < n) origins.push({ id: edgeId(t, n) * 16 + 3,
      at: [c[0] + DIRS[d][0] * 0.5, c[1] + DIRS[d][1] * 0.5], tile: t, rg, shared: true });
    else if (nf.cover && nf.wooded) origins.push({ id: edgeId(t, n) * 16 + 4,
      at: [c[0] + DIRS[d][0] * 0.33, c[1] + DIRS[d][1] * 0.33], tile: t, rg });
  });
}

/**
 * A stand grows only at a local high point of the density field, chosen by the field alone, one on an edge two tiles
 * share a little ahead of one on a single tile; a path or an opening that crosses it parts its trees and moves none.
 * The founding tile's stand is behind the warden's lodge, to the north.
 */
function chooseStands(ctx, origins) {
  const { anchor, buildings, F, P, regionOf, density } = ctx;
  for (const o of origins) {
    o.dens = density(o.at, o.rg.base);
    o.score = o.dens + 0.22 * hash01(o.id, 5) + (o.shared ? 0.08 : 0);
  }
  // Stands keep further apart where the land is open: 0.7 of a tile in thick growth, about a tile in meadow.
  const apart = (o) => 0.7 + Math.max(0, 0.6 - o.dens) * 0.9;
  const stands = origins.filter((o) => o.dens >= 0.15 && origins.every((q) => q === o || dist(q.at, o.at) > apart(o)
    || q.score < o.score || (q.score === o.score && q.id < o.id)));
  if (buildings && F(anchor).open && regionOf(anchor)) {
    const a = P(anchor);
    stands.push({ id: anchor * 16 + 5, at: [a[0] - 0.05, a[1] + 0.36], tile: anchor, rg: regionOf(anchor), dens: 0.5,
      score: 9, heading: 4 });
  }
  return stands;
}

/** A stand's trees, laid along the contour of the density field (so a stand lies along a shore or a wood's edge); on
 *  even ground along the region's grain, which every stand of the region shares. */
function layStand(ctx, o) {
  const h = (s) => hash01(o.id, s);
  const n = Math.max(1, Math.min(7, Math.round(1 + o.dens * 6 + (h(16) - 0.5) * 1.5)));
  const g = ctx.gradOf((p) => ctx.density(p, o.rg.base), o.at), gl = Math.hypot(g[0], g[1]);
  const heading = o.heading != null ? o.heading
    : gl > 0.08 ? Math.atan2(g[1], g[0]) * 180 / Math.PI + 90 + (h(6) - 0.5) * 30 : o.rg.grain + (h(6) - 0.5) * 40;
  const up = gl > 0.08 ? [g[0] / gl, g[1] / gl] : [0, 0];
  const mine = lineTrees(o, h, { n, heading, up, ...standKinds(o) });
  // At 24 tiles some of a Wilderness Area's stands have their first tree swapped for a giant, never a tree added.
  const giant = !ctx.buildings && ctx.level >= 3 && h(2950) < OLD_GROWTH_SHARE ? oldGrowth(o.rg.biome) : null;
  if (giant) mine[0] = [giant[0], mine[0][1], mine[0][2], giant[1], mine[0][4]];
  return { o, trees: mine, heading, up };
}

/** The stand's lead tree (a cluster where the kit has them) and the single tree the rest of it is. */
function standKinds(o) {
  const kit = kitOf(o.rg.biome);
  const kind = kit.trees[o.rg.tree % kit.trees.length], plain = singles(kit.trees);
  const single = GROVES.has(kind) ? plain[o.rg.tree % plain.length] : kind;
  const lead = kit.clusters ? kit.clusters[o.rg.tree % kit.clusters.length] : kind;
  return { lead, single };
}

/** The core first, then outward on alternate ends, each gap wider and each tree further off the line. */
function lineTrees(o, h, { n, heading, up, lead, single }) {
  const mine = [];
  const reach = [0, 0];
  for (let k = 0; k < n; k++) {
    const end = k === 0 ? 0 : k % 2 ? 1 : -1;
    if (k) reach[end > 0 ? 0 : 1] += 0.075 + h(8 + k) * 0.05 + k * 0.012;
    const along = end * reach[end > 0 ? 0 : 1], off = (h(2 + k) - 0.5) * (0.06 + k * 0.03);
    const p = rot(heading, along, off);
    const at = [o.at[0] + p[0] + up[0] * 0.03 * (n - k) / n, o.at[1] + p[1] + up[1] * 0.03 * (n - k) / n];
    const asset = k === 0 ? lead : single;
    mine.push([asset, at[0], at[1], standScale(asset, h, k), h(14 + k) * 360]);
  }
  return mine;
}

function standScale(asset, h, k) {
  return GROVES.has(asset) ? 1 + h(288) * 0.2 : (k === 0 ? 1.35 : 1.25 - k * 0.07) + h(13 + k) * 0.3;
}

/** Plant a stand's trees where they may grow: none in another's crown, and a tree gives way to one of a stronger
 *  stand it would stand in the crown of. Returns where they stand. */
function plantStand(ctx, s, standTrees, growsAt) {
  const kept = [];
  for (const [asset, x, y, sc, an] of s.trees) {
    const need = GROVES.has(asset) ? 0.15 : 0.09;
    if (!growsAt([x, y], GROVES.has(asset) ? 0.05 : 0.02)) continue;
    if (kept.some((q) => dist(q, [x, y]) < need)) continue;
    if (standTrees.some((q) => q !== s && q.o.score > s.o.score
      && q.trees.some((e) => dist([e[1], e[2]], [x, y]) < need))) continue;
    kept.push([x, y]);
    ctx.plant(asset, [x, y], sc, an, ctx.coverOf(asset, sc));
  }
  return kept;
}

/** Tufts of grass on the stand's open side, under and just beyond its outer trees; a Wilderness Area's thicken with
 *  its level. Returns the stand's lee. */
function plantTufts(ctx, s, kept) {
  const { level, buildings, F, tileAt, inRiver, people, blocked } = ctx;
  const kit = kitOf(s.o.rg.biome), h = (k) => hash01(s.o.id, k),
    lee = s.up[0] || s.up[1] ? [-s.up[0], -s.up[1]] : rot(s.heading + 90, 1, 0);
  const tufts = Math.min(kept.length + 1, 2 + Math.floor(h(300) * 2) + (buildings ? 0 : level));
  const fits = (p, pt) => pt >= 0 && F(pt).open && !inRiver(pt, p) && !blocked(p, 0, false) && people(p) < 0.75;
  for (let k = 0; kit.tuft && k < tufts; k++) {
    const [x, y] = kept[(k * 2) % kept.length], j = rot((h(310 + k) - 0.5) * 110, 0.07 + h(320 + k) * 0.08, 0);
    const p = [x + lee[0] * j[0] - lee[1] * j[1], y + lee[1] * j[0] + lee[0] * j[1]];
    if (fits(p, tileAt(p))) ctx.plant(kit.tuft, p, 0.8 + h(330 + k) * 0.5, h(340 + k) * 360);
  }
  return lee;
}

/** Shrub and rock patches, a few to a region, where the score is best. */
export function growPatches(ctx) {
  // patches: shrubs and rocks grow from an origin, a dense core of large pieces and a fringe of small ones trailing
  // one way, with gaps. A region carries a few, where the score is best.
  const patch = patchOf(ctx.plant);
  const patches = [];
  for (const [key, list] of spotsByRegion(ctx)) placePatches(ctx, { patch, patches }, key, list);
  Object.assign(ctx, { patch, patches });
}

/**
 * Each piece is set off one already placed, the core close and to any side, the fringe further and mostly down the
 * patch's heading: a clump with a tail, never a line (pieces stepped along the heading read as a hedge, watched
 * 2026-10-05, cap57-plan3 and cap57-plan4).
 */
function patchOf(plant) {
  return (id, at, { heading, assetOf, n, big, small, ok }) => {
    const h = (s) => hash01(id, s);
    const pts = [at];
    for (let k = 0; k < n; k++) {
      const core = k < Math.ceil(n / 3), from = pts[Math.floor(h(40 + k) * pts.length)];
      const p = k === 0 ? [0, 0] : rot(core ? h(2 + k) * 360 : heading + (h(2 + k) - 0.5) * 150,
        core ? 0.035 + h(32 + k) * 0.025 : 0.06 + h(32 + k) * 0.06, 0);
      const q = [from[0] + p[0], from[1] + p[1]];
      if (pts.slice(1).some((o) => dist(o, q) < 0.03)) continue;
      pts.push(q);
      if (ok(q) && !(k > 1 && h(20 + k) < 0.18)) plant(assetOf(k), q,
        core ? big[0] + h(14 + k) * big[1] : small[0] + h(14 + k) * small[1], h(26 + k) * 360);
    }
  };
}

/** The lees of the stands, scored and grouped by region. */
function spotsByRegion(ctx) {
  const { regions, water, wood, open, pathDist, people, patchSpots } = ctx;
  const byRegion = new Map();
  for (const s of patchSpots) {
    s.score = 0.5 * wood(s.at) + 0.6 * water(s.at) - 0.8 * open(s.at) - (pathDist(s.at) < 0.12 ? 0.6 : 0)
      - 0.5 * people(s.at) + 0.2 * hash01(s.id, 1);
    const key = regions.get(s.tile);
    byRegion.set(key, [...(byRegion.get(key) || []), s]);
  }
  return byRegion;
}

/** A region's patches at its best spots, apart from each other: shrubs, or rocks where the ground is rough. */
function placePatches(ctx, { patch, patches }, key, list) {
  const { level, buildings, F, tileAt, character, rough, inRiver, people, blocked } = ctx;
  const rg = character.get(key), kit = kitOf(rg.biome), bin = kit.under || kit.rocks;
  if (!bin) return;
  const want = 1 + Math.floor(rg.open / 5) + (buildings ? 0 : Math.min(level, 2)), taken = [];
  const ok = (q) => {
    const t = tileAt(q);
    return t >= 0 && F(t).open && !inRiver(t, q) && !blocked(q, 0.02, false) && people(q) < 0.8;
  };
  for (const s of list.sort((a, b) => b.score - a.score || a.id - b.id)) {
    if (taken.length >= want) break;
    if (taken.some((q) => dist(q.at, s.at) < 0.9)) continue;
    taken.push(s);
    patches.push({ id: s.id, at: s.at });
    const useRocks = kit.rocks && (!kit.under || rough(s.at) > 0.4);
    patch(s.id, s.at, { heading: s.heading, assetOf: () => (useRocks ? kit.rocks : kit.under),
      n: 4 + Math.floor(hash01(s.id, 3) * 4), big: [0.85, 0.3], small: [0.45, 0.25], ok });
  }
}

/** Outcrops on the park's roughest hills. */
export function growCrags(ctx) {
  const { tiles, map, facts, F, P, tileAt, rough, inRiver, focal, gradOf, blocked, patch, patches } = ctx;
  // Outcrops on the park's roughest hills, toward the mountain where there is one.
  const hills = tiles.filter((t) => F(t).hill && F(t).walk && !focal.has(t) && !F(t).wet && !F(t).resource)
    .map((t) => [t, rough(P(t)) + map.ring(t).filter((n) => n >= 0 && facts.has(n) && F(n).mountain).length * 0.3
      + 0.2 * hash01(t, 49)])
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
    patch(id, [P(t)[0] + o[0], P(t)[1] + o[1]], { heading: toward + 90,
      assetOf: (k) => localRock(id, 57 + k, F(t).biome),
      n: 3 + Math.floor(hash01(id, 3) * 3), big: [0.4, 0.14], small: [0.2, 0.12],
      ok: (q) => tileAt(q) === t && !inRiver(t, q) && !blocked(q, 0.02, false) });
  }
}

/** Reeds and lily pads off the shore, and a rowboat where the path meets the water. */
export function growWaterPlants(ctx) {
  const { tiles, map, facts, F } = ctx;
  // water: lily pads and reeds as patches from the shore, a rowboat where the path meets the water
  const accents = [];
  const shoreDir = (t) => map.ring(t).findIndex((n) => n >= 0 && facts.has(n) && F(n).walk);
  const waterTiles = tiles.filter((t) => F(t).water && !F(t).wonder && !F(t).resource);
  const lakeShores = waterTiles.filter((t) => (F(t).lake || F(t).nav) && shoreDir(t) >= 0)
    .sort((a, b) => hash01(a, 611) - hash01(b, 611));
  const reedy = [];
  for (const t of lakeShores) {
    if (reedy.length >= 1 + Math.floor(lakeShores.length / 3)) break;
    if (reedy.some((o) => map.ring(o).includes(t))) continue;
    reedy.push(t);
    reedBed(ctx, t, shoreDir(t));
  }
  spongeBeds(ctx, waterTiles.filter((t) => F(t).sea && shoreDir(t) >= 0 && coldWater(map, t)), shoreDir);
  const boat = rowboat(ctx);
  if (boat) accents.push(boat);
  Object.assign(ctx, { accents, shoreDir, waterTiles });
}

/** Reeds out from the shore of a lake or a navigable river, and lily pads beyond them on a lake. */
function reedBed(ctx, t, d) {
  const { F, P, tileAt, patch, patches } = ctx;
  const c = P(t), r0 = F(t).nav ? 0.1 : 0.3, id = t * 16 + 8;
  const at = [c[0] + DIRS[d][0] * r0, c[1] + DIRS[d][1] * r0],
    headingAlong = Math.atan2(DIRS[d][1], DIRS[d][0]) * 180 / Math.PI + 90;
  patches.push({ id, at });
  patch(id, at, { heading: headingAlong, assetOf: () => CATTAIL, n: 3 + Math.floor(hash01(id, 3) * 3), big: [1.4, 0.5],
    small: [1, 0.4], ok: (q) => tileAt(q) === t });
  if (F(t).lake) {
    const [asset, sc] = LILIES[Math.floor(hash01(id, 4) * LILIES.length)];
    const off = [c[0] + DIRS[d][0] * 0.12, c[1] + DIRS[d][1] * 0.12];
    patch(id + 1, off, { heading: headingAlong + 40, assetOf: () => asset, n: 2 + Math.floor(hash01(id, 5) * 2),
      big: [sc * 0.9, sc * 0.3], small: [sc * 0.6, sc * 0.3], ok: (q) => tileAt(q) === t });
  }
}

/** Sponges on the floor of a cold sea, a bed a few tiles of shore apart, out from the land. */
function spongeBeds(ctx, shores, shoreDir) {
  const { map, P, tileAt, patch, patches } = ctx;
  const beds = [];
  for (const t of shores.slice().sort((a, b) => hash01(a, 616) - hash01(b, 616))) {
    if (beds.length >= 1 + Math.floor(shores.length / 3)) break;
    if (beds.some((o) => map.ring(o).includes(t))) continue;
    beds.push(t);
    const d = shoreDir(t), c = P(t), id = t * 16 + 14;
    const at = [c[0] + DIRS[d][0] * 0.18, c[1] + DIRS[d][1] * 0.18];
    patches.push({ id, at });
    patch(id, at, { heading: Math.atan2(DIRS[d][1], DIRS[d][0]) * 180 / Math.PI + 90,
      assetOf: (k) => SPONGES[Math.floor(hash01(id, 70 + k) * SPONGES.length)], n: 3 + Math.floor(hash01(id, 3) * 3),
      big: [0.6, 0.25], small: [0.35, 0.2], ok: (q) => tileAt(q) === t });
  }
}

/** A rowboat where the path to the shore meets the water, or null. */
function rowboat(ctx) {
  const { map, inPark, F, P, destinations } = ctx;
  const landing = destinations.find((d) => d.kind === "shore");
  if (!landing) return null;
  const wt = map.ring(landing.tile).find((n) => n >= 0 && inPark.has(n) && F(n).water);
  if (wt == null) return null;
  const c = P(wt), v = [landing.at[0] - c[0], landing.at[1] - c[1]], l = Math.hypot(v[0], v[1]) || 1;
  return [ROWBOAT, c[0] + v[0] / l * 0.22, c[1] + v[1] / l * 0.22, 0.8, deg(hash01(wt, 10) * 360)];
}
