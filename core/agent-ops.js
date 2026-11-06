// Agent command engine: applies a command (a list of ops) from the agent folder's inbox.
//
// Commands are atomic: every op is applied to an in-memory copy of the live tree and favorites,
// and nothing is saved unless all of them succeed. Each command records exactly what it changed,
// so it can be undone later without touching edits made since (see planUndo).
//
// See core/agent-templates.js (AGENTS.md) for the documented format.

import * as T from './tree.js';
import { THEMES } from '../sidepanel/themes.js';

export const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export const THEME_KEYS = Object.keys(THEMES);
const UNDO_KEY = 'agentUndo';
const UNDO_MAX = 20;
const MAX_OPS = 100;
const MAX_NEW_ITEMS = 1000;

const norm = (s) => String(s ?? '').trim().toLowerCase();
const uid = () => crypto.randomUUID();

class OpError extends Error {}
const fail = (msg) => { throw new OpError(msg); };

function checkUrl(url, where) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {}
  fail(`${where}: "${url}" is not an http(s) URL`);
}
const checkTitle = (t, where) => {
  if (typeof t !== 'string' || !t.trim()) fail(`${where}: title must be a non-empty string`);
  return t.trim().slice(0, 300);
};
function checkStyle(o, where) {
  const out = {};
  if (o.icon != null) out.icon = [...String(o.icon)].slice(0, 2).join('');
  if (o.theme != null) {
    if (!THEME_KEYS.includes(o.theme)) fail(`${where}: unknown theme "${o.theme}" (use one of ${THEME_KEYS.join(', ')})`);
    out.theme = o.theme;
  }
  if (o.color != null) {
    if (!COLORS.includes(o.color)) fail(`${where}: unknown color "${o.color}" (use one of ${COLORS.join(', ')})`);
    out.color = o.color;
  }
  return out;
}

/** Work on copies; collect follow-up Chrome actions to run after saving. */
class Draft {
  constructor(tree, favorites, groups) {
    this.tree = structuredClone(tree);
    this.favorites = structuredClone(favorites);
    this.groups = groups ?? [];
    this.after = [];
    this.stats = { spaces: 0, folders: 0, pins: 0, favorites: 0, skipped: 0, updated: 0, moved: 0, archived: 0, restored: 0, removed: 0 };
    this.created = [];
  }
  node(id) { return T.byId(this.tree, id); }
  roots() { return T.spaceRoots(this.tree); }

  /** A space by id or title. A Chrome tab group with that title (but no saved space yet) becomes one. */
  space(ref, { create = false, where = 'space' } = {}) {
    const key = typeof ref === 'object' && ref ? (ref.id ?? ref.title) : ref;
    if (key == null || key === '') fail(`${where}: missing space`);
    const byIdHit = this.roots().find((r) => r.id === key);
    if (byIdHit) return byIdHit;
    const byTitle = this.roots().find((r) => norm(r.title) === norm(key));
    if (byTitle) return byTitle;
    const group = this.groups.find((g) => norm(g.title) === norm(key));
    if (group || create) {
      const root = { id: uid(), type: 'folder', parent: null, title: group?.title ?? checkTitle(String(key), where), color: group?.color ?? 'grey' };
      this.tree.push(root);
      this.stats.spaces++;
      this.created.push({ type: 'space', id: root.id, title: root.title });
      return root;
    }
    fail(`${where}: no space called "${key}"`);
  }

  /** Walk (and optionally create) a folder path under a parent. */
  folderPath(parentId, path = [], { create = true, where = 'path' } = {}) {
    let pid = parentId;
    for (const seg of [].concat(path ?? [])) {
      const title = checkTitle(String(seg), where);
      let f = T.childrenOf(this.tree, pid).find((n) => n.type === 'folder' && norm(n.title) === norm(title));
      if (!f) {
        if (!create) fail(`${where}: no folder "${title}"`);
        f = { id: uid(), type: 'folder', parent: pid, title };
        this.tree.push(f);
        this.stats.folders++;
        this.created.push({ type: 'folder', id: f.id, title });
      }
      pid = f.id;
    }
    return pid;
  }

  place(node, position) {
    if (position === 'top') {
      const first = T.childrenOf(this.tree, node.parent)[0];
      this.tree = T.insertNode(this.tree, node, first?.id ?? null);
    } else {
      this.tree.push(node);
    }
  }

  addItems(parentId, items, position, where) {
    if (!Array.isArray(items)) fail(`${where}: items must be a list`);
    const list = position === 'top' ? [...items].reverse() : items;
    for (const [i, it] of list.entries()) {
      const w = `${where}.items[${position === 'top' ? items.length - 1 - i : i}]`;
      if (this.stats.pins + this.stats.folders > MAX_NEW_ITEMS) fail(`too many items (max ${MAX_NEW_ITEMS} per command)`);
      if (it && typeof it.folder === 'string') {
        const title = checkTitle(it.folder, w);
        let f = T.childrenOf(this.tree, parentId).find((n) => n.type === 'folder' && norm(n.title) === norm(title));
        if (!f) {
          f = { id: uid(), type: 'folder', parent: parentId, title };
          this.place(f, position);
          this.stats.folders++;
          this.created.push({ type: 'folder', id: f.id, title });
        }
        if (it.items) this.addItems(f.id, it.items, 'bottom', w);
      } else if (it && (typeof it.pin === 'string' || typeof it.title === 'string')) {
        const url = checkUrl(it.url, w);
        if (T.childrenOf(this.tree, parentId).some((n) => n.type === 'pin' && n.url === url)) { this.stats.skipped++; continue; }
        const pin = { id: uid(), type: 'pin', parent: parentId, title: checkTitle(it.pin ?? it.title, w), url };
        if (typeof it.note === 'string' && it.note.trim()) pin.note = it.note.trim().slice(0, 1000);
        this.place(pin, position);
        this.stats.pins++;
        this.created.push({ type: 'pin', id: pin.id, title: pin.title, url });
      } else {
        fail(`${w}: each item needs either "folder" (with optional "items") or "pin" + "url"`);
      }
    }
  }

  target(id, where) {
    const n = this.node(id);
    if (!n || id === T.ARCHIVE_ID) fail(`${where}: no item with id "${id}" (ids are in state.json)`);
    return n;
  }
}

const OPS = {
  createSpace(d, op, w) {
    const title = checkTitle(op.title, w);
    const style = checkStyle(op, w);
    let root = d.roots().find((r) => norm(r.title) === norm(title));
    if (root && (op.ifExists ?? 'error') === 'error') fail(`${w}: a space called "${title}" already exists (use "ifExists": "merge" to add to it)`);
    if (!root) root = d.space(title, { create: true, where: w });
    Object.assign(root, style);
    if (op.items) d.addItems(root.id, op.items, op.position, w);
    return { space: root.id };
  },

  addItems(d, op, w) {
    const root = d.space(op.space, { create: !!op.createSpace, where: w });
    const parent = d.folderPath(root.id, op.path, { create: op.createPath !== false, where: w });
    d.addItems(parent, op.items ?? [], op.position, w);
    return { parent };
  },

  updateSpace(d, op, w) {
    const root = d.space(op.space, { where: w });
    const style = checkStyle(op, w);
    if (op.title != null) {
      const title = checkTitle(op.title, w);
      if (title !== root.title) {
        const old = root.title;
        root.title = title;
        d.after.push({ kind: 'renameGroup', from: old, to: title });
      }
    }
    if (style.color) d.after.push({ kind: 'recolorGroup', title: root.title, color: style.color });
    Object.assign(root, style);
    d.stats.updated++;
  },

  update(d, op, w) {
    if (!d.node(op.id) && d.favorites.some((f) => f.id === op.id)) fail(`${w}: that id is a favorite; use updateFavorite`);
    const n = d.target(op.id, w);
    if (n.parent == null) fail(`${w}: use updateSpace for spaces`);
    if (op.title != null) n.title = checkTitle(op.title, w);
    if (op.url != null) {
      if (n.type !== 'pin') fail(`${w}: only pins have a url`);
      n.url = checkUrl(op.url, w);
    }
    if (op.note != null && n.type === 'pin') n.note = String(op.note).slice(0, 1000) || undefined;
    d.stats.updated++;
  },

  move(d, op, w) {
    const n = d.target(op.id, w);
    const to = op.to ?? fail(`${w}: missing "to"`);
    const root = d.space(to.space, { where: `${w}.to` });
    const parent = d.folderPath(root.id, to.path, { create: to.createPath !== false, where: `${w}.to` });
    if (n.type === 'folder' && T.isWithin(d.tree, parent, n.id)) fail(`${w}: can't move a folder into itself`);
    const oldRoot = T.rootOf(d.tree, n.id)?.id;
    const first = op.position === 'top' ? T.childrenOf(d.tree, parent).filter((c) => c.id !== n.id)[0]?.id ?? null : null;
    d.tree = T.moveNode(d.tree, n.id, parent, first);
    if (oldRoot !== root.id) d.after.push({ kind: 'regroup', id: n.id });
    d.stats.moved++;
  },

  remove(d, op, w) {
    const n = d.target(op.id, w);
    d.tree = T.removeNode(d.tree, n.id, { keepChildren: n.parent != null && op.keepContents === true });
    d.stats.removed++;
  },

  archive(d, op, w) {
    const n = d.target(op.id, w);
    if (n.parent == null) fail(`${w}: spaces can't be archived; archive their folders/pins, or remove the space`);
    if (T.isArchived(d.tree, n.id) && n.parent === T.ARCHIVE_ID) { d.stats.skipped++; return; }
    d.tree = T.archiveInTree(d.tree, n.id);
    d.after.push({ kind: 'unlink', id: n.id });
    d.stats.archived++;
  },

  restore(d, op, w) {
    const n = d.target(op.id, w);
    try { d.tree = T.restoreInTree(d.tree, n.id).nodes; } catch (e) { fail(`${w}: ${e.message}`); }
    d.stats.restored++;
  },

  addFavorites(d, op, w) {
    for (const [i, it] of (op.items ?? []).entries()) {
      const url = checkUrl(it.url, `${w}.items[${i}]`);
      if (d.favorites.some((f) => f.url === url)) { d.stats.skipped++; continue; }
      d.favorites.push({ id: uid(), url, title: checkTitle(it.title ?? it.pin ?? url, `${w}.items[${i}]`) });
      d.stats.favorites++;
    }
  },

  updateFavorite(d, op, w) {
    const i = d.favorites.findIndex((f) => (op.id && f.id === op.id) || (!op.id && op.match && f.url === op.match));
    if (i < 0) fail(`${w}: no favorite with that id (favorite ids are in state.json → favorites)`);
    const f = { ...d.favorites[i] };
    if (op.title != null) f.title = checkTitle(op.title, w);
    if (op.url != null) f.url = checkUrl(op.url, w);
    d.favorites[i] = f;
    if (op.position != null) {
      const [moved] = d.favorites.splice(i, 1);
      const to = op.position === 'first' ? 0 : op.position === 'last' ? d.favorites.length : Number(op.position);
      if (!Number.isInteger(to) || to < 0) fail(`${w}: position must be "first", "last" or a number`);
      d.favorites.splice(Math.min(to, d.favorites.length), 0, moved);
    }
    d.stats.updated++;
  },

  removeFavorite(d, op, w) {
    const before = d.favorites.length;
    d.favorites = d.favorites.filter((f) => f.id !== op.id && f.url !== op.url);
    if (d.favorites.length === before) fail(`${w}: no favorite with that id/url`);
    d.stats.removed++;
  },
};

export function describe(stats, created) {
  const parts = [];
  const n = (k, word) => stats[k] && parts.push(`${stats[k]} ${word}${stats[k] === 1 ? '' : 's'}`);
  const newSpaces = created.filter((c) => c.type === 'space');
  if (newSpaces.length === 1) parts.push(`created space “${newSpaces[0].title}”`);
  else n('spaces', 'new space');
  n('folders', 'new folder');
  n('pins', 'new pin');
  n('favorites', 'new favorite');
  n('updated', 'update');
  n('moved', 'move');
  if (stats.archived) parts.push(`${stats.archived} archived`);
  if (stats.restored) parts.push(`${stats.restored} restored`);
  n('removed', 'removal');
  if (stats.skipped) parts.push(`${stats.skipped} duplicate${stats.skipped === 1 ? '' : 's'} skipped`);
  const s = parts.join(', ') || 'no changes';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- change journal (for selective undo)
// Each command records exactly what it changed. Undo reverses only those changes, so edits you
// made afterwards are kept; if an item it needs to touch was changed since, that's a conflict.

const FIELDS = ['type', 'parent', 'title', 'url', 'note', 'icon', 'theme', 'color'];
const sameNode = (a, b) => FIELDS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
const sameFav = (a, b) => (a?.url ?? null) === (b?.url ?? null) && (a?.title ?? null) === (b?.title ?? null);

export function diffChanges(beforeTree, afterTree, beforeFavs, afterFavs) {
  const bMap = new Map(beforeTree.map((n) => [n.id, n]));
  const aMap = new Map(afterTree.map((n) => [n.id, n]));
  const bF = new Map(beforeFavs.map((f) => [f.id, f]));
  const aF = new Map(afterFavs.map((f) => [f.id, f]));
  return {
    added: afterTree.filter((n) => !bMap.has(n.id)),
    removed: beforeTree.filter((n) => !aMap.has(n.id)).map((n) => ({ node: n, next: T.nextSiblingId(beforeTree, n.id) })),
    modified: afterTree.filter((n) => bMap.has(n.id) && !sameNode(n, bMap.get(n.id)))
      .map((n) => ({ before: bMap.get(n.id), after: n, next: T.nextSiblingId(beforeTree, n.id) })),
    favAdded: afterFavs.filter((f) => !bF.has(f.id)),
    favRemoved: beforeFavs.map((f, index) => ({ fav: f, index })).filter(({ fav }) => !aF.has(fav.id)),
    favModified: afterFavs.filter((f) => bF.has(f.id) && !sameFav(f, bF.get(f.id))).map((f) => ({ before: bF.get(f.id), after: f })),
    favOrder: favOrderChange(beforeFavs, afterFavs),
  };
}

/** If a command reordered favorites, remember both orders (of the favorites present before and after). */
function favOrderChange(beforeFavs, afterFavs) {
  const kept = new Set(beforeFavs.map((f) => f.id).filter((id) => afterFavs.some((f) => f.id === id)));
  const before = beforeFavs.map((f) => f.id).filter((id) => kept.has(id));
  const after = afterFavs.map((f) => f.id).filter((id) => kept.has(id));
  return before.join() === after.join() ? null : { before, after };
}

/** Work out how to reverse `ch` against the current data. Pure: returns the new data plus any conflicts. */
export function planUndo(ch, currentTree, currentFavs) {
  let t = structuredClone(currentTree);
  let favs = structuredClone(currentFavs);
  const conflicts = [];
  const renames = [];
  const regroup = [];
  const cur = (id) => t.find((n) => n.id === id);
  const name = (n) => `“${n.title}”`;
  const nextIn = (next, parent) => (next && cur(next)?.parent === parent ? next : null);

  // 1. Put back what the command removed (parents before children).
  let pending = [...ch.removed];
  for (let progress = true; pending.length && progress;) {
    progress = false;
    for (const r of [...pending]) {
      const ready = cur(r.node.id) || r.node.parent == null || cur(r.node.parent);
      if (!ready) continue;
      if (!cur(r.node.id)) t = T.insertNode(t, structuredClone(r.node), nextIn(r.next, r.node.parent));
      pending.splice(pending.indexOf(r), 1);
      progress = true;
    }
  }
  for (const r of pending) conflicts.push(`can't restore ${name(r.node)}: the folder it was in has since been deleted`);

  // 2. Revert what it renamed, moved or restyled (only if you haven't touched it since).
  for (const m of ch.modified) {
    const c = cur(m.after.id);
    if (!c) { conflicts.push(`${name(m.after)} has since been deleted`); continue; }
    if (!sameNode(c, m.after)) { conflicts.push(`${name(m.after)} has been changed since`); continue; }
    if (m.before.parent !== c.parent) {
      if (m.before.parent != null && !cur(m.before.parent)) { conflicts.push(`can't move ${name(m.after)} back: its old folder is gone`); continue; }
      t = T.moveNode(t, c.id, m.before.parent, nextIn(m.next, m.before.parent));
      regroup.push(c.id);
    }
    const i = t.findIndex((n) => n.id === c.id);
    t[i] = structuredClone(m.before);
    if (m.before.parent == null && m.before.title !== m.after.title) renames.push({ from: m.after.title, to: m.before.title });
  }

  // 3. Remove what it added: deepest first; a folder stays if anything is still inside it.
  const depth = (id) => { let d = 0; for (let n = cur(id); n && n.parent != null; n = cur(n.parent)) d++; return d; };
  for (const a of ch.added.filter((n) => cur(n.id) && n.id !== T.ARCHIVE_ID).sort((x, y) => depth(y.id) - depth(x.id))) {
    const c = cur(a.id);
    if (!sameNode(c, a)) { conflicts.push(`${name(a)} has been changed since`); continue; }
    const left = T.childrenOf(t, a.id).length;
    if (left) { conflicts.push(`${name(a)} still has ${left} item${left === 1 ? '' : 's'} in it`); continue; }
    t = t.filter((n) => n.id !== a.id);
  }

  // Favorites.
  for (const { fav, index } of ch.favRemoved) {
    if (!favs.some((f) => f.id === fav.id || f.url === fav.url)) favs.splice(Math.min(index, favs.length), 0, structuredClone(fav));
  }
  for (const m of ch.favModified) {
    const i = favs.findIndex((f) => f.id === m.after.id);
    if (i < 0) { conflicts.push(`favorite “${m.after.title}” has since been removed`); continue; }
    if (!sameFav(favs[i], m.after)) { conflicts.push(`favorite “${m.after.title}” has been changed since`); continue; }
    favs[i] = structuredClone(m.before);
  }
  // Put back the order, unless you've reordered those favorites yourself since.
  if (ch.favOrder) {
    const ids = new Set(ch.favOrder.after);
    const now = favs.map((f) => f.id).filter((id) => ids.has(id));
    if (now.join() === ch.favOrder.after.join()) {
      const slots = favs.map((f, i) => (ids.has(f.id) ? i : -1)).filter((i) => i >= 0);
      const byId = new Map(favs.map((f) => [f.id, f]));
      ch.favOrder.before.filter((id) => byId.has(id)).forEach((id, k) => { favs[slots[k]] = byId.get(id); });
    } else {
      conflicts.push('favorites have been reordered since');
    }
  }
  for (const a of ch.favAdded) {
    const i = favs.findIndex((f) => f.id === a.id);
    if (i < 0) continue;
    if (!sameFav(favs[i], a)) { conflicts.push(`favorite “${a.title}” has been changed since`); continue; }
    favs.splice(i, 1);
  }

  return { tree: t, favorites: favs, conflicts, renames, regroup };
}

// ---------------------------------------------------------------- public API

/**
 * Apply a command `{ id?, summary?, ops: [...] }` to the live data.
 * ctx.groups: Chrome tab groups in the window (so a group name can be used as a space).
 * Returns { status: 'ok'|'error'|'conflict', summary, created, stats, error?, undoId? }.
 */
export async function applyCommand(cmd, ctx = {}) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) fail('a command must be a JSON object');
  const ops = cmd.ops ?? (cmd.op ? [cmd] : null);
  if (!Array.isArray(ops) || !ops.length) fail('a command needs an "ops" list');
  if (ops.length > MAX_OPS) fail(`too many ops (max ${MAX_OPS})`);

  if (ops.length === 1 && ops[0].op === 'undo') return undo(ops[0].command, { force: !!ops[0].force, ctx });

  // Queued with sidebar edits, and read fresh here, so nothing you did a moment ago is lost.
  const { result, after } = await T.serialize(async () => {
    const { tree = [], favorites = [] } = await chrome.storage.local.get(['tree', 'favorites']);
    const d = new Draft(tree, favorites, ctx.groups);
    const results = [];
    for (const [i, op] of ops.entries()) {
      const w = `ops[${i}] (${op?.op ?? '?'})`;
      const fn = OPS[op?.op];
      if (!fn) fail(`${w}: unknown op (use one of ${Object.keys(OPS).join(', ')}, undo)`);
      results.push((await fn(d, op, w)) ?? {});
    }
    const undoId = cmd.id ? String(cmd.id) : uid();
    const summary = describe(d.stats, d.created);
    const changes = diffChanges(tree, d.tree, favorites, d.favorites);
    const undoList = await getUndoList();
    undoList.unshift({ id: undoId, at: Date.now(), summary, changes });
    await chrome.storage.local.set({ tree: d.tree, favorites: d.favorites, [UNDO_KEY]: undoList.slice(0, UNDO_MAX) });
    return { result: { status: 'ok', summary, stats: d.stats, created: d.created, results, undoId }, after: d.after };
  });
  await runAfter(after, ctx);
  return result;
}

async function getUndoList() {
  const list = (await chrome.storage.local.get(UNDO_KEY))[UNDO_KEY] ?? [];
  return list.filter((u) => u.changes); // entries from v0.4.0 held whole snapshots; those are dropped
}

/**
 * Reverse one command's changes (the latest if no id). Edits made since are kept.
 * If something it would touch has changed since, nothing happens and the conflicts are returned,
 * unless `force`, which reverses everything that can be and leaves the conflicting items as they are.
 */
export async function undo(commandId, { force = false, ctx = {} } = {}) {
  const { result, after } = await T.serialize(async () => {
    const list = await getUndoList();
    const i = commandId ? list.findIndex((u) => u.id === String(commandId)) : 0;
    const entry = list[i];
    if (!entry) fail(commandId ? `nothing to undo for "${commandId}"` : 'nothing to undo');
    const { tree = [], favorites = [] } = await chrome.storage.local.get(['tree', 'favorites']);
    const plan = planUndo(entry.changes, tree, favorites);
    if (plan.conflicts.length && !force) {
      return {
        result: {
          status: 'conflict',
          summary: `Can’t fully undo “${entry.summary}”`,
          error: `Can’t fully undo “${entry.summary}”: ${plan.conflicts.join('; ')}. Undo with "force": true to reverse the rest.`,
          conflicts: plan.conflicts,
          undoId: entry.id,
        },
        after: [],
      };
    }
    list.splice(i, 1);
    await chrome.storage.local.set({ tree: plan.tree, favorites: plan.favorites, [UNDO_KEY]: list });
    const kept = plan.conflicts.length ? ` (left ${plan.conflicts.length} item${plan.conflicts.length === 1 ? '' : 's'} you’d changed)` : '';
    return {
      result: { status: 'ok', summary: `Undid: ${entry.summary}${kept}`, undone: entry.id, skipped: plan.conflicts, created: [], stats: {} },
      after: [
        ...plan.renames.map((r) => ({ kind: 'renameGroup', ...r })),
        ...plan.regroup.map((id) => ({ kind: 'regroup', id })),
      ],
    };
  });
  await runAfter(after, ctx);
  return result;
}

async function runAfter(actions, ctx) {
  for (const a of actions) {
    try {
      if (a.kind === 'renameGroup' && ctx.windowId != null) {
        const g = await T.findGroup(ctx.windowId, a.from);
        if (g) await chrome.tabGroups.update(g.id, { title: a.to });
      } else if (a.kind === 'recolorGroup' && ctx.windowId != null) {
        const g = await T.findGroup(ctx.windowId, a.title);
        if (g) await chrome.tabGroups.update(g.id, { color: a.color });
      } else if (a.kind === 'unlink') {
        const [tree, links] = await Promise.all([T.getTree(), T.getLinks()]);
        const node = T.byId(tree, a.id);
        const ids = node?.type === 'pin' ? [a.id] : T.pinsUnder(tree, a.id).map((p) => p.id);
        let changed = false;
        for (const p of ids) if (links[p] != null) { delete links[p]; changed = true; }
        if (changed) await T.setLinks(links);
      } else if (a.kind === 'regroup') {
        const [tree, links] = await Promise.all([T.getTree(), T.getLinks()]);
        const node = T.byId(tree, a.id);
        const root = T.rootOf(tree, a.id);
        const pins = node?.type === 'pin' ? [node] : T.pinsUnder(tree, a.id);
        for (const p of pins) {
          const tid = links[p.id];
          if (tid == null) continue;
          const tab = await chrome.tabs.get(tid).catch(() => null);
          if (tab) await T.putInGroup(tid, tab.windowId, root.title, root.color);
        }
      }
    } catch (e) {
      console.warn('agent follow-up failed', a, e);
    }
  }
}

export { OpError };
