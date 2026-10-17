// np-picker-kit.js - National Parks: what the picker and its pop-ups share: their text, buttons and boxes, the
// questions asked inside the picker, and the Choose land prompt's state.
"use strict";

import { safe } from "./np-core.js";
import { decisionFrame, eyebrowLine } from "./np-dialog.js";
import { quoteFor } from "./np-quotes.js";
import { ContextManager } from "/core/ui/context-manager/context-manager.js";

export const MODE = "INTERFACEMODE_NP_ADD_TILES";

export const BANNER_ID = "np-picker-banner";

export const PROMPT_ID = "np-picker-prompt";

export function compose(tag, ...a) { return safe(() => Locale.compose(tag, ...a), tag); }

export function settlementName(city) { return safe(() => compose(Cities.get(city).name), ""); }

export function foundTitleTag(f) { return f && f.kind === "wilderness" ? "LOC_WA_FOUND_PICKER_TITLE" : "LOC_NP_FOUND_PICKER_TITLE"; }

export function isLocal(owner) { return owner === safe(() => GameContext.localPlayerID, -99); }

/** Nothing is in the way: no screen is open over the map and a person is playing (not Autoplay). */
export function screensClear() {
  return !!safe(() => ContextManager.isEmpty && !ContextManager.noUserInput(), false);
}

/** A native game button (gold frame, hover and press audio), as Geographic Labels builds its own. */
export function button(captionTag, tipTag, onPress, small = false) {
  const btn = document.createElement("fxs-button");
  btn.setAttribute("caption", captionTag);
  if (tipTag) btn.setAttribute("data-tooltip-content", compose(tipTag));
  btn.classList.add("mx-1", "my-1");
  if (small) btn.classList.add("fxs-button-small");
  btn.style.pointerEvents = "auto";
  // A mouse press arrives as both "click" and "action-activate" (Confirm ran twice); act on the first.
  let last = 0;
  const run = () => {
    const now = Date.now();
    if (now - last < 400 || btn.getAttribute("disabled") === "true") return;
    last = now;
    onPress();
  };
  btn.addEventListener("action-activate", run);
  btn.addEventListener("click", run);
  return btn;
}

/** Hide the picker's banner while a question or the rename box is up, so they never overlap; back when it closes. */
export function hideBannerWhile(box) {
  const banner = safe(() => document.getElementById(BANNER_ID), null);
  if (!banner) return;
  banner.style.visibility = "hidden";
  const watch = setInterval(() => {
    if (box.isConnected) return;
    clearInterval(watch);
    safe(() => { banner.style.visibility = "visible"; });
  }, 250);
}

/** A full-width, click-through strip at `top` that centres an overlay frame (np-dialog.js overlayFrame). */
export function overlayBox(id, top) {
  const box = document.createElement("div");
  box.id = id;
  box.style.cssText = `position:absolute;top:${top};left:0;right:0;display:flex;flex-direction:column;`
    + "align-items:center;pointer-events:none;";
  return box;
}

function typeName(table, type) {
  return safe(() => compose(GameInfo[table].lookup(type).Name), type);
}

export const ASK_ID = "np-ask";

/** The category line as display text, for the overlays that set it themselves. */
export function kindLine(kindKey) { const e = eyebrowOf(kindKey); return eyebrowLine(e.eyebrow, e.eyebrowIcon); }

/** The category line of a park's pop-ups: its kind, with the yield it pays as the icon. */
export function eyebrowOf(kindKey) {
  return kindKey === "wilderness"
    ? { eyebrow: compose("LOC_WILDERNESS_AREA_NAME"), eyebrowIcon: "YIELD_DIPLOMACY" }
    : { eyebrow: compose("LOC_BUILDING_NATIONAL_PARK_NAME"), eyebrowIcon: "YIELD_HAPPINESS" };
}

/**
 * A question over the picker, answered OK or Cancel (or one of `extra`, shown between them), in the same form as the
 * game's decision pop-ups (np-dialog.js).
 * The game's own dialog box is not used here: opening it switches the map out of the picker's interface mode and the
 * selection is lost. `view`: { title, eyebrow, eyebrowIcon, body, quote }.
 */
export function askInPicker(view, yes, extra = []) {
  safe(() => { const old = document.getElementById(ASK_ID); if (old) old.remove(); });
  const box = document.createElement("div");
  box.id = ASK_ID;
  box.style.cssText = "position:absolute;top:0;bottom:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;";
  hideBannerWhile(box);
  const frame = decisionFrame(view, [
    { label: "LOC_GENERIC_OK", onPress: () => { box.remove(); yes(); } },
    ...extra.map((c) => ({ label: c.label, onPress: () => { box.remove(); c.onPress(); } })),
    { label: "LOC_GENERIC_CANCEL", onPress: () => box.remove() },
  ]);
  frame.style.maxWidth = "44rem";
  box.appendChild(frame);
  document.body.appendChild(box);
}

/** Ask before a tile whose improvement would be removed is selected; `yes` runs on OK. */
export function confirmCostlyTile(park, i, facts, yes) {
  const body = facts.improvement ? compose("LOC_NP_CONFIRM_STRIP", typeName("Constructibles", facts.improvement)) : "";
  askInPicker({ title: compose("LOC_NP_CONFIRM_TITLE"), ...eyebrowOf(park && park.kind), body,
    quote: quoteFor("STRIP", `strip|${park ? park.id : 0}|${i}`) }, yes);
}

export const promptState = { park: null };   // the park (or founding) the prompt names, or null when hidden

export function hidePrompt() {
  safe(() => { const el = document.getElementById(PROMPT_ID); if (el) el.remove(); });
  promptState.park = null;
}
