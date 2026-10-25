// restore-crash-probe.js - dev only. Disproof test for the 2026-10-25 crash (WATCH_LIST, "native crash, unexplained"):
// does putting a park's founding improvement back on a water tile crash the game? A park is founded on water at the
// first settlement and one on land at the second; then, with the mod running as in play, each founding improvement
// is removed by script and the mod's sweep puts it back, three times each, land first. The last round pauses and
// restarts the mod around the removal, as the crashed run did. Every step writes a [NPCRASH] line to UI.log first, so
// after a crash the log's tail names the step. Results go to globalThis.__npCrash for water-run.sh-style polling.
(async () => {
  const out = globalThis.__npCrash = { lines: [], done: false };
  const emit = (s) => { out.lines.push(s); console.error(`[NPCRASH] ${s}`); };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const np = globalThis.__towerNationalPark, c = np.core;
  const loc = (i) => GameplayMap.getLocationFromIndex(i);
  const L = (i) => { const l = loc(i); return `${l.x},${l.y}`; };
  const wet = (i) => { const l = loc(i); return GameplayMap.isWater(l.x, l.y); };
  const parkType = (p) => (p.kind === "wilderness" ? "IMPROVEMENT_WILDERNESS_AREA" : "IMPROVEMENT_NATIONAL_PARK");
  const itemsAt = (i) => { const l = loc(i); return MapConstructibles.getConstructibles(l.x, l.y); };
  const typeOf = (id) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(id).type).ConstructibleType);
  const stands = (p) => itemsAt(p.anchor).some((id) => typeOf(id) === parkType(p));
  const until = async (f, ms) => { for (let t = 0; t < ms; t += 250) { if (f()) return true; await w(250); } return !!f(); };

  try {
    const towns = Players.get(0).Cities.getCities();
    if (towns.length < 2) throw new Error("needs two settlements");
    // A water founding tile at the first settlement, a land one at the second.
    const pick = (s, water) => c.foundingTiles(s.id).find((t) => wet(t) === water);
    const sites = [[towns[0], "park", pick(towns[0], true)], [towns[1], "wilderness", pick(towns[1], false)]];
    const parks = [];
    for (const [s, kind, at] of sites) {
      if (at == null) throw new Error(`no ${kind} site at ${Locale.compose(s.name)}`);
      const f = c.addFounding(kind, 0, s.id, { paid: 1600, by: "gold", name: "probe" });
      const p = c.foundPark(f, at);
      emit(`founded ${kind} on ${L(at)} (${wet(at) ? "water" : "land"}) at ${Locale.compose(s.name)}`);
      if (!(await until(() => stands(p), 15000))) throw new Error(`${kind} never stood on ${L(at)}`);
      parks.push(p);
    }
    await w(3000);
    const round = async (p, k, pause) => {
      const what = `${wet(p.anchor) ? "water" : "land"} ${L(p.anchor)} round ${k}${pause ? " (mod paused)" : ""}`;
      const id = itemsAt(p.anchor).find((x) => typeOf(x) === parkType(p));
      if (pause) np.stop();
      emit(`remove: ${what}`);
      Game.PlayerOperations.sendRequest(0, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", LocalID: id.id });
      await until(() => !stands(p), 5000);
      if (pause) { await w(1500); np.start(); }
      emit(`restore wait: ${what}`);
      const back = await until(() => stands(p), 20000);
      emit(`${back ? "restored" : "NOT restored"}: ${what}`);
      await w(4000);
    };
    for (const p of [parks[1], parks[0]]) for (let k = 1; k <= 3; k++) await round(p, k, false);
    for (const p of [parks[1], parks[0]]) await round(p, 4, true);
    emit("finished without a crash");
  } catch (e) {
    emit(`probe stopped: ${e && e.message || e}`);
  }
  out.done = true;
})()
