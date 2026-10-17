// Autoplay on a fake engine (fake-engine.mjs). Watched 2026-10-17 in a Modern lab game (seed 9001): while Autoplay
// runs, GameContext.localPlayerID reads -1, Players.get(0).isHuman reads false, Autoplay.returnAsPlayer reads 0, and
// the game carries out no CREATE_ELEMENT request (a rural district and a park improvement on 22,35, Flat with Forest,
// sent as -1 or as 0, twice); the same requests landed at once with Autoplay off. Gold grants still go through.
// Watch run 2 block 2 (G6) met it at Modern's start under `lab drive`: a human's waiting founding was placed as an
// AI's, and its writes failed three times, leaving a park record with nothing on the map.
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

// The game as Autoplay leaves it, as watched.
globalThis.Autoplay = { isActive: true, returnAsPlayer: 0, observeAsPlayer: 0 };
const local = 0;
Object.defineProperty(globalThis.GameContext, "localPlayerID", { get: () => (Autoplay.isActive ? -1 : local), configurable: true });
const getPlayer = Players.get;
Players.get = (o) => ({ ...getPlayer(o), isHuman: o === 0 && !Autoplay.isActive });
eng.refusals.push((kind) => kind === "CREATE_ELEMENT" && Autoplay.isActive);

const at = (row, x) => row * W + x;
const PARK = "IMPROVEMENT_NATIONAL_PARK";
const core = await import("../ui/np-core.js");
const requests = (from) => eng.trace.slice(from).filter(([k]) => k === "request" || k === "refused");
const landFails = (from) => eng.trace.slice(from).filter(([k, m]) => k === "log" && m.includes("did not land"));

test("autoplay: a founding tile whose writes Autoplay dropped is put back once Autoplay stops", async () => {
  const a = at(2, 2);
  eng.setPlot(a, { owner: 1 });
  const p = core.createPark(a, 1);   // an AI's park whose founding never landed
  const from = eng.trace.length;
  for (let k = 0; k < 4; k++) { core.reconcile(p); await settle(); }
  assert.deepEqual(eng.typesAt(a), [], "nothing lands while Autoplay runs");
  Autoplay.isActive = false;
  core.reconcile(p); await settle();
  Autoplay.isActive = true;
  assert.deepEqual(eng.typesAt(a), [PARK], "the park improvement stands once Autoplay has stopped");
  assert.equal(eng.districtAt(a), "DISTRICT_RURAL");
  assert.ok(landFails(from).every(([, m]) => !/\(\d+ of 3\)/.test(m)), "a write Autoplay dropped isn't counted as a try");
});

test("autoplay: a human's waiting founding isn't placed for them, and nothing is sent until Autoplay stops", async () => {
  for (const x of [2, 3, 4]) eng.setPlot(at(10, x), { owner: 0 });
  for (const x of [2, 3, 4]) eng.setPlot(at(12, x), { owner: 2 });
  core.addFounding("park", 0, { owner: 0, id: 1, type: 1 }, { paid: 1600, by: "gold", name: "Roma" });
  core.addFounding("park", 2, { owner: 2, id: 1, type: 1 }, { paid: 1600, by: "gold", name: "City 2-1" });
  core.save();
  const parksBefore = core.parks().length;
  const from = eng.trace.length;
  await import("../ui/np-main.js");
  await settle(8000);                 // the load sweep, 5 s after the start, under Autoplay
  assert.equal(core.parks().length, parksBefore, "no park is founded while Autoplay runs");
  assert.equal(core.foundings().length, 2, "both foundings still wait");
  assert.deepEqual(requests(from), [], "nothing is sent while Autoplay runs");

  Autoplay.isActive = false;          // Autoplay stops; the held sweep runs
  await settle();
  const human = core.foundings().find((f) => f.owner === 0);
  assert.ok(human, "the human's founding still waits for its owner to choose the land");
  assert.ok(!core.parks().some((p) => p.owner === 0 && p.anchor >= at(10, 0) && p.anchor < at(11, 0)), "no park on the human's land");
  const ai = core.parks().find((p) => p.owner === 2);
  assert.ok(ai, "the AI's founding is placed");
  assert.deepEqual(eng.typesAt(ai.anchor), [PARK], "and its park improvement lands");
  assert.deepEqual(landFails(from), []);
  fire("PlayerTurnActivated", { player: 0 });
  await settle();
  assert.ok(core.foundings().some((f) => f.owner === 0), "a turn later it still waits");
});
