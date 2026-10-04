import test from "node:test";
import assert from "node:assert/strict";

import { until, inSequence, isSettling, orphanMarkerPlots } from "../ui/np-core.js";

test("until resolves true as soon as the test holds", async () => {
  let n = 0;
  const t0 = Date.now();
  assert.equal(await until(() => ++n >= 3, 2000, 5), true);
  assert.ok(Date.now() - t0 < 1000);
});

test("until resolves false when the test never holds, and a throwing test counts as not yet", async () => {
  assert.equal(await until(() => false, 60, 10), false);
  assert.equal(await until(() => { throw new Error("not ready"); }, 60, 10), false);
});

test("sequences on one plot run one after another; other plots run alongside", async () => {
  const order = [];
  const a = inSequence(7, async () => { await new Promise((r) => setTimeout(r, 40)); order.push("7a"); });
  const b = inSequence(7, async () => { order.push("7b"); });
  const c = inSequence(8, async () => { order.push("8"); });
  assert.equal(isSettling(7), true);
  await Promise.all([a, b, c]);
  assert.deepEqual(order, ["8", "7a", "7b"]);
  assert.equal(isSettling(7), false);
  assert.equal(isSettling(8), false);
});

test("a failing sequence does not block the next one on the plot", async () => {
  const order = [];
  inSequence(9, async () => { throw new Error("step failed"); });
  await inSequence(9, async () => { order.push("ran"); });
  assert.deepEqual(order, ["ran"]);
  assert.equal(isSettling(9), false);
});

test("orphan markers: plots no park holds, leaving busy plots alone", () => {
  const taken = new Set([1, 2, 3]);
  assert.deepEqual(orphanMarkerPlots([1, 4, 5, 3], taken), [4, 5]);
  assert.deepEqual(orphanMarkerPlots([1, 4, 5], taken, (i) => i === 5), [4]);
  assert.deepEqual(orphanMarkerPlots([], taken), []);
});
