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
