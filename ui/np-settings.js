// np-settings.js - National Parks: the player's options, kept across games.
//
// One slice of the shared "modSettings" localStorage key, as Geographic Labels keeps its own. The game's
// localStorage is unreliable, and every other mod's options live in the same key, so a write never risks them:
//   - getItem() can return another key's value (the first key in the store, whatever key is asked for), so a read
//     that does not look like a settings root (every top-level value an object) is never written back;
//   - a read can come back empty for a store that is not, so an empty read is read again before it is believed;
//   - a read that throws, or a value that does not parse, refuses the write.
// When a write is refused the value is kept in memory for this session. Only this mod's slice is written, and only
// the options changed this session are laid over what is stored. Loads in the main menu and in a game, with no game
// globals.
"use strict";

const ROOT_KEY = "modSettings";
const SLICE = "tower-national-park";
const DEFAULTS = { marks: true, lensButton: true };

let memory = null;
let changed = {};       // the options set this session, laid over the stored slice on a write

function safe(fn, fallback) { try { return fn(); } catch (_e) { return fallback; } }

const THREW = {};
function readRaw() {
  try {
    let raw = localStorage.getItem(ROOT_KEY);
    if (!raw) raw = localStorage.getItem(ROOT_KEY);   // a first read can come back empty
    return raw || null;
  } catch (_e) {
    return THREW;
  }
}

function readRoot() {
  const raw = readRaw();
  if (raw === THREW) return { root: null, ok: false };
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
  memory = { ...DEFAULTS, ...(slice && typeof slice === "object" ? slice : {}), ...changed };
  return memory;
}

function set(key, value) {
  settings()[key] = value;
  changed[key] = value;
  return persist();
}

function persist() {
  const { root, ok } = readRoot();
  if (!ok) return false;
  // Over the slice as stored now, not as first read: a first read that missed it must not put the defaults back.
  root[SLICE] = { ...DEFAULTS, ...root[SLICE], ...changed };
  return safe(() => { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); return true; }, false);
}

/**
 * Whether parks are marked on the map at all times, whatever the lens: their dashed border and a light shading of their
 * land. On unless the player turns it off. (In pre-release builds the option was `overlay`, off by default, and shaded park
 * land as strongly as the lens; a saved `overlay` is ignored, so no one loses the border.)
 */
export function getMarks() { return settings().marks !== false; }
export function setMarks(on) { return set("marks", !!on); }

/** Whether the Parks and Wilderness lens is listed in the lens menu. */
export function getLensButton() { return settings().lensButton !== false; }
export function setLensButton(on) { return set("lensButton", !!on); }

/** Test hook: forget the cached settings. */
export function resetSettings() { memory = null; changed = {}; }
