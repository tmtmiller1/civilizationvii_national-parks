// np-names.js - National Park: park names, and the pairing with Geographic Labels.
//
// A park is named once, when it is founded, after the natural wonder it stands beside, read from the map. Failing
// that, after the most prominent named place within NAME_RADIUS of its founding tile: a mountain range, lake, river,
// desert or forest region. With Geographic Labels installed those names come from its map labels
// (window.__geoLabels.namesNear), including any the player has renamed there; without it, from a river or the city.
// The name then stays put as the park grows. (The map comes first because the labels can miss a wonder: a park
// beside Uluru was once named after the Tatra range, three tiles off, because the labels had not seen Uluru.)
//
// The other direction: parks are offered to Geographic Labels as a label provider
// (window.__geoLabelsProviders), so it draws each park's name on the map and lists parks in Rename Places,
// where a rename comes back here as the park's own name. Either mod works without the other.
"use strict";

import { safe, log, locOf, ringOf, featureOf, isWonder, parks, displayName, save, kindOf } from "./np-core.js";

const PROVIDER_ID = "tower-national-park";
/** How far from the founding tile a place other than an adjacent wonder may lend its name. */
export const NAME_RADIUS = 2;

/** Lower is better. Types are Geographic Labels' key prefixes; parks never name parks. */
const TYPE_RANK = {
  wonder: 1, mountains: 2, lakes: 3, rivernav: 4, riverminor: 5, jungle: 6, taiga: 6, deserts: 6,
  isle: 7, archipelagos: 7, keys: 7, bays: 8, gulfs: 8, sounds: 8, inlets: 8, fjords: 8, estuaries: 8,
  reefs: 9, atolls: 9, seas: 10, cont: 11,
};
const ORDINALS = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function geo() { return safe(() => (typeof window !== "undefined" && window.__geoLabels) || null, null); }
function compose(tag, ...args) { return safe(() => Locale.compose(tag, ...args), null); }

/** The place name a label contributes: a wonder or a player's own name whole, otherwise its core toponym. */
export function baseNameOf(c) {
  if (!c || !c.text) return "";
  if (c.type === "wonder" || c.cust) return String(c.text);
  return String(c.toponym || c.text);
}

/** Order Geographic Labels' nearby names: most prominent kind first, then nearest; none beyond `maxDist`. Pure. */
export function rankCandidates(near, maxDist = NAME_RADIUS) {
  return (near || [])
    .filter((c) => c && c.text && TYPE_RANK[c.type] != null && (c.dist || 0) <= maxDist)
    .map((c) => ({ c, score: TYPE_RANK[c.type] * 10 + (c.dist || 0) }))
    .sort((a, b) => a.score - b.score)
    .map((r) => baseNameOf(r.c))
    .filter((n, k, all) => n && all.indexOf(n) === k);
}

/** First candidate whose full park name is free; else the first with an ordinal. Pure given `format`. */
export function chooseName(bases, taken, format = (b) => b + " National Park", ordinal = (n, o) => n + " " + o) {
  const full = bases.map(format).filter(Boolean);
  for (const n of full) if (!taken.has(n)) return n;
  const head = full[0];
  if (!head) return "";
  for (const o of ORDINALS) { const n = ordinal(head, o); if (!taken.has(n)) return n; }
  return head;
}

/** The names in the order they are tried: wonders beside the founding tile, then nearby places, then the map's
 *  own fallbacks, each once. Pure. */
export function orderBases(adjacentWonders, near, fallback) {
  const out = [];
  for (const n of [...(adjacentWonders || []), ...(near || []), ...(fallback || [])]) if (n && !out.includes(n)) out.push(n);
  return out;
}

/** Natural wonders beside the founding tile, from the map. */
function adjacentWonderNames(park) {
  const out = [];
  for (const t of [park.anchor, ...ringOf(park.anchor)]) {
    if (t < 0 || !isWonder(t)) continue;
    const name = safe(() => compose(GameInfo.Features.lookup(featureOf(t)).Name), null);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Names from the map alone, after the wonders: a river at or beside the founding tile, then the city. */
function fallbackBases(park) {
  const out = [];
  const a = locOf(park.anchor);
  for (const t of [park.anchor, ...ringOf(park.anchor)]) {
    if (t < 0) continue;
    const l = locOf(t);
    const raw = safe(() => GameplayMap.getRiverName(l.x, l.y), null);
    const river = raw ? compose(raw) : null;
    if (river && !out.includes(river)) out.push(river);
  }
  const cityName = safe(() => {
    const cid = GameplayMap.getOwningCityFromXY(a.x, a.y);
    const city = cid ? Cities.get(cid) : null;
    return city ? compose(city.name) : null;
  }, null);
  if (cityName) out.push(cityName);
  return out;
}

export function generateName(park) {
  const taken = new Set(parks().filter((p) => p.id !== park.id).map(displayName).filter(Boolean));
  const g = geo();
  let near = [];
  if (g && typeof g.namesNear === "function") {
    near = rankCandidates(safe(() => g.namesNear([locOf(park.anchor)], NAME_RADIUS), []), NAME_RADIUS);
  }
  const bases = orderBases(adjacentWonderNames(park), near, fallbackBases(park));
  const wild = kindOf(park).key === "wilderness";
  const name = chooseName(bases, taken,
    (b) => (wild ? compose("LOC_WA_NAME_FORMAT", b) || b + " Wilderness Area" : compose("LOC_NP_PARK_NAME_FORMAT", b) || b + " National Park"),
    (n, o) => compose("LOC_NP_PARK_NAME_ORDINAL", n, o) || n + " " + o);
  log(`named park ${park.id}: "${name}" (${g && g.namesNear ? "Geographic Labels" : "map only"}, ${bases.length} candidates)`);
  return name;
}

// --- Geographic Labels provider ----------------------------------------------------------------------
//
// One provider of Geographic Labels' "park" type lists both kinds, National Parks and Wilderness Areas (their names
// say which): the category's look, priority and Options toggle are built into Geographic Labels.

function keyOf(p) { return "park:" + p.id; }

const provider = {
  id: PROVIDER_ID,
  type: "park",
  get typeLabel() { return compose("LOC_NP_GEO_TYPE") || "National park"; },
  list() {
    return parks().filter((p) => displayName(p)).map((p) => ({
      key: keyOf(p), text: displayName(p), plots: p.tiles.map(locOf), cust: !!p.customName,
    }));
  },
  /** A rename from Rename Places. Blank restores the generated name. */
  rename(key, name) {
    const p = parks().find((x) => keyOf(x) === key);
    if (!p) return false;
    p.customName = String(name == null ? "" : name).trim();
    const ok = save();
    log(`park ${p.id} ${p.customName ? `renamed "${p.customName}"` : "name restored"}`);
    return ok;
  },
};

export function registerWithGeoLabels() {
  const w = safe(() => window, null);
  if (!w) return false;
  const list = w.__geoLabelsProviders = w.__geoLabelsProviders || [];
  const at = list.findIndex((p) => p && p.id === PROVIDER_ID);
  if (at >= 0) list[at] = provider; else list.push(provider);
  refreshGeoLabels();
  return true;
}

export function unregisterFromGeoLabels() {
  const list = safe(() => window.__geoLabelsProviders, null);
  if (!Array.isArray(list)) return;
  const at = list.findIndex((p) => p && p.id === PROVIDER_ID);
  if (at >= 0) list.splice(at, 1);
  refreshGeoLabels();
}

/** Ask Geographic Labels to redraw after a park changes (no-op without it). */
export function refreshGeoLabels() { const g = geo(); if (g && g.recompute) safe(() => g.recompute()); }

export function hasGeoRename() {
  const g = geo();
  return !!(g && typeof g.namesNear === "function" && safe(() => window.__geoLabelsRename && window.__geoLabelsRename.open, null));
}

/** Open Rename Places filtered to this park. */
export function openRename(park) {
  return !!safe(() => { window.__geoLabelsRename.open({ search: displayName(park) }); return true; }, false);
}
