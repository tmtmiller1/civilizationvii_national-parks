// np-quotes.js
//
// Quotes by naturalists for the decision pop-ups (np-dialog.js), in pools by moment: founding or growing a National
// Park, a Wilderness Area, no land left, taking worked land back for the park, and ending an expansion early. Each
// quote is one text row, LOC_NP_QUOTE_<POOL>_<n>, holding the whole display line `"text" Who, Source`; the wording
// and where it was verified are in docs/quote-sources.md. A quote is chosen from a seed (the park and the moment), so
// the same moment always shows the same line.
"use strict";

import { safe } from "./np-core.js";

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

/** The text tag of the quote a pool gives for a seed, or "" when the pool is empty. Pure. */
export function quoteTag(pool, seed, pools = QUOTE_POOLS) {
  const n = pools[pool] || 0;
  const i = seedIndex(seed, n);
  return i < 0 ? "" : `LOC_NP_QUOTE_${pool}_${i + 1}`;
}

/** The display line for a pool and seed, or "" (no quote shown) when the pool is empty or the row is missing. */
export function quoteFor(pool, seed) {
  const tag = quoteTag(pool, seed);
  if (!tag) return "";
  const text = safe(() => Locale.compose(tag), tag);
  return text && text !== tag ? text : "";
}
