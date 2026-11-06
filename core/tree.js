// Pinned tree: spaces → folders (nested) → pins. Shared by the background worker and sidebar.
//
// Stored in chrome.storage.local under "tree" as a flat array of nodes:
//   { id, type: 'folder', parent: null|id, title, color? }   top-level folder = a "space" = a Chrome tab group (matched by title)
//   { id, type: 'pin',    parent: id,      title, url }       title is your label, url is the pinned URL (never changes on navigation)
// Sibling order is array order.
//
// Links (pinId -> tabId for the live tab currently "being" that pin) live in storage.session,
// since tab ids don't survive a browser restart. The sidebar re-adopts open tabs by URL.

const TREE = 'tree';
const LEGACY = 'pins'; // v0.1 flat list
const LINKS = 'pinLinks';

export const uid = () => crypto.randomUUID();

// ---------------------------------------------------------------- the global Archive
// Archived pins/folders live under one special top-level folder. It is never a space and never
// a Chrome tab group. Its direct children carry `archivedAt` and `from` (where they came from).
export const ARCHIVE_ID = '__archive__';
export const isSpaceRoot = (n) => n?.parent == null && n?.type === 'folder' && n.id !== ARCHIVE_ID;
export const spaceRoots = (nodes) => nodes.filter(isSpaceRoot);
export const isArchived = (nodes, id) => rootOf(nodes, id)?.id === ARCHIVE_ID && id !== ARCHIVE_ID;

// ---------------------------------------------------------------- pure helpers

export const byId = (nodes, id) => nodes.find((n) => n.id === id);
export const childrenOf = (nodes, parent) => nodes.filter((n) => n.parent === parent);

export function rootOf(nodes, id) {
  let n = byId(nodes, id);
  while (n && n.parent != null) n = byId(nodes, n.parent);
  return n;
}

/** true if `id` is `ancestorId` or sits somewhere beneath it */
export function isWithin(nodes, id, ancestorId) {
  let n = byId(nodes, id);
  while (n) {
    if (n.id === ancestorId) return true;
    n = n.parent != null ? byId(nodes, n.parent) : null;
  }
  return false;
}

export function pinsUnder(nodes, id) {
  const out = [];
  for (const c of childrenOf(nodes, id)) {
    if (c.type === 'pin') out.push(c);
    else out.push(...pinsUnder(nodes, c.id));
  }
  return out;
}

export function descendantIds(nodes, id) {
  const out = [];
  for (const c of childrenOf(nodes, id)) out.push(c.id, ...descendantIds(nodes, c.id));
  return out;
}

export function nextSiblingId(nodes, id) {
  const n = byId(nodes, id);
  if (!n) return null;
  const sibs = childrenOf(nodes, n.parent);
  return sibs[sibs.findIndex((s) => s.id === id) + 1]?.id ?? null;
}

/** Move `id` under `parent`, before sibling `beforeId` (null = last). Refuses to move a folder into itself. */
export function moveNode(nodes, id, parent, beforeId = null) {
  if (id === beforeId) return nodes;
  if (parent != null && isWithin(nodes, parent, id)) return nodes;
  const node = byId(nodes, id);
  if (!node) return nodes;
  const rest = nodes.filter((n) => n.id !== id);
  const moved = { ...node, parent };
  const idx = beforeId ? rest.findIndex((n) => n.id === beforeId) : -1;
  if (idx < 0) rest.push(moved);
  else rest.splice(idx, 0, moved);
  return rest;
}

export function insertNode(nodes, node, beforeId = null) {
  return moveNode([...nodes, node], node.id, node.parent, beforeId);
}

/** Remove a node. Folders either take their contents with them, or hand them to their parent in place. */
export function removeNode(nodes, id, { keepChildren = false } = {}) {
  const node = byId(nodes, id);
  if (!node) return nodes;
  if (node.type === 'folder' && keepChildren) {
    const kids = childrenOf(nodes, id).map((k) => ({ ...k, parent: node.parent }));
    const kidIds = new Set(kids.map((k) => k.id));
    const rest = nodes.filter((n) => !kidIds.has(n.id));
    rest.splice(rest.findIndex((n) => n.id === id), 1, ...kids);
    return rest;
  }
  const drop = new Set([id, ...descendantIds(nodes, id)]);
  return nodes.filter((n) => !drop.has(n.id));
}

/** Key the sidebar uses for a Chrome group's space: the matching top-level folder id, or `g:<groupId>`. */
export function spaceKeyForGroup(nodes, group) {
  const r = nodes.find((n) => isSpaceRoot(n) && n.title === group.title);
  return r ? r.id : `g:${group.id}`;
}

/** Pure: move a pin/folder into the Archive (newest first), remembering where it came from. */
export function archiveInTree(nodes, id, now = Date.now()) {
  const n = byId(nodes, id);
  if (!n || n.id === ARCHIVE_ID || isSpaceRoot(n)) return nodes;
  if (isArchived(nodes, id) && n.parent === ARCHIVE_ID) return nodes;
  let t = nodes;
  if (!byId(t, ARCHIVE_ID)) t = [...t, { id: ARCHIVE_ID, type: 'folder', parent: null, title: 'Archive' }];
  const space = rootOf(t, id);
  const from = isArchived(t, id)
    ? undefined
    : { space: space?.id ?? null, spaceTitle: space?.title ?? null, spaceIcon: space?.icon ?? null, parent: n.parent, before: nextSiblingId(t, id) };
  const first = childrenOf(t, ARCHIVE_ID)[0]?.id ?? null;
  t = moveNode(t, id, ARCHIVE_ID, first === id ? null : first);
  return t.map((x) => (x.id === id ? { ...x, archivedAt: now, ...(from ? { from } : {}) } : x));
}

/** Strip archive bookkeeping from a node that's no longer directly in the Archive. */
export const unmark = (n) => {
  if (!n.archivedAt && !n.from) return n;
  const { archivedAt, from, ...rest } = n;
  return rest;
};

/**
 * Pure: put an archived item back where it came from: same folder and position if they still
 * exist, else the top of its space, else the top of the first space. Returns { nodes, to } or throws.
 */
export function restoreInTree(nodes, id) {
  const n = byId(nodes, id);
  if (!n || !isArchived(nodes, id)) throw new Error('that item isn’t in the Archive');
  let top = n;
  while (top.parent !== ARCHIVE_ID) top = byId(nodes, top.parent);
  const from = top.from ?? {};
  const alive = (pid) => pid && byId(nodes, pid) && !isArchived(nodes, pid) && pid !== ARCHIVE_ID;
  let parent;
  let before = null;
  if (n === top && alive(from.parent)) {
    parent = from.parent;
    if (from.before && byId(nodes, from.before)?.parent === parent) before = from.before;
  } else {
    const space = (alive(from.space) && byId(nodes, from.space)) || spaceRoots(nodes)[0];
    if (!space) throw new Error('there’s no space to restore into');
    parent = space.id;
    before = childrenOf(nodes, parent)[0]?.id ?? null;
  }
  let t = moveNode(nodes, id, parent, before);
  t = t.map((x) => (x.id === id ? unmark(x) : x));
  return { nodes: t, to: parent };
}

export function migrateLegacy(pins) {
  const nodes = [];
  const roots = new Map();
  for (const p of pins) {
    let r = roots.get(p.group);
    if (!r) {
      r = { id: uid(), type: 'folder', parent: null, title: p.group, color: p.color ?? 'grey' };
      roots.set(p.group, r);
      nodes.push(r);
    }
    nodes.push({ id: p.id, type: 'pin', parent: r.id, title: p.title, url: p.url });
  }
  return nodes;
}

// ---------------------------------------------------------------- storage

export async function getTree() {
  const r = await chrome.storage.local.get([TREE, LEGACY]);
  if (r[TREE]) return r[TREE];
  if (r[LEGACY]?.length) {
    const t = migrateLegacy(r[LEGACY]);
    await chrome.storage.local.set({ [TREE]: t });
    await chrome.storage.local.remove(LEGACY);
    return t;
  }
  return [];
}

let chain = Promise.resolve();
/** Run `fn` after every earlier queued change in this page (sidebar edits and agent commands share it). */
export function serialize(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

/** Serialized read-modify-write. `fn(tree)` returns the new tree (or nothing to keep the mutated one). */
export function mutate(fn) {
  return serialize(async () => {
    const t = await getTree();
    const out = (await fn(t)) ?? t;
    await chrome.storage.local.set({ [TREE]: out });
    return out;
  });
}

export async function getLinks() {
  return (await chrome.storage.session.get(LINKS))[LINKS] ?? {};
}
export async function setLinks(links) {
  await chrome.storage.session.set({ [LINKS]: links });
}
export async function setLink(pinId, tabId) {
  const links = await getLinks();
  if (tabId == null) delete links[pinId];
  else links[pinId] = tabId;
  await setLinks(links);
}
export async function pinIdForTab(tabId) {
  const links = await getLinks();
  return Object.keys(links).find((k) => links[k] === tabId);
}
export async function unlinkTab(tabId) {
  const links = await getLinks();
  let changed = false;
  for (const k of Object.keys(links)) if (links[k] === tabId) { delete links[k]; changed = true; }
  if (changed) await setLinks(links);
}

// ---------------------------------------------------------------- Chrome tab-group plumbing

export async function findGroup(windowId, title) {
  if (!title) return undefined;
  return (await chrome.tabGroups.query({ windowId, title }))[0];
}

export async function putInGroup(tabId, windowId, title, color = 'grey') {
  const g = await findGroup(windowId, title);
  if (g) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: g.id });
    return g.id;
  }
  const gid = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
  await chrome.tabGroups.update(gid, { title, color });
  return gid;
}

/** Line up a space's open pinned tabs at the start of its tab group, in sidebar order. */
export async function orderSpace(rootId, windowId) {
  try {
    const [tree, links] = await Promise.all([getTree(), getLinks()]);
    const root = byId(tree, rootId);
    if (!root) return;
    const g = await findGroup(windowId, root.title);
    if (!g) return;
    const gtabs = await chrome.tabs.query({ groupId: g.id });
    const inGroup = new Set(gtabs.map((t) => t.id));
    const ids = pinsUnder(tree, rootId).map((p) => links[p.id]).filter((id) => inGroup.has(id));
    if (!ids.length) return;
    await chrome.tabs.move(ids, { index: Math.min(...gtabs.map((t) => t.index)) });
    await chrome.tabs.group({ tabIds: ids, groupId: g.id });
  } catch (e) {
    console.warn('orderSpace failed', e);
  }
}

export async function ensureRoot(title, color = 'grey') {
  let id;
  await mutate((t) => {
    const r = t.find((n) => isSpaceRoot(n) && n.title === title);
    if (r) { id = r.id; return t; }
    const node = { id: uid(), type: 'folder', parent: null, title, color };
    id = node.id;
    return [...t, node];
  });
  return id;
}

// ---------------------------------------------------------------- actions

async function liveTab(pinId) {
  const tid = (await getLinks())[pinId];
  if (tid == null) return null;
  try {
    return await chrome.tabs.get(tid);
  } catch {
    await setLink(pinId, null);
    return null;
  }
}
export { liveTab };

export async function updateNode(id, patch) {
  await mutate((t) => t.map((n) => (n.id === id ? { ...n, ...patch } : n)));
}

export async function openPin(pinId, { windowId, active = true, pinsAtTop = true } = {}) {
  const tree = await getTree();
  const pin = byId(tree, pinId);
  if (!pin) return;
  const t = await liveTab(pinId);
  if (t) {
    if (active) {
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
    }
    return t;
  }
  const root = rootOf(tree, pinId);
  const tab = await chrome.tabs.create({ windowId, url: pin.url, active });
  await setLink(pinId, tab.id); // link first so the background's group-sync sees it
  await putInGroup(tab.id, windowId, root.title, root.color);
  if (pinsAtTop) await orderSpace(root.id, windowId);
  return tab;
}

/** Close the live tab; the pin (and its pinned URL) stays. */
export async function closePin(pinId) {
  const t = await liveTab(pinId);
  if (!t) return;
  await setLink(pinId, null);
  await chrome.tabs.remove(t.id).catch(() => {});
}

export async function resetPin(pinId) {
  const pin = byId(await getTree(), pinId);
  const t = await liveTab(pinId);
  if (pin && t) await chrome.tabs.update(t.id, { url: pin.url });
}

export async function setPinUrlToCurrent(pinId) {
  const t = await liveTab(pinId);
  if (t?.url) await updateNode(pinId, { url: t.url });
}

export async function pinTabAt(tab, parentId, beforeId = null, { pinsAtTop = true } = {}) {
  const already = await pinIdForTab(tab.id);
  if (already) {
    await moveTo(already, parentId, beforeId, { windowId: tab.windowId, pinsAtTop });
    return byId(await getTree(), already);
  }
  const pin = { id: uid(), type: 'pin', parent: parentId, title: tab.title || tab.url, url: tab.url };
  const tree = await mutate((t) => insertNode(t, pin, beforeId));
  await setLink(pin.id, tab.id);
  const root = rootOf(tree, pin.id);
  await putInGroup(tab.id, tab.windowId, root.title, root.color);
  if (pinsAtTop) await orderSpace(root.id, tab.windowId);
  return pin;
}

/** Pin into the tab's own space (its tab group), or the first space if it's ungrouped. */
export async function pinTab(tab, opts) {
  let rootId;
  if (tab.groupId !== -1) {
    const g = await chrome.tabGroups.get(tab.groupId);
    let title = g.title;
    if (!title) {
      title = 'Untitled';
      await chrome.tabGroups.update(g.id, { title });
    }
    rootId = await ensureRoot(title, g.color);
  } else {
    const firstRoot = spaceRoots(await getTree())[0];
    rootId = firstRoot?.id ?? (await ensureRoot('Pinned', 'grey'));
  }
  return pinTabAt(tab, rootId, null, opts);
}

/** Remove the pin. Its tab (if open) stays open as a normal tab. */
export async function unpin(pinId, { ungroup = false } = {}) {
  const t = await liveTab(pinId);
  await mutate((tr) => removeNode(tr, pinId));
  await setLink(pinId, null);
  if (t && ungroup) await chrome.tabs.ungroup(t.id).catch(() => {});
  return t;
}

/** Move a pin/folder in the tree; open tabs follow into the new space's tab group. */
export async function moveTo(id, parentId, beforeId, { windowId, pinsAtTop = true } = {}) {
  const oldRoot = rootOf(await getTree(), id)?.id;
  const after = await mutate((t) => moveNode(t, id, parentId, beforeId));
  const node = byId(after, id);
  if (!node) return;
  const newRoot = rootOf(after, id);
  if (newRoot && newRoot.id !== oldRoot) {
    const links = await getLinks();
    const pins = node.type === 'pin' ? [node] : pinsUnder(after, id);
    for (const p of pins) {
      const tid = links[p.id];
      if (tid == null) continue;
      try {
        const tab = await chrome.tabs.get(tid);
        await putInGroup(tid, tab.windowId, newRoot.title, newRoot.color);
      } catch {}
    }
  }
  if (pinsAtTop && newRoot) await orderSpace(newRoot.id, windowId);
}

export async function archiveNode(id) {
  const tree = await mutate((t) => archiveInTree(t, id));
  // Archived pins let go of their tabs (the tabs stay open as normal tabs).
  const node = byId(tree, id);
  const ids = node?.type === 'pin' ? [id] : pinsUnder(tree, id).map((p) => p.id);
  const links = await getLinks();
  let changed = false;
  for (const p of ids) if (links[p] != null) { delete links[p]; changed = true; }
  if (changed) await setLinks(links);
}

export async function restoreNode(id) {
  let to;
  await mutate((t) => { const r = restoreInTree(t, id); to = r.to; return r.nodes; });
  return to;
}

/** After an archived item is dragged out into a space, drop its archive bookkeeping. */
export async function clearArchiveMarks(id) {
  await mutate((t) => t.map((n) => (n.id === id ? unmark(n) : n)));
}

export async function newFolder(parentId, title = 'New folder') {
  const node = { id: uid(), type: 'folder', parent: parentId, title };
  if (parentId == null) node.color = 'grey';
  await mutate((t) => [...t, node]);
  return node.id;
}

/** Sub-folders hand their contents to their parent. Removing a space removes its pins (tabs stay open). */
export async function deleteFolder(id) {
  const tree = await getTree();
  const node = byId(tree, id);
  if (!node) return;
  if (node.parent == null) {
    const pinIds = pinsUnder(tree, id).map((p) => p.id);
    await mutate((t) => removeNode(t, id));
    const links = await getLinks();
    for (const p of pinIds) delete links[p];
    await setLinks(links);
  } else {
    await mutate((t) => removeNode(t, id, { keepChildren: true }));
  }
}

export async function renameSpace(rootId, title, windowId) {
  const root = byId(await getTree(), rootId);
  if (!root) return;
  const g = await findGroup(windowId, root.title);
  await updateNode(rootId, { title });
  if (g) await chrome.tabGroups.update(g.id, { title });
}

export async function setSpaceColor(rootId, color, windowId) {
  const root = byId(await getTree(), rootId);
  if (!root) return;
  const g = await findGroup(windowId, root.title);
  await updateNode(rootId, { color });
  if (g) await chrome.tabGroups.update(g.id, { color });
}

export async function openFolder(id, opts) {
  const tree = await getTree();
  const pins = byId(tree, id)?.type === 'pin' ? [byId(tree, id)] : pinsUnder(tree, id);
  for (const p of pins) await openPin(p.id, { ...opts, active: false });
}

export async function closeFolder(id) {
  for (const p of pinsUnder(await getTree(), id)) await closePin(p.id);
}
