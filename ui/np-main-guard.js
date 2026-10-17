// np-main-guard.js - National Parks: park land protected through the game's placement query and requests, and the
// Found and Expand projects gated there.
"use strict";

import { allParkTiles, idx, isFull, kindByProject, locOf, log, safe } from "./np-core.js";
import { foundQueued, foundingRefusal, parkOfCity } from "./np-main-founding.js";
import { state } from "./np-main-state.js";

function plotOfArgs(args) {
  if (!args || args.X == null || args.Y == null || args.X < 0 || args.Y < 0) return -1;
  return safe(() => idx({ x: args.X, y: args.Y }), -1);
}

/** Which plots a request may use, or null when this mod has no say in it: park land is refused to every build. */
function ruleFor(type, args) {
  const building = type === CityOperationTypes.BUILD || type === CityCommandTypes.PURCHASE;
  const expanding = type === CityCommandTypes.EXPAND;
  if (!(building && args && args.ConstructibleType != null) && !expanding) return null;
  const land = allParkTiles();
  if (!land.size) return null;
  return { keep: (p) => !land.has(p), reason: "LOC_NP_TILE_IS_PARKLAND" };
}

function foundKindOf(type, args) {
  if (type !== CityOperationTypes.BUILD || !args || args.ProjectType == null) return null;
  return state.foundKeys.get(args.ProjectType) || null;
}

function isExpandProject(type, args) {
  return type === CityOperationTypes.BUILD && !!args && args.ProjectType != null
    && state.projectKeys.has(args.ProjectType);
}

/** The kind ("park" or "wilderness") an Expand project raw id belongs to, or null. */
function projectKind(raw) {
  const k = kindByProject(safe(() => GameInfo.Projects.lookup(raw).ProjectType, null));
  return k ? k.key : null;
}

/** An Expand request from a settlement whose park of that kind is at its full size. */
function expandsFullPark(cityID, type, args) {
  return isExpandProject(type, args) && isFull(parkOfCity(cityID, projectKind(args.ProjectType)));
}

function refuse(res, reason) {
  return { ...(res || {}), Success: false, Plots: [], ExpandUrbanPlots: [],
    FailureReasons: [safe(() => Locale.compose(reason), reason)] };
}

export function wrapCanStart(original) {
  return function (cityID, type, args, ...rest) {
    const res = original(cityID, type, args, ...rest);
    if (!state.on) return res;
    try { return guardedAnswer(cityID, type, args, res); } catch (_e) { return res; }
  };
}

/** The game's answer to a placement query, with park land kept from every build and the projects gated. */
function guardedAnswer(cityID, type, args, res) {
  // A park does not grow in a network game (nothing answers the project's completion there).
  if (state.multiplayer && isExpandProject(type, args)) return refuse(res, "LOC_NP_MULTIPLAYER");
  // Refused, not hidden: the production list shows the project grayed out, and its text names the size limit.
  if (expandsFullPark(cityID, type, args)) return { ...(res || {}), Success: false };
  const fk = foundKindOf(type, args);
  if (fk) return foundAnswer(cityID, fk, res);
  return landAnswer(type, args, res);
}

/** A Found project: hidden or grayed with its reason, as foundingRefusal says. */
function foundAnswer(cityID, fk, res) {
  // One at a time: a second copy in the build queue would complete with nothing left to found.
  const why = foundingRefusal(cityID, fk) || (foundQueued(cityID, fk) ? "hide" : "");
  if (why === "hide") return { ...(res || {}), Success: false, Requirements: { ...((res && res.Requirements) || {}), MeetsRequirements: false } };
  if (why) return refuse(res, why);
  return res;
}

/** A build, purchase or expansion: refused on a park tile, and park tiles taken out of the plots it offers. */
function landAnswer(type, args, res) {
  const rule = ruleFor(type, args);
  if (!rule || !res) return res;
  const at = plotOfArgs(args);
  if (at >= 0) return rule.keep(at) ? res : refuse(res, rule.reason);
  if (!hasPlots(res)) return res;
  const out = { ...res };
  if (Array.isArray(res.Plots)) out.Plots = res.Plots.filter(rule.keep);
  if (Array.isArray(res.ExpandUrbanPlots)) out.ExpandUrbanPlots = res.ExpandUrbanPlots.filter(rule.keep);
  if (!hasPlots(out)) return refuse(res, rule.reason);
  return out;
}

function hasPlots(r) { return (r.Plots && r.Plots.length) || (r.ExpandUrbanPlots && r.ExpandUrbanPlots.length); }

export function wrapSendRequest(original) {
  return function (cityID, type, args, ...rest) {
    if (state.on && refusedRequest(cityID, type, args)) return false;
    return original(cityID, type, args, ...rest);
  };
}

/** Whether a request is kept from the game: the projects the placement query refuses, and any build on park land. */
function refusedRequest(cityID, type, args) {
  if (state.multiplayer && safe(() => isExpandProject(type, args), false)) { log("Expand National Park refused: network game"); return true; }
  if (safe(() => expandsFullPark(cityID, type, args), false)) { log("Expand National Park refused: the park is at its full size"); return true; }
  const fk = safe(() => foundKindOf(type, args), null);
  if (fk && safe(() => foundingRefusal(cityID, fk) || (foundQueued(cityID, fk) ? "hide" : ""), "hide")) { log(`Found ${fk.key} refused in ${cityID && cityID.id}`); return true; }
  const rule = safe(() => ruleFor(type, args), null);
  const at = plotOfArgs(args);
  if (!(rule && at >= 0 && !rule.keep(at))) return false;
  const l = locOf(at);
  log(`request refused at ${l.x},${l.y}: ${rule.reason}`);
  return true;
}
