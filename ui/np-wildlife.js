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
// Which animals a park carries, and where each stands, is planned for the whole park (np-plan.js): a region has one
// herd animal and one bird, and a herd keeps to open ground the plan reserved for it.
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
// Scales are set against the park's buildings (np-plan.js), from the models' own heights (asset catalog, 2026-10-04).
// At the first scales (0.4 to 0.5) an elk stood three times the height of a village cabin; at two and a half times
// true size (0.2 to 0.3) the animals were lost at map zoom beside the game's own (watched 2026-10-05, cap57-plan1).
// They stand between the two, about four times true size.
const SPECIES = {
  deer: ["Char_Deer", 0.3, 4, 1],
  elk: ["CHAR_Elk", 0.33, 3, 1],
  bison: ["Char_Bison_RES", 0.32, 5, 1],
  horse: ["CHAR_Horse_RES", 0.32, 4, 1],
  fox: ["CHAR_Fox", 0.45, 2, 1],
  camel: ["CHAR_Camel", 0.39, 3, 1],
  llama: ["CHAR_Llama_RES", 0.38, 3, 1],
  sheep: ["Char_Sheep_RES", 0.39, 4, 1],
  elephant: ["Char_Elephant_African_RES", 0.42, 3, 1],
  crane: ["CHAR_Eurasian_Crane", 0.29, 3, 0.5],
  crab: ["CHAR_Crab", 0.15, 3, 0.5],
  // Rarer species, only in a Wilderness Area from 16 tiles (np-plan.js). Rigged as the deer is (catalog,
  // 2026-10-04).
  goat: ["Char_Goat", 0.32, 3, 1],
  giraffe: ["Char_Giraffe01", 0.3, 3, 1],
  turtle: ["CHAR_Turtle", 0.39, 2, 0.5],
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

/** The pools np-plan.js plans a park's wildlife from. */
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
 * One rigged animal of species `name`: { kind, asset, z, scale, angle, max }, its size varied a little by the
 * identity of the group it belongs to (`id`) and its place in it (`k`). Where it stands is the plan's to say
 * (np-plan.js). `max` is the largest group the species appears in.
 */
export function animalAt(name, id, k, heading) {
  const [asset, scale, max] = SPECIES[name];
  return { kind: "animal", asset, z: liftFor(name), scale: scale * (0.85 + hash01(id, 240 + k) * 0.3),
    angle: Math.floor(((heading % 360) + 360) % 360), max };
}

export const _testing = { SPECIES, FAUNA };
