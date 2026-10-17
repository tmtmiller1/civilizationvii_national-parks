// np-core-map.js - National Parks: reads of the map (plots, districts, constructibles, appeal) and the settlement
// that holds a plot.
"use strict";

import { PARK_TYPES, RING, isMarkerType, isParkCompatible, isRuralImprovement, kindByImprovement, log,
  safe } from "./np-core-base.js";

// map reads

export function idx(loc) { return GameplayMap.getIndexFromLocation(loc); }
export function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }

/** The six neighbors of a plot in RING order; -1 where the map ends. */
export function ringOf(i) {
  const loc = locOf(i);
  return RING.map((d) => {
    const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[d]), null);
    return n && n.x >= 0 && n.y >= 0 ? idx(n) : -1;
  });
}

export function terrainOf(i) {
  const l = locOf(i);
  return safe(() => String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y)).TerrainType), "");
}
export function biomeOf(i) {
  const l = locOf(i);
  return safe(() => String(GameInfo.Biomes.lookup(GameplayMap.getBiomeType(l.x, l.y)).BiomeType), "");
}
export function featureOf(i) {
  const l = locOf(i);
  return safe(() => {
    const f = GameplayMap.getFeatureType(l.x, l.y);
    return f == null || f < 0 ? "" : String(GameInfo.Features.lookup(f).FeatureType);
  }, "");
}
export function ownerOf(i) { const l = locOf(i); return safe(() => GameplayMap.getOwner(l.x, l.y), -1); }
export function isWater(i) { const l = locOf(i); return safe(() => GameplayMap.isWater(l.x, l.y), true); }
export function isMountain(i) { const l = locOf(i); return safe(() => GameplayMap.isMountain(l.x, l.y), false); }
export function isLake(i) { const l = locOf(i); return safe(() => GameplayMap.isLake(l.x, l.y), false); }
/** A minor river: it runs through the middle of its tile, not along an edge. */
export function isRiver(i) { const l = locOf(i); return safe(() => GameplayMap.isRiver(l.x, l.y), false); }
export function isNavRiver(i) { const l = locOf(i); return safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false); }
export function isRevealed(i) {
  const l = locOf(i);
  return safe(() => GameplayMap.getRevealedState(GameContext.localPlayerID, l.x, l.y) !== RevealedStates.HIDDEN, false);
}

let wonderFeatures = null;
export function isWonder(i) {
  if (!wonderFeatures) {
    wonderFeatures = new Set();
    safe(() => GameInfo.Feature_NaturalWonders.forEach((r) => wonderFeatures.add(String(r.FeatureType))));
  }
  const f = featureOf(i);
  return !!f && wonderFeatures.has(f);
}

function sameLoc(a, l) { return !!a && a.x === l.x && a.y === l.y; }

/**
 * What stands on a plot: { items: [{ type, complete, owner, id }], stray }. After a plot changes hands its ids can
 * resolve against the new owner's own objects elsewhere (a park tile bought by an AI city read as
 * a sawmill and an urban district 8 tiles away, and destroying "its" district destroyed that one). An entry whose
 * object is not on this plot is left out of `items` and counted in `stray`.
 */
export function readPlot(i) {
  const l = locOf(i);
  const out = { items: [], stray: 0 };
  for (const c of safe(() => MapConstructibles.getConstructibles(l.x, l.y), null) || []) {
    const inst = safe(() => Constructibles.getByComponentID(c), null);
    if (!inst || (inst.location && !sameLoc(inst.location, l))) { out.stray++; continue; }
    const type = safe(() => String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), "");
    out.items.push({ type, complete: inst.complete !== false, owner: inst.owner,
      id: inst.localId != null ? inst.localId : inst.id });
  }
  return out;
}
/** Constructibles on a plot: [{ type, complete, owner, id }], strays left out (see readPlot). */
export function constructiblesAt(i) { return readPlot(i).items; }
/** The district on a plot as { owner, id }, or null; one whose id resolves to another plot counts as none. */
export function districtIdAt(i) {
  const l = locOf(i);
  const id = safe(() => Districts.getIdAtLocation(l), null);
  if (!id) return null;
  const d = safe(() => Districts.get(id), null);
  return d && d.location && !sameLoc(d.location, l) ? null : id;
}
export function hasDistrict(i) { const l = locOf(i); return !!safe(() => Districts.getAtLocation(l), null); }
/** "none", "rural", "wild" (a wilderness district, which park land sits on), or "other" (urban, city center, wonder,
 *  or one whose id resolves to another plot). */
export function districtKind(i) {
  const l = locOf(i);
  const d = safe(() => Districts.getAtLocation(l), null);
  if (!d) return "none";
  if (d.location && !sameLoc(d.location, l)) return "other";
  const type = safe(() => String(GameInfo.Districts.lookup(d.type).DistrictType), "");
  return type === "DISTRICT_RURAL" ? "rural" : type === "DISTRICT_WILDERNESS" ? "wild" : "other";
}
/** The resource on a plot as its type name, or "". */
export function resourceAt(i) {
  const l = locOf(i);
  return safe(() => {
    const r = GameplayMap.getResourceType(l.x, l.y);
    return r != null && r >= 0 ? String(GameInfo.Resources.lookup(r).ResourceType) : "";
  }, "");
}
/** The rural improvements on a plot that a park would strip: every improvement but the park's own. */
export function strippableAt(i) {
  if (isStrewnResource(i)) return [];   // a resource tile is left as it stands
  return constructiblesAt(i).filter((c) => isRuralImprovement(c.type));
}
export function hasResource(i) {
  const l = locOf(i);
  return safe(() => { const r = GameplayMap.getResourceType(l.x, l.y); return r != null && r >= 0; }, false);
}
/** Plain coast or ocean: water that is not a lake, a navigable river or a natural wonder. */
export function isOpenWater(i) { return isWater(i) && !isLake(i) && !isNavRiver(i) && !isWonder(i); }
export function hasParkImprovement(i) { return !!parkKindAt(i); }
/** The kind of park whose finished founding improvement stands on a plot, or null. */
export function parkKindAt(i) {
  const c = constructiblesAt(i).find((k) => PARK_TYPES.has(k.type) && k.complete);
  return c ? kindByImprovement(c.type).key : null;
}
/**
 * A tile with a resource must look exactly as the game draws it (owner's rule, 2026-10-05). The district park land
 * sits on hides the resource's art as it hides vegetation, and placing the model named after the resource puts back
 * only some of it (silver's ore drew, coffee's bushes did not; many resources are strewn over the tile by the game
 * and have no model to place at all). So a tile with any resource joins a park as a wonder's Expedition Base does:
 * it keeps whatever stands on it, gets no district and no marker, and pays its own yields instead of the park's.
 */
export function isStrewnResource(i) { return hasResource(i); }
/** Constructibles that are not the park's own markers: what would make a tile someone else's. */
export function foreignConstructiblesAt(i) { return constructiblesAt(i).filter((c) => !isParkCompatible(c.type)); }
export function markersAt(i) { return constructiblesAt(i).filter((c) => isMarkerType(c.type)); }


// appeal
//
// A park is founded on Charming land, by the game's own appeal: the number its plot tooltip and appeal lens show. A
// tile's appeal is the sum of its six neighbours' Terrains.Appeal and Features.Appeal (mountain, coast and navigable
// river 1; forest, rainforest, taiga, savanna woodland and sagebrush steppe 1; a natural wonder 6), with a wonder tile
// counting its own 6 too and open water reading 0; rivers, resources, improvements and districts add nothing
// (engine-closed.md). Appeal sets nothing else: a park's yields do not depend on it, and no tile
// ever leaves a park, nor a founding tile moves, because its appeal fell.

/** Pure: whether an appeal is Charming or better against the game's thresholds { charming }. */
export function isCharming(appeal, th) { return appeal >= th.charming; }

let thresholdCache = null;
/** The game's Charming threshold (GlobalParameters APPEAL_FOR_HAPPINESS_TILE_YIELD), read once a game. */
export function appealThresholds() {
  if (thresholdCache) return thresholdCache;
  const charming = safe(() => Number([...GameInfo.GlobalParameters].find((r) => r.Name === "APPEAL_FOR_HAPPINESS_TILE_YIELD").Value), NaN);
  if (!Number.isFinite(charming)) {
    // Not cached: without the database row no tile reads as Charming yet.
    log("appeal threshold missing from GlobalParameters");
    return { charming: Infinity };
  }
  thresholdCache = { charming };
  return thresholdCache;
}
export function gameAppeal(i) { const l = locOf(i); return safe(() => GameplayMap.getAppeal(l.x, l.y), 0) || 0; }
export function charmingAt(i) { return isCharming(gameAppeal(i), appealThresholds()); }

/** Where a wall would stand in water or against rock: no wall on or facing a sea, lake, navigable river,
 *  mountain or natural wonder, nor at the map's edge. */
export function isImpassableEdgeTile(i) {
  return i < 0 || isWater(i) || isNavRiver(i) || isMountain(i) || isWonder(i);
}

/** An independent power (`isMajor` false; `isMinor` is false for them too, engine-closed.md). */
export function isIndependent(owner) { return owner >= 0 && safe(() => Players.get(owner).isMajor === false, false); }
export function cityIdOf(park) {
  const l = locOf(park.anchor);
  return safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null);
}
/**
 * The settlement that holds plot i, as a ComponentID, or null. A park tile's district and marker belong to it, as every
 * worked tile belongs to the settlement that owns it. In pre-release builds they took the park's founding settlement,
 * so a tile taken from a neighbouring settlement carried a district its own settlement did not list.
 */
export function tileCityOf(i) {
  const l = locOf(i);
  return safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.id !== -1 ? c : null; }, null);
}
export function sameCity(a, b) { return !!a && !!b && a.owner === b.owner && a.id === b.id; }

/** The settlement (city or town) that holds a park's founding tile, as a ComponentID, or null. */
export function settlementOf(park) { return park ? cityIdOf(park) : null; }
