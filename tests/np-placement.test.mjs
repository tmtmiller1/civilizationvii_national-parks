// Where the plan puts a coast's sea life by latitude, which rarer animal a tropical Wilderness Area gets, and where a
// park may have walls inside it.
import test from "node:test";
import assert from "node:assert/strict";

import { hash01 } from "../ui/np-core.js";
import { parkPlan } from "../ui/np-plan.js";
import { rareFor } from "../ui/np-wildlife.js";
import { wallEdges } from "../ui/np-draw.js";

// A coast on a hex sheet 40 wide: open land and woods down to row 21, sea from row 22; `lat` is every tile's latitude.
const W = 40;
const ring = (p) => [p + 1, p + W, p + W - 1, p - 1, p - W, p - W + 1];
function coast(lat, biome = "BIOME_GRASSLAND") {
  const sea = (t) => Math.floor(t / W) >= 22;
  const wood = (t) => !sea(t) && hash01(t, 5) < 0.3;
  return { ring, biome: () => biome, feature: (t) => (wood(t) ? "FEATURE_FOREST" : ""), model: (t) => (wood(t) ? "FEATURE_FOREST" : ""),
    hill: () => false, sea, lake: () => false, nav: () => false, river: () => false, mountain: () => false,
    wonder: () => false, wooded: wood, wet: () => false, resource: () => "", cliff: () => false, lat: () => lat };
}
/** A park along the coast: a strip of land and the sea in front of it. */
function shorePark() {
  const tiles = [];
  for (const row of [20, 21, 22, 23]) for (let c = 14; c < 20; c++) tiles.push(row * W + c);
  return { tiles, anchor: 20 * W + 16 };
}
const wildAssets = (plan) => [...plan.wild.values()].flat().map((w) => w.asset);
const pieceAssets = (plan) => [...plan.pieces.values()].flat().map((e) => e[0]);
const REEF = /ReefNeedle|Clown/;

function plans(lat) {
  const { tiles, anchor } = shorePark();
  return [true, false].flatMap((buildings) => [0, 1, 2, 3].map((level) => parkPlan(tiles, anchor, { level, buildings, map: coast(lat) })));
}

test("sea life: reef fish by a warm shore, none by a cold one", () => {
  const warm = plans(10), cold = plans(70);
  assert.ok(warm.some((p) => wildAssets(p).some((a) => REEF.test(a))), "a warm coast has its reef");
  for (const p of cold) assert.ok(!wildAssets(p).some((a) => REEF.test(a)), "a reef fish in cold water");
  // Southern seas are cold the same way.
  for (const p of plans(-65)) assert.ok(!wildAssets(p).some((a) => REEF.test(a)), "a reef fish in a cold southern sea");
});

test("sea life: a cold shore has crabs, sponges and more whales instead", () => {
  const warm = plans(10), cold = plans(70);
  const count = (list, re) => list.reduce((n, p) => n + wildAssets(p).filter((a) => re.test(a)).length, 0);
  assert.ok(count(cold, /CHAR_Crab/) > count(warm, /CHAR_Crab/), "more crabs on a cold shore");
  assert.ok(cold.every((p) => pieceAssets(p).some((a) => /^FOL_Arctic_Coral_/.test(a))), "sponges on a cold sea floor");
  assert.ok(warm.every((p) => !pieceAssets(p).some((a) => /^FOL_Arctic_Coral_/.test(a))), "sponges in warm water");
  assert.ok(count(cold, /Whale/) > count(warm, /Whale/), "more whales in a cold sea");
});

test("sea life: the boundary is 40 degrees, and a map with no latitude is warm", () => {
  for (const p of plans(39)) assert.ok(!pieceAssets(p).some((a) => /^FOL_Arctic_Coral_/.test(a)), "sponges at 39 degrees");
  for (const p of plans(40)) assert.ok(!wildAssets(p).some((a) => REEF.test(a)), "a reef at 40 degrees");
  const { tiles, anchor } = shorePark();
  const noLat = { ...coast(0) };
  delete noLat.lat;
  const plan = parkPlan(tiles, anchor, { level: 2, buildings: true, map: noLat });
  assert.ok(!pieceAssets(plan).some((a) => /^FOL_Arctic_Coral_/.test(a)), "no latitude reads as warm");
});

test("rarer animals: elephants in the tropics, giraffes on the plains, goats on hills, turtles on a shore", () => {
  assert.deepEqual(rareFor({ biome: "BIOME_TROPICAL" }), ["elephant"]);
  assert.deepEqual(rareFor({ biome: "BIOME_PLAINS" }), ["giraffe"]);
  assert.deepEqual(rareFor({ biome: "BIOME_TROPICAL", hill: true }), ["goat"]);
  assert.deepEqual(rareFor({ biome: "BIOME_TROPICAL", shore: 2, coast: true }), ["turtle"]);
  assert.deepEqual(rareFor({ biome: "BIOME_GRASSLAND" }), []);
});

test("walls: inside a park only at its entrance, the founding tile's edges; none without one", () => {
  const tiles = [];
  for (let r = 2; r < 8; r++) for (let c = 2; c < 8; c++) tiles.push(r * 10 + c);
  const toy = (p) => [p + 1, p + 10, p + 9, p - 1, p - 10, p - 9];
  const inPark = new Set(tiles);
  const entrance = 44;
  const edges = wallEdges(tiles, toy, () => false, { innerShare: 1, entrance });
  const inner = edges.filter((e) => e.inner);
  assert.ok(inner.length > 0, "the entrance has its walls");
  for (const e of inner) {
    const n = toy(e.plot)[e.dir];
    assert.ok(inPark.has(n) && e.plot < n, "an inner wall off the park or counted twice");
    assert.ok(e.plot === entrance || n === entrance, `an inner wall away from the entrance, ${e.plot}-${n}`);
  }
  assert.equal(wallEdges(tiles, toy, () => false, { innerShare: 1 }).filter((e) => e.inner).length, 0, "no entrance, no inner wall");
  const outer = edges.filter((e) => !e.inner);
  const outerAll = tiles.flatMap((t) => toy(t).filter((n) => !inPark.has(n))).length;
  assert.ok(outer.length / outerAll > 0.85, `the border keeps its walls, ${outer.length}/${outerAll}`);
});
