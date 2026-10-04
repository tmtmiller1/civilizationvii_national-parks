// np-picker.js - National Parks: choosing the land a park takes.
//
// INTERFACEMODE_NP_ADD_TILES is a ChoosePlotInterfaceMode, the base class behind the game's own tile choosers
// (acquire tile, place building). It shades the park in its kind's colour (green, or ocher for a Wilderness Area),
// lights the land it may take in bright cyan, and fills a selected tile with the kind's colour. A click
// on a lit tile selects it (a second click deselects it), up to the number of tiles the park may take; a selected
// tile counts as park for what may be selected next, so a chain can be drawn outward in one go. Confirm adds the
// selection, and the park's walls and dressing grow onto it. Later, or Escape, closes the picker and keeps every
// unused tile for another turn.
//
// Founding uses the same chooser (Context.FoundingId): a park paid for and not yet placed lights every empty, Charming
// tile its settlement holds, one may be selected, and Confirm founds the park there (np-core.js foundPark).
//
// While a park has tiles waiting and the picker is closed, a small prompt stays at the top of the screen with a
// Choose land button, so the player can always get back in: the game may switch the picker off at the start of a
// turn, and a picker that opened behind something else would otherwise be lost until the next turn.
//
// The mode's database row is in data/national-parks.xml; without it switchTo refuses the mode. Two things every
// mod-made plot mode needs: a reset() method, which transitionFrom calls and the base class does not define, and a
// handleInput that returns the game's InputHandlerState values (see handleInput) and consumes Escape.
"use strict";

import ChoosePlotInterfaceMode from "/base-standard/ui/interface-modes/interface-mode-choose-plot.js";
import { InterfaceMode } from "/core/ui/interface-modes/interface-modes.js";
import { Audio } from "/core/ui/audio-base/audio-support.js";
import { ContextManager } from "/core/ui/context-manager/context-manager.js";
import { InputHandlerState } from "/core/ui/input/input-support.js";
import ViewManager from "/core/ui/views/view-manager.js";
import { safe, log, idx, locOf, ringOf, parks, parkById, eligibleTiles, canJoin, allParkTiles, addTile, displayName,
  connectedSelection, room, limits, save, joinFacts, needsConfirm, settlementOf, kindOf, foundings, foundingById,
  foundingTiles, foundPark, KINDS }
  from "./np-core.js";
import { drawPark } from "./np-draw.js";
import { refreshGeoLabels, hasGeoRename, openRename, generateName } from "./np-names.js";
import { showDecision, decisionFrame, overlayFrame, buttonRow, eyebrowLine } from "./np-dialog.js";
import { quoteFor } from "./np-quotes.js";

export const MODE = "INTERFACEMODE_NP_ADD_TILES";
const BANNER_ID = "np-picker-banner";
const PROMPT_ID = "np-picker-prompt";

// Green is a National Park's colour and ocher a Wilderness Area's (the same as the Parks lens, np-lens.js
// LENS_COLORS). Land already in the park, and land selected to join it, take the colour of the kind being grown;
// land that can still be picked is a bright cyan, which reads as available and matches neither kind nor the game's own
// tile choosers (lime to grow a city, purple for specialists, red for a neighbour's land).
const KIND_RGB = { park: { x: 0.2, y: 0.68, z: 0.3 }, wilderness: { x: 0.9, y: 0.6, z: 0.14 } };
const shade = (c, f, w) => ({ x: c.x * f, y: c.y * f, z: c.z * f, w });
function pickerColors(kindKey) {
  const c = KIND_RGB[kindKey] || KIND_RGB.park;
  return { owned: { ...c, w: 0.22 }, chosen: { ...c, w: 0.7 }, chosenEdge: shade(c, 0.5, 1) };
}
const PICK_FILL = { x: 0.1, y: 0.85, z: 1, w: 0.55 };
const PICK_EDGE = { x: 0, y: 0.3, z: 0.4, w: 1 };
const CURSOR_VFX = "VFX_3dUI_PlotCursor_City_Picker";
function compose(tag, ...a) { return safe(() => Locale.compose(tag, ...a), tag); }
function settlementName(city) { return safe(() => compose(Cities.get(city).name), ""); }
function foundTitleTag(f) { return f && f.kind === "wilderness" ? "LOC_WA_FOUND_PICKER_TITLE" : "LOC_NP_FOUND_PICKER_TITLE"; }
function isLocal(owner) { return owner === safe(() => GameContext.localPlayerID, -99); }

/** Nothing is in the way: no screen is open over the map and a person is playing (not Autoplay). */
function screensClear() {
  return !!safe(() => ContextManager.isEmpty && !ContextManager.noUserInput(), false);
}

/** A native game button (gold frame, hover and press audio), as Geographic Labels builds its own. */
function button(captionTag, tipTag, onPress, small = false) {
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
function hideBannerWhile(box) {
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
function overlayBox(id, top) {
  const box = document.createElement("div");
  box.id = id;
  box.style.cssText = `position:absolute;top:${top};left:0;right:0;display:flex;flex-direction:column;`
    + "align-items:center;pointer-events:none;";
  return box;
}

class NpAddTilesMode extends ChoosePlotInterfaceMode {
  parkId = null;
  foundingId = null;
  selected = [];
  candidates = [];
  overlay = null;

  get park() { return this.foundingId == null ? parkById(this.parkId) : null; }
  get founding() { return this.foundingId == null ? null : foundingById(this.foundingId); }

  /** How many tiles may be selected in all: what the park may take, up to its full size; one for a founding. */
  get allowance() {
    if (this.foundingId != null) return this.founding ? 1 : 0;
    const park = this.park; return park ? Math.min(park.pending, room(park)) : 0;
  }

  /** Tiles that may be selected now: next to the park or to a tile already selected; for a founding, every empty tile
   *  its settlement holds. */
  refreshCandidates() {
    if (this.foundingId != null) {
      // The chosen tile stays clickable through `selected`; the others stay lit so the choice can move.
      const f = this.founding;
      this.candidates = f ? foundingTiles(f.city).filter((t) => !this.selected.includes(t)) : [];
      return;
    }
    const park = this.park;
    if (!park) { this.candidates = []; return; }
    if (this.selected.length >= this.allowance) { this.candidates = []; return; }
    const taken = allParkTiles();
    for (const t of this.selected) taken.add(t);
    const out = new Set(eligibleTiles(park));
    for (const t of this.selected) for (const n of ringOf(t)) if (canJoin(n, park.owner, taken)) out.add(n);
    for (const t of this.selected) out.delete(t);
    this.candidates = [...out];
  }

  initialize() {
    this.parkId = this.Context && this.Context.ParkId;
    this.foundingId = this.Context && this.Context.FoundingId != null ? this.Context.FoundingId : null;
    this.selected = [];
    if (this.foundingId != null) {
      const f = this.founding;
      if (!f) { log("picker: no founding"); return false; }
      this.refreshCandidates();
      if (!this.candidates.length) { log(`picker: founding ${f.id} has no empty tile`); return false; }
      safe(() => Camera.lookAtPlot(Cities.get(f.city).location));
      log(`picker open for founding ${f.id} (${this.candidates.length} empty tiles)`);
      return true;
    }
    const park = this.park;
    if (!park || !(park.pending > 0)) { log("picker: no park or nothing pending"); return false; }
    this.refreshCandidates();
    if (!this.candidates.length) { log(`picker: park ${park.id} has no land it can take`); return false; }
    safe(() => Camera.lookAtPlot(locOf(park.anchor)));
    log(`picker open for park ${park.id} (${park.pending} to add, ${this.candidates.length} eligible)`);
    return true;
  }

  reset() { this.isPlotProposed = false; }

  decorate(overlay, _modelGroup) {
    this.overlay = overlay;
    this.paint();
    this.showBanner();
    hidePrompt();
  }

  undecorate(_overlay, _modelGroup) {
    // Closed with tiles still to take (Later, Escape, or the game switching modes): the prompt is the way back in.
    this.overlay = null;
    this.selected = [];
    this.removeBanner();
  }

  paint() {
    const park = this.park;
    if (!this.overlay || (!park && !this.founding)) return;
    safe(() => this.overlay.clearAll());
    const plots = safe(() => this.overlay.addPlotOverlay(), null);
    if (!plots) return;
    const colors = pickerColors(park ? kindOf(park).key : this.founding.kind);
    if (park) safe(() => plots.addPlots(park.tiles, { fillColor: colors.owned }));
    if (this.candidates.length) safe(() => plots.addPlots(this.candidates, { fillColor: PICK_FILL, edgeColor: PICK_EDGE }));
    if (this.selected.length) safe(() => plots.addPlots(this.selected, { fillColor: colors.chosen, edgeColor: colors.chosenEdge }));
  }

  decorateHover(plotCoord, cursorOverlay, cursorModelGroup) {
    safe(() => cursorOverlay.clearAll());
    safe(() => cursorModelGroup.clear());
    const i = idx(plotCoord);
    if (this.candidates.includes(i) || this.selected.includes(i)) {
      safe(() => cursorModelGroup.addVFXAtPlot(CURSOR_VFX, plotCoord, { x: 0, y: 0, z: 0 }));
    }
  }

  proposePlot(plot, accept, reject) {
    const i = idx(plot);
    if (this.candidates.includes(i) || this.selected.includes(i)) accept();
    else { log(`picker: ${plot.x},${plot.y} is not a candidate`); safe(() => Audio.playSound("data-audio-error-press")); reject(); }
  }

  // Stay in the mode after a click: a click selects or deselects, Confirm commits.
  selectPlot(plot, _previousPlot) {
    log(`picker: click on ${plot && plot.x},${plot && plot.y}`);
    if (this.isPlotProposed) return false;
    this.isPlotProposed = true;
    this.proposePlot(plot,
      () => { try { this.toggle(idx(plot)); } catch (e) { log(`picker: selecting ${plot.x},${plot.y} failed: ${e}`); } this.isPlotProposed = false; },
      () => { this.isPlotProposed = false; });
    return false;
  }

  toggle(i) {
    if (this.foundingId != null) {
      // One tile: a click selects it, a click on another moves the choice, a second click on it clears it.
      this.selected = this.selected.includes(i) ? [] : [i];
      this.refresh();
      return;
    }
    const park = this.park;
    if (!park) return;
    if (this.selected.includes(i)) {
      this.selected = connectedSelection(park.tiles, this.selected.filter((t) => t !== i));
    } else if (this.selected.length < this.allowance) {
      // A tile whose improvement would be removed costs the player something: ask before selecting it.
      const facts = joinFacts(i, park.owner, allParkTiles());
      if (needsConfirm(facts)) {
        confirmCostlyTile(this.park, i, facts, () => { if (this.park && !this.selected.includes(i) && this.selected.length < this.allowance) { this.selected.push(i); this.refresh(); } });
        return;
      }
      this.selected.push(i);
    }
    this.refresh();
  }

  refresh() {
    safe(() => Audio.playSound("data-audio-city-growth-focus", "city-growth"));
    this.refreshCandidates();
    this.paint();
    this.updateBanner();
  }

  confirm() {
    if (this.foundingId != null) {
      const f = this.founding;
      if (!f || !this.selected.length) return false;
      const park = foundPark(f, this.selected[0]);
      this.selected = [];
      if (!park) { log(`founding ${f.id}: the tile is no longer free`); this.refresh(); return false; }
      park.autoName = generateName(park);
      save();
      drawPark(park, [park.anchor]);
      refreshGeoLabels();
      setTimeout(() => InterfaceMode.switchToDefault(), 0);
      return true;
    }
    const park = this.park;
    if (!park || !this.selected.length) return false;
    const added = [];
    for (const t of this.selected) if (addTile(park, t)) added.push(t);
    const l = locOf(park.anchor);
    log(`park ${park.id} took ${added.length} tile(s) near ${l.x},${l.y}; ${park.pending} left`);
    this.selected = [];
    if (added.length) { drawPark(park, added); refreshGeoLabels(); }
    this.refreshCandidates();
    if (park.pending <= 0 || !this.candidates.length) { setTimeout(() => InterfaceMode.switchToDefault(), 0); return true; }
    this.paint();
    this.updateBanner();
    return true;
  }

  /** Done: add what is selected, let the rest of this expansion go, and close. Asks first when tiles would be lost. */
  finish() {
    if (this.foundingId != null) { InterfaceMode.switchToDefault(); return true; }
    const park = this.park;
    if (!park) return false;
    const left = Math.max(0, Math.min(park.pending, room(park)) - this.selected.length);
    const go = () => {
      const p = this.park;
      if (!p) return;
      if (this.selected.length) this.confirm();
      if (p.pending > 0) log(`park ${p.id}: ${p.pending} unused tile(s) let go`);
      p.pending = 0;
      save();
      InterfaceMode.switchToDefault();
    };
    if (!left) { go(); return true; }
    // Later: the tiles selected are added, the rest of the expansion is kept for another turn (as the question says).
    const later = () => { if (this.park && this.selected.length) this.confirm(); InterfaceMode.switchToDefault(); };
    askInPicker({ title: compose("LOC_NP_DONE_TITLE"), ...eyebrowOf(park.kind), body: compose("LOC_NP_DONE_BODY", left),
      quote: quoteFor("DONE", `done|${park.id}|${park.tiles.length}`) }, go, [{ label: "LOC_NP_PICKER_LATER", onPress: later }]);
    return true;
  }

  // The result is an InputHandlerState, not a boolean: Active (0) lets the event on to the map, whose click is what
  // reaches selectPlot; Handled (1) consumes it. Returning true here (1) once swallowed every click on the map.
  handleInput(inputEvent) {
    const d = inputEvent && inputEvent.detail;
    if (!d) return InputHandlerState.Active;
    if (typeof InputActionStatuses !== "undefined" && d.status !== InputActionStatuses.FINISH) return InputHandlerState.Active;
    const cancel = (typeof inputEvent.isCancelInput === "function" && inputEvent.isCancelInput())
      || d.name === "sys-menu" || d.name === "keyboard-escape";
    if (!cancel) return InputHandlerState.Active;
    InterfaceMode.switchToDefault();
    safe(() => { inputEvent.stopPropagation(); inputEvent.preventDefault(); });
    return InputHandlerState.Handled;
  }

  // the banner: which park, what to do, Confirm / Later / Rename

  showBanner() {
    this.removeBanner();
    if (typeof document === "undefined" || !document.body) return;
    // In the form of the game's pop-ups (np-dialog.js): the title, the kind's category line, the hint, the buttons.
    const box = overlayBox(BANNER_ID, "5.5rem");
    const o = overlayFrame("", { compact: true });
    const eyebrow = o.add("eyebrow", "");
    const hint = o.add("text", "");
    const buttons = [];
    this.confirmBtn = button("LOC_NP_PICKER_CONFIRM", "LOC_NP_PICKER_CONFIRM_TIP", () => this.confirm(), true);
    buttons.push(this.confirmBtn);
    const founding = this.foundingId != null;
    if (!founding) buttons.push(button("LOC_NP_PICKER_DONE", "LOC_NP_PICKER_DONE_TIP", () => this.finish(), true));
    buttons.push(button("LOC_NP_PICKER_LATER", founding ? "LOC_NP_FOUND_LATER_TIP" : "LOC_NP_PICKER_LATER_TIP", () => InterfaceMode.switchToDefault(), true));
    // With Geographic Labels' park support, Rename opens its Rename Places; without it, this mod's own box.
    if (!founding) buttons.push(button("LOC_NP_PICKER_RENAME", "LOC_NP_PICKER_RENAME_TIP", () => {
      const park = this.park;
      if (!park) return;
      if (hasGeoRename()) { InterfaceMode.switchToDefault(); setTimeout(() => openRename(park), 50); }
      else openParkRename(park, () => this.updateBanner());
    }, true));
    o.frame.appendChild(buttonRow(buttons));
    box.appendChild(o.frame);
    document.body.appendChild(box);
    this.setTitle = o.setTitle;
    this.eyebrowEl = eyebrow;
    this.hintEl = hint;
    this.updateBanner();
    this.watchScreens();
  }
  updateBanner() {
    if (this.foundingId != null) {
      const f = this.founding;
      if (!f || !this.setTitle) return;
      this.setTitle(compose(foundTitleTag(f), settlementName(f.city)));
      this.eyebrowEl.innerHTML = safe(() => Locale.stylize(kindLine(f.kind)), "");
      this.hintEl.textContent = compose("LOC_NP_FOUND_PICKER_HINT");
      if (this.confirmBtn) {
        if (this.selected.length) this.confirmBtn.removeAttribute("disabled");
        else this.confirmBtn.setAttribute("disabled", "true");
      }
      return;
    }
    const park = this.park;
    if (!park || !this.setTitle) return;
    this.setTitle(compose("LOC_NP_PICKER_TITLE", displayName(park)));
    this.eyebrowEl.innerHTML = safe(() => Locale.stylize(kindLine(park.kind)), "");
    // Once the selection would fill the park, say so: the rest of this expansion then lapses.
    const full = park.tiles.length + this.selected.length >= limits.maxTiles;
    this.hintEl.textContent = full
      ? compose("LOC_NP_PICKER_HINT_FULL", limits.maxTiles, this.selected.length)
      : compose("LOC_NP_PICKER_HINT", Math.min(park.pending, room(park)), this.selected.length);
    if (this.confirmBtn) {
      if (this.selected.length) this.confirmBtn.removeAttribute("disabled");
      else this.confirmBtn.setAttribute("disabled", "true");
    }
  }

  // A screen opened over the map (a popup, the advisor choice) must not have the banner floating over it.
  watchScreens() {
    clearInterval(this.screenWatch);
    this.screenWatch = setInterval(() => {
      const box = safe(() => document.getElementById(BANNER_ID), null);
      if (!box) { clearInterval(this.screenWatch); return; }
      box.style.display = screensClear() ? "flex" : "none";
    }, 400);
  }

  removeBanner() {
    clearInterval(this.screenWatch);
    safe(() => { const ask = document.getElementById(ASK_ID); if (ask) ask.remove(); });
    safe(() => { const el = document.getElementById(BANNER_ID); if (el) el.remove(); });
    this.setTitle = null;
    this.eyebrowEl = null;
    this.hintEl = null;
    this.confirmBtn = null;
  }
}

const handler = new NpAddTilesMode();
safe(() => { InterfaceMode.addHandler(MODE, handler); log("tile picker registered"); });

/** Open the picker for a park when the map is free: its default mode, and no screen open over it. */
export function openPicker(parkId, from = "script") {
  const park = parkById(parkId);
  if (!park || !(park.pending > 0)) return false;
  if (!screensClear() || !safe(() => InterfaceMode.isInDefaultMode(), false)) return false;
  if (!eligibleTiles(park).length) return false;
  log(`picker opened from ${from}`);
  return !!safe(() => { InterfaceMode.switchTo(MODE, { ParkId: parkId }); return true; }, false);
}

/** Open the picker to place a founding when the map is free. */
export function openFoundingPicker(foundingId, from = "script") {
  const f = foundingById(foundingId);
  if (!f || !isLocal(f.owner)) return false;
  if (!screensClear() || !safe(() => InterfaceMode.isInDefaultMode(), false)) return false;
  if (!foundingTiles(f.city).length) return false;
  log(`founding picker opened from ${from}`);
  return !!safe(() => { InterfaceMode.switchTo(MODE, { FoundingId: foundingId }); return true; }, false);
}

/** Select or deselect a tile while the picker is open, as a click on it would (for the bench and probes). */
export function chooseTile(x, y) {
  if (safe(() => InterfaceMode.getCurrent(), null) !== MODE) return false;
  handler.selectPlot({ x, y });
  return true;
}

/** Press Confirm while the picker is open (for the bench and probes). */
export function confirmChoice() {
  if (safe(() => InterfaceMode.getCurrent(), null) !== MODE) return false;
  return handler.confirm();
}

/** Press Done while the picker is open (for the bench and probes). */
export function finishChoice() {
  if (safe(() => InterfaceMode.getCurrent(), null) !== MODE) return false;
  return handler.finish();
}

// dialogs

function typeName(table, type) {
  return safe(() => compose(GameInfo[table].lookup(type).Name), type);
}

const ASK_ID = "np-ask";

/** The category line as display text, for the overlays that set it themselves. */
function kindLine(kindKey) { const e = eyebrowOf(kindKey); return eyebrowLine(e.eyebrow, e.eyebrowIcon); }

/** The category line of a park's pop-ups: its kind, with the yield it pays as the icon. */
function eyebrowOf(kindKey) {
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
function askInPicker(view, yes, extra = []) {
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
function confirmCostlyTile(park, i, facts, yes) {
  const body = facts.improvement ? compose("LOC_NP_CONFIRM_STRIP", typeName("Constructibles", facts.improvement)) : "";
  askInPicker({ title: compose("LOC_NP_CONFIRM_TITLE"), ...eyebrowOf(park && park.kind), body,
    quote: quoteFor("STRIP", `strip|${park ? park.id : 0}|${i}`) }, yes);
}

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

/** A completed expansion (or founding) found no land to take. It is kept until some is free. */
export function noticeNoLand(park, founding = null) {
  if (founding) {
    showDecision({ title: compose(foundTitleTag(founding), settlementName(founding.city)), ...eyebrowOf(founding.kind),
      body: compose("LOC_NP_FOUND_NONE"), quote: quoteFor("NOLAND", `noland|f${founding.id}`) });
    return;
  }
  if (!park) return;
  showDecision({ title: compose("LOC_NP_PICKER_TITLE", displayName(park)), ...eyebrowOf(park.kind),
    body: compose("LOC_NP_PICKER_NONE"), quote: quoteFor("NOLAND", `noland|${park.id}|${park.tiles.length}`) });
}

// renaming without Geographic Labels

const RENAME_ID = "np-rename";

/** A small box to rename a park: its own name, or Restore for the generated one. */
export function openParkRename(park, done = () => {}) {
  safe(() => { const old = document.getElementById(RENAME_ID); if (old) old.remove(); });
  const box = overlayBox(RENAME_ID, "0");
  box.style.bottom = "0";
  box.style.justifyContent = "center";
  hideBannerWhile(box);
  const o = overlayFrame(compose("LOC_NP_RENAME_TITLE"));
  o.add("eyebrow", kindLine(park.kind));
  const field = document.createElement("fxs-textbox");
  field.setAttribute("value", displayName(park));
  field.classList.add("self-center", "my-3");
  field.style.cssText = "width:24rem;pointer-events:auto;";
  o.frame.appendChild(field);
  const worldInput = safe(() => ViewManager.isWorldInputAllowed, true);
  safe(() => { ViewManager.isWorldInputAllowed = false; });  // keep typed letters away from map hotkeys
  const close = () => {
    safe(() => { ViewManager.isWorldInputAllowed = worldInput; });
    box.remove();
    done();
  };
  const setName = (name) => {
    park.customName = name;
    save();
    refreshGeoLabels();
    log(`park ${park.id} ${name ? `renamed "${name}"` : "name restored"}`);
    close();
  };
  const buttons = [button("LOC_NP_RENAME_SAVE", null, () => setName(String(field.getAttribute("value") || "").trim()))];
  if (park.customName) buttons.push(button("LOC_NP_RENAME_RESTORE", null, () => setName("")));
  buttons.push(button("LOC_NP_RENAME_CANCEL", null, close));
  o.frame.appendChild(buttonRow(buttons, true));
  box.appendChild(o.frame);
  document.body.appendChild(box);
  return true;
}

// the Choose land prompt
//
// Shown at the top of the screen while a park of the local player has land waiting or a founding is waiting for its
// tile, nothing else is on screen and the picker is closed; its button opens the picker.

let promptTimer = null;
let promptPark = null;   // the park (or founding) the prompt names, or null when hidden

/** The local player's first park with expansion tiles waiting and land it can take. */
function waitingPark() {
  return parks().find((p) => isLocal(p.owner) && p.pending > 0 && eligibleTiles(p).length) || null;
}
/** The local player's first founding paid for and not yet placed, in a settlement with an empty tile. */
function waitingFounding() {
  return foundings().find((f) => isLocal(f.owner) && foundingTiles(f.city).length) || null;
}

function hidePrompt() {
  safe(() => { const el = document.getElementById(PROMPT_ID); if (el) el.remove(); });
  promptPark = null;
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
  safe(() => box.npSetTitle && box.npSetTitle(park.city ? compose(foundTitleTag(park), settlementName(park.city)) : displayName(park)));
  const kind = box.querySelector("[data-np-kind]");
  if (kind) kind.innerHTML = safe(() => Locale.stylize(kindLine(park.kind)), "");
  const text = box.querySelector("[data-np-text]");
  // The title names the settlement or park, so the line under it does not repeat the name.
  if (text) text.textContent = park.city
    ? compose(park.kind === "wilderness" ? "LOC_WA_FOUND_PROMPT_BODY" : "LOC_NP_FOUND_PROMPT_BODY")
    : compose("LOC_NP_PROMPT_BODY", park.pending);
  promptPark = park.id;
}

function tickPrompt() {
  const inPicker = safe(() => InterfaceMode.getCurrent(), null) === MODE;
  const free = !inPicker && screensClear() && safe(() => InterfaceMode.isInDefaultMode(), false);
  const park = free ? (waitingFounding() || waitingPark()) : null;
  if (park) showPrompt(park);
  else if (promptPark !== null || safe(() => document.getElementById(PROMPT_ID), null)) hidePrompt();
}

// buying an expansion for Gold (the purchase itself is in the production panel's list, np-purchase.js)

let buyHandler = null;

/** np-main.js hands over the purchase itself: (park) => "" on success, or a reason's text tag. */
export function setBuyHandler(fn) { buyHandler = fn; }

/** The local player's parks in the selected settlement: at most one of each kind. */
function selectedParks() {
  const cid = safe(() => UI.Player.getHeadSelectedCity(), null);
  if (!cid || cid.id == null) return [];
  return parks().filter((p) => { const s = settlementOf(p); return !!s && s.id === cid.id && s.owner === cid.owner && isLocal(p.owner); });
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
