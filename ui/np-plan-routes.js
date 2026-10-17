// np-plan-routes.js - National Parks: the park plan's destinations and footpaths.
//
// docs/DESIGN.md, "Order of placement", steps 1 to 3. Each step reads what the steps before it put on the plan's
// context and adds its own (np-plan.js parkPlan).
"use strict";

import { hash01 } from "./np-core.js";
import { DOOR, PALE_GROUND, DIRS, dist, rot, edgeId, segDist, budgetsFor, FOCAL_ORDER } from "./np-plan-kit.js";

/** The focal things, each the best of its candidates, and a water's edge for a path to end at. */
export function chooseDestinations(ctx) {
  const { tiles, anchor, level, buildings } = ctx;
  // destinations: the focal things, each the best of its candidates, taken in FOCAL_ORDER
  const budgets = budgetsFor(tiles.length, level, buildings);
  const focal = new Map(buildings ? [[anchor, "lodge"]] : []);   // tile -> kind; one focal thing a tile, none beside another
  const full = pickFocal(ctx, focal);
  // What this level does not yet carry is taken back off the map of focal tiles.
  const destinations = [];
  for (const group of ["structures", "lookouts", "monuments"]) full[group].forEach((d, k) => {
    if (!d) return;
    if (k < budgets[group]) destinations.push({ id: d.tile * 16 + 12, kind: d.kind, tile: d.tile, at: null });
    else focal.delete(d.tile);
  });
  // A water's edge within the corner, where a path can end at the shore.
  if (buildings) {
    const best = shoreTile(ctx, focal);
    if (best >= 0) destinations.push({ id: best * 16 + 15, kind: "shore", tile: best, at: null });
  }
  Object.assign(ctx, { budgets, focal, destinations });
}

const groupOf = (kind) => (kind === "lookout" ? "lookouts" : kind === "cairn" || kind === "second" ? "monuments" : "structures");

/** Each focal kind in FOCAL_ORDER takes the best tile it may stand on, none on or beside another focal tile. */
function pickFocal(ctx, focal) {
  const { tiles, anchor, buildings, map } = ctx;
  const besideFocal = (t) => map.ring(t).some((n) => focal.has(n) && n !== anchor);
  const score = focalScores(ctx, focal), can = focalChecks(ctx);
  const full = { structures: [], lookouts: [], monuments: [] };
  if (tiles.length >= 3 || !buildings) for (const kind of FOCAL_ORDER) {
    const group = groupOf(kind);
    if (group !== "monuments" && !buildings) continue;
    const ok = group === "structures" ? can.structure : group === "lookouts" ? can.lookout : can.monument;
    const rate = group === "monuments" ? score.monument : score[kind];
    const best = bestTile(tiles, kind, (t) => !focal.has(t) && !besideFocal(t) && ok(t), rate);
    if (best < 0) { full[group].push(null); continue; }
    focal.set(best, kind);
    full[group].push({ kind, tile: best });
  }
  return full;
}

/** The tile a focal kind rates best among those it may take, a hash breaking ties; -1 for none. */
function bestTile(tiles, kind, may, rate) {
  let best = -1, bs = -Infinity;
  for (const t of tiles) {
    if (!may(t)) continue;
    const s = rate(t) + 0.15 * hash01(t, 70 + FOCAL_ORDER.indexOf(kind));
    if (s > bs) { bs = s; best = t; }
  }
  return best;
}

/** How good a tile is for each kind of focal thing. */
function focalScores(ctx, focal) {
  const { buildings, map, facts, F, P, steps, cost, water, wood, rough, beside } = ctx;
  const nearest = (p) => {
    let near = 9;
    for (const o of focal.keys()) near = Math.min(near, dist(p, P(o)));
    return near;
  };
  const crowded = (near) => (near < 2 ? 0.5 : 0);
  return {
    village: (t) => 2 - 0.5 * Math.abs(steps.get(t) - 1),
    camp: (t) => 2 - 0.4 * Math.abs(steps.get(t) - 2) + 0.6 * water(P(t)) + 0.4 * wood(P(t)) + (F(t).river ? 0.3 : 0),
    shelter: (t) => 2 - 0.3 * Math.abs(steps.get(t) - 2.5) + 0.3 * water(P(t)),
    // A lookout is for looking out from: best on a cliff over the sea, then any coast, a cliff, a lake shore, a hill.
    lookout: (t) => {
      const f = F(t);
      const near = nearest(P(t));
      return seaCliff(f, t, beside) + shoreView(t, beside) + (f.cliff ? 0.6 : 0) + (f.hill ? 0.4 : 0)
        + 0.3 * map.ring(t).filter((n) => n >= 0 && facts.has(n) && !F(n).hill && !F(n).mountain).length / 6
        + 0.2 * Math.min(steps.get(t) || 4, 4) / 4 - crowded(near);
    },
    monument: (t) => {
      const f = F(t), p = P(t);
      const near = nearest(p);
      return (f.hill ? 1 : 0) + 0.5 * rough(p) + (PALE_GROUND.has(f.biome) ? 0.2 : 0) - (f.cover ? 0.6 : 0)
        - 0.25 * Math.abs((steps.get(t) ?? 3.5) - 3.5) - crowded(near) + (buildings && cost.has(t) ? 1.5 : 0);
    },
  };
}
const seaCliff = (f, t, beside) => (f.cliff && beside(t, "sea") ? 1.2 : 0);
const shoreView = (t, beside) => (beside(t, "sea") ? 0.8 : beside(t, "lake") ? 0.5 : 0);

/** Which tiles each kind of focal thing may stand on. */
function focalChecks(ctx) {
  const { buildings, F, steps, cost, beside, bankOf } = ctx;
  const flat = (t) => { const f = F(t); return f.open && !f.hill && !f.model && bankOf(t, t) != null; };
  const quiet = (f, t) => f.walk && !f.wet && !f.alone && !f.resource && !f.cover && bankOf(t, t) != null;
  const view = (f, t) => f.hill || f.cliff || beside(t, "sea") || beside(t, "lake");
  return {
    structure: (t) => flat(t) && steps.has(t) && steps.get(t) >= 1 && steps.get(t) <= 3 && cost.has(t),
    lookout: (t) => { const f = F(t); return quiet(f, t) && cost.has(t) && view(f, t); },
    // A monument is better at a path's end (scored), but land no path reaches can carry one too.
    monument: (t) => {
      const f = F(t);
      return f.walk && bankOf(t, t) != null && !f.wet && !f.alone && !f.resource
        && (!buildings || !steps.has(t) || steps.get(t) >= 2);
    },
  };
}

/** The open tile near water, one to three steps from the lodge, best for a path to end at the shore; -1 for none. */
function shoreTile(ctx, focal) {
  const { tiles, map, facts, F, steps, cost, nearWater } = ctx;
  const may = (t) => !focal.has(t) && F(t).open && cost.has(t) && steps.get(t) >= 1 && steps.get(t) <= 3
    && nearWater(t);
  let best = -1, bs = -Infinity;
  for (const t of tiles) {
    if (!may(t)) continue;
    const s = -0.3 * steps.get(t) + (map.ring(t).some((n) => n >= 0 && facts.has(n) && F(n).lake) ? 0.5 : 0)
      + 0.15 * hash01(t, 88);
    if (s > bs) { bs = s; best = t; }
  }
  return best;
}

/** The footpaths: one graph from the lodge's door, each route passing a tile at that tile's waypoint. */
export function layRoutes(ctx) {
  const { destinations } = ctx;
  // routes: each tile on the way has one waypoint, shared by every route through it, so branches join there
  const gradOf = (fn, p, h = 0.15) => [(fn([p[0] + h, p[1]]) - fn([p[0] - h, p[1]])) / (2 * h),
    (fn([p[0], p[1] + h]) - fn([p[0], p[1] - h])) / (2 * h)];
  const waypoint = new Map();
  const wayOf = waypointsOf(ctx, gradOf, waypoint);
  const segments = [], segSeen = new Set(), onPath = new Set(), paths = [];
  const addSeg = (a, b, key) => {
    if (!segSeen.has(key) && dist(a, b) > 0.01) { segSeen.add(key); segments.push([a, b, key]); }
  };
  // A destination's tile is passed at the thing's foot, to the side the path comes from, never under it: so a route
  // that ends there ends at the foot, and one that goes on passes by it. Nearer destinations are settled first.
  for (const d of destinations) placeDestination(ctx, d);
  for (const d of destinations.filter((x) => x.reached)
    .sort((a, b) => a.chain.length - b.chain.length || a.id - b.id)) {
    const back = wayOf(d.chain[d.chain.length - 2]);
    const ux = d.at[0] - back[0], uy = d.at[1] - back[1], ul = Math.hypot(ux, uy) || 1;
    d.from = [ux / ul, uy / ul];
    d.foot = d.kind === "shore" || d.kind === "village" ? d.at : [d.at[0] - d.from[0] * 0.09, d.at[1] - d.from[1] * 0.09];
    waypoint.set(d.tile, d.foot);
  }
  for (const d of destinations) joinPath(d, { wayOf, addSeg, onPath, paths });
  const pathDist = (p) => { let v = 9; for (const [a, b] of segments) v = Math.min(v, segDist(p, a, b)); return v; };
  Object.assign(ctx, { gradOf, wayOf, segments, onPath, paths, pathDist });
}

/** Each tile's one waypoint, shared by every route through it: the lodge's door, a minor river's middle (crossed
 *  square on), or near the middle, a little off it by its hash and away from water. */
function waypointsOf(ctx, gradOf, waypoint) {
  const { anchor, buildings, F, P, water } = ctx;
  return (t) => {
    if (waypoint.has(t)) return waypoint.get(t);
    const p = P(t);
    let w;
    if (t === anchor && buildings) w = [p[0] + DOOR[0], p[1] + DOOR[1]];
    else if (F(t).river) w = [p[0], p[1]];
    else {
      const g = gradOf(water, p), gl = Math.hypot(g[0], g[1]);
      const j = rot(hash01(t, 331) * 360, 0.03 + hash01(t, 332) * 0.09, 0);
      w = [p[0] + j[0] - (gl > 0.05 ? g[0] / gl * 0.1 : 0), p[1] + j[1] - (gl > 0.05 ? g[1] / gl * 0.1 : 0)];
    }
    waypoint.set(t, w);
    return w;
  };
}

/** A destination's chain of tiles back to the lodge, whether a path reaches it, and where on its tile it stands: at
 *  the shore, a lookout at the water's side of its tile on the edge it looks out over, anything else near the middle,
 *  a little off it by its own hash. */
function placeDestination(ctx, d) {
  const { anchor, buildings, map, facts, F, P, parent, seaward, bankOf } = ctx;
  d.chain = [];
  for (let t = d.tile; t !== undefined; t = parent.get(t)) { d.chain.unshift(t); if (t === anchor) break; }
  d.reached = buildings && d.chain[0] === anchor && d.chain.length > 1;
  if (d.kind === "shore") {
    const wd = map.ring(d.tile).findIndex((n) => n >= 0 && facts.has(n) && F(n).water);
    d.at = [P(d.tile)[0] + DIRS[wd][0] * 0.34, P(d.tile)[1] + DIRS[wd][1] * 0.34];
  } else if (d.kind === "lookout" && seaward(d.tile) && !F(d.tile).river) {
    const v = seaward(d.tile);
    d.at = [P(d.tile)[0] + v[0] * 0.27, P(d.tile)[1] + v[1] * 0.27];
  } else d.at = bankOf(d.tile, d.id) || P(d.tile);
}

/** The path to a destination a route reaches, segment by segment along its chain. */
function joinPath(d, { wayOf, addSeg, onPath, paths }) {
  const chain = d.chain;
  delete d.chain;
  if (!d.reached) { d.from = null; return; }
  for (let k = 1; k < chain.length; k++) { addSeg(wayOf(chain[k - 1]), wayOf(chain[k]), "e" + edgeId(chain[k - 1], chain[k])); onPath.add(chain[k - 1]); }
  onPath.add(d.tile);
  paths.push({ to: d.id, tiles: chain, line: chain.map(wayOf) });
}
