// water-probe.js - dev only. The checks for parks founded on water, 4-tile foundings and the 1-tile expansion, run
// inside a lab game by water-run.sh. One expression: an async function that writes PASS/FAIL/NOTE/SHOT lines to
// globalThis.__npWater.lines and sets .done, so the shell can poll it past the bench's 10 s eval limit.
//
// Needs the age's civic done (water-run.sh steps to it) and the local player's settlements on the coast. Plots the
// checks need (open ocean beside a settlement, water beside the all-water park) are bought for the settlement first.
(async () => {
  const out = globalThis.__npWater = { lines: [], done: false, pass: 0, fail: 0 };
  const emit = (s) => out.lines.push(String(s).replace(/\n\s*/g, " | "));
  const check = (name, ok, detail = "") => { out[ok ? "pass" : "fail"]++; emit(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); return ok; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const np = globalThis.__towerNationalPark, c = np.core;
  const { InterfaceMode } = await import("/core/ui/interface-modes/interface-modes.js");
  const loc = (i) => GameplayMap.getLocationFromIndex(i);
  const L = (i) => { const l = loc(i); return `${l.x},${l.y}`; };
  const terr = (i) => { const l = loc(i); return String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y)).TerrainType); };
  const wet = (i) => { const l = loc(i); return GameplayMap.isWater(l.x, l.y); };
  const types = (i) => { const l = loc(i); return MapConstructibles.getConstructibles(l.x, l.y).map((id) => { const o = Constructibles.getByComponentID(id); return String(GameInfo.Constructibles.lookup(o.type).ConstructibleType) + (o.complete ? "" : "?"); }); };
  const owner = (i) => { const l = loc(i); return GameplayMap.getOwner(l.x, l.y); };
  const cityAt = (i) => { const l = loc(i); return GameplayMap.getOwningCityFromXY(l.x, l.y); };
  const same = (a, b) => !!a && !!b && a.id === b.id && a.owner === b.owner;
  const gold = () => Players.get(0).Treasury.goldBalance;
  const mode = () => InterfaceMode.getCurrent();
  // A tile whose improvement would be removed asks first, in the mod's own box over the picker: press its OK.
  const pressOk = async () => {
    await w(400);
    const b = [...(document.getElementById("np-ask")?.querySelectorAll("fxs-button") || [])].find((k) => k.getAttribute("caption") === "LOC_GENERIC_OK");
    if (b) { b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); await w(300); }
  };
  const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (f()) return true; await w(250); } return !!f(); };
  const age = String(GameInfo.Ages.lookup(Game.age).AgeType);

  try {
    // 0. what the game loaded
    const ex = GameInfo.Projects.lookup("PROJECT_EXPAND_NATIONAL_PARK"), fo = GameInfo.Projects.lookup("PROJECT_FOUND_NATIONAL_PARK");
    const vt = [...GameInfo.Constructible_ValidTerrains].filter((r) => r.ConstructibleType === "IMPROVEMENT_WILDERNESS_AREA").map((r) => String(r.TerrainType));
    emit(`NOTE ${age}, turn ${Game.turn}`);
    check("data: Expand costs 100 production", ex.Cost === 100, `Cost ${ex.Cost}`);
    check("data: Found costs 400 production", fo.Cost === 400, `Cost ${fo.Cost}`);
    check("data: the founding improvements allow coast and ocean", vt.includes("TERRAIN_COAST") && vt.includes("TERRAIN_OCEAN"), vt.join(" "));
    Players.grantYield(0, YieldTypes.YIELD_GOLD, 40000);
    await w(1500);

    const towns = Players.get(0).Cities.getCities();
    emit(`NOTE settlements: ${towns.map((s) => `${Locale.compose(s.name)} ${s.isTown ? "town" : "city"} at ${s.location.x},${s.location.y}`).join("; ")}`);

    // Buy plot i for settlement s if nobody holds it; true when s holds it afterwards.
    const buy = async (s, i) => {
      if (same(cityAt(i), s.id)) return true;
      if (owner(i) !== -1) return false;
      try { Cities.get(s.id).purchasePlot(loc(i)); } catch (e) { emit(`NOTE purchasePlot threw on ${L(i)}: ${e}`); }
      return until(() => same(cityAt(i), s.id), 4000);
    };
    const ring = (i) => c.ringOf(i).filter((n) => n >= 0);
    const emptyWater = (i) => wet(i) && !types(i).length && !c.isWonder(i) && c.districtKind(i) === "none" && !c.parkOfTile(i);
    const sites = (s, pred) => {
      const owned = new Set(s.getPurchasedPlots());
      const near = new Set();
      for (const i of owned) for (const n of ring(i)) if (!owned.has(n)) near.add(n);
      return { owned: [...owned].filter(pred), near: [...near].filter((i) => owner(i) === -1 && pred(i)) };
    };

    // 1. the founding tiles: water offered, a water tile with something on it left out
    for (const s of towns) {
      const ft = c.foundingTiles(s.id);
      const boats = s.getPurchasedPlots().filter((i) => wet(i) && types(i).length);
      emit(`NOTE ${Locale.compose(s.name)}: ${ft.length} founding tiles, ${ft.filter(wet).length} water; water with something on it: ${boats.map((i) => L(i) + "[" + types(i).join("+") + "]").join(" ") || "none"}`);
      if (boats.length) check(`founding tiles at ${Locale.compose(s.name)} leave out water with something on it`, !boats.some((i) => ft.includes(i)));
    }

    // Found a park of `kind` for settlement s on plot `at` through the picker, as a player does, then add `picks`
    // (functions choosing the next tile from the candidates) through the picker that opens again.
    const found = async (s, kind, at, picks, tag) => {
      // A picker left open by an earlier step would take this founding's clicks: close it first.
      if (mode() !== "INTERFACEMODE_DEFAULT") { InterfaceMode.switchToDefault(); await w(1200); }
      const g0 = gold();
      const why = np.buyFounding(s.id, kind);
      // Open the picker before the founding pop-up's retry fires; the pop-up stands down once the founding is placed.
      const f = np.foundings().find((x) => x.kind === kind && same(x.city, s.id));
      const opened = f && np.openFoundingPicker(f.id);
      await w(1200);
      check(`${tag}: founding bought for 1,600 Gold`, !why && g0 - gold() === 1600, `refusal "${why}", paid ${g0 - gold()}`);
      check(`${tag}: the founding picker opened and offers ${L(at)} (${terr(at).slice(8)})`, !!opened && mode() === "INTERFACEMODE_NP_ADD_TILES" && c.foundingTiles(s.id).includes(at), `mode ${mode()}`);
      np.choose(loc(at).x, loc(at).y); await w(600);
      np.confirm();
      const ok = await until(() => !!np.parks().find((p) => p.anchor === at));
      if (!check(`${tag}: park placed on ${L(at)}`, ok)) return null;
      const id = c.parks().find((p) => p.anchor === at).id;
      const park = { get pending() { return c.parkById(id).pending; }, get tiles() { return c.parkById(id).tiles; } };
      check(`${tag}: it starts with 3 tiles to choose`, park.pending === 3, `pending ${park.pending}`);
      const want = kind === "park" ? "IMPROVEMENT_NATIONAL_PARK" : "IMPROVEMENT_WILDERNESS_AREA";
      check(`${tag}: the founding improvement stands on the ${terr(at).slice(8).toLowerCase()} tile`, await until(() => types(at).includes(want)), types(at).join("+"));
      const reopened = await until(() => mode() === "INTERFACEMODE_NP_ADD_TILES", 4000);
      check(`${tag}: the picker opens again for the 3 tiles`, reopened, `mode ${mode()}`);
      const taken = new Set([at]);
      for (const pick of picks) {
        const held = new Set([...c.allParkTiles(), ...taken]);
        const cand = [...new Set([...taken].flatMap(ring))].filter((t) => !taken.has(t) && c.canJoin(t, 0, held)).sort((a, b) => a - b);
        const t = pick(cand, taken);
        if (t == null) { emit(`NOTE ${tag}: no candidate for a pick (${cand.map(L).join(" ")})`); break; }
        np.choose(loc(t).x, loc(t).y); taken.add(t); await pressOk();
      }
      np.confirm();
      await until(() => park.pending === 0 && park.tiles.length === 1 + picks.length, 8000);
      await w(4000);
      check(`${tag}: ${1 + picks.length} tiles, none left waiting`, park.tiles.length === 1 + picks.length && park.pending === 0, `tiles ${park.tiles.map((t) => L(t) + (wet(t) ? "~" : "")).join(" ")}, pending ${park.pending}`);
      return c.parkById(id);
    };
    const firstWet = (cand) => cand.find(wet);
    const firstDry = (cand) => cand.find((t) => !wet(t) && !c.isMountain(t) && !c.isWonder(t) && !c.resourceAt(t));

    // 2. a National Park on open ocean, kept all water. The nearest open ocean is often past the settlement's coast:
    // the water between is bought, one plot at a time outward, as a player buys tiles.
    const oceanPath = (s) => {
      const owned = new Set(s.getPurchasedPlots());
      const prev = new Map(), queue = [];
      for (const i of owned) if (wet(i)) { prev.set(i, -1); queue.push(i); }
      for (let k = 0; k < queue.length; k++) {
        const t = queue[k];
        if (terr(t) === "TERRAIN_OCEAN" && emptyWater(t)) {
          const path = [];
          for (let u = t; u >= 0 && !owned.has(u); u = prev.get(u)) path.unshift(u);
          return path.length ? path : [t];
        }
        for (const n of ring(t)) if (!prev.has(n) && wet(n) && (owner(n) === -1 || owned.has(n))) { prev.set(n, t); queue.push(n); }
      }
      return null;
    };
    let A = null, ocean = -1, path = null;
    for (const s of towns) { path = oceanPath(s); if (path) { A = s; ocean = path[path.length - 1]; break; } }
    if (!check("an empty ocean tile reachable from a settlement", ocean >= 0)) throw new Error("no ocean site");
    for (const t of path) if (!(await buy(A, t))) emit(`NOTE couldn't buy ${L(t)} for ${Locale.compose(A.name)}`);
    check(`the ocean tile ${L(ocean)} is ${Locale.compose(A.name)}'s`, same(cityAt(ocean), A.id), `bought ${path.map(L).join(" > ")}`);
    // Three more water tiles beside it, bought where nobody holds them, so the park can stay all water and grow.
    const extra = [];
    for (const n of [ocean, ...ring(ocean)]) for (const m of ring(n)) {
      if (extra.length >= 6 || m === ocean || extra.includes(m) || !emptyWater(m)) continue;
      if (await buy(A, m)) extra.push(m);
    }
    emit(`NOTE all-water site ${L(ocean)} for ${Locale.compose(A.name)}; water held around it: ${extra.map(L).join(" ")}`);
    const wetPark = await found(A, "park", ocean, [firstWet, firstWet, firstWet], "all-water National Park");
    if (wetPark) {
      const allWet = { get id() { return wetPark.id; }, get anchor() { return wetPark.anchor; },
        get tiles() { return c.parkById(wetPark.id).tiles; }, get pending() { return c.parkById(wetPark.id).pending; } };
      const plan = np.draw.planFor(c.parkById(allWet.id));
      check("all-water National Park: planned without buildings", plan.buildings === false, `buildings ${plan.buildings}`);
      check("all-water National Park: nothing built, no paths", plan.built.length === 0 && plan.paths.length === 0, `built ${plan.built.length}, paths ${plan.paths.length}`);
      check("all-water National Park: no walls or fences", np.draw.wallEdges(allWet.tiles).length === 0, `${np.draw.wallEdges(allWet.tiles).length} wall edges`);
      emit(`NOTE all-water National Park: ${np.draw.buoyCorners(c.parkById(allWet.id).tiles).length} buoys`);
      emit(`SHOT 04-all-water-national-park ${loc(ocean).x} ${loc(ocean).y}`);

      // 4. Expand in this age: 400 Gold or 100 production for 1 tile
      const cityForCost = towns.find((s) => !s.isTown) || A;
      const cost = cityForCost.Production.getProjectProductionCost(ex.$index);
      check(`${age} Expand: the city project costs 100 production`, cost === 100, `${cost} at ${Locale.compose(cityForCost.name)}`);
      check(`${age} Expand: the Gold price is 400`, c.expansionPrice(A.id) === 400, `${c.expansionPrice(A.id)}`);
      UI.Player.selectCity(A.id); await w(800);
      const g0 = gold();
      const why = np.buySelected("park");
      await w(2500);
      check(`${age} Expand: buying one takes 400 Gold and adds 1 tile to choose`, !why && g0 - gold() === 400 && allWet.pending === 1, `refusal "${why}", paid ${g0 - gold()}, pending ${allWet.pending}`);
      UI.Player.deselectAllCities(); InterfaceMode.switchToDefault();
      // The purchase opens the picker itself once the map is free.
      check(`${age} Expand: the picker opens by itself after the purchase`, await until(() => mode() === "INTERFACEMODE_NP_ADD_TILES", 8000), `mode ${mode()}`);
      if (mode() !== "INTERFACEMODE_NP_ADD_TILES") np.open(allWet.id);
      await w(1200);
      const t1 = c.eligibleTiles(c.parkById(allWet.id)).find(wet);
      if (t1 != null) { np.choose(loc(t1).x, loc(t1).y); await w(500); np.confirm(); }
      await until(() => allWet.tiles.length === 5, 6000);
      check(`${age} Expand: the bought tile joins`, allWet.tiles.length === 5 && allWet.pending === 0, `tiles ${allWet.tiles.length}, pending ${allWet.pending}`);
      // A finished Expand project, as the game reports one.
      np.projectCompleted({ player: 0, cityID: A.id, projectType: ex.$index, location: loc(allWet.anchor) });
      await w(1500);
      check(`${age} Expand: a finished project adds 1 tile to choose`, allWet.pending === 1, `pending ${allWet.pending}`);
      if (mode() !== "INTERFACEMODE_NP_ADD_TILES") np.open(allWet.id);
      await w(1200);
      const t2 = c.eligibleTiles(c.parkById(allWet.id)).find(wet);
      if (t2 != null) { np.choose(loc(t2).x, loc(t2).y); await w(500); np.confirm(); }
      await until(() => allWet.tiles.length === 6, 6000);
      check(`${age} Expand: and that tile joins`, allWet.tiles.length === 6 && allWet.pending === 0, `tiles ${allWet.tiles.length}, pending ${allWet.pending}`);
      check("all-water National Park after growing: still nothing built", np.draw.planFor(c.parkById(allWet.id)).built.length === 0 && np.draw.wallEdges(allWet.tiles).length === 0);
    }

    // 3. a Wilderness Area on water (coast or lake), in another settlement where there is one
    const coastOf = (s) => sites(s, (i) => terr(i) === "TERRAIN_COAST" && emptyWater(i)).owned.find((i) => c.foundingTiles(s.id).includes(i));
    const B = towns.find((s) => !same(s.id, A.id) && coastOf(s) != null) || (coastOf(A) != null ? A : null);
    if (check("a settlement with an empty coast or lake tile for the Wilderness Area", !!B)) {
      const at = coastOf(B);
      const wa = await found(B, "wilderness", at, [(cand) => firstWet(cand) ?? cand[0], (cand) => cand[0], (cand) => cand[0]], "Wilderness Area on water");
      if (wa) emit(`SHOT 05-wilderness-on-water ${loc(at).x} ${loc(at).y}`);
    }

    // 5 (with 2). a National Park on water with land: its lodge on the first dry tile
    const C = towns.find((s) => !same(s.id, A.id) && !c.parks().some((p) => p.kind === "park" && same(c.settlementOf(p), s.id))
      && coastOf(s) != null && ring(coastOf(s)).some((n) => same(cityAt(n), s.id) && firstDry([n]) != null && c.canJoin(n, 0, c.allParkTiles())));
    if (C) {
      const at = coastOf(C);
      const mixed = await found(C, "park", at, [(cand) => firstDry(cand) ?? cand[0], (cand) => cand[0], (cand) => cand[0]], "National Park on water with land");
      if (mixed) {
        const plan = np.draw.planFor(mixed);
        check("National Park on water with land: the lodge is on dry land", plan.buildings && !wet(plan.anchor), `lodge ${L(plan.anchor)} ${terr(plan.anchor).slice(8)}`);
        check("National Park on water with land: something is built on the lodge tile", plan.built.some((e) => plan.tileAt([e[1], e[2]]) === plan.anchor));
        emit(`SHOT 06-water-park-with-land ${loc(at).x} ${loc(at).y}`);
      }
    } else emit("NOTE no third settlement with coast beside free dry land; the lodge-on-land check was watched on the usual set on 2026-10-25");

    // 6. an AI founding takes its 3 tiles only once it stands
    const ais = Players.getAlive().filter((p) => p.isMajor && !p.isHuman);
    let aiCity = null;
    for (const p of ais) for (const s of p.Cities.getCities()) if (!aiCity && c.foundingTiles(s.id).length >= 1
      && !c.parks().some((q) => same(c.settlementOf(q), s.id))) aiCity = s;
    if (check("an AI settlement with land to found on", !!aiCity)) {
      c.addFounding("park", aiCity.owner, aiCity.id, { paid: 1600, by: "gold", name: "probe" });
      np.sweep();
      let early = -1, park = null;
      for (let t = 0; t < 15000; t += 100) {
        park = c.parks().find((q) => q.owner === aiCity.owner && same(c.settlementOf(q), aiCity.id));
        if (park && park.founding && park.tiles.length > 1) early = park.tiles.length;
        if (park && !park.founding && park.tiles.length === 4) break;
        await w(100);
      }
      check("AI founding: no tiles taken while its improvement isn't standing yet", early < 0, early < 0 ? "" : `${early} tiles while carrying`);
      check("AI founding: 4 tiles once it stands", !!park && !park.founding && park.tiles.length === 4, park ? `tiles ${park.tiles.map(L).join(" ")}, carrying ${!!park.founding}` : "no park");
    }
  } catch (e) {
    emit(`FAIL probe threw: ${e && e.stack || e}`);
    out.fail++;
  }
  emit(`DONE ${out.pass} passed, ${out.fail} failed`);
  out.done = true;
})()
