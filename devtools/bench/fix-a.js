// fix-a.js - DEV ONLY. One read of the facts the 1.2.0 fixes rest on, in a loaded game with parks (no writes):
//   founding  the game's own (unwrapped) placement answer for an urban building on each park's founding tile and on
//             one of its marked tiles
//   growth    whether the game's own growth offers (EXPAND, unwrapped) include any park tile, for every settlement
//   wooded    each park tile whose map feature is a wood, and the feature the map still reads there
(() => {
  const np = globalThis.__towerNationalPark; const c = np.core; const nat = np.nativeCanStart();
  const at = (i) => { const l = c.locOf(i); return l.x + "," + l.y; };
  const urban = ["BUILDING_GROCER", "BUILDING_MARKET", "BUILDING_LIBRARY", "BUILDING_BRICKYARD", "BUILDING_ARMORER", "BUILDING_BAZAAR"]
    .map((t) => GameInfo.Constructibles.lookup(t)).filter(Boolean);
  const out = { founding: [], growth: [], wooded: [] };
  for (const p of c.parks()) {
    const city = c.settlementOf(p);
    const marked = p.tiles.find((t) => t !== p.anchor && c.markersAt(t).length);
    for (const b of urban) {
      const r = nat.ops.call(Game.CityOperations, city, CityOperationTypes.BUILD, { ConstructibleType: b.$index }, false);
      if (!r || !r.Plots) continue;
      out.founding.push({ park: p.id, building: b.ConstructibleType, success: r.Success, founding: r.Plots.includes(p.anchor),
        marked: marked != null ? r.Plots.includes(marked) : null, plots: r.Plots.length, reasons: r.FailureReasons || [] });
      break;
    }
    for (const t of p.tiles) {
      const f = c.featureOf(t);
      if (f) out.wooded.push({ park: p.id, at: at(t), feature: f, district: c.districtKind(t), items: c.constructiblesAt(t).map((x) => x.type) });
    }
  }
  const land = c.allParkTiles();
  for (const pl of Players.getAlive()) {
    for (const city of (pl.Cities && pl.Cities.getCities()) || []) {
      const r = nat.cmds.call(Game.CityCommands, city.id, CityCommandTypes.EXPAND, {}, false);
      const plots = (r && r.Plots) || [];
      const bad = plots.filter((i) => land.has(i));
      if (plots.length || bad.length) out.growth.push({ owner: pl.id, city: city.name, offered: plots.length, parkTiles: bad.map(at) });
    }
  }
  return JSON.stringify(out);
})()
