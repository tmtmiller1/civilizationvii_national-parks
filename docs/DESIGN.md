# National Parks: design and decisions

Status: v1.0.0, the first public release (2026-10-04), built and watched in seeded lab games on 1.5.0, 2026-09-27 to
2026-10-04, in the Exploration and Modern Ages. The version numbers below (1.0.0 to 1.2.0 before the release) name
pre-release development builds; the released 1.0.0 is all of them. Screenshots in `docs/screenshots/` date from the
first build and predate the size levels, monuments and shading. What was watched and what was not is listed under
"Verification". The reevaluation that led here is `reevaluation-2026-09-27.md`.

## The idea

A park is founded on an empty, Charming tile a settlement owns and then grows, a few tiles at a time, over the wild land
around it: mountains, forest, lakes, rivers, the sea, natural wonders, open country. The player chooses which land to
protect, every tile pays the city by its appeal, and the park is drawn on the map to suit its land: a green border,
broken stone walls along its land edges, trees, herds, reeds and a warden's station. It carries a name taken from the
places around it.

It comes in two kinds. A **National Park** pays Culture and Happiness and has a warden's lodge, cabins and a lookout.
A **Wilderness Area** is its twin: the same founding rule, growth, picker, protection and names, paid in Influence
instead, and drawn with no houses or shelters, in an ocher border. A settlement may hold one of each. The kinds share
every code path through the `KINDS` table in `ui/np-core.js`; only the data rows, the payout and the dressing differ.

## Ages

Parks exist from the Exploration Age on and come into their own in the Modern Age:

| Age | Civic | Tiles per expansion |
| --- | --- | --- |
| Exploration | Society (mid-tree, cost 1300) | 1 |
| Modern | Natural History (first tier, cost 1600) | 3 |

Each age's database gets the shared data plus its own file (`data/national-parks-exploration.xml`,
`-modern.xml`) carrying the `Types`, `Constructibles`, `Projects` and `ProgressionTreeNodeUnlocks` rows, because a
civic node exists only in its age's database and the per-completion text differs. The per-age file loads first, so
every row the shared files reference exists.

## Pieces

| Piece | Mechanism | File |
| --- | --- | --- |
| Founding tile | `IMPROVEMENT_NATIONAL_PARK` or `IMPROVEMENT_WILDERNESS_AREA`, rural improvements, not buildable (`CityBuildable`/`TownBuildable` false), placed by script on a `DISTRICT_RURAL` | `data/national-parks.xml`, `ui/np-core.js` `foundPark` |
| Founding | `PROJECT_FOUND_NATIONAL_PARK` / `PROJECT_FOUND_WILDERNESS_AREA` (city project) or a Gold row in the purchase list (city or town); a completion records a founding, placed on the empty tile its owner picks; gated through the wrapped `.canStart` (civic, one of each kind, an empty tile) | `data/national-parks-<age>.xml`, `ui/np-main.js`, `ui/np-purchase.js`, `ui/np-picker.js` |
| Growth | `PROJECT_EXPAND_NATIONAL_PARK` / `PROJECT_EXPAND_WILDERNESS_AREA`, repeatable, `CityOnly`, `PrereqConstructible` = the founding improvement, `RequiresUnlock` false; or bought for Gold from the mod; an AI's park saves for and buys one when it pays back | `data/national-parks-*.xml`, `ui/np-main.js` `buyExpansion`, `growAiParks`, `ui/np-core.js` `aiSavingStep` |
| Appeal | the founding gate only: the game's `GameplayMap.getAppeal` against its Charming threshold from `GlobalParameters` | `ui/np-core.js` `charmingAt`, `foundable` |
| Yield per tile | one land marker per kind, `IMPROVEMENT_NATIONAL_PARK_LAND` (+1 Culture +1 Happiness) and `IMPROVEMENT_WILDERNESS_AREA_LAND` (+3 Influence), placed by script on a `DISTRICT_RURAL` (the engine's own improvement on it taken off), the payout as the marker's own `Constructible_YieldChanges` on top of the tile's own yields; `_WILD` markers from 1.2.0 saves are swapped for `_LAND`; `MOD_NP_NO_NATURAL_YIELD` survives as a 0% no-op for 1.1.0 saves | `data/national-parks-land.xml`, `-gameeffects.xml`, `ui/np-core.js` `remark` |
| Size bonus | the land marker's level variants `IMPROVEMENT_NATIONAL_PARK_LAND_8` / `_16` / `_24` (and `IMPROVEMENT_WILDERNESS_AREA_LAND_`), swapped in place on every tile of a park as its own land crosses 8, 16 and 24 tiles | `data/national-parks-land.xml`, `ui/np-core.js` `parkLevel`, `markerFor`, `remark` |
| Choosing land | `INTERFACEMODE_NP_ADD_TILES`, a `ChoosePlotInterfaceMode`: click to select, Confirm, Done or Later; the mod's own OK / Cancel box for a costly tile | `ui/np-picker.js` |
| Buying an expansion | a row in the production panel's purchase list (`Controls.decorate` on `panel-production-chooser`), or a Gold pill on a pill-style replacement panel | `ui/np-purchase.js` |
| Wildlife | rigged animals set to `IDLE`, bird, insect and fish effects, sea life | `ui/np-wildlife.js` |
| Protection | the `canStart` wrap keeps every player's builds and growth off park land; an AI's building beside its city centre may take a park tile, which then leaves the park; the sweep reverts rural improvements and moves a built-over founding tile | `ui/np-core.js` `markTile`, `reconcile`, `moveFounding` |
| The park's record | JSON in the save through `Configuration.editGame().setValue` | `ui/np-core.js` |
| Map writes | each tile's change is a queued sequence (`inSequence`); every step waits until its result reads back (`until`) before the next, a step that does not land is retried at a later sweep (3 tries); markers no park holds are removed at the full scan | `ui/np-core.js` |
| Network games | read-only (`setReadOnly`): no map or save write; parks read from the map each sweep, drawn, shaded and named; Expand and buying refused | `ui/np-core.js`, `ui/np-main.js` |
| The look | `WorldUI` model groups from shipped meshes, a border overlay | `ui/np-draw.js` |
| Names | the adjacent wonder from the map, else places within 2 tiles (Geographic Labels), a river or the settlement | `ui/np-names.js` |
| Renaming | Geographic Labels' Rename Places when it has park support, else the mod's own box | `ui/np-picker.js` `openParkRename` |
| The lens | `np-parks-lens`: a plot overlay of every revealed park tile, green or ocher at 0.3 alpha (0.45 on the founding tile), a lens-panel button, repainted after a park is drawn or cleared | `ui/np-lens.js` |
| Options | Options ▸ Add-ons ▸ National Parks, main menu and game: two checkboxes in the shared Mods category, kept in the `tower-national-park` slice of `modSettings` | `ui/np-options.js`, `ui/np-settings.js` |
| Civilopedia | a National Parks section, and a Parks and Wilderness group under Game Concepts (real-world history, IUCN categories, links, and a pointer to the section), generated with their English by `devtools/gen-pedia.py`; checked by `tests/pedia-pages.test.mjs` | `data/np-civilopedia.xml`, `text/en_us/PediaText.xml` |
| Translation | every displayed string a tag; `tests/i18n.test.mjs` checks use, duplicates and per-language parity | `text/README.md` |
| Redraw on change | a per-park signature of owner, tiles and revealed tiles | `ui/np-draw.js` |

## Rules

- **Founding.** On any empty, Charming flat or hill tile the settlement owns (see "Appeal" below), in any ring (ring 4
  and 5 with Cultural Diffusion): no district, improvement or building on it; a resource or a feature is fine, and the
  resource stays collected. One of each kind per settlement (city or town), once the age's civic is done. A city runs
  Found National Park (or Found Wilderness Area); a city or town buys it for Gold (4 per point of production) from its
  purchase list. Either records a founding (`foundings` in the save's record) and the Choose land prompt opens the
  picker on the settlement's empty, Charming tiles, which alone light up; Confirm places a rural district and the
  founding improvement by script (`foundPark`). An AI founds once a turn with its own Gold (at peace, Gold coming in,
  1.5x the price in hand) where a settlement holds empty land beside a natural wonder, the best such tile at once (every
  tile beside a wonder reads 7 or more, so the gate never refuses it; among the candidates it takes the most appealing).
  The project is hidden until the civic and once the settlement has that kind (or one waiting), grayed when no empty,
  Charming tile is left; refused in network games, where nothing is written. Why not the engine's own placement: it
  offers an improvement only on a tile already carrying a rural district (a farm the park would replace), and never on a
  bare one, even with `CanBuildOnNonDistrict` (offered, never placed), and not on a resource tile without a
  `Constructible_ValidResources` row, which in turn makes it resource-only (watched 2026-10-02; engine-closed.md). Until
  1.2.0 the founding improvement was built directly and narrowed to wonder-adjacent tiles; from 1.2.0 until the appeal
  gate, any empty tile qualified.
- **Appeal.** Appeal is the founding gate and nothing else. A tile's appeal is the game's: the sum of its six
  neighbours' `Terrains.Appeal` and `Features.Appeal` (mountain, coast and navigable river 1; forest, rainforest, taiga,
  savanna woodland and sagebrush steppe 1; a natural wonder 6), the tile's own terrain and feature left out except a
  natural wonder's own 6; open water reads 0. Minor rivers, resources, improvements and districts change nothing, and
  founding a park or adding a tile lowered no tile's appeal, at once or after a turn (watched 2026-10-03, crash soak
  `apl1`: 543 of 546 land tiles fit, the 3 misses wonder tiles; whole-map diffs 0; `engine-closed.md`). The Charming
  threshold is the game's, read from `GlobalParameters` (`APPEAL_FOR_HAPPINESS_TILE_YIELD`, 3 on 1.5.0), never written
  into the code; without it nothing reads as Charming. The number is the one the game's plot tooltip and appeal lens
  show, so the picker names no tier and shows no number: it lights only the tiles that qualify. Appeal never takes land
  out of a park, nor moves a founding tile: a tile whose appeal falls stays, and a founding tile moved off built-over
  land (`moveFounding`) may go to land below Charming; nothing in `reconcile`, `joinable` or `newFoundingTile` reads it.
  Why yields do not follow appeal: the game's appeal favours some biomes, their +1 vegetation being denser. On three
  Play Now maps (`bio9001`, `bio4242`, `bio777`, every tile read) flat and hill land was Charming at 51% in desert, 52%
  plains, 68% grassland, 69% tropical, 77% tundra, and Breathtaking at 15, 10, 22, 20 and 29%. Founding still works
  everywhere (every desert-led player held 8 or more Charming tiles at the start), but appeal-tiered yields would have
  paid a tundra park nearly three times as often at the top tier as a plains park. A park-only +1 on desert and plains
  closed most of that gap (it matched per-biome thresholds fitted on all three maps) but could not be explained beside
  the game's own numbers, so it was built, watched and dropped with the tiers.
- **Growth by project.** A city runs Expand National Park; each completion gives the park its age's number of tiles
  (1 Exploration, 3 Modern). The completion event's `location` is the park's founding tile. The project is
  `CityOnly`: a town was offered it as a build only (not as a purchase or a town focus; watched 2026-09-29) and would
  take about 75 turns at a town's production, so towns do not list it. `RequiresUnlock` is false: with it true and a
  `KIND_PROJECT` unlock row on the civic, the project was never offered even after the civic completed (watched
  2026-09-29; earlier tests had the dev probe's `RequiresUnlock="false"` and hid it). The park itself stays
  civic-gated, and the project needs the park.
- **Growth by purchase.** The purchase list of a settlement with the player's park, town or city, carries an Expand
  National Park or Expand Wilderness Area row priced at 4 Gold per point of the project's production cost (the game's
  own purchase rate: Jinja 50 : 200, Grocer 535 : 2140), 1,200 at Standard speed. The game cannot sell a project for
  Gold (a `CanPurchase` project in its purchase list is only queued as a build, `production-chooser-helpers.js`
  `Construct`), so `ui/np-purchase.js` decorates `panel-production-chooser`: its instance `items` accessor gains the
  row, and its `doOrConfirmConstruction` sends a choice of that row to `buyExpansion`, which takes the Gold
  (`Players.grantYield(pid, YIELD_GOLD, -N)`), adds the age's tiles, closes the panel and opens the picker. A
  replacement panel that shows a city's purchases as Gold pills on its production rows (keyed on `purchaseCost`,
  chosen with `doOrConfirmConstruction(..., isPurchase = true)`) gets the price as a pill on the city's Expand row;
  not watched. Watched 2026-10-01 in the base panel: the row listed at 1,200, grayed with "Full (24 tiles)." for a
  full park; a choice took 1,200 Gold, granted 3 tiles, closed the panel and opened the picker. Until 1.2.0 a panel at
  the top of the screen sold the expansion.
- **Cost.** Flat: 300 production, or the Gold price above. No cost progression applies to a project on 1.5.0 anyway
  (see `engine-closed.md`).
- **Choosing land.** When an expansion completes, the local player's tiles wait and a "Choose land" prompt at the top of
  the screen opens the picker; it is not opened by itself over the start of a turn (watched 2026-10-01: after a turn the
  game stayed in its default mode with the prompt shown once the turn's dialogs closed). A Gold purchase opens the
  picker at once. A lit tile is bright cyan with a dark teal edge, which matches neither kind nor the game's own
  choosers. A click on one selects it (a second click deselects it, and anything selected only through it drops too), up
  to the number the park may take, and fills it with the kind's colour: the green or ocher the park's own land is shaded
  in and the Parks lens uses. An earlier build lit tiles in green and selected them in amber, which read as a choice
  between a park and a wilderness area. **Confirm** adds the selection and keeps the picker open while tiles remain.
  **Done** adds the selection and ends the expansion; if tiles would go unplaced it asks first ("2 tiles of this
  expansion will not be placed and will be given up"). **Later**, or Escape, keeps the rest for the prompt. If an
  expansion completes with no land free, a notice says so and the tiles wait. Unused tiles carry over into the next age.
  A human's park, hotseat seats included, waits for its owner; an AI's takes its tiles at once, best first (wonders,
  mountains, wild cover, water, open land) and never a tile that would cost it an improvement. An AI's park also buys
  expansions with the AI's own Gold, weighed each turn (`aiExpansionWorth`, `aiSavingStep` in `ui/np-core.js`; the game
  has no AI weighting for projects and no AI queued Expand in 35 watched turns). It is worth it at peace with another
  major (independents always read as at war), with Gold income positive, and when the yield the best tiles would add
  (the park's payout plus their own yields, Happiness counted twice in an unhappy settlement) pays the price back within
  30 turns at 2 Gold a point, or 50 when treasury and savings hold 3 times the price. An AI spends as its Gold comes in
  (five AIs at 130 to 270 Gold a turn held 0 to 1,207 at each turn start), so it saves: a quarter of its income a turn
  goes into the park's fund, and the rest is paid from the treasury once that leaves it, with 3 turns of income, half
  the price. At war the fund goes back; a new owner starts its own. Watched 2026-10-01 over 8 AI turns with nothing
  granted: an AI at +263 Gold a turn saved 65 and 66, bought an expansion worth 35 points a turn (17-turn payback),
  saved again and bought one worth 25 (24 turns), and was saving for a third; its park grew from 1 tile to 7.
- **Full size.** A park stops at `MAX_PARK_TILES` (24; `limits.maxTiles` in `ui/np-core.js`, which a probe may
  lower). The picker allows only as many tiles as still fit and says "This fills the park" once the
  selection would fill it; tiles left over then lapse. In a settlement whose park is full, Expand National Park is
  refused with `MeetsRequirements` kept, which the production list shows grayed out, and the Gold purchase is refused
  with "Full (24 tiles)."
- **What a park may take.** Rural land the park's owner holds beside the park, not already park: open land, forest,
  mountains, lakes, navigable rivers, open sea and natural wonders. The rule is `joinable()` in `ui/np-core.js`, pure
  and tested. Urban and other non-rural districts, buildings, another park's founding tile and plots that cannot be
  read are refused. **Resources come with the land.** Every marker is a valid improvement for every resource
  (`data/national-parks-resources.sql` adds a `Constructible_ValidResources` row per marker for each row of
  `Resources`, so DLC and other mods' resources are covered), so a resource under a marker stays collected: the marker
  takes over from the plantation, camp or fishing boat it replaces, and a resource tile joins without a question.
  Watched 2026-09-30: Pearls set on an unimproved sea tile that then joined was collected by its city after a turn,
  while Pearls on an unimproved tile outside the park was not; Rice and Fish kept their collection when their
  plantation and fishing boat were replaced. Until then a resource under a marker was not collected (jade, watched
  2026-09-29), and the tile asked first. A rural improvement (farm, camp, mine, quarry) on a tile with no resource
  does not bar it, but selecting it asks first, in the mod's own box over the picker: "The Farm on this tile will be
  removed." The game's own dialog box is not used there: opening it switched the map out of the picker's interface
  mode and lost the selection (watched 2026-09-29). On OK the tile is selected; on joining, the improvement is
  destroyed first and the marker placed on the rural district that stays. An **Expedition Base**
  (`IMPROVEMENT_EXPEDITION_BASE`, and `IMPROVEMENT_MOUNTAIN`, the same thing on a mountain) is park-compatible: a tile
  holding one joins without a question, keeps it, and carries no marker, so it pays its own worked yields instead of
  the park's (watched: a wonder tile with a base joined, kept it, and kept its 3 Culture). Every path that marks a
  tile checks this (`markTile`): a tile joined through `addTile` once got a marker anyway, which replaced a worked
  mountain's `IMPROVEMENT_MOUNTAIN` in place and cost its city the citizen who worked it (found 2026-10-04, crash
  soaks `nai9-trace`, `nai10-trace`: two AI cities lost one each when their parks took worked mountains; fixed and
  watched in `nai11-fix`, no citizen lost).
- **Yield.** Every tile but the founding one and an Expedition Base's gets its kind's land marker: +1 Culture and +1
  Happiness in a National Park, +3 Influence in a Wilderness Area, whatever the tile; its appeal does not change it.
  Parks from 1.2.0 carry `_LAND` and `_WILD` markers (plain ground; a wonder, mountain, water or feature, which paid
  +2/+1 and +3 Influence); `_WILD` stays in the database so those saves load, and the sweep swaps each for `_LAND`
  (`remark`; the swap watched in crash soak `npap1` from a planted old marker). A park's yields grow with its size
  through its tiles and the size bonus below. An AI weighs a tile by the same payout at its level (`landPayout`,
  `tileGain`). The
  founding tile keeps its own improvement yields and wonder adjacency (+4 Happiness and +5 Happiness, +5 Culture per
  wonder for a park; +4 Influence and +10 Influence per wonder for a wilderness area). The payout is the marker's own
  `Constructible_YieldChanges`, so it sits on the tile and the yields layer shows it there. A marker needs a district
  under it and the settlement that holds the tile as `Parent` (both belong to that settlement, so a tile taken from a
  neighbouring settlement pays that one); the tile then counts as worked land with no population spent, and from 1.2.0
  it keeps its own yields alongside the park's (watched 2026-10-01: a rainforest tile kept 1 Food, 3 Production and 1
  Science and showed +2 Culture +1 Happiness on top; removing its marker took exactly 2 Culture and 1 Happiness off the
  city). Until 1.2.0 every marker carried `MOD_NP_NO_NATURAL_YIELD`, a -100% `EFFECT_PLOT_ADJUST_YIELD` on its plot, so
  park land paid only the park's yields. A saved game keeps that modifier on the plot after the marker and the district
  are gone (watched 2026-10-01: a 1.1.0 tile still read 0 Food and Production with a new marker on a new district and no
  such modifier in the database), so the id is defined again as a 0% no-op, which gave the old tiles their yields back
  on load (watched). A new `UpdateDatabase` file is read only at launch, from the modinfo; a reload does not pick it up.
- **Size bonus.** Each park reaches levels at 8, 16 and 24 of its own tiles (founding tile included), and every tile
  of that park then pays more: a National Park tile +2 Culture +1 Happiness at 8, +2/+2 at 16, +3/+2 at 24; a
  Wilderness Area tile +4, +5, then +6 Influence. Parks level apart: the owner's other parks, of either kind, do not
  count (`parkLevel`). Each level is its own land marker (`IMPROVEMENT_NATIONAL_PARK_LAND_8`, `_16`, `_24`, the same
  for `IMPROVEMENT_WILDERNESS_AREA_LAND_`), with the `_LAND` name and description, so the payout stays the marker's own
  yield on its tile. The sweep swaps any marker that does not match its park's level (`markerFor`, `remark`):
  `CREATE_ELEMENT` of the wanted marker replaces the old one in place, a plot holding one improvement (watched
  2026-10-03, crash soak `npms1`; `engine-closed.md`), and as markers house no one, no citizen moves. The count is the
  land the park holds now, so land lost, built over or let go counts against it and every marker steps back down. The
  founding tile keeps its base improvement at every level; an AI weighs a tile at the level the park reaches with it
  (`tileGain`). Watched 2026-10-04: crash soaks `npml1` and `npml2` (one park of each kind grown to 15, 16, 23 and 24
  and let go to 23 and 15: every marker and the tile's yield at each level, population unchanged) and the biome
  sweeps `nbio3-exp` and `nbioq` (both kinds through every level in grassland, desert, tundra and tropical land).
  AI parks cross levels on their own (Modern soaks `nai2`, `nai3`: three AIs, ten purchases, every marker right each
  turn). Two AI settlements that lost a citizen on a turn their markers swapped lost the same citizen on that turn with
  no swap (`nai5-mod-noswap`, the parks started one crossing short): the game's own, not the swap. Until 2026-10-04 a
  player's parks of a kind counted together (`npmw2`: 8 tiles split 5 + 3 across two parks levelled both); an earlier
  design paid the bonus on the oldest park's founding tile instead (`npmw1`).
- **Past the third ring.** A settlement can hold land beyond ring 3 (bought, or claimed by a border-spreading mod such
  as Cultural Diffusion) where the game builds nothing. A park still takes it: the rural district the mod creates
  first makes the tile workable, and the marker lands and pays there (watched 2026-09-30 on a town's ring-4 and ring-5
  tiles; see `engine-closed.md`).
- **Writes in flight.** Creating a rural district on a resource tile makes the engine put the resource's own
  improvement there at once (a quarry on jade, until the marker replaced it 2.5 s later). A sweep inside that window
  used to read it as the owner's build and drop the tile, and the late marker then landed outside any park (watched:
  an orphan marker on 58,23). Now a tile the mod is writing to is left alone by the sweep (`settle` / `isSettling`),
  and a late marker re-checks that the tile is still the park's. A tile holding only a marker may rejoin a park.
- **Protection (1.2.0, superseded the same day by "Tiles keep their look").** Park land cannot be developed, and the
  game itself holds every player to that, the AI included. The
  game offers a rural tile beside a settlement's urban core to its buildings (`ExpandUrbanPlots`), park tiles and the
  founding tile with them (watched 2026-10-01: a Grocer was offered the founding tile and three marked park tiles;
  earlier notes that a marked tile refused a Grocer were wrong), and the AI builds there natively, past the placement
  hook. It offers a tile on a `DISTRICT_WILDERNESS` to no building, by build or purchase, and to no growth (watched: a
  marked tile moved onto one dropped out of the Grocer's offers; with every park tile moved, no building of either
  park's settlement was offered any park tile; a city with a citizen to place was offered only tiles outside the
  park). So park land sits on a wilderness district: `markTile` replaces a rural district (the owner's, or one from
  1.1.0) with one, `removeDistrict` buying the released plot back, and `rewildFounding` does the same for a founding
  tile once its park is founded; the park improvements list `DISTRICT_WILDERNESS` as valid. Older saves are moved over
  at the first sweep (watched: every tile but an Expedition Base's mountain, which keeps its rural district, and both
  founding tiles). The players are also held by the placement hook ("This tile is protected land of a National Park or
  Wilderness Area."). A rural improvement found on park land is still removed and the marker put back, now a safety
  net only (no reverts in AI turns since 1.1.0). Taking a rural improvement off costs its settlement the citizen it
  housed (`DESTROY_ELEMENT` takes one population with it, `engine-closed.md`), so `stripImprovements` measures the
  population before and after and returns each point lost with `city.addRuralPopulation(1)`, as Build Wonders Over
  Antiquated Buildings does: the player places it from the game's Grow City prompt (watched 2026-10-01: a woodcutter
  taken into a park took the city from 21 to 20, then returned 1 pending citizen with `NOTIFICATION_NEW_POPULATION`).
  **Urban development is never removed**: a building or an urban district on a park tile makes that tile leave the
  park, the building untouched. On the founding tile, `moveFounding` moves the park improvement to another of the
  park's tiles in the same settlement, flat or hill, beside a wonder first, then nearest; only a park with no such
  tile is dissolved (watched 2026-10-01: a Grocer forced onto Uluru's founding tile; the park moved to a
  wonder-adjacent tile and kept its name and every other tile).
- **Leaving a park.** Once a plot has changed hands, the ids read on it can resolve against the new owner's own
  objects elsewhere: a park tile bought by an AI city read as that AI's sawmill and urban district eight tiles away,
  and v0.2.0's release destroyed that district and bought the plot back (watched 2026-09-29). So every read goes
  through `readPlot`, which drops any object whose location is not the plot, and a tile is let go by its record:
  on land the park's owner no longer holds, the tile and its district are only forgotten (watched: the AI kept the
  plot and its districts were untouched); on the owner's land (a dissolving park) its marker is taken off, and the
  district the park made with it unless something else stands there; the plot, which a district's removal releases,
  is then bought back for the settlement if nobody holds it. The tile is removed from the park's record before any
  destroy, because the removal event re-runs the sweep.
- **Tiles keep their look.** A tile that joins a park is incorporated as it is: a hill stays a hill, a coast with
  crabs stays a coast with crabs. Park land sits on the game's rural district (`parkDistrictKind`, `makeParkDistrict`
  in `ui/np-core.js`); the improvement the engine drops on a new rural district (farm, mine, woodcutter, clay pit,
  fishing boat; it housed no one) is taken off at once and the park's marker goes on. Same-camera captures, 2026-10-02
  (crash soak `npm3`, `npv1`, `npv2`, `nps1`, `npg1`/`npg2`): a wilderness district drew a mountain flat and stripped a
  hill's rocks and snow; a rural district left both standing; flat land, coast, lake, and resources with their animals
  (crabs, foxes, camels) were unchanged under either. No district keeps the game's own trees or marsh (forest,
  rainforest, taiga, marsh: bare grass under either district, and after a reload), so the park draws it back from the
  game's own art: the feature's own model (`FEATURE_MARSH`, `FEATURE_RAINFOREST`, `FEATURE_MANGROVE`, `FEATURE_TAIGA`,
  `FEATURE_FOREST` and the rest in `FEATURE_MODELS`, found by name in `StandardAsset*.blp`), which alone restores
  marsh, rainforest and mangrove; plus the game's own scatter sets where the model is sparse, matched against untouched
  tiles of the same feature (`GAME_SCATTER`, `FEATURE_SCATTER` in `ui/np-draw.js`; crash soak `npa1`, `npt1`, `npt2`,
  confirmed through the park flow in `cfq`): grassland forest with `BIN_FOL_Grassland_Trees_LG`, snowy taiga with
  `BIN_FOL_Tundra_Cluster_A_Large`, savanna woodland with `BIN_FOL_Desert_Trees_SM`, sagebrush steppe (its model draws
  nothing) with desert shrubs and small trees. The game's scatter places its trees itself, so the trees match in kind
  and density, not one for one. The park's own woods (`forestCover`) remain for anything unmatched, reeds
  (`wetCover`) for oasis and watering hole. The cost of the rural district: the game offers an AI's
  buildings a rural tile beside its city centre, park land included, and that tile then leaves the park (a founding
  tile moves, `moveFounding`); every player's own builds and growth are refused park land by the placement hook. Parks
  from 1.2.0 (wilderness districts) are rebuilt on rural districts at the first sweep after loading.
- **An independent power's park is left to the game.** A settlement that passes to an independent power is taken
  apart by the game, a few districts a turn, until its land is released (watched 2026-10-02). The mod writes nothing
  on such a park's land: no marker, no restored founding tile, no release, no orphan removal, no AI growth. A tile
  whose district the game removed is forgotten, and the park ends with its founding improvement
  (`reconcileIndependent` in `ui/np-core.js`).
- **Keeping in line with the map.** The map is swept on load, at the start of every local turn, and 1.5 s after
  construction events (`ConstructibleBuildCompleted`, `ConstructibleAddedToMap`, `ConstructibleRemovedFromMap`, one
  sweep per burst). New park improvements become parks and are named; the whole map is read for them only on load,
  at turn start and when the event is about a park improvement, other events re-check the parks' own tiles. A park
  follows its founding tile's owner; land lost is let go; improvements are reverted; missing markers are placed; a
  park whose founding tile belongs to no one is dissolved. A park is redrawn only when its record changed or its
  signature (owner, tiles, which tiles the local player has revealed) differs from its last drawing; on load
  everything is drawn. Watched: v0.2.0 cleared and re-added 45 models at a turn start with nothing changed; now 0;
  revealing one tile of an AI park in fog redrew that park alone and drew the tile.

## The look

The improvement has no model of its own, so everything is drawn by script, as Canals draws its canals. Offsets use
Canals' convention: a ring direction's arm points east at 0 degrees and turns counter-clockwise on screen, and 0.42
to 0.46 along an arm is at the tile's edge.

- **Border.** A single dashed green line (`CultureBorder_CityState_Open`) around every revealed park tile. Color
  alone could not set it apart: 23 of the 83 player color sets include a green, and the earlier solid green matched
  the standard mid and light greens. Civilizations draw a solid, glowing band (`CultureBorder_Closed`) and city-states
  a solid line (`_CityState_Closed`); the dashed style is otherwise used only for independent powers, which the game
  always draws in fixed dark gray (51,51,51) and pale yellow, never green. Watched beside a stand-in green civ
  border, 2026-09-29. A Wilderness Area's line is ocher. The overlay pales every color it is given (pure magenta
  drew pale pink), and the first choice, a sand tone, came out near white on tundra and plains; ocher reads as ocher
  (watched 2026-09-30). The line shows only where the park's edge is not also the settlement's border, which draws
  over it.
- **Walls.** On about 96% of the outer edges between passable land (80% until 1.2.0), and on one in twenty of the
  edges between two of the park's own tiles (a quarter read as walls across the park's middle); none on or facing
  water, a navigable river or a natural wonder. Where the border meets a mountain, from either side, the wall is grey
  dry-stone runs end to end on the flat just outside the mountain's tile edge (`mountainWallPieces`): the biome's kit
  and rubble vanished against the rock, pieces at the tile edge sank into the mountain model, which spreads past its
  hex, and the engine has no placement that follows the model's surface (crash soaks `nscreev`, `nscreew`, 2026-10-04:
  the runs read clearly from the back and the front of a mountain). Each edge is composed, walking along it, from a
  biome kit: mostly rubble (three to five loose rocks of the local stone, `Plains_Rough_Rock_Rounded_A`-`E` gray or
  `Desert_...` red-brown), short dry-stone runs (`NAM_SWN_CityKit_RockFence`, laid either way round, some lean),
  larger stones set into the line, shrubs growing through, and gaps, some with a fallen stone. Watched 2026-09-29. On
  open ground (flat land, woods) about three edges in four are the pasture's split-rail fence, laid end to end with a
  stone or a short gap now and then and on about a third of them one gate, shut or open; the rest are stone with a
  short stretch of rail. On rough ground (a hill, a mountain, a natural wonder) an edge is dry stone only. The
  sections are `PROP_GEN_FenceBit_A` (two rails, about 0.1 tile long), `_B` and `_C` (three rails, about 0.12),
  overlapping a little at the posts; A and B lie across the tile at angle 0 and C along it; the gates are
  `PROP_Pasture_FenceDoor_Closed` and `_Open` (measured and watched 2026-10-02, crash soak npr, nsh1, nsh2). The
  numbered `FenceBit` names are parts of the three, not models of their own, and the pasture's
  `IMP_Pasture_Fence_Spline_*` and `BIN_SPLN_*` sets draw nothing when placed. Until 1.2.0 the fence was
  `NAM_SWN_Menagerie_Fence` on three edges in ten, whatever the ground. Only the plains and desert rock sets draw in
  their own color when placed by script; the grassland, tundra, tropical and generic sets draw navy blue, so every
  other biome uses the gray plains stone. `BIN_Boulder_*` drew near-black against the rubble and is not used. Hashed
  from plot and direction, so an edge looks the same after a reload.
- **Spread, not repeated.** Chosen tile by tile, the accents repeated: two lake tiles side by side both had both
  lily pads and a cattail at the same size and angle, and neighboring meadows the same wheeling flock. The accents
  are now planned for the park as a whole (`planScene` in `ui/np-scene.js`, pure and tested): each (a herd, a stray,
  climbers, a flock overhead, a school of fish, reef fish, a lake's fish, a leaping fish, waders, reeds, lily pads,
  a rowboat, a cairn, hill stones, an understory, a trail, the tree stand's shape and its main tree) goes on a share
  of the tiles that can take it, never on two neighboring tiles (a rowboat or a whale never within two, and at
  most two a park), and each tile takes the variant least used within two tiles. Scale, heading, position and count
  still vary per tile. Tiles are taken in hashed order, so a park that grows keeps most of its existing accents.
- **Buoys.** `PROP_MOD_Harbor_Buoy` at scale 1.6 on about half the edges where park water meets open water outside
  the park. Subtle at map zoom; the water gets no walls.
- **Dressing,** per tile by biome: a stand of trees in one of four shapes (a loose ring round a center tree, a
  clump beside a clearing, two or three spread over a meadow, a tight grove), mostly of the tile's main kind
  (`BIN_FOL_<Biome>_Trees_*`, birch groves in grassland and tundra, elms on the plains), a flowering accent
  (`BIN_FOL_Urban_Tree_Hero_A`) about a third of the time outside desert and tundra; on the tiles the plan picks, an
  understory bin (in the desert, or its rock scatter), a dirt trail leaning toward the founding tile, one of four
  stone arrangements on a hill (`BIN_Boulder_C`, `BIN_Boulder_B`, or two or three loose rocks of the local stone),
  a cairn (`PROP_CairnRock_Stack`) on a hill, mountain or wooded tile. A lake tile the plan picks gets one to three
  rafts of one lily pad kind (`FOL_LilyPad_Triple_Flower`, `_Double_Flower`); a lake or river shore tile one to three
  clumps of reeds (`FOL_Cattail_A`) of differing height along the shore; a rowboat (`PAC_HWI_Palace_RowBoat`) goes
  on at most two water tiles. The wonder gets nothing. A wooded tile (a vegetated feature or mangrove, `isWooded`)
  is filled edge to edge by `forestCover`: about 30 of its biome's trees on a jittered lattice 0.17 apart out to the
  hex edge, with some understory, so woods run on across tile edges. The game draws no vegetation on a plot that holds
  a district: a rainforest park tile drew as bare grass with its marker, with an artless building in its place, and
  with nothing on its wilderness district, and drew its rainforest once the district was removed (watched 2026-10-01,
  same camera; a Llamas resource's own art had first been mistaken for the forest). Park land needs its district, so
  the woods are the mod's to draw. Until 1.2.0 a wooded tile got a clump of five or six trees at its center.
- **Campsites.** On about one open, flat National Park tile in twelve (not the founding tile, the lookout, woods, a
  minor river, which runs through its tile's middle, or a tile with a feature model), two or three of the woodcutter's
  purple ridge tents (`PROP_Tent_GEN_Sleeper_Standard_C`, the one beside its fire) at 0.6 to 0.7, set around a burning
  fire pit (`PROP_Fire_Pit` at 0.45) and facing it. The tents take the owner's colors through `tintColor1` and
  `tintColor2`, as the woodcutter's do. The camp is a clearing: the tile's trees keep to one side and the camp sits
  0.18 out on the other. Auditioned 2026-10-03 beside the game's own woodcutter (crash soak npcamp5). The round camp
  tents (`BIN_Tents_Camp_Sm`, `_Med`) and the slanted sleeper tent (`PROP_CON_Tent_GEN_Sleeper_Slanted_A`) were tried
  first and dropped; `PROP_BonFire` and `PROP_KettleFire` are not models, and `Camp_Tent_Single`, `_Light` and
  `_Heavy` give no handle. Wilderness Areas have none.
- **Wildlife** (`ui/np-wildlife.js`), all of it moving. Rigged animals, chosen per biome and weighted: plains bison,
  horses, deer and foxes; grassland deer, horses, elk and foxes; tundra elk, deer and foxes; desert camels and foxes;
  tropical deer, elephants and cranes; sheep, llamas and camels on hills; llamas on mountains; cranes on lake and
  river shores; crabs on the coast. Sparse on purpose (watched 2026-09-29): about four tiles in ten have any, mostly
  singles and pairs, now and then a second kind; birds on three tiles in ten. Overhead, by biome: sparrows, doves,
  parrots, ravens, circling flocks, butterflies and flies; gulls over coast; leaping fish in lakes and rivers. On water,
  by effects: schools of tuna on about half the sea tiles (`VFX_SwimmingFish_Tuna02` / `03`), reef fish on shore tiles
  (`VFX_SwimmingFish_ReefNeedle`, `VFX_SwimingFish_Clown`), a whale's splash now and then away from shore
  (`VFX_Water_Splash_Whale`), swimming fish in lakes (`VFX_SwimmingFish_Lake`). Auditioned 2026-09-29:
  `VFX_Water_Whale_Spout` draws nothing, and the seaweed and ocean-surf effects did not show at map zoom. All of it is
  small at map zoom. A
  rigged model drawn by a model group stands frozen in its bind pose until its state is set to `IDLE`, which only
  takes once it has loaded, so it is set after 1.5 s and again at 4.5 s, staggered so a herd does not move in step.
  A rigged animal is placed at an absolute height, unlike a static model, which sits on the ground at its own spot:
  at one fixed lift the same horse floated on low ground and sank on a hill, and at the ground's height plus a
  constant it stood on both (2026-10-03, crash soak npz10 and npz11, a flat tile at height 3 to 5 and a hill at 15 in
  one frame). So each animal is set at the ground's height under it, read with `WorldUI.getPlotLocation(plot, offset,
  PlacementMode.TERRAIN)` (offset in world units, 64 to a tile; on a water tile the higher of that and
  `PlacementMode.WATER`), plus 1 (crane and crab 0.5); every species stood at -1 to +5 on both tiles. Static models
  need nothing of the kind: posts and rocks lowered by the ground's fall from the tile's center sank (npq). Until
  1.2.0 every animal was lifted 8 + 24 x scale from zero, which floated them on low ground (a fox on a shore, camels
  on a cliff's lip) and buried them on hills. Earlier passes that matched one capture per species to its tile by
  order gave wrong readings: the captures had slipped by a tile.
  Under `PlacementMode.TERRAIN` these models sink by an amount that grows with scale, so each is lifted by 8 + 24 x
  scale (watched: 0.5 needs about 20).
- **Buildings.** The founding tile carries the warden's lodge, a log cabin (`IMP_Camp_BldA` at 0.75), an open
  picnic shelter (`PROP_Pasture_ANT_BldB` at 0.7) and the park sign, with trees and a trail. Elsewhere, one draw per
  tile (`hash01(t, 70)`) gives open, flat land a cabin village (about one tile in sixteen) or a campsite (one in
  twelve), and any other non-wooded tile now and then a lone picnic shelter or clapboard ranger house
  (`PROP_MOD_Farm_BldC`) at 0.38 to 0.55 scale. A cabin village is four or five log cabins (`IMP_Camp_BldA` at 0.36 to
  0.42) in a loose arc around a trodden clearing, each turned toward its middle, as in the lodges of the American
  parks; the tile keeps two trees on the side the arc opens to, and no grass or understory. Until 1.2.0 one tile in
  six got a single cabin, shelter or ranger house at 0.5 to 0.66. The Menagerie shed and arch were dropped as
  tent-like. A Wilderness Area has none of these: its founding tile gets
  a tree stand in place of the lodge and shelter, and it has no cabins and no lookout tower. Its walls, trees,
  wildlife and hawk are the park's.
- **Campsite.** Two or three ridge tents (`PROP_Tent_GEN_Sleeper_Standard_C` at 1.1 to 1.25, tinted in the owner's
  colours) round a burning `PROP_Fire_Pit` at 0.7, on a clearing with no grass tufts or understory. At the woodcutter's
  size (0.6) the tents were drawn but went unseen at play zoom among the tile's shrubs (crash soak `ncamp1`: same-camera
  captures with the park drawn and cleared); larger, on a clearing, they read as a campsite (`naud1`).
- **Lookout and hawk.** `Camp_Lookout_Tower_Bin` at scale 0.5 on one hill once the park has three tiles, and the
  `VFX_Bird_Hawk_C3` effect circling the first mountain, else the lookout, else the founding tile.
- **Size levels.** As a park reaches 8, 16 and 24 of its own tiles (the same levels that raise its yields), it draws
  richer, and steps back down with its land. Each level only adds to the one below, on tiles taken in a fixed order by
  hash, so stepping down takes exactly that away and a reload draws the same. The level is part of the redraw
  signature (`drawSignature`), so crossing a threshold redraws the park.
  - Level sites (`levelSites`): one per level, two per level from 13 tiles, on open flat land the base drawing left
    bare, never two side by side. A National Park's carry a campsite, a cabin village and a lone shelter in turn; a
    Wilderness Area's a thicket: the tile's own stand with a thick understory under it.
  - A National Park raises one more lookout tower per level on another hill, never beside a tower (`lookoutTiles`).
  - A Wilderness Area grows by swapping and by wildlife, never by more trees: from 8 tiles about a third of its grass tufts
    become wildflower clumps (`wildflowers`, `FOL_Flowers_Small_*`); from 16 rarer species join where the land suits
    them (the planner's `rare` accent, `rareFor`: goats on hills, giraffes on tropical and plains land, turtles on a
    shore); at 24 a third of its stands have one tree swapped for a giant (`oldGrowth`: a coast redwood, or a flowering
    tree in the tropics). Its open tiles also get more grass tufts per level and more of them undergrowth. Never more
    trees:
    extra trees, a second lattice of woods on wooded tiles and four-tree thickets crowded into each other
    (`nshow-exp`, 2026-10-04).
  - Both kinds carry more strays, climbing animals and waders (`LEVEL_BOOST` in `np-scene.js`; an accent kept off
    neighbouring tiles cannot pass about a third of the land), and herds grow by one at 16 tiles and one more at 24.
    Flocks overhead do not grow with the level, and a park carries at most two of any one kind (`perVariant`): a
    desert's or tundra's two kinds both circle, and a full park was crowded with them.
  - Monuments around the park (`monumentSites`): stone cairns (`PROP_CairnBase`) on open land from 8 tiles, obelisks
    (`NAF_EGY_CityHall_Obelisk`) in a National Park or dolmens of standing stones (`ANT_EEU_Monument_Rock_Structure`)
    in a Wilderness Area from 16, and more of both at 24 (about one cairn per six tiles and one obelisk per eight,
    plus one of each per twelve at 24). Each tile's kind and the order tiles are taken in are fixed by hash and spaced
    once for the 24-tile counts, so a higher level only adds and stepping down takes away; never on two neighbouring
    tiles, the founding tile, or a camp, village, shelter or tower; the tile's trees and tufts around the monument are
    left out. Auditioned at scale 1 beside the game's other monuments (`naud1`): these read at play zoom; the city
    monuments (`BIN_Monument`, `ANT_HWI_Monument`, `EAS_HAN_Monument`) looked urban, and the statues, flagpole, cairn
    stack and cairn gates were too small or sank into the rock. A group on the founding tile came first (cairn,
    obelisk, then a lion-capital pillar or a plain column between two obelisks: `nbioq`, `nlv4-park`); spread over the
    park they read better, and no central piece fit (`naud2-statues`, `naud3-columns`).
  Watched 2026-10-04: crash soaks `nlv2-park` and `nlv2-wild` (one park of each kind grown to 7, 8, 16 and 24 tiles and
  let go to 23, same views at each step, redrawn at each level; a Wilderness Area drew 35 pieces at 7 tiles, 55 at 8,
  292 at 24 and 228 back at 23), `nlv2-park-re` and `nlv2-wild-re` (drawn at the saved level after a reload), and
  `nbioq` (the monument at each level for both kinds).
- **Growth.** New land's wall runs appear one after another, 110 ms apart, each with
  `VFX_Dust_In_Place_SquadCom_Tan`; its dressing follows.

Auditioned and rejected: `NAM_SWN_Walls_Fence_Lg_B_AlignX` (draws nothing), `NAM_SWN_Walls_Fence_Lg_A` (a tiny
fence), `IMP_Grove` (an untextured white mesh), `BIN_Menagerie_Animals_HOT`, `BIN_FOL_Plains_Clusters`,
`BIN_FOL_Grassland_GroundCover`, the Valley of Flowers bins and decals, the peony bushes, `VFX_ENV_Mist_A` and
`BIN_VFX_Mist_Fog_A` (nothing visible at map zoom), `VFX_Butterfly_A`, `VFX_Leaf_Green_A`, `VFX_Bird_Hawk_A` and
`VFX_Bird_SeaGull_*` (refused), `IMP_Camp_ModernBldA` (reads as a factory shed), the picnic table and bench
(invisible), `IMP_Campfire` (its light draws as a tall pale column), and every static animal prop: `All_*`
(`All_Deer01`, `All_Bison01`, `All_Elk01`), the `BIN_RES_*` herd layouts and the `AnimalResource_*` models never
move (frame-difference tested). `NAM_SWN_Menagerie_Fence` draws a good
stone-and-timber fence but reads as a paddock; the dry-stone wall suits a park better.

## Pop-ups

The mod's decisions and notices take the form of Emigration's (`ui/np-dialog.js`, adapted from that mod's
`emigration-dilemma-view.js`, so either works alone): the title, a category line (the park's kind in bold capitals
after the icon of the yield it pays, Happiness for a National Park and Influence for a Wilderness Area), the text
wrapped at 64 characters, the base game's filigree divider, a framed quote slanted with a skew (GameFace has no italic
face), and stacked buttons. Founding a park and the no-land notice use the game's own dialog
(`DialogBoxManager.createDialog_MultiOption`, vertical), the quote added by a `screen-dialog-box` decorator that acts
only on this mod's titles. The two questions over the tile picker (Add this tile?, End this expansion?) build the same
parts in place (`decisionFrame`): the game's dialog would switch the map out of the picker and lose the selection.
Watched 2026-10-03 (crash soak npdlg10): the founding pop-up after Confirm, Add this tile? on a farm (OK selected it),
End this expansion? on Done with three tiles left, and the no-land notice.

The quotes (`ui/np-quotes.js`) are 33 lines by naturalists in five pools: founding or growing a National Park, a
Wilderness Area, no land, taking worked land, and ending an expansion. Each is one text row, `LOC_NP_QUOTE_<POOL>_<n>`,
the same in every language (English originals); one is chosen by a hash of the park and the moment, so a moment always
shows the same line. Sources, the rules they were checked by and the lines rejected are in `docs/quote-sources.md`.

## Names

A park is named once, at founding, and keeps the name as it grows. Candidates in order: a natural wonder beside the
founding tile, read from the map; then places within `NAME_RADIUS` (2) of the founding tile from Geographic Labels,
ranked mountains, lake, river, desert or forest region, island, coastal water, sea, continent, nearer first within a
kind; then a river at or beside the founding tile and the city. A place's core name is used ("Altai", not "Altai
Mountains") unless it is a wonder or a name the player gave it. The first free "{Name} National Park" wins; if every
candidate is taken the first gets an ordinal. The map comes first because Geographic Labels can miss a wonder: a
park beside Uluru was once named after the Tatra range, three tiles off, because the labels had not seen Uluru
(watched in game 2026-09-29: with `namesNear` stubbed to offer only a range, the park still took Uluru's name).

Renaming: the picker's Rename button opens Geographic Labels' Rename Places when that version has park support
(`hasGeoRename()`), else the mod's own box (`openParkRename` in `ui/np-picker.js`): a text field, Save, Restore (back
to the generated name) and Cancel, with map hotkeys held off while it is open (`ViewManager.isWorldInputAllowed`).

A Wilderness Area takes the same candidates as "{Name} Wilderness Area".

The parks are offered to Geographic Labels as one label provider of type "park" (`window.__geoLabelsProviders`), listed
in Rename Places as "Park or wilderness", so their names are drawn on the map. A rename there is handed back to this mod
and stored as the park's own name; Restore brings back the generated one. That provider API, `__geoLabels.namesNear` and
`__geoLabelsRename.open({ search })` arrived in Geographic Labels 1.6.0 (on the Workshop 2026-09-29). With 1.6.0
(watched 2026-09-30): both kinds were labeled and listed, and the picker's Rename opened Rename Places filtered to the
park. Geographic Labels hides a lower-ranked label that crowds a higher one, and ranks a wonder's label (6) above a
park's (4), so with 1.6.0 a park's name can be hidden by its own wonder's: "Redwood Forest Wilderness Area" was listed
but not drawn beside the Redwood Forest label. Geographic Labels 1.6.1 lets a provider's place named after the wonder
beside it stand in for the wonder's label, at the wonder's rank (`standInForWonders`); watched 2026-09-30 with 1.6.1
from source: "Redwood Forest Wilderness Area" drawn, the wonder's label left out, the wonder still listed in Rename
Places. With 1.5.0 or earlier the provider list is ignored, names come from the map, and the picker's Rename opens the
mod's own box. With no Geographic Labels at all (watched 2026-09-29) the park was named from the map ("map only" in the
log), and the name appears only in the picker and the prompt.

## Verification

Watched on 1.5.0, 2026-09-27, in seeded lab games on the Tower Bench (`lab start --seed 4242`), with the dev probe
that drops the project's cost to 1 (`devtools/np-cheap-project-probe`):

- **Civic gate, Modern.** With Natural History locked the park was refused by `canStart` (no reasons given, the
  engine's shape for a locked item); after `SET_CULTURE_TREE_NODE` and 1700 granted Culture completed it across one
  turn, the park was offered on the one wonder-adjacent tile. The probe's `RequiresUnlock="false"` did not open it,
  so the unlock rows are what gates it.
- **Civic gate, Exploration.** A fresh Exploration game compiled the rows with `Age="AGE_EXPLORATION"`, the unlock
  rows point at Society, the project carries the Exploration text, `tilesPerExpansion()` reads 1, and the park is
  refused with Society locked. Not watched: completing Society and founding there. (The age transition with parks on
  the map is under "Crash soak" below.)
- **Expansion count.** A completion in the Modern Age gave 3 tiles.
- **Markers and yields.** With a district made first and `Parent` set, markers landed on Uluru, a navigable river
  and a rainforest tile, and the city's Culture and Happiness rose by each marker's amount plus the tile's own
  yields (Uluru +5 Culture in all, the river +2 Culture, +2 Happiness, +2 Food). Population unchanged. A marker sent
  without `Parent` moved nothing; one sent without a district under it did not land.
- **Release.** Dropping a tile from the record and releasing it removed the marker and the district, bought the plot
  back (owner restored), and took the tile's amounts off the city.
- **The picker.** Real mouse clicks on lit tiles selected them (logged as clicks), Confirm added the selection,
  Later closed it with the remainder kept, the prompt appeared and its button reopened the picker. Two defects were
  found and fixed on the way: `handleInput` returned `true`, which the game reads as `InputHandlerState.Handled` and
  so swallowed every map click; and the automatic offer reopened the picker two seconds after Later.
- **Wildlife moves.** Frame differences over a park showed the deer, cranes, birds and fish moving; the same test
  on the earlier `All_*` animals showed none.
- **The look.** A park of the founding tile, Uluru, a rainforest tile and two river tiles drew its border, walls,
  the station with its tree stand and flowering accent, reeds on the rivers, and the hawk. The grassland, plains,
  desert and tundra kits all render; lily pads render on a lake.
- **Names.** Geographic Labels named the parks ("Uluru National Park", then "Tatra National Park" when the wonder
  was placed after the labels had computed), drew them and listed them; a rename and a Restore round-tripped earlier
  the same day.

Watched on 1.5.0, 2026-09-29, in lab games on the Tower Bench (seed 4242, Modern, then Exploration with no
Geographic Labels loaded), every item first reproduced on v0.2.0 and then watched fixed; the details are in "Rules"
and "Names" above. The captures of that round were evidence, not shipped; `docs/screenshots/` holds the release set.

- **Towns, yields, resources, naming, full size, flips, builds, redraws**: see "Rules" and "Names".
- **The icons.** The project's City Park build icon renders in the production list and under "Just completed"
  (with the project grayed out for a full park; `10-expand-project.jpg` shows it offered). The founding
  improvement's icon was not captured in the list: the test city had built its park before the list was opened.
- **Save and load.** A game with two parks' markers and districts on the map (one local park with 3 tiles waiting,
  one AI park), saved by script, the game quit and relaunched, the save loaded from the main menu: parks, names,
  tiles, district records, pending tiles, marker count (4, none doubled) and both cities' yields read exactly as
  before the save, the load sweep placed no marker, and both parks were drawn.
- **Exploration to Modern.** A park of the founding tile and Uluru with 1 tile waiting, in a game whose Exploration
  Age was cut to 12 turns (`devtools/np-short-age-probe`): after the transition the improvement, the `_WILD` marker
  (its plot still 0), the record (name, district, 1 waiting) and the drawing survived, the script reloaded and its
  load sweep found the park, the project was refused until Natural History, and a completion then added 3 tiles
  (1 waiting became 4). `engine.call("transitionToNextAge")` from the game page
  answered "No handler registered" and ended nothing.
- **An AI park.** An AI park beside a wonder, with the completion of Expand National Park raised as the engine event
  the mod listens to (the AI itself was not made to build the project): it took 3 tiles at once, each got a marker
  owned by the AI on a district the mod made, and the AI city's Happiness rose by 3 with Food and Production
  unchanged (Culture +4.2 on a fractional reading). Whether an AI ever builds a park unprompted was not seen: in 8
  Modern turns only one AI had Natural History, and none of its cities was offered a plot.
- **Conquest.** An AI town holding a park of 3 marked tiles was captured by real melee attacks (after
  `changeDamage` and `damageUnit` brought the defenses down): the park followed the new owner with every tile, each
  marker then read as the conqueror's on its own plot, no marker was doubled, and the park was redrawn for its
  new owner. A tile of another AI park that belonged to the captured town left that
  park untouched ("forgotten"). During the capture turn the sweep placed one marker on each of the two parks; the
  end state held one marker per tile.

Watched 2026-09-29, second round (seed 4242, Modern, lab games, release build with no dev probe unless named):

- **Towns.** A town bought a park for 1,600 Gold, and bought an expansion for 1,200 Gold from the panel (3 tiles,
  picker opened). The park's own icon shows in the town's purchase list (`06-expand-for-gold.jpg`).
- **The project with no probe.** Offered in a city with a park, and a completion gave 3 tiles.
- **Wonders keep their yields**, plain and sea tiles read 0 (see "Yield").
- **Costly tiles.** The question box for an Expedition Base (before bases were kept), a farm, a mine and jade; OK
  selects, the improvement is stripped, the marker lands.
- **Open sea.** Three sea tiles joined a coastal park, each with a `_WILD` marker; the park then had five buoy
  edges. A capture of the coastal park's look was not taken: the game could not come to the front while the Mac was
  in use.
- **Expedition Base kept**, Done with its question, the no-land notice, the full-size hint (see "Rules").
- **Protection** reverts and the urban cases (see "Rules").
- **Save and cold reload** of a game with a coastal park, a town park and a city park: records identical.
- **Hotseat.** Two human seats, Modern: a completion for player 1's park during player 0's seat was not auto-picked;
  after the seat passed and player 1 started their turn, the picker opened for player 1's park, and a tile joined
  with a marker owned by player 1.
- **Network game.** Not reached: a LAN game hosted from script refused its map size ("Map Size Unsupported") and the
  retries returned to the main menu; one attempt ended in the known load-transition crash (`0x21081fc`). Since 1.1.0
  the network mode is read-only (`setReadOnly`: no map write, no save write; parks read from the map, drawn, shaded
  and named; Expand refused). Watched in a single-player game switched into that mode (`simulateNetworkGame`, crash
  soak step M): zero writes, the save's record unchanged, every park drawn, Expand and buying refused, a park founded
  meanwhile registered and drawn. A real LAN game was watched on 2026-10-02 (see "Watched 2026-10-02").
- **Geographic Labels 1.5.0** (the Workshop copy then, dev copy disabled): no errors from this mod in `UI.log`; the
  picker's Rename opened the mod's own box, a new name saved and showed in the banner, Restore brought the generated
  one back. Keyboard typing into the box was not exercised (the field was set by script).
- **AI parks, unprompted.** With a wonder placed beside each AI's land, player 2 queued a park at turn 28 and two
  AIs had built parks by turn 35 (both beside wonders, registered and named by the mod). No AI queued Expand
  National Park in 35 turns; it has no AI weighting.
- **Crashes.** See `engine-closed.md` (UI-thread SIGSEGV entry): two before the writes-in-flight fix, none after it.

Watched 2026-09-30 (seed 4242, Modern, lab game, Geographic Labels 1.6.0 from the Workshop):

- **Payout on the tile.** With the yields layer on, park tiles showed +1 Culture +1 Happiness and wild tiles +2
  Culture +1 Happiness, Uluru its own yields; wilderness tiles showed +2 and +3 Influence and the founding tile +14
  (4, and 10 for the Redwood Forest beside it) (`04-yields-national-park.jpg`, `05-yields-wilderness-area.jpg`).
- **Wilderness Area.** Founded by a town beside the Redwood Forest, grown with two Gold purchases (1,200 each, taken
  from the treasury) through the picker, including a Niter tile after its question; drawn with no lodge, cabins or
  lookout, and its ocher border (captured that day; the README shots were retaken 2026-10-03). The town's Gold panel
  lists it; a city with a National Park lists that one, and its production list offers Expand National Park at 300.
- **Past the third ring.** Markers on a town's ring-4 and ring-5 tiles landed and paid.
- **Text for both kinds.** The picker and questions no longer say "park" where a Wilderness Area sees them ("Add
  this tile?"); the new strings loaded with the save and showed in the question box (`08-confirm-improvement.jpg`).
- **Geographic Labels 1.6.0.** See "Names": both kinds labeled and listed, Rename opened Rename Places filtered to
  the park (`11-rename-places.jpg`), a wilderness area's label hidden beside its wonder's.
- **Save and reload** of this game twice: both parks, their markers and drawings came back.

Watched 2026-09-30, late (seed 4242, Modern, lab games, Geographic Labels 1.6.1 from source):

- **Spread-out accents.** The plan ran in game: on Uluru's three lake tiles, cranes on one, fish and a reed clump on
  the next, leaping fish and three lily rafts on the third; a 24-tile park and the Redwood wilderness area drew
  without repeats side by side (`01`, `02`, `03`). The dense lilies and reeds on Uluru's lake are the map's own art:
  they stayed with the mod's drawing cleared.
- **Resources** (see "What a park may take"), the woodcutter question (`08`), fence sections (`12`), groves on
  wooded tiles.
- **Full park.** At 24 tiles the tile left over lapsed, Expand National Park is grayed out, and the Gold panel lists
  the park as "Already at its full size." with no button (`10`).
- **A park that changes hands keeps its waiting tiles.** Over five turns the Redwood town flipped to an independent
  power (the Ainu), and its wilderness area followed; one waiting tile stayed waiting, since an AI or independent park
  places tiles only when an expansion completes. Nothing shows it to a player.

- **The lens.** "Parks and Wilderness" listed in the lens menu; selected, it shaded Uluru's 7 tiles green and the
  Redwood area's 6 ocher, with their edges outlined (`13-parks-lens.jpg`). First tried at 0.45 / 0.65 alpha; lowered
  to 0.3 / 0.45 at the user's request. Ocher is the subtler of the two on tan tundra.

- **Options.** The National Park group listed under Add-ons in a game and from the main menu (`14-options.jpg`).
  Ticking "Shade park land on the map" (through the checkbox component's own toggle) shaded both parks on the
  default lens at once; unticking cleared it, and unticking the lens option took the lens out of the lens menu. Both
  settings read back after a save was reloaded, with the shading drawn. The settings store is Geographic Labels':
  the game's `localStorage.getItem()` can return another key's value, so a read not shaped like a settings root is
  never written back (`tests/np-settings.test.mjs`).

- **Civilopedia.** The National Parks section opened in game: all 14 pages and the Game Concepts pointer page drew
  every one of their 52 paragraphs (each key checked on screen), with no raw keys, and bold, bullets and yield icons
  rendered (`15-civilopedia.jpg`). Two group names cut off in the sidebar at about 18 characters and were shortened.
  The search box found the section for "Wilderness".
- **Text fixes found on the way.** The project descriptions still said a resource "is not collected", and the land
  descriptions sent yields "to the settlement"; both now match the rules. The Wilderness Area had borrowed the
  National Park's tooltip tag; it has its own, so each can be translated with its own grammar.

- **Civilopedia rewrite and Game Concepts.** Every page rewritten in plain language (the Yields page now opens with
  what a tile gives up and gets). A Parks and Wilderness group added to the game's Game Concepts section, sorted
  after its own groups: six pages, listed in the sidebar and drawing all their paragraphs in game. Real-world
  figures were checked against current sources on 2026-10-01 (wilderness system about 800 areas and more than 110
  million acres; Finland's twelve wilderness areas, 1991; Royal National Park, 1879). Official names keep their own
  spelling.

- **Translations.** Eleven languages besides English (the ten Demographics ships, and Traditional Chinese,
  `zh_Hant_HK`), machine-translated by one agent per language from a shared brief, using the game's own terms from its
  l10n files (`devtools/gen-glossary.py`). Every folder passes `devtools/check-locale.mjs` and `tests/i18n.test.mjs`
  (same tags, Language, placeholders, icons, markup; registered in the modinfo). Watched in Japanese (DisplayLanguage
  ja_JP): the mod's text and the Civilopedia drew, and `plural other?...;` with no `1?` form rendered for 1 and for 3.
  Watched in the other ten languages on 2026-10-02 (see "Watched 2026-10-02" below).
- **Crash soak (2026-10-01, `civilization_vii_mods/tools/crash-soak`, seed 9001, every other mod off).** Two drawings
  of one park 0.5 s apart crashed the game (native, AppHost thread): the first drawing's animal wake-up read a model
  the second had freed. With the draw generation in `np-draw.js` the same test runs on. A tile taken from a
  neighbouring settlement now carries a district and a marker of that settlement, and a 1.0.0 tile (both filed with
  the founding settlement) is rebuilt for its own settlement at the next sweep. That settlement built a Brickyard on
  such a tile (an urban district of its own); a Bazaar on the founding tile dissolved the park and left no stray
  district; save and reload and the Exploration to Modern transition kept every park district with its own
  settlement. 25 AI turns in all, no crash.
- **1.1.0 suite (2026-10-01, same harness).** Growth never offers park land (the marker counts as an improvement):
  candidates of every settlement held none, and over 20 AI turns AI cities grew by 7 with no park tile touched, so
  the strip-and-revert path is a safety net only. With every write a read-back sequence, the full run passed 54/54
  (a marker on land no park holds removed at the next scan; an AI park given 2 waiting tiles took them; the network
  mode as above); reload with a real dissolve 19/19 (the made district removed, the plot bought back and confirmed);
  the Exploration to Modern transition 19/19. Hotseat (two human seats, Exploration): seat 1's expansion waited
  through seat 0's turn, seat 0's Later did not silence seat 1's offer, each seat's tile got a marker of its own,
  6 seat turns clean. When the game shows the Start Turn curtain first, the picker waits behind it; a script cannot
  press that button.

- **1.2.0 suite (2026-10-01, Tower Bench lab, seed 4242, Modern, save `NP-final-suite`; screenshots of the game
  window).** Every item is under "Rules" and "The look": tiles keep their yields, 1.1.0 saves get theirs back, park
  land on wilderness districts offered to no building or growth, the founding tile moved when built over, the
  citizen of a stripped woodcutter returned, the purchase-list row and its purchase, the picker waiting for Choose
  land, an AI park buying an expansion, and woods filling the forest tiles. Three AI turns and a save and reload
  afterwards: no crash, no failed step, both parks unchanged.

- **1.2.0 transitions, conquest, hotseat and a replacement panel (2026-10-01).** Crash soak `npw` (seed 9001, short-age
  probe, every other mod off): both parks crossed Exploration to Modern with every tile on a wilderness district of its
  own city and its marker, no building offered park land before or after, and a building forced onto a founding tile
  in the Modern Age moved the park (58 of 59 checks; the conquest could not be staged in a fresh game, where the leaders
  had not met and script-placed units did not land in their land). Hotseat `npwhs3` (two human seats, nobody at the
  Mac): 43 of 43, the picker never opened by itself, each seat's Choose land prompt named its park, and the AI pass ran
  once per game turn ([[2,1],[3,1],[4,1]]); the first run's failure was a person pressing Start Turn and Choose land
  during it (`openPicker` now logs where it was opened from). In a lab game with `drongos-compact-production` on, the
  Expand row carried a 1,200 Gold pill; pressing it bought the expansion (2,012 to 812 Gold), left the build queue
  empty and opened the picker. Conquest, lab (save `NP-ai-decide2`, park met, Line Infantry, war, damage): the town
  holding an AI park fell; the park followed the conqueror with its name, its tiles in the town on wilderness
  districts filed with the conqueror's settlement, every piece the conqueror's. Its two tiles in another of the AI's
  settlements left the park and kept an empty wilderness district, dead land for their owner; `removeOrphanWilds` now
  takes such a district away at the full scan and buys the plot back (watched: both tiles bare, still the AI's).
  The removals seen with the mod switched off were traced on 2026-10-02 (crash soak `npd1`-`npd3`, save `NP-conquest`,
  every other mod off). Neither was aimed at park land. The conquered town was retaken by its old owner (player 4):
  in a capture the game removes every constructible of the town and adds it back under the new owner in the same
  moment, City Hall, Granary and mines as well as the park, and the park followed player 4. The independent power's
  settlement (one the player had founded, now held by the independent) was being taken apart by the game: in the
  independent's turn three districts went each turn, improvement and district together, then its Palace, and its land
  was released. Rural districts went the same way (two park tiles rebuilt on `DISTRICT_RURAL` were removed in the same
  turn as a wilderness control), so the wilderness district was not the cause. The defect was the mod's: each sweep
  put the same three tiles back, so the game removed them again every turn and the settlement never went. Fixed: an
  independent power's park is left to the game (`reconcileIndependent`; no marker, restore, release or orphan write on
  its land, no AI growth); a tile whose district the game removed is forgotten and the park ends with its founding
  improvement. Watched (`npd3fix`, 6 of 6): nothing put back, the park dissolved, the settlement was gone in three
  turns, no park piece on unowned land, the retaken town's park with player 4, the player's own park untouched.

- **Watched 2026-10-02 (crash soak, `civilization_vii_mods/tools/crash-soak`, every other mod off).**
  - *Network game* (`npn2`, `LAN=1`: a real LAN game hosted on this Mac, Modern, tiny map pinned before hosting): the
    mod started read-only by itself; a park founded on the map was registered, named and drawn, its founding tile left
    on its rural district; Expand was refused with the network text and grayed in the production list; buying was
    refused; three turns passed with no map write from the mod and the save's record never written (12 of 12).
  - *Coastal look* (`npc1` fresh, `npc2` after a save and reload; captures in `devtools/bench/shots/coastal-2026-10-02`):
    a park of 24 tiles, 10 of them water, each with its `_WILD` marker; the buoy at the edge where park water meets
    open sea, rowboats, a crab on the shore and birds over the bay, the same after the reload (3 of 3 each).
  - *Exploration civic gate* (`npe1`-`npe11`, seed 9001): the park refused before Society; Society completed as a
    player would (Piety, Inspiration, Society chosen and paid in Culture). A town founded by a Settler beside
    Hoerikwaggo was at first offered nothing, in Modern too (`npe7mod`): its tiles were undeveloped, and every plot the
    capitals were offered carried a rural district. Once two wonder-adjacent tiles were developed (rural district and
    farm), the plain one was offered and the one holding a resource was not; the park was bought there for 1,600 Gold,
    replaced the farm, was registered as "Hoerikwaggo National Park" on a wilderness district, took 1 tile per
    expansion, and stood a turn later. Giving the founding improvement `Constructible_ValidResources` rows let it onto
    the resource tile but took it off every plain one (`npe10`: the capital's 5 plain plots became 3 resource plots), so
    it was put back.
  - *Translations* (`npl-*`, `DISPLAY_LANG`, captures in `devtools/bench/shots/lang-2026-10-02`): in each of de_DE,
    es_ES, fr_FR, it_IT, ko_KR, pl_PL, pt_BR, ru_RU, zh_Hans_CN and zh_Hant_HK every tag composed to its own
    language's text (no raw tag, no English fallback), and the Civilopedia section opened with no raw tag and drew
    in its script. The only mismatches were plural forms chosen with no count given, read as correct by hand. Minor:
    three section headers ran under the sidebar's collapse button (German "Gründung & Wachstum", Italian
    "Fondazione e crescita", Spanish "Terreno de los parques"); shortened to "Anlage & Ausbau", "Creare e ampliare"
    and "Terreno del parque".

- **Founding on empty tiles and mountains (2026-10-02, crash soak `npf2`, `npm5`, seed 9001, Exploration).** Found
  hidden before Society, offered after; the founding improvement no longer buildable; a town bought Found National
  Park for 1,600 Gold, the picker opened on its four empty tiles, and a tile beside no wonder was chosen: the park stood
  there on a wilderness district, registered and named "Ravenna National Park"; a second National Park hidden in that
  town, a Wilderness Area still offered; the capital's Found Wilderness Area completed with production, the Choose land
  button opened the picker, and it stood on the chosen tile; a plot the town bought in ring 4 was offered; the town park
  then grew by a Gold expansion (20 of 20). Mountains: a mountain on a wilderness district was drawn as flat grassland
  (`npm3`, the user's report); moved to a rural district by the sweep it stood as a mountain again, kept its marker, and a
  mountain joining fresh got a rural district, its marker, and paid (+2 Culture, +3 Happiness to the town; 20 of 20).
  A marker with no district was refused by the engine (`npm4`). Not watched yet: an AI founding on its own; the Found
  text in languages other than English; the resource under a founding tile collected (no empty resource tile came up).

Not watched, by design: an AI building Expand National Park as a production item. The game gives projects no AI
weighting (no AiLists system for them; none queued it in 35 watched turns), so an AI buys its expansions with Gold
instead (`growAiParks`), which is watched.

## Open questions

- Visual joining of touching parks of one kind (one border, no walls between): shelved 2026-10-02.
- Balance: 300 production or 1,200 Gold per expansion, +1 Culture +1 Happiness per park tile and +3 Influence per
  wilderness tile, rising per tile at 8, 16 and 24 tiles, 1 and 3 tiles per completion, 24 tiles at most. A first draft.
- The appeal bias by biome was measured on three Play Now maps at turn 1 only; it now affects only where a park may be
  founded.
- Whether the AI should value Expand National Park; it gets no AI weighting and was not seen building it.
- Whether a park should claim unowned land beside it. It takes only the owner's land today.
