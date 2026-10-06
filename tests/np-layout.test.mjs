import test from "node:test";
import assert from "node:assert/strict";

import { hash01, connectedSelection } from "../ui/np-core.js";
import { wallEdges, wallPieces, mountainWallPieces, mountainWallSpan, MOUNTAIN_EW_SHARE, buoyEdges, hawkTile, armAngle } from "../ui/np-draw.js";
import { baseNameOf, chooseName, rankCandidates } from "../ui/np-names.js";
import { lensBatches, LENS_COLORS } from "../ui/np-lens.js";

// A toy hex world: plot p's ring is six made-up neighbors.
const ring = (p) => [p + 1, p + 10, p + 9, p - 1, p - 10, p - 9];

test("walls: only on outer edges, never against impassable land, some edges left open", () => {
  const tiles = [50, 51];
  const edges = wallEdges(tiles, ring, (i) => i === 60, 0.58, 0);
  const inPark = new Set(tiles);
  for (const e of edges) {
    const n = ring(e.plot)[e.dir];
    assert.ok(!inPark.has(n), "an inner edge got a wall");
    assert.notEqual(n, 60, "a wall against impassable land");
  }
  const outer = tiles.flatMap((t) => ring(t).map((n, dir) => ({ t, n, dir }))).filter((x) => !inPark.has(x.n) && x.n !== 60);
  assert.ok(edges.length > 0 && edges.length < outer.length, `expected a broken wall, got ${edges.length}/${outer.length}`);
});

test("walls: some edges between the park's own tiles, fewer than on its border, each once", () => {
  const tiles = [];
  for (let r = 2; r < 8; r++) for (let c = 2; c < 8; c++) tiles.push(r * 10 + c);
  const inPark = new Set(tiles);
  const edges = wallEdges(tiles, ring, () => false);
  const inner = edges.filter((e) => e.inner), outer = edges.filter((e) => !e.inner);
  for (const e of inner) assert.ok(inPark.has(ring(e.plot)[e.dir]) && e.plot < ring(e.plot)[e.dir], "an inner wall off the park or counted twice");
  for (const e of outer) assert.ok(!inPark.has(ring(e.plot)[e.dir]), "a border wall inside the park");
  const innerAll = tiles.flatMap((t) => ring(t).filter((n) => inPark.has(n) && t < n)).length;
  const outerAll = tiles.flatMap((t) => ring(t).filter((n) => !inPark.has(n))).length;
  assert.ok(inner.length > 0 && inner.length / innerAll < 0.4, `inner ${inner.length}/${innerAll}`);
  assert.ok(outer.length / outerAll > 0.85, `outer ${outer.length}/${outerAll}`);
  assert.equal(wallEdges(tiles, ring, () => false, 1, 0).filter((e) => e.inner).length, 0, "innerShare 0 walls no inner edge");
});

test("walls: a stone wall at a mountain's foot where the border meets one, from either side", () => {
  const mtn = (i) => i === 52 || i === 41;      // 52 outside the park, 41 inside it
  const imp = (i) => mtn(i) || i === 60;        // 60: water outside
  const edges = wallEdges([40, 41, 50, 51], ring, imp, 1, 0, mtn);
  const foot = edges.filter((e) => e.foot);
  assert.ok(foot.some((e) => e.plot === 51 && ring(51)[e.dir] === 52), "park land facing a mountain outside");
  assert.ok(foot.some((e) => e.plot === 41 && !imp(ring(41)[e.dir])), "a park mountain facing open land outside");
  assert.ok(!edges.some((e) => ring(e.plot)[e.dir] === 60), "nothing facing water");
  assert.ok(!edges.some((e) => e.plot === 41 && !e.foot), "a park mountain gets no other wall");
  const runs = mountainWallPieces(51, 0);
  assert.ok(runs.length >= 3 && runs.every((p) => p.asset === "NAM_SWN_CityKit_RockFence"), "grey dry-stone runs only");
  // East and west edges run up the screen: their walls are kept to the middle; none reaches a corner (half-edge 0.265).
  const len = (d, ends) => { const [a, b] = mountainWallSpan(d, ends); return b - a; };
  for (const d of [0, 3]) for (const o of [1, 2, 4, 5]) assert.ok(len(d) < len(o), `edge ${d} shorter than edge ${o}`);
  for (let d = 0; d < 6; d++) assert.ok(Math.max(...mountainWallSpan(d).map(Math.abs)) < 0.24, `edge ${d} clear of the corners`);
  assert.ok(mountainWallSpan(1, [true, false])[0] > mountainWallSpan(1)[0] && mountainWallSpan(1, [false, true])[1] < mountainWallSpan(1)[1],
    "an end beside another mountain is pulled in");
  // East and west: some trimmed, some stubs, chosen per edge; and walled less often than the other sides.
  const halves = new Set(Array.from({ length: 200 }, (_x, p) => mountainWallSpan(0, [false, false], p)[1]));
  assert.deepEqual([...halves].sort(), [0.06, 0.13], "east-west walls are a stub or the trimmed run");
  // Lone park tiles far apart, every neighbour a mountain: each direction faces a mountain equally often.
  const many = Array.from({ length: 400 }, (_x, k) => 1000 + k * 100);
  const park = new Set(many), isM = (i) => !park.has(i);
  const foots = wallEdges(many, ring, isM, 1, 0, isM).filter((e) => e.foot);
  const byDir = (ds) => foots.filter((e) => ds.includes(e.dir)).length;
  assert.ok(MOUNTAIN_EW_SHARE < 1 && byDir([0, 3]) < byDir([1, 4]), `east-west ${byDir([0, 3])} vs diagonal ${byDir([1, 4])}`);
  assert.ok(runs.every((p) => Math.abs(p.dx * Math.cos(Math.PI * armAngle(0) / 180) + p.dy * Math.sin(Math.PI * armAngle(0) / 180) - 0.52) < 0.01), "just outside the edge");
  assert.deepEqual(mountainWallPieces(51, 0), runs, "stable");
});

test("walls: the same park always gets the same gaps", () => {
  const a = wallEdges([12, 13, 22], ring, () => false);
  const b = wallEdges([12, 13, 22], ring, () => false);
  assert.deepEqual(a, b);
});

test("walls: all edges at share 1, none at share 0, none on an impassable tile", () => {
  assert.equal(wallEdges([5], ring, () => false, 1).length, 6);
  assert.equal(wallEdges([5], ring, () => false, 0).length, 0);
  assert.equal(wallEdges([5], ring, (i) => i === 5, 1).length, 0);
});

test("hash01 is stable and in [0, 1)", () => {
  for (let i = 0; i < 200; i++) {
    const v = hash01(i, 3);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, hash01(i, 3));
  }
});

test("arm angles follow Canals: east 0, then counter-clockwise on screen", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(armAngle), [0, 300, 240, 180, 120, 60]);
});

test("names: the wonder beats a nearer mountain; toponyms drop their generic", () => {
  const near = [
    { type: "mountains", text: "Altai Mountains", toponym: "Altai", dist: 0 },
    { type: "wonder", text: "Uluru", dist: 1 },
    { type: "cont", text: "Nena", dist: 0 },
    { type: "park", text: "Some National Park", dist: 0 },
  ];
  assert.deepEqual(rankCandidates(near), ["Uluru", "Altai", "Nena"]);
});

test("names: a player's own label name is used whole", () => {
  assert.equal(baseNameOf({ type: "mountains", text: "Blue Ridge", toponym: "Altai", cust: true }), "Blue Ridge");
  assert.equal(baseNameOf({ type: "rivernav", text: "Shenandoah River" }), "Shenandoah River");
});

test("names: a taken name falls through, then gets an ordinal", () => {
  assert.equal(chooseName(["Uluru", "Altai"], new Set(["Uluru National Park"])), "Altai National Park");
  assert.equal(chooseName(["Uluru"], new Set(["Uluru National Park"])), "Uluru National Park II");
  assert.equal(chooseName(["Uluru"], new Set(["Uluru National Park", "Uluru National Park II"])), "Uluru National Park III");
  assert.equal(chooseName([], new Set()), "");
});

test("wall pieces: composed along the edge band, mixed, both faces, stable", () => {
  const kinds = new Set(); let flipped = 0, runs = 0, edges = 0, fenced = 0;
  for (const biome of ["BIOME_GRASSLAND", "BIOME_PLAINS", "BIOME_DESERT", "BIOME_TUNDRA", "BIOME_TROPICAL"]) {
    for (let plot = 0; plot < 120; plot++) for (let dir = 0; dir < 6; dir++) {
      const pieces = wallPieces(plot, dir, biome); edges++;
      assert.ok(pieces.length >= 1 && pieces.length <= 40, `${pieces.length} pieces`);
      assert.ok(/RockFence|Rough_Rock_Rounded|FenceBit|FenceDoor/.test(pieces[0].asset), "an edge starts with stone or fence");
      if (pieces.filter((p) => /FenceBit|FenceDoor/.test(p.asset)).length > pieces.length / 2) fenced++;
      for (const p of pieces) if (/Rough_Rock_Rounded/.test(p.asset)) assert.ok(/^(Plains|Desert)_/.test(p.asset), `${p.asset}: only the plains and desert rocks draw in color`);
      const a = armAngle(dir) * Math.PI / 180;
      for (const p of pieces) {
        kinds.add(p.asset);
        const radial = p.dx * Math.cos(a) + p.dy * Math.sin(a);
        const along = -p.dx * Math.sin(a) + p.dy * Math.cos(a);
        assert.ok(radial > 0.36 && radial < 0.505, `radial ${radial}`);
        assert.ok(Math.abs(along) <= 0.245, `along ${along}`);
        if (p.asset === "NAM_SWN_CityKit_RockFence") {
          runs++;
          const off = ((p.angle - armAngle(dir)) % 360 + 360) % 360;
          if (off > 180) flipped++;
        }
      }
      assert.deepEqual(pieces, wallPieces(plot, dir, biome), "not stable");
    }
  }
  assert.ok(kinds.size >= 8, `only ${kinds.size} kinds of piece`);
  for (const k of ["PROP_GEN_FenceBit_A", "PROP_GEN_FenceBit_B", "PROP_GEN_FenceBit_C", "PROP_Pasture_FenceDoor_Closed", "PROP_Pasture_FenceDoor_Open"]) assert.ok(kinds.has(k), `${k} never used`);
  assert.ok(flipped > runs * 0.35 && flipped < runs * 0.65, `${flipped}/${runs} runs laid the other way`);
  assert.ok(runs / edges > 0.1, `only ${(runs / edges).toFixed(2)} stone runs per edge`);
  assert.ok(fenced > edges * 0.45 && fenced < edges * 0.9, `${fenced}/${edges} open-ground edges mostly fence`);
});

test("wall pieces: hills, mountains and wonders get dry stone only", () => {
  for (const biome of ["BIOME_GRASSLAND", "BIOME_DESERT", "BIOME_TUNDRA"]) {
    for (let plot = 0; plot < 120; plot++) for (let dir = 0; dir < 6; dir++) {
      const pieces = wallPieces(plot, dir, biome, undefined, undefined, "rough");
      assert.ok(pieces.length >= 1, "an edge has pieces");
      assert.ok(!pieces.some((p) => /Fence/.test(p.asset) && !/RockFence/.test(p.asset)), `${pieces.map((p) => p.asset).join(",")}: no fence on rough ground`);
      assert.ok(!pieces.some((p) => /FenceBit|FenceDoor/.test(p.asset)), "no split rail on rough ground");
    }
  }
});

test("buoys: only where park water meets open water outside the park, and not on every edge", () => {
  const water = (i) => i >= 100;           // plots 100+ are water in this toy world
  const tiles = [50, 110, 111];             // a land tile and two water tiles
  const edges = buoyEdges(tiles, ring, water, 0.5);
  const inPark = new Set(tiles);
  for (const e of edges) {
    assert.ok(water(e.plot), "a buoy on land");
    const n = ring(e.plot)[e.dir];
    assert.ok(water(n) && !inPark.has(n), "a buoy facing land or the park itself");
  }
  assert.ok(edges.length > 0);
  assert.equal(buoyEdges(tiles, ring, water, 0).length, 0);
  assert.equal(buoyEdges([50], ring, water, 1).length, 0, "a land-only park has no buoys");
  assert.deepEqual(edges, buoyEdges(tiles, ring, water, 0.5));
});

test("hawk: none for a small park; a mountain first, then the lookout, then the founding tile", () => {
  const mountain = (i) => i >= 900;
  assert.equal(hawkTile([1, 2], 1, -1, mountain), -1);
  assert.equal(hawkTile([1, 2, 3], 1, -1, mountain), 1);
  assert.equal(hawkTile([1, 2, 3], 1, 3, mountain), 3);
  assert.equal(hawkTile([1, 950, 3, 920], 1, 3, mountain), 920);
});

test("selection: a chain outward stays; deselecting its root drops what hung from it", () => {
  // park 50; 51 is next to it, 52 next to 51 only, 60 next to 50
  assert.deepEqual(connectedSelection([50], [51, 52, 60], ring), [51, 52, 60]);
  assert.deepEqual(connectedSelection([50], [52, 60], ring), [60], "52 no longer connects once 51 is gone");
  assert.deepEqual(connectedSelection([50], [52, 51], ring), [52, 51], "order of selection does not matter");
});


const plainLand = (over = {}) => ({ biome: "BIOME_PLAINS", water: false, lake: false, river: false, coast: false, hill: false,
  mountain: false, wonder: false, wooded: false, anchor: false, shore: null, ...over });

// An odd-r offset hex grid, W x H, as the map's ring order (six neighbors, -1 off the map).
const W = 14, H = 12;
function hexRing(t) {
  const x = t % W, y = Math.floor(t / W), odd = y % 2;
  const d = odd ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  return d.map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= W || ny >= H ? -1 : ny * W + nx; });
}
const allTiles = Array.from({ length: W * H }, (_x, t) => t);
const plan = (tiles, land) => planScene(tiles, { land, ring: hexRing, fauna: FAUNA_POOLS });
const SPACED = ["herd", "climber", "air", "school", "reef", "lakeFish", "leap", "wader", "reeds", "lilies", "cairn", "stones", "under", "trail"];

test("lens: one fill per kind and role, revealed tiles only, the founding tile deeper", () => {
  const list = [{ id: 1, kind: "park", anchor: 10, tiles: [10, 11, 12] }, { id: 2, kind: "wilderness", anchor: 20, tiles: [20, 21] }];
  const b = lensBatches(list, { kindKey: (p) => p.kind, revealed: (t) => t !== 12, loc: (t) => ({ x: t, y: 0 }) });
  const by = new Map(b.map((g) => [g.plots.map((p) => p.x).join(","), g.fill]));
  assert.deepEqual([...by.keys()].sort(), ["10", "11", "20", "21"]);
  assert.equal(by.get("11"), LENS_COLORS.park.land);
  assert.equal(by.get("10"), LENS_COLORS.park.anchor);
  assert.equal(by.get("21"), LENS_COLORS.wilderness.land);
  assert.ok(LENS_COLORS.park.anchor.w > LENS_COLORS.park.land.w);
});

