// np-plan-built.js - National Parks: the park plan's built things and monuments, each with its setting.
//
// docs/DESIGN.md, "Order of placement" step 4 and "Settings". Reads the plan's context and adds to it
// (np-plan.js parkPlan).
"use strict";

import { hash01 } from "./np-core.js";
import { LODGE, SHELTER, SIGN, CABIN, CAMP_TENT, CAMP_FIRE, LOOKOUT, CAIRN_MOUND, OBELISK, DOLMEN, TRAIL, STATION,
  kitOf, localRock, dist, rot, deg, segDist } from "./np-plan-kit.js";

/** The warden's station, then each destination's built things and their setting. */
export function buildThings(ctx) {
  const b = builder(ctx);
  if (ctx.buildings) buildStation(ctx, b);
  for (const d of ctx.destinations) {
    const id = d.id, at = d.at, h = (s) => hash01(id, s);
    const u = d.from || rot(h(90) * 360, 1, 0), side = [-u[1], u[0]];
    const rg = ctx.regionOf(d.tile), biome = ctx.F(d.tile).biome;
    const make = BUILDERS[d.kind];
    if (make) make(ctx, b, { d, id, at, h, u, side, rg, biome });
  }
  Object.assign(ctx, { built: b.built, rooms: b.rooms, openings: b.openings, grounds: b.grounds });
}

/** What is built, each with its setting; rooms nothing grows in; grounds animals keep off. `put` places a piece
 *  unless it would stand in a river (the lodge, the sign, the station's shelter and trail decals excepted). */
function builder(ctx) {
  const { anchor, tileAt, riverDist } = ctx;
  const b = {
    built: [],      // [asset, x, y, scale, angle, tint?] in park coordinates
    rooms: [],      // [x, y, r] closed to plants and animals
    openings: [],   // [x, y, r] closed to trees only
    grounds: [],    // [x, y, r] people's ground, closed to animals
  };
  const inRiver = (asset, x, y, scale) => asset !== TRAIL && riverDist([x, y]) < 0.14
    && !(asset === LODGE && scale > 0.6)
    && asset !== SIGN && !(asset === SHELTER && tileAt([x, y]) === anchor);
  b.put = (asset, [x, y], scale, angle, { room, tint } = {}) => {
    if (inRiver(asset, x, y, scale)) return;
    b.built.push(tint ? [asset, x, y, scale, deg(angle), tint] : [asset, x, y, scale, deg(angle)]);
    if (room) b.rooms.push([x, y, room]);
  };
  return b;
}

const houseRoom = (scale) => 0.03 + 0.13 * scale;

function buildStation(ctx, b) {
  const a = ctx.P(ctx.anchor);
  for (const [asset, x, y, sc, an] of STATION)
    b.put(asset, [a[0] + x, a[1] + y], sc, an, { room: asset === SIGN ? 0.04 : houseRoom(sc) });
  b.grounds.push([a[0] + STATION[0][1], a[1] + STATION[0][2], 0.3]);
  b.openings.push([a[0], a[1] - 0.1, 0.2]);
}

/**
 * A cabin village gathers round a small green beside the path's end, never in a row: the first cabin stands off the
 * path, and each one after is set off one already built, at its own bearing and distance, turned toward the green.
 */
function buildVillage(ctx, b, f) {
  const { d, h, u, side } = f;
  const n = h(420) < 0.5 ? 3 : 4, main = h(416) < 0.5 ? 1 : -1, w = ctx.wayOf(d.tile);
  const green = [w[0] + side[0] * main * 0.14 + u[0] * 0.05, w[1] + side[1] * main * 0.14 + u[1] * 0.05];
  const xs = [];
  for (let k = 0, tries = 0; xs.length < n && tries < 24; tries++) {
    const from = xs.length ? xs[Math.floor(h(470 + tries) * xs.length)] : green;
    const q = rot(h(443 + tries) * 360,
      xs.length ? 0.115 + h(427 + tries) * 0.06 : 0.07 + h(427 + tries) * 0.03, 0);
    const x = from[0] + q[0], y = from[1] + q[1];
    if (!cabinFits(ctx, f, { green, w, xs, p: [x, y] })) continue;
    const sc = 0.36 + h(433 + k) * 0.08;
    b.put(CABIN, [x, y], sc, Math.atan2(green[1] - y, green[0] - x) * 180 / Math.PI + (h(439 + k) - 0.5) * 60,
      { room: houseRoom(sc) });
    xs.push([x, y]); k++;
  }
  if (!xs.length) xs.push(green);
  b.grounds.push([xs.reduce((m, c) => m + c[0], 0) / xs.length, xs.reduce((m, c) => m + c[1], 0) / xs.length, 0.3]);
}

/** A cabin's spot: near the green but not on it, clear of the path and the other cabins, on the village's tile and
 *  away from the river. */
function cabinFits(ctx, { d, u }, { green, w, xs, p: [x, y] }) {
  return !(dist([x, y], green) < 0.06 || dist([x, y], green) > 0.2
    || segDist([x, y], [w[0] - u[0] * 0.3, w[1] - u[1] * 0.3], w) < 0.075
    || xs.some((c) => dist(c, [x, y]) < 0.11) || ctx.tileAt([x, y]) !== d.tile || ctx.riverDist([x, y]) < 0.15);
}

/** The fire just past the path's end, the tents in a crescent beyond it, open to the path, none the same distance out
 *  and the gaps between them uneven. */
function buildCamp(ctx, b, { d, h, u }) {
  const fire = [d.foot[0] + u[0] * 0.07, d.foot[1] + u[1] * 0.07];
  b.put(CAMP_FIRE, fire, 0.5, h(401) * 360, { room: 0.03 });
  const n = h(402) < 0.5 ? 2 : 3, toward = Math.atan2(u[1], u[0]) * 180 / Math.PI;
  let a = toward - (n === 2 ? 30 : 62) + (h(403) - 0.5) * 30;
  for (let k = 0; k < n; k++) {
    const p = rot(a, 0.085 + h(405 + k) * 0.05, 0);
    b.put(CAMP_TENT, [fire[0] + p[0], fire[1] + p[1]], 0.7 + h(409 + k) * 0.1, a + 90 + (h(412 + k) - 0.5) * 30, { room: 0.05, tint: "owner" });
    a += 46 + h(404 + k) * 34;
  }
  b.grounds.push([fire[0], fire[1], 0.2]);
  b.openings.push([fire[0], fire[1], 0.2]);
}

function buildShelter(ctx, b, { d, h, u, side }) {
  const sd = h(71) < 0.5 ? 1 : -1, sc = 0.55 * (0.9 + h(74) * 0.2);
  d.at = [d.foot[0] + side[0] * sd * 0.1 + u[0] * 0.04, d.foot[1] + side[1] * sd * 0.1 + u[1] * 0.04];
  b.put(SHELTER, d.at, sc, Math.atan2(-side[1] * sd, -side[0] * sd) * 180 / Math.PI + (h(75) - 0.5) * 20,
    { room: houseRoom(sc) });
  b.grounds.push([d.at[0], d.at[1], 0.16]);
  b.openings.push([d.at[0], d.at[1], 0.14]);
}

function buildLookout(ctx, b, { at, h }) {
  b.put(LOOKOUT, at, 0.4, Math.floor(h(15) * 4) * 90, { room: 0.07 });
  b.openings.push([at[0], at[1], 0.15]);
}

/** The monument and its setting: the region's rocks close against one side and trailing off, low scrub at the fringe,
 *  trodden earth at the foot. Trees are held back to an opening round it. */
function buildMonument(ctx, b, f) {
  const { d, at, h, u, side } = f;
  const cairn = d.kind === "cairn";
  const asset = cairn ? CAIRN_MOUND : ctx.buildings ? OBELISK : DOLMEN;
  b.put(asset, at, cairn ? 0.3 + h(85) * 0.04 : ctx.buildings ? 0.6 : 0.4, h(86) * 360, { room: cairn ? 0.05 : 0.07 });
  b.openings.push([at[0], at[1], 0.17]);
  const lee = Math.atan2(side[1], side[0]) * 180 / Math.PI + (h(87) < 0.5 ? 0 : 180) + (h(88) - 0.5) * 40;
  monumentRocks(b, f, lee);
  monumentScrub(b, f, lee);
  b.put(TRAIL, [at[0] - u[0] * 0.03, at[1] - u[1] * 0.03], 0.9, Math.atan2(u[1], u[0]) * 180 / Math.PI + 70,
    { room: 0 });
}

function monumentRocks(b, { id, at, h, biome }, lee) {
  const rocks = 3 + Math.floor(h(89) * 3);
  let out = 0.065;
  for (let k = 0; k < rocks; k++) {
    const p = rot(lee + (h(91 + k) - 0.5) * (30 + k * 22), out, 0);
    b.put(localRock(id, 97 + k, biome), [at[0] + p[0], at[1] + p[1]],
      Math.max(0.16, 0.34 - k * 0.045 + (h(103 + k) - 0.5) * 0.05), h(109 + k) * 360, { room: 0 });
    out += 0.022 + h(115 + k) * 0.03 + k * 0.006;
  }
}

function monumentScrub(b, { at, h, rg, biome }, lee) {
  const scrub = rg && kitOf(biome).under;
  if (scrub) for (let k = 0; k < 1 + (h(121) < 0.5 ? 1 : 0); k++) {
    const p = rot(lee + 150 + k * 70 + (h(123 + k) - 0.5) * 50, 0.13 + h(125 + k) * 0.05, 0);
    b.put(scrub, [at[0] + p[0], at[1] + p[1]], 0.45 + h(127 + k) * 0.15, h(129 + k) * 360, { room: 0 });
  }
}

const BUILDERS = { village: buildVillage, camp: buildCamp, shelter: buildShelter, lookout: buildLookout,
  cairn: buildMonument, second: buildMonument };
