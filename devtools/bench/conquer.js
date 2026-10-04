// conquer.js - dev only. Bench eval: the local player captures the settlement holding park `id`'s founding tile
// (recipe in engine-closed.md: war, damage, melee attacks), then reports the park. Usage: (conquer.js)(id)
(async (id) => {
  const np = globalThis.__towerNationalPark; const c = np.core; const out = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const local = GameContext.localPlayerID; const p = c.parkById(id); const ai = p.owner;
  const al = c.locOf(p.anchor); const cid = GameplayMap.getOwningCityFromXY(al.x, al.y); const city = Cities.get(cid);
  const cl = { x: city.location.x, y: city.location.y };
  out.push(`target ${cid.owner}:${cid.id} at ${cl.x},${cl.y} pop ${city.population} town ${city.isTown}; park ${id} ${p.tiles.length} tiles; met ${Players.get(local).Diplomacy.hasMet(ai)}`);
  const unit = ["UNIT_LINE_INFANTRY", "UNIT_MAN_AT_ARMS"].find((u) => GameInfo.Units.lookup(u));
  const ring = c.ringOf(c.idx(cl)).filter((n) => n >= 0 && !c.isWater(n) && !c.isMountain(n));
  const before = new Set(Players.get(local).Units.getUnitIds().map((u) => u.id));
  for (const n of ring.slice(0, 4)) Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "UNIT", Type: unit, Location: c.locOf(n), Owner: local });
  await sleep(3000);
  const mine = () => Players.get(local).Units.getUnitIds().filter((u) => !before.has(u.id)).map((u) => Units.get(u)).filter(Boolean);
  out.push(`${unit} placed: ${mine().length}`);
  const args = { Player1: local, Player2: ai, Type: DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR };
  out.push(`war canStart ${JSON.stringify(Game.PlayerOperations.canStart(local, PlayerOperationTypes.DECLARE_WAR, args, false))}`);
  Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.DECLARE_WAR, args);
  await sleep(3000);
  out.push(`at war ${Players.get(local).Diplomacy.isAtWarWith(ai)}`);
  const damage = () => {
    try { for (const d of city.Districts.getIds()) { try { Districts.get(d).changeDamage(5000); } catch (_) {} } } catch (_) {}
    try { Districts.getAtLocation(cl).changeDamage(5000); } catch (_) {}
    for (const u of MapUnits.getUnits(cl.x, cl.y) || []) { try { Units.get(u).Health.damageUnit(5000); } catch (_) {} }
  };
  for (const u of mine()) {
    if (GameplayMap.getOwner(cl.x, cl.y) === local) break;
    damage(); await sleep(800);
    Game.UnitOperations.sendRequest(u.id, UnitOperationTypes.MOVE_TO, { X: cl.x, Y: cl.y, Modifiers: UnitOperationMoveModifiers.ATTACK });
    await sleep(4000);
  }
  out.push(`city owner now ${GameplayMap.getOwner(cl.x, cl.y)}`);
  return out.join(" | ");
})
