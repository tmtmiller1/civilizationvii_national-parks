// np-picker-rename.js - National Parks: renaming a park when Geographic Labels isn't there to do it.
"use strict";

import ViewManager from "/core/ui/views/view-manager.js";
import { displayName, log, safe, save } from "./np-core.js";
import { buttonRow, overlayFrame } from "./np-dialog.js";
import { refreshGeoLabels } from "./np-names.js";
import { button, compose, hideBannerWhile, kindLine, overlayBox } from "./np-picker-kit.js";

const RENAME_ID = "np-rename";

function nameField(park) {
  const field = document.createElement("fxs-textbox");
  field.setAttribute("value", displayName(park));
  field.classList.add("self-center", "my-3");
  field.style.cssText = "width:24rem;pointer-events:auto;";
  return field;
}

/** Save the typed name, Restore the generated one (once the park has its own), or Cancel. */
function renameButtons(park, field, close) {
  const setName = (name) => {
    park.customName = name;
    save();
    refreshGeoLabels();
    log(`park ${park.id} ${name ? `renamed "${name}"` : "name restored"}`);
    close();
  };
  const buttons = [button("LOC_NP_RENAME_SAVE", null, () => setName(String(field.getAttribute("value") || "").trim()))];
  if (park.customName) buttons.push(button("LOC_NP_RENAME_RESTORE", null, () => setName("")));
  buttons.push(button("LOC_NP_RENAME_CANCEL", null, close));
  return buttons;
}

/** A small box to rename a park: its own name, or Restore for the generated one. */
export function openParkRename(park, done = () => {}) {
  safe(() => { const old = document.getElementById(RENAME_ID); if (old) old.remove(); });
  const box = overlayBox(RENAME_ID, "0");
  box.style.bottom = "0";
  box.style.justifyContent = "center";
  hideBannerWhile(box);
  const o = overlayFrame(compose("LOC_NP_RENAME_TITLE"));
  o.add("eyebrow", kindLine(park.kind));
  const field = nameField(park);
  o.frame.appendChild(field);
  const worldInput = safe(() => ViewManager.isWorldInputAllowed, true);
  safe(() => { ViewManager.isWorldInputAllowed = false; });  // keep typed letters away from map hotkeys
  const close = () => {
    safe(() => { ViewManager.isWorldInputAllowed = worldInput; });
    box.remove();
    done();
  };
  o.frame.appendChild(buttonRow(renameButtons(park, field, close), true));
  box.appendChild(o.frame);
  document.body.appendChild(box);
  return true;
}
