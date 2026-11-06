// Builds what agents see in the agent folder's state.json.
// `buildSnapshot` is pure (testable); `gatherSnapshot` collects the inputs with chrome.* APIs
// and runs in the background service worker, so state.json stays current with the sidebar closed.

import * as T from './tree.js';
import { themeKeyFor } from '../sidepanel/themes.js';

/** Spaces = top-level folders (matched to a window's tab group by title) + any other groups in it. */
export function spacesFor(tree, groups) {
  const used = new Set();
  const spaces = T.spaceRoots(tree).map((root) => {
    const group = groups.find((g) => g.title === root.title && !used.has(g.id));
    if (group) used.add(group.id);
    return { key: root.id, root, title: root.title, color: group?.color ?? root.color ?? 'grey', group };
  });
  for (const g of groups) if (!used.has(g.id)) spaces.push({ key: `g:${g.id}`, root: null, title: g.title, color: g.color, group: g });
  return spaces;
}

export function buildSnapshot({ tree, links, tabs, groups, windowId, favorites, cfg, closedTabs, activeSpaceKey, version }) {
  const tabsById = new Map(tabs.map((t) => [t.id, t]));
  const live = Object.fromEntries(Object.entries(links).filter(([pid, tid]) => tabsById.has(tid) && T.byId(tree, pid)));
  const linked = new Set(Object.values(live));
  const spaces = spacesFor(tree, groups);

  const pinOut = (n) => {
    const t = tabsById.get(live[n.id]);
    return {
      type: 'pin', id: n.id, title: n.title, url: n.url,
      ...(n.note ? { note: n.note } : {}),
      open: !!t,
      ...(t && t.url && t.url !== n.url ? { currentUrl: t.url } : {}),
    };
  };
  const itemsOf = (pid) => T.childrenOf(tree, pid).map((n) =>
    n.type === 'pin' ? pinOut(n) : { type: 'folder', id: n.id, title: n.title, items: itemsOf(n.id) });
  const tabOut = (t) => ({ title: t.title, url: t.url });
  const spaceTabs = (s) => (s.group ? tabs.filter((t) => t.groupId === s.group.id && !linked.has(t.id) && !t.pinned) : []);

  return {
    app: 'Snark',
    version,
    note: 'Written by Snark. Read-only: send changes as command files in inbox/ (see AGENTS.md).',
    currentSpace: spaces.find((s) => s.key === activeSpaceKey)?.title ?? null,
    spaces: spaces.map((s) => ({
      id: s.root?.id ?? null,
      title: s.title,
      icon: s.root?.icon ?? null,
      theme: themeKeyFor(s),
      color: s.color,
      hasTabGroup: !!s.group,
      items: s.root ? itemsOf(s.root.id) : [],
      today: spaceTabs(s).map(tabOut),
    })),
    notInSpace: tabs.filter((t) => t.windowId === windowId && t.groupId === -1 && !t.pinned && !linked.has(t.id)).map(tabOut),
    archive: {
      emptyAfterHours: Number(cfg?.autoClear?.archiveAfter ?? 0) || null,
      items: T.childrenOf(tree, T.ARCHIVE_ID).map((n) => ({
        ...(n.type === 'pin' ? pinOut(n) : { type: 'folder', id: n.id, title: n.title, items: itemsOf(n.id) }),
        archivedAt: n.archivedAt ? new Date(n.archivedAt).toISOString() : null,
        fromSpace: n.from?.spaceTitle ?? null,
      })),
      closedTabs: (closedTabs ?? []).slice(0, 50).map((c) => ({ title: c.title, url: c.url, closedAt: new Date(c.closedAt).toISOString() })),
    },
    favorites: (favorites ?? []).map((f) => ({ id: f.id, title: f.title, url: f.url })),
  };
}

/** The window agents act on: the last focused normal window. */
export async function agentWindow() {
  const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  return w?.id ?? null;
}

export async function gatherSnapshot(getAll) {
  const windowId = await agentWindow();
  const [tree, links, tabs, groups, local, cfg, session] = await Promise.all([
    T.getTree(), T.getLinks(), chrome.tabs.query({}),
    windowId != null ? chrome.tabGroups.query({ windowId }) : [],
    chrome.storage.local.get(['favorites', 'archive']),
    getAll(),
    chrome.storage.session.get('activeSpace'),
  ]);
  return buildSnapshot({
    tree, links, tabs, groups, windowId,
    favorites: local.favorites, closedTabs: local.archive, cfg,
    activeSpaceKey: session.activeSpace?.[windowId],
    version: chrome.runtime.getManifest().version,
  });
}
