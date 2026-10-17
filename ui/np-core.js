// np-core.js - National Parks: map reads, the park registry, and the rules for which land a park may take.
//
// A park is a founding tile (the IMPROVEMENT_NATIONAL_PARK constructible) plus the land added to it by the Expand
// National Park project. The registry lives in the save through a GameConfiguration key, the same store Canals and
// Geographic Labels use, so it survives save and reload.
//
// Record: { id, owner, anchor, tiles: [plot index], districts: [plot index], pending, autoName, customName, founded }
//   anchor   the founding tile; always tiles[0]
//   districts the rural districts the mod made under its markers (destroyed when the park lets go of land its
//            owner still holds, forgotten when the land passes to someone else)
//   pending  tiles the owner may still add from completed expansions
//   founding the founding a park was made from, until its improvement first stands (np-core-sweep.js returnFounding)
"use strict";

// The code is split by what it does; this file re-exports it under the names the rest of the mod imports.
export { KINDS, kindOf, kindByImprovement, kindByProject, kindByFoundProject, PARK_TYPE, PARK_TYPES, PROJECT_TYPE,
  PROJECT_TYPES, MARKER_TYPES, tilesPerExpansion, MAX_PARK_TILES, limits, isFull, room, RING, safe, log,
  isMarkerType, KEPT_IMPROVEMENTS, isParkCompatible, MILESTONES, milestoneLevel, landMarker, setReadOnly, isReadOnly,
  landPayout, isRuralImprovement, hash01, autoplaying } from "./np-core-base.js";
export { idx, locOf, ringOf, terrainOf, biomeOf, featureOf, ownerOf, isWater, isMountain, isLake, isRiver,
  isNavRiver, isRevealed, isWonder, readPlot, constructiblesAt, districtIdAt, hasDistrict, districtKind, resourceAt,
  strippableAt, hasResource, isOpenWater, hasParkImprovement, parkKindAt, isStrewnResource, foreignConstructiblesAt,
  markersAt, isCharming, appealThresholds, gameAppeal, charmingAt, isImpassableEdgeTile, isIndependent,
  settlementOf } from "./np-core-map.js";
export { load, save, resetCache, parks, parkById, parkAtAnchor, parkOfTile, displayName, allParkTiles, createPark,
  playerParkTiles, parkLevel, markerFor, foundings, foundingById, addFounding, dropFounding, foundingRefund,
  FOUNDING_ASK_TURNS, foundingFate, completionOutcome, staleQueueEntries, notices, noticesFor, addNotice, dropNotice,
  settlementHasKind, unlandedOutcome } from "./np-core-registry.js";
export { dissolvePark, until, inSequence, isSettling, parkDistrictKind, placeMarker, releaseTile,
  ensureMarkers } from "./np-core-writes.js";
export { foundable, foundFacts, foundingTiles, joinable, needsConfirm, joinFacts, canJoin, connectedSelection,
  eligibleTiles, addTile, aiTakes, GOLD_PER_PRODUCTION, expansionPrice, aiScore, AI_GOLD_PER_POINT, AI_PAYBACK_TURNS,
  AI_PAYBACK_TURNS_RICH, AI_RICH_MULTIPLE, AI_SAVE_SHARE, AI_RESERVE_SHARE, AI_RESERVE_TURNS, aiExpansionWorth,
  aiSavingStep, tileGain } from "./np-core-rules.js";
export { newFoundingTile, foundPark, returnFounding, takeLateLanding, reconcile, scanMap, removeOrphanWilds,
  scanForParkImprovements, orphanMarkerPlots, removeOrphanMarkers } from "./np-core-sweep.js";
