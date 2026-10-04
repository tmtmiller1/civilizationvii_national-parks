import test from "node:test";
import assert from "node:assert/strict";

import { hash01, connectedSelection } from "../ui/np-core.js";
import { wallEdges, wallPieces, mountainWallPieces, mountainWallSpan, MOUNTAIN_EW_SHARE, buoyEdges, hawkTile, armAngle, cabinCluster, lookoutTiles, levelSites, sitesPerLevel, monumentSites, monumentCounts, oldGrowth, oneGrove, spaced, singles, keepClear, solidSpots } from "../ui/np-draw.js";
import { baseNameOf, chooseName, rankCandidates } from "../ui/np-names.js";

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

import { wildlifeFor, liftFor, FAUNA_POOLS, _testing } from "../ui/np-wildlife.js";
import { planScene } from "../ui/np-scene.js";

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

test("scene: no accent on two neighboring tiles; boats and whales never within two tiles", () => {
  const mixed = (t) => plainLand({ hill: t % 3 === 0, wooded: t % 5 === 0, biome: t % 2 ? "BIOME_PLAINS" : "BIOME_GRASSLAND" });
  const lake = (t) => plainLand({ water: true, lake: true, shore: t % 4 ? 60 : null });
  const sea = (t) => plainLand({ water: true, coast: true, shore: t % 3 ? null : 120 });
  for (const land of [mixed, lake, sea]) {
    const p = plan(allTiles, land);
    for (const t of allTiles) {
      for (const n of hexRing(t)) {
        if (n < 0) continue;
        for (const k of SPACED) assert.ok(!(p.get(t)[k] != null && p.get(n)[k] != null), `${k} on neighbors ${t} and ${n}`);
        for (const k of ["boat", "whale"]) {
          for (const m of hexRing(n)) if (m >= 0 && m !== t) assert.ok(!(p.get(t)[k] != null && p.get(m)[k] != null), `${k} within two tiles`);
        }
      }
    }
  }
});

test("scene: herds on a share of the land, many species, and a flock variant differs from those close by", () => {
  const p = plan(allTiles, () => plainLand());
  const herds = allTiles.filter((t) => p.get(t).herd);
  assert.ok(herds.length > 0.2 * allTiles.length && herds.length <= 0.45 * allTiles.length, `${herds.length} herds`);
  assert.ok(new Set(herds.map((t) => p.get(t).herd)).size >= 4);
  const airs = allTiles.filter((t) => p.get(t).air);
  assert.ok(new Set(airs.map((t) => p.get(t).air)).size >= 3);
  for (const t of allTiles) assert.ok(p.get(t).stray == null || p.get(t).stray !== p.get(t).herd);
});

test("scene: the plan is stable, and a small park still gets something", () => {
  assert.deepEqual([...plan(allTiles, () => plainLand()).entries()], [...plan(allTiles, () => plainLand()).entries()]);
  const small = [30, 31, 44];
  const p = plan(small, () => plainLand());
  assert.ok(small.some((t) => Object.keys(p.get(t)).length > 0));
});

test("scene: each size level only adds accents, so stepping down takes away exactly what the level added", () => {
  const mixed = (t) => plainLand({ hill: t % 3 === 0, mountain: t % 11 === 0, water: t % 13 === 0, lake: t % 13 === 0,
    shore: t % 13 === 0 ? 60 : null, biome: t % 2 ? "BIOME_PLAINS" : "BIOME_GRASSLAND" });
  for (const wild of [false, true]) {
    const at = [0, 1, 2, 3].map((level) => planScene(allTiles, { land: mixed, ring: hexRing, fauna: FAUNA_POOLS, level, wild }));
    for (let l = 1; l < 4; l++) {
      for (const t of allTiles) for (const [k, v] of Object.entries(at[l - 1].get(t))) {
        assert.equal(at[l].get(t)[k], v, `${wild ? "wilderness" : "park"} level ${l}: tile ${t} lost or changed its ${k}`);
      }
    }
    const count = (p, k) => allTiles.filter((t) => p.get(t)[k] != null).length;
    assert.ok(count(at[3], "stray") > count(at[0], "stray"), "more strays at 24 tiles");
    assert.equal(count(at[3], "air"), count(at[0], "air"), "no more flocks overhead at 24 tiles");
  }
});

test("scene: no more than two flocks of one kind overhead in a park, however large", () => {
  for (const biome of ["BIOME_DESERT", "BIOME_TUNDRA", "BIOME_GRASSLAND"]) {
    const p = plan(allTiles, () => plainLand({ biome }));
    const n = {};
    for (const t of allTiles) if (p.get(t).air) n[p.get(t).air] = (n[p.get(t).air] || 0) + 1;
    assert.ok(Object.values(n).every((k) => k <= 2), `${biome} ${JSON.stringify(n)}`);
  }
});

test("trees: one birch grove a tile at most, none stacked in another's crown", () => {
  const kit = { trees: ["BIN_FOL_Grassland_Trees_SM", "BIN_FOL_Grassland_Trees_LG", "FOL_Birch_Tall_Grove_A"] };
  const G = "FOL_Birch_Tall_Grove_A";
  const stand = [[G, 0, 0, 1.8, 0], [G, 0.2, 0, 1.5, 0], [G, 0.1, 0.02, 1.5, 0], ["BIN_FOL_Grassland_Trees_SM", 0.3, 0.3, 1, 0], ["BIN_FOL_Grassland_Trees_SM", 0.33, 0.3, 1, 0]];
  const out = spaced(oneGrove(stand, kit));
  assert.equal(out.filter((e) => e[0] === G).length, 1, "one grove");
  assert.ok(out.find((e) => e[0] === G)[3] <= 1.2, "at a modest size");
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(Math.hypot(out[i][1] - out[j][1], out[i][2] - out[j][2]) >= 0.09);
  assert.deepEqual(singles(kit.trees), ["BIN_FOL_Grassland_Trees_SM", "BIN_FOL_Grassland_Trees_LG"]);
});

test("wilderness old growth: a giant for the biomes that have one", () => {
  assert.equal(oldGrowth("BIOME_DESERT"), null);
  assert.ok(oldGrowth("BIOME_GRASSLAND") && oldGrowth("BIOME_TROPICAL"));
});

test("scene: rarer wildlife only in a Wilderness Area, from 16 tiles", () => {
  const hills = (t) => plainLand({ hill: t % 2 === 0 });
  const rare = (level, wild) => [...planScene(allTiles, { land: hills, ring: hexRing, fauna: FAUNA_POOLS, level, wild }).values()].filter((s) => s.rare).length;
  assert.equal(rare(1, true), 0); assert.equal(rare(3, false), 0);
  assert.ok(rare(2, true) > 0 && rare(3, true) >= rare(2, true));
});

test("wildlife: herds grow by one at the 16-tile level and one more at 24", () => {
  const herd = { herd: Object.keys(_testing.SPECIES).find((n) => _testing.SPECIES[n][2] >= 2) };
  for (const t of [3, 40, 77]) {
    const n = (level) => wildlifeFor(t, plainLand({ level }), herd).filter((x) => x.kind === "animal").length;
    assert.equal(n(1), n(0)); assert.equal(n(2), n(0) + 1); assert.equal(n(3), n(0) + 2);
  }
});

test("lookouts: one more tower per level on other hills, never beside another, earlier ones kept", () => {
  const tiles = allTiles.slice(0, 60);
  const hill = (t) => (t % 4 === 1 ? "TERRAIN_HILL" : "TERRAIN_FLAT");
  const at = [0, 1, 2, 3].map((level) => lookoutTiles(tiles, 0, level, hexRing, hill, () => false));
  assert.equal(at[0].length, 1);
  for (let l = 1; l < 4; l++) {
    assert.equal(at[l].length, l + 1, `level ${l}`);
    assert.deepEqual(at[l].slice(0, l), at[l - 1], "a higher level keeps the lower one's towers");
    for (const a of at[l]) for (const b of at[l]) assert.ok(a === b || !hexRing(a).includes(b), "two towers side by side");
  }
  assert.deepEqual(lookoutTiles([1, 2], 0, 3, hexRing, hill, () => false), [], "a park under three tiles has none");
});

test("level sites: a set number per level, a higher level keeps the lower one's, never side by side", () => {
  const tiles = allTiles.slice(15, 39);
  const open = (t) => t % 5 !== 0;
  for (const buildings of [true, false]) {
    const at = [0, 1, 2, 3].map((level) => levelSites(tiles, 15, level, buildings, open, undefined, hexRing));
    assert.equal(at[0].size, 0);
    for (let l = 1; l < 4; l++) {
      assert.equal(at[l].size, l * sitesPerLevel(tiles.length), `level ${l}`);
      for (const [t, k] of at[l - 1]) assert.equal(at[l].get(t), k, "a lower level's site moved");
      for (const t of at[l].keys()) {
        assert.ok(t !== 15 && open(t), "a site on the founding tile or closed land");
        assert.ok(!hexRing(t).some((n) => at[l].has(n)), "two sites side by side");
      }
    }
    const kinds = new Set(at[3].values());
    assert.deepEqual([...kinds].sort(), buildings ? ["camp", "shelter", "village"] : ["thicket"]);
  }
  assert.equal(sitesPerLevel(8), 1); assert.equal(sitesPerLevel(16), 2); assert.equal(sitesPerLevel(24), 2);
});

test("monuments: dispersed over the park, cairns from 8 tiles, the second kind from 16, a higher level keeps the lower's", () => {
  const tiles = allTiles.slice(15, 39);
  const open = (t) => t % 5 !== 0;
  for (const buildings of [true, false]) {
    const at = [0, 1, 2, 3].map((level) => monumentSites(tiles, 15, level, buildings, open, hexRing));
    assert.equal(at[0].size, 0);
    const kinds = (m) => [...m.values()].map((v) => v[0][0]);
    assert.ok(at[1].size > 0 && kinds(at[1]).every((k) => k === "PROP_CairnBase"), "cairns only at the first level");
    const second = buildings ? "NAF_EGY_CityHall_Obelisk" : "ANT_EEU_Monument_Rock_Structure";
    assert.ok(kinds(at[2]).includes(second), `${second} from the second level`);
    for (let l = 1; l < 4; l++) {
      for (const [t, v] of at[l - 1]) assert.deepEqual(at[l].get(t), v, "a lower level's monument moved");
      for (const t of at[l].keys()) {
        assert.ok(t !== 15 && open(t), "on the founding tile or closed land");
        assert.ok(!hexRing(t).some((n) => at[l].has(n)), "two monuments side by side");
      }
    }
    assert.ok(at[3].size > at[2].size, "more at 24 tiles");
  }
  assert.deepEqual(monumentCounts(24, 0), { cairn: 0, second: 0 });
});

test("wildlife: every rigged animal is lifted to stand on the ground, and choices are stable", () => {
  const p = plan(allTiles, () => plainLand());
  for (const t of allTiles) {
    const w = wildlifeFor(t, plainLand(), p.get(t));
    for (const a of w.filter((x) => x.kind === "animal")) assert.ok(a.z > 0 && a.z <= 1, `${a.asset} stands ${a.z} above the ground`);
    assert.deepEqual(w, wildlifeFor(t, plainLand(), p.get(t)));
  }
});

test("wildlife: water gets fish, birds and shore animals only; reef fish by a shore, whales away from it", () => {
  const land = new Set(["Char_Deer", "CHAR_Elk", "Char_Bison_RES", "CHAR_Horse_RES", "CHAR_Camel", "Char_Sheep_RES", "Char_Elephant_African_RES", "CHAR_Fox"]);
  const lake = (t) => plainLand({ water: true, lake: true, shore: 60 });
  const pl = plan(allTiles, lake);
  let fish = 0;
  for (const t of allTiles) {
    const w = wildlifeFor(t, lake(t), pl.get(t));
    for (const x of w) assert.ok(!land.has(x.asset), `${x.asset} on a lake`);
    if (w.some((x) => /Fish/.test(x.asset))) fish++;
  }
  assert.ok(fish > 0.25 * allTiles.length, `fish on ${fish} lake tiles`);
  const sea = (t) => plainLand({ water: true, coast: true, shore: t % 2 ? 120 : null });
  const ps = plan(allTiles, sea);
  let schools = 0, whales = 0;
  for (const t of allTiles) {
    const w = wildlifeFor(t, sea(t), ps.get(t));
    if (w.some((x) => /SwimmingFish_Tuna/.test(x.asset))) schools++;
    if (w.some((x) => /ReefNeedle|Clown/.test(x.asset))) assert.ok(sea(t).shore != null, "reef fish away from a shore");
    if (w.some((x) => x.asset === "VFX_Water_Splash_Whale")) { whales++; assert.equal(sea(t).shore, null, "a whale by the shore"); }
    for (const x of w) assert.equal(x.kind === "animal" ? x.asset : "CHAR_Crab", "CHAR_Crab", "only crabs walk on the sea");
  }
  assert.ok(schools > 0.2 * allTiles.length, `schools on ${schools}`);
  assert.ok(whales >= 1 && whales <= 2, `${whales} whales`);
});

test("wildlife: every biome's species are known", () => {
  for (const [biome, f] of Object.entries(_testing.FAUNA)) for (const [k] of [...f.land, ...f.hill]) assert.ok(_testing.SPECIES[k], `${biome}: ${k}`);
});

import { lensBatches, LENS_COLORS } from "../ui/np-lens.js";

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

test("nothing grows through a building: trees and tufts inside a built piece's room are dropped, the rest kept", () => {
  const list = [["IMP_Camp_BldA", 0, 0, 0.3, 0], ["BIN_FOL_Grassland_Trees_SM", 0.03, 0.02, 1.2, 0], ["BIN_FOL_Grassland_Trees_SM", 0.2, 0, 1.2, 0],
    ["BIN_FOL_Grassland_Groundcover_B", -0.04, 0, 1, 0], ["FEATURE_FOREST", 0, 0, 1, 0], ["PROP_Tent_GEN_Sleeper_Standard_C", 0.2, 0.2, 1.1, 0]];
  const out = keepClear(list).map((p) => `${p[0]}@${p[1]}`);
  assert.deepEqual(out, ["IMP_Camp_BldA@0", "BIN_FOL_Grassland_Trees_SM@0.2", "FEATURE_FOREST@0", "PROP_Tent_GEN_Sleeper_Standard_C@0.2"]);
  assert.equal(solidSpots(list).length, 2);
  const bare = [["BIN_FOL_Grassland_Trees_SM", 0, 0, 1, 0]];
  assert.equal(keepClear(bare), bare, "a tile with nothing built is untouched");
});

test("a cabin village: two loose rows across a trail, cabins and trees taking turns, nothing crowded", () => {
  const rad = (d) => (d * Math.PI) / 180;
  for (let t = 0; t < 400; t++) {
    const side = hash01(t, 5) * 360, away = side + 180;
    const c = { x: Math.cos(rad(away)) * 0.06, y: Math.sin(rad(away)) * 0.06 };
    const pieces = cabinCluster(t, c.x, c.y, side, ["TREE"]);
    const cabins = pieces.filter((p) => p[0] === "IMP_Camp_BldA"), trees = pieces.filter((p) => p[0] === "TREE");
    assert.ok(cabins.length === 3 || cabins.length === 4, `tile ${t}: ${cabins.length} cabins`);
    assert.equal(trees.length, cabins.length, "a tree in every gap");
    assert.ok(pieces.some((p) => /Decal_Path/.test(p[0])), "a trail");
    assert.equal(cabinCluster(t, c.x, c.y, side).filter((p) => p[0] === "TREE").length, 0, "no trees without a kit");
    for (const [, x, y, sc] of cabins) {
      assert.ok(sc >= 0.29 && sc <= 0.34, `scale ${sc}`);
      assert.ok(Math.hypot(x, y) <= 0.27, `tile ${t}: cabin out at ${Math.hypot(x, y)}`);
    }
    for (const tr of trees) for (const cab of cabins) {
      assert.ok(Math.hypot(tr[1] - cab[1], tr[2] - cab[2]) >= 0.08, `tile ${t}: a tree ${Math.hypot(tr[1] - cab[1], tr[2] - cab[2])} from a cabin`);
    }
    for (let i = 0; i < cabins.length; i++) for (let j = i + 1; j < cabins.length; j++) {
      const d = Math.hypot(cabins[i][1] - cabins[j][1], cabins[i][2] - cabins[j][2]);
      assert.ok(d >= 0.1, `tile ${t}: cabins ${d} apart`);
    }
    // Two rows facing each other, not a ring and not one line: some cabins front the opposite way.
    const faces = cabins.map((p) => p[4]);
    assert.ok(Math.max(...faces.map((f) => Math.abs(((f - faces[0]) % 360 + 540) % 360 - 180))) > 120, `tile ${t}: cabins all front one way`);
  }
});
