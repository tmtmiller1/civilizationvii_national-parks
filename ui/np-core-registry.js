// np-core-registry.js - National Parks: the park registry kept in the save, with the foundings waiting for land and
// the notices waiting for their owner.
"use strict";

import { KINDS, kindOf, landMarker, milestoneLevel, readOnly, safe } from "./np-core-base.js";
import { cityIdOf, sameCity } from "./np-core-map.js";

const STORE_KEY = "NationalPark_Parks_v1";

// registry

let cache = null;

export function load() {
  if (cache) return cache;
  const raw = safe(() => Configuration.getGame().getValue(STORE_KEY), null);
  const parsed = safe(() => (raw ? JSON.parse(String(raw)) : null), null);
  cache = parsed && Array.isArray(parsed.parks) ? parsed : { nextId: 1, parks: [] };
  cache.parks = cache.parks.filter((p) => p && Array.isArray(p.tiles) && p.tiles.length);
  return cache;
}

export function save() {
  if (!cache) return false;
  if (readOnly) return true;   // a network game: the record lives in memory only (see setReadOnly)
  return safe(() => { Configuration.editGame().setValue(STORE_KEY, JSON.stringify(cache)); return true; }, false);
}

/** Forget the in-memory copy (after a reload the script re-reads the save). */
export function resetCache() { cache = null; }

export function parks() { return load().parks; }
export function parkById(id) { return parks().find((p) => p.id === id) || null; }
export function parkAtAnchor(i) { return parks().find((p) => p.anchor === i) || null; }
export function parkOfTile(i) { return parks().find((p) => p.tiles.includes(i)) || null; }
export function displayName(p) { return (p && (p.customName || p.autoName)) || ""; }

/** Every plot that belongs to some park. */
export function allParkTiles() {
  const s = new Set();
  for (const p of parks()) for (const t of p.tiles) s.add(t);
  return s;
}

export function createPark(anchor, owner, kind = "park") {
  const state = load();
  const park = { id: state.nextId++, kind, owner, anchor, tiles: [anchor], pending: 0, autoName: "", customName: "",
    founded: safe(() => Game.turn, 0) };
  state.parks.push(park);
  save();
  return park;
}
function parksOf(owner, kindKey) { return parks().filter((p) => p.owner === owner && (p.kind || "park") === kindKey); }
/** A player's park tiles of a kind, all parks together (probes and the lens; levels are per park). */
export function playerParkTiles(owner, kindKey) {
  return parksOf(owner, kindKey).reduce((n, p) => n + p.tiles.length, 0);
}
/** A park's size level, from its own tiles. */
export function parkLevel(park) { return park ? milestoneLevel(park.tiles.length) : 0; }
/** The land marker every tile of a park should carry now, for the park's own size level. */
export function markerFor(park) { return landMarker(kindOf(park), parkLevel(park)); }

// foundings: a park paid for, waiting for the tile it will stand on
//
// Found National Park (a city's project, or a purchase in a city or town) does not place anything itself: the engine
// places an improvement only on a tile that already carries a rural district, and never on a bare one, so a park
// could only replace a farm. A completed or bought founding is recorded here and the park is
// placed by script on the empty tile its owner chooses (np-picker.js), or an AI's best one.
// Record: { id, kind, owner, city: ComponentID, made, paid, by, name, asked }
//   paid   the Gold the founding cost its owner: the price of a purchase, or a completed project's production at the
//          purchase rate. What goes back if the founding ends without a park. Absent in older saves (foundingRefund).
//   by     "gold" or "project"
//   name   the settlement's name as the game holds it, for a notice once the settlement is gone
//   asked  the turn its owner was last told it has no land (foundingFate); absent until then

export function foundings() { const s = load(); if (!Array.isArray(s.foundings)) s.foundings = []; return s.foundings; }
export function foundingById(id) { return foundings().find((f) => f.id === id) || null; }
export function addFounding(kind, owner, city, cost = {}) {
  const s = load();
  const f = { id: s.nextId++, kind, owner, city: { owner: city.owner, id: city.id, type: city.type },
    made: safe(() => Game.turn, 0) };
  if (cost.paid > 0) { f.paid = Math.round(cost.paid); f.by = cost.by || "gold"; }
  if (cost.name) f.name = String(cost.name);
  foundings().push(f);
  save();
  return f;
}
export function dropFounding(id) { const s = load(); s.foundings = foundings().filter((f) => f.id !== id); save(); }

/** Pure: the Gold a founding gives back, what its record says was paid, or `price` (the price now) for an older
 *  save's record, which holds no figure. */
export function foundingRefund(f, price = 0) {
  const paid = Number(f && f.paid);
  return Math.max(0, Math.round(paid > 0 ? paid : Number(price) || 0));
}

/** Turns between reminders that a founding still has no land to stand on. */
export const FOUNDING_ASK_TURNS = 10;

/**
 * What becomes of a founding still waiting for its tile (pure). Facts: settlement (it stands and is still its owner's),
 * ownerAlive, human, tiles (how many tiles it could be founded on now), turn, asked (the turn its owner was last told
 * it has no land; null when never), paid, price (see foundingRefund), readOnly (a network game).
 * Returns { act, why, gold }:
 *   "keep"    it waits (an AI's with land is placed by the sweep)
 *   "refund"  it ends and `gold` goes back to its owner: the settlement is gone or changed hands ("settlement"), or
 *             an AI's has no land left ("no-land"; a human decides that for themselves, see "ask")
 *   "ask"     a human's has no land and its owner was never told, or not for FOUNDING_ASK_TURNS: they are told, and
 *             may give it up for the Gold
 *   "drop"    it ends with nothing to give back: its owner is out of the game, or the game is a network game, where
 *             nothing is written
 */
export function foundingFate(f) {
  const gold = foundingRefund(f, f.price);
  if (!f.settlement) return settlementGone(f, gold);
  if (f.readOnly || f.tiles > 0) return { act: "keep", why: "", gold: 0 };
  if (!f.human) return gold > 0 ? { act: "refund", why: "no-land", gold } : { act: "drop", why: "no-land", gold: 0 };
  return { act: reminderDue(f) ? "ask" : "keep", why: "no-land", gold };
}

/** A founding whose settlement is gone or changed hands: its Gold goes back, unless its owner is out of the game or
 *  the game is a network game. */
function settlementGone(f, gold) {
  if (f.readOnly) return { act: "drop", why: "settlement", gold: 0 };
  if (!f.ownerAlive) return { act: "drop", why: "owner", gold: 0 };
  return gold > 0 ? { act: "refund", why: "settlement", gold } : { act: "drop", why: "settlement", gold: 0 };
}

/** Never told yet, or not for FOUNDING_ASK_TURNS, or a turn counter below the one recorded (a new age's): the
 *  reminder is due. */
function reminderDue(f) { return f.asked == null || f.turn - f.asked >= FOUNDING_ASK_TURNS || f.turn < f.asked; }

/**
 * What a completed Found or Expand project does (pure). Facts: project ("found" or "expand"), settlement (the
 * completion names one, so there is someone to pay), hasKind (found: the settlement already holds that kind of park,
 * or one waiting for its tile), park and full (expand: its park was found, and is at its full size), price (the
 * project's cost at the purchase rate, what the same thing costs in Gold).
 * Returns { act, why, gold }: "found" or "expand" when it does what it was built for (`gold` is then what a founding
 * records as paid); "refund" when it can do nothing and its cost goes back as `gold` ("duplicate", "full", "no-park");
 * "drop" only when no settlement is named and so no one can be paid.
 */
export function completionOutcome(f) {
  const gold = Math.max(0, Math.round(Number(f.price) || 0));
  const back = (why) => (f.settlement && gold > 0 ? { act: "refund", why, gold } : { act: "drop", why, gold: 0 });
  if (f.project === "found") {
    if (!f.settlement) return { act: "drop", why: "no-settlement", gold: 0 };
    return f.hasKind ? back("duplicate") : { act: "found", why: "", gold };
  }
  if (!f.park) return back("no-park");
  if (f.full) return back("full");
  return { act: "expand", why: "", gold: 0 };
}

/**
 * Which entries of a settlement's build queue can no longer do anything (pure): a Found project where the settlement
 * has that kind of park or one waiting for its tile, any second copy of a Found project, and an Expand project for a
 * park at its full size. `queue` lists each entry's project type in queue order (null for anything else); `has(key)`
 * and `full(key)` answer for a kind's key. Returns the entries' positions, last first, so that taking one out leaves
 * the positions before it naming the same entries.
 */
export function staleQueueEntries(queue, has, full) {
  const out = [];
  for (const k of Object.values(KINDS)) {
    let one = !!has(k.key);
    const done = !!full(k.key);
    queue.forEach((type, i) => {
      if (type === k.found) { if (one) out.push(i); one = true; }
      else if (type === k.project && done) out.push(i);
    });
  }
  return out.sort((a, b) => b - a);
}

// notices: Gold given back, waiting to be told
//
// A refund can land while its owner is not the player at the screen (a hotseat seat's settlement falls on another
// seat's turn), and a pop-up raised then would be read by the wrong player. So each is recorded in the save's record
// and shown to its owner on their own turn (np-main.js deliverNotices), across a save and reload too.
// Record: { id, owner, why, gold, kind, name, park }: `why` as completionOutcome and foundingFate give it, `name` the
// settlement's name, `park` the park's.

export function notices() { const s = load(); if (!Array.isArray(s.notices)) s.notices = []; return s.notices; }
export function noticesFor(owner) { return notices().filter((n) => n.owner === owner); }
export function addNotice(n) {
  const s = load();
  const row = { ...n, id: s.nextId++ };
  notices().push(row);
  save();
  return row;
}
export function dropNotice(id) { const s = load(); s.notices = notices().filter((n) => n.id !== id); save(); }
/** Whether a settlement holds a park of `kind`, or has one paid for and waiting for its tile. */
export function settlementHasKind(city, kind) {
  if (!city) return false;
  if (parks().some((p) => (p.kind || "park") === kind && sameCity(cityIdOf(p), city))) return true;
  return foundings().some((f) => f.kind === kind && sameCity(f.city, city));
}
