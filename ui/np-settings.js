// np-settings.js - National Parks: the player's options, kept across games.
//
// One slice of the shared "modSettings" localStorage key, as Geographic Labels keeps its own. The game's
// localStorage.getItem() can return another key's value (the first key in the store, whatever
// key is asked for), so a read that does not look like a settings root (every top-level value an object) is never
// written back: the write is skipped and the value is kept in memory for this session. Loads in the main menu and
// in a game, with no game globals.
"use strict";

const ROOT_KEY = "modSettings";
const SLICE = "tower-national-park";
const DEFAULTS = { marks: true, lensButton: true };

let memory = null;

function safe(fn, fallback) { try { return fn(); } catch (_e) { return fallback; } }

function readRoot() {
  const raw = safe(() => localStorage.getItem(ROOT_KEY), null);
  if (!raw) return { root: {}, ok: true };
  const root = safe(() => JSON.parse(raw), null);
  if (!root || typeof root !== "object" || Array.isArray(root)) return { root: null, ok: false };
  const settingsShaped = Object.keys(root).every((k) => !!root[k] && typeof root[k] === "object" && !Array.isArray(root[k]));
  return settingsShaped ? { root, ok: true } : { root: null, ok: false };
}

function settings() {
  if (memory) return memory;
  const { root } = readRoot();
  const slice = root && root[SLICE];
  memory = { ...DEFAULTS, ...(slice && typeof slice === "object" ? slice : {}) };
  return memory;
}

function persist() {
  const { root, ok } = readRoot();
  if (!ok) return false;
  root[SLICE] = { ...memory };
  return safe(() => { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); return true; }, false);
}

/**
 * Whether parks are marked on the map at all times, whatever the lens: their dashed border and a light shading of their
 * land. On unless the player turns it off. (In pre-release builds the option was `overlay`, off by default, and shaded park
 * land as strongly as the lens; a saved `overlay` is ignored, so no one loses the border.)
 */
export function getMarks() { return settings().marks !== false; }
export function setMarks(on) { settings().marks = !!on; return persist(); }

/** Whether the Parks and Wilderness lens is listed in the lens menu. */
export function getLensButton() { return settings().lensButton !== false; }
export function setLensButton(on) { settings().lensButton = !!on; return persist(); }

/** Test hook: forget the cached settings. */
export function resetSettings() { memory = null; }
