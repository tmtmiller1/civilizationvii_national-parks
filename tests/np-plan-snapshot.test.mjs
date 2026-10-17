// The park plan's exact output, pinned. np-plan.test.mjs checks what a plan must always be (invariants); this checks
// that it is the same plan as before, to the last bit, so a refactor of parkPlan can be shown to change nothing.
//
// Every case is a park grown on a generated land (seeds × sizes × levels 0-3 × National Park and Wilderness Area),
// planned, written out in full as JSON (Maps and Sets in insertion order, every number as JSON prints it, which is
// exact), and hashed by part, so a failure names the parts that moved. The fields (water, wood, people and the rest)
// are sampled at fixed points of every tile. The inland seeds have one biome each and the same drifts of land as
// np-plan.test.mjs (10 and 20 are there because their parks have room for a picnic shelter, which few do); the coastal
// seeds 6-9 mix biomes and add a sea coast, a navigable river and natural wonders, so the shore and sea code runs too.
// Between them every line of np-plan.js runs but `weighted`'s last-resort return.
//
// A change to the plan that is meant: run `UPDATE_SNAPSHOT=1 node --test tests/np-plan-snapshot.test.mjs`, and say in
// the commit what moved. A Node upgrade that changed Math.cos or Math.hypot in the last bit would show here too.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { hash01 } from "../ui/np-core.js";
import { parkPlan, describePlan } from "../ui/np-plan.js";

const SNAPSHOT = fileURLToPath(new URL("./np-plan.snapshot.json", import.meta.url));
const W = 40;
const ring = (p) => [p + 1, p + W, p + W - 1, p - 1, p - W, p - W + 1];
const BIOMES = ["BIOME_GRASSLAND", "BIOME_PLAINS", "BIOME_DESERT", "BIOME_TUNDRA", "BIOME_TROPICAL"];
const WOODS = { BIOME_GRASSLAND: "FEATURE_FOREST", BIOME_PLAINS: "FEATURE_SAVANNA_WOODLAND",
  BIOME_DESERT: "FEATURE_SAGEBRUSH_STEPPE", BIOME_TUNDRA: "FEATURE_TAIGA", BIOME_TROPICAL: "FEATURE_RAINFOREST" };
const WETS = { BIOME_GRASSLAND: "FEATURE_MARSH", BIOME_PLAINS: "FEATURE_WATERING_HOLE", BIOME_DESERT: "FEATURE_OASIS",
  BIOME_TUNDRA: "FEATURE_TUNDRA_BOG", BIOME_TROPICAL: "FEATURE_MARSH" };
const COASTAL = new Set([6, 7, 8, 9]);
const RESOURCES = ["RESOURCE_GOLD", "RESOURCE_SALT", "RESOURCE_FISH"];
const MODELS = new Set([...Object.values(WOODS), ...Object.values(WETS), "FEATURE_MANGROVE"]);

/** A land on a hex sheet 40 wide, in drifts three tiles across. */
function land(seed) {
  const coastal = COASTAL.has(seed);
  const row = (t) => Math.floor(t / W), col = (t) => t % W;
  const block = (t) => Math.floor(row(t) / 5) * 20 + Math.floor(col(t) / 5);
  const one = BIOMES[seed === 20 ? 2 : (seed - 1) % 5];
  const biome = (t) => (coastal ? BIOMES[Math.floor(hash01(block(t), seed + 40) * 5)] : one);
  const kind = (t) => {
    if (coastal && row(t) >= 23 + (seed % 2)) return "sea";
    if (coastal && seed % 2 === 0 && col(t) === 17) return "nav";
    const v = hash01(Math.floor(row(t) / 3) * 50 + Math.floor(col(t) / 3) + seed * 977, 1);
    if (coastal && v < 0.03) return "wonder";
    return v < 0.1 ? "lake" : v < 0.17 ? "mountain" : v < 0.37 ? "hill" : v < 0.57 ? "wood" : v < 0.62 ? "wet" : "open";
  };
  const feature = (t) => {
    const k = kind(t), b = biome(t);
    if (k === "wood") {
      if (coastal && b === "BIOME_TROPICAL" && row(t) >= 20) return "FEATURE_MANGROVE";
      return hash01(t, seed + 2) < 0.4 ? "FEATURE_FOREST" : WOODS[b];
    }
    if (k === "wet") return hash01(t, seed + 3) < 0.5 ? "FEATURE_POND" : WETS[b];
    if (k === "wonder") return "FEATURE_WONDER_" + (seed % 3);
    return "";
  };
  return { ring, kind, biome, feature, model: (t) => (MODELS.has(feature(t)) ? feature(t) : ""),
    hill: (t) => kind(t) === "hill", sea: (t) => kind(t) === "sea", lake: (t) => kind(t) === "lake",
    nav: (t) => kind(t) === "nav", mountain: (t) => kind(t) === "mountain", wonder: (t) => kind(t) === "wonder",
    river: (t) => (kind(t) === "open" || kind(t) === "hill") && hash01(t + seed, 9) < 0.15,
    wooded: (t) => kind(t) === "wood" && feature(t) !== "FEATURE_SAGEBRUSH_STEPPE",
    wet: (t) => kind(t) === "wet",
    resource: (t) => (hash01(t + seed * 31, 17) < 0.07 ? RESOURCES[t % 3] : ""),
    cliff: (t) => kind(t) !== "lake" && kind(t) !== "sea" && hash01(t + seed * 13, 19) < 0.12 };
}
/** A park grown tile by tile from its founding tile, as the game grows one. */
function grown(seed, n, map) {
  let anchor = 20 * W + 20;
  while (map.kind(anchor) !== "open") anchor++;
  const tiles = [anchor];
  while (tiles.length < n) {
    const edge = [...new Set(tiles.flatMap(ring))].filter((t) => !tiles.includes(t))
      .sort((a, b) => hash01(a, seed + 5) - hash01(b, seed + 5));
    tiles.push(edge[0]);
  }
  return { tiles, anchor };
}

/** A value as plain JSON: Maps and Sets as tagged lists in insertion order, functions marked, -0 and non-finite
 *  numbers spelled out. */
function plain(v) {
  if (v instanceof Map) return { map: [...v].map(([k, x]) => [plain(k), plain(x)]) };
  if (v instanceof Set) return { set: [...v].map(plain) };
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "function") return "fn";
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : Number.isFinite(v) ? v : String(v);
  if (v === undefined) return "undefined";
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).map((k) => [k, plain(v[k])]));
  return v;
}
/** The fields and tileAt read at the middle of every tile and at points toward each of its edges. */
function sampled(plan) {
  const out = [];
  for (const t of plan.tiles) {
    const c = plan.pos.get(t);
    for (let k = 0; k < 13; k++) {
      const a = (k - 1) * 30 * Math.PI / 180, r = k === 0 ? 0 : k % 2 ? 0.25 : 0.49;
      const p = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
      const f = plan.fields;
      out.push([f.water(p), f.wood(p), f.rough(p), f.people(p), f.open(p), f.path(p), f.river(p), f.density(p, 0.45),
        plan.tileAt(p)]);
    }
  }
  return out;
}
const PARTS = {
  land: (p) => [Object.keys(p), p.tiles, p.anchor, p.level, p.buildings, p.pos, p.facts, p.regions, p.character,
    p.steps, p.corner, p.budgets],
  routes: (p) => [p.destinations, p.paths, p.segments, p.focal],
  built: (p) => [p.built, p.keepOut],
  herds: (p) => [p.herds, p.quiet],
  growth: (p) => [p.stands, p.patches],
  fields: sampled,
  pieces: (p) => p.pieces,
  wild: (p) => p.wild,
  text: (p) => describePlan(p),
};
const digest = (v) => createHash("sha256").update(JSON.stringify(plain(v))).digest("hex").slice(0, 8);
const count = (m) => [...m.values()].reduce((n, l) => n + l.length, 0);
/** One line per case: each part's digest, and how many pieces and animals the park draws. */
function line(plan) {
  return Object.entries(PARTS).map(([k, f]) => `${k}:${digest(f(plan))}`).join(" ")
    + ` #${count(plan.pieces)}/${count(plan.wild)}`;
}

const SEEDS = [1, 2, 3, 4, 5, 10, 20, 6, 7, 8, 9], SIZES = [1, 2, 3, 5, 8, 12, 17, 24];
function cases() {
  const out = {};
  for (const seed of SEEDS) {
    const map = land(seed);
    for (const n of SIZES) {
      const { tiles, anchor } = grown(seed, n, map);
      for (let level = 0; level <= 3; level++) for (const buildings of [true, false]) {
        const plan = parkPlan(tiles, anchor, { level, buildings, map });
        out[`s${seed} n${n} l${level} ${buildings ? "park" : "wild"}`] = line(plan);
      }
    }
  }
  return out;
}

test("plan snapshot: every pinned park plans exactly as before", () => {
  const now = cases();
  if (process.env.UPDATE_SNAPSHOT || !existsSync(SNAPSHOT)) {
    writeFileSync(SNAPSHOT, JSON.stringify(now, null, 1) + "\n");
    if (!process.env.UPDATE_SNAPSHOT) assert.fail("no snapshot was on disk; wrote one, check it in and run again");
    return;
  }
  const was = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const moved = [];
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    if (!(key in now) || !(key in was)) {
      moved.push(`${key}: ${key in now ? "not in the snapshot" : "no longer planned"}`);
      continue;
    }
    if (was[key] === now[key]) continue;
    const a = was[key].split(" "), b = now[key].split(" ");
    moved.push(`${key}: ${b.filter((x, k) => x !== a[k]).map((x) => x.split(":")[0]).join(", ")}`);
  }
  assert.ok(Object.keys(now).length === SEEDS.length * SIZES.length * 8, "the case list changed");
  const list = moved.slice(0, 25).join("\n  ");
  assert.equal(moved.length, 0, `${moved.length} of ${Object.keys(now).length} plans changed:\n  ${list}`);
});
