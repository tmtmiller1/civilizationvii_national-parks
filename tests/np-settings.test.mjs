import test from "node:test";
import assert from "node:assert/strict";

import { getMarks, setMarks, getLensButton, setLensButton, resetSettings } from "../ui/np-settings.js";

function fakeStore(initial = {}, alias = null) {
  const data = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (alias != null ? alias : (k in data ? data[k] : null)),
    setItem: (k, v) => { data[k] = String(v); },
  };
  return data;
}

test("settings: defaults, then saved in our own slice beside another mod's", () => {
  const data = fakeStore({ modSettings: JSON.stringify({ "other-mod": { a: 1 } }) });
  resetSettings();
  assert.equal(getMarks(), true, "parks are marked unless turned off");
  assert.equal(getLensButton(), true);
  assert.equal(setMarks(false), true);
  setLensButton(false);
  const root = JSON.parse(data.modSettings);
  assert.deepEqual(root["other-mod"], { a: 1 });
  assert.deepEqual(root["tower-national-park"], { marks: false, lensButton: false });
  resetSettings();
  assert.equal(getMarks(), false);
  assert.equal(getLensButton(), false);
});

test("settings: an older save's overlay option is ignored, so the marks stay on", () => {
  fakeStore({ modSettings: JSON.stringify({ "tower-national-park": { overlay: false, lensButton: true } }) });
  resetSettings();
  assert.equal(getMarks(), true);
});

test("settings: a read that returns another key's blob is never written back", () => {
  const data = fakeStore({}, JSON.stringify({ v: 2, history: [1, 2, 3] }));
  resetSettings();
  assert.equal(getMarks(), true);
  assert.equal(setMarks(false), false);
  assert.equal(data.modSettings, undefined);
  assert.equal(getMarks(), false);   // kept for this session
});

// A store whose reads misbehave as the game's do: `empty` reads come back empty first, `throws` reads throw.
function flakyStore(initial, { empty = 0, throws = false } = {}) {
  const data = { ...initial };
  let left = empty;
  globalThis.localStorage = {
    getItem: (k) => {
      if (throws) throw new Error("getItem");
      if (left > 0) { left--; return null; }
      return k in data ? data[k] : null;
    },
    setItem: (k, v) => { data[k] = String(v); },
    flake: (n) => { left = n; },
  };
  return data;
}

test("settings: an empty first read is read again, so other mods' options survive a write", () => {
  const stored = { "other-mod": { a: 1 }, "tower-national-park": { marks: true, lensButton: false } };
  const data = flakyStore({ modSettings: JSON.stringify(stored) }, { empty: 1 });
  resetSettings();
  assert.equal(getLensButton(), false, "our own saved option is read past the empty read");
  globalThis.localStorage.flake(1);
  assert.equal(setMarks(false), true);
  const root = JSON.parse(data.modSettings);
  assert.deepEqual(root["other-mod"], { a: 1 });
  assert.deepEqual(root["tower-national-park"], { marks: false, lensButton: false });
});

test("settings: a first read that missed our slice does not put the defaults back over it", () => {
  const stored = { "other-mod": { a: 1 }, "tower-national-park": { marks: true, lensButton: false } };
  const data = flakyStore({ modSettings: JSON.stringify(stored) }, { empty: 2 });
  resetSettings();
  assert.equal(getLensButton(), true, "both reads empty: the default serves");
  assert.equal(setMarks(false), true);
  const root = JSON.parse(data.modSettings);
  assert.deepEqual(root["other-mod"], { a: 1 });
  assert.deepEqual(root["tower-national-park"], { marks: false, lensButton: false }, "the stored lensButton is kept");
});

test("settings: a read that throws, or a value that does not parse, refuses the write", () => {
  const thrown = flakyStore({ modSettings: JSON.stringify({ "other-mod": { a: 1 } }) }, { throws: true });
  resetSettings();
  assert.equal(setMarks(false), false);
  assert.deepEqual(JSON.parse(thrown.modSettings), { "other-mod": { a: 1 } });
  assert.equal(getMarks(), false);   // kept for this session
  const broken = fakeStore({ modSettings: "{not json" });
  resetSettings();
  assert.equal(setLensButton(false), false);
  assert.equal(broken.modSettings, "{not json");
});
