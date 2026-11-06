import { getFeature } from '../core/settings.js';
import * as T from '../core/tree.js';
import { toast } from '../core/toast.js';
import { rememberIcons, iconPairsForTab } from '../core/favicons.js';

export const id = 'groupPins';
const MENU_ID = 'pin-tab';

async function pinWithFeedback(tab) {
  const cfg = await getFeature(id);
  if (!cfg.enabled || !tab?.url) return;
  const pin = await T.pinTab(tab, { pinsAtTop: cfg.pinsAtTop });
  const root = T.rootOf(await T.getTree(), pin.id);
  await toast(tab.id, `Pinned to “${root?.title ?? 'sidebar'}”`);
}

export function init() {
  // Closing a pinned tab (any way, incl. ⌘W) keeps the pin; it just goes "closed".
  chrome.tabs.onRemoved.addListener((tabId) => T.unlinkTab(tabId));

  // Remember site icons as pages load, so pins keep their icon after the tab closes.
  chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!info.favIconUrl) return;
    const pinId = await T.pinIdForTab(tabId);
    const pin = pinId ? T.byId(await T.getTree(), pinId) : null;
    await rememberIcons(iconPairsForTab(tab, pin?.url)).catch(() => {});
  });

  // Dragging a pinned tab into another Chrome tab group moves the pin into that space.
  chrome.tabs.onUpdated.addListener(async (tabId, info) => {
    if (info.groupId === undefined || info.groupId === -1) return;
    const pinId = await T.pinIdForTab(tabId);
    if (!pinId) return;
    const g = await chrome.tabGroups.get(info.groupId);
    if (!g.title) return; // brand-new group, title not set yet
    const tree = await T.getTree();
    if (T.rootOf(tree, pinId)?.title === g.title) return;
    const rootId = await T.ensureRoot(g.title, g.color);
    await T.mutate((t) => T.moveNode(t, pinId, rootId, null));
  });

  // Renaming / recoloring a Chrome group renames / recolors its space.
  chrome.tabGroups.onUpdated.addListener(async (g) => {
    if (!g.title) return;
    const [tree, links, tabs] = await Promise.all([T.getTree(), T.getLinks(), chrome.tabs.query({ groupId: g.id })]);
    const tabIds = new Set(tabs.map((t) => t.id));
    const roots = new Set(
      Object.entries(links).filter(([, tid]) => tabIds.has(tid)).map(([pid]) => T.rootOf(tree, pid)?.id).filter(Boolean)
    );
    const sameTitle = tree.find((n) => T.isSpaceRoot(n) && n.title === g.title);
    if (roots.size === 1 && !sameTitle) {
      await T.updateNode([...roots][0], { title: g.title, color: g.color });
    } else if (sameTitle && sameTitle.color !== g.color) {
      await T.updateNode(sameTitle.id, { color: g.color });
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) pinWithFeedback(tab);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'pin-tab') pinWithFeedback(tab);
    if (command === 'next-space' || command === 'prev-space') {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      chrome.runtime
        .sendMessage({ type: 'space-step', windowId: tab.windowId, dir: command === 'next-space' ? 1 : -1 })
        .catch(() => {});
    }
  });

  // Remember which space each window is "in": the sidebar sets it when you swipe,
  // and activating a grouped tab anywhere (tab strip, ⌘-click…) updates it too.
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t.groupId === -1) return;
      const g = await chrome.tabGroups.get(t.groupId);
      await setActiveSpace(windowId, T.spaceKeyForGroup(await T.getTree(), g));
    } catch {}
  });

  // New tabs (⌘T, links opened from ungrouped tabs, restored tabs…) join the current space.
  chrome.tabs.onCreated.addListener(async (tab) => {
    const cfg = await getFeature(id);
    if (!cfg.enabled || !cfg.newTabsJoinSpace || tab.pinned) return;
    await new Promise((r) => setTimeout(r, 300)); // let Chrome's own grouping (links from a grouped tab) happen first
    let t;
    try { t = await chrome.tabs.get(tab.id); } catch { return; }
    if (t.groupId !== -1 || t.pinned || (t.splitViewId ?? -1) > -1) return; // leave split-view tabs alone
    const win = await chrome.windows.get(t.windowId).catch(() => null);
    if (win?.type !== 'normal') return;
    const { activeSpace = {} } = await chrome.storage.session.get('activeSpace');
    const key = activeSpace[t.windowId];
    if (!key) return;
    try {
      if (key.startsWith('g:')) {
        await chrome.tabs.group({ tabIds: [t.id], groupId: Number(key.slice(2)) });
      } else {
        const root = T.byId(await T.getTree(), key);
        if (root) await T.putInGroup(t.id, t.windowId, root.title, root.color);
      }
    } catch (e) {
      console.warn('join space failed', e);
    }
  });

}

async function setActiveSpace(windowId, key) {
  const { activeSpace = {} } = await chrome.storage.session.get('activeSpace');
  if (activeSpace[windowId] === key) return;
  activeSpace[windowId] = key;
  await chrome.storage.session.set({ activeSpace });
}

export function onInstalled() {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Pin tab to sidebar', contexts: ['page', 'action'] });
}

export async function apply(cfg) {
  chrome.contextMenus.update(MENU_ID, { visible: cfg.enabled }, () => void chrome.runtime.lastError);
}
