// A Node module hook that stands in for the game's own UI modules (/core/..., /base-standard/...), which the mod's
// screens import and which exist only inside the game. Each one comes back as a module whose named exports and
// default answer anything: enough for np-main.js and its screens to load under the tests. Registered by a test with
// `register("./game-modules-loader.mjs", import.meta.url)` before it imports them.
const GAME = /^\/(core|base-standard)\//;

export async function resolve(specifier, context, next) {
  if (GAME.test(specifier)) return { url: "game-stub:" + specifier, shortCircuit: true };
  return next(specifier, context);
}

// The names the mod imports from the game's modules (np-picker.js, np-purchase.js, np-options.js).
const NAMES = ["CategoryData", "InterfaceMode", "Audio", "ContextManager", "InputHandlerState", "CategoryType", "OptionType",
  "Options"];

export async function load(url, context, next) {
  if (!url.startsWith("game-stub:")) return next(url, context);
  const source = `
const anything = () => new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : anything()),
  apply: () => anything(), construct: () => anything(),
});
${NAMES.map((n) => `export const ${n} = anything();`).join("\n")}
export default class GameModule {};
`;
  return { format: "module", source, shortCircuit: true };
}
