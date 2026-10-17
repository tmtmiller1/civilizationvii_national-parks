// A small stand-in for the game, for driving np-core.js's map-writing code in Node. It holds plots (owner, terrain,
// resource), constructibles and districts, answers the reads np-core.js makes, and applies the requests it sends
// (CREATE_ELEMENT, DESTROY_ELEMENT) unless a test has told it to refuse one. Every request and every log line goes into
// `trace` in the order it happened, so a test can pin what a sweep did, step by step.
//
// Timing: np-core.js waits for each result with `until` (setTimeout and Date.now). Tests enable node:test's mock timers
// and call `settle()`, which advances them until every queued sequence has finished.

export const W = 12, H = 40;
const CITY = (owner, id = 1) => ({ owner, id, type: 1 });

export function makeEngine() {
  const plots = new Map();       // plot -> { owner, terrain, resource, feature, city }
  const items = new Map();       // component id -> { type, owner, plot, complete, localId }
  const districts = new Map();   // plot -> { type, owner, id, cityId }
  const store = new Map();
  const cities = new Map();      // `${owner}:${id}` -> { population }
  const trace = [];
  const refusals = [];           // (kind, args) => true to drop a request
  let nextId = 1;

  const loc = (i) => ({ x: i % W, y: Math.floor(i / W) });
  const at = (x, y) => y * W + x;
  const plot = (i) => plots.get(i) || { owner: -1, terrain: "TERRAIN_FLAT", resource: "", feature: "", city: null };
  const cityOf = (c) => {
    const key = `${c.owner}:${c.id}`;
    if (!cities.has(key)) cities.set(key, { population: 5 });
    return cities.get(key);
  };

  const e = {
    trace, refusals,
    /** Set what a plot is: { owner, terrain, resource, feature, city: id } (city defaults to 1 when owned). */
    setPlot(i, over) {
      const p = { ...plot(i), ...over };
      if (p.owner >= 0 && !p.city) p.city = 1;
      plots.set(i, p);
    },
    /** Put a constructible on a plot; returns its id. `city` files it with another settlement than the plot's. */
    build(i, type, owner = plot(i).owner, { complete = true, city = 0, elsewhere = false } = {}) {
      const id = nextId++;
      items.set(id, { type, owner, plot: i, complete, localId: id, city, elsewhere });
      return id;
    },
    district(i, type = "DISTRICT_RURAL", owner = plot(i).owner, city = 0) {
      districts.set(i, { type, owner, id: nextId++, cityId: CITY(owner, city || plot(i).city || 1) });
    },
    typesAt(i) { return [...items.values()].filter((c) => c.plot === i).map((c) => c.type).sort(); },
    districtAt(i) { return districts.get(i) ? districts.get(i).type : ""; },
    population(owner, id = 1) { return cityOf(CITY(owner, id)).population; },
  };

  function apply(kind, a) {
    if (refusals.some((r) => r(kind, a))) { trace.push(["refused", kind, a.Kind, a.Type || a.LocalID]); return; }
    const i = a.Location ? at(a.Location.x, a.Location.y) : -1;
    if (kind === "CREATE_ELEMENT" && a.Kind === "DISTRICT") {
      districts.set(i, { type: a.Type, owner: a.Owner, id: nextId++, cityId: a.Parent });
    } else if (kind === "CREATE_ELEMENT" && a.Kind === "CONSTRUCTIBLE") {
      // One improvement per plot: a new one replaces the one there (engine-closed.md).
      const imp = (t) => /^IMPROVEMENT_/.test(t);
      if (imp(a.Type)) for (const [id, c] of items) if (c.plot === i && imp(c.type)) items.delete(id);
      const id = nextId++;
      items.set(id, { type: a.Type, owner: a.Owner, plot: i, complete: true, localId: id, city: a.Parent ? a.Parent.id : 0 });
    } else if (kind === "DESTROY_ELEMENT" && a.Kind === "CONSTRUCTIBLE") {
      const c = items.get(a.LocalID);
      if (c) {
        items.delete(a.LocalID);
        const p = plot(c.plot);
        if (p.city && /^IMPROVEMENT_/.test(c.type) && !/NATIONAL_PARK|WILDERNESS_AREA/.test(c.type)) {
          cityOf(CITY(p.owner, p.city)).population--;
        }
      }
    } else if (kind === "DESTROY_ELEMENT" && a.Kind === "DISTRICT") {
      for (const [p, d] of districts) {
        if (d.id === a.LocalID) { districts.delete(p); e.setPlot(p, { owner: -1, city: null }); }
      }
    }
  }

  const lookup = (field) => ({ lookup: (t) => ({ [field]: t }) });
  // Resources and features come back as indices, as the game gives them; -1 for none.
  const names = [];
  const index = (name) => { if (!name) return -1; if (!names.includes(name)) names.push(name); return names.indexOf(name); };
  const named = (field) => ({ lookup: (n) => ({ [field]: names[n] }) });
  globalThis.GameplayMap = {
    getIndexFromLocation: (l) => at(l.x, l.y),
    getLocationFromIndex: (i) => loc(i),
    getGridWidth: () => W, getGridHeight: () => H,
    getAdjacentPlotLocation: (l, d) => {
      const odd = l.y % 2;
      const steps = [[1, 0], [odd, 1], [odd - 1, 1], [-1, 0], [odd - 1, -1], [odd, -1]];
      const [dx, dy] = steps[d];
      const x = l.x + dx, y = l.y + dy;
      return x < 0 || y < 0 || x >= W || y >= H ? { x: -1, y: -1 } : { x, y };
    },
    getOwner: (x, y) => plot(at(x, y)).owner,
    getOwningCityFromXY: (x, y) => { const p = plot(at(x, y)); return p.owner >= 0 && p.city ? CITY(p.owner, p.city) : null; },
    getTerrainType: (x, y) => plot(at(x, y)).terrain,
    getBiomeType: () => "BIOME_GRASSLAND",
    getFeatureType: (x, y) => index(plot(at(x, y)).feature),
    getResourceType: (x, y) => index(plot(at(x, y)).resource),
    isWater: (x, y) => plot(at(x, y)).terrain === "TERRAIN_COAST",
    isMountain: (x, y) => plot(at(x, y)).terrain === "TERRAIN_MOUNTAIN",
    isLake: () => false, isRiver: () => false, isNavigableRiver: () => false,
    getAppeal: () => 4, getYield: () => 1, getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    getRevealedState: () => 1,
  };
  globalThis.MapConstructibles = {
    getConstructibles: (x, y) => [...items.entries()].filter(([, c]) => c.plot === at(x, y)).map(([id]) => id),
  };
  globalThis.Constructibles = {
    getByComponentID: (id) => {
      const c = items.get(id);
      return c ? { type: c.type, owner: c.owner, complete: c.complete, localId: c.localId,
        location: c.elsewhere ? loc((c.plot + 7) % (W * H)) : loc(c.plot),
        cityId: CITY(c.owner, c.city || plot(c.plot).city || 1) } : null;
    },
  };
  globalThis.Districts = {
    getAtLocation: (l) => { const d = districts.get(at(l.x, l.y)); return d ? { ...d, location: l } : null; },
    getIdAtLocation: (l) => { const d = districts.get(at(l.x, l.y)); return d ? { owner: d.owner, id: d.id } : null; },
    get: (id) => { for (const [p, d] of districts) if (d.id === id.id) return { ...d, location: loc(p) }; return null; },
  };
  globalThis.GameInfo = {
    Constructibles: lookup("ConstructibleType"), Districts: lookup("DistrictType"), Terrains: lookup("TerrainType"),
    Biomes: lookup("BiomeType"), Features: named("FeatureType"), Resources: named("ResourceType"),
    Feature_NaturalWonders: [{ FeatureType: "FEATURE_WONDER" }], GlobalParameters: [{ Name: "APPEAL_FOR_HAPPINESS_TILE_YIELD", Value: 4 }],
    Ages: { lookup: () => ({ AgeType: "AGE_ANTIQUITY" }) },
    Projects: { lookup: (t) => ({ ProjectType: t, $index: t }) },
    Types: { lookup: (t) => ({ Hash: "hash:" + t }) },
    ProgressionTreeNodeUnlocks: [{ TargetType: "IMPROVEMENT_NATIONAL_PARK", ProgressionTreeNodeType: "NODE_PARKS" },
      { TargetType: "IMPROVEMENT_WILDERNESS_AREA", ProgressionTreeNodeType: "NODE_PARKS" }],
  };
  globalThis.YieldTypes = { YIELD_GOLD: "YIELD_GOLD", YIELD_HAPPINESS: "YIELD_HAPPINESS", YIELD_FOOD: "YIELD_FOOD",
    YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE",
    YIELD_DIPLOMACY: "YIELD_DIPLOMACY" };
  globalThis.CityOperationTypes = { BUILD: "BUILD" };
  globalThis.OrderTypes = { ORDER_ADVANCE: 1 };
  globalThis.CityOperationsParametersValues = { RemoveAt: "RemoveAt" };
  globalThis.CityCommandTypes = { PURCHASE: "PURCHASE", EXPAND: "EXPAND" };
  const ops = (name) => ({
    canStart: (_city, type, args) => ({ Success: true, Plots: args && args.X != null ? [] : undefined }),
    sendRequest: (city, type, args) => { trace.push([name, type, JSON.parse(JSON.stringify(args || {}))]); },
  });
  // Players 0-7 are major civilizations (0 the human at the screen, the rest AIs); 8 and up are independent powers.
  // Each has a city 1 holding the plots set with its owner; `e.gold` and `e.income` set the treasury and Gold a turn.
  e.gold = new Map(); e.income = 30;
  e.queues = new Map();   // `${owner}:${city}` -> build queue entries
  const cityObject = (c) => ({ id: c, name: `City ${c.owner}-${c.id}`, ...globalThis.Cities.get(c) });
  const player = (o) => ({
    id: o, isMajor: o < 8, isHuman: o === 0, isAlive: true,
    Treasury: { get goldBalance() { return e.gold.get(o) ?? 1000; } },
    Stats: { getNetYield: () => e.income },
    Culture: { isNodeUnlocked: () => true },
    Diplomacy: { isAtWarWith: () => !!e.atWar },
    Cities: { getCities: () => (o >= 0 ? [cityObject(CITY(o, 1))] : []) },
  });
  globalThis.Players = {
    get: (o) => player(o),
    isAlive: () => true,
    getAliveMajorIds: () => [0, 1, 2],
    getAlive: () => [0, 1, 2, 9].map(player),
    grantYield: (o, y, n) => { trace.push(["grant", o, y, n]); e.gold.set(o, (e.gold.get(o) ?? 1000) + n); },
  };
  globalThis.Cities = {
    get: (c) => {
      const city = cityOf(c);
      return {
        get population() { return city.population; },
        addRuralPopulation: () => { trace.push(["population", c.owner, c.id]); },
        purchasePlot: (l) => { const i = at(l.x, l.y); e.setPlot(i, { owner: c.owner, city: c.id }); trace.push(["buy", i]); },
        getPurchasedPlots: () => [...plots.entries()].filter(([, p]) => p.owner === c.owner && p.city === c.id).map(([i]) => i),
        owner: c.owner, name: `City ${c.owner}-${c.id}`, location: { x: 0, y: 0 },
        Production: { getProjectProductionCost: () => 100 },
        BuildQueue: { getQueue: () => e.queues.get(`${c.owner}:${c.id}`) || [] },
        Yields: { getNetYield: () => 5 },
      };
    },
  };
  globalThis.Game = {
    turn: 1, age: 0, CityOperations: ops("CityOperations"), CityCommands: ops("CityCommands"),
    PlayerOperations: { sendRequest: (_player, kind, args) => { trace.push(["request", kind, args.Kind, args.Type || args.LocalID, args.Location ? at(args.Location.x, args.Location.y) : -1]); apply(kind, args); return true; } },
  };
  globalThis.GameContext = { localPlayerID: 0, hasSentTurnComplete: () => false };
  globalThis.RevealedStates = { HIDDEN: 0 };
  globalThis.DirectionTypes = { DIRECTION_EAST: 0, DIRECTION_SOUTHEAST: 1, DIRECTION_SOUTHWEST: 2, DIRECTION_WEST: 3,
    DIRECTION_NORTHWEST: 4, DIRECTION_NORTHEAST: 5 };
  globalThis.Configuration = {
    getGame: () => ({ getValue: (k) => store.get(k) ?? null }),
    editGame: () => ({ setValue: (k, v) => { store.set(k, v); } }),
  };
  const toStderr = console.error;
  console.error = (m, ...rest) => {
    if (/^\[NationalPark\] /.test(String(m))) trace.push(["log", String(m).replace(/^\[NationalPark\] /, "")]);
    else toStderr(m, ...rest);
  };
  return e;
}
