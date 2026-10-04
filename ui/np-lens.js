// np-lens.js - National Parks: the Parks and Wilderness lens.
//
// A lens in the game's lens menu that shades every revealed tile of every park: National Parks in green, Wilderness
// Areas in ocher (the color of their border, and clear of the yellows the game's own lenses use). The founding tile
// is shaded a little deeper so each park's center reads. Outside the lens every park carries a lighter wash of the same
// colors (FAINT_COLORS) with its dashed border, both shown or hidden by one option (np-settings.js getMarks): where a
// park's edge runs along a civilization's border, the game's culture border draws over the park's dashed line
// (priority 5 against 1), and the wash still shows the park's land, at any zoom. Display only. Registered when np-main.js imports it, in the
// game's HUD scope, the way Cultural Diffusion registers its pressure lens.
"use strict";

import { safe, log, locOf, parks, isRevealed, kindOf } from "./np-core.js";
import { getMarks, getLensButton } from "./np-settings.js";

// The game's LensManager is loaded when the lens registers, so this module (and np-draw.js, which imports it) also
// loads under the tests, outside the game.
let LensManager = null;

export const LENS = "np-parks-lens";
const LAYER = "np-parks-layer";
const HEX_GRID = 1;   // OVERLAY_PRIORITY.HEX_GRID

/** Fill colors (r, g, b, alpha in 0-1): land, then the founding tile a little deeper. */
export const LENS_COLORS = {
  park: { land: { x: 0.2, y: 0.68, z: 0.3, w: 0.3 }, anchor: { x: 0.2, y: 0.68, z: 0.3, w: 0.45 } },
  wilderness: { land: { x: 0.9, y: 0.6, z: 0.14, w: 0.3 }, anchor: { x: 0.9, y: 0.6, z: 0.14, w: 0.45 } },
};

/** The wash every park carries on the map outside the lens, with the Options marks on: the lens colors, lighter. */
export const FAINT_COLORS = {
  park: { land: { ...LENS_COLORS.park.land, w: 0.18 }, anchor: { ...LENS_COLORS.park.anchor, w: 0.25 } },
  wilderness: { land: { ...LENS_COLORS.wilderness.land, w: 0.18 },
    anchor: { ...LENS_COLORS.wilderness.anchor, w: 0.25 } },
};

/**
 * The fills to paint: [{ fill, plots: [{x, y}] }], one batch per kind and tile role. Pure given `list`, `kindKey`
 * and `revealed`, so the grouping can be tested without the engine.
 */
export function lensBatches(list, { kindKey = (p) => kindOf(p).key, revealed = isRevealed, loc = locOf,
  palette = LENS_COLORS } = {}) {
  const groups = new Map();
  for (const p of list) {
    const colors = palette[kindKey(p)] || palette.park;
    for (const t of p.tiles) {
      if (!revealed(t)) continue;
      const role = t === p.anchor ? "anchor" : "land";
      const key = kindKey(p) + ":" + role;
      if (!groups.has(key)) groups.set(key, { fill: colors[role], plots: [] });
      const l = loc(t);
      groups.get(key).plots.push({ x: l.x, y: l.y });
    }
  }
  return [...groups.values()];
}

/** One overlay of park shading: `paint()` draws every park, `clear()` removes it. */
class ParkShading {
  constructor(name, palette = LENS_COLORS) {
    this.palette = palette;
    this.group = WorldUI.createOverlayGroup(name, HEX_GRID);
    this.overlay = this.group.addPlotOverlay();
  }
  clear() { safe(() => this.group.clearAll()); safe(() => this.overlay.clear()); }
  paint() {
    this.clear();
    for (const b of lensBatches(parks(), { palette: this.palette })) {
      if (b.plots.length) safe(() => this.overlay.addPlots(b.plots, { fillColor: b.fill }));
    }
  }
}

/** The lens layer. With the Options overlay on, the shading is already on the map, so the lens adds none. */
class ParksLensLayer {
  constructor() { this.shading = new ParkShading("NationalParkLens"); }
  clear() { this.shading.clear(); }
  initLayer() {}
  applyLayer() { this.shading.paint(); }
  removeLayer() { this.clear(); }
}

class ParksLens {
  constructor() {
    this.activeLayers = new Set([LAYER, "fxs-hexgrid-layer"]);
    this.allowedLayers = new Set(["fxs-yields-layer", "fxs-resource-layer"]);
  }
}

/** Adds the lens to the lens menu beside the game's own. */
class ParksLensPanelDecorator {
  constructor(component) { this.component = component; }
  beforeAttach() {}
  afterAttach() { if (getLensButton()) safe(() => this.component.createLensButton("LOC_NP_LENS", LENS, "lens-group")); }
  beforeDetach() {}
  afterDetach() {}
}

let layer = null;
let faint = null;    // the wash, shown with the Options marks on
let pending = null;

/** Repaint the shading on the map: the wash, and the lens if it is showing. */
function repaint() {
  if (!layer) return;
  if (getMarks()) { if (!faint) faint = new ParkShading("NationalParkWash", FAINT_COLORS); faint.paint(); }
  else if (faint) faint.clear();
  if (LensManager && safe(() => LensManager.getActiveLens(), null) === LENS) safe(() => layer.applyLayer());
}

/** Repaint once a burst of park changes has settled. */
export function refreshLens() {
  if (!layer || pending) return;
  pending = setTimeout(() => { pending = null; repaint(); }, 250);
}

/**
 * Apply changed Options at once: the marks on or off now. A lens button turned off leaves the menu when the lens
 * menu is next built; if the lens is showing then, the map returns to the default lens.
 */
export function applySettings() {
  repaint();
  if (!getLensButton() && LensManager && safe(() => LensManager.getActiveLens(), null) === LENS) {
    safe(() => LensManager.setActiveLens("fxs-default-lens"));
  }
}

/** Register the lens and its menu button; called once, from np-main.js. */
export async function registerLens() {
  if (layer) return;
  try {
    LensManager = (await import("/core/ui/lenses/lens-manager.js")).default;
    layer = new ParksLensLayer();
    LensManager.registerLensLayer(LAYER, layer);
    LensManager.registerLens(LENS, new ParksLens());
  } catch (e) {
    log(`lens registration failed: ${e}`);
    return;
  }
  safe(() => Controls.decorate("lens-panel", (c) => new ParksLensPanelDecorator(c)));
  repaint();
}
