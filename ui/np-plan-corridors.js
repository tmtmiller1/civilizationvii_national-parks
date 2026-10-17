// np-plan-corridors.js - National Parks: what keeps plants off people's ground and paths, and the path decals.
//
// docs/DESIGN.md, "Order of placement", steps 5 and 6. Reads the plan's context and adds to it (np-plan.js parkPlan).
"use strict";

import { hash01 } from "./np-core.js";
import { WAYMARK, TRAIL, GRAVEL, PALE_GROUND, dist, clamp01, deg } from "./np-plan-kit.js";

/** People's ground as a field, and what keeps a plant out of a room, an opening or a path's corridor. */
export function keepOuts(ctx) {
  const { anchor, buildings, P, pathDist, rooms, openings, grounds } = ctx;
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
  const hidesLodge = (p) => {
    if (!buildings) return false;
    const a = P(anchor), x = p[0] - a[0], y = p[1] - a[1];
    return Math.hypot(x, y) < 0.55 && y < 0.2 && Math.abs(x) < 0.38;
  };
  Object.assign(ctx, { people, CORRIDOR, blocked, hidesLodge });
}

/** The path decals along every route, and stone waymarks at the bends on pale ground. */
export function layDecals(ctx) {
  const { F, tileAt, segments } = ctx;
  // decals end to end along every route; on pale ground stone waymarks at its bends and forks as well
  const decals = [];
  for (const [a, b, key] of segments) {
    const len = dist(a, b), n = Math.max(1, Math.round(len / 0.2)),
      id = [...key].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7);
    const t = tileAt(b), pale = t >= 0 && PALE_GROUND.has(F(t).biome);
    layTrail(decals, { a, b, id, len, n, pale });
    if (key[0] === "e" && pale) waymark(ctx, decals, { a, b, id, len, t });
  }
  Object.assign(ctx, { decals });
}

/** Bare earth on grass; on sand and snow, where that hardly shows, the game's gravel strip drawn narrow. */
function layTrail(decals, { a, b, id, len, n, pale }) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const m = pale ? Math.max(1, Math.round(len / 0.1)) : n;
  for (let k = 0; k < m; k++) {
    const u = (k + 0.5) / m;
    decals.push([pale ? GRAVEL : TRAIL, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, pale ? 0.5 : 1.1,
      deg(ang + (hash01(id, 340 + k) - 0.5) * (pale ? 6 : 16))]);
  }
}

/** A stone waymark beside a bend or fork of a route on pale ground, off the focal tiles and clear of the rooms. */
function waymark(ctx, decals, { a, b, id, len, t }) {
  if (ctx.focal.has(t)) return;
  const sd = hash01(id, 350) < 0.5 ? 1 : -1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  const p = [b[0] + nx * sd * 0.075, b[1] + ny * sd * 0.075];
  if (!ctx.rooms.some(([x, y, r]) => dist(p, [x, y]) < r + 0.03))
    decals.push([WAYMARK, p[0], p[1], 0.24 + hash01(id, 351) * 0.06, deg(hash01(id, 352) * 360)]);
}
