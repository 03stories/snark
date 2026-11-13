import { getAll, onFeaturesChanged } from './core/settings.js';
import * as copyUrl from './features/copy-url.js';
import * as groupPins from './features/group-pins.js';
import * as autoClear from './features/auto-clear.js';
import * as agentHost from './features/agent-host.js';
import * as searchLauncher from './features/search-launcher.js';

const modules = [copyUrl, groupPins, autoClear, agentHost];

// Toolbar button opens the sidebar directly (settings live inside it).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

// An unpacked (development) copy wears a DEV badge, so it's never mistaken for the store copy.
chrome.management.getSelf().then((me) => {
  if (me.installType !== 'development') return;
  chrome.action.setBadgeText({ text: 'DEV' });
  chrome.action.setBadgeBackgroundColor({ color: '#e8710a' });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setTitle({ title: 'Open Snark (dev copy)' });
}).catch(() => {});

// ⌘B / Ctrl+B toggles the sidebar. Each open sidebar keeps a port to us (and pings it, which keeps
// this worker awake), so we know synchronously whether to open or close, and side-panel open()
// must be called right away, inside the shortcut's user gesture.
const panels = new Map(); // windowId -> port
const panelFocused = new Map(); // windowId -> true while you're in the sidebar (it tells us)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'snark-panel') return;
  let win = null;
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'focus' && win != null) { panelFocused.set(win, !!msg.focused); return; }
    if (msg?.type !== 'hello') return;
    win = msg.windowId;
    panels.set(win, port);
    searchLauncher.onPanelHello(win, port); // a search result it was opened to show
  });
  port.onDisconnect.addListener(() => {
    if (win != null && panels.get(win) === port) { panels.delete(win); panelFocused.delete(win); }
  });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab) return;
  if (command === 'search-snark') {
    // Pressed in the sidebar: Chrome can't hand focus from there to the page, so use the centered window.
    const inPage = !panelFocused.get(tab.windowId);
    return void searchLauncher.openSearch(tab.windowId, { inPage }).catch(console.warn);
  }
  if (command !== 'toggle-sidebar') return;
  const port = panels.get(tab.windowId);
  if (port) port.postMessage({ type: 'close' });
  else chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});
searchLauncher.init({ panels });

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
