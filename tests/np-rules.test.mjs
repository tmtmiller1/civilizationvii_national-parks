import test from "node:test";
import assert from "node:assert/strict";

import { joinable, needsConfirm, isFull, room, limits, MAX_PARK_TILES } from "../ui/np-core.js";
import { drawSignature } from "../ui/np-draw.js";
import { orderBases, rankCandidates, chooseName, NAME_RADIUS } from "../ui/np-names.js";

// Facts for an ordinary tile a park owned by player 0 may take; each test changes one.
const free = (over = {}) => ({ taken: false, owner: 0, parkOwner: 0, stray: false, district: "none", built: false,
  improvement: "", resource: "", ...over });

test("joining: open land, water of any kind, a wonder and a rural district may join", () => {
  assert.equal(joinable(free()), true);
  assert.equal(joinable(free({ district: "rural" })), true, "a rural district carries the marker");
});

test("joining: an improvement or a resource does not bar a tile, but the player is asked first", () => {
  assert.equal(joinable(free({ district: "rural", improvement: "IMPROVEMENT_FARM" })), true);
  assert.equal(joinable(free({ resource: "RESOURCE_JADE" })), true);
  assert.equal(needsConfirm(free({ improvement: "IMPROVEMENT_FARM" })), true);
  assert.equal(needsConfirm(free({ resource: "RESOURCE_JADE" })), false);
  assert.equal(needsConfirm(free({ improvement: "IMPROVEMENT_PLANTATION", resource: "RESOURCE_RICE" })), false);
  assert.equal(needsConfirm(free()), false);
});

test("joining: never a building, a non-rural district or an unreadable plot", () => {
  assert.equal(joinable(free({ built: true })), false, "a building or another park's founding tile");
  assert.equal(joinable(free({ district: "other" })), false, "an urban district, city center or wonder");
  assert.equal(joinable(free({ stray: true })), false, "ids resolving elsewhere");
});

test("joining: only the park owner's land, and not land another park holds", () => {
  assert.equal(joinable(free({ owner: 3 })), false);
  assert.equal(joinable(free({ owner: -1 })), false);
  assert.equal(joinable(free({ taken: true })), false);
});

test("full size: a park stops at the cap, and room counts down to it", () => {
  const park = (n) => ({ tiles: Array.from({ length: n }, (_, k) => k) });
  assert.equal(limits.maxTiles, MAX_PARK_TILES);
  assert.equal(isFull(park(MAX_PARK_TILES - 1)), false);
  assert.equal(isFull(park(MAX_PARK_TILES)), true);
  assert.equal(room(park(MAX_PARK_TILES - 2)), 2);
  assert.equal(room(park(MAX_PARK_TILES + 3)), 0);
  assert.equal(isFull(null), false);
  assert.equal(room(null), 0);
});

test("redraw signature: stable for the same park, changed by its tiles, its owner and what is revealed", () => {
  const park = { id: 1, owner: 0, tiles: [10, 11, 12] };
  const all = () => true;
  assert.equal(drawSignature(park, all), drawSignature({ ...park }, all));
  assert.notEqual(drawSignature(park, all), drawSignature({ ...park, tiles: [10, 11, 12, 13] }, all), "a new tile");
  assert.notEqual(drawSignature(park, all), drawSignature({ ...park, owner: 4 }, all), "a new owner");
  assert.notEqual(drawSignature(park, (t) => t !== 12), drawSignature(park, all), "fog lifted over a tile");
  assert.notEqual(drawSignature(park, all, 1), drawSignature(park, all, 0), "a size level crossed");
});

test("names: a wonder beside the park wins even when the labels do not know it and list a nearer range", () => {
  // The case that named a park beside Uluru after the Tatra: the labels had not seen Uluru.
  const near = rankCandidates([
    { type: "mountains", text: "Tatra Mountains", toponym: "Tatra", dist: 3 },
    { type: "lakes", text: "Lake Garda", toponym: "Garda", dist: 1 },
  ]);
  assert.deepEqual(near, ["Garda"], "a place 3 tiles off is too far");
  assert.deepEqual(orderBases(["Uluru"], near, ["Nile", "Heian-Kyo"]), ["Uluru", "Garda", "Nile", "Heian-Kyo"]);
  assert.equal(chooseName(orderBases(["Uluru"], near, []), new Set()), "Uluru National Park");
});

test("names: only places within the radius; a taken wonder name falls to the next place, then an ordinal", () => {
  assert.equal(NAME_RADIUS, 2);
  assert.deepEqual(rankCandidates([{ type: "lakes", text: "Lake Garda", toponym: "Garda", dist: 2 },
    { type: "wonder", text: "Uluru", dist: 3 }]), ["Garda"]);
  assert.equal(chooseName(orderBases(["Uluru"], ["Mitumba"], []), new Set(["Uluru National Park"])), "Mitumba National Park");
  assert.equal(chooseName(orderBases(["Uluru"], [], []), new Set(["Uluru National Park"])), "Uluru National Park II");
  assert.deepEqual(orderBases(["Uluru"], ["Uluru", "Garda"], ["Garda"]), ["Uluru", "Garda"], "each name once");
});

import { KINDS, kindOf, kindByImprovement, kindByProject, PARK_TYPES, MARKER_TYPES, isMarkerType, isRuralImprovement,
  isParkCompatible } from "../ui/np-core.js";

test("kinds: a National Park and a Wilderness Area, each with its own improvement, markers and project", () => {
  assert.equal(kindOf({}).key, "park", "an older record without a kind is a National Park");
  assert.equal(kindOf({ kind: "wilderness" }).key, "wilderness");
  assert.equal(kindByImprovement("IMPROVEMENT_WILDERNESS_AREA").key, "wilderness");
  assert.equal(kindByProject("PROJECT_EXPAND_NATIONAL_PARK").key, "park");
  assert.equal(kindByImprovement("IMPROVEMENT_FARM"), null);
  assert.equal(PARK_TYPES.size, 2);
  assert.equal(MARKER_TYPES.size, 10, "each kind's land marker, its three size levels, and the wild marker older saves carry");
  for (const k of Object.values(KINDS)) {
    assert.ok(isMarkerType(k.land) && isMarkerType(k.wild) && isParkCompatible(k.wild));
    assert.equal(isRuralImprovement(k.improvement), false, "a park's own founding improvement is never stripped");
  }
  assert.equal(KINDS.park.buildings, true);
  assert.equal(KINDS.wilderness.buildings, false, "a Wilderness Area has no houses or shelters");
  assert.equal(isRuralImprovement("IMPROVEMENT_FARM"), true);
  assert.equal(isRuralImprovement("IMPROVEMENT_EXPEDITION_BASE"), false, "an Expedition Base stays");
});

test("AI expansion: worth it only when it pays back soon enough, at peace, with Gold coming in", async () => {
  const { aiExpansionWorth: w, AI_GOLD_PER_POINT, AI_PAYBACK_TURNS } = await import("../ui/np-core.js");
  const base = { price: 1200, gold: 500, fund: 0, goldPerTurn: 200, atWar: false, gain: 21, happinessGain: 3, paysHappiness: true, unhappy: false };
  assert.equal(w(base).worth, true, "3 good tiles worth 21 points pay 1,200 back in under 30 turns");
  assert.equal(w({ ...base, gain: 0 }).why, "no land worth taking");
  assert.equal(w({ ...base, atWar: true }).why, "at war");
  assert.equal(w({ ...base, goldPerTurn: -3 }).why, "Gold income not positive");
  assert.equal(w({ ...base, gain: 6 }).worth, false, "a single Exploration tile rarely pays back");
  const edge = Math.ceil(base.price / (AI_GOLD_PER_POINT * AI_PAYBACK_TURNS));
  assert.equal(w({ ...base, gain: edge }).worth, true);
  assert.equal(w({ ...base, gain: edge - 1 }).worth, false);
  assert.equal(w({ ...base, gain: 14 }).worth, false);
  assert.equal(w({ ...base, gain: 14, gold: 3600 }).worth, true, "idle Gold waits longer for its return");
  assert.equal(w({ ...base, gain: 17, unhappy: true }).worth, true, "an unhappy settlement values a park's Happiness twice");
  assert.equal(w({ ...base, gain: 17, unhappy: true, paysHappiness: false }).worth, false);
});

test("AI expansion: saved for a share of income at a time, bought when the fund covers the price", async () => {
  const { aiSavingStep: step, AI_SAVE_SHARE } = await import("../ui/np-core.js");
  const base = { price: 1200, gold: 500, fund: 0, goldPerTurn: 200, atWar: false, gain: 21, happinessGain: 3, paysHappiness: true, unhappy: false };
  const s1 = step(base);
  assert.equal(s1.charge, AI_SAVE_SHARE * 200, "a quarter of the income is set aside");
  assert.equal(s1.buy, false);
  const s2 = step({ ...base, fund: 1150 });
  assert.equal(s2.charge, 50, "the last of the price is paid from the treasury when it can be spared");
  assert.equal(s2.buy, true);
  assert.equal(step({ ...base, gold: 1300, fund: 0, goldPerTurn: 273 }).buy, true, "a rich treasury pays at once");
  assert.equal(step({ ...base, gold: 1250, goldPerTurn: 100 }).buy, false, "not when it would leave too little");
  assert.equal(step({ ...base, gold: 10 }).charge, 10, "never more than the treasury holds");
  const war = step({ ...base, atWar: true, fund: 600 });
  assert.equal(war.refund, 600, "at war the fund goes back");
  assert.equal(war.charge, 0);
  assert.equal(step({ ...base, gain: 6, fund: 300 }).refund, 0, "not worth it: the fund waits, nothing more is set aside");
});
