// np-purchase.js - National Parks: Found and Expand rows in the game's own purchase list.
//
// The game cannot sell a project for Gold: a project with CanPurchase is only queued as a build from the purchase
// list (production-chooser-helpers.js Construct), and a town refuses a CityOnly project by every route. So the
// production panel is decorated instead: while it shows the purchase list of a settlement, town or city, that holds
// one of the player's parks, the list carries an Expand row for each of its parks, priced in Gold like any purchase.
// Choosing it runs the mod's own purchase (np-main.js buyExpansion), closes the panel, and opens the tile picker.
// A settlement without a park of a kind gets a Found row for it the same way (np-main.js buyFounding), once the age's
// civic is done; the picker then offers the empty tiles the settlement holds.
//
// The panel builds its list in a module-local function, so the rows are added where the list reaches the panel: the
// instance's `items` accessor, which every refresh passes through, and its doOrConfirmConstruction, which a choice
// reaches. A replacement panel that shows a city's purchases as Gold pills on its production rows, with no purchase
// tab (one such mod keys the pill on `purchaseCost` and calls doOrConfirmConstruction with isPurchase true), gets the
// price as a pill on the city's own Expand row instead.
"use strict";

import { InterfaceMode } from "/core/ui/interface-modes/interface-modes.js";
import { Audio } from "/core/ui/audio-base/audio-support.js";
import { safe, log, parks, kindOf, isFull, settlementOf, expansionPrice, KINDS, kindByFoundProject } from "./np-core.js";

let buy = null;
let found = null;

/**
 * np-main.js hands over the purchases themselves. `fn`: (park) => "" on success, or a reason's text tag. `foundApi`:
 * { buy(cityID, kind), price(cityID, kind), refusal(cityID, kind) } for the Found rows. Null: no purchases.
 */
export function setPurchaseHandler(fn, foundApi = null) { buy = fn; found = foundApi; }

function isLocal(owner) { return owner === safe(() => GameContext.localPlayerID, -99); }

/** The local player's parks held by a settlement, at most one of each kind. */
function parksOf(cityId) {
  if (!cityId) return [];
  return parks().filter((p) => {
    const s = settlementOf(p);
    return !!s && s.id === cityId.id && s.owner === cityId.owner && isLocal(p.owner);
  });
}

function parkForRow(cityId, type) { return parksOf(cityId).find((p) => kindOf(p).project === type) || null; }

/** A purchase-list row in the panel's own item shape (see getProjectItems in production-chooser-helpers.js). */
function rowFor(park, gold) {
  const kind = kindOf(park);
  const project = safe(() => GameInfo.Projects.lookup(kind.project), null);
  if (!project) return null;
  const cost = expansionPrice(settlementOf(park), kind);
  const full = isFull(park);
  const short = !full && gold < cost;
  return {
    name: project.Name, description: project.Description, type: kind.project, cost, turns: -1,
    category: "projects", showTurns: false, showCost: true, insufficientFunds: short, disabled: full || short,
    error: full ? safe(() => Locale.compose("LOC_NP_BUY_FULL"), "") : short ? safe(() => Locale.compose("LOC_CITY_PURCHASE_INSUFFICIENT_FUNDS"), "") : void 0,
  };
}

/** A Found row for a settlement without a park of `kind`, or null when the row is hidden (no civic yet, one there). */
function foundRowFor(cityId, kind, gold) {
  if (!found || !cityId) return null;
  const why = safe(() => found.refusal(cityId, kind), "hide");
  if (why === "hide") return null;
  const project = safe(() => GameInfo.Projects.lookup(kind.found), null);
  if (!project) return null;
  const cost = safe(() => found.price(cityId, kind), 0);
  const short = !why && gold < cost;
  return {
    name: project.Name, description: project.Description, type: kind.found, cost, turns: -1,
    category: "projects", showTurns: false, showCost: true, insufficientFunds: short, disabled: !!why || short,
    error: why ? safe(() => Locale.compose(why), "") : short ? safe(() => Locale.compose("LOC_CITY_PURCHASE_INSUFFICIENT_FUNDS"), "") : void 0,
  };
}

/** Whether the panel shows purchases as pills on its production rows (it has no purchase list for cities). */
function hasPills(panel) { return typeof safe(() => panel.onPurchasePillSelected, null) === "function"; }

/** Add the Expand rows to a purchase list the panel is about to show, or the price pill to the city's Expand row on a
 *  pill-style panel (in place; a second call adds nothing). */
function addRows(panel, items) {
  if (!buy || !items || !Array.isArray(items.projects)) return items;
  const purchase = safe(() => panel.isPurchase, false);
  if (!purchase && !hasPills(panel)) return items;
  const cityId = safe(() => panel.cityID, null);
  const gold = safe(() => Players.get(GameContext.localPlayerID).Treasury.goldBalance, 0);
  const rows = parksOf(cityId).map((park) => rowFor(park, gold));
  for (const kind of Object.values(KINDS)) rows.push(foundRowFor(cityId, kind, gold));
  for (const row of rows) {
    if (!row) continue;
    const there = items.projects.find((it) => it.type === row.type);
    if (purchase) { if (!there) items.projects.push(row); continue; }
    if (!there) continue;
    there.purchaseCost = row.cost;
    there.purchaseDisabled = row.disabled;
    there.purchaseInsufficientFunds = row.insufficientFunds;
    there.purchaseError = row.error;
  }
  return items;
}

function accessor(obj, name) {
  for (let o = Object.getPrototypeOf(obj); o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d) return d;
  }
  return null;
}

class ParkPurchaseDecorator {
  constructor(panel) { this.panel = panel; }

  beforeAttach() {
    const panel = this.panel;
    const items = accessor(panel, "items");
    if (!items || !items.get || !items.set) { log("production panel has no items accessor; Expand is not in the purchase list"); return; }
    Object.defineProperty(panel, "items", {
      configurable: true,
      get() { return addRows(this, items.get.call(this)); },
      set(v) { items.set.call(this, addRows(this, v)); },
    });
    const choose = panel.doOrConfirmConstruction;
    if (typeof choose !== "function") return;
    panel.doOrConfirmConstruction = function (category, type, ...rest) {
      const purchase = rest[1] === true || safe(() => this.isPurchase, false);
      const fk = found && purchase ? kindByFoundProject(type) : null;
      if (fk) {
        const why = found.buy(safe(() => this.cityID, null), fk);
        if (why) { log(`purchase list: founding refused (${why})`); return; }
        safe(() => Audio.playSound("data-audio-city-purchase-activate", "city-actions"));
        safe(() => UI.Player.deselectAllCities());
        safe(() => InterfaceMode.switchToDefault());
        return;
      }
      const park = buy && purchase ? parkForRow(safe(() => this.cityID, null), type) : null;
      if (!park) return choose.call(this, category, type, ...rest);
      const why = buy(park);
      if (why) { log(`purchase list: expansion refused (${why})`); return; }
      safe(() => Audio.playSound("data-audio-city-purchase-activate", "city-actions"));
      safe(() => UI.Player.deselectAllCities());
      safe(() => InterfaceMode.switchToDefault());
    };
  }

  afterAttach() {}
  beforeDetach() {}
  afterDetach() {}
}

safe(() => Controls.decorate("panel-production-chooser", (panel) => new ParkPurchaseDecorator(panel)));
