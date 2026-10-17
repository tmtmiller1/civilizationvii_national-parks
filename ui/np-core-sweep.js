// np-core-sweep.js - National Parks: the sweep's repairs, bringing each park back in line with the map, and the scans
// that find park pieces no park holds.
"use strict";

import { KINDS, autoplaying, isFull, isMarkerType, isParkCompatible, isRuralImprovement, kindOf, log, readOnly,
  safe } from "./np-core-base.js";
import { cityIdOf, constructiblesAt, districtKind, hasDistrict, hasParkImprovement, idx, isIndependent, isMountain,
  isStrewnResource, isWater, isWonder, locOf, markersAt, ownerOf, readPlot, ringOf, sameCity, terrainOf,
  tileCityOf } from "./np-core-map.js";
import { addFounding, allParkTiles, createPark, dropFounding, foundings, load, parks, save,
  unlandedOutcome } from "./np-core-registry.js";
import { MAX_TRIES, failed, failures, inSequence, isSettling, makeParkDistrict, markTile, misfiled, parkDistrictKind,
  rehome, releaseTile, remark, removeAll, removeDistrict, request, stillParkLand, stripImprovements,
  until } from "./np-core-writes.js";
import { foundFacts, foundable } from "./np-core-rules.js";

/**
 * Put a park tile its owner has improved back to park land: the rural improvement is removed and the marker returns.
 * Park land cannot be developed, and the AI plans natively, past the placement hook that holds the players.
 */
function revertTile(park, i, intruders) {
  if (readOnly) return;
  log(`park ${park.id}: reverting ${intruders.map((c) => c.type).join(", ")} on plot ${i}`);
  inSequence(i, async () => {
    const city = tileCityOf(i);
    if (!(await stripImprovements(i, intruders, city))) return failed(park, i, "revert");
    if (city && stillParkLand(park, i)) await markTile(park, i, city);
    return true;
  });
}

/** Put the founding tile back: a rural improvement on it is removed, then the park improvement made again if it
 *  went. */
function restoreFoundingTile(park, rural, standing) {
  if (readOnly) return;
  const i = park.anchor, owner = park.owner, l = { ...locOf(i) }, city = cityIdOf(park);
  const type = kindOf(park).improvement;
  inSequence(i, async () => {
    if (!(await stripImprovements(i, rural, city))) return failed(park, i, "founding tile strip");
    if (standing || !parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!hasDistrict(i) && !(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (constructiblesAt(i).some((c) => c.type === type)) return true;
    request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    return true;
  });
}

/**
 * A park tile that can carry the park's founding improvement in place of a founding tile built over: the owner's land
 * in the founding settlement, flat or hill, holding only the park's own marker. One beside a natural wonder comes
 * first, then the nearest to the old founding tile. Returns the plot, or -1.
 */
export function newFoundingTile(park, old, city) {
  const ok = park.tiles.filter((t) => {
    if (t === old || isSettling(t) || ownerOf(t) !== park.owner || isWonder(t) || isWater(t)
      || isMountain(t)) return false;
    if (!sameCity(tileCityOf(t), city)) return false;
    if (!["TERRAIN_FLAT", "TERRAIN_HILL"].includes(terrainOf(t))) return false;
    const plot = readPlot(t);
    return !plot.stray && plot.items.every((c) => isMarkerType(c.type));
  });
  const near = (t) => ringOf(t).some((n) => n >= 0 && isWonder(n)) ? 0 : 1;
  const dist = (t) => {
    const a = locOf(t), b = locOf(old);
    return safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), 99);
  };
  ok.sort((a, b) => near(a) - near(b) || dist(a) - dist(b) || a - b);
  return ok.length ? ok[0] : -1;
}

/**
 * Move a park's founding improvement to another of its tiles after its founding tile was built over (an AI's own
 * building; the player's are refused by the placement hook). The built-over tile leaves the park with its building.
 * Returns false when no tile can take it, and the park is then dissolved.
 */
function moveFounding(park) {
  if (readOnly) return false;
  const old = park.anchor;
  const city = cityIdOf(park);
  const to = city ? newFoundingTile(park, old, city) : -1;
  if (to < 0) return false;
  park.tiles = park.tiles.filter((t) => t !== old);
  if (park.districts) park.districts = park.districts.filter((t) => t !== old);
  park.anchor = to;
  save();
  log(`park ${park.id}: founding tile ${old} built over; the park is now founded on ${to}`);
  const owner = park.owner, l = { ...locOf(to) }, type = kindOf(park).improvement;
  inSequence(to, async () => {
    if (!(await removeAll(to, markersAt(to)))) return failed(park, to, "marker removal");
    if (!parks().includes(park) || park.anchor !== to || ownerOf(to) !== owner) return true;
    request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(to).some((c) => c.type === type)))) return failed(park, to, "park improvement");
    return true;
  });
  return true;
}

/**
 * Found the park a founding paid for on plot i: the record is made at once (so the sweep does not take the plot for
 * someone else's), then a wilderness district and the founding improvement are placed by script for the settlement,
 * each read back before the next. On a resource tile the engine may drop the resource's own improvement onto a new
 * district (engine-closed.md, quarry on jade); that is taken off before the park goes on. Returns the park, or null.
 */
export function foundPark(founding, i) {
  if (readOnly || !founding || !foundable(foundFacts(i, founding.city, allParkTiles()))) return null;
  const owner = founding.owner, city = founding.city,
    kind = KINDS[founding.kind] || KINDS.park, type = kind.improvement;
  dropFounding(founding.id);
  const park = createPark(i, owner, kind.key);
  park.districts = [i];
  // Kept until the park improvement stands, so a founding that never lands can go back to waiting (returnFounding).
  park.founding = { kind: kind.key, owner, city: { ...city }, made: founding.made, paid: founding.paid, by: founding.by,
    name: founding.name };
  save();
  const l = { ...locOf(i) };
  log(`park ${park.id}: founded on plot ${i} (${l.x},${l.y})`);
  inSequence(i, async () => {
    if (!(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (!parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!constructiblesAt(i).some((c) => c.type === type)) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    failures.delete(i);
    landed(park);
    return true;
  });
  return park;
}

/** The park improvement stands: the park is its founding's for good. */
function landed(park) {
  if (!park.founding) return;
  delete park.founding;
  save();
}

/**
 * A park whose founding never landed (unlandedOutcome) goes back to the founding it was made from, with what that
 * cost: the record goes, the founding waits for its land again (np-main.js tells a human; an AI's places itself on
 * another tile, or is refunded as any founding with no land), and what the tries left on the tile is taken off: a
 * half-made park improvement, then the district made for it. Land it took meanwhile is let go as any park's is.
 * The tile itself isn't offered again this session
 * (foundFacts). Returns the new founding, or null.
 */
export function returnFounding(park) {
  if (readOnly || !park || !park.founding) return null;
  const was = park.founding, i = park.anchor, type = kindOf(park).improvement;
  const made = !!(park.districts && park.districts.includes(i));
  for (const t of park.tiles) if (t !== i) releaseTile(park, t);
  const s = load();
  s.parks = s.parks.filter((p) => p.id !== park.id);
  const f = addFounding(was.kind, was.owner, was.city, { paid: was.paid, by: was.by, name: was.name });
  if (was.made != null) f.made = was.made;
  f.lostAt = i;
  save();
  const owner = park.owner, city = tileCityOf(i);
  inSequence(i, async () => {
    if (!(await removeAll(i, constructiblesAt(i).filter((c) => c.type === type)))) return false;
    if (!made || !city || readPlot(i).items.length) return true;
    return removeDistrict(null, i, city, owner);
  });
  return f;
}

/**
 * A founding's park improvement that lands after its park went back to waiting: the waiting founding is used up by it,
 * so the park is founded once and nothing is paid back. Returns the founding taken, or null.
 */
export function takeLateLanding(i, owner) {
  const f = foundings().find((w) => w.lostAt === i && w.owner === owner);
  if (!f) return null;
  dropFounding(f.id);
  log(`founding ${f.id}: its park landed late on plot ${i}; the park is that founding's`);
  return f;
}

const rewilded = new Set();   // plots moved onto a wilderness district this session; one try each

/** Move a park tile still on a rural district (the owner's, or a pre-release park's) onto a wilderness district. */
function rewild(park, i) {
  if (readOnly || rewilded.has(i)) return false;
  rewilded.add(i);
  const city = tileCityOf(i);
  if (!city) return false;
  log(`park ${park.id}: plot ${i} moved onto its ${parkDistrictKind(i)} district`);
  inSequence(i, () => markTile(park, i, city));
  return true;
}

/**
 * Move a founding tile from the rural district its settlement built it on to a wilderness district, which no building
 * is offered (see markTile): the park improvement comes off, the district goes and the plot is bought back, then the
 * wilderness district and the park improvement are made again.
 */
function rewildFounding(park) {
  const i = park.anchor;
  if (readOnly || rewilded.has(i)) return false;
  rewilded.add(i);
  const owner = park.owner, l = { ...locOf(i) }, city = cityIdOf(park), type = kindOf(park).improvement;
  if (!city) return false;
  log(`park ${park.id}: founding tile moved onto its ${parkDistrictKind(i)} district`);
  inSequence(i, async () => {
    if (!(await removeAll(i, constructiblesAt(i).filter((c) => c.type === type)))) return failed(park, i, "park improvement removal");
    if (!(await removeDistrict(park, i, city, owner))) return false;
    if (!parks().includes(park) || ownerOf(i) !== owner) return true;
    if (!hasDistrict(i) && !(await makeParkDistrict(i, l, city, owner, type))) return failed(park, i, "founding district");
    if (!constructiblesAt(i).some((c) => c.type === type)) request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: l, Parent: city, Owner: owner });
    if (!(await until(() => constructiblesAt(i).some((c) => c.type === type)))) return failed(park, i, "park improvement");
    return true;
  });
  return true;
}

/**
 * Bring a park back in line with the map. The owner follows the founding tile. Land lost to another owner is let go.
 * A rural improvement the owner puts on park land is reverted (revertTile), at most MAX_TRIES times a session, but
 * not on a resource tile, which keeps what stands on it; a building or an urban district is never removed: that tile
 * leaves the park instead. If it is the founding tile, the park's founding improvement moves to
 * another of its tiles (moveFounding); with none to take it the park is dissolved, as it is once its founding tile
 * belongs to no one. A full park's unused tiles lapse. Tiles the mod is
 * still writing to, and plots that cannot be read, are left for a later sweep. A park whose founding never landed
 * returns "unlanded", and np-main.js hands it back to its founding (returnFounding). Returns "dissolved", "unlanded",
 * "changed" or "".
 */
export function reconcile(park) {
  const owner = ownerOf(park.anchor);
  if (owner === -1) return unowned(park);
  const moved = followOwner(park, owner);
  if (isIndependent(owner)) return reconcileIndependent(park) || (moved ? "changed" : "");
  const founding = isSettling(park.anchor) ? "" : reconcileFounding(park, owner);
  if (FOUNDING_ENDS[founding]) return FOUNDING_ENDS[founding];
  const land = reconcileLand(park);
  return moved || founding === "restored" || land ? "changed" : "";
}

/** While the founding tile is being rebuilt its plot is briefly unowned (a district's removal releases it); otherwise
 *  a park whose founding tile belongs to no one is dissolved. */
function unowned(park) { return isSettling(park.anchor) ? "" : "dissolved"; }

/** Every tile but the founding tile, then the tiles found lost, then a full park's unused expansions. Returns whether
 *  anything changed. */
function reconcileLand(park) {
  let changed = false;
  const lost = [];
  for (const t of park.tiles) {
    const r = reconcileTile(park, t);
    if (r === "lost") lost.push(t);
    else if (r) changed = true;
  }
  if (letGo(park, lost)) changed = true;
  if (isFull(park) && park.pending > 0) { park.pending = 0; changed = true; }
  return changed;
}

/** What reconcile returns at once after the founding tile's step; "restored" and "" carry on to the land. */
const FOUNDING_ENDS = { moved: "changed", rebuilt: "changed", dissolved: "dissolved", unlanded: "unlanded" };

/** The owner follows the founding tile. Gold an AI set aside for the park stays with the player that saved it; a new
 *  owner starts its own fund. Returns whether the owner changed. */
function followOwner(park, owner) {
  if (owner === park.owner) return false;
  park.owner = owner;
  park.aiFund = 0;
  return true;
}

/** The founding tile: built over (the park moves, or ends), on the wrong district (rebuilt), or farmed or missing its
 *  improvement (restored), or never landed (unlanded). Returns "moved", "dissolved", "rebuilt", "restored", "unlanded"
 *  or "". */
function reconcileFounding(park, owner) {
  const a = readPlot(park.anchor);
  if (a.stray) return "";
  const own = (t) => t === kindOf(park).improvement;
  const urban = districtKind(park.anchor) === "other" || a.items.some((c) => !own(c.type) && !isRuralImprovement(c.type));
  if (urban) return moveFounding(park) ? "moved" : "dissolved";
  const standing = a.items.some((c) => own(c.type) && c.complete);
  if (neverLanded(park, standing)) return "unlanded";
  if (standing && districtKind(park.anchor) !== parkDistrictKind(park.anchor) && rewildFounding(park)) return "rebuilt";
  return restoreFounding(park, owner, a, standing) ? "restored" : "";
}

/** Whether the park's founding never landed and its tries have run out (unlandedOutcome); a park whose improvement
 *  stands is its founding's for good. */
function neverLanded(park, standing) {
  if (standing) landed(park);
  return unlandedOutcome({ founding: !!park.founding, standing, tries: failures.get(park.anchor) || 0,
    maxTries: MAX_TRIES, settling: isSettling(park.anchor), autoplay: autoplaying(), readOnly }).act === "return";
}

/** A farm or the like put on the founding tile is stripped, and the park improvement put back if it went. */
function restoreFounding(park, owner, a, standing) {
  const rural = a.items.filter((c) => c.owner === owner && isRuralImprovement(c.type));
  if (!(rural.length || !standing) || readOnly || (failures.get(park.anchor) || 0) >= MAX_TRIES) return false;
  restoreFoundingTile(park, rural, standing);
  log(`park ${park.id}: founding tile restored`);
  return true;
}

/** One tile of park land. Returns "lost" when it leaves the park, true when a repair was started, false otherwise. */
function reconcileTile(park, t) {
  if (t === park.anchor || isSettling(t)) return false;
  if (ownerOf(t) !== park.owner) return "lost";
  const plot = readPlot(t);
  if (plot.stray) return false;
  const intruders = plot.items.filter((c) => !isParkCompatible(c.type));
  return intruders.length ? builtOnTile(park, t, intruders) : repairTile(park, t);
}

/** A tile holding only park pieces: filed with the wrong settlement, on the wrong district, or carrying the wrong
 *  marker. One on an urban or other district leaves the park. */
function repairTile(park, t) {
  if (districtKind(t) === "rural" && misfiled(park, t)) return rehome(park, t);
  const dk = districtKind(t);
  if ((dk === "rural" || dk === "wild") && dk !== parkDistrictKind(t) && markersAt(t).length) return rewild(park, t);
  if (districtKind(t) !== "other") return remark(park, t);
  return "lost";
}

/** A tile something else stands on: anything but its owner's rural improvement makes it leave the park; that
 *  improvement is reverted. */
function builtOnTile(park, t, intruders) {
  if (districtKind(t) === "other" || intruders.some((c) => !isRuralImprovement(c.type) || c.owner !== park.owner)) return "lost";
  // A resource tile keeps what its owner builds on it, as it kept what stood there when it joined (addTile).
  if (isStrewnResource(t) || (failures.get(t) || 0) >= MAX_TRIES) return false;
  revertTile(park, t, intruders);
  return true;
}

/** Let go of the tiles a sweep found lost. Returns whether there were any. */
function letGo(park, lost) {
  if (!lost.length) return false;
  park.tiles = park.tiles.filter((t) => !lost.includes(t));   // before any destroy: its removal event re-runs the sweep
  for (const t of lost) log(`park ${park.id}: tile ${t} left the park (${releaseTile(park, t)})`);
  return true;
}

/**
 * An independent power's park is left to the game. A settlement that passes to one is taken apart a few districts a
 * turn until its land is released, park land and the rest alike; putting the park's pieces back
 * kept that settlement from ever going. So nothing is written: a tile whose district the game removed is forgotten,
 * and the park ends with its founding improvement. Returns "dissolved", "changed" or "".
 */
function reconcileIndependent(park) {
  const a = readPlot(park.anchor);
  if (!a.stray && !a.items.some((c) => c.type === kindOf(park).improvement)) return "dissolved";
  const kept = park.tiles.filter((t) => t === park.anchor || (ownerOf(t) === park.owner && districtKind(t) !== "none"));
  if (kept.length === park.tiles.length) return "";
  for (const t of park.tiles) if (!kept.includes(t)) log(`park ${park.id}: tile ${t} left the park (taken down by the game)`);
  park.tiles = kept;
  if (park.districts) park.districts = park.districts.filter((t) => kept.includes(t));
  return "changed";
}

/** One pass over the map: plots holding a finished park improvement, and plots holding a land marker. */
export function scanMap() {
  const anchors = [], markers = [], wilds = [];
  const w = safe(() => GameplayMap.getGridWidth(), 0);
  const h = safe(() => GameplayMap.getGridHeight(), 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const list = safe(() => MapConstructibles.getConstructibles(x, y), null);
    if (!list || !list.length) {
      const wild = filedWild(x, y);
      if (wild >= 0) wilds.push(wild);
      continue;
    }
    const i = idx({ x, y });
    if (hasParkImprovement(i)) anchors.push(i);
    if (markersAt(i).length) markers.push(i);
  }
  return { anchors, markers, wilds };
}

/** An empty wilderness district filed with a settlement: one a park made, on land that has since left it. Returns its
 *  plot, or -1. */
function filedWild(x, y) {
  const d = safe(() => Districts.getAtLocation({ x, y }), null);
  if (!d) return -1;
  const i = idx({ x, y });
  const filed = safe(() => d.cityId && d.cityId.id !== -1 && Players.get(d.cityId.owner).isMajor, false);
  return filed && districtKind(i) === "wild" ? i : -1;
}

/**
 * Take away the empty wilderness districts a park left on land it no longer holds (a tile that passed to another
 * player stays theirs, with its district): a wilderness tile can take no building and no farm, so it would be dead
 * land for its new owner. The plot, which the removal releases, is bought back for the settlement that held it. The
 * game's own wilderness districts belong to independent powers and have no settlement, so they are never touched.
 */
export function removeOrphanWilds(plots) {
  if (readOnly) return 0;
  const taken = allParkTiles();
  const orphans = (plots || []).filter((i) => !taken.has(i) && !isSettling(i));
  for (const i of orphans) {
    const city = tileCityOf(i), owner = ownerOf(i);
    if (!city || owner < 0) continue;
    log(`plot ${i}: an empty wilderness district no park holds; removed`);
    inSequence(i, () => removeDistrict(null, i, city, owner));
  }
  return orphans.length;
}

/** Plot indices that hold a finished National Park improvement, anywhere on the map. */
export function scanForParkImprovements() { return scanMap().anchors; }

/**
 * Marker plots no park holds, from a scan (pure given `taken` and `busy`). A marker outlives its park's record when
 * land passes to another owner (the park only forgets it) or a record is lost; it would pay park yields forever and
 * keep the tile from being improved.
 */
export function orphanMarkerPlots(markerPlots, taken, busy = () => false) {
  return markerPlots.filter((i) => !taken.has(i) && !busy(i));
}

/** Take the markers off plots no park holds. Returns how many plots were cleared. */
export function removeOrphanMarkers(markerPlots) {
  if (readOnly) return 0;
  const orphans = orphanMarkerPlots(markerPlots, allParkTiles(), isSettling).filter((i) => !isIndependent(ownerOf(i)));
  for (const i of orphans) {
    log(`plot ${i}: marker belongs to no park; removed`);
    inSequence(i, async () => { if (!(await removeAll(i, markersAt(i)))) failed(null, i, "orphan marker removal"); });
  }
  return orphans.length;
}
