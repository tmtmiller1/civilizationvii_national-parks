// np-dialog.js
//
// National Park's decision pop-ups, in the same form as Emigration's (adapted from emigration-dilemma-view.js, so
// either mod works alone): a category line with its icon in bold capitals, the prompt soft-wrapped to a tidy width,
// a framed slanted quote under the base game's filigree divider, and one stacked button per choice.
//
// Two ways to show one:
// - showDecision: the game's own multi-option dialog (DialogBoxManager), the quote added by a screen-dialog-box
//   decorator that acts only on this mod's dialog titles. Used outside the tile picker.
// - askInPicker (np-picker.js) builds the same parts itself (decisionFrame here): the game's dialog switches the map
//   out of the picker's interface mode and the selection is lost.
"use strict";

import { safe, log } from "./np-core.js";

/** Row width the body and quote are wrapped at: the native dialog reads best as a block, not one long line. */
const BODY_WRAP = 64;
/** A visible blank line between paragraphs (an empty [N] line collapses in the native dialog). */
const PARAGRAPH_BREAK = "[N] [N]";
/** GameFace has no italic face (font-style: italic draws the line at 0x0); a skew draws the slant. */
const QUOTE_SLANT = "skewX(-8deg)";
const WARM_ID = "np-filigree-warm";

function compose(tag, ...a) { return safe(() => Locale.compose(tag, ...a), tag); }

/** Word-wrap one paragraph at about maxLen characters with engine newlines ([N]), never splitting a word. Pure. */
export function wrapParagraph(para, maxLen = BODY_WRAP) {
  const words = String(para || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > maxLen) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join("[N]");
}
function softWrap(s, maxLen = BODY_WRAP) { return String(s || "").split("[N]").map((p) => wrapParagraph(p, maxLen)).join("[N]"); }

/** Split a display quote (`"text" Who, Source`) at its closing quotation mark into the quote and attribution. Pure. */
export function splitQuote(q) {
  const s = typeof q === "string" ? q.trim() : "";
  const at = s.lastIndexOf("\" ");
  return at <= 0 ? { text: s, who: "" } : { text: s.slice(0, at + 1), who: s.slice(at + 2).trim() };
}
/** The quote and its attribution as wrapped display rows. Pure. */
export function quoteRows(quote, maxLen = BODY_WRAP) {
  const { text, who } = splitQuote(quote);
  const rows = (s) => (s ? wrapParagraph(s, maxLen).split("[N]") : []);
  return { text: rows(text), who: rows(who) };
}

/** The category line that opens a body: `[icon:X] [B]EYEBROW[/B]`. Pure. */
export function eyebrowLine(eyebrow, icon) {
  if (!eyebrow) return "";
  return (icon ? `[icon:${icon}] ` : "") + `[B]${String(eyebrow).toUpperCase()}[/B]`;
}
/** The body text: category line, the prose wrapped, then any detail lines, as paragraphs. Pure. */
export function composeBody(view, withQuote = false) {
  const parts = [];
  const eb = eyebrowLine(view.eyebrow, view.eyebrowIcon);
  if (eb) parts.push(eb);
  if (view.body) parts.push(softWrap(view.body));
  if (Array.isArray(view.details) && view.details.length) parts.push(view.details.join("[N]"));
  if (withQuote && view.quote) parts.push(softWrap(view.quote));
  return parts.join(PARAGRAPH_BREAK).replace(/\[N\]\[N\]/g, PARAGRAPH_BREAK);
}

function quoteLine(text, classes, slanted) {
  const line = document.createElement("div");
  line.classList.add("font-body", "text-accent-3", "text-center", ...classes);
  if (slanted) line.style.transform = QUOTE_SLANT;
  line.textContent = text;
  return line;
}
/** The quote block: the filigree divider, then the slanted quote and its attribution in an inner frame. */
export function quoteBlock(quote) {
  const block = document.createElement("div");
  block.classList.add("flex", "flex-col", "items-center", "w-full", "np-quote-block");
  const divider = document.createElement("div");
  divider.classList.add("filigree-divider-h3", "self-center");
  block.appendChild(divider);
  const frame = document.createElement("fxs-inner-frame");
  frame.classList.add("mx-4", "mb-3", "px-4", "py-3", "self-stretch", "flex", "flex-col", "items-center");
  const decor = document.createElement("div");
  decor.classList.add("absolute", "-top-1\\.5", "img-popup-middle-decor");
  frame.appendChild(decor);
  const rows = quoteRows(quote);
  for (const r of rows.text) frame.appendChild(quoteLine(r, ["text-base"], true));
  rows.who.forEach((r, i) => frame.appendChild(quoteLine(r, i ? ["text-sm"] : ["text-sm", "mt-2"], false)));
  block.appendChild(frame);
  return block;
}

/**
 * The parts of a decision built in place (for the tile picker): the game's modal frame with its filigreed title,
 * the body, the quote block and a group of large buttons. Returns the frame; the caller positions it.
 * `choices`: [{ label, onPress }].
 */
export function decisionFrame(view, choices) {
  const frame = document.createElement("fxs-modal-frame");
  frame.classList.add("screen-dialog-box__dialog-wrapper");
  frame.style.pointerEvents = "auto";
  const header = document.createElement("fxs-header");
  header.setAttribute("filigree-style", "h2");
  header.setAttribute("title", view.title || "");
  header.classList.add("font-title-xl");
  frame.appendChild(header);
  const body = document.createElement("div");
  body.classList.add("font-body", "text-base", "text-center", "py-3\\.5", "pointer-events-auto");
  body.innerHTML = safe(() => Locale.stylize(composeBody(view)), null) || composeBody(view);
  frame.appendChild(body);
  if (view.quote) frame.appendChild(quoteBlock(view.quote));
  // A plain centred column: the game's button group spaces its buttons sideways, which set the second one off-centre.
  const group = document.createElement("div");
  group.classList.add("flex", "flex-col", "items-center", "self-center", "px-8", "pb-2");
  for (const c of choices) {
    const btn = document.createElement("fxs-button");
    btn.setAttribute("type", "big");
    btn.setAttribute("caption", c.label);
    btn.classList.add("my-1");
    // A press arrives as both "click" and "action-activate"; act on the first.
    let last = 0;
    const run = () => { const now = Date.now(); if (now - last < 400) return; last = now; c.onPress(); };
    btn.addEventListener("action-activate", run);
    btn.addEventListener("click", run);
    group.appendChild(btn);
  }
  frame.appendChild(group);
  return frame;
}

/**
 * The game's modal frame for the mod's overlays (the picker's banner, the Choose land prompt, the rename box), in the
 * same form as the decisions: an optional filigreed title, then rows added by the caller. Returns { frame, header, add }
 * where `add(kind, html)` appends a centred text row ("eyebrow" for the category line, "text" for a body line) and
 * returns it, and `setTitle(text)` changes the title.
 */
export function overlayFrame(title, { compact = false } = {}) {
  // Both sizes are the game's modal frame with its filigreed title, as the decisions have; compact (the picker's banner,
  // the Choose land prompt) is the small version: tighter padding, the h4 filigree, smaller rows.
  const frame = document.createElement("fxs-modal-frame");
  frame.classList.add("screen-dialog-box__dialog-wrapper");
  frame.style.pointerEvents = "auto";
  if (compact) frame.style.padding = "0.9rem 2.2rem 0.6rem";
  else frame.style.minWidth = "36rem";
  let header = null;
  if (title != null) {
    header = document.createElement("fxs-header");
    header.setAttribute("filigree-style", compact ? "h4" : "h2");
    header.setAttribute("title", title);
    header.classList.add(compact ? "font-title-base" : "font-title-xl");
    frame.appendChild(header);
  }
  const add = (kind, html) => {
    const row = document.createElement("div");
    row.classList.add("font-body", compact ? "text-sm" : "text-base", "text-center", "pointer-events-auto",
      kind === "eyebrow" ? (compact ? "pt-1" : "pt-2") : (compact ? "py-0\\.5" : "py-1"));
    row.innerHTML = safe(() => Locale.stylize(html), null) || html;
    frame.appendChild(row);
    return row;
  };
  const setTitle = (text) => { if (header) header.setAttribute("title", text); };
  return { frame, header, add, setTitle };
}
/** A row of buttons for an overlay, centred; `stacked` puts them in a column as the decisions have them. */
export function buttonRow(buttons, stacked = false) {
  const row = document.createElement("div");
  row.classList.add("flex", stacked ? "flex-col" : "flex-row", "items-center", "justify-center", "self-center", "px-6", stacked ? "pt-2" : "pt-1", stacked ? "pb-3" : "pb-1");
  for (const b of buttons) row.appendChild(b);
  return row;
}

// the game's own dialog

const pendingQuotes = new Map();   // dialog title -> quote, taken when that dialog attaches
let decoratorReady = false;

class NpQuoteDecorator {
  constructor(val) { this.dialog = val; }
  beforeAttach() {}
  afterAttach() {
    safe(() => {
      const root = this.dialog && this.dialog.Root;
      const title = root && root.getAttribute ? root.getAttribute("title") || "" : "";
      if (!title || !pendingQuotes.has(title)) return;
      const quote = pendingQuotes.get(title);
      pendingQuotes.delete(title);
      const body = root.querySelector(".font-body.text-base");
      const host = body && body.parentElement ? body.parentElement : root.querySelector(".screen-dialog-box__dialog-wrapper");
      if (host) host.insertBefore(quoteBlock(quote), body ? body.nextSibling : null);
    });
  }
  beforeDetach() {}
  afterDetach() {}
}
function installDecorator() {
  if (decoratorReady) return;
  safe(() => {
    if (typeof Controls === "undefined" || typeof Controls.decorate !== "function") return;
    Controls.decorate("screen-dialog-box", (val) => new NpQuoteDecorator(val));
    decoratorReady = true;
  });
}

/**
 * Pre-load the filigree divider's texture: the engine decodes it asynchronously and does not repaint when it lands,
 * so a faint divider parked off-screen makes it resident before the first pop-up.
 */
export function warmFiligree() {
  safe(() => {
    if (typeof document === "undefined" || !document.body || document.getElementById(WARM_ID)) return;
    const el = document.createElement("div");
    el.id = WARM_ID;
    el.classList.add("filigree-divider-h3");
    el.style.cssText = "position:absolute;left:-4000px;top:0;opacity:0.01;pointer-events:none;";
    document.body.appendChild(el);
  });
}
if (typeof setTimeout === "function") setTimeout(warmFiligree, 1500);

/**
 * Show a decision in the game's own dialog: `view` { title, eyebrow, eyebrowIcon, body, details, quote, choices:
 * [{ id, label, note }], dismissId }. `onChoice(id)` runs once; Escape and the close button answer dismissId.
 */
export function showDecision(view, onChoice) {
  if (!view) return;
  installDecorator();
  warmFiligree();
  const dismissId = view.dismissId || "ok";
  let done = false;
  const resolve = (id) => { if (done) return; done = true; safe(() => onChoice && onChoice(id)); };
  const title = view.title || compose("LOC_NP_GEO_TYPE");
  if (view.quote && decoratorReady) pendingQuotes.set(title, view.quote);
  const choices = Array.isArray(view.choices) && view.choices.length ? view.choices : [{ id: dismissId, label: compose("LOC_GENERIC_OK") }];
  const options = choices.map((c) => ({
    actions: c.id === dismissId ? ["cancel", "keyboard-escape"] : [], label: c.label, tooltip: c.note || void 0,
    callback: () => resolve(c.id),
  }));
  const body = composeBody(view, !decoratorReady);
  const present = () => import("/core/ui/dialog-box/manager-dialog-box.js").then((m) => {
    const mgr = m && (m.DialogBoxManager || m.default);
    if (mgr && typeof mgr.createDialog_MultiOption === "function") {
      mgr.createDialog_MultiOption({ title, body, canClose: true, displayQueue: "SystemMessage", options, layout: "vertical" });
    } else log("dialog: DialogBoxManager.createDialog_MultiOption unavailable");
  }).catch((e) => log(`dialog: ${e}`));
  // Deferred: a dialog raised inside an engine event handler gets no input.
  if (typeof setTimeout === "function") setTimeout(present, 80); else present();
}
