// What drawPark (np-draw.js) asks the game to draw, pinned. A recording WorldUI stands in for the game's model groups
// and border overlay on a fake map (fake-engine.mjs); each case draws one park, runs the growth's timers to the end,
// and keeps every call in order. The calls are compared with np-draw.trace.json by digest and by count per call, so a
// change to the drawing code that should draw the same pieces in the same order can be shown to.
//
// A change that is meant: run `UPDATE_SNAPSHOT=1 node --test tests/np-draw-trace.test.mjs` and say what moved.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { makeEngine, W } from "./fake-engine.mjs";

const TRACE = fileURLToPath(new URL("./np-draw.trace.json", import.meta.url));
const eng = makeEngine();
const calls = [];
const recorder = (name) => new Proxy({}, {
  get: (_o, method) => (...args) => {
    calls.push([name, String(method), JSON.parse(JSON.stringify(args))]);
    return method === "addBorderOverlay" ? recorder(`${name}/border`) : { state: "MOVING", setState: (s) => calls.push([name, "setState", [s]]) };
  },
});
globalThis.WorldUI = { createModelGroup: (n) => recorder(n), createOverlayGroup: (n) => recorder(n) };
globalThis.PlacementMode = { TERRAIN: 1, WATER: 2 };
mock.timers.enable({ apis: ["setTimeout", "Date"] });
const core = await import("../ui/np-core.js");
const draw = await import("../ui/np-draw.js");

const at = (row, x) => row * W + x;
function park(row, xs, { kind = "park", owner = 0, terrain = {} } = {}) {
  const tiles = xs.map((x) => at(row, x));
  for (const t of tiles) eng.setPlot(t, { owner, terrain: terrain[t % W] || "TERRAIN_FLAT" });
  const p = core.createPark(tiles[0], owner, kind);
  p.tiles = tiles;
  return p;
}
async function finish() { for (let k = 0; k < 120; k++) { mock.timers.tick(100); await new Promise((r) => setImmediate(r)); } }

const CASES = {
  "a three-tile park": () => draw.drawPark(park(2, [2, 3, 4])),
  "a wilderness area": () => draw.drawPark(park(6, [2, 3, 4, 5], { kind: "wilderness" })),
  "a park on hills beside a mountain": () => draw.drawPark(park(10, [3, 4, 5], { terrain: { 4: "TERRAIN_HILL", 6: "TERRAIN_MOUNTAIN" } })),
  "a park holding a mountain": () => draw.drawPark(park(14, [3, 4, 5], { terrain: { 4: "TERRAIN_MOUNTAIN" } })),
  "a coastal park with water": () => draw.drawPark(park(18, [3, 4, 5, 6], { terrain: { 5: "TERRAIN_COAST", 6: "TERRAIN_COAST", 7: "TERRAIN_COAST" } })),
  "an eight-tile park": () => draw.drawPark(park(22, [1, 2, 3, 4, 5, 6, 7, 8])),
  "a park growing: new land drawn in turn": () => {
    const p = park(26, [2, 3, 4]);
    draw.drawPark(p);
    p.tiles.push(at(26, 5), at(27, 5)); eng.setPlot(at(26, 5), { owner: 0 }); eng.setPlot(at(27, 5), { owner: 0 });
    return draw.drawPark(p, [at(26, 5), at(27, 5)]);
  },
  "a park redrawn, then cleared": () => {
    const p = park(32, [2, 3]);
    draw.drawPark(p); draw.drawPark(p);
    draw.clearPark(p.id);
    return draw.isDrawnCurrent(p);
  },
};

async function run() {
  const out = {};
  for (const [name, act] of Object.entries(CASES)) {
    const from = calls.length;
    const result = act();
    await finish();
    const mine = calls.slice(from);
    const count = {};
    for (const [, m] of mine) count[m] = (count[m] || 0) + 1;
    out[name] = { result, count, digest: createHash("sha256").update(JSON.stringify(mine)).digest("hex").slice(0, 16),
      first: mine.slice(0, 6) };
  }
  return out;
}

test("drawPark: every case draws exactly what it did before, call by call", async () => {
  const now = JSON.parse(JSON.stringify(await run()));
  if (process.env.UPDATE_SNAPSHOT || !existsSync(TRACE)) {
    writeFileSync(TRACE, JSON.stringify(now, null, 1) + "\n");
    if (!process.env.UPDATE_SNAPSHOT) assert.fail("no trace was on disk; wrote one, check it in and run again");
    return;
  }
  const was = JSON.parse(readFileSync(TRACE, "utf8"));
  for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) assert.deepEqual(now[name], was[name], name);
});
