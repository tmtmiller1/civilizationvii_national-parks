// A founding whose park never lands, on a fake engine (fake-engine.mjs). The game refuses a founding tile's writes
// (for any reason but Autoplay, which np-autoplay.test.mjs covers) until the tries run out. The park record then goes,
// and the founding waits for its land again with what it cost: a human is told and chooses again, an AI's places
// itself on another tile. The settlement's slot is held by the founding, not by a park that isn't on the map, and a
// park that lands late after all is taken as the founding's, so nothing is paid or founded twice.
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
const grants = (from) => eng.trace.slice(from).filter(([k]) => k === "grant");
const logs = (from, re) => eng.trace.slice(from).filter(([k, m]) => k === "log" && re.test(m)).map(([, m]) => m);
// The game won't put the park improvement on this plot; the district lands.
const refuseImprovement = (i) => eng.refusals.push((kind, a) => kind === "CREATE_ELEMENT" && a.Kind === "CONSTRUCTIBLE"
  && a.Type === PARK && a.Location && at(a.Location.y, a.Location.x) === i);
const refuseAll = (i) => eng.refusals.push((kind, a) => kind === "CREATE_ELEMENT" && a.Location
  && at(a.Location.y, a.Location.x) === i);

test("unlanded: a human's founding goes back to waiting for its land, with what it cost, and they're told", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(10, x), { owner: 0 });
  const bad = at(10, 2);
  refuseImprovement(bad);
  const f = core.addFounding("park", 0, city(0), { paid: 1600, by: "gold", name: "Roma" });
  const from = eng.trace.length;
  const park = core.foundPark(f, bad);
  assert.ok(park);
  await settle();
  await turns(4);
  assert.ok(!core.parks().some((p) => p.anchor === bad), "the park record that never landed is gone");
  const back = core.foundings().filter((w) => w.owner === 0);
  assert.equal(back.length, 1, "one founding waits again");
  assert.equal(back[0].paid, 1600, "with what it cost");
  assert.equal(back[0].name, "Roma");
  assert.deepEqual(eng.typesAt(bad), [], "nothing is left on the tile");
  assert.equal(eng.districtAt(bad), "", "and the district made for it is taken off");
  assert.ok(!core.foundingTiles(city(0)).includes(bad), "the refused tile isn't offered again this session");
  assert.ok(core.foundingTiles(city(0)).length > 0, "the others are");
  assert.deepEqual(grants(from), [], "no Gold moves: the founding still holds it");
  assert.equal(logs(from, /never landed/).length, 1, "the log says what happened, once");
  assert.ok(core.notices().some((n) => n.owner === 0 && n.why === "not-landed")
    || logs(from, /not-landed/).length, "the player is told");
  await turns(2);
  assert.equal(core.foundings().filter((w) => w.owner === 0).length, 1, "it stays one founding");
});

test("unlanded: an AI's founding places itself again on another tile, and that one lands", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(14, x), { owner: 2 });
  const bad = at(14, 2);
  refuseAll(bad);
  const f = core.addFounding("park", 2, city(2), { paid: 900, by: "gold", name: "City 2-1" });
  const from = eng.trace.length;
  core.foundPark(f, bad);
  await settle();
  await turns(5);
  const mine = core.parks().filter((p) => p.owner === 2);
  assert.equal(mine.length, 1, "one park");
  assert.notEqual(mine[0].anchor, bad, "on another tile");
  assert.deepEqual(eng.typesAt(mine[0].anchor), [PARK], "standing");
  assert.equal(core.foundings().filter((w) => w.owner === 2).length, 0, "the founding is spent");
  assert.deepEqual(grants(from).filter(([, , , n]) => n > 0), [], "and nothing was refunded on top (the AI's own saving for an expansion aside)");
});

test("unlanded: a park that lands late after all is the founding's; no second park and no refund", async () => {
  for (const x of [2, 3]) eng.setPlot(at(18, x), { owner: 0, city: 2 });
  const bad = at(18, 2);
  const stop = eng.refusals.length;
  refuseImprovement(bad);
  const f = core.addFounding("park", 0, { owner: 0, id: 2, type: 1 }, { paid: 1600, by: "gold", name: "Antium" });
  core.foundPark(f, bad);
  await settle();
  await turns(4);
  assert.ok(core.foundings().some((w) => w.owner === 0 && w.name === "Antium"), "it waits again");
  eng.refusals.splice(stop, 1);
  const from = eng.trace.length;
  eng.district(bad); eng.build(bad, PARK, 0);   // the late landing
  fire("ConstructibleAddedToMap", { constructibleType: PARK, location: core.locOf(bad) });
  await settle();
  await turns(1);
  assert.equal(core.parks().filter((p) => p.anchor === bad).length, 1, "it's registered once");
  assert.ok(!core.foundings().some((w) => w.name === "Antium"), "and the waiting founding is used up by it");
  assert.deepEqual(grants(from), [], "no Gold moves");
});

// Something else takes the tile before the park first stands (lab4-N: France built a Museum on 47,25 between the
// second and third misses). The player didn't get the park, so the founding waits again with what it cost.
const takeTile = (i, owner) => { eng.district(i, "DISTRICT_URBAN", owner); eng.build(i, "BUILDING_MUSEUM", owner); };

test("taken: a human's founding whose tile is built on before the park stands waits again, with what it cost", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(22, x), { owner: 0, city: 3 });
  const bad = at(22, 2), home = { owner: 0, id: 3, type: 1 };
  refuseImprovement(bad);
  const f = core.addFounding("park", 0, home, { paid: 1600, by: "gold", name: "Neapolis" });
  const from = eng.trace.length;
  assert.ok(core.foundPark(f, bad));
  await settle();
  await turns(1);
  assert.ok(core.parks().some((p) => p.anchor === bad), "still trying after one miss");
  takeTile(bad, 0);
  fire("ConstructibleAddedToMap", { constructibleType: "BUILDING_MUSEUM", location: core.locOf(bad) });
  await settle();
  await turns(1);
  assert.ok(!core.parks().some((p) => p.anchor === bad), "no park on the taken tile");
  const back = core.foundings().filter((w) => w.name === "Neapolis");
  assert.equal(back.length, 1, "the founding waits again");
  assert.equal(back[0].paid, 1600, "with what it cost");
  assert.deepEqual(eng.typesAt(bad), ["BUILDING_MUSEUM"], "the building stays");
  assert.ok(!core.foundingTiles(home).includes(bad), "the taken tile isn't offered");
  assert.ok(core.foundingTiles(home).length > 0, "the others are");
  assert.deepEqual(grants(from), [], "no Gold moves: the founding still holds it");
  assert.equal(logs(from, /dissolved/).length, 0, "not dissolved");
  assert.ok(core.notices().some((n) => n.owner === 0 && n.why === "not-landed")
    || logs(from, /not-landed/).length, "the player is told");
});

test("taken: an AI's founding whose tile is built on before the park stands places itself elsewhere", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(26, x), { owner: 3, city: 1 });
  const bad = at(26, 2);
  refuseAll(bad);
  const f = core.addFounding("park", 3, city(3), { paid: 900, by: "gold", name: "City 3-1" });
  const from = eng.trace.length;
  core.foundPark(f, bad);
  await settle();
  await turns(1);
  takeTile(bad, 3);
  await turns(2);
  const mine = core.parks().filter((p) => p.owner === 3);
  assert.equal(mine.length, 1, "one park");
  assert.notEqual(mine[0].anchor, bad, "on another tile");
  assert.deepEqual(eng.typesAt(mine[0].anchor), [PARK], "standing");
  assert.equal(core.foundings().filter((w) => w.owner === 3).length, 0, "the founding is spent");
  assert.deepEqual(grants(from).filter(([, o, , n]) => o === 3 && n > 0), [], "nothing refunded on top");
});

test("taken: a founding tile that passes to another player before the park stands gives the founding back", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(30, x), { owner: 0, city: 4 });
  const bad = at(30, 2), home = { owner: 0, id: 4, type: 1 };
  refuseImprovement(bad);
  const f = core.addFounding("park", 0, home, { paid: 1600, by: "gold", name: "Capua" });
  core.foundPark(f, bad);
  await settle();
  await turns(1);
  eng.setPlot(bad, { owner: 4, city: 1 });
  await turns(1);
  assert.ok(!core.parks().some((p) => p.anchor === bad), "the new owner doesn't get a park the player paid for");
  const back = core.foundings().filter((w) => w.name === "Capua");
  assert.equal(back.length, 1, "the founding waits again");
  assert.equal(back[0].owner, 0, "its owner's");
  assert.equal(back[0].paid, 1600, "with what it cost");
});

test("taken: a park that stood and is then built over is dissolved as before, with no founding back", async () => {
  for (const x of [2]) eng.setPlot(at(34, x), { owner: 0, city: 5 });
  const tile = at(34, 2), home = { owner: 0, id: 5, type: 1 };
  const f = core.addFounding("park", 0, home, { paid: 1600, by: "gold", name: "Ostia" });
  const park = core.foundPark(f, tile);
  await settle();
  await turns(1);
  assert.deepEqual(eng.typesAt(tile), [PARK], "it stood");
  assert.ok(!park.founding, "and is its founding's for good");
  const from = eng.trace.length;
  eng.district(tile, "DISTRICT_URBAN", 0); eng.build(tile, "BUILDING_MUSEUM", 0);
  await turns(1);
  assert.equal(logs(from, new RegExp(`park ${park.id} dissolved`)).length, 1, "dissolved");
  assert.ok(!core.foundings().some((w) => w.name === "Ostia"), "no founding comes back");
});
