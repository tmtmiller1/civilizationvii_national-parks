// np-wildlife.js - National Parks: the park's living animals, birds, insects and fish.
//
// Two kinds of shipped art move on the map, and both were watched moving on 1.5.0 (2026-09-27, frame-difference
// captures):
//   Rigged animals (CHAR_* and Char_*_RES). A WorldUI model group draws them frozen in their bind pose unless
//   the model's state is set to "IDLE", and that only takes once the model has loaded (group.isLoaded() reports
//   true too early). They also sink into the ground under PlacementMode.TERRAIN by an amount that grows with
//   their scale, so each is lifted by 8 + 24 x scale. Static props (All_*) and the resource layout bins
//   (BIN_RES_*) never move.
//   Effects (VFX_Bird_*, VFX_Butterfly_*, VFX_Insect_*, VFX_Fish_Jump) animate on their own: flocks wheel
//   overhead, butterflies flutter, a fish leaps now and then.
//
// Which tiles carry which animals is planned for the whole park (np-scene.js), so neighbors do not repeat; the
// details on a tile are hashed from its plot, so a park keeps the same animals across reloads.
"use strict";

import { hash01 } from "./np-core.js";

/**
 * Rigged species: asset, scale, the largest group it appears in, and how far above the ground it stands. A rigged
 * model is placed at an absolute height, not on the ground as static models are: at one lift the same horse floated
 * on low ground and sank on a hill, and at the ground's height plus a constant it stood on both (2026-10-03, crash soak
 * npz10, npz11, flat tile and hill in one frame). So an animal is set at the ground's height under it (np-draw.js reads
 * it) plus this. In pre-release builds every animal was lifted 8 + 24 x scale from zero, which floated them on low ground (the fox
 * on a shore, camels on a cliff's lip) and buried them on hills.
 */
const SPECIES = {
  deer: ["Char_Deer", 0.42, 4, 1],
  elk: ["CHAR_Elk", 0.45, 3, 1],
  bison: ["Char_Bison_RES", 0.4, 5, 1],
  horse: ["CHAR_Horse_RES", 0.4, 4, 1],
  fox: ["CHAR_Fox", 0.5, 2, 1],
  camel: ["CHAR_Camel", 0.4, 3, 1],
  llama: ["CHAR_Llama_RES", 0.42, 3, 1],
  sheep: ["Char_Sheep_RES", 0.45, 4, 1],
  elephant: ["Char_Elephant_African_RES", 0.32, 3, 1],
  crane: ["CHAR_Eurasian_Crane", 0.5, 3, 0.5],
  crab: ["CHAR_Crab", 0.15, 3, 0.5],   // at 0.45 a crab stood as tall as a house (showcase nsh1)
  // Rarer species, only in a Wilderness Area from 16 tiles (np-scene.js `rare`). Rigged as the deer is (catalog,
  // 2026-10-04): scales are first guesses to watch.
  goat: ["Char_Goat", 0.42, 3, 1],
  giraffe: ["Char_Giraffe01", 0.4, 3, 1],
  turtle: ["CHAR_Turtle", 0.3, 2, 0.5],
};
/** The rarer species a Wilderness Area gains from 16 tiles, by the land: goats on hills, giraffes on open tropical
 *  and plains land, turtles on a shore. */
export function rareFor(f) {
  if (f.shore != null && (f.lake || f.coast || f.river)) return ["turtle"];
  if (f.hill || f.mountain) return ["goat"];
  if (f.biome === "BIOME_TROPICAL" || f.biome === "BIOME_PLAINS") return ["giraffe"];
  return [];
}

/** How far above the ground under it species `name` stands. */
export function liftFor(name) {
  const sp = SPECIES[name];
  return sp ? sp[3] : 0;
}

/** Per biome: weighted species for open land, for hills, and the birds and insects overhead. */
const FAUNA = {
  BIOME_GRASSLAND: { land: [["deer", 4], ["horse", 2], ["elk", 1], ["fox", 2]], hill: [["sheep", 3], ["deer", 2], ["fox", 1]],
    air: ["VFX_Bird_Sparrow ", "VFX_Bird_Dove_B", "VFX_Butterfly_C_Loop", "VFX_Butterfly_Golden_B"] },
  BIOME_PLAINS: { land: [["bison", 4], ["horse", 3], ["deer", 2], ["fox", 1]], hill: [["sheep", 2], ["bison", 1], ["llama", 1]],
    air: ["VFX_Bird_Sparrow ", "VFX_Bird_DarkRange_A", "VFX_Insect_Flies_01", "VFX_Butterfly_C"] },
  BIOME_DESERT: { land: [["camel", 4], ["fox", 2]], hill: [["camel", 2], ["llama", 1]],
    air: ["VFX_Bird_DarkRange_A", "VFX_Bird_Raven_A"] },
  BIOME_TUNDRA: { land: [["elk", 4], ["deer", 2], ["fox", 2]], hill: [["elk", 2], ["sheep", 2]],
    air: ["VFX_Bird_Raven_A", "VFX_Bird_DarkRange_A"] },
  BIOME_TROPICAL: { land: [["deer", 3], ["elephant", 2], ["crane", 1]], hill: [["deer", 2], ["elephant", 1]],
    air: ["VFX_Bird_Parrot_A", "VFX_Butterfly_Golden_B", "VFX_Butterfly_C_Loop"] },
};
const DEFAULT_FAUNA = FAUNA.BIOME_GRASSLAND;
const COAST_AIR = ["VFX_Bird_SeaGull_A", "VFX_Bird_SeaGull_C"];
const FISH = "VFX_Fish_Jump";
/** Sea life drawn by effects (auditioned 2026-09-29; VFX_Water_Whale_Spout draws nothing, the seaweed and surf effects
 *  do not show at map zoom). */
const SEA_SCHOOLS = ["VFX_SwimmingFish_Tuna02", "VFX_SwimmingFish_Tuna03"];
const REEF_FISH = ["VFX_SwimmingFish_ReefNeedle", "VFX_SwimingFish_Clown"];
const LAKE_FISH = "VFX_SwimmingFish_Lake";
const WHALE = "VFX_Water_Splash_Whale";

/** The pools np-scene.js plans a park's wildlife from. */
export const FAUNA_POOLS = {
  biomes: { ...FAUNA, default: DEFAULT_FAUNA },
  coastAir: COAST_AIR,
  schools: SEA_SCHOOLS,
  reef: REEF_FISH,
  whale: WHALE,
  lakeFish: LAKE_FISH,
  leap: FISH,
};

/**
 * What lives on one tile: [{ kind: "animal" | "vfx", asset, dx, dy, z, scale, angle }]. `land` describes the tile:
 * { biome, water, lake, river, coast, hill, mountain, wonder, wooded, anchor, shore, level } where `shore` is the ring
 * direction (degrees) of a land neighbor for a water tile, or null. `slot` is the tile's entry in the park's plan
 * (np-scene.js): which herd, flock, fish or shore animal it carries, if any. Where on the tile, how many, and at
 * what size and heading come from the tile's own hash. Pure, so it can be tested without the engine.
 */
export function wildlifeFor(t, land, slot = {}) {
  const h = (salt) => hash01(t, 200 + salt);
  const jit = (salt, r) => (h(salt) - 0.5) * r;
  const out = [];
  const vfx = (asset, dx, dy) => out.push({ kind: "vfx", asset, dx, dy, z: 0 });
  const animal = (name, dx, dy, k) => {
    const [asset, scale] = SPECIES[name];
    const s = scale * (0.85 + h(40 + k) * 0.3);
    out.push({ kind: "animal", asset, dx, dy, z: liftFor(name), scale: s, angle: Math.floor(h(50 + k) * 360) });
  };
  const group = (name, max, cx, cy, extra = 0) => {
    const n = 1 + Math.floor(h(2) * h(3) * max) + extra;   // mostly singles and pairs, the odd larger group
    const spread = 0.05 + h(33) * 0.08;
    for (let k = 0; k < n; k++) {
      const a = h(10 + k) * Math.PI * 2, r = k === 0 ? 0 : spread + h(20 + k) * 0.08;
      animal(name, cx + Math.cos(a) * r, cy + Math.sin(a) * r, k);
    }
  };
  const shoreAt = (r) => {
    const a = (land.shore + (h(34) - 0.5) * 50) * Math.PI / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  if (slot.air) vfx(slot.air, jit(35, 0.35), jit(36, 0.35));
  if (slot.school) vfx(slot.school, jit(26, 0.35), jit(27, 0.35));
  if (slot.reef && land.shore != null) vfx(slot.reef, ...shoreAt(0.18 + h(29) * 0.1));
  if (slot.whale) vfx(slot.whale, jit(31, 0.25), jit(32, 0.25));
  if (slot.lakeFish) vfx(slot.lakeFish, jit(22, 0.35), jit(23, 0.35));
  if (slot.leap) vfx(slot.leap, jit(3, 0.35), jit(4, 0.35));
  if (slot.wader && land.shore != null) group(slot.wader, 2, ...shoreAt(0.3 + h(37) * 0.08));
  if (slot.climber) group(slot.climber, 2, jit(38, 0.25), jit(39, 0.25));
  if (slot.herd) {
    const off = land.anchor ? [-0.05, 0.2] : [jit(11, 0.35), jit(12, 0.35)];
    // A herd grows by one at the 16-tile level and one more at 24 (land.level, np-core.js milestoneLevel).
    group(slot.herd, land.anchor ? 2 : SPECIES[slot.herd][2], off[0], off[1], Math.max(0, (land.level || 0) - 1));
  }
  // A second, different kind now and then: a fox at the edge of a herd, a crane in the grass.
  if (slot.stray) animal(slot.stray, jit(16, 0.5), jit(17, 0.5), 9);
  // A rarer species (a Wilderness Area from 16 tiles): a small group of its own, on the shore for a turtle.
  if (slot.rare) group(slot.rare, SPECIES[slot.rare][2], ...(slot.rare === "turtle" && land.shore != null ? shoreAt(0.3) : [jit(18, 0.4), jit(19, 0.4)]));
  return out;
}

export const _testing = { SPECIES, FAUNA };
