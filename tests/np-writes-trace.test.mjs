// The core's other map writes, pinned step by step like np-reconcile-trace.test.mjs: placing markers, adding a tile,
// founding and dissolving a park, clearing pieces no park holds, and the map scan the sweep reads them from. Each case
// runs on its own row of a fake engine (fake-engine.mjs) and is compared with np-writes.trace.json.
//
// A change that is meant: run `UPDATE_SNAPSHOT=1 node --test tests/np-writes-trace.test.mjs` and say what moved.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { makeEngine, W } from "./fake-engine.mjs";

const TRACE = fileURLToPath(new URL("./np-writes.trace.json", import.meta.url));
const eng = makeEngine();
mock.timers.enable({ apis: ["setTimeout", "Date"] });
const core = await import("../ui/np-core.js");

async function settle() {
  for (let k = 0; k < 600; k++) { await new Promise((r) => setImmediate(r)); mock.timers.tick(100); }
}
const at = (row, x) => row * W + x;
const LAND = "IMPROVEMENT_NATIONAL_PARK_LAND";

/** A park on row `row` founded at x 2, holding x 3.. (n tiles in all); `marked` puts districts and markers on its land. */
function park(row, n, { owner = 0, marked = true } = {}) {
  const anchor = at(row, 2);
  const tiles = Array.from({ length: n - 1 }, (_, k) => at(row, 3 + k));
  for (const t of [anchor, ...tiles]) eng.setPlot(t, { owner });
  eng.district(anchor);
  eng.build(anchor, "IMPROVEMENT_NATIONAL_PARK");
  const p = core.createPark(anchor, owner);
  for (const t of tiles) {
    p.tiles.push(t);
    if (marked) { eng.district(t); eng.build(t, LAND); }
  }
  return p;
}

const CASES = {
  "markers for bare land: district then marker": (r) => { const p = park(r, 3, { marked: false }); return () => core.ensureMarkers(p); },
  "a marker on land that has a district": (r) => {
    const p = park(r, 2, { marked: false }); eng.district(at(r, 3)); return () => core.placeMarker(p, at(r, 3));
  },
  "no marker on a resource tile, a kept improvement, or another's land": (r) => {
    const p = park(r, 4, { marked: false });
    eng.setPlot(at(r, 3), { owner: 0, resource: "RESOURCE_FURS" });
    eng.build(at(r, 4), "IMPROVEMENT_EXPEDITION_BASE");
    eng.setPlot(at(r, 5), { owner: 1 });
    return () => [3, 4, 5].map((x) => core.placeMarker(p, at(r, x)));
  },
  "a marker that never lands: three tries, then none": (r) => {
    const p = park(r, 2, { marked: false });
    eng.refusals.push((kind, a) => kind === "CREATE_ELEMENT" && a.Type === LAND && a.Location.y === r);
    return async () => { const out = []; for (let k = 0; k < 5; k++) { out.push(core.placeMarker(p, at(r, 3))); await settle(); } return out; };
  },
  "a tile added from the picker: farm stripped, marker on": (r) => {
    const p = park(r, 2); p.pending = 2;
    eng.setPlot(at(r, 4), { owner: 0 }); eng.district(at(r, 4)); eng.build(at(r, 4), "IMPROVEMENT_FARM");
    return () => core.addTile(p, at(r, 4));
  },
  "a tile that may not be added": (r) => {
    const p = park(r, 2); p.pending = 1; eng.setPlot(at(r, 4), { owner: 1 });
    return () => core.addTile(p, at(r, 4));
  },
  "a founding placed on empty land": (r) => {
    eng.setPlot(at(r, 2), { owner: 0 });
    const f = core.addFounding("park", 0, { owner: 0, id: 1, type: 1 }, { paid: 200, by: "gold" });
    return () => { const p = core.foundPark(f, at(r, 2)); return p && p.id; };
  },
  "a founding refused on land that is built on": (r) => {
    eng.setPlot(at(r, 2), { owner: 0 }); eng.build(at(r, 2), "IMPROVEMENT_FARM");
    const f = core.addFounding("park", 0, { owner: 0, id: 1, type: 1 });
    return () => core.foundPark(f, at(r, 2));
  },
  "a park dissolved: markers off, its districts down, plots bought back": (r) => {
    const p = park(r, 3); p.districts = [p.anchor, ...p.tiles.slice(1)];
    return () => core.dissolvePark(p.id);
  },
  "a released tile with the owner's farm keeps its district": (r) => {
    const p = park(r, 2); p.districts = [p.anchor, at(r, 3)]; eng.build(at(r, 3), "IMPROVEMENT_FARM");
    return () => core.releaseTile(p, at(r, 3));
  },
  "markers no park holds are taken off": (r) => {
    eng.setPlot(at(r, 3), { owner: 0 }); eng.district(at(r, 3)); eng.build(at(r, 3), LAND);
    eng.setPlot(at(r, 4), { owner: 9 }); eng.district(at(r, 4)); eng.build(at(r, 4), LAND);
    return () => core.removeOrphanMarkers([at(r, 3), at(r, 4)]);
  },
  "empty wilderness districts no park holds are taken down": (r) => {
    eng.setPlot(at(r, 3), { owner: 0 }); eng.district(at(r, 3), "DISTRICT_WILDERNESS");
    return () => core.removeOrphanWilds([at(r, 3)]);
  },
  "the map scan": (r) => {
    const p = park(r, 3);
    eng.setPlot(at(r, 7), { owner: 0 }); eng.district(at(r, 7), "DISTRICT_WILDERNESS");
    eng.setPlot(at(r, 8), { owner: 9 }); eng.district(at(r, 8), "DISTRICT_WILDERNESS");
    eng.setPlot(at(r, 9), { owner: 0 }); eng.district(at(r, 9), "DISTRICT_RURAL");
    void p;
    return () => {
      const m = core.scanMap();
      const mine = (l) => l.filter((i) => Math.floor(i / W) === r);
      return { anchors: mine(m.anchors), markers: mine(m.markers), wilds: mine(m.wilds) };
    };
  },
};

async function run() {
  const out = {};
  let row = 1;
  for (const [name, make] of Object.entries(CASES)) {
    const r = row++;
    const act = make(r);
    const from = eng.trace.length;
    const result = await act();
    await settle();
    const plots = Array.from({ length: 10 }, (_, x) => at(r, x))
      .map((i) => [i, GameplayMap.getOwner(i % W, r), eng.districtAt(i), eng.typesAt(i).join("+")])
      .filter(([, o, d, t]) => o !== -1 || d || t);
    const parks = core.parks().filter((q) => Math.floor(q.anchor / W) === r);
    out[name] = { result: result === undefined ? "undefined" : result, trace: eng.trace.slice(from), parks, plots };
  }
  return out;
}

test("core writes: every case does exactly what it did before, step by step", async () => {
  const now = JSON.parse(JSON.stringify(await run()));
  if (process.env.UPDATE_SNAPSHOT || !existsSync(TRACE)) {
    writeFileSync(TRACE, JSON.stringify(now, null, 1) + "\n");
    if (!process.env.UPDATE_SNAPSHOT) assert.fail("no trace was on disk; wrote one, check it in and run again");
    return;
  }
  const was = JSON.parse(readFileSync(TRACE, "utf8"));
  for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) assert.deepEqual(now[name], was[name], name);
});
