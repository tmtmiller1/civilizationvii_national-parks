// np-main.js in one short game on a fake engine (fake-engine.mjs), with the game's own UI modules stood in for
// (game-modules-loader.mjs) and a recording WorldUI: the mod starts, the load sweep finds what's on the map, a turn
// passes, a park piece lands, an Expand project completes, the placement checks meet park land, and the mod stops.
// Each step's requests, log lines, Gold, city operations and drawing calls are compared with np-main.trace.json, so a
// change to the sweep or the start that should change nothing can be shown to change nothing.
//
// A change that is meant: run `UPDATE_SNAPSHOT=1 node --test tests/np-main-trace.test.mjs` and say what moved.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { makeEngine, W } from "./fake-engine.mjs";

register("./game-modules-loader.mjs", import.meta.url);
const TRACE = fileURLToPath(new URL("./np-main.trace.json", import.meta.url));
const eng = makeEngine();
const draws = [];
const recorder = (name) => new Proxy({}, {
  get: (_o, method) => (...args) => {
    draws.push([name, String(method), JSON.parse(JSON.stringify(args))]);
    return method === "addBorderOverlay" ? recorder(`${name}/border`) : { state: "IDLE", setState: () => {} };
  },
});
globalThis.WorldUI = { createModelGroup: (n) => recorder(n), createOverlayGroup: (n) => recorder(n) };
globalThis.PlacementMode = { TERRAIN: 1, WATER: 2 };
const listeners = new Map();
globalThis.engine = { on: (n, f) => listeners.set(n, f), off: (n) => listeners.delete(n) };
const fire = (name, data) => { const f = listeners.get(name); if (f) f(data); };
mock.timers.enable({ apis: ["setTimeout", "Date"] });

const at = (row, x) => row * W + x;
const PARK = "IMPROVEMENT_NATIONAL_PARK", LAND = "IMPROVEMENT_NATIONAL_PARK_LAND";
const city = (owner) => ({ owner, id: 1, type: 1 });
async function settle(ms = 20000) { for (let k = 0; k < ms / 100; k++) { mock.timers.tick(100); await new Promise((r) => setImmediate(r)); } }

// The map as the game is loaded: rows 1-6, each a situation the load sweep meets.
const core = await import("../ui/np-core.js");
// 1. A park improvement the registry doesn't hold (from a save made before the registry): registered and named.
for (const x of [2, 3]) eng.setPlot(at(1, x), { owner: 0 });
eng.district(at(1, 2)); eng.build(at(1, 2), PARK);
// 2. An AI's park with land waiting to be picked.
for (const x of [2, 3, 4, 5]) eng.setPlot(at(2, x), { owner: 1 });
eng.district(at(2, 2)); eng.build(at(2, 2), PARK);
const ai = core.createPark(at(2, 2), 1); ai.pending = 2;
// 3. An AI's founding, with empty land for it.
for (const x of [2, 3]) eng.setPlot(at(3, x), { owner: 2 });
core.addFounding("park", 2, city(2), { paid: 300, by: "gold", name: "City 2-1" });
// 4. A human's founding whose settlement is gone: refunded, with a notice.
core.addFounding("park", 0, { owner: 0, id: 7, type: 1 }, { paid: 250, by: "gold", name: "Lost Town" });
// 5. An AI's park whose founding tile went to no one, with Gold set aside for it.
for (const x of [3]) eng.setPlot(at(5, x), { owner: 1 });
const gone = core.createPark(at(5, 2), 1); gone.tiles.push(at(5, 3)); gone.aiFund = 120;
// 6. The human's park, three tiles, one of them farmed.
for (const x of [2, 3, 4, 5]) eng.setPlot(at(6, x), { owner: 0 });
eng.district(at(6, 2)); eng.build(at(6, 2), PARK);
const mine = core.createPark(at(6, 2), 0);
for (const x of [3, 4]) { mine.tiles.push(at(6, x)); eng.district(at(6, x)); eng.build(at(6, x), LAND); }
eng.build(at(6, 4), "IMPROVEMENT_FARM");
// 7. An AI's land beside a natural wonder: it founds a Wilderness Area there on its turn.
for (const x of [2, 3]) eng.setPlot(at(7, x), { owner: 1 });
eng.setPlot(at(7, 4), { feature: "FEATURE_WONDER" });
// 8. A Found project left in the human's build queue, though their settlement has a park already.
eng.queues.set("0:1", [{ projectType: "PROJECT_FOUND_NATIONAL_PARK", orderType: 1 }]);
core.save();

const steps = {};
let mark = { trace: 0, draws: 0 };
function record(name, extra = {}) {
  const t = eng.trace.slice(mark.trace), d = draws.slice(mark.draws);
  const count = {};
  for (const [, m] of d) count[m] = (count[m] || 0) + 1;
  steps[name] = { trace: t, draws: { count, digest: createHash("sha256").update(JSON.stringify(d)).digest("hex").slice(0, 16) },
    parks: core.parks().map((p) => ({ ...p })), foundings: core.foundings().map((f) => ({ ...f })), ...extra };
  mark = { trace: eng.trace.length, draws: draws.length };
}

await import("../ui/np-main.js");
const np = globalThis.__towerNationalPark;
record("start", { status: np.status() });
await settle(8000);
record("the load sweep");
fire("PlayerTurnActivated", { player: 0 });
await settle();
record("a turn");
eng.build(at(6, 5), LAND, 0);
fire("ConstructibleAddedToMap", { constructibleType: LAND, location: { x: 5, y: 6 } });
await settle();
record("a park piece lands");
fire("CityProjectCompleted", { player: 0, projectType: "PROJECT_EXPAND_NATIONAL_PARK", location: core.locOf(mine.anchor), cityID: city(0) });
await settle();
record("an Expand project completes");
fire("CityProjectCompleted", { player: 0, projectType: "PROJECT_FOUND_WILDERNESS_AREA", cityID: city(0) });
await settle();
record("a Found project completes");
record("a founding bought where there's a park", { bought: np.buyFounding(city(0), "park") });
core.limits.maxTiles = 3;
fire("CityProjectCompleted", { player: 0, projectType: "PROJECT_EXPAND_NATIONAL_PARK", location: core.locOf(mine.anchor), cityID: city(0) });
await settle();
core.limits.maxTiles = core.MAX_PARK_TILES;
record("an Expand project completes for a full park");
const plot = core.locOf(at(6, 3));
const checks = {
  build: JSON.parse(JSON.stringify(Game.CityOperations.canStart(city(0), "BUILD", { X: plot.x, Y: plot.y, ConstructibleType: "BUILDING_GRANARY" }, false) ?? null)),
  found: JSON.parse(JSON.stringify(Game.CityOperations.canStart(city(0), "BUILD", { ProjectType: "PROJECT_FOUND_NATIONAL_PARK" }, false) ?? null)),
  purchase: JSON.parse(JSON.stringify(Game.CityCommands.canStart(city(0), "PURCHASE", { X: plot.x, Y: plot.y, ConstructibleType: "BUILDING_GRANARY" }, false) ?? null)),
};
Game.CityOperations.sendRequest(city(0), "BUILD", { X: plot.x, Y: plot.y, ConstructibleType: "BUILDING_GRANARY" });
Game.CityOperations.sendRequest(city(0), "BUILD", { X: 9, Y: 9, ConstructibleType: "BUILDING_GRANARY" });
record("placement on park land", { checks });
Game.turn = 2; eng.gold.set(2, 50); eng.gold.set(1, 50);
fire("PlayerTurnActivated", { player: 0 });
await settle();
record("a turn when the AIs are short of Gold");
Game.turn = 3; eng.atWar = true;
fire("PlayerTurnActivated", { player: 0 });
await settle();
eng.atWar = false;
record("a turn at war");
record("stop", { stopped: np.stop(), listeners: listeners.size });

test("np-main: one short game does exactly what it did before, step by step", () => {
  const now = JSON.parse(JSON.stringify(steps));
  if (process.env.UPDATE_SNAPSHOT || !existsSync(TRACE)) {
    writeFileSync(TRACE, JSON.stringify(now, null, 1) + "\n");
    if (!process.env.UPDATE_SNAPSHOT) assert.fail("no trace was on disk; wrote one, check it in and run again");
    return;
  }
  const was = JSON.parse(readFileSync(TRACE, "utf8"));
  for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) assert.deepEqual(now[name], was[name], name);
});
