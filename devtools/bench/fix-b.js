// fix-b.js - DEV ONLY. For every park, every building the game offers its settlement (unwrapped BUILD and PURCHASE):
// how many offer the founding tile, and how many a marked tile. No writes.
(() => {
  const np = globalThis.__towerNationalPark; const c = np.core; const nat = np.nativeCanStart();
  const out = [];
  for (const p of c.parks()) {
    const city = c.settlementOf(p); const cityObj = Cities.get(city);
    const marked = p.tiles.filter((t) => t !== p.anchor && c.markersAt(t).length);
    const r = { park: p.id, owner: p.owner, town: !!(cityObj && cityObj.isTown), anchor: c.locOf(p.anchor), tried: 0, offered: 0, foundingBuild: [], foundingBuy: [], markedAny: [] };
    for (const b of GameInfo.Buildings) {
      const def = GameInfo.Constructibles.lookup(b.ConstructibleType); if (!def) continue;
      const a = { ConstructibleType: def.$index };
      const rb = nat.ops.call(Game.CityOperations, city, CityOperationTypes.BUILD, a, false);
      const rp = nat.cmds.call(Game.CityCommands, city, CityCommandTypes.PURCHASE, a, false);
      r.tried++;
      const pb = (rb && rb.Plots) || [], pp = (rp && rp.Plots) || [];
      if (pb.length || pp.length) r.offered++;
      if (pb.includes(p.anchor)) r.foundingBuild.push(b.ConstructibleType);
      if (pp.includes(p.anchor)) r.foundingBuy.push(b.ConstructibleType);
      if (marked.some((t) => pb.includes(t) || pp.includes(t))) r.markedAny.push(b.ConstructibleType);
    }
    out.push(r);
  }
  return JSON.stringify(out);
})()
