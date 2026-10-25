// Claiming land nobody holds, on a fake engine (fake-engine.mjs): a park may take an unheld tile beside it within
// CLAIM_RING of its settlement, which buys the plot for that settlement before the marker goes on. Another player's
// land, land with something on it, and land past the ring stay out; a claim the game doesn't hand over gives the tile
// back to be chosen again.
import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { makeEngine, W } from "./fake-engine.mjs";

register("./game-modules-loader.mjs", import.meta.url);
const eng = makeEngine();
const recorder = () => new Proxy({}, { get: () => () => ({ state: "IDLE", setState: () => {} }) });
globalThis.WorldUI = { createModelGroup: recorder, createOverlayGroup: recorder };
globalThis.PlacementMode = { TERRAIN: 1, WATER: 2 };
globalThis.engine = { on: () => {}, off: () => {} };
mock.timers.enable({ apis: ["setTimeout", "Date"] });
after(() => { if (globalThis.__towerNationalPark) globalThis.__towerNationalPark.stop(); mock.timers.reset(); });
async function settle(ms = 20000) { for (let k = 0; k < ms / 100; k++) { mock.timers.tick(100); await new Promise((r) => setImmediate(r)); } }

const at = (row, x) => row * W + x;
const MARKER = "IMPROVEMENT_NATIONAL_PARK_LAND";
const core = await import("../ui/np-core.js");
await import("../ui/np-main.js");
await settle(8000);

// The fake settlement's center is 0,0 and its distance is |dx| + |dy|: row 2 is in reach, row 7 past ring 6.
function parkAt(row) {
  eng.setPlot(at(row, 1), { owner: 0 });
  const f = core.addFounding("park", 0, { owner: 0, id: 1, type: 1 }, { paid: 1600, by: "gold", name: "Roma" });
  return core.foundPark(f, at(row, 1));
}

test("claim: the rule, on facts", () => {
  const f = { taken: false, stray: false, parkOwner: 0, district: "none", built: false };
  assert.equal(core.joinable({ ...f, owner: -1, claimable: true }), true, "nobody's land in reach");
  assert.equal(core.joinable({ ...f, owner: -1, claimable: false }), false, "nobody's land out of reach");
  assert.equal(core.joinable({ ...f, owner: 3, claimable: false }), false, "another player's land");
  assert.equal(core.joinable({ ...f, owner: 0 }), true, "the owner's own land, as before");
  assert.equal(core.CLAIM_RING, 6);
});

test("claim: unheld land beside a park in reach is offered, then bought for the settlement and marked", async () => {
  const park = parkAt(2);
  await settle();
  const free = at(2, 2), theirs = at(3, 1), built = at(1, 1);
  eng.setPlot(theirs, { owner: 3 });
  eng.district(built); eng.build(built, "IMPROVEMENT_FARM", -1);
  const offered = core.eligibleTiles(park);
  assert.ok(offered.includes(free), "nobody's empty tile is offered");
  assert.ok(!offered.includes(theirs), "another player's isn't");
  assert.ok(!offered.includes(built), "nobody's tile with something on it isn't");
  const from = eng.trace.length;
  assert.ok(core.addTile(park, free));
  await settle();
  assert.ok(eng.trace.slice(from).some(([k, i]) => k === "buy" && i === free), "the plot was bought");
  assert.equal(core.ownerOf(free), 0, "it's the settlement's now");
  assert.deepEqual(eng.typesAt(free), [MARKER], "and park land");
});

test("claim: land past ring 6 isn't offered", async () => {
  const park = parkAt(7);
  await settle();
  assert.ok(!core.eligibleTiles(park).includes(at(7, 2)), "ring 8 from the settlement");
});

test("claim: a purchase the game doesn't hand over gives the tile back to be chosen again", async () => {
  const park = parkAt(4);
  await settle();
  const free = at(4, 2);
  const real = globalThis.Cities.get;
  globalThis.Cities.get = (id) => ({ ...real(id), purchasePlot: () => {} });
  park.pending = 1;
  assert.ok(core.addTile(park, free));
  assert.equal(park.pending, 0);
  await settle();
  globalThis.Cities.get = real;
  assert.ok(!park.tiles.includes(free), "the tile left the park");
  assert.equal(park.pending, 1, "and its place in the expansion came back");
  assert.equal(core.ownerOf(free), -1, "nobody holds it");
});
