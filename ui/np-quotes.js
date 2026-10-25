// np-quotes.js
//
// Quotes by naturalists for the decision pop-ups (np-dialog.js), in pools by moment: founding or growing a National
// Park, a Wilderness Area, no land left, taking worked land back for the park, and ending an expansion early. Each
// quote is one text row, LOC_NP_QUOTE_<POOL>_<n>, holding the whole display line `"text" Who, Source`; the wording
// and where it was verified are in docs/quote-sources.md. The quotes rotate: each time a pool's pop-up shows, it takes
// the next quote in turn, so the same kind of pop-up says something new until the pool comes round again. Where a pool
// starts is set by the first moment that uses it, so games start in different places; how far each pool has got is
// kept in the save's record (`quotes`).
"use strict";

import { load, safe, save } from "./np-core.js";

/** How many quotes each pool holds; text rows LOC_NP_QUOTE_<POOL>_1 .. _n. */
export const QUOTE_POOLS = { PARK: 8, WILD: 10, NOLAND: 5, STRIP: 5, DONE: 5 };

/** FNV-1a hash of the seed, reduced to an index below n. Pure. */
export function seedIndex(seed, n) {
  if (!(n > 0)) return -1;
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}

/**
 * The quote a pool shows next (pure): `seen` is how far the pool has got, { start, shown }, or undefined the first
 * time, when `seed` sets the start. Returns { tag, seen } with the text tag ("" for an empty pool) and the pool's
 * place after this showing.
 */
export function nextQuote(pool, seen, seed, pools = QUOTE_POOLS) {
  const n = pools[pool] || 0;
  if (!(n > 0)) return { tag: "", seen };
  const at = seen && seen.start >= 0 ? seen : { start: seedIndex(seed, n), shown: 0 };
  return { tag: `LOC_NP_QUOTE_${pool}_${((at.start + at.shown) % n) + 1}`, seen: { start: at.start, shown: at.shown + 1 } };
}

/** The display line for the next showing of a pool, or "" (no quote shown) when the pool is empty or the row is
 *  missing. `seed` names the moment; with the turn it sets where a pool starts the first time it's used. */
export function quoteFor(pool, seed) {
  const record = safe(() => load(), null);
  const quotes = record ? (record.quotes = record.quotes || {}) : {};
  const { tag, seen } = nextQuote(pool, quotes[pool], `${seed}|${safe(() => Game.turn, 0)}`);
  if (!tag) return "";
  quotes[pool] = seen;
  safe(() => save());
  const text = safe(() => Locale.compose(tag), tag);
  return text && text !== tag ? text : "";
}
