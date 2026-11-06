// Template for a new tweak. Copy to features/my-thing.js, then:
//   1. Add metadata to features/registry.js  ({ id: 'myThing', name, description, default, settings })
//   2. Import it in background.js and add it to the `modules` array.
//   3. (If it needs a shortcut) add a command to manifest.json.
//
// Settings for each feature appear automatically in the sidebar's ⚙ reveal.
//
// Every module can export:
//   id           - must match the registry id
//   init()       - register listeners. Called synchronously on every worker start,
//                  so add listeners directly (not after an await).
//   onInstalled()- one-time setup (context menus etc.)
//   apply(cfg)   - called with { enabled, ...settings } at startup and whenever toggled.

import { getFeature } from '../core/settings.js';

export const id = 'myThing';

export function init() {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'my-thing') return;
    const cfg = await getFeature(id);
    if (!cfg.enabled) return;
    // ...do something with tab
  });
}

export async function apply(cfg) {
  // e.g. show/hide a context menu, enable/disable a declarativeNetRequest ruleset
}
