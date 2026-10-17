// The game loads a UI module another script imports only if the modinfo lists it under ImportFiles, and a missing
// one breaks every script that imports it, which no other test here would notice.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => fs.readFileSync(root + p, "utf8");

test("modinfo: every UI module a script imports is in ImportFiles for both ages, and every listed file exists", () => {
  const modinfo = read("national-parks.modinfo");
  // The history-corrections groups load text only.
  const groups = [...modinfo.matchAll(/<ActionGroup id="([^"]+)" scope="game"[\s\S]*?<\/ActionGroup>/g)]
    .filter(([, id]) => !id.startsWith("history-corrections-"));
  assert.equal(groups.length, 2, "an Exploration and a Modern action group");
  const imported = new Set();
  for (const f of fs.readdirSync(root + "ui").filter((x) => x.endsWith(".js"))) {
    for (const m of read("ui/" + f).matchAll(/from "\.\/([\w-]+\.js)"/g)) imported.add(m[1]);
  }
  assert.ok(imported.has("np-plan-kit.js") && imported.has("np-core.js"), "the import scan found too little");
  for (const [group, id] of groups) {
    const files = (group.match(/<ImportFiles>([\s\S]*?)<\/ImportFiles>/) || ["", ""])[1];
    for (const f of imported) assert.ok(files.includes(`<Item>ui/${f}</Item>`), `${id}: ui/${f} is imported but not in ImportFiles`);
    for (const m of files.matchAll(/<Item>([^<]+)<\/Item>/g)) assert.ok(fs.existsSync(root + m[1]), `${id}: ${m[1]} does not exist`);
  }
});
