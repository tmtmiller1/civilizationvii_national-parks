// The decision pop-ups' pure parts: which quote a moment gets, and how a quote and a body are laid out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUOTE_POOLS, seedIndex, quoteTag } from "../ui/np-quotes.js";
import { splitQuote, quoteRows, composeBody, eyebrowLine } from "../ui/np-dialog.js";

const english = readFileSync(new URL("../text/en_us/ModuleText.xml", import.meta.url), "utf8");

test("quotes: a moment always gets the same quote, and every pool's quotes have text", () => {
  for (const [pool, n] of Object.entries(QUOTE_POOLS)) {
    assert.ok(n > 0, `${pool} is empty`);
    assert.equal(quoteTag(pool, "found|7"), quoteTag(pool, "found|7"));
    for (let i = 1; i <= n; i++) assert.ok(english.includes(`Tag="LOC_NP_QUOTE_${pool}_${i}"`), `LOC_NP_QUOTE_${pool}_${i}`);
    assert.ok(!english.includes(`Tag="LOC_NP_QUOTE_${pool}_${n + 1}"`), `${pool} counts fewer quotes than it has`);
  }
  assert.equal(quoteTag("NONE", "x"), "");
});

test("quotes: seeds spread over a pool", () => {
  const seen = new Set();
  for (let id = 0; id < 200; id++) seen.add(seedIndex(`found|${id}`, 10));
  assert.equal(seen.size, 10);
});

test("quotes: every row reads as a quotation, then who and where", () => {
  for (const m of english.matchAll(/Tag="LOC_NP_QUOTE_[A-Z]+_\d+">\s*<Text>([^<]*)<\/Text>/g)) {
    const { text, who } = splitQuote(m[1]);
    assert.ok(/^".+"$/.test(text), `not quoted: ${m[1]}`);
    assert.ok(/^[A-Z][^,]+, .+\(\d{4}\)$/.test(who), `attribution: ${who}`);
  }
});

test("dialog: the quote wraps into rows, the attribution on its own", () => {
  const rows = quoteRows('"' + "word ".repeat(30).trim() + '" John Muir, Our National Parks (1901)');
  assert.ok(rows.text.length > 1 && rows.text.every((r) => r.length <= 64));
  assert.deepEqual(rows.who, ["John Muir, Our National Parks (1901)"]);
});

test("dialog: the body opens on the category line, paragraphs a visible line apart", () => {
  assert.equal(eyebrowLine("Wilderness Area", "YIELD_DIPLOMACY"), "[icon:YIELD_DIPLOMACY] [B]WILDERNESS AREA[/B]");
  const body = composeBody({ eyebrow: "National Park", eyebrowIcon: "YIELD_HAPPINESS", body: "Add this tile?" });
  assert.equal(body, "[icon:YIELD_HAPPINESS] [B]NATIONAL PARK[/B][N] [N]Add this tile?");
});
