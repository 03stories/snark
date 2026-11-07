// Collects everything the search page searches, straight from storage and Chrome
// (the search page runs on its own, without the sidebar).

import * as T from '../core/tree.js';
import * as S from '../core/search.js';
import { spacesFor } from '../core/agent-snapshot.js';
import { getArchive } from '../core/archive.js';
import { getFavs } from '../core/favorites.js';
import { getIconCache } from '../core/favicons.js';
import { getAll } from '../core/settings.js';

// Searchable actions. The sidebar runs them (see "search results" in sidepanel.js), except shortcuts.
export const ACTIONS = [
  { id: 'settings', title: 'Open Settings', keywords: 'preferences options' },
  { id: 'archive', title: 'Open Archive', keywords: 'closed restore put away' },
  { id: 'new-space', title: 'New space', keywords: 'create add' },
  { id: 'pin-current', title: 'Pin current tab', keywords: 'bookmark save' },
  { id: 'shortcuts', title: 'Edit keyboard shortcuts', keywords: 'keys hotkeys' },
];

export async function gather(windowId) {
  const [tree, links, tabs, groups, closed, favs, icons, cfg, session] = await Promise.all([
    T.getTree(), T.getLinks(), chrome.tabs.query({}), chrome.tabGroups.query({ windowId }),
    getArchive(), getFavs(), getIconCache(), getAll(), chrome.storage.session.get('activeSpace'),
  ]);
  const tabsById = new Map(tabs.map((t) => [t.id, t]));
  const live = Object.fromEntries(Object.entries(links).filter(([pid, tid]) => tabsById.has(tid) && T.byId(tree, pid)));
  const linked = new Set(Object.values(live));
  const spaces = spacesFor(tree, groups);

  const open = [];
  for (const s of spaces) {
    if (!s.group) continue;
    for (const t of tabs) if (t.groupId === s.group.id && !linked.has(t.id) && !t.pinned) open.push({ id: t.id, title: t.title, url: t.url, spaceKey: s.key });
  }
  for (const t of tabs) {
    if (t.windowId === windowId && t.groupId === -1 && !t.pinned && !linked.has(t.id)) open.push({ id: t.id, title: t.title, url: t.url, spaceKey: null });
  }

  return {
    entries: S.entriesFrom({ tree, spaces, links: live, favs, tabs: open, closed, actions: ACTIONS }),
    tabsById,
    links: live,
    icons,
    useGoogle: cfg?.groupPins?.googleIcons ?? false,
    pinsAtTop: cfg?.groupPins?.pinsAtTop ?? true,
    currentSpace: session.activeSpace?.[windowId] ?? null,
  };
}
