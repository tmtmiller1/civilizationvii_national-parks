// What the sweep does to each kind of park, pinned step by step. Every branch of reconcile (np-core.js) runs once on a
// fake engine (fake-engine.mjs), each case on its own row of the map, and the test records what came back, every request
// and log line in order, the park's record afterwards and what stands on the row's plots. The record is compared with
// np-reconcile.trace.json, so a change to this code that should change nothing in game can be shown to change nothing.
//
// A change that is meant: run `UPDATE_SNAPSHOT=1 node --test tests/np-reconcile-trace.test.mjs` and say what moved.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { makeEngine, W } from "./fake-engine.mjs";

const TRACE = fileURLToPath(new URL("./np-reconcile.trace.json", import.meta.url));
const eng = makeEngine();
mock.timers.enable({ apis: ["setTimeout", "Date"] });
const core = await import("../ui/np-core.js");

async function settle() {
  for (let k = 0; k < 600; k++) { await new Promise((r) => setImmediate(r)); mock.timers.tick(100); }
}
const at = (row, x) => row * W + x;
const LAND = "IMPROVEMENT_NATIONAL_PARK_LAND";

/** A park on row `row`: founded at x 2, with land at x 3, 4, ... (n tiles in all), each on a rural district. */
function park(row, n, { owner = 0, kind = "park" } = {}) {
  const anchor = at(row, 2);
  const tiles = Array.from({ length: n - 1 }, (_, k) => at(row, 3 + k));
  for (const t of [anchor, ...tiles]) { eng.setPlot(t, { owner }); eng.district(t); }
  eng.build(anchor, core.KINDS[kind].improvement);
  const p = core.createPark(anchor, owner, kind);
  for (const t of tiles) { p.tiles.push(t); eng.build(t, core.markerFor({ ...p, tiles: Array(n) })); }
  return p;
}

const CASES = {
  "owner follows the founding tile": (r) => { const p = park(r, 2); p.owner = 1; p.aiFund = 40; return p; },
  "founding tile unowned: dissolved": (r) => { const p = park(r, 2); eng.setPlot(at(r, 2), { owner: -1 }); return p; },
  "independent: land the game took down is forgotten": (r) => {
    const p = park(r, 3, { owner: 9 }); eng.setPlot(at(r, 4), { owner: -1 }); return p;
  },
  "founding tile built over: the park moves": (r) => { const p = park(r, 3); eng.build(at(r, 2), "BUILDING_GRANARY"); return p; },
  "founding tile built over, nowhere to go: dissolved": (r) => {
    const p = park(r, 2); eng.setPlot(at(r, 3), { terrain: "TERRAIN_COAST" }); eng.build(at(r, 2), "BUILDING_GRANARY"); return p;
  },
  "founding tile on a wilderness district: rebuilt": (r) => { const p = park(r, 2); eng.district(at(r, 2), "DISTRICT_WILDERNESS"); return p; },
  "founding tile farmed: farm off": (r) => { const p = park(r, 2); eng.build(at(r, 2), "IMPROVEMENT_FARM"); return p; },
  "founding improvement gone: put back": (r) => {
    const p = park(r, 2);
    for (const id of MapConstructibles.getConstructibles(2, r)) eng.trace.push(["setup-destroy", id]);
    Game.PlayerOperations.sendRequest(0, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", LocalID: MapConstructibles.getConstructibles(2, r)[0] });
    return p;
  },
  "land lost to another player: forgotten": (r) => { const p = park(r, 3); eng.setPlot(at(r, 4), { owner: 1 }); return p; },
  "marker filed with another settlement: rebuilt": (r) => {
    const p = park(r, 2); const t = at(r, 3);
    for (const id of MapConstructibles.getConstructibles(3, r)) Game.PlayerOperations.sendRequest(0, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", LocalID: id });
    eng.build(t, LAND, 0, { city: 2 });
    return p;
  },
  "land on a wilderness district: moved to rural": (r) => { const p = park(r, 2); eng.district(at(r, 3), "DISTRICT_WILDERNESS"); return p; },
  "eight tiles: markers step up a level": (r) => {
    const p = park(r, 8);
    for (const t of p.tiles.slice(1)) {
      const l = core.locOf(t);
      for (const id of MapConstructibles.getConstructibles(l.x, l.y)) Game.PlayerOperations.sendRequest(0, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", LocalID: id });
      eng.build(t, LAND);
    }
    return p;
  },
  "a building on park land: the tile leaves": (r) => { const p = park(r, 3); eng.build(at(r, 3), "BUILDING_GRANARY"); return p; },
  "another player's improvement: the tile leaves": (r) => { const p = park(r, 3); eng.build(at(r, 3), "IMPROVEMENT_FARM", 1); return p; },
  "a district of another kind: the tile leaves": (r) => { const p = park(r, 3); eng.district(at(r, 3), "DISTRICT_URBAN"); return p; },
  "an unreadable plot is left for later": (r) => { const p = park(r, 3); eng.build(at(r, 3), "IMPROVEMENT_FARM", 0, { elsewhere: true }); return p; },
  "the owner's farm on park land: reverted": (r) => { const p = park(r, 3); eng.build(at(r, 4), "IMPROVEMENT_FARM"); return p; },
  "a resource tile's harvester: left": (r) => {
    const p = park(r, 2); const t = at(r, 4);
    eng.setPlot(t, { owner: 0, resource: "RESOURCE_FURS" }); eng.district(t); p.tiles.push(t); eng.build(t, "IMPROVEMENT_CAMP");
    return p;
  },
  "a wilderness area's farmed tile: reverted": (r) => { const p = park(r, 3, { kind: "wilderness" }); eng.build(at(r, 3), "IMPROVEMENT_FARM"); return p; },
  "a full park's unused expansions lapse": (r) => { const p = park(r, 3); p.pending = 2; core.limits.maxTiles = 3; return p; },
  "a tile being written to is left alone": (r) => {
    const p = park(r, 3); eng.build(at(r, 3), "IMPROVEMENT_FARM");
    core.inSequence(at(r, 3), () => new Promise((res) => setTimeout(res, 3000)));
    return p;
  },
  "nothing to do": (r) => park(r, 3),
  "a revert the game refuses: logged as not landed": (r) => {
    const p = park(r, 3); const farm = eng.build(at(r, 3), "IMPROVEMENT_FARM");
    eng.refusals.push((kind, a) => kind === "DESTROY_ELEMENT" && a.LocalID === farm);
    return p;
  },
  "a district filed with another settlement: rebuilt with it": (r) => {
    const p = park(r, 2); const t = at(r, 3);
    eng.district(t, "DISTRICT_RURAL", 0, 2); p.districts = [p.anchor, t];
    return p;
  },
  "a tile the park made a district for leaves: district taken down": (r) => {
    const p = park(r, 3); const t = at(r, 3);
    eng.district(t, "DISTRICT_URBAN"); p.districts = [p.anchor, t];
    return p;
  },
};

async function run() {
  const out = {};
  let row = 1;
  for (const [name, make] of Object.entries(CASES)) {
    const r = row++;
    const p = make(r);
    const from = eng.trace.length;
    const result = core.reconcile(p);
    await settle();
    core.limits.maxTiles = core.MAX_PARK_TILES;
    const plots = Array.from({ length: 10 }, (_, x) => at(r, x))
      .map((i) => [i, GameplayMap.getOwner(i % W, r), eng.districtAt(i), eng.typesAt(i).join("+")])
      .filter(([, o, d, t]) => o !== -1 || d || t);
    out[name] = { result, trace: eng.trace.slice(from), park: core.parks().find((q) => q.id === p.id) || "gone", plots };
  }
  return out;
}

test("reconcile: every case does exactly what it did before, step by step", async () => {
  const now = JSON.parse(JSON.stringify(await run()));
  if (process.env.UPDATE_SNAPSHOT || !existsSync(TRACE)) {
    writeFileSync(TRACE, JSON.stringify(now, null, 1) + "\n");
    if (!process.env.UPDATE_SNAPSHOT) assert.fail("no trace was on disk; wrote one, check it in and run again");
    return;
  }
  const was = JSON.parse(readFileSync(TRACE, "utf8"));
  for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) assert.deepEqual(now[name], was[name], name);
});
