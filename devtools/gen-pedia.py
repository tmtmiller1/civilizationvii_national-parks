#!/usr/bin/env python3
"""Generate the Civilopedia pages: data/np-civilopedia.xml (structure) and text/en_us/PediaText.xml (English).

Both come from the tables below, so a page's chapters and its text keys cannot drift apart. Run from the mod root:
    python3 devtools/gen-pedia.py
Then `npm run verify` (tests/pedia-pages.test.mjs walks the result the way the Civilopedia does).

Two places: the mod's own "National Parks" section (how the mod works), and a "Parks and Wilderness" group in the
base game's Game Concepts section (national parks and wilderness areas in the real world, and a pointer to the
mod's section). Style: American English, short plain statements, no commentary about the pages themselves. Official
names keep their owners' spelling. Translators edit text/<locale>/PediaText.xml, never this file; see text/README.md.
"""
from xml.sax.saxutils import escape

SECTION = "NATIONAL_PARK"
CONCEPTS = "CONCEPTS"
REAL_GROUP = "NP_REAL"

# (section, group id, title). The Game Concepts group sorts after the base game's own groups.
GROUPS = [
    (SECTION, "NP_START", "Getting Started"),
    (SECTION, "NP_GROW", "Founding & Growth"),
    (SECTION, "NP_LAND", "Park Land"),
    (SECTION, "NP_WORLD", "On the Map"),
    (SECTION, "NP_INTERFACE", "Lens & Options"),
    (CONCEPTS, REAL_GROUP, "Parks and Wilderness"),
]

# (section, page id, group, sidebar title, [(chapter id, chapter title or None, [paragraphs])], [search terms])
PAGES = [
    # ── The mod's own section ─────────────────────────────────────────────────────────────────────────────
    (SECTION, "NP_OVERVIEW", "NP_START", "National Parks", [
        ("CONTENT", None, [
            "Found a National Park on an empty, Charming tile a settlement owns, then expand it over the land around it: mountains, forests, lakes, rivers, the sea, natural wonders and open country. You choose which tiles it takes.",
            "Park tiles give [icon:YIELD_CULTURE] Culture and [icon:YIELD_HAPPINESS] Happiness on top of their own yields, and nothing can be built on them. Each park's tiles give more as the park grows. Each park is named after the place it protects and is drawn on the map with walls, trees and wildlife.",
        ]),
        ("KINDS", "Two Kinds", [
            "[B]National Park[/B]: gives [icon:YIELD_CULTURE] Culture and [icon:YIELD_HAPPINESS] Happiness. Has a warden's lodge, cabins and a lookout tower.",
            "[B]Wilderness Area[/B]: founded, expanded and protected the same way, but gives [icon:YIELD_DIPLOMACY] Influence. Has no buildings. A settlement can have one of each.",
        ]),
        ("WHERE", "How to Start", [
            "[BLIST][LI]Found a National Park or Wilderness Area with the [B]Found National Park[/B] or [B]Found Wilderness Area[/B] project in a city, or buy one with Gold from any settlement's purchase list, then press [B]Choose land[/B] and pick an empty, Charming tile for it.[LI]Expand it with the [B]Expand National Park[/B] or [B]Expand Wilderness Area[/B] project in a city, or buy an expansion with Gold from the settlement's purchase list.[LI]Press [B]Choose land[/B] and pick the new tiles on the map.[LI]Turn on the [B]Parks and Wilderness[/B] lens to see every park.[/LIST]",
        ]),
    ], ["NATIONAL_PARK", "WILDERNESS_AREA", "NATURAL_WONDER", "CONSERVATION"]),

    (SECTION, "NP_FAQ", "NP_START", "Questions", [
        ("NOFOUND", "Why can't I build a park?", [
            "You need the Society civic in the Exploration Age or Natural History in the Modern Age, a settlement that doesn't already have a park of that kind, and an empty, Charming flat or hill tile it owns: no district, improvement or building on it. If the civic was researched before the mod was added to the game, the park is not offered.",
        ]),
        ("NOGROW", "Why won't my park grow?", [
            "A park only takes tiles its owner already owns, next to the park. If there are none when an expansion finishes, you're told, and the tiles wait until land is available. Parks stop at 24 tiles. Parks don't grow in network games.",
        ]),
        ("WHICH", "National Park or Wilderness Area?", [
            "A National Park gives [icon:YIELD_CULTURE] Culture and [icon:YIELD_HAPPINESS] Happiness; a Wilderness Area gives [icon:YIELD_DIPLOMACY] Influence. A tile of either is worth about the same. A settlement can build both.",
        ]),
        ("LOSE", "What do I give up?", [
            "A farm, mine or other rural improvement on a tile that joins a park is removed (you're asked first), and the citizen who worked it comes back as new population for you to place. The tile keeps its own yields, and resources stay collected.",
        ]),
    ], ["HELP", "FAQ"]),

    (SECTION, "NP_ABOUT", "NP_START", "About This Mod", [
        ("CONTENT", None, [
            "National Parks 1.0.0, for Civilization VII 1.5.0. Adds content only; no base-game rules are changed. Enable it before starting a new game.",
        ]),
        ("COMPAT", "Other Mods", [
            "[BLIST][LI][B]Cultural Diffusion[/B] (recommended): its expanding borders give parks more land to grow into, including past the third ring.[LI][B]Geographic Labels[/B] 1.6.0 or later: park names are shown on the map and can be changed in Rename Places.[LI][B]Canals[/B]: canals are never dug through park land, and canal tiles can't join a park.[/LIST]",
        ]),
        ("CREDITS", "Credits", [
            "Made by Tower.",
        ]),
    ], ["CREDITS", "COMPATIBILITY"]),

    (SECTION, "NP_FOUNDING", "NP_GROW", "Founding a Park", [
        ("CONTENT", None, [
            "A city founds a park with the [B]Found National Park[/B] or [B]Found Wilderness Area[/B] project; a city or town can also buy one with Gold from its purchase list. Then press [B]Choose land[/B] and pick an empty flat or hill tile the settlement owns, in any ring, that is Charming (see below): no district, improvement or building on it. A resource on it stays collected. Only those tiles light up in the picker. Each settlement can have one National Park and one Wilderness Area.",
        ]),
        ("CHARMING", "Charming Land", [
            "A park is founded on Charming land: appeal 3 or more, as the game's appeal lens and tile tooltip show it. Appeal comes from the land around a tile: each neighboring mountain, coast, navigable river, forest, rainforest, taiga, savanna woodland or sagebrush steppe adds 1, and a neighboring natural wonder adds 6. Appeal matters only for the founding tile; the land a park grows over can be anything it may take, and a tile whose appeal later falls stays in the park.",
        ]),
        ("UNLOCK", "Unlocking", [
            "Exploration Age: the [B]Society[/B] civic. Modern Age: the [B]Natural History[/B] civic. A park built in the Exploration Age carries into the Modern Age with all its tiles.",
        ]),
        ("REWARD", "The Founding Tile", [
            "[B]National Park[/B]: +4 [icon:YIELD_HAPPINESS] Happiness, plus +5 [icon:YIELD_HAPPINESS] Happiness and +5 [icon:YIELD_CULTURE] Culture for each adjacent natural wonder.",
            "[B]Wilderness Area[/B]: +4 [icon:YIELD_DIPLOMACY] Influence, plus +10 [icon:YIELD_DIPLOMACY] Influence for each adjacent natural wonder.",
            "Both cost 2 [icon:YIELD_GOLD] Gold per turn in maintenance.",
        ]),
    ], ["FOUNDING", "SOCIETY", "NATURAL_HISTORY"]),

    (SECTION, "NP_GROWTH", "NP_GROW", "Expanding a Park", [
        ("CONTENT", None, [
            "Each expansion adds tiles next to the park: 1 tile in the Exploration Age, 3 in the Modern Age. The cost stays the same every time.",
        ]),
        ("PROJECT", "The Project", [
            "A city with a park can run [B]Expand National Park[/B] or [B]Expand Wilderness Area[/B] as often as it likes, for 300 [icon:YIELD_PRODUCTION] Production each time.",
        ]),
        ("GOLD", "Buying with Gold", [
            "Open the purchase list of any settlement with a park and buy [B]Expand National Park[/B] or [B]Expand Wilderness Area[/B]. It costs 1,200 [icon:YIELD_GOLD] Gold at Standard speed. Towns can't run projects, so this is how towns expand their parks.",
        ]),
        ("LIMIT", "Maximum Size", [
            "A park can have up to 24 tiles. When your selection fills it, the picker tells you, and any tiles left over from that expansion are lost.",
        ]),
    ], ["EXPAND", "PROJECT", "PURCHASE"]),

    (SECTION, "NP_PICKER", "NP_GROW", "Choosing Tiles", [
        ("CONTENT", None, [
            "When an expansion finishes, a [B]Choose land[/B] button appears at the top of the screen; after buying one with Gold, the picker opens right away. In the picker, the tiles the park can take light up on the map. Click a tile to select it, and click it again to deselect it.",
        ]),
        ("BUTTONS", "Buttons", [
            "[BLIST][LI][B]Confirm[/B]: add the selected tiles. The picker stays open if there are tiles left to place.[LI][B]Done[/B]: add the selected tiles and give up the rest of this expansion (you're asked first).[LI][B]Later[/B]: save the remaining tiles for another turn.[LI][B]Rename[/B]: rename the park.[/LIST]",
        ]),
        ("LATER", "Saved Tiles", [
            "While tiles are waiting, a [B]Choose land[/B] button at the top of the screen reopens the picker. Saved tiles carry over into the next age.",
        ]),
    ], ["PICKER", "SELECT"]),

    (SECTION, "NP_TAKE", "NP_LAND", "Which Tiles Can Join", [
        ("CONTENT", None, [
            "Any rural tile you own next to the park: open land, forest, mountains, lakes, rivers, ocean and natural wonders.",
        ]),
        ("RESOURCES", "Resources", [
            "A tile with a resource joins without a prompt, and the resource stays collected. The park replaces the plantation, camp or fishing boat that was collecting it.",
        ]),
        ("IMPROVE", "Improvements", [
            "If a tile has a farm, mine or other rural improvement and no resource, you're asked first, and the improvement is removed. An [B]Expedition Base[/B] stays where it is and keeps working.",
        ]),
        ("NEVER", "Never Allowed", [
            "Urban districts, buildings, another park's tiles, and tiles you don't own.",
        ]),
        ("FAR", "Beyond the Third Ring", [
            "Tiles past a city's third ring, whether bought or claimed by a mod such as Cultural Diffusion, can join a park and give the same yields.",
        ]),
    ], ["RESOURCES", "OPEN_SEA", "EXPEDITION_BASE"]),

    (SECTION, "NP_YIELDS", "NP_LAND", "Yields", [
        ("CONTENT", None, [
            "A tile that joins a park keeps its own yields, such as [icon:YIELD_FOOD] Food and [icon:YIELD_PRODUCTION] Production, and gives the park's yields below on top. It doesn't need a citizen to work it.",
        ]),
        ("TABLE", "Per Tile", [
            "[BLIST][LI][B]National Park[/B]: +1 [icon:YIELD_CULTURE] Culture, +1 [icon:YIELD_HAPPINESS] Happiness.[LI][B]Wilderness Area[/B]: +3 [icon:YIELD_DIPLOMACY] Influence.[/LIST]",
            "These grow with the size bonuses below.",
        ]),
        ("MILESTONES", "Size Bonuses", [
            "Each National Park and Wilderness Area counts its own tiles. When one reaches 8, 16 and 24 tiles, every tile of it gives more:",
            "[BLIST][LI][B]National Park[/B]: each tile gives +2 [icon:YIELD_CULTURE] Culture and +1 [icon:YIELD_HAPPINESS] Happiness at 8 tiles, +2 [icon:YIELD_CULTURE] and +2 [icon:YIELD_HAPPINESS] at 16, and +3 [icon:YIELD_CULTURE] and +2 [icon:YIELD_HAPPINESS] at 24.[LI][B]Wilderness Area[/B]: each tile gives +4 [icon:YIELD_DIPLOMACY] Influence at 8 tiles, +5 at 16 and +6 at 24.[/LIST]",
            "The count is the land the park holds now: tiles lost, built over or let go count against it, and its tiles step back down. Your other parks don't count toward it.",
            "The founding tile keeps its own yields at every size.",
        ]),
        ("WONDERS", "Natural Wonders", [
            "A natural wonder keeps its own yields too and gets the park's yields on top.",
        ]),
        ("SHOWN", "Seeing the Yields", [
            "Turn on the yields layer to see each tile's yields on the map. They go to the settlement that owns the park.",
        ]),
    ], ["YIELDS", "CULTURE", "HAPPINESS", "INFLUENCE"]),

    (SECTION, "NP_PROTECT", "NP_LAND", "Protection", [
        ("CONTENT", None, [
            "Park land can't be developed. No settlement, yours or the AI's, can build on it or expand into it.",
        ]),
        ("RURAL", "Rural Improvements", [
            "If anyone, including the AI, builds a rural improvement on park land, it is removed and the tile goes back to the park.",
        ]),
        ("URBAN", "Buildings and Districts", [
            "Buildings and urban districts are never removed. If one ends up on a park tile anyway, that tile leaves the park. If it is the founding tile, the park moves its founding tile to another of its tiles, next to the natural wonder if it can.",
        ]),
        ("HANDS", "Changing Owners", [
            "When a settlement is conquered, its park goes to the new owner with all its tiles. A single park tile taken by another player leaves the park.",
        ]),
    ], ["PROTECTION", "CONQUEST"]),

    (SECTION, "NP_LOOK", "NP_WORLD", "How Parks Look", [
        ("CONTENT", None, [
            "Each park is drawn to match its land: woods that fill its forest tiles, trees, rocks and cairns on hills, lily pads and reeds on lakes and rivers, the occasional rowboat, low stone walls with sections of fence along its land edges, and buoys where it meets open water.",
            "A National Park has a warden's lodge and picnic shelter on its founding tile, cabins once it grows, and a lookout tower on a hill. A Wilderness Area has no buildings.",
        ]),
        ("WILDLIFE", "Wildlife", [
            "Animals to suit each tile: bison, horses, deer, elk, camels, sheep, llamas, elephants, foxes, cranes and crabs, with birds and butterflies overhead, fish in lakes and rivers, and schools of fish, reef fish and the occasional whale at sea. Neighboring tiles never show the same herd, flock or fish.",
        ]),
        ("BORDER", "Borders", [
            "A dashed line shows exactly which tiles are in the park: green for a National Park, ocher for a Wilderness Area.",
        ]),
    ], ["WILDLIFE", "WALLS"]),

    (SECTION, "NP_NAMES", "NP_WORLD", "Names", [
        ("CONTENT", None, [
            "A new park is named after a natural wonder beside it, such as Uluru National Park. Otherwise, or if that name is taken, it is named after a nearby river or place, or its settlement. The name doesn't change as the park grows.",
        ]),
        ("RENAME", "Renaming", [
            "Press [B]Rename[/B] in the park's picker. [B]Restore[/B] brings back the original name.",
        ]),
        ("LABELS", "Geographic Labels", [
            "With Geographic Labels 1.6.0 or later, park names are shown on the map and listed in Rename Places under Park or wilderness. A new park can also be named after a nearby mountain range, lake or region.",
        ]),
    ], ["NAMES", "RENAME", "GEOGRAPHIC_LABELS"]),

    (SECTION, "NP_OTHERS", "NP_WORLD", "AI and Multiplayer", [
        ("AI", "AI Parks", [
            "AI players found parks too, usually beside a natural wonder, and every so often an AI buys its park an expansion with Gold. An AI park picks its new tiles right away, preferring wonders and mountains, and never takes a tile that would cost it an improvement.",
        ]),
        ("HOTSEAT", "Hotseat", [
            "Each player chooses tiles for their own parks on their own turn.",
        ]),
        ("NETWORK", "Network Games", [
            "Parks can be built but can't expand: the Expand projects are unavailable, and there is no tile picker or Gold purchase.",
        ]),
    ], ["AI", "MULTIPLAYER", "HOTSEAT"]),

    (SECTION, "NP_LENS", "NP_INTERFACE", "Parks Lens", [
        ("CONTENT", None, [
            "The [B]Parks and Wilderness[/B] lens in the lens menu shades every park tile you can see: green for National Parks and ocher for Wilderness Areas, with the founding tile a little darker. Display only.",
        ]),
    ], ["LENS", "OVERLAY"]),

    (SECTION, "NP_OPTIONS", "NP_INTERFACE", "Options", [
        ("CONTENT", None, [
            "Options, Add-ons, National Parks. Available from the main menu and in game; settings carry over between games.",
        ]),
        ("OVERLAY", "Shade Park Land", [
            "Shades every park on the map all the time, whatever lens is on. Off by default. Takes effect immediately.",
        ]),
        ("LENSBUTTON", "Parks Lens", [
            "Adds the Parks and Wilderness lens to the lens menu. On by default.",
        ]),
    ], ["OPTIONS", "SETTINGS"]),

    # ── Game Concepts: parks and wilderness in the real world ─────────────────────────────────────────────
    (CONCEPTS, "NP_REAL_PARKS", REAL_GROUP, "National Parks", [
        ("CONTENT", None, [
            "A national park is land a country sets aside to protect its scenery, wildlife and natural features, while letting the public visit. Most are owned and run by a national government.",
        ]),
        ("ORIGINS", "The First Parks", [
            "In 1864 the U.S. Congress granted Yosemite Valley and the Mariposa Grove of giant sequoias to California \"for public use, resort, and recreation.\" On March 1, 1872, President Ulysses S. Grant signed the act that created Yellowstone, the world's first national park.",
            "Naturalist John Muir campaigned for Yosemite and founded the Sierra Club in 1892. In 1906 President Theodore Roosevelt signed the Antiquities Act, which lets a president protect land as a national monument; the Grand Canyon was protected that way in 1908 and became a national park in 1919.",
        ]),
        ("NPS", "The National Park Service", [
            "Congress created the U.S. National Park Service in 1916 to care for the parks and leave them \"unimpaired for the enjoyment of future generations.\" It now manages more than 400 sites, more than 60 of them national parks, from Acadia in Maine to Denali in Alaska. Website: nps.gov",
        ]),
        ("PEOPLE", "Indigenous Lands", [
            "Many national parks were created on land taken from Indigenous peoples. Some have since been returned or are run jointly. Uluru-Kata Tjuta National Park in Australia was handed back to its traditional owners, the Anangu, in 1985; they lease it to the government and manage it together with Parks Australia.",
        ]),
    ], ["NATIONAL_PARK", "YELLOWSTONE", "YOSEMITE", "NPS"]),

    (CONCEPTS, "NP_REAL_WILD", REAL_GROUP, "Wilderness Areas", [
        ("CONTENT", None, [
            "A wilderness area is protected land kept as free of human development as possible: no roads, buildings or motor vehicles. Visitors travel on foot, on horseback or by canoe, and there are few facilities.",
        ]),
        ("US", "In the United States", [
            "The first was the Gila Wilderness in New Mexico, set aside by the Forest Service in 1924 at the urging of forester Aldo Leopold.",
            "The Wilderness Act of 1964, written largely by Howard Zahniser and signed by President Lyndon B. Johnson, describes wilderness as an area \"where the earth and its community of life are untrammeled by man, where man himself is a visitor who does not remain.\" It created the National Wilderness Preservation System, which now has about 800 wilderness areas covering more than 110 million acres, managed by four federal agencies. Website: wilderness.net",
        ]),
        ("ELSEWHERE", "Elsewhere", [
            "Other countries protect wilderness in their own ways. Finland set aside twelve wilderness areas in Lapland in 1991, and Australia's Tasmanian Wilderness has been a World Heritage Site since 1982.",
        ]),
    ], ["WILDERNESS_AREA", "WILDERNESS_ACT"]),

    (CONCEPTS, "NP_REAL_WORLD", REAL_GROUP, "Parks Around the World", [
        ("CONTENT", None, [
            "After Yellowstone, other countries created national parks of their own. Some of the earliest and best known:",
        ]),
        ("LIST", "Firsts and Landmarks", [
            "[BLIST][LI][B]Australia[/B]: Royal National Park, south of Sydney, in 1879, the second national park in the world.[LI][B]Canada[/B]: Banff, which began as a hot springs reserve in 1885. Parks Canada, founded in 1911, was the world's first national park service.[LI][B]New Zealand[/B]: Tongariro, from land given in 1887 by Te Heuheu Tūkino IV, paramount chief of Ngāti Tūwharetoa.[LI][B]Sweden[/B]: nine national parks in 1909, the first in Europe.[LI][B]Switzerland[/B]: the Swiss National Park, 1914, the first in the Alps.[LI][B]South Africa[/B]: Kruger National Park, 1926.[LI][B]Japan[/B]: its first national parks in 1934.[LI][B]United Kingdom[/B]: the Peak District, 1951. British national parks include farms, villages and towns.[LI][B]Tanzania[/B]: Serengeti National Park, 1951.[LI][B]Ecuador[/B]: Galápagos National Park, 1959.[LI][B]Greenland[/B]: Northeast Greenland National Park, 1974, the largest national park in the world, at about 375,000 square miles.[/LIST]",
        ]),
    ], ["WORLD_PARKS"]),

    (CONCEPTS, "NP_REAL_KINDS", REAL_GROUP, "Kinds of Protected Area", [
        ("CONTENT", None, [
            "The International Union for Conservation of Nature (IUCN) sorts protected areas into categories by how they are managed:",
            "[BLIST][LI][B]Ia[/B] Strict nature reserve[LI][B]Ib[/B] Wilderness area[LI][B]II[/B] National park[LI][B]III[/B] Natural monument or feature[LI][B]IV[/B] Habitat or species management area[LI][B]V[/B] Protected landscape or seascape[LI][B]VI[/B] Protected area with sustainable use of natural resources[/LIST]",
            "The National Parks and Wilderness Areas in this game are modeled on categories II and Ib.",
        ]),
        ("HERITAGE", "World Heritage", [
            "Many parks are also UNESCO World Heritage Sites. Yellowstone was among the first sites listed, in 1978.",
        ]),
        ("THIRTY", "30 by 30", [
            "In 2022, nearly 200 countries adopted the Kunming-Montreal Global Biodiversity Framework, which aims to protect 30 percent of the world's land and sea by 2030.",
        ]),
    ], ["IUCN", "PROTECTED_AREA", "WORLD_HERITAGE"]),

    (CONCEPTS, "NP_REAL_LINKS", REAL_GROUP, "Further Reading", [
        ("CONTENT", None, [
            "[BLIST][LI]U.S. National Park Service: nps.gov[LI]U.S. wilderness areas: wilderness.net[LI]Parks Canada: parks.canada.ca[LI]Parks Australia: parksaustralia.gov.au[LI]South African National Parks: sanparks.org[LI]UK National Parks: nationalparks.uk[LI]IUCN: iucn.org[LI]Protected Planet, a database of the world's protected areas: protectedplanet.net[LI]UNESCO World Heritage: whc.unesco.org[/LIST]",
        ]),
    ], ["LINKS"]),

    (CONCEPTS, "NP_BRIDGE", REAL_GROUP, "In This Game", [
        ("CONTENT", None, [
            "You can found National Parks and Wilderness Areas on empty land your settlements own and expand them over the surrounding land. The rules are in the [B]National Parks[/B] section.",
        ]),
    ], ["NATIONAL_PARK", "WILDERNESS_AREA"]),
]

TERMS = {
    "NATIONAL_PARK": "National Park", "WILDERNESS_AREA": "Wilderness Area", "NATURAL_WONDER": "Natural Wonder",
    "CONSERVATION": "Conservation", "HELP": "Help", "FAQ": "FAQ", "CREDITS": "Credits", "COMPATIBILITY": "Compatibility",
    "FOUNDING": "Founding", "SOCIETY": "Society", "NATURAL_HISTORY": "Natural History", "EXPAND": "Expand",
    "PROJECT": "Project", "PURCHASE": "Purchase", "PICKER": "Picker", "SELECT": "Select", "RESOURCES": "Resources",
    "OPEN_SEA": "Ocean", "EXPEDITION_BASE": "Expedition Base", "YIELDS": "Yields", "CULTURE": "Culture",
    "HAPPINESS": "Happiness", "INFLUENCE": "Influence", "PROTECTION": "Protection", "CONQUEST": "Conquest",
    "WILDLIFE": "Wildlife", "WALLS": "Walls", "NAMES": "Names", "RENAME": "Rename",
    "GEOGRAPHIC_LABELS": "Geographic Labels", "AI": "AI", "MULTIPLAYER": "Multiplayer", "HOTSEAT": "Hotseat",
    "LENS": "Lens", "OVERLAY": "Overlay", "OPTIONS": "Options", "SETTINGS": "Settings",
    "YELLOWSTONE": "Yellowstone", "YOSEMITE": "Yosemite", "NPS": "National Park Service",
    "WILDERNESS_ACT": "Wilderness Act", "WORLD_PARKS": "National Parks of the World", "IUCN": "IUCN",
    "PROTECTED_AREA": "Protected Area", "WORLD_HERITAGE": "World Heritage", "LINKS": "Links",
}


def row(tag, text):
    return f'        <Row Tag="{tag}"><Text>{escape(text)}</Text></Row>'


def prefix(section, pid):
    return f"LOC_PEDIA_{section}_PAGE_{pid}"


def data_xml():
    out = ['<?xml version="1.0" encoding="utf-8"?>', "<!--",
           "  Civilopedia pages for National Parks. GENERATED by devtools/gen-pedia.py: edit that, not this file.",
           "  The mod's own section, and a Parks and Wilderness group in the base game's Game Concepts section.",
           "  Chapter text resolves by key convention (base-standard model-civilopedia.js):",
           "  LOC_PEDIA_(section)_PAGE_(page)_CHAPTER_(chapter)_TITLE and ..._PARA_1, _PARA_2, ... until the first gap;",
           "  the text is in text/en_us/PediaText.xml. Layouts come first: pages and layout chapters have a foreign key",
           "  onto them.", "-->", "<Database>", "    <CivilopediaSections>",
           f'        <Row SectionID="{SECTION}" Name="LOC_PEDIA_{SECTION}_TITLE" Icon="pedia_improvements" SortIndex="170"/>',
           "    </CivilopediaSections>", "", "    <CivilopediaPageGroups>"]
    for i, (sec, gid, _t) in enumerate(GROUPS):
        sort = (i + 1) * 10 if sec == SECTION else 900
        out.append(f'        <Row SectionID="{sec}" PageGroupID="{gid}" Name="LOC_PEDIA_{gid}_TITLE" SortIndex="{sort}"/>')
    out += ["    </CivilopediaPageGroups>", "", "    <CivilopediaPageLayouts>"]
    for _s, pid, *_ in PAGES:
        out.append(f'        <Row PageLayoutID="{pid}" UseSidebar="false"/>')
    out += ["    </CivilopediaPageLayouts>", "", "    <CivilopediaPageLayoutChapters>"]
    for _s, pid, _g, _t, chapters, _x in PAGES:
        for i, (cid, *_r) in enumerate(chapters):
            out.append(f'        <Row PageLayoutID="{pid}" ChapterID="{cid}" SortIndex="{(i + 1) * 10}"/>')
    out += ["    </CivilopediaPageLayoutChapters>", "", "    <CivilopediaPages>"]
    counts = {}
    for sec, pid, gid, _t, _c, _x in PAGES:
        counts[gid] = counts.get(gid, 0) + 10
        out.append(f'        <Row SectionID="{sec}" PageID="{pid}" PageGroupID="{gid}" PageLayoutID="{pid}" Name="{prefix(sec, pid)}_TITLE" SortIndex="{counts[gid]}"/>')
    out += ["    </CivilopediaPages>", "", "    <CivilopediaPageSearchTerms>"]
    for sec, pid, _g, _t, _c, terms in PAGES:
        for term in terms:
            out.append(f'        <Row SectionID="{sec}" PageID="{pid}" Term="LOC_PEDIA_NP_TERM_{term}"/>')
    out += ["    </CivilopediaPageSearchTerms>", "</Database>", ""]
    return "\n".join(out)


def text_xml():
    out = ['<?xml version="1.0" encoding="utf-8"?>', "<!--",
           "  English Civilopedia text for National Parks. GENERATED by devtools/gen-pedia.py from the same tables as",
           "  data/np-civilopedia.xml; edit the script, not this file. Translations live in text/<locale>/PediaText.xml",
           "  as <Replace Tag=... Language=...> rows (see text/README.md). Markup: [B]..[/B] bold, [BLIST][LI]..[/LIST]",
           "  bullets, [icon:YIELD_X] yield icons.",
           "-->", "<Database>", "    <EnglishText>",
           row(f"LOC_PEDIA_{SECTION}_TITLE", "National Parks")]
    for _s, gid, title in GROUPS:
        out.append(row(f"LOC_PEDIA_{gid}_TITLE", title))
    for sec, pid, _g, title, chapters, _x in PAGES:
        p = prefix(sec, pid)
        out += ["", f"        <!-- {title} -->", row(f"{p}_TITLE", title)]
        for cid, ctitle, paras in chapters:
            if ctitle:
                out.append(row(f"{p}_CHAPTER_{cid}_TITLE", ctitle))
            for n, para in enumerate(paras, 1):
                out.append(row(f"{p}_CHAPTER_{cid}_PARA_{n}", para))
    out += ["", "        <!-- Search terms -->"]
    for key, word in TERMS.items():
        out.append(row(f"LOC_PEDIA_NP_TERM_{key}", word))
    out += ["    </EnglishText>", "</Database>", ""]
    return "\n".join(out)


if __name__ == "__main__":
    used = {t for p in PAGES for t in p[5]}
    missing = used - TERMS.keys()
    assert not missing, f"search terms with no text: {sorted(missing)}"
    unused = TERMS.keys() - used
    assert not unused, f"search terms no page uses: {sorted(unused)}"
    with open("data/np-civilopedia.xml", "w", encoding="utf-8") as f:
        f.write(data_xml())
    with open("text/en_us/PediaText.xml", "w", encoding="utf-8") as f:
        f.write(text_xml())
    print(f"{len(PAGES)} pages, {sum(len(p[4]) for p in PAGES)} chapters")
