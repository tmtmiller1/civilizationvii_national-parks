// np-picker-notices.js - National Parks: the pop-ups a founding or a refund raises: Choose land or Later, no land
// to stand on, and Gold given back.
"use strict";

import { displayName, log, safe } from "./np-core.js";
import { showDecision } from "./np-dialog.js";
import { compose, eyebrowOf, foundTitleTag, screensClear, settlementName } from "./np-picker-kit.js";
import { openFoundingPicker } from "./np-picker.js";
import { quoteFor } from "./np-quotes.js";
import { InterfaceMode } from "/core/ui/interface-modes/interface-modes.js";

/**
 * A founding is paid for: the full pop-up with its quote, Choose land opening the picker; Later leaves the founding
 * waiting under the Choose land prompt. Returns false while a screen is open (the caller retries).
 */
export function offerFoundingDialog(f) {
  if (!f || !screensClear() || !safe(() => InterfaceMode.isInDefaultMode(), false)) return false;
  const wild = f.kind === "wilderness";
  log(`founding ${f.id}: offered`);
  showDecision({ title: compose(foundTitleTag(f), settlementName(f.city)), ...eyebrowOf(f.kind),
    body: compose(wild ? "LOC_WA_FOUND_OFFER_BODY" : "LOC_NP_FOUND_OFFER_BODY"),
    quote: quoteFor(wild ? "WILD" : "PARK", `found|${f.id}`),
    choices: [{ id: "choose", label: compose("LOC_NP_PROMPT_BUTTON") }, { id: "later", label: compose("LOC_NP_PICKER_LATER") }],
    dismissId: "later" },
  (id) => { if (id === "choose") setTimeout(() => openFoundingPicker(f.id, "the founding pop-up"), 300); });
  return true;
}

/**
 * A completed expansion (or founding) found no land to take. It is kept until some is free. A founding may instead be
 * given up for what it cost: `cancel` { gold, run } adds that choice (np-main.js cancelFounding); OK, Escape and the
 * close button keep it waiting.
 */
export function noticeNoLand(park, founding = null, cancel = null) {
  if (founding) {
    const view = { title: compose(foundTitleTag(founding), settlementName(founding.city)), ...eyebrowOf(founding.kind),
      body: compose("LOC_NP_FOUND_NONE"), quote: quoteFor("NOLAND", `noland|f${founding.id}`) };
    if (cancel && cancel.gold > 0) {
      view.choices = [{ id: "ok", label: compose("LOC_GENERIC_OK") }, { id: "cancel", label: compose("LOC_NP_FOUND_CANCEL", cancel.gold) }];
      view.dismissId = "ok";
    }
    showDecision(view, (id) => { if (id === "cancel" && cancel) cancel.run(); });
    return;
  }
  if (!park) return;
  showDecision({ title: compose("LOC_NP_PICKER_TITLE", displayName(park)), ...eyebrowOf(park.kind),
    body: compose("LOC_NP_PICKER_NONE"), quote: quoteFor("NOLAND", `noland|${park.id}|${park.tiles.length}`) });
}

/** The text of a refund notice, by why the Gold came back (np-core.js completionOutcome and foundingFate). */
const REFUND_BODY = { duplicate: "LOC_NP_REFUND_DUPLICATE", settlement: "LOC_NP_REFUND_SETTLEMENT",
  full: "LOC_NP_REFUND_FULL", "no-park": "LOC_NP_REFUND_NO_PARK", "not-landed": "LOC_NP_FOUND_NOT_LANDED" };

/**
 * Tell the player that Gold came back and why: a notice record (np-core.js notices) shown in the form of the other
 * pop-ups, with OK. The title names the park or the settlement when the record holds its name. Returns false while a
 * screen is open or the map is in another mode (the caller retries). A record whose reason has no text is logged and
 * counts as shown.
 */
export function noticeRefund(n) {
  const body = n && REFUND_BODY[n.why];
  if (!body) { log(`notice ${n && n.id}: no text for "${n && n.why}"`); return true; }
  if (!screensClear() || !safe(() => InterfaceMode.isInDefaultMode(), false)) return false;
  const title = refundTitle(n);
  log(n.gold > 0 ? `notice ${n.id}: ${n.gold} Gold returned (${n.why})` : `notice ${n.id}: shown (${n.why})`);
  showDecision({ title: title || compose("LOC_NP_REFUND_TITLE"), ...eyebrowOf(n.kind), body: compose(body, n.gold),
    quote: quoteFor("NOLAND", `refund|${n.id}`) });
  return true;
}

/** An expansion's refund is titled with its park; a founding's with the settlement, as its picker is; else "". */
function refundTitle(n) {
  const place = n.name ? compose(n.name) : "";
  const expansion = n.why === "full" || n.why === "no-park";
  return expansion ? (n.park || place) : place ? compose(foundTitleTag(n), place) : "";
}
