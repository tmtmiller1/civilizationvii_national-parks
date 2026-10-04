// np-scene.js - National Park: which tiles of a park carry which accents, planned for the park as a whole.
//
// Chosen tile by tile, the accents repeated: two lake tiles side by side both got the same lily pads and cattails,
// neighboring sea tiles the same school of fish, neighboring meadows the same wheeling flock. So each accent is
// planned across the park instead: it goes on a share of the tiles that can take it, never on two tiles next to
// each other (never within two tiles, for a rowboat or a whale), and each tile takes the variant least used near
// it. The plan is pure and hashed from the plots, so a park looks the same after a reload.
"use strict";

import { hash01 } from "./np-core.js";

/**
 * An accent: `ok(land, t)` says whether a tile can take it, `share` is the part of those tiles that get it, `space`
 * how many tiles apart two of them must be (1: not adjacent; 2: not within two tiles), `variants(land)` the
 * choices, as names or [name, weight]. `max` caps the count per park, `perVariant` the count of any one variant per
 * park (a desert's or tundra's birds are two kinds that both circle, and a large park filled with them).
 * `salt` spreads the choice of tiles.
 */
const open = (f) => !f.water && !f.lake && !f.river && !f.mountain && !f.wonder;
const wet = (f) => (f.water || f.lake || f.river) && !f.wonder;

export function accents(fauna) {
  return {
    herd: { salt: 1, share: 0.4, space: 1, ok: (f) => open(f), variants: (f) => herdPool(fauna, f) },
    stray: { salt: 2, share: 0.1, space: 2, ok: (f) => open(f) && !f.anchor, variants: (f) => herdPool(fauna, f) },
    climber: { salt: 3, share: 0.45, space: 1, ok: (f) => f.mountain && !f.wonder, variants: () => ["llama", "sheep"] },
    air: { salt: 4, share: 0.22, space: 1, perVariant: 2, ok: (f) => !f.lake && !f.river, variants: (f) => (f.water ? fauna.coastAir : airOf(fauna, f)) },
    school: { salt: 5, share: 0.35, space: 1, ok: (f) => f.coast && !f.wonder, variants: () => fauna.schools },
    reef: { salt: 6, share: 0.35, space: 1, ok: (f) => f.coast && f.shore != null && !f.wonder, variants: () => fauna.reef },
    whale: { salt: 7, share: 0.2, space: 2, max: 2, ok: (f) => f.coast && f.shore == null && !f.wonder, variants: () => [fauna.whale] },
    lakeFish: { salt: 8, share: 0.4, space: 1, ok: (f) => f.lake && !f.wonder, variants: () => [fauna.lakeFish] },
    leap: { salt: 9, share: 0.3, space: 1, ok: (f) => (f.lake || f.river) && !f.wonder, variants: () => [fauna.leap] },
    wader: { salt: 10, share: 0.3, space: 1, ok: (f) => wet(f) && f.shore != null, variants: (f) => (f.coast ? ["crab"] : ["crane"]) },
    reeds: { salt: 11, share: 0.45, space: 1, ok: (f) => (f.lake || f.river) && f.shore != null && !f.wonder, variants: () => [0, 1, 2] },
    lilies: { salt: 12, share: 0.5, space: 1, ok: (f) => f.lake && !f.wonder, variants: () => [0, 1, 2] },
    boat: { salt: 13, share: 0.2, space: 2, max: 2, ok: (f) => wet(f), variants: () => [0] },
    cairn: { salt: 14, share: 0.35, space: 1, ok: (f) => (f.hill || f.mountain || f.wooded) && !f.wonder && !f.anchor, variants: () => [0] },
    stones: { salt: 15, share: 0.6, space: 1, ok: (f) => f.hill && !f.wonder && !f.anchor, variants: () => [0, 1, 2, 3] },
    under: { salt: 16, share: 0.5, space: 1, ok: (f) => open(f) && !f.wooded, variants: () => [0] },
    trail: { salt: 17, share: 0.45, space: 1, ok: (f) => open(f) && !f.wooded && !f.anchor, variants: () => [0] },
    grove: { salt: 18, share: 1, space: 0, ok: (f) => open(f), variants: (f) => f.treeKinds || [0] },
    stand: { salt: 19, share: 1, space: 0, ok: (f) => open(f) && !f.wooded && !f.anchor, variants: () => [0, 1, 2, 3] },
  };
}

function herdPool(fauna, f) {
  const b = fauna.biomes[f.biome] || fauna.biomes.default;
  return f.hill ? b.hill : b.land;
}
function airOf(fauna, f) {
  const b = fauna.biomes[f.biome] || fauna.biomes.default;
  return b.air;
}

/**
 * How much more of an accent a park carries at each of its size levels (np-core.js parkLevel): the
 * share grows by this part per level, up to every tile that can take it. The plan picks tiles in a fixed order until
 * its quota is met, so a higher level only adds tiles to those a lower one chose, and stepping down takes them away.
 * Accents kept off neighboring tiles stop growing near a third of the land; a Wilderness Area's undergrowth, which
 * would, thickens in its dressing instead (np-draw.js). `wild` is there for a boost by kind.
 */
export const LEVEL_BOOST = { stray: 0.6, climber: 0.3, wader: 0.4 };
function boostOf(key, wild) {
  const b = LEVEL_BOOST[key];
  return typeof b === "number" ? b : b && wild ? b.wild : 0;
}

const nameOf = (v) => (Array.isArray(v) ? v[0] : v);
const weightOf = (v) => (Array.isArray(v) ? v[1] : 1);

/** Tiles within `d` steps of `t` (not `t` itself), through `ring`. */
function near(t, d, ring) {
  const seen = new Set([t]);
  let edge = [t];
  for (let k = 0; k < d; k++) {
    const next = [];
    for (const x of edge) for (const n of ring(x)) if (n >= 0 && !seen.has(n)) { seen.add(n); next.push(n); }
    edge = next;
  }
  seen.delete(t);
  return seen;
}

/**
 * The variant for tile `t`: of those not used within two tiles, a weighted pick; if every variant is used close
 * by, the one used least there.
 */
function chooseVariant(list, t, salt, nearby, used) {
  const local = new Map();
  for (const n of nearby) if (used.has(n)) local.set(used.get(n), (local.get(used.get(n)) || 0) + 1);
  let pool = list.filter((v) => !local.has(nameOf(v)));
  if (!pool.length) {
    const least = Math.min(...list.map((v) => local.get(nameOf(v)) || 0));
    pool = list.filter((v) => (local.get(nameOf(v)) || 0) === least);
  }
  const total = pool.reduce((s, v) => s + weightOf(v), 0);
  let x = hash01(t, 500 + salt) * total;
  for (const v of pool) { x -= weightOf(v); if (x < 0) return nameOf(v); }
  return nameOf(pool[pool.length - 1]);
}

/**
 * Plan a park's accents: Map(tile -> { herd, stray, climber, air, school, reef, whale, lakeFish, leap, wader,
 * reeds, lilies, boat, cairn, stones, under, trail, grove, stand }), each the chosen variant or absent. `land(t)`
 * gives the tile's facts (see np-wildlife.js), `ring(t)` its six neighbors (-1 off the map), `fauna` the pools.
 * `level` is the park's size level (LEVEL_BOOST), `wild` true for a Wilderness Area.
 */
export function planScene(tiles, { land, ring, fauna, level = 0, wild = false }) {
  const facts = new Map(tiles.map((t) => [t, land(t)]));
  const plan = new Map(tiles.map((t) => [t, {}]));
  const near2 = new Map(tiles.map((t) => [t, near(t, 2, ring)]));
  for (const [key, a] of Object.entries(accents(fauna))) {
    const eligible = tiles.filter((t) => a.ok(facts.get(t), t));
    if (!eligible.length) continue;
    const share = Math.min(1, a.share * (1 + boostOf(key, wild) * level));
    let quota = Math.round(share * eligible.length + (hash01(eligible.length, 700 + a.salt) - 0.5) * 0.9);
    if (a.max != null) quota = Math.min(quota, a.max);
    const order = eligible.slice().sort((x, y) => hash01(x, 600 + a.salt) - hash01(y, 600 + a.salt));
    const used = new Map();
    for (const t of order) {
      if (used.size >= quota) break;
      const blocked = a.space > 0 && [...near(t, a.space, ring)].some((n) => used.has(n));
      if (blocked) continue;
      let list = a.variants(facts.get(t));
      if (a.perVariant) list = (list || []).filter((v) => [...used.values()].filter((u) => u === nameOf(v)).length < a.perVariant);
      if (!list || !list.length) continue;
      const v = chooseVariant(list, t, a.salt, near2.get(t), used);
      used.set(t, v);
      plan.get(t)[key] = v;
    }
  }
  // A stray is a second kind: never the herd it stands beside.
  for (const slot of plan.values()) if (slot.stray != null && slot.stray === slot.herd) delete slot.stray;
  return plan;
}

export const _testing = { near, chooseVariant };
