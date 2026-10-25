// A founding on water, on a fake engine (fake-engine.mjs): a park may stand on an empty water tile, and a founding
// gives 4 tiles, the founding tile and 3 for its owner to choose. An AI's park takes its 3 once its founding stands.
import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import { makeEngine, W } from "./fake-engine.mjs";

register("./game-modules-loader.mjs", import.meta.url);
const eng = makeEngine();
const recorder = () => new Proxy({}, { get: () => () => ({ state: "IDLE", setState: () => {} }) });
globalThis.WorldUI = { createModelGroup: recorder, createOverlayGroup: recorder };
globalThis.PlacementMode = { TERRAIN: 1, WATER: 2 };
const listeners = new Map();
globalThis.engine = { on: (n, f) => listeners.set(n, f), off: (n) => listeners.delete(n) };
const fire = (name, data) => { const f = listeners.get(name); if (f) f(data); };
mock.timers.enable({ apis: ["setTimeout", "Date"] });
after(() => { if (globalThis.__towerNationalPark) globalThis.__towerNationalPark.stop(); mock.timers.reset(); });
async function settle(ms = 20000) { for (let k = 0; k < ms / 100; k++) { mock.timers.tick(100); await new Promise((r) => setImmediate(r)); } }
async function turns(n) { for (let k = 0; k < n; k++) { Game.turn++; fire("PlayerTurnActivated", { player: 0 }); await settle(); } }

const at = (row, x) => row * W + x;
const PARK = "IMPROVEMENT_NATIONAL_PARK";
const city = (owner) => ({ owner, id: 1, type: 1 });
const core = await import("../ui/np-core.js");
await import("../ui/np-main.js");
await settle(8000);

test("water founding: an empty coast tile is offered and the park stands on it, with 3 tiles to choose", async () => {
  for (const x of [2, 3, 4, 5]) eng.setPlot(at(10, x), { owner: 0, terrain: "TERRAIN_COAST" });
  const sea = at(10, 2);
  assert.ok(core.foundingTiles(city(0)).includes(sea), "the water tile is offered");
  const f = core.addFounding("park", 0, city(0), { paid: 1600, by: "gold", name: "Roma" });
  const park = core.foundPark(f, sea);
  assert.ok(park, "founded");
  assert.equal(park.pending, core.FOUNDING_TILES - 1, "3 more tiles wait for the player");
  await settle();
  assert.deepEqual(eng.typesAt(sea), [PARK], "the park improvement stands on the water");
  assert.equal(park.founding, undefined, "and the founding is spent");
  await turns(1);
  assert.equal(core.parks().find((p) => p.id === park.id).pending, 3, "a human's tiles wait for Choose land");
  assert.ok(core.eligibleTiles(park).includes(at(10, 3)), "the water beside it can join");
});

test("water founding: an AI's park takes its 3 founding tiles once its founding stands", async () => {
  for (const x of [2, 3, 4, 5, 6]) eng.setPlot(at(14, x), { owner: 2, terrain: "TERRAIN_COAST" });
  const sea = at(14, 2);
  const f = core.addFounding("park", 2, city(2), { paid: 900, by: "gold", name: "City 2-1" });
  const from = eng.trace.length;
  const park = core.foundPark(f, sea);
  assert.ok(park);
  assert.equal(park.tiles.length, 1, "nothing taken before the founding stands");
  await settle();
  await turns(2);
  const now = core.parks().find((p) => p.id === park.id);
  const took = eng.trace.slice(from).filter(([k, m]) => k === "log" && new RegExp(`^AI park ${park.id} took 3 tile`).test(m));
  assert.equal(took.length, 1, "its 3 founding tiles, in one go");
  assert.ok(now.tiles.length >= core.FOUNDING_TILES, "4 tiles or more (it may buy an expansion as well)");
  assert.equal(now.pending, 0, "none left waiting");
});
