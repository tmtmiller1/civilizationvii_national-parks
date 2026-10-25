# Changelog

All notable changes to National Parks are documented here. This project follows
semantic versioning.

## [1.3.1] - 2026-10-25

- A park can claim land that nobody holds. When you choose its tiles, unclaimed land beside it lights up too, out to
  ring 6 from its settlement, and taking a tile makes it the settlement's land as well as the park's. It costs the
  same as any other tile. Another player's or an independent power's land stays theirs. An AI's park takes its own
  land first and claims when the wilder land lies past its border.
- The quotes on the park pop-ups rotate: each time the same kind of pop-up comes up, it shows the next quote in its
  set, so you'll see them all. Before, the same moment always showed the same quote, and most never came up.
- The Expand descriptions, the Civilopedia and the README say which land a park can take, in every language.

## [1.3.0] - 2026-10-25

- A new park starts with 4 tiles. Found National Park or Found Wilderness Area costs what it did, and after you pick
  the founding tile the picker stays open for 3 more tiles beside it. An AI's new park takes its 3 once its founding
  tile stands.
- Expanding is cheaper and goes tile by tile: Expand National Park and Expand Wilderness Area cost 100 production
  (400 Gold) for 1 tile in both ages. Before, an expansion cost 300 (1,200 Gold) for 1 tile in the Exploration Age
  and 3 in the Modern Age.
- A park can be founded on water: any empty coast, lake or ocean tile the settlement owns, Charming or not, and it
  can stay all water. A National Park founded on water puts its lodge and paths on the first land it takes; until it
  has some, it's drawn without buildings, like a Wilderness Area. A founding tile that's built over can move onto
  the park's water too, when it has no land left to go to.
- A park's founding tile pays what the rest of its land pays as well: +1 Culture and +1 Happiness in a National
  Park, +3 Influence in a Wilderness Area, with its own +4 and the natural wonder bonus on top. It used to give only
  the +4, so it never showed the park's icons.
- Buoys mark how far a park reaches at sea: a few, on the far corners of its water, floating where you can see them.
  A line of single tiles gets one at each end. Before, they were scattered along about half the edges, and over deep
  ocean they sank out of sight.
- The game text, the Civilopedia and the README describe the new rules, in every language the mod ships.

## [1.2.1] - 2026-10-17

- License: from this version the mod is under the Tower Mod License 1.0, in LICENSE. You can still play it, read the
  code and change your own copy for your own games. Reuploading it, reusing its code in other projects and using it
  to train AI need my written permission. Earlier versions stay under MIT, and `ui/settings-keeper.js` stays MIT so
  other mods can keep embedding it.
- Carries Civilopedia History Corrections. With Civilopedia Expanded: Independents on, six East Asian history pages
  in the Civilopedia (Goguryeo, the Oirat, two Ryukyu pages, Nanzhao and Balhae) give each side where historians in
  different countries disagree, and a few factual errors are fixed. With it off, the game's pages stay as they are.

## [1.2.0] - 2026-10-17

- Walls and fences now run along a park's border, and inside it only round the warden's station at its entrance. A
  wall between two of the park's own tiles, out in the middle of it, read as a maze. A Wilderness Area has no station,
  so it has walls on its border only.
- Cold seas look cold. Reef fish keep to warm water; on a coast from 40 degrees of latitude toward either pole you'll
  see crabs at the waterline, sponges on the sea floor and more whales out at sea instead.
- A tropical Wilderness Area's rarer animals are elephants now, not giraffes, which keep to the plains.
- No change in game from the rest of this release's work: the mod's largest files are split into smaller ones, each
  part tested on its own against what the old code did, step for step.
- A resource tile in a park keeps the camp, mine or woodcutter its owner builds there. Since 1.1.1 a resource tile
  has joined a park with its harvester standing, but the park's upkeep took off one built afterwards, and an AI that
  built it again lost it again, all game long. Now it stays, the same as when the tile joins.
- When the game won't let a park take an improvement off its land, the park tries three times and then leaves it
  until the game is loaded again, as it already did for its other repairs. One long AI game had logged 808 tries.
- A park you'd bought but not yet placed could go missing if the age changed while Autoplay was running. Autoplay
  treats you as an AI, so the mod placed your park for you, and the game then ignored the request. Parks now wait
  until Autoplay stops, and your founding is still waiting for you to choose its land when you take over.
- If the game won't place a new park on the tile you chose, the mod tries three times and then gives the founding
  back: it waits for land again with what you paid for it, a notice says what happened, and Choose land offers you
  other tiles. An AI's founding finds another tile by itself. If the park does turn up on the first tile later, it
  counts as that founding, so you don't end up with a second park or a refund on top.
- A park you paid for whose tile something else is built on before the park appears now goes back to waiting with
  what you paid, the same way: you're told, and Choose land offers you other tiles. The same happens if that tile
  passes to another player first; if the settlement itself is lost, you get the Gold back. A park that has already
  appeared on the map ends as before.

## [1.1.3] - 2026-10-14

- The license now says that Civilization VII and its art and data belong to Firaxis and 2K. The mod itself plays
  exactly as in 1.1.2: the only code change takes out a helper and an import that nothing used.

## [1.1.2] - 2026-10-07

- Settings kept after a restart. Civilization VII reads back only the first entry in its mod storage, whichever one
  a mod asks for, so options set in one session could come back as another mod's data or not at all, and a mod
  saving its options could copy that data under its own name. National Parks now carries the Tower Settings Keeper
  file, which keeps every mod's settings inside the one entry the game reads correctly and repairs a store another
  mod has already put out of order, without deleting anything. National Parks' options (park markers, the lens
  button) now keep their values from one launch to the next, and so do other mods' options that use the shared
  settings entry.
- The file runs before any other script and changes nothing else in the mod. If several mods carry it, or the
  standalone Tower Settings Keeper is installed too, one copy runs and the newest build wins. Nothing to set up:
  existing settings carry over. Tower Settings Keeper:
  [GitHub](https://github.com/tmtmiller1/civilizationvii_tower-settings-keeper), [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815023570).

## [1.1.1] - 2026-10-06

- Every tile with a resource now looks exactly as the game draws it. In 1.1.0 the park put the resource's own model
  back on most resource tiles, which restored silver's ore but not coffee's bushes; now any resource tile joins the park
  as a tile with an Expedition Base does: it keeps its improvement, carries no park marker, pays its own yields
  instead of the park's, and the park draws nothing on it.

## [1.1.0] - 2026-10-05

- A park is now planned as a whole before any of it is drawn, and each tile draws its part of that plan. Footpaths
  run from the warden's lodge to a camp, a cabin village, a shelter, the lookouts, the monuments and the water's edge
  as one joined network; cabins stand along their path, a camp sits at its path's end, and trees part where a path
  runs. Woods thin toward open land, stands of trees gather along shores and the edges of woods and run on across
  tile edges, and shrubs and rocks grow in patches instead of single clumps. Land far from the paths is left to itself.
- A park carries less as it grows, not more of the same: at most four structures, two lookouts and three monuments,
  three or four herds and a few flocks, however large it is.
- Monuments have a setting. A cairn, an obelisk or a Wilderness Area's dolmen stands on a hill where the park has one,
  never on a tile a river crosses, with rocks and low scrub at its foot and the trees held back round it. The cairn
  is drawn at about a third of its old size, in scale with the cabins.
- Herds keep to open ground the park leaves for them, away from the lodge, the cabins, the tents and the paths.
- Lookout towers stand where there is something to look out over: on a cliff above the sea first, then along the
  coast, on a cliff, by a lake or on a hill, at the water's side of the tile. A large park by the sea can carry three.
- Nothing stands in a river. Camps, monuments, lookouts and trees keep to its banks, herds graze beside it, and a
  footpath's bare earth stops at each bank.
- A tile with a resource looks as the game draws it. For most resources the park puts back the resource's own model
  and the tile's own vegetation, which the game hides on park land, and places nothing else there. Tea, cotton,
  citrus, sugar, jade, niter, salt, rubies, ivory, horses, wool, hides, furs, truffles, cloves, lapis lazuli and
  nickel are drawn by the game in a way the park cannot restore, so a tile with one of those joins the park as a
  tile with an Expedition Base does: it keeps its improvement, carries no park marker, pays its own yields instead
  of the park's, and is left exactly as the game draws it.
- Hiking trails can be followed on sand and snow: there they are a narrow gravel track marked with cairns.
- A cabin village gathers round a small green instead of lining its path.
- The animals are drawn larger, so they can be seen at the zoom the game is played at.
- A Found National Park or Found Wilderness Area project can no longer be wasted. A settlement queues only one at a
  time, and buying the founding for Gold takes the queued project out of the build queue.
- If a Found or Expand project still completes with nothing left to do (the settlement already has that park, the park
  is at its full size, or the park is gone), its cost comes back as Gold and a notice says why.
- A park that was paid for but not yet placed is refunded if its settlement is lost first. Before, the Gold or
  production was gone.
- A new park that has no free Charming tile can be cancelled for what it cost, from the notice that says so; the
  notice returns every 10 turns while it waits.
- Hotseat: Gold being spent, pop-ups and refund notices are kept per player, so one seat's purchase or refund never
  shows up on another's turn.

## [1.0.4] - 2026-10-05

- Saving a National Parks option can no longer wipe other mods' saved options. The game sometimes reports the shared
  options store as empty when it is not; if that happened at the moment you changed one of this mod's options, the
  store was written back holding only this mod's options. The store is now read again before an empty answer is
  believed, a failed read never leads to a write, and only the options you changed are written.

## [1.0.3] - 2026-10-05

- Cabin villages are laid out as a lodge trail: two loose rows of smaller cabins facing each other across a curving
  dirt trail, with a tree between each pair of cabins. They replace the ring of cabins round a clearing.
- Nothing grows through a building: trees, shrubs and grass tufts keep clear of cabins, shelters, tents, lookout
  towers and monuments, and animals no longer stand inside them.
- "End this expansion?" now has a Later button, as its text says: the tiles you selected are added and the rest of the
  expansion is kept for another turn.
- Trees no longer pile into each other: a tile takes at most one yellow birch grove (the model is already a whole
  grove), woods and cabin rows take none, and no tree stands in another's crown.
- The wildflower clumps in Wilderness Areas are gone: they read as yellow blots on the map. A Wilderness Area still
  gains rarer wildlife at 16 tiles and old-growth giants at 24.
- Nothing is built on standing water: shelters, lookout towers, cairns and monuments keep off marsh, bog, oasis and
  watering-hole tiles, and a warden's lodge founded on one stands on dry ground instead of in the pond.
- A park reads as one place instead of a set of separate tiles. Footpaths run from the warden's lodge to each cabin
  village, campsite, shelter, lookout and monument and join up from tile to tile; stands of trees gather toward the
  woods next door or meet a neighbor's stand across the shared edge, and woods thin out over the tiles beside them.
- Each stretch of one biome in a park has its own character: one kind of tree, open meadow or parkland or groves, one
  herd animal and one bird across the whole stretch.
- Cabins, tents and picnic shelters gather within three tiles of the warden's lodge; the rest of a National Park's land
  is left to itself.
- Buildings and animals are drawn to one scale. Animals are about half their old size (an elk no longer stands taller
  than a cabin), and tents, picnic shelters, lookout towers, the lodge's sign and rowboats are smaller.
- Animals stand on open ground, clear of buildings and trees and apart from each other, and a herd is strung out along
  a line and headed one way instead of circling its leader.
- Trees stand along a bending line, unevenly spaced with one taller than the rest, not in a ring; plains parks use the
  game's mixed tree clumps instead of rows of one small elm; the same scatter of plants no longer repeats on every tile.
- A campsite is a crescent of tents on one side of its fire, and the trees on the warden's lodge's tile stand behind
  the lodge, not in front of it.

## [1.0.2] - 2026-10-04

- A Wilderness Area now shows its growth without adding trees: wildflowers among the grass from 8 tiles, rarer wildlife
  from 16 (goats on hills, giraffes on open tropical and plains land, turtles on a shore), and old-growth giants at 24.
- The mod's folder and files are now named `national-parks`. If you installed 1.0.0 or 1.0.1 by hand, delete the old
  `national-park` folder from Mods before copying this one in. Saves and options carry over.

## [1.0.1] - 2026-10-04

- No change in game: the mod plays exactly as 1.0.0. Repository housekeeping only.

## [1.0.0] - 2026-10-04

The first release, for Civilization VII 1.5.0.

- **National Parks and Wilderness Areas**, from the Exploration Age on. Found one with a city project or buy it for
  Gold in any city or town, then pick an empty, Charming tile the settlement owns. A National Park pays Culture and
  Happiness and has a warden's lodge, cabins and a lookout; a Wilderness Area is its twin paid in Influence, with no
  buildings. One of each per settlement.
- **Grow it tile by tile.** Expand with a repeatable city project or buy an expansion for Gold, then choose the land on
  the map: mountains, forests, lakes, rivers, the sea, natural wonders and open country, up to 24 tiles. A tile keeps
  its own yields and gives the park's on top; resources stay collected; a farm or mine is removed only after you
  confirm, and its citizen returns as new population.
- **Size bonuses.** Each park earns more on every tile as it reaches 8, 16 and 24 tiles of its own, and steps back down
  if land is lost.
- **Protected land.** No settlement, yours or an AI's, builds on park land. Roads still cross it.
- **It looks like a park.** Drawn from the game's own art for its land: woods, meadows, stones and cairns, lily pads
  and reeds, campsites, cabin villages and lookouts, dry-stone walls and fences along its edges and at the foot of its
  mountains, and animated wildlife, birds and fish. It grows richer at 8, 16 and 24 tiles, with monuments scattered
  over its land. A dashed border and a light shading mark it, and the Parks and Wilderness lens shows every park.
- **Named for its place,** after a natural wonder, river or settlement nearby, and renamed from its picker; with
  Geographic Labels, drawn on the map and listed in Rename Places.
- **AI players** found, grow and buy for their parks with their own Gold. A conquered settlement's park goes with it.
- **Civilopedia** section on every rule, and pages on national parks in the real world.
- **Twelve languages:** English, German, Spanish, French, Italian, Japanese, Korean, Polish, Portuguese (Brazil),
  Russian, and Simplified and Traditional Chinese.
- **Options:** show or hide the park borders and shading, and list the lens in the lens menu.
- Single-player and hotseat. In network games, parks already on the map are drawn and named, but new ones are not
  founded.
