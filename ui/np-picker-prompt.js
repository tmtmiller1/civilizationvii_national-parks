// np-picker-prompt.js - National Parks: the Choose land prompt at the top of the screen, and buying an expansion for
// the selected settlement.
"use strict";

import { displayName, eligibleTiles, foundingTiles, foundings, kindOf, parks, safe, settlementOf } from "./np-core.js";
import { buttonRow, overlayFrame } from "./np-dialog.js";
import { MODE, PROMPT_ID, button, compose, foundTitleTag, hidePrompt, isLocal, kindLine, overlayBox, promptState,
  screensClear, settlementName } from "./np-picker-kit.js";
import { openFoundingPicker, openPicker } from "./np-picker.js";
import { InterfaceMode } from "/core/ui/interface-modes/interface-modes.js";

let promptTimer = null;

/** The local player's first park with expansion tiles waiting and land it can take. */
function waitingPark() {
  return parks().find((p) => isLocal(p.owner) && p.pending > 0 && eligibleTiles(p).length) || null;
}

/** The local player's first founding paid for and not yet placed, in a settlement with an empty tile. */
function waitingFounding() {
  return foundings().find((f) => isLocal(f.owner) && foundingTiles(f.city).length) || null;
}

function showPrompt(park) {
  let box = safe(() => document.getElementById(PROMPT_ID), null);
  if (!box) {
    // In the form of the game's pop-ups (np-dialog.js), compact: the kind's category line, the line, the button.
    box = overlayBox(PROMPT_ID, "5.5rem");
    const o = overlayFrame("", { compact: true });
    box.npSetTitle = o.setTitle;
    o.add("eyebrow", "").setAttribute("data-np-kind", "1");
    o.add("text", "").setAttribute("data-np-text", "1");
    o.frame.appendChild(buttonRow([button("LOC_NP_PROMPT_BUTTON", "LOC_NP_PROMPT_BUTTON_TIP", () => {
      const f = waitingFounding();
      if (f) { openFoundingPicker(f.id, "the Choose land button"); return; }
      const p = waitingPark();
      if (p) openPicker(p.id, "the Choose land button");
    }, true)]));
    box.appendChild(o.frame);
    document.body.appendChild(box);
  }
  // A founding (no land yet) and an expansion (land already the park's) each get their own words.
  const btn = box.querySelector("fxs-button");
  if (btn) btn.setAttribute("data-tooltip-content", compose(park.city ? "LOC_NP_FOUND_PROMPT_BUTTON_TIP" : "LOC_NP_PROMPT_BUTTON_TIP"));
  safe(() => box.npSetTitle
    && box.npSetTitle(park.city ? compose(foundTitleTag(park), settlementName(park.city)) : displayName(park)));
  const kind = box.querySelector("[data-np-kind]");
  if (kind) kind.innerHTML = safe(() => Locale.stylize(kindLine(park.kind)), "");
  const text = box.querySelector("[data-np-text]");
  // The title names the settlement or park, so the line under it does not repeat the name.
  if (text) text.textContent = park.city
    ? compose(park.kind === "wilderness" ? "LOC_WA_FOUND_PROMPT_BODY" : "LOC_NP_FOUND_PROMPT_BODY")
    : compose("LOC_NP_PROMPT_BODY", park.pending);
  promptState.park = park.id;
}

function tickPrompt() {
  const inPicker = safe(() => InterfaceMode.getCurrent(), null) === MODE;
  const free = !inPicker && screensClear() && safe(() => InterfaceMode.isInDefaultMode(), false);
  const park = free ? (waitingFounding() || waitingPark()) : null;
  if (park) showPrompt(park);
  else if (promptState.park !== null || safe(() => document.getElementById(PROMPT_ID), null)) hidePrompt();
}

let buyHandler = null;

/** np-main.js hands over the purchase itself: (park) => "" on success, or a reason's text tag. */
export function setBuyHandler(fn) { buyHandler = fn; }

function selectedParks() {
  const cid = safe(() => UI.Player.getHeadSelectedCity(), null);
  if (!cid || cid.id == null) return [];
  return parks().filter((p) => {
    const s = settlementOf(p);
    return !!s && s.id === cid.id && s.owner === cid.owner && isLocal(p.owner);
  });
}

/** Buy for the selected settlement's park of a kind ("park" by default), skipping the question (bench and probes). */
export function buySelected(kind = "park") {
  const park = selectedParks().find((p) => kindOf(p).key === kind);
  return park && buyHandler ? buyHandler(park) : "LOC_NP_BUY_NONE";
}

export function startPrompt() {
  clearInterval(promptTimer);
  promptTimer = setInterval(() => safe(tickPrompt), 1000);
}

export function stopPrompt() {
  clearInterval(promptTimer);
  hidePrompt();
}
