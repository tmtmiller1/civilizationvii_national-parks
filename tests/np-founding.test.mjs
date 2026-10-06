import test from "node:test";
import assert from "node:assert/strict";

import { foundable, isCharming, landPayout, landMarker, milestoneLevel, MILESTONES, KINDS, parkLevel, markerFor,
  foundingRefund, foundingFate, completionOutcome, staleQueueEntries, FOUNDING_ASK_TURNS, GOLD_PER_PRODUCTION,
  addFounding, foundings, dropFounding, settlementHasKind, addNotice, noticesFor, dropNotice, notices, resetCache } from "../ui/np-core.js";

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

// what a completed project does

// A Found project costs 400 production and an Expand project 300 (data/national-parks-*.xml); bought, each costs
// GOLD_PER_PRODUCTION Gold a point, and that price is what a completion that can do nothing gives back.
const FOUND_PRICE = 400 * GOLD_PER_PRODUCTION;
const EXPAND_PRICE = 300 * GOLD_PER_PRODUCTION;
const foundDone = (over = {}) => ({ project: "found", settlement: true, hasKind: false, price: FOUND_PRICE, ...over });
const expandDone = (over = {}) => ({ project: "expand", settlement: true, park: true, full: false, price: EXPAND_PRICE, ...over });

test("completion: a Found project founds, and records its cost at the purchase rate as what was paid", () => {
  assert.deepEqual(completionOutcome(foundDone()), { act: "found", why: "", gold: 1600 });
});

test("completion: a second Found project in a settlement with that kind, or one waiting, is paid back in full", () => {
  assert.deepEqual(completionOutcome(foundDone({ hasKind: true })), { act: "refund", why: "duplicate", gold: 1600 });
  assert.deepEqual(completionOutcome(foundDone({ hasKind: true, price: 2399.6 })), { act: "refund", why: "duplicate", gold: 2400 },
    "the price of the game's speed, rounded as the purchase is");
});

test("completion: an Expand project grows its park; on a full park or with no park it is paid back", () => {
  assert.deepEqual(completionOutcome(expandDone()), { act: "expand", why: "", gold: 0 });
  assert.deepEqual(completionOutcome(expandDone({ full: true })), { act: "refund", why: "full", gold: 1200 });
  assert.deepEqual(completionOutcome(expandDone({ park: false })), { act: "refund", why: "no-park", gold: 1200 });
});

test("completion: nothing is paid only when no settlement is named, so there is no one to pay", () => {
  assert.equal(completionOutcome(foundDone({ settlement: false })).act, "drop");
  assert.equal(completionOutcome(foundDone({ settlement: false, hasKind: true })).act, "drop");
  assert.deepEqual(completionOutcome(expandDone({ settlement: false, park: false })), { act: "drop", why: "no-park", gold: 0 });
  assert.equal(completionOutcome(expandDone({ settlement: false })).act, "expand", "a park found by its founding tile still grows");
});

// what becomes of a founding still waiting

const waiting = (over = {}) => ({ settlement: true, ownerAlive: true, human: true, tiles: 3, turn: 40, asked: null,
  paid: 1600, price: 0, readOnly: false, ...over });

test("refund: what the record says was paid; an older save's record, which holds no figure, gets the price now", () => {
  assert.equal(foundingRefund({ paid: 1600 }, 2400), 1600);
  assert.equal(foundingRefund({ paid: 1234.4 }, 0), 1234);
  assert.equal(foundingRefund({}, 2400), 2400);
  assert.equal(foundingRefund({ paid: 0 }, 2400), 2400);
  assert.equal(foundingRefund({ paid: "x" }, 1600), 1600);
  assert.equal(foundingRefund({}, undefined), 0);
  assert.equal(foundingRefund(null, 800), 800);
});

test("waiting founding: with its settlement and land to stand on, it waits", () => {
  assert.equal(foundingFate(waiting()).act, "keep");
  assert.equal(foundingFate(waiting({ human: false })).act, "keep", "an AI's is placed by the sweep");
});

test("waiting founding: its settlement gone or in other hands, the Gold paid goes back to its owner", () => {
  assert.deepEqual(foundingFate(waiting({ settlement: false })), { act: "refund", why: "settlement", gold: 1600 });
  assert.deepEqual(foundingFate(waiting({ settlement: false, human: false, paid: 2000 })), { act: "refund", why: "settlement", gold: 2000 },
    "an AI's too");
  assert.deepEqual(foundingFate(waiting({ settlement: false, paid: undefined, price: 2400 })), { act: "refund", why: "settlement", gold: 2400 },
    "an older save's record: the price now");
  assert.deepEqual(foundingFate(waiting({ settlement: false, tiles: 0 })), { act: "refund", why: "settlement", gold: 1600 });
});

test("waiting founding: an owner out of the game gets nothing, and nothing is paid with nothing recorded or priced", () => {
  assert.deepEqual(foundingFate(waiting({ settlement: false, ownerAlive: false })), { act: "drop", why: "owner", gold: 0 });
  assert.deepEqual(foundingFate(waiting({ settlement: false, paid: undefined, price: 0 })), { act: "drop", why: "settlement", gold: 0 });
});

test("waiting founding: a network game writes nothing, so it is let go as before, with no Gold moved", () => {
  assert.deepEqual(foundingFate(waiting({ readOnly: true, settlement: false })), { act: "drop", why: "settlement", gold: 0 });
  assert.equal(foundingFate(waiting({ readOnly: true })).act, "keep");
  assert.equal(foundingFate(waiting({ readOnly: true, tiles: 0 })).act, "keep");
  assert.equal(foundingFate(waiting({ readOnly: true, tiles: 0, human: false })).act, "keep");
});

test("waiting founding: with no land, a human is told at once and again every FOUNDING_ASK_TURNS; it never ends by itself", () => {
  assert.equal(FOUNDING_ASK_TURNS, 10);
  assert.deepEqual(foundingFate(waiting({ tiles: 0 })), { act: "ask", why: "no-land", gold: 1600 }, "never told");
  assert.equal(foundingFate(waiting({ tiles: 0, asked: 40 })).act, "keep", "told this turn");
  assert.equal(foundingFate(waiting({ tiles: 0, asked: 31 })).act, "keep");
  assert.equal(foundingFate(waiting({ tiles: 0, asked: 30 })).act, "ask");
  assert.equal(foundingFate(waiting({ tiles: 0, asked: 120, turn: 2 })).act, "ask", "a new age's turn counter");
  assert.equal(foundingFate(waiting({ tiles: 0, asked: 0, turn: 5 })).act, "keep", "told on turn 0");
});

test("waiting founding: an AI's with no land left ends, and its Gold goes back", () => {
  assert.deepEqual(foundingFate(waiting({ tiles: 0, human: false })), { act: "refund", why: "no-land", gold: 1600 });
  assert.deepEqual(foundingFate(waiting({ tiles: 0, human: false, paid: undefined, price: 0 })), { act: "drop", why: "no-land", gold: 0 });
});

// the build queue

test("build queue: a Found project comes out once the settlement has that kind or one waiting; a second copy always", () => {
  const P = KINDS.park, W = KINDS.wilderness;
  const none = () => false;
  assert.deepEqual(staleQueueEntries([null, P.found, null], none, none), [], "the one copy stays");
  assert.deepEqual(staleQueueEntries([null, P.found, null], (k) => k === "park", none), [1], "bought for Gold meanwhile");
  assert.deepEqual(staleQueueEntries([P.found, null, P.found], none, none), [2], "the first stays");
  assert.deepEqual(staleQueueEntries([P.found, W.found, P.found, W.found], (k) => k === "wilderness", none), [3, 2, 1],
    "each kind by itself; positions last first");
  assert.deepEqual(staleQueueEntries([W.found], (k) => k === "park", none), [], "the other kind's park does not count");
  assert.deepEqual(staleQueueEntries([], none, none), []);
});

test("build queue: an Expand project comes out only for a park at its full size; copies of it are allowed", () => {
  const P = KINDS.park, W = KINDS.wilderness;
  const none = () => false;
  assert.deepEqual(staleQueueEntries([P.project, P.project, W.project], none, none), []);
  assert.deepEqual(staleQueueEntries([P.project, null, P.project, W.project], none, (k) => k === "park"), [2, 0]);
  assert.deepEqual(staleQueueEntries([P.found, P.project], (k) => k === "park", (k) => k === "park"), [1, 0]);
});

// the save's record

test("founding record: holds what was paid and the settlement's name; an older record without them still counts", () => {
  resetCache();
  const city = { owner: 0, id: 65536, type: 1 };
  const bought = addFounding("park", 0, city, { paid: 1599.6, by: "gold", name: "LOC_CITY_NAME_ROME" });
  assert.equal(bought.paid, 1600);
  assert.equal(bought.by, "gold");
  assert.equal(bought.name, "LOC_CITY_NAME_ROME");
  assert.equal(bought.asked, undefined, "its owner has not been told it has no land");
  const old = addFounding("wilderness", 0, city);
  assert.deepEqual(Object.keys(old).sort(), ["city", "id", "kind", "made", "owner"], "the record of saves before the cost was kept");
  assert.equal(settlementHasKind(city, "park"), true);
  assert.equal(settlementHasKind(city, "wilderness"), true);
  assert.equal(settlementHasKind({ owner: 1, id: 65536, type: 1 }, "park"), false, "another player's settlement of the same id");
  assert.equal(foundingRefund(old, 1600), 1600);
  dropFounding(bought.id);
  assert.equal(settlementHasKind(city, "park"), false);
  assert.equal(foundings().length, 1);
  resetCache();
});

test("notices: kept per player, so one seat's refund is never another's", () => {
  resetCache();
  const a = addNotice({ owner: 0, why: "duplicate", gold: 1600, kind: "park", name: "LOC_CITY_NAME_ROME" });
  const b = addNotice({ owner: 1, why: "settlement", gold: 1200, kind: "wilderness", name: "" });
  assert.notEqual(a.id, b.id);
  assert.deepEqual(noticesFor(0).map((n) => n.gold), [1600]);
  assert.deepEqual(noticesFor(1).map((n) => n.why), ["settlement"]);
  assert.deepEqual(noticesFor(2), []);
  dropNotice(a.id);
  assert.deepEqual(noticesFor(0), []);
  assert.equal(notices().length, 1, "the other seat's waits for its turn");
  resetCache();
});

test("refund notices: every reason a human can be told has its text", async () => {
  const fs = await import("node:fs");
  const picker = fs.readFileSync("ui/np-picker.js", "utf8");
  const table = picker.match(/const REFUND_BODY = \{([\s\S]*?)\};/)[1];
  const whys = [...table.matchAll(/"?([a-z-]+)"?: "LOC_/g)].map((m) => m[1]).sort();
  const told = new Set();
  for (const f of [foundDone({ hasKind: true }), expandDone({ full: true }), expandDone({ park: false })]) told.add(completionOutcome(f).why);
  told.add(foundingFate(waiting({ settlement: false })).why);
  assert.deepEqual(whys, [...told].sort());
});
