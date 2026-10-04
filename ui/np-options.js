// np-options.js - National Park: its group in the game's Options screen, under Mods.
//
// Registered from the main menu and in a game. Each option writes through as it is changed and applies at once in a
// game, through window.__towerNationalPark (set by np-main.js; absent in the main menu). Cancel Changes puts back the
// value the option had when the screen opened. Registered as an init callback, as Geographic Labels does, because
// the game rebuilds the Options list after every Confirm and options added once at load vanished.
"use strict";

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
import { getMarks, setMarks, getLensButton, setLensButton } from "./np-settings.js";

function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }

// The shared "Mods" category: the first mod to load creates it, the others reuse it.
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = { title: "LOC_UI_CONTENT_MGR_SUBTITLE", description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION" };
}

/** Tell the running game, if any, that an option changed. */
function applyLive() { safe(() => window.__towerNationalPark && window.__towerNationalPark.applySettings()); }

/**
 * One checkbox row. `loc` is the text key stem: the label is the stem, the tooltip the stem + "_DESCRIPTION", as in
 * the other mods' Options.
 */
function checkbox(id, loc, get, set) {
  return {
    category: CategoryType.Mods,
    // Underscore token: the game derives the group header key as LOC_OPTIONS_GROUP_${group.toUpperCase()}.
    group: "national_park",
    type: OptionType.Checkbox,
    id,
    label: loc,
    description: loc + "_DESCRIPTION",
    initListener: (info) => { info.currentValue = get(); info.openValue = info.currentValue; },
    updateListener: (info, value) => { info.currentValue = !!value; set(!!value); applyLive(); },
    restoreListener: (info) => { if (get() !== info.openValue) { set(info.openValue); applyLive(); } },
  };
}

function registerAll() {
  safe(() => Options.addOption(checkbox("np-overlay", "LOC_OPTIONS_NP_OVERLAY", getMarks, setMarks)));
  safe(() => Options.addOption(checkbox("np-lens-button", "LOC_OPTIONS_NP_LENS", getLensButton, setLensButton)));
}

try {
  Options.addInitCallback(registerAll);
} catch (_e) {
  registerAll();   // the list was already built: add them now
}
