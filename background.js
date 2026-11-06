import { getAll, onFeaturesChanged } from './core/settings.js';
import * as copyUrl from './features/copy-url.js';
import * as groupPins from './features/group-pins.js';
import * as autoClear from './features/auto-clear.js';

const modules = [copyUrl, groupPins, autoClear];

// Toolbar button opens the sidebar directly (settings live inside it).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

// ⌘B / Ctrl+B toggles the sidebar. Each open sidebar keeps a port to us (and pings it, which keeps
// this worker awake), so we know synchronously whether to open or close, and side-panel open()
// must be called right away, inside the shortcut's user gesture.
const panels = new Map(); // windowId -> port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'snark-panel') return;
  let win = null;
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'hello') { win = msg.windowId; panels.set(win, port); }
  });
  port.onDisconnect.addListener(() => { if (win != null && panels.get(win) === port) panels.delete(win); });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-sidebar' || !tab) return;
  const port = panels.get(tab.windowId);
  if (port) port.postMessage({ type: 'close' });
  else chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

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
