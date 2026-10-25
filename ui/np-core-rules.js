// np-core-rules.js - National Parks: which land a park may be founded on or take, adding a tile, and whether an AI
// buys an expansion.
"use strict";

import { KINDS, isFull, isParkCompatible, isRuralImprovement, kindOf, landPayout, log, milestoneLevel, readOnly,
  safe } from "./np-core-base.js";
import { charmingAt, districtKind, featureOf, hasDistrict, isLake, isMountain, isNavRiver, isWater, isWonder, locOf,
  ownerOf, readPlot, resourceAt, ringOf, sameCity, strippableAt, terrainOf, tileCityOf } from "./np-core-map.js";
import { allParkTiles, save } from "./np-core-registry.js";
import { MAX_TRIES, failed, failures, inSequence, isSettling, markTile, stillParkLand,
  stripImprovements } from "./np-core-writes.js";

/**
 * The rule for a founding tile, on facts read from the map (pure): an empty tile the settlement itself holds, Charming
 * land or any water. Empty means nothing man-made on it: no district, no improvement, no building. A resource or a
 * feature (forest, marsh) is natural and does not bar it. Land is flat or hill, not a mountain or a natural wonder;
 * those can join the park afterwards. Charming is the game's own appeal tier, which open water never reaches (it reads
 * 0), so water is taken as it is: coast, lake or open ocean, not a navigable river. A park founded on water has its
 * lodge on its first land (np-plan.js lodgeTile).
 */
export function foundable(f) {
  if (f.taken || f.stray || !f.ownCity || !(f.water || f.charming)) return false;
  return foundingGround(f) && !f.district && !f.items;
}

/** Water, or flat or hill land; not a mountain or a natural wonder. */
function foundingGround(f) {
  if (f.mountain || f.wonder) return false;
  return f.water || f.terrain === "TERRAIN_FLAT" || f.terrain === "TERRAIN_HILL";
}

/** The facts `foundable` reads, for plot i and the settlement `city`. */
export function foundFacts(i, city, taken) {
  const plot = readPlot(i);
  // A tile the game refused a founding's writes MAX_TRIES times this session isn't offered again until a reload.
  const refused = (failures.get(i) || 0) >= MAX_TRIES;
  return { taken: taken.has(i) || isSettling(i) || refused, stray: plot.stray > 0,
    ownCity: sameCity(tileCityOf(i), city),
    water: isWater(i) || isLake(i), mountain: isMountain(i), wonder: isWonder(i),
    terrain: terrainOf(i),
    district: hasDistrict(i), items: plot.items.length, charming: charmingAt(i) };
}

/** Plots a settlement may found a park on now: every empty water tile or Charming flat or hill tile it holds, in plot
 *  order. */
export function foundingTiles(city) {
  if (!city) return [];
  const taken = allParkTiles();
  const plots = safe(() => Cities.get(city).getPurchasedPlots(), null) || [];
  return plots.filter((i) => foundable(foundFacts(i, city, taken))).sort((a, b) => a - b);
}

// rules

/**
 * The rule for joining, on facts read from the map (pure). A park takes its owner's land that no other park holds: open
 * land, forest, mountains, lakes, rivers, open sea and natural wonders. A rural improvement or a resource does not bar
 * a tile (a resource stays collected; the player is asked before an improvement goes; see needsConfirm), but a
 * building, an urban or other non-rural district, another park's founding tile, or a plot that cannot be read does.
 */
export function joinable(f) {
  if (f.taken || f.owner !== f.parkOwner || f.stray) return false;
  if (f.district === "other") return false;
  return !f.built;
}

/**
 * Whether joining costs the player something to confirm: an improvement stripped. On a resource tile the improvement
 * is the resource's own harvester, and the park's marker takes over collecting the resource
 * (data/national-parks-resources.sql), so that tile joins without a question.
 */
export function needsConfirm(f) { return !!f.improvement && !f.resource; }

/** The facts `joinable` and `needsConfirm` read, for plot i and a park owned by `owner`. */
export function joinFacts(i, owner, taken) {
  const plot = readPlot(i);
  const strip = plot.items.filter((c) => isRuralImprovement(c.type));
  return { taken: taken.has(i), owner: ownerOf(i), parkOwner: owner, stray: plot.stray > 0, district: districtKind(i),
    built: plot.items.some((c) => !isParkCompatible(c.type) && !strip.includes(c)), improvement: strip.length ? strip[0].type : "",
    resource: resourceAt(i) };
}

/** Whether a plot may join a park owned by `owner` (see joinable). */
export function canJoin(i, owner, taken) {
  return i >= 0 && joinable(joinFacts(i, owner, taken));
}

/** Which selected tiles still connect to the park through each other; the rest are dropped. */
export function connectedSelection(parkTiles, selected, ringFn = ringOf) {
  const kept = new Set();
  const reach = new Set(parkTiles);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of selected) {
      if (kept.has(t)) continue;
      if (ringFn(t).some((n) => reach.has(n))) { kept.add(t); reach.add(t); grew = true; }
    }
  }
  return selected.filter((t) => kept.has(t));
}

/** Plots that may be added to `park` now, in plot order. */
export function eligibleTiles(park) {
  if (!park || isFull(park)) return [];
  const taken = allParkTiles();
  const out = new Set();
  for (const t of park.tiles) for (const n of ringOf(t)) if (canJoin(n, park.owner, taken)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/**
 * Add a tile to a park. An improvement on it is taken off first (the player confirmed that in the picker); the rural
 * district under it stays and carries the marker, and is not the park's to destroy later.
 */
export function addTile(park, i) {
  if (!park || !eligibleTiles(park).includes(i)) return false;
  const strip = strippableAt(i);
  park.tiles.push(i);
  park.pending = isFull(park) ? 0 : Math.max(0, (park.pending || 0) - 1);
  save();
  if (readOnly) return true;
  if (strip.length) log(`park ${park.id}: stripping ${strip.map((c) => c.type).join(", ")} from plot ${i}`);
  inSequence(i, async () => {
    const city = tileCityOf(i);
    if (strip.length && !(await stripImprovements(i, strip, city))) return failed(park, i, "strip");
    if (city && stillParkLand(park, i)) await markTile(park, i, city);
  });
  return true;
}

/** Whether an AI's park takes a tile on its own: never one that would cost it an improvement. */
export function aiTakes(i, owner) { return !needsConfirm(joinFacts(i, owner, new Set())); }

// buying an expansion
//
// A town cannot build or buy Expand National Park: the engine refuses a project in a town by every route (build,
// purchase, town focus), and making the project non-CityOnly refused it in cities too. So a
// settlement with a park, town or city, may buy an expansion from this mod for Gold instead, at the game's usual
// price of 4 Gold per point of production.

/** Gold per point of production when buying, as the game prices its own purchases (Jinja 50 : 200, Grocer 535 :
 *  2140). */
export const GOLD_PER_PRODUCTION = 4;

/** The Gold price of one expansion bought in a settlement. */
export function expansionPrice(cityId, kind = KINDS.park) {
  const cost = safe(() => Cities.get(cityId).Production
    .getProjectProductionCost(GameInfo.Projects.lookup(kind.project).$index), 300);
  return Math.round(GOLD_PER_PRODUCTION * (cost > 0 ? cost : 300));
}

/** How much the AI values protecting a plot: wonders and mountains first, then wild cover and water, then open land. */
export function aiScore(i) {
  if (isWonder(i)) return 5;
  if (isMountain(i)) return 4;
  if (featureOf(i)) return 3;
  if (isLake(i) || isNavRiver(i) || isWater(i)) return 2;
  return 1;
}

// whether an AI buys an expansion
//
// The game gives the AI no weighting for projects, so the mod decides for it, each turn, the way a player would: an
// expansion is worth buying when what it adds pays the price back soon enough, at peace, with Gold coming in. What it
// adds is the yield of the tiles it would take: the park's payout plus the tiles' own yields, which the settlement gets
// with no citizen spent; points of yield are valued at AI_GOLD_PER_POINT Gold a turn. An AI spends its Gold as it comes
// in (five AIs at 130 to 270 Gold a turn held 0 to 1,207 at the start of each turn), so it rarely
// holds the price; a worthwhile expansion is saved for instead, AI_SAVE_SHARE of its income a turn set aside in the
// park's fund, and bought when the fund covers the price. At war the fund goes back to the treasury.

/** Gold a turn one point of any yield is worth when an AI weighs an expansion. */
export const AI_GOLD_PER_POINT = 2;
/** Turns an expansion may take to pay for itself; longer when the AI sits on idle Gold. */
export const AI_PAYBACK_TURNS = 30;
export const AI_PAYBACK_TURNS_RICH = 50;
/** Idle Gold: a treasury and fund of this many times the price. */
export const AI_RICH_MULTIPLE = 3;
/** Share of its Gold income a turn an AI sets aside for a worthwhile expansion. */
export const AI_SAVE_SHARE = 0.25;
/** An AI pays the rest at once from its treasury when that leaves it, with AI_RESERVE_TURNS of income, at least
 *  AI_RESERVE_SHARE of the price. */
export const AI_RESERVE_SHARE = 0.5;
export const AI_RESERVE_TURNS = 3;

/**
 * Whether an expansion is worth it to an AI (pure). Facts: price, gold (treasury), fund (Gold already set aside),
 * goldPerTurn (net income), atWar (with another major civilization), gain (yield points a turn its tiles would add),
 * unhappy (the settlement's Happiness is falling), paysHappiness (the park pays Happiness), happinessGain (the
 * Happiness part of gain). Returns { worth, why, payback }.
 */
export function aiExpansionWorth(f) {
  const why = notWorthWeighing(f);
  if (why) return { worth: false, why };
  const payback = f.price / (weighedGain(f) * AI_GOLD_PER_POINT);
  return payback <= paybackLimit(f) ? { worth: true, why: "pays back", payback } : { worth: false, why: "too slow to pay back", payback };
}

/** Why an expansion isn't worth weighing at all, or "". */
function notWorthWeighing(f) {
  if (!(f.gain > 0)) return "no land worth taking";
  if (f.atWar) return "at war";
  if (!(f.goldPerTurn > 0)) return "Gold income not positive";
  return "";
}

/** The yield points a turn it adds; Happiness counts again when the settlement is unhappy and the park pays it. */
function weighedGain(f) { return f.gain + (f.unhappy && f.paysHappiness ? (f.happinessGain || 0) : 0); }

/** Turns the expansion may take to pay back: longer when the AI sits on idle Gold. */
function paybackLimit(f) {
  return (f.gold || 0) + (f.fund || 0) >= f.price * AI_RICH_MULTIPLE ? AI_PAYBACK_TURNS_RICH : AI_PAYBACK_TURNS;
}

/**
 * One turn of an AI's saving for an expansion (pure): how much Gold to move from the treasury into the park's fund, and
 * whether the fund then buys it. Returns { charge, buy, refund, worth, why, payback }: `refund` is fund Gold to give
 * back (at war), `charge` Gold to take from the treasury now.
 */
export function aiSavingStep(f) {
  const fund = f.fund || 0;
  const w = aiExpansionWorth(f);
  if (!w.worth) return { ...w, charge: 0, buy: false, refund: f.atWar ? fund : 0 };
  const need = Math.max(0, f.price - fund);
  const gold = Math.max(0, f.gold);
  const spare = gold - need + AI_RESERVE_TURNS * f.goldPerTurn >= f.price * AI_RESERVE_SHARE;
  const charge = gold >= need && spare ? need : Math.min(gold, need, Math.round(AI_SAVE_SHARE * f.goldPerTurn));
  return { ...w, charge, buy: fund + charge >= f.price, refund: 0 };
}

/** Yield points a turn a tile would add to a park: the land marker's payout at the park's level once the tile has
 *  joined, and the tile's own yields; `happiness` is the payout's Happiness part. */
export function tileGain(i, park) {
  const kind = kindOf(park), owner = park.owner;
  const { points: payout, happiness } = landPayout(kind.key, milestoneLevel(park.tiles.length + 1));
  const l = locOf(i);
  let own = 0;
  for (const y of ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"]) {
    own += safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes[y], owner), 0) || 0;
  }
  return { points: payout + own, happiness };
}
