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
import { addTile, allParkTiles, canJoin, connectedSelection, displayName, eligibleTiles, foundPark, foundingById,
  foundingTiles, idx, joinFacts, kindOf, limits, locOf, log, needsConfirm, parkById, reachFrom, ringOf, room, safe,
  save } from "./np-core.js";
import { buttonRow, overlayFrame } from "./np-dialog.js";
import { drawPark } from "./np-draw.js";
import { generateName, hasGeoRename, openRename, refreshGeoLabels } from "./np-names.js";
import { ASK_ID, BANNER_ID, MODE, askInPicker, button, compose, confirmCostlyTile, eyebrowOf, foundTitleTag, hidePrompt,
  isLocal, kindLine, overlayBox, screensClear, settlementName } from "./np-picker-kit.js";
import { openParkRename } from "./np-picker-rename.js";
import { quoteFor } from "./np-quotes.js";
import { Audio } from "/core/ui/audio-base/audio-support.js";
import { InputHandlerState } from "/core/ui/input/input-support.js";
import { InterfaceMode } from "/core/ui/interface-modes/interface-modes.js";

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
    const taken = allParkTiles(), from = reachFrom(park);
    for (const t of this.selected) taken.add(t);
    const out = new Set(eligibleTiles(park));
    for (const t of this.selected) for (const n of ringOf(t)) if (canJoin(n, park.owner, taken, from)) out.add(n);
    for (const t of this.selected) out.delete(t);
    this.candidates = [...out];
  }

  initialize() {
    this.parkId = this.Context && this.Context.ParkId;
    this.foundingId = this.Context && this.Context.FoundingId != null ? this.Context.FoundingId : null;
    this.selected = [];
    return this.foundingId != null ? this.npOpenFounding() : this.npOpenPark();
  }

  npOpenFounding() {
    const f = this.founding;
    if (!f) { log("picker: no founding"); return false; }
    this.refreshCandidates();
    if (!this.candidates.length) { log(`picker: founding ${f.id} has no empty tile`); return false; }
    safe(() => Camera.lookAtPlot(Cities.get(f.city).location));
    log(`picker open for founding ${f.id} (${this.candidates.length} empty tiles)`);
    return true;
  }

  npOpenPark() {
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
    if (this.candidates.length)
      safe(() => plots.addPlots(this.candidates, { fillColor: PICK_FILL, edgeColor: PICK_EDGE }));
    if (this.selected.length)
      safe(() => plots.addPlots(this.selected, { fillColor: colors.chosen, edgeColor: colors.chosenEdge }));
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
        confirmCostlyTile(this.park, i, facts, () => {
          if (this.park && !this.selected.includes(i) && this.selected.length < this.allowance) {
            this.selected.push(i);
            this.refresh();
          }
        });
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

  confirm() { return this.foundingId != null ? this.npFound() : this.npAddSelected(); }

  /** A founding's park is placed on the selected tile, named and drawn, and the picker opens again on the land around
   *  it for the rest of the founding's tiles (the Choose land prompt, if the map isn't free for it). */
  npFound() {
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
    setTimeout(() => openPicker(park.id, "founding"), 250);
    return true;
  }

  /** The selected tiles join the park and grow in; the picker stays open while it has more to take. */
  npAddSelected() {
    const park = this.park;
    if (!park || !this.selected.length) return false;
    const added = [];
    for (const t of this.selected) if (addTile(park, t)) added.push(t);
    const l = locOf(park.anchor);
    log(`park ${park.id} took ${added.length} tile(s) near ${l.x},${l.y}; ${park.pending} left`);
    this.selected = [];
    if (added.length) { drawPark(park, added); refreshGeoLabels(); }
    this.refreshCandidates();
    if (park.pending <= 0 || !this.candidates.length) {
      setTimeout(() => InterfaceMode.switchToDefault(), 0);
      return true;
    }
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
    o.frame.appendChild(buttonRow(this.npButtons()));
    box.appendChild(o.frame);
    document.body.appendChild(box);
    this.setTitle = o.setTitle;
    this.eyebrowEl = eyebrow;
    this.hintEl = hint;
    this.updateBanner();
    this.watchScreens();
  }
  /** The banner's buttons: Confirm, Done (a park), Later, and Rename (a park). With Geographic Labels' park support,
   *  Rename opens its Rename Places; without it, this mod's own box. */
  npButtons() {
    const buttons = [];
    this.confirmBtn = button("LOC_NP_PICKER_CONFIRM", "LOC_NP_PICKER_CONFIRM_TIP", () => this.confirm(), true);
    buttons.push(this.confirmBtn);
    const founding = this.foundingId != null;
    if (!founding) buttons.push(button("LOC_NP_PICKER_DONE", "LOC_NP_PICKER_DONE_TIP", () => this.finish(), true));
    buttons.push(button("LOC_NP_PICKER_LATER", founding ? "LOC_NP_FOUND_LATER_TIP" : "LOC_NP_PICKER_LATER_TIP", () => InterfaceMode.switchToDefault(), true));
    if (!founding) buttons.push(button("LOC_NP_PICKER_RENAME", "LOC_NP_PICKER_RENAME_TIP", () => {
      const park = this.park;
      if (!park) return;
      if (hasGeoRename()) { InterfaceMode.switchToDefault(); setTimeout(() => openRename(park), 50); }
      else openParkRename(park, () => this.updateBanner());
    }, true));
    return buttons;
  }

  updateBanner() {
    if (this.foundingId != null) { this.npFoundingBanner(); return; }
    const park = this.park;
    if (!park || !this.setTitle) return;
    this.setTitle(compose("LOC_NP_PICKER_TITLE", displayName(park)));
    this.eyebrowEl.innerHTML = safe(() => Locale.stylize(kindLine(park.kind)), "");
    // Once the selection would fill the park, say so: the rest of this expansion then lapses.
    const full = park.tiles.length + this.selected.length >= limits.maxTiles;
    this.hintEl.textContent = full
      ? compose("LOC_NP_PICKER_HINT_FULL", limits.maxTiles, this.selected.length)
      : compose("LOC_NP_PICKER_HINT", Math.min(park.pending, room(park)), this.selected.length);
    this.npConfirmState();
  }

  npFoundingBanner() {
    const f = this.founding;
    if (!f || !this.setTitle) return;
    this.setTitle(compose(foundTitleTag(f), settlementName(f.city)));
    this.eyebrowEl.innerHTML = safe(() => Locale.stylize(kindLine(f.kind)), "");
    this.hintEl.textContent = compose("LOC_NP_FOUND_PICKER_HINT");
    this.npConfirmState();
  }

  /** Confirm is offered once something is selected. */
  npConfirmState() {
    if (!this.confirmBtn) return;
    if (this.selected.length) this.confirmBtn.removeAttribute("disabled");
    else this.confirmBtn.setAttribute("disabled", "true");
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

// renaming without Geographic Labels

// the Choose land prompt
//
// Shown at the top of the screen while a park of the local player has land waiting or a founding is waiting for its
// tile, nothing else is on screen and the picker is closed; its button opens the picker.

// buying an expansion for Gold (the purchase itself is in the production panel's list, np-purchase.js)

