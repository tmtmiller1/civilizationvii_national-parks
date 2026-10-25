// np-buoys.js - National Parks: where the buoys go on a park's water. Pure: the map is read through the ring and
// water functions passed in, so it runs without the engine (tests/np-layout.test.mjs).
"use strict";

import { ringOf, isWater } from "./np-core.js";

/** Screen angle of ring direction i (Canals: the arm points east at 0 and turns counter-clockwise). */
export function armAngle(i) { return (360 - 60 * i) % 360; }

/** From a tile's center to its corners: a hex edge is about 0.53 long (np-draw.js mountainWallSpan), so its corners
 *  are 0.53 out, 30 degrees either side of the edge's own direction. */
export const CORNER_R = 0.53;

/**
 * Buoys on a park's water: [{ plot, angle }], each at a corner of `plot` (`angle` its screen direction, CORNER_R out).
 * They mark how far the park reaches at sea, not every point of it. The line they follow is the one where the park's
 * water meets open water outside it: each such edge joins its two corners, and those corners chain into runs (a corner
 * touches three tiles, so it lies on two of these edges at most). Along a run the corners furthest from the park's
 * middle are taken first, those pointing out of the park ahead of the notches; a corner within BUOY_GAP steps of one
 * already taken is passed over, and so is one short of BUOY_REACH of the furthest. So a compact park gets a buoy at
 * each far point, and a thin line of tiles is marked at its ends. A corner that touches land, or the map's edge, gets
 * none: a buoy belongs in the water. Ties go by the corner's plots, so the pattern is stable.
 */
export function buoyCorners(tiles, ringFn = ringOf, water = isWater) {
  const corners = outlineCorners(tiles, ringFn, water);
  const pos = seatPlots(tiles, ringFn);
  const pts = [...pos.values()];
  const n = pts.length || 1;
  const mid = [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  const reach = (c) => {
    const p = pos.get(c.plot), a = c.angle * Math.PI / 180;
    const at = [p[0] + Math.cos(a) / Math.sqrt(3), p[1] + Math.sin(a) / Math.sqrt(3)];
    return Math.hypot(at[0] - mid[0], at[1] - mid[1]) + (c.parkPlots === 1 ? 0.3 : 0);
  };
  const far = Math.max(0, ...[...corners.values()].filter((c) => c.ok).map(reach));
  const out = [];
  for (const run of outlineRuns(corners)) out.push(...spacedOut(run, reach, far * BUOY_REACH));
  return out.map((c) => ({ plot: c.plot, angle: c.angle }));
}

/** Outline steps kept between two buoys on one run: two and a half hex edges. */
const BUOY_GAP = 5;
/** Only corners reaching this share of the park's furthest one get a buoy, so the long sides of a thin park stay
 *  clear and its ends are marked. */
const BUOY_REACH = 0.6;

/** The corners of one run that get a buoy: the furthest-reaching first, none within BUOY_GAP steps of another. */
function spacedOut({ corners, cycle }, reach, least) {
  const n = corners.length;
  const steps = (i, j) => (cycle ? Math.min(Math.abs(i - j), n - Math.abs(i - j)) : Math.abs(i - j));
  const order = corners.map((c, i) => ({ c, i, r: reach(c) })).filter((x) => x.c.ok && x.r >= least)
    .sort((x, y) => (y.r - x.r) || (x.c.key < y.c.key ? -1 : 1));
  const taken = [];
  for (const x of order) if (taken.every((t) => steps(t.i, x.i) >= BUOY_GAP)) taken.push(x);
  return taken.map((t) => t.c);
}

/** The outline's corners in order along each run: [{ corners, cycle }]. A run is a closed loop round open water, or a
 *  line that ends where the outline meets land. */
function outlineRuns(corners) {
  const runs = [], seen = new Set();
  const starts = [...corners.values()].sort((x, y) => (x.next.size - y.next.size) || (x.key < y.key ? -1 : 1));
  for (const start of starts) {
    if (seen.has(start.key)) continue;
    const run = [];
    for (let c = start; c && !seen.has(c.key);) {
      seen.add(c.key); run.push(c);
      c = corners.get([...c.next].find((k) => !seen.has(k)));
    }
    runs.push({ corners: run, cycle: run.length > 2 && run[run.length - 1].next.has(start.key) });
  }
  return runs;
}

/** Each park tile's position in tile spacings, walked out through the ring from the lowest plot (a tile apart from
 *  the rest starts its own walk far off, so it doesn't bend the middle). */
function seatPlots(tiles, ringFn) {
  const inPark = new Set(tiles), pos = new Map();
  for (const [k, seed] of [...tiles].sort((x, y) => x - y).entries()) {
    if (pos.has(seed)) continue;
    pos.set(seed, [1000 * k, 0]);
    for (let q = 0, queue = [seed]; q < queue.length; q++) {
      const t = queue[q], p = pos.get(t);
      ringFn(t).forEach((n, d) => {
        if (n < 0 || !inPark.has(n) || pos.has(n)) return;
        const a = armAngle(d) * Math.PI / 180;
        pos.set(n, [p[0] + Math.cos(a), p[1] + Math.sin(a)]);
        queue.push(n);
      });
    }
  }
  return pos;
}

/** The corners on the line where a park's water meets open water outside it, each with the corners it joins along
 *  that line: Map key -> { key, plot, angle, ok, parkPlots, next }. `ok` when all three plots at the corner are water;
 *  `parkPlots` how many of them are the park's (1 where the outline points out, 2 at a notch). */
function outlineCorners(tiles, ringFn, water) {
  const inPark = new Set(tiles);
  const corners = new Map();
  const corner = (t, ring, d) => {
    const a = ring[d], b = ring[(d + 1) % 6];
    const key = a < 0 || b < 0 ? `${t}#${d}` : [t, a, b].sort((x, y) => x - y).join(",");
    if (!corners.has(key)) {
      const ok = a >= 0 && b >= 0 && water(a) && water(b);
      const parkPlots = [t, a, b].filter((x) => inPark.has(x)).length;
      corners.set(key, { key, plot: t, angle: (armAngle(d) + 330) % 360, ok, parkPlots, next: new Set() });
    }
    return corners.get(key);
  };
  for (const t of [...tiles].sort((x, y) => x - y)) {
    if (!water(t)) continue;
    const ring = ringFn(t);
    ring.forEach((n, dir) => {
      if (n < 0 || inPark.has(n) || !water(n)) return;
      const c1 = corner(t, ring, (dir + 5) % 6), c2 = corner(t, ring, dir);
      c1.next.add(c2.key); c2.next.add(c1.key);
    });
  }
  return corners;
}
