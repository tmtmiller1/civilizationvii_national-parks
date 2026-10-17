// The sweep's map writes (reconcile in np-core.js), driven on a fake engine (fake-engine.mjs): what it asks the game to
// do for a park tile its owner has built on, and how often.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { makeEngine, W } from "./fake-engine.mjs";

const eng = makeEngine();
mock.timers.enable({ apis: ["setTimeout", "Date"] });
const core = await import("../ui/np-core.js");

/** Run the timers until every queued sequence has finished (each step waits at most 8 s). */
async function settle() {
  for (let k = 0; k < 600; k++) { await new Promise((r) => setImmediate(r)); mock.timers.tick(100); }
}
const OWNER = 0;
/** A park founded on `anchor` holding `tiles`, each on a rural district with its land marker. */
function park(anchor, tiles) {
  for (const t of [anchor, ...tiles]) { eng.setPlot(t, { owner: OWNER }); eng.district(t); }
  eng.build(anchor, "IMPROVEMENT_NATIONAL_PARK");
  const p = core.createPark(anchor, OWNER);
  for (const t of tiles) { p.tiles.push(t); eng.build(t, "IMPROVEMENT_NATIONAL_PARK_LAND"); }
  return p;
}
const since = (n) => eng.trace.slice(n);
const reverts = (from, plot) => since(from).filter(([k, m]) => k === "log" && m.includes(`reverting`) && m.endsWith(` ${plot}`));

test("sweep: a resource tile's own harvester on park land is left standing", async () => {
  const p = park(2 * W + 2, [2 * W + 3]);
  const t = 2 * W + 4;
  eng.setPlot(t, { owner: OWNER, resource: "RESOURCE_FURS" }); eng.district(t);
  p.tiles.push(t);
  eng.build(t, "IMPROVEMENT_CAMP");
  const from = eng.trace.length;
  core.reconcile(p); await settle();
  assert.deepEqual(eng.typesAt(t), ["IMPROVEMENT_CAMP"]);
  assert.deepEqual(since(from).filter(([k]) => k === "request"), [], "nothing is sent");
  assert.ok(p.tiles.includes(t), "the tile stays in the park");
});

test("sweep: a revert the game won't take is tried three times a session, then left", async () => {
  const p = park(5 * W + 2, [5 * W + 3]);
  const t = 5 * W + 3;
  const farm = eng.build(t, "IMPROVEMENT_FARM");
  eng.refusals.push((kind, a) => kind === "DESTROY_ELEMENT" && a.LocalID === farm);
  const from = eng.trace.length;
  for (let sweep = 0; sweep < 6; sweep++) { core.reconcile(p); await settle(); }
  assert.equal(reverts(from, t).length, 3);
  const last = since(from).filter(([k, m]) => k === "log" && m.includes("did not land")).map(([, m]) => m);
  assert.deepEqual(last.map((m) => m.match(/\((\d+) of 3\)/)[1]), ["1", "2", "3"]);
  assert.ok(eng.typesAt(t).includes("IMPROVEMENT_FARM"));
});

test("sweep: a farm put on park land comes off, its citizen comes back, and the marker returns", async () => {
  const p = park(8 * W + 2, [8 * W + 3]);
  const t = 8 * W + 3;
  eng.build(t, "IMPROVEMENT_FARM");
  const before = eng.population(OWNER);
  const from = eng.trace.length;
  core.reconcile(p); await settle();
  assert.deepEqual(eng.typesAt(t), ["IMPROVEMENT_NATIONAL_PARK_LAND"]);
  assert.equal(reverts(from, t).length, 1);
  assert.equal(eng.population(OWNER), before - 1, "the game took the farm's citizen");
  assert.equal(since(from).filter(([k]) => k === "population").length, 1, "and it was handed back as new population");
});
