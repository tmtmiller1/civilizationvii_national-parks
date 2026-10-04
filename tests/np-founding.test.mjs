import test from "node:test";
import assert from "node:assert/strict";

import { foundable, isCharming, landPayout, landMarker, milestoneLevel, MILESTONES, KINDS, parkLevel, markerFor } from "../ui/np-core.js";

// Facts for an empty, Charming flat tile the founding settlement holds; each test changes one.
const empty = (over = {}) => ({ taken: false, stray: false, ownCity: true, water: false, mountain: false, wonder: false,
  terrain: "TERRAIN_FLAT", district: false, items: 0, charming: true, ...over });

test("founding: an empty flat or hill tile of the settlement, with or without a resource or feature", () => {
  assert.equal(foundable(empty()), true);
  assert.equal(foundable(empty({ terrain: "TERRAIN_HILL" })), true);
});

test("founding: nothing man-made on the tile", () => {
  assert.equal(foundable(empty({ district: true })), false, "a district (rural, urban, wilderness)");
  assert.equal(foundable(empty({ items: 1 })), false, "an improvement or building");
});

test("founding: only the settlement's own land, not another park's, not unreadable", () => {
  assert.equal(foundable(empty({ ownCity: false })), false);
  assert.equal(foundable(empty({ taken: true })), false);
  assert.equal(foundable(empty({ stray: true })), false);
});

test("founding: not on water, a mountain or a natural wonder (they may join afterwards)", () => {
  assert.equal(foundable(empty({ water: true })), false);
  assert.equal(foundable(empty({ mountain: true })), false);
  assert.equal(foundable(empty({ wonder: true })), false);
  assert.equal(foundable(empty({ terrain: "TERRAIN_MOUNTAIN" })), false);
});

test("founding: Charming land only, by the game's own appeal", () => {
  assert.equal(foundable(empty({ charming: false })), false, "Average land is refused");
  assert.equal(foundable(empty({ charming: undefined })), false, "a tile whose appeal could not be read is refused");
});

test("Charming: the game's threshold, inclusive; no thresholds read means nothing qualifies", () => {
  const TH = { charming: 3 };   // GlobalParameters on 1.5.0; the code reads it from the database
  assert.equal(isCharming(2, TH), false);
  assert.equal(isCharming(3, TH), true);
  assert.equal(isCharming(29, TH), true, "beside or on a natural wonder");
  assert.equal(isCharming(3, { charming: Infinity }), false);
});

test("milestones: a player's park land of a kind reaches levels at 8, 16 and 24 tiles, and falls back below them", () => {
  assert.deepEqual(MILESTONES, [8, 16, 24]);
  assert.equal(milestoneLevel(0), 0);
  assert.equal(milestoneLevel(7), 0);
  assert.equal(milestoneLevel(8), 1);
  assert.equal(milestoneLevel(15), 1);
  assert.equal(milestoneLevel(16), 2);
  assert.equal(milestoneLevel(24), 3);
  assert.equal(milestoneLevel(48), 3, "two full parks earn no level past the last");
});

test("size levels: each park levels on its own tiles, whatever other parks its owner holds", () => {
  const park = (n, kind = "park") => ({ id: n, owner: 0, kind, anchor: 0, tiles: Array.from({ length: n }, (_x, k) => k) });
  assert.equal(parkLevel(park(7)), 0);
  assert.equal(parkLevel(park(8)), 1);
  assert.equal(parkLevel(park(23)), 2);
  assert.equal(parkLevel(park(24)), 3);
  assert.equal(markerFor(park(5)), "IMPROVEMENT_NATIONAL_PARK_LAND", "a 5-tile park pays the base, beside a 3-tile one or not");
  assert.equal(markerFor(park(16, "wilderness")), "IMPROVEMENT_WILDERNESS_AREA_LAND_16");
});

test("size levels: each kind's land marker per level, its yields matching landPayout and rising level by level", async () => {
  const fs = await import("node:fs");
  const xml = fs.readFileSync("data/national-parks-land.xml", "utf8");
  const sum = (type) => [...xml.matchAll(new RegExp(`ConstructibleType="${type}" YieldType="(\\w+)" YieldChange="(\\d+)"`, "g"))]
    .reduce((o, m) => ({ points: o.points + Number(m[2]), happiness: o.happiness + (m[1] === "YIELD_HAPPINESS" ? Number(m[2]) : 0) }),
      { points: 0, happiness: 0 });
  for (const k of Object.values(KINDS)) {
    assert.equal(landMarker(k, 0), k.land);
    let last = -1;
    for (let level = 0; level <= 3; level++) {
      const type = landMarker(k, level);
      assert.deepEqual(landPayout(k.key, level), sum(type), `${type}`);
      assert.ok(landPayout(k.key, level).points > last, `${type} pays more than the level below`);
      last = landPayout(k.key, level).points;
    }
  }
  assert.deepEqual(landPayout("park", 0), { points: 2, happiness: 1 }, "+1 Culture +1 Happiness");
  assert.deepEqual(landPayout("park", 3), { points: 5, happiness: 2 }, "+3 Culture +2 Happiness");
  assert.deepEqual(landPayout("wilderness", 0), { points: 3, happiness: 0 });
  assert.deepEqual(landPayout("wilderness", 3), { points: 6, happiness: 0 });
});
