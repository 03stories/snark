import { getAll, onFeaturesChanged } from './core/settings.js';
import * as copyUrl from './features/copy-url.js';
import * as groupPins from './features/group-pins.js';
import * as autoClear from './features/auto-clear.js';

const modules = [copyUrl, groupPins, autoClear];

// Toolbar button opens the sidebar directly (settings live inside it).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

// Listeners must be registered synchronously on every service-worker start.
for (const m of modules) m.init?.();

async function applyAll(all) {
  for (const m of modules) {
    try {
      await m.apply?.(all[m.id]);
    } catch (e) {
      console.warn(`apply failed for ${m.id}`, e);
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    for (const m of modules) m.onInstalled?.(details);
    getAll().then(applyAll);
  });
});

getAll().then(applyAll);
onFeaturesChanged(applyAll);
