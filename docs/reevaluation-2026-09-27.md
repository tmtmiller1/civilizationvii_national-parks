# National Parks reevaluation, 2026-09-27

A desk reevaluation of v0.1.0 against the live 1.5.0 install and the compiled gameplay database, ahead of the first
live run on the Tower Bench. v0.1.0 was written against 1.4.1, has never been deployed, and has never loaded in a
game: there is no `national-park` copy in `~/Library/Application Support/Civilization VII/Mods/`, so every "works,
unverified" line in `docs/DESIGN.md` is still unobserved.

The desk findings below name the file each was read from. The live Modern-age game that followed on the bench is
written up in "The live run" at the end, along with the findings it settled.

## Findings

### 1. The visual remap names a type that does not exist (outstanding, blocks the look)

`data/national-park-visual.xml` maps `From=IMPROVEMENT_MING_GREAT_WALL`. That type is not in the 1.5.0 install:
the only great wall improvement is `IMPROVEMENT_HAN_GREAT_WALL` (grep over
`CivilizationVII.app/Contents/Resources/Base/modules`, and the compiled `Debug/gameplay-copy.sqlite` agrees). A
`VisualRemaps` row whose `From` cannot resolve can only be inert, so the one piece of art the mod ships is not
wired to anything. What the improvement draws instead is unknown until it is seen in game.

This is the piece to rebuild, not repair. See "The look, from scratch" below.

### 2. No icon at all (outstanding)

The mod ships no `IconDefinitions` and no `UpdateIcons` action, so the production list has no improvement icon for
the park. The base pattern is `age-modern/data/icons/improvement-icons.xml`, rows of `<ID>` plus
`<Path>blp:impicon_*</Path>`, loaded through `<UpdateIcons>` (not `UpdateDatabase`); see
`age-modern/age-modern.modinfo:1102`. Authoring a new `blp:` texture is out of reach today, so the park should point
at a shipped improvement icon until that changes.

### 3. Docs and player-facing text describe a different mod (outstanding)

`docs/DESIGN.md`, `README.md` and `CHANGELOG.md` all describe `BUILDING_NATIONAL_PARK`, a building cloned from
`BUILDING_CITY_PARK`, rendering the Monument model, "data-only". What ships in `data/national-park.xml` is
`IMPROVEMENT_NATIONAL_PARK`, a rural improvement, remapped (inertly) off the Great Wall, plus a UIScript. The drift
reaches the player: `LOC_MOD_NATIONAL_PARK_DESCRIPTION`, which renders in the Additional Content browser, says
"reuses the City Park's art (retextured) ... Single-player, data-only, reversible. Updated for game version 1.4.1",
and `LOC_REMAP_NATIONAL_PARK` reads "National Park (Monument art)".

### 4. The placement wrap picks the right surface but returns an incomplete verdict (outstanding)

The surface is correct and no longer speculative. `Game.CityOperations.canStart` is what the base production path
queries (`base-standard/ui/build-queue/model-build-queue.js:160`,
`base-standard/ui/production-chooser/production-chooser-helpers.js:738`), and Canals wraps that same method in game
on 1.5.0. So `docs/DESIGN.md`'s worry that the wrap point may be inert is very likely unfounded.

Two gaps remain against the working Canals version:

- `ui/np-placement.js` filters `res.Plots` in place and leaves `Success` and `FailureReasons` as the engine set
  them. When no wonder-adjacent tile qualifies, the chooser can still offer the park and then present an empty tile
  set. Canals returns `Success: plots.length > 0` with `LOC_BUILDING_CONSTRUCT_NO_SUITABLE_LOCATION`
  (`tower_mods/canals/ui/canals.js:568-582`).
- Only `canStart` is wrapped. Canals also wraps `sendRequest`, so a placement request that arrives by another path
  is refused, where the park just doesn't offer it. The park's only backstop is a `ConstructibleBuildCompleted`
  warning after the fact.

The list the chooser builds comes from `canStartQuery`, not `canStart` (`production-chooser-helpers.js:510,512`),
so whether the park appears and grays correctly is a separate live question.

### 5. Terrain rows on an improvement are legitimate (no change needed)

Canals records that a BUILDING with `Constructible_ValidTerrains` rows was unplaceable. That does not carry over:
base improvements do use terrain rows (`IMPROVEMENT_KABAKAS_LAKE`, `IMPROVEMENT_STEPWELL` on `TERRAIN_FLAT`,
`IMPROVEMENT_BANG` on `TERRAIN_NAVIGABLE_RIVER`, all in `age-modern/data/constructibles.xml`), so the park's FLAT +
HILL rows are the normal shape.

### 6. Balance and shape notes (outstanding, low risk)

- `Improvements` has no `OnePerSettlement`; `IMPROVEMENT_OPEN_AIR_MUSEUM` sets it
  (`age-modern/data/constructibles.xml:212`). Without it a settlement can ring one wonder with parks.
- Vanilla `BUILDING_CITY_PARK` already carries `NaturalWonderHappiness`, `MountainHappiness` and `WonderHappiness`
  adjacencies on top of +9 Happiness, but is city-center/urban only. What sets the park apart is that it is rural
  and must border the wonder, which is worth saying in the text.
- `Adjacency_YieldChanges` rows without an `Age` value match base rows that also omit it (`NaturalWonderCulture`,
  `NaturalWonderHappiness`), so the omission is fine.

### 7. The nested `dist/national-park` copy carries the same mod id (watch on deploy)

Copying the mod folder wholesale into `Mods/` would install two copies of `tower-national-park`. That is the
duplicate-id shadow that blanks the screen. Deploy the inner folder only.

## The look, from scratch

The park does not need a remap. It needs a composition, drawn the way Canals draws a canal, and that mechanism works
on 1.5.0: `WorldUI.createModelGroup(name)`, then
`group.addModelAtPlot(asset, { i, j }, offset, { placement: PlacementMode.TERRAIN, followTerrain: true,
needsShadows: true, scale, angle })`, one group per plot, kept for the session, redrawn on load and at the start of
each turn, cleared and destroyed on teardown (`tower_mods/canals/ui/canals.js:402-434`).

The asset catalog was rebuilt from this install with `tools/civ7_blp_inspect.py --catalog`: 158,149 entries,
29,565 cooked asset names, 951 of them `IMP_`, zero name-hash or size mismatches. Candidate pieces for a park:

| Purpose | Shipped assets |
| --- | --- |
| Enclosure and entrance | `NAM_SWN_Menagerie_Fence`, `_Fence_Arch`, `_Fence_Back`, `NAM_SWN_Menagerie_Sign` |
| Warden's hut | `NAM_SWN_Menagerie_SideShed`, `PAC_MAJ_Pura_Cabin_HB` |
| Animals | `BIN_Menagerie_Animals` (and `_COLD` / `_HOT`), `Menagerie_Animals_DEER` / `_FOX` / `_GOAT` / `_LLAMA`, `All_Bison01`, `Char_Deer` |
| Old growth | `IMP_Grove`, `BIN_FOL_Grassland_Trees_LG`, `FOL_Birch_Tall_Grove_A`, `BIN_FOL_*_Shrubs` |
| Paths and ground | `ANT_Decal_Path_A_Dirt_CurvedSM`, `ANT_Decal_Path_A_Mud_Straight`, `NAM_SWN_Menagerie_TER_Decal` |
| Visitors | `IMP_Campfire`, `All_IP_Prop_Bench_Fur01`, `BIN_Formal_Garden` |

One difference from Canals matters. Canals retypes its tile to coast, so the engine's own land mesh is what the
script overlay has to cover. The park changes no terrain, so the engine keeps drawing whatever the improvement
itself draws, and a composition would have to sit on top of it. Whether the improvement's own art can be suppressed
(a remap onto an empty or decal-only asset, or an improvement whose mesh is small enough to absorb) is the first
thing to settle, because the whole look depends on the answer.

## What to run, and in what order

The bench makes v0.1.0's never-run Phase 0 cheap. Proposed order, each step a disproof and not a build:

1. Does it load at all? Install the inner `national-park` folder, start a Modern-age game, then
   `sql "select * from Constructibles where ConstructibleType='IMPROVEMENT_NATIONAL_PARK'"` and `logs` for the
   database and text actions. Disproof: the row is absent or `Database.log` rejects it.
2. Is the gate live? `eval 'globalThis.__towerNationalPark.status()'`. Disproof: `hooks: 0`.
3. Does the art resolve? Build or script-place one park beside a natural wonder and look at the tile. Disproof
   for finding 1: it draws a wall anyway.
4. Can a script group draw over it? `eval` a `WorldUI` model group of two or three candidate assets on that
   plot and look. Disproof: nothing appears, or the improvement's own mesh wins.
5. Only then compose a look, audition the kit above a few assets at a time, and photograph each.

`lab start --age AGE_MODERN` is the hands-free route to step 1, but the lab has only ever started an Antiquity
game, so the Modern start is itself unverified.

## The live run

A Modern-age lab game on the Tower Bench, 2026-09-27, Civilization VII 1.5.0: `lab start --seed 4242 --age
AGE_MODERN`, the mod installed as `Mods/national-park`, 72 other mods enabled (three of them dev probes, which the
bench warned about). The bench restored every backed-up file at `lab stop`; the only registry change was the mod's
own new row. The dev copy was removed from `Mods/` afterward, so nothing of this run loads into a campaign.

`lab start --age AGE_MODERN` works. Until now the lab had only started an Antiquity game.

The mod loads and its data compiles. The registry shows `tower-national-park` enabled and live at
`Mods/national-park`; `IMPROVEMENT_NATIONAL_PARK` is in the Modern gameplay database as an `IMPROVEMENT`, `AGE_MODERN`,
cost 400, and `Database.log` passed foreign-key validation with no complaint about the mod.

Finding 2 holds in the database itself: the compiled `Improvements` row has `Icon` `null`.

Finding 4's first half is settled, and the worry in `docs/DESIGN.md` was unfounded. The gate attaches:
`globalThis.__towerNationalPark.status()` returned `{ on: true, naturalWonders: 22, hooks: 2 }`. With a natural
wonder placed beside the city, the engine offered 7 plots with the gate stopped and exactly 1 with it running (the
wonder-adjacent tile), and stopping and restarting the gate moved the count 1 → 7 → 1. The wrap point is right and
`BuildingPlacementManager` is not needed.

Finding 4's second half came out as predicted. With the wonder removed and no tile qualifying, `canStart` returned
`Success: true`, zero plots and `FailureReasons: null`, the dead-end verdict. This is the shape Canals had to
correct.

The park draws nothing. Purchased for 1,600 gold onto the offered tile, the improvement reads back complete, and
the tile pays `YIELD_HAPPINESS 11`, `YIELD_CULTURE 8`, so the adjacency reward is live and generous. The tile itself
is bare grass: no mesh, no placeholder. The art is not just remapped to the wrong model; there is no model, which
is what finding 1 predicted and is why the look has to be built from nothing.

A script model group draws on that tile. `WorldUI.createModelGroup` plus `addModelAtPlot` with
`PlacementMode.TERRAIN` placed five assets on the completed park's plot and every call returned a handle. On screen,
`BIN_Menagerie_Animals` drew a llama and a goat at a convincing scale, and the fence, arch and sign pieces drew a
small wooden structure. `IMP_Grove` drew a large untextured white mesh (no material on this draw path), so it is
unusable as it stands. The composition route is open: the park needs no terrain retype for a script overlay to
show, which was the one real unknown in copying the Canals approach.

Captured frames for this run are in the session scratchpad, not the repo.

## Direction for the look

Decided 2026-09-27: the park's dressing should follow the land and not be one fixed kit. That means a fenced reserve
with wardens and grazing animals where that reads, protected old growth where the tile is wooded, and something
suited to mountain, desert or shoreline where it is not. The wonder being guarded is the other input. So the
composition picks its pieces from the plot's terrain, biome and feature, and from the adjacent wonder, the way
Canals picks its dressing per age and per shore.

## Resolved in v0.2.0 (same day)

Built and run in two further lab games; see `DESIGN.md`, "Verification". Findings 1 and 2: the dead remap is
gone and the park is drawn by script; the park and project have icon rows (not yet seen in the production list).
Finding 3: the docs and in-game text now describe the mod that ships. Finding 4: an empty placement result now says
why, and requests aimed at a refused tile are not sent. Finding 6: `OnePerSettlement` is set, and a settlement grows
its one park instead. The look follows the land, as decided above, with broken dry-stone walls in place of a
continuous fence.
