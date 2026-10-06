import test from "node:test";
import assert from "node:assert/strict";

import { hash01 } from "../ui/np-core.js";
import { parkPlan, describePlan, budgetsFor, GROVES, TRAIL, GRAVEL, WAYMARK, CABIN, CAMP_TENT, CAMP_FIRE, SHELTER, LOOKOUT, CAIRN_MOUND, OBELISK, DOLMEN, SIGN } from "../ui/np-plan.js";

// A generated land on a hex sheet 40 wide: drifts of lake, mountain, hill, woods and wetland three tiles across, minor
// rivers here and there. Stands in for the map, as the audit that caught the pond defect did.
const W = 40;
const ring = (p) => [p + 1, p + W, p + W - 1, p - 1, p - W, p - W + 1];
const BIOMES = ["BIOME_GRASSLAND", "BIOME_PLAINS", "BIOME_DESERT", "BIOME_TUNDRA", "BIOME_TROPICAL"];
function world(seed, biome = BIOMES[seed % BIOMES.length]) {
  const kind = (t) => {
    const v = hash01(Math.floor(t / W / 3) * 50 + Math.floor((t % W) / 3) + seed * 977, 1);
    return v < 0.1 ? "lake" : v < 0.17 ? "mountain" : v < 0.37 ? "hill" : v < 0.57 ? "wood" : v < 0.62 ? "wet" : "open";
  };
  const feature = (t) => (kind(t) === "wood" ? (biome === "BIOME_DESERT" ? "FEATURE_SAGEBRUSH_STEPPE" : "FEATURE_FOREST") : kind(t) === "wet" ? "FEATURE_POND" : "");
  return { ring, kind, biome: () => biome, feature, model: (t) => (kind(t) === "wood" ? feature(t) : ""),
    hill: (t) => kind(t) === "hill", sea: () => false, lake: (t) => kind(t) === "lake", nav: () => false,
    river: (t) => (kind(t) === "open" || kind(t) === "hill") && hash01(t + seed, 9) < 0.15,
    mountain: (t) => kind(t) === "mountain", wonder: () => false, wooded: (t) => kind(t) === "wood" && biome !== "BIOME_DESERT",
    wet: (t) => kind(t) === "wet", resource: (t) => (hash01(t + seed * 31, 17) < 0.07 ? (t % 2 ? "RESOURCE_GOLD" : "RESOURCE_SALT") : ""),
    cliff: (t) => kind(t) !== "lake" && hash01(t + seed * 13, 19) < 0.12 };
}
/** A park grown tile by tile from its founding tile, as the game grows one. */
function grown(seed, n, map) {
  let anchor = 20 * W + 20;
  while (map.kind(anchor) !== "open") anchor++;
  const tiles = [anchor];
  while (tiles.length < n) {
    const edge = [...new Set(tiles.flatMap(ring))].filter((t) => !tiles.includes(t)).sort((a, b) => hash01(a, seed + 5) - hash01(b, seed + 5));
    tiles.push(edge[0]);
  }
  return { tiles, anchor };
}
const plans = [];
for (let seed = 1; seed <= 30; seed++) for (const buildings of [true, false]) for (const [n, level] of [[5, 0], [9, 1], [17, 2], [24, 3]]) {
  const map = world(seed), { tiles, anchor } = grown(seed, n, map);
  plans.push({ seed, map, tiles, anchor, plan: parkPlan(tiles, anchor, { level, buildings, map }) });
}
const isTree = (a) => /^BIN_FOL_.*(Trees|Cluster)|^FOL_(Birch|Plains_Cluster|Coastal|HB_Flower)|Elm_Tree|Urban_Tree/.test(a);
const BUILT = new Set([CABIN, CAMP_TENT, CAMP_FIRE, SHELTER, LOOKOUT, CAIRN_MOUND, OBELISK, DOLMEN, SIGN]);
const SITED = new Set([CABIN, CAMP_TENT, SHELTER, CAIRN_MOUND, OBELISK, DOLMEN]);
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Every piece of a plan in park coordinates: [asset, x, y, scale, tile]. */
function world2(plan) {
  const out = [];
  for (const [t, list] of plan.pieces) for (const e of list) out.push([e[0], e[1] + plan.pos.get(t)[0], e[2] + plan.pos.get(t)[1], e[3], t]);
  return out;
}

test("plan: no invariant is broken in any generated park", () => {
  let built = 0, trees = 0, animals = 0, resources = 0;
  for (const { plan, seed } of plans) {
    const tag = `seed ${seed} n ${plan.tiles.length} ${plan.buildings ? "park" : "wild"}`;
    const all = world2(plan), F = (t) => plan.facts.get(t);
    const { rooms, openings, grounds, corridor } = plan.keepOut;
    for (const [asset, x, y, , t] of all) {
      assert.ok(Math.hypot(x - plan.pos.get(t)[0], y - plan.pos.get(t)[1]) < 0.58, `${tag}: a piece off its tile`);
      if (BUILT.has(asset)) {
        built++;
        const f = F(t);
        assert.ok(f.walk && !f.wet, `${tag}: ${asset} on water, a mountain or wetland (tile ${t})`);
        if (t !== plan.anchor) assert.ok(plan.fields.river([x, y]) >= 0.14 - 1e-9, `${tag}: ${asset} built in a river`);
        if (!plan.buildings) assert.ok(asset === CAIRN_MOUND || asset === DOLMEN, `${tag}: ${asset} in a Wilderness Area`);
      }
      // Beside a river, never on it: its course runs from the tile's middle to each edge shared with more river.
      if (asset === TRAIL || asset === GRAVEL) assert.ok(plan.fields.river([x, y]) >= 0.1 - 1e-9, `${tag}: ${asset} over a river`);
      // Reeds and lily pads are water plants and may stand in it.
      if (/^(BIN_FOL_|FOL_)/.test(asset) && !/Cattail|LilyPad/.test(asset) && t !== plan.anchor) assert.ok(plan.fields.river([x, y]) >= 0.12 - 1e-9, `${tag}: ${asset} in a river`);
      if (isTree(asset)) {
        trees++;
        const p = [x, y];
        for (const [rx, ry, r] of rooms) assert.ok(D(p, [rx, ry]) >= r, `${tag}: a tree in a built piece's room`);
        for (const [ox, oy, r] of openings) assert.ok(D(p, [ox, oy]) >= r, `${tag}: a tree in an opening`);
        assert.ok(plan.fields.path(p) >= corridor, `${tag}: a tree on a footpath`);
        if (plan.buildings && t === plan.anchor) assert.ok(y >= 0.2 || Math.abs(x) >= 0.38, `${tag}: a tree between the lodge and the viewer`);
      }
    }
    const cover = all.filter((e) => isTree(e[0])).map((e) => [e[1], e[2], (GROVES.has(e[0]) ? 0.09 : /^BIN/.test(e[0]) ? 0.1 : 0.055) * e[3]]);
    for (const [t, list] of plan.wild) {
      const here = list.filter((w) => w.kind === "animal" && F(t).walk && !F(t).mountain);
      for (const w of here) assert.ok(plan.fields.river([w.dx + plan.pos.get(t)[0], w.dy + plan.pos.get(t)[1]]) >= 0.1 - 1e-9, `${tag}: an animal in a river`);
      here.forEach((w, k) => {
        animals++;
        const p = [w.dx + plan.pos.get(t)[0], w.dy + plan.pos.get(t)[1]];
        for (const [gx, gy, r] of grounds) assert.ok(D(p, [gx, gy]) >= r, `${tag}: an animal on people's ground`);
        for (const [rx, ry, r] of rooms) assert.ok(D(p, [rx, ry]) >= r, `${tag}: an animal in a building`);
        for (const [cx, cy, r] of cover) assert.ok(D(p, [cx, cy]) >= r - 1e-9, `${tag}: an animal in a tree`);
        assert.ok(plan.fields.path(p) >= corridor, `${tag}: an animal on a footpath`);
        here.slice(0, k).forEach((o) => assert.ok(Math.hypot(o.dx - w.dx, o.dy - w.dy) >= 0.07 - 1e-9, `${tag}: two animals in one spot`));
      });
    }
    // A tile with a resource is left as the game draws it (the founding tile keeps its station).
    for (const t of plan.tiles) if (plan.facts.get(t).resource) {
      resources++;
      for (const e of plan.pieces.get(t)) assert.match(e[0], /^(FEATURE_|RESOURCE_)/, `${tag}: ${e[0]} drawn on resource tile ${t}`);
      if (plan.facts.get(t).resourceType === "RESOURCE_GOLD") assert.ok(plan.pieces.get(t).some((e) => e[0] === "RESOURCE_GOLD"), `${tag}: the resource's own model is missing`);
      if (plan.facts.get(t).resourceType === "RESOURCE_SALT") assert.equal(plan.pieces.get(t).length, 0, `${tag}: something drawn on a strewn resource's tile`);
      assert.equal(plan.wild.get(t).length, 0, `${tag}: wildlife on resource tile ${t}`);
    }
    for (const t of plan.focal.keys()) for (const n of ring(t)) assert.ok(n === plan.anchor || t === plan.anchor || !plan.focal.has(n), `${tag}: two focal things side by side`);
  }
  assert.ok(resources > 100, `only ${resources} resource tiles seen`);
  assert.ok(built > 500 && trees > 5000 && animals > 300, `too little drawn to judge: ${built} built, ${trees} trees, ${animals} animals`);
});

test("plan: the footpaths are one graph from the lodge, and every one ends at a destination", () => {
  let paths = 0;
  for (const { plan } of plans) {
    if (!plan.buildings) { assert.equal(plan.paths.length, 0, "a Wilderness Area has no footpaths"); continue; }
    for (const p of plan.paths) {
      paths++;
      const d = plan.destinations.find((x) => x.id === p.to);
      assert.equal(p.tiles[0], plan.anchor, "a path starts at the founding tile");
      assert.equal(p.tiles[p.tiles.length - 1], d.tile, "a path ends on its destination's tile");
      for (let k = 1; k < p.tiles.length; k++) assert.ok(ring(p.tiles[k - 1]).includes(p.tiles[k]), "a path jumps a tile");
      assert.ok(D(p.line[p.line.length - 1], d.at) < 0.25, "a path stops short of what it leads to");
      for (const t of p.tiles) { const f = plan.facts.get(t); assert.ok(f.walk && !f.wet, "a path over water or wetland"); }
    }
    // Every stretch can be reached from the lodge's door along other stretches.
    const key = (p) => p[0].toFixed(4) + "," + p[1].toFixed(4);
    const reach = new Set([key(plan.paths.length ? plan.paths[0].line[0] : [0, 0])]);
    for (let grew = true; grew;) { grew = false; for (const [a, b] of plan.segments) for (const [x, y] of [[a, b], [b, a]]) if (reach.has(key(x)) && !reach.has(key(y))) { reach.add(key(y)); grew = true; } }
    for (const [a, b, k] of plan.segments) if (k[0] !== "v") assert.ok(reach.has(key(a)) && reach.has(key(b)), `a stretch of path joined to nothing (${k})`);
    for (const d of plan.destinations) if (d.from) assert.ok(plan.paths.some((p) => p.to === d.id), `no path to the ${d.kind}`);
  }
  assert.ok(paths > 100, `only ${paths} paths`);
});

test("plan: the same park always plans the same, and a higher level keeps what a lower one had", () => {
  for (const { seed, map } of plans.filter((p, k) => k % 8 === 3)) {
    const { tiles, anchor } = grown(seed, 24, map);
    const at = (level) => parkPlan(tiles, anchor, { level, buildings: true, map });
    assert.deepEqual([...at(3).pieces], [...at(3).pieces], "not stable");
    for (let level = 0; level < 3; level++) {
      const low = at(level).destinations, high = at(level + 1).destinations;
      // The water's edge is where a path meets the shore until something is built there; it is not a level's gain.
      for (const d of low.filter((x) => x.kind !== "shore")) assert.ok(high.some((h) => h.kind === d.kind && h.tile === d.tile), `seed ${seed}: level ${level + 1} lost the ${d.kind} of level ${level}`);
    }
  }
});

test("plan: adding a far tile or a monument leaves the rest of the park as it was", () => {
  let compared = 0;
  const sorted = (list) => list.map(String).sort();
  const far = (plan, t, sites) => sites.every((s) => D(plan.pos.get(t), s) > 2.6);
  const sitesOf = (a, b) => {
    const out = [], ids = (p) => new Map([...p.destinations.map((d) => ["d" + d.kind + d.tile, d.at]), ...p.herds.map((h) => ["h" + h.tile, h.at]),
      ...p.patches.map((x) => ["p" + x.id, x.at])]);
    const A = ids(a), B = ids(b);
    for (const [k, v] of A) if (!B.has(k)) out.push(v);
    for (const [k, v] of B) if (!A.has(k)) out.push(v);
    const segs = (p) => new Map(p.segments.map(([x, y, k]) => [k, [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2]]));
    const SA = segs(a), SB = segs(b);
    for (const [k, v] of SA) if (!SB.has(k)) out.push(v);
    for (const [k, v] of SB) if (!SA.has(k)) out.push(v);
    return out;
  };
  for (let seed = 1; seed <= 20; seed++) for (const buildings of [true, false]) {
    const map = world(seed), { tiles, anchor } = grown(seed, 23, map);
    const base = parkPlan(tiles, anchor, { level: 2, buildings, map });
    // One more tile on the park's edge.
    const more = grown(seed, 24, map).tiles;
    const added = more[23];
    const grownPlan = parkPlan(more, anchor, { level: 2, buildings, map });
    const changed = [grownPlan.pos.get(added), ...sitesOf(base, grownPlan)];
    for (const t of tiles) if (far(base, t, changed)) { compared++; assert.deepEqual(sorted(grownPlan.pieces.get(t)), sorted(base.pieces.get(t)), `seed ${seed}: tile ${t} changed when ${added} joined`); }
    // One more level: a structure and a monument are added.
    const up = parkPlan(tiles, anchor, { level: 3, buildings: true, map }), was = parkPlan(tiles, anchor, { level: 2, buildings: true, map });
    const moved = sitesOf(was, up);
    for (const t of tiles) if (far(was, t, moved)) { compared++; assert.deepEqual(sorted(up.pieces.get(t)), sorted(was.pieces.get(t)), `seed ${seed}: tile ${t} changed with the level`); }
  }
  assert.ok(compared > 150, `only ${compared} tiles compared`);
});

test("plan: tree density runs on across tile edges, and stands straddle them", () => {
  let straddling = 0, stands = 0;
  for (const { plan } of plans.filter((p) => p.tiles.length === 24)) {
    for (const t of plan.tiles) ring(t).forEach((n) => {
      if (!plan.pos.has(n) || !plan.tiles.includes(n)) return;
      const a = plan.pos.get(t), b = plan.pos.get(n), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ux = (b[0] - a[0]) * 0.02, uy = (b[1] - a[1]) * 0.02;
      const d1 = plan.fields.density([mid[0] - ux, mid[1] - uy], 0.3), d2 = plan.fields.density([mid[0] + ux, mid[1] + uy], 0.3);
      assert.ok(Math.abs(d1 - d2) < 0.08, `density steps by ${Math.abs(d1 - d2).toFixed(2)} at the edge of ${t} and ${n}`);
    });
    for (const s of plan.stands) { stands++; if (plan.tiles.some((t) => { const d = D(plan.pos.get(t), s.at); return d > 0.45 && d < 0.55; })) straddling++; }
  }
  assert.ok(stands > 100 && straddling / stands > 0.2, `${straddling} of ${stands} stands grow from a shared edge`);
});

test("plan: budgets hold, and a 24-tile park does not carry twice what a 12-tile park does", () => {
  for (const { plan } of plans) {
    const count = (k) => plan.destinations.filter((d) => k.includes(d.kind)).length;
    assert.ok(count(["camp", "village", "shelter"]) <= plan.budgets.structures);
    assert.ok(count(["lookout"]) <= plan.budgets.lookouts);
    assert.ok(count(["cairn", "second"]) <= plan.budgets.monuments);
    assert.ok(plan.herds.length <= plan.budgets.herds);
  }
  for (const buildings of [true, false]) for (let level = 0; level <= 3; level++) {
    const a = budgetsFor(12, level, buildings), b = budgetsFor(24, level, buildings);
    for (const k of Object.keys(a)) assert.ok(b[k] < 2 * a[k] || a[k] === 0 && b[k] === 0 || b[k] <= a[k] + 1, `${k}: ${a[k]} at 12 tiles, ${b[k]} at 24`);
  }
  // Drawn, too: what is added to the land (built pieces and animals) at 24 tiles against the same park at 12.
  let small = 0, large = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const map = world(seed), added = (n) => {
      const { tiles, anchor } = grown(seed, n, map), plan = parkPlan(tiles, anchor, { level: 2, buildings: true, map });
      return world2(plan).filter((e) => BUILT.has(e[0])).length + [...plan.wild.values()].flat().length;
    };
    small += added(12); large += added(24);
  }
  assert.ok(large < 2 * small, `${small} added pieces at 12 tiles, ${large} at 24`);
});

test("plan: a Wilderness Area builds nothing, and its third level swaps trees for giants without adding any", () => {
  let n2 = 0, n3 = 0, giants = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const map = world(seed), { tiles, anchor } = grown(seed, 24, map);
    const at = (level) => world2(parkPlan(tiles, anchor, { level, buildings: false, map }));
    const l2 = at(2), l3 = at(3);
    assert.ok(!l3.some((e) => [CABIN, CAMP_TENT, CAMP_FIRE, SHELTER, LOOKOUT, OBELISK, WAYMARK, SIGN, GRAVEL].includes(e[0])), `seed ${seed}: something built in a Wilderness Area`);
    n2 += l2.filter((e) => isTree(e[0])).length; n3 += l3.filter((e) => isTree(e[0])).length;
    giants += l3.filter((e) => /Redwood|HB_Flower_Tree/.test(e[0])).length;
    assert.ok(!l2.some((e) => /Redwood|HB_Flower_Tree/.test(e[0])), "a giant below 24 tiles");
  }
  // A level's monument can move a herd and with it a stand, so parks are counted together.
  assert.ok(giants > 10 && n3 <= n2 * 1.03, `${n2} trees at level 2, ${n3} at level 3, ${giants} giants`);
});

test("plan: it can be printed", () => {
  const text = describePlan(plans[7].plan);
  assert.match(text, /park of 24 tiles/);
  assert.match(text, /region \d+/);
});
