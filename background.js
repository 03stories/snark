import { getAll, onFeaturesChanged } from './core/settings.js';
import * as copyUrl from './features/copy-url.js';
import * as groupPins from './features/group-pins.js';
import * as autoClear from './features/auto-clear.js';
import * as agentHost from './features/agent-host.js';

const modules = [copyUrl, groupPins, autoClear, agentHost];

// Toolbar button opens the sidebar directly (settings live inside it).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

// ⌘B / Ctrl+B toggles the sidebar. Each open sidebar keeps a port to us (and pings it, which keeps
// this worker awake), so we know synchronously whether to open or close, and side-panel open()
// must be called right away, inside the shortcut's user gesture.
const panels = new Map(); // windowId -> port
const searchOnOpen = new Set(); // windows whose sidebar should open straight into search
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'snark-panel') return;
  let win = null;
  port.onMessage.addListener((msg) => {
    if (msg?.type !== 'hello') return;
    win = msg.windowId;
    panels.set(win, port);
    if (searchOnOpen.delete(win)) port.postMessage({ type: 'search' });
  });
  port.onDisconnect.addListener(() => { if (win != null && panels.get(win) === port) panels.delete(win); });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || (command !== 'toggle-sidebar' && command !== 'search-snark')) return;
  const port = panels.get(tab.windowId);
  if (command === 'search-snark') {
    if (port) return port.postMessage({ type: 'search' });
    searchOnOpen.add(tab.windowId);
  } else if (port) {
    return port.postMessage({ type: 'close' });
  }
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => searchOnOpen.delete(tab.windowId));
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
