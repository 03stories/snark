import { FEATURES } from '../features/registry.js';
import { getAll, setFeature } from '../core/settings.js';
import * as T from '../core/tree.js';
import { getArchive, archiveAndClose, restore, forget, clearArchive } from '../core/archive.js';
import { THEMES, themeKeyFor, themeColors, mix } from './themes.js';
import * as F from '../core/favorites.js';
import * as FI from '../core/favicons.js';
import * as B from '../core/backup.js';
import * as AF from '../core/agent-folder.js';
import { undo as agentUndo } from '../core/agent-ops.js';

const COLORS = {
  grey: '#9aa0a6', blue: '#4c8bf5', red: '#e8453c', yellow: '#f9bb2d', green: '#3cba54',
  pink: '#ff63b8', purple: '#a142f4', cyan: '#24c1e0', orange: '#fa903e',
};
const CHEV = `<svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const FOLDER = `<svg class="fold" viewBox="0 0 16 16"><path d="M1.5 4.5a1 1 0 011-1h3.6l1.4 1.5h6a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
const GEAR = `<svg viewBox="0 0 20 20"><path fill="currentColor" d="M11.3 1.5l.4 2.2c.5.2 1 .5 1.4.8l2.1-.8 1.3 2.3-1.7 1.4c.1.5.1 1.1 0 1.6l1.7 1.4-1.3 2.3-2.1-.8c-.4.3-.9.6-1.4.8l-.4 2.2H8.7l-.4-2.2c-.5-.2-1-.5-1.4-.8l-2.1.8-1.3-2.3 1.7-1.4a5 5 0 010-1.6L3.5 6l1.3-2.3 2.1.8c.4-.3.9-.6 1.4-.8l.4-2.2h2.6zM10 7a3 3 0 100 6 3 3 0 000-6z" transform="translate(0 1)"/></svg>`;
const ARCHIVE_FOLDER = `<svg class="fold" viewBox="0 0 16 16"><path d="M2 3.5h12v3H2zM3 6.5v6.5h10V6.5M6.5 9h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const isArchiveFolder = (n) => n?.type === 'folder' && n.parent != null && /^archive$/i.test(String(n.title).trim());
const ARCH = T.ARCHIVE_ID; // the global Archive (its page key and tree id)
const ARCHIVE_OPTS = [['0', 'Never'], ['24', '1 day'], ['168', '1 week'], ['720', '1 month']];
const ARCHIVE = `<svg viewBox="0 0 16 16"><path d="M2 3.5h12v3H2zM3 6.5v6.5h10V6.5M6.5 9h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const SEARCH = `<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const MOD = /Mac/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl+';
// Search and Settings sit at the right of whatever header is on screen (space, Archive, Settings).
const headTools = () => `<span class="head-tools">
  <button data-act="search" title="Search (${MOD}K)">${SEARCH}</button>
  <button data-act="gear" class="${ui.view === 'settings' ? 'on' : ''}" title="Settings">${GEAR}</button>
</span>`;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Icons: live tab icon → remembered icon → Google's favicon service (setting) → Chrome's cache. See core/favicons.js.
const iconOpts = (liveTab) => ({ liveTab, useGoogle: state?.cfg.groupPins.googleIcons ?? false });
const favicon = (url, liveTab = null) => FI.iconFor(url, state?.icons, iconOpts(liveTab));
const tabIcon = (t) => favicon(t.url || '', t);
const icoImg = (url, liveTab = null, cls = 'ico') =>
  `<img class="${cls}" src="${esc(favicon(url, liveTab))}" data-page="${esc(url)}" alt="">`;
const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };
const shortUrl = (url) => String(url ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const normalizeUrl = (v) => (/^[a-z][\w+.-]*:/i.test(v) ? v : `https://${v}`);
const darkMq = matchMedia('(prefers-color-scheme: dark)');

let windowId;
let state = null;
let markReady;
const ready = new Promise((r) => { markReady = r; }); // first render done
let current = null;        // key of the space currently shown
let editing = false;
let dragSrc = null;
let scrolling = false;
let pendingReason = null;  // why the next scroll-snap happened: 'user' | 'tab' | 'drag'
const lastActive = new Map(); // space key -> last active tab id

// ---------------------------------------------------------------- per-viewer UI state
const ui = (() => {
  try {
    const o = JSON.parse(localStorage.getItem('ui') || '{}');
    return { collapsed: new Set(o.collapsed || []), view: 'spaces' };
  } catch {
    return { collapsed: new Set(), view: 'spaces' };
  }
})();
function saveUi() {
  try { localStorage.setItem('ui', JSON.stringify({ collapsed: [...ui.collapsed] })); } catch {}
}
function toggleCollapsed(key) {
  ui.collapsed.has(key) ? ui.collapsed.delete(key) : ui.collapsed.add(key);
  saveUi();
  render();
}

// ---------------------------------------------------------------- data
async function load() {
  const [tree, links, tabs, groups, cfg, archive, favs, favLinks, icons] = await Promise.all([
    T.getTree(), T.getLinks(), chrome.tabs.query({}), chrome.tabGroups.query({ windowId }), getAll(), getArchive(),
    F.getFavs(), F.getFavLinks(), FI.getIconCache(),
  ]);
  const tabsById = new Map(tabs.map((t) => [t.id, t]));

  // Drop dead links, then re-adopt open tabs by URL (after a restart, links are empty).
  const live = {};
  let changed = false;
  for (const [pid, tid] of Object.entries(links)) {
    if (tabsById.has(tid) && T.byId(tree, pid)) live[pid] = tid;
    else changed = true;
  }
  const linked = new Set(Object.values(live));
  for (const p of tree) {
    if (p.type !== 'pin' || live[p.id] != null || T.isArchived(tree, p.id)) continue;
    const m = tabs.find((t) => t.windowId === windowId && t.url === p.url && !linked.has(t.id) && !t.pinned);
    if (m) { live[p.id] = m.id; linked.add(m.id); changed = true; }
  }
  if (changed) await T.setLinks(live);

  // Spaces = top-level folders (matched to a Chrome group by title) + any other Chrome groups in this window.
  const used = new Set();
  const spaces = T.spaceRoots(tree).map((root) => {
    const group = groups.find((g) => g.title === root.title && !used.has(g.id));
    if (group) used.add(group.id);
    return { key: root.id, root, title: root.title, color: group?.color ?? root.color ?? 'grey', group };
  });
  for (const g of groups) {
    if (!used.has(g.id)) spaces.push({ key: `g:${g.id}`, root: null, title: g.title, color: g.color, group: g });
  }
  const spaceMap = new Map(spaces.map((s) => [s.key, s]));

  // Favorites → this window's Chrome-pinned tabs.
  const pinnedHere = tabs.filter((t) => t.windowId === windowId && t.pinned);
  const favTabs = F.matchFavTabs(favs, favLinks[windowId], pinnedHere);
  const favTabIds = new Set([...favTabs.values()].map((t) => t.id));
  const extraPinned = pinnedHere.filter((t) => !favTabIds.has(t.id));

  // Remember icons from loaded tabs, so closed pins and favorites keep showing them.
  const pairs = tabs.flatMap((t) => FI.iconPairsForTab(t));
  for (const p of tree) if (p.type === 'pin' && live[p.id] != null) pairs.push(...FI.iconPairsForTab(tabsById.get(live[p.id]), p.url));
  for (const f of favs) { const t = favTabs.get(f.id); if (t) pairs.push(...FI.iconPairsForTab(t, f.url)); }
  FI.rememberIcons(pairs).catch(() => {});

  // Pages you can swipe between: every space. (The Archive and Settings are views, opened from the bar.)
  const pages = [
    ...(spaces.length ? spaces : [{ key: '', empty: true, title: '', color: 'grey', root: { theme: 'slate' } }]),
  ];

  return { tree, links: live, linked, tabs, tabsById, groups, cfg, archive, spaces, spaceMap, pages, favs, favTabs, extraPinned, icons };
}

const opts = () => ({ windowId, pinsAtTop: state?.cfg.groupPins.pinsAtTop ?? true });
const spaceTabs = (s) =>
  s?.group ? state.tabs.filter((t) => t.groupId === s.group.id && !state.linked.has(t.id) && !t.pinned) : [];
const looseTabs = () =>
  state.tabs.filter((t) => t.windowId === windowId && t.groupId === -1 && !t.pinned && !state.linked.has(t.id));
const spaceIndex = (key) => (state?.pages ?? []).findIndex((s) => s.key === key);

/** Resolve a space key to a real top-level folder id, creating one for a bare Chrome group. */
async function rootIdFor(key) {
  const s = state.spaceMap.get(key);
  if (s.root) return s.root.id;
  let title = s.title;
  if (!title) {
    title = 'Untitled';
    await chrome.tabGroups.update(s.group.id, { title });
  }
  return T.ensureRoot(title, s.color);
}

/** Put an existing tab into a space's tab group (creating the group if needed). */
async function joinSpace(tabId, key) {
  const s = state.spaceMap.get(key);
  if (!s) return;
  if (s.group) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: s.group.id });
  } else {
    const root = T.byId(await T.getTree(), await rootIdFor(key));
    await T.putInGroup(tabId, windowId, root.title, root.color);
  }
}

async function saveActiveSpace(key) {
  const { activeSpace = {} } = await chrome.storage.session.get('activeSpace');
  if (activeSpace[windowId] === key) return;
  activeSpace[windowId] = key;
  await chrome.storage.session.set({ activeSpace });
}

async function pickInitialSpace() {
  const [active] = state.tabs.filter((t) => t.windowId === windowId && t.active);
  const fromTab = active && active.groupId !== -1 && state.spaces.find((s) => s.group?.id === active.groupId);
  if (fromTab) return fromTab.key;
  const { activeSpace = {} } = await chrome.storage.session.get('activeSpace');
  if (state.spaceMap.has(activeSpace[windowId])) return activeSpace[windowId];
  return state.spaces[0]?.key ?? null;
}

// ---------------------------------------------------------------- render
let renderTimer;
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(render, 70); };

async function render() {
  if (editing || dragSrc || scrolling) { if (scrolling) scheduleRender(); return; }
  const next = await load();
  if (editing || dragSrc || scrolling) { scheduleRender(); return; }
  state = next;
  if (!state.spaceMap.has(current)) {
    current = await pickInitialSpace();
    if (current) saveActiveSpace(current);
  }

  renderSettings();

  const on = state.cfg.groupPins.enabled;
  if (!on && ui.view === 'archive') ui.view = 'spaces';
  applyView({ paint: false });
  $('#off').hidden = on || ui.view !== 'spaces';
  if (on) {
    renderFavorites();
    renderPages();
    if (ui.view === 'archive') $('#archive-view').innerHTML = archivePageHtml();
  }
  if (!on && ui.view === 'spaces') { $('#favorites').hidden = true; $('#pages').hidden = true; }
  renderBar();
  paintView();
  applyFlash();
}

// ---------------------------------------------------------------- views: spaces | archive | settings
function applyView() {
  const v = ui.view;
  $('#favorites').hidden = v !== 'spaces';
  $('#pages').hidden = v !== 'spaces';
  $('#settings').hidden = v !== 'settings';
  $('#archive-view').hidden = v !== 'archive';
}

function paintView() {
  if (ui.view === 'spaces') return paintAt(Math.max(0, spaceIndex(current)));
  const [c1, c2] = darkMq.matches ? THEMES.slate.dark : THEMES.slate.light;
  setGradient(c1, c2);
}

function setView(v) {
  if (ui.view === v) return;
  ui.view = v;
  closeMenu();
  if (v === 'archive' && state) $('#archive-view').innerHTML = archivePageHtml();
  applyView();
  if (v === 'spaces' && state) {
    // the pager was hidden; put it back on the current space without animating
    const idx = Math.max(0, spaceIndex(current));
    pagesEl.scrollTo({ left: idx * pagesEl.clientWidth, behavior: 'instant' });
  }
  if (state) { renderBar(); paintView(); applyFlash(); }
}

function renderFavorites() {
  const favBtn = (f) => {
    const t = state.favTabs.get(f.id);
    const cls = `fav${t ? ' open' : ' closed'}${t?.active ? ' active' : ''}`;
    return `<button class="${cls}" data-kind="fav" data-id="${f.id}" draggable="true" title="${esc(f.title)}">${icoImg(f.url, t, 'fav-ico')}</button>`;
  };
  // Chrome-pinned tabs in this window that aren't favorites (yet) still show, slightly dimmed.
  const extra = (t) =>
    `<button class="fav extra${t.active ? ' active' : ''}" data-kind="ptab" data-id="${t.id}" title="${esc(t.title)} (not a favorite yet)">${icoImg(t.url, t, 'fav-ico')}</button>`;
  $('#favorites').innerHTML = state.favs.map(favBtn).join('') + state.extraPinned.map(extra).join('');
}

function renderPages() {
  const pages = $('#pages');
  const tops = {};
  pages.querySelectorAll('.page').forEach((p) => { tops[p.dataset.space] = p.scrollTop; });

  pages.innerHTML = state.pages.map((p) => (p.empty ? emptyPageHtml() : pageHtml(p))).join('');
  pages.querySelectorAll('.page').forEach((p) => { if (tops[p.dataset.space]) p.scrollTop = tops[p.dataset.space]; });

  const idx = Math.max(0, spaceIndex(current));
  if (Math.round(pages.scrollLeft) !== idx * pages.clientWidth) pages.scrollTo({ left: idx * pages.clientWidth, behavior: 'instant' });
  paintAt(idx);
}

function iconHtml(s) {
  if (s.root?.icon) return esc(s.root.icon);
  const letter = (s.title || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="initial" style="background:${COLORS[s.color] ?? COLORS.grey}">${esc(letter)}</span>`;
}

function emptyPageHtml() {
  return `<section class="page" data-space="">
    <div class="row page-head">${headTools()}</div>
    <div class="empty muted">No spaces yet.<br><br><button class="primary" data-act="new-space">Create a space</button></div>
    ${looseHtml()}
  </section>`;
}

function pageHtml(s) {
  const tabs = spaceTabs(s);
  const hasKids = s.root && T.childrenOf(state.tree, s.root.id).length;
  const k = esc(s.key);
  return `<section class="page" data-space="${k}">
    <div class="row page-head" data-kind="space" data-id="${k}">
      <span class="sicon">${iconHtml(s)}</span><span class="title">${esc(s.title || 'Unnamed group')}</span>
      <span class="acts"><button data-act="menu" title="Space options">⋯</button></span>
      ${headTools()}
    </div>
    <div class="tree">
      ${s.root ? childrenHtml(s.root.id, 0) : ''}
      ${hasKids ? '' : `<div class="row hint" data-kind="space-empty" data-id="${k}">Drag tabs here to pin them</div>`}
    </div>
    <div class="today" data-zone="today" data-space="${k}">
      <div class="today-head"><span class="rule"></span>${
        tabs.length ? `<button data-act="clear" data-space="${k}" title="Close this space’s unpinned tabs (restorable)">↓ Clear</button>` : ''
      }</div>
      <div class="row newtab" data-act="new-tab" data-space="${k}">＋ New Tab</div>
      ${tabs.map((t) => tabHtml(t, 0)).join('')}
    </div>
    ${looseHtml()}
  </section>`;
}

function looseHtml() {
  const loose = looseTabs();
  if (!loose.length) return '';
  return `<div class="loose" data-zone="loose">
    <div class="loose-head">Not in a space · ${loose.length}</div>
    ${loose.map((t) => tabHtml(t, 0)).join('')}
  </div>`;
}

function childrenHtml(parentId, depth) {
  return T.childrenOf(state.tree, parentId)
    .map((n) => (n.type === 'pin' ? pinHtml(n, depth) : folderHtml(n, depth)))
    .join('');
}

function folderHtml(f, depth) {
  const collapsed = ui.collapsed.has(f.id);
  const count = T.pinsUnder(state.tree, f.id).length;
  return `<div class="row folder${collapsed ? ' collapsed' : ''}" data-kind="folder" data-id="${f.id}" draggable="true" style="--d:${depth}">
      ${CHEV}${isArchiveFolder(f) ? ARCHIVE_FOLDER : FOLDER}<span class="title">${esc(f.title)}</span>
      <span class="count">${count || ''}</span>
      <span class="acts"><button data-act="menu" title="More">⋯</button></span>
    </div>${collapsed ? '' : childrenHtml(f.id, depth + 1)}`;
}

function pinHtml(p, depth) {
  const tab = state.tabsById.get(state.links[p.id]);
  const open = !!tab;
  const drifted = open && tab.url && tab.url !== p.url;
  const active = open && tab.active && tab.windowId === windowId;
  // Shown as a hover label after a short delay: the pinned URL, plus where you are now if you've navigated away.
  const sub = drifted
    ? `${esc(shortUrl(p.url))}<span class="now">↳ now: ${esc(tab.title || shortUrl(tab.url))}</span>`
    : esc(shortUrl(p.url));
  const noteHtml = p.note ? `<span class="note">${esc(p.note)}</span>` : '';
  return `<div class="row pin ${open ? 'open' : 'closed'}${drifted ? ' drifted' : ''}${active ? ' active' : ''}"
       data-kind="pin" data-id="${p.id}" draggable="true" style="--d:${depth}">
    ${icoImg(p.url, tab)}
    <div class="text"><div class="title">${esc(p.title)}</div><div class="sub">${sub}${noteHtml}</div></div>
    <span class="acts">
      ${open ? '<button data-act="close-pin" title="Close tab, keep pinned">—</button>' : ''}
      <button data-act="menu" title="More">⋯</button>
    </span>
  </div>`;
}

function tabHtml(t, depth) {
  const active = t.active && t.windowId === windowId;
  return `<div class="row tab${active ? ' active' : ''}" data-kind="tab" data-id="${t.id}" draggable="true" style="--d:${depth}">
    ${icoImg(t.url, t)}
    <div class="text"><div class="title">${esc(t.title || t.url)}</div><div class="sub">${esc(shortUrl(t.url))}</div></div>
    <span class="acts"><button data-act="menu" title="More">⋯</button><button data-act="close-tab" title="Close">✕</button></span>
  </div>`;
}

function renderBar() {
  const on = state.cfg.groupPins.enabled;
  // Archive on the left, the spaces centered, ＋ on the right. (Settings only lands here while
  // spaces are off, since there's no space header to hold it then.)
  $('#bar').innerHTML = `
    ${on
      ? `<button class="bar-btn${ui.view === 'archive' ? ' on' : ''}" data-act="view-archive" data-drop="archive" title="Archive">${ARCHIVE}</button>`
      : `<button class="bar-btn${ui.view === 'settings' ? ' on' : ''}" data-act="gear" title="Settings">${GEAR}</button>`}
    <div class="bar-spaces">${(on ? state.spaces : []).map((s) =>
      `<button class="bar-space${ui.view === 'spaces' && s.key === current ? ' on' : ''}" data-act="goto" data-space="${esc(s.key)}" data-drop="bar" title="${esc(s.title || 'Unnamed group')}">${iconHtml(s)}</button>`
    ).join('')}</div>
    <button class="bar-btn" data-act="new-space" title="New space"${on ? '' : ' style="visibility:hidden"'}>＋</button>`;
  // the Settings header is static HTML; keep its gear's state in step
  $('#settings .view-head .head-tools')?.remove();
  $('#settings .view-head').insertAdjacentHTML('beforeend', headTools());
}

function markBar() {
  document.querySelectorAll('#bar [data-act="goto"]').forEach((b) => b.classList.toggle('on', ui.view === 'spaces' && b.dataset.space === current));
}

const openSettings = () => setView('settings');
const closeSettings = () => { if (ui.view === 'settings') setView('spaces'); };

// ---------------------------------------------------------------- the Archive page
function inDays(ms) {
  const d = Math.ceil(ms / 86400e3);
  return d <= 1 ? 'today' : `in ${d}d`;
}

function archItemsHtml(parentId, depth, top) {
  return T.childrenOf(state.tree, parentId).map((n) => archRowHtml(n, depth, top)).join('');
}

function archRowHtml(n, depth = 0, top = true) {
  const hours = Number(state.cfg.autoClear.archiveAfter ?? 0);
  const at = n.archivedAt ?? Date.now();
  const from = top && n.from?.spaceTitle ? `<span class="from">· ${n.from.spaceIcon ? esc(n.from.spaceIcon) + ' ' : ''}${esc(n.from.spaceTitle)}</span>` : '';
  const when = top ? `archived ${timeAgo(at)}${hours ? ` · removed ${inDays(at + hours * 3600e3 - Date.now())}` : ''}` : '';
  const restoreBtn = '<button data-act="arch-restore" title="Put back where it was">↩︎</button>';
  if (n.type === 'folder') {
    const collapsed = !ui.collapsed.has(`open:${n.id}`); // archived folders start collapsed
    const count = T.pinsUnder(state.tree, n.id).length;
    return `<div class="row folder afolder${collapsed ? ' collapsed' : ''}" data-kind="afolder" data-id="${n.id}" draggable="true" style="--d:${depth}">
        ${CHEV}${FOLDER}<span class="title">${esc(n.title)} ${from}</span>
        <span class="count">${count}${top ? ` · ${timeAgo(at).replace(' ago', '')}` : ''}</span>
        ${when ? `<div class="sub">${esc(when)}</div>` : ''}
        <span class="acts">${restoreBtn}<button data-act="menu" title="More">⋯</button></span>
      </div>${collapsed ? '' : archItemsHtml(n.id, depth + 1, false)}`;
  }
  return `<div class="row pin closed apin" data-kind="apin" data-id="${n.id}" draggable="true" style="--d:${depth}">
    ${icoImg(n.url)}
    <div class="text"><div class="title">${esc(n.title)} ${from}</div><div class="sub">${esc(shortUrl(n.url))}${when ? `<span class="now">${esc(when)}</span>` : ''}</div></div>
    ${top ? `<span class="count">${timeAgo(at).replace(' ago', '')}</span>` : ''}
    <span class="acts">${restoreBtn}<button data-act="menu" title="More">⋯</button></span>
  </div>`;
}

function archivePageHtml() {
  const put = T.childrenOf(state.tree, ARCH);
  const closed = state.archive;
  const after = String(state.cfg.autoClear.archiveAfter ?? '720');
  return `<div class="archive-page">
    <div class="view-head"><span class="sicon">🗄</span><span class="title">Archive</span>${headTools()}</div>
    <div class="arch-settings">
      <span class="muted">Empty after</span>
      <span class="seg">${ARCHIVE_OPTS.map(([v, l]) => `<button data-act="arch-after" data-v="${v}" class="${after === v ? 'on' : ''}">${l}</button>`).join('')}</span>
      ${put.length || closed.length ? '<button data-act="arch-clear" class="arch-clear">Clear now</button>' : ''}
    </div>
    <div class="arch-section" data-zone="archive">
      <div class="loose-head">Put away · ${put.length}</div>
      ${put.length ? put.map((n) => archRowHtml(n)).join('') : '<div class="row hint">Right-click a pin or folder → Archive, or drag it onto 🗄</div>'}
    </div>
    <div class="arch-section">
      <div class="loose-head">Closed tabs · ${closed.length}</div>
      ${closed.length ? '' : '<div class="row hint">Tabs closed by ↓ Clear or auto-clear land here.</div>'}
      ${closed.slice(0, 100).map((it, i) => `<div class="row" data-kind="archived" data-idx="${i}">
          ${icoImg(it.url)}
          <div class="text"><div class="title">${esc(it.title)}</div><div class="sub">${esc(shortUrl(it.url))}</div></div>
          <span class="count">${timeAgo(it.closedAt).replace(' ago', '')}</span>
          <span class="acts"><button data-act="forget" title="Remove from list">✕</button></span>
        </div>`).join('')}
    </div>
  </section>`;
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// ---------------------------------------------------------------- themes (live blend while swiping)
function paintAt(pos) {
  const sp = state?.pages ?? [];
  const dark = darkMq.matches;
  if (!sp.length) {
    const [c1, c2] = dark ? THEMES.slate.dark : THEMES.slate.light;
    return setGradient(c1, c2);
  }
  const i = Math.max(0, Math.min(sp.length - 1, Math.floor(pos)));
  const j = Math.min(sp.length - 1, i + 1);
  const f = Math.min(1, Math.max(0, pos - i));
  const a = themeColors(sp[i], dark);
  const b = themeColors(sp[j], dark);
  setGradient(mix(a[0], b[0], f), mix(a[1], b[1], f));
}
function setGradient(c1, c2) {
  document.body.style.setProperty('--g1', c1);
  document.body.style.setProperty('--g2', c2);
}
darkMq.addEventListener('change', () => paintView());

// ---------------------------------------------------------------- switching spaces
const pagesEl = $('#pages');
let paintFrame = 0;
pagesEl.addEventListener('scroll', () => {
  scrolling = true;
  cancelAnimationFrame(paintFrame);
  paintFrame = requestAnimationFrame(() => paintAt(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth)));
}, { passive: true });

pagesEl.addEventListener('scrollend', () => {
  scrolling = false;
  if (!state?.pages.length) return;
  const idx = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
  const key = state.pages[Math.max(0, Math.min(state.pages.length - 1, idx))].key;
  const reason = pendingReason ?? 'user';
  pendingReason = null;
  if (key !== current) onSpaceChanged(key, reason);
  applyFlash(); // a search result may be waiting for this page to arrive
});

function goToSpace(key, reason) {
  const idx = spaceIndex(key);
  if (idx < 0) return;
  if (key === current && Math.round(pagesEl.scrollLeft) === idx * pagesEl.clientWidth) {
    if (reason === 'user') enterSpace(key);
    return;
  }
  pendingReason = reason;
  pagesEl.scrollTo({ left: idx * pagesEl.clientWidth, behavior: 'smooth' });
}

async function onSpaceChanged(key, reason) {
  current = key;
  markBar();
  if (key === ARCH || key === '') return; // not a real space: new tabs keep joining the last one
  await saveActiveSpace(key);
  if (reason === 'user') await enterSpace(key);
  else if (reason === 'tab') await enterSpace(key, { activate: false });
}

/** Show the space's last tab, and fold away the other spaces' tab groups. */
async function enterSpace(key, { activate = true } = {}) {
  const s = state.spaceMap.get(key);
  if (!s) return;
  const tabs = await chrome.tabs.query({ windowId });
  if (s.group && activate) {
    const inSpace = tabs.filter((t) => t.groupId === s.group.id);
    if (!inSpace.some((t) => t.active)) {
      const target = inSpace.find((t) => t.id === lastActive.get(key)) ?? inSpace[0];
      if (target) await chrome.tabs.update(target.id, { active: true }).catch(() => {});
    }
  }
  if (state.cfg.groupPins.collapseOthers) {
    const [active] = await chrome.tabs.query({ windowId, active: true });
    for (const g of await chrome.tabGroups.query({ windowId })) {
      const mine = s.group && g.id === s.group.id;
      if (!mine && g.id === active?.groupId) continue; // Chrome won't collapse the active tab's group
      if (g.collapsed !== !mine) await chrome.tabGroups.update(g.id, { collapsed: !mine }).catch(() => {});
    }
  }
}

// Follow along when a tab in another space gets activated (tab strip, ⌘-click, links…).
chrome.tabs.onActivated.addListener(async ({ tabId, windowId: w }) => {
  if (w !== windowId) return;
  scheduleRender();
  let t;
  try { t = await chrome.tabs.get(tabId); } catch { return; }
  if (t.groupId === -1 || !state) return;
  const s = state.spaces.find((x) => x.group?.id === t.groupId);
  if (!s) return;
  lastActive.set(s.key, tabId);
  if (s.key !== current) goToSpace(s.key, 'tab');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'space-step' || msg.windowId !== windowId || !state?.pages.length) return;
  setView('spaces');
  const n = state.pages.length;
  const idx = (Math.max(0, spaceIndex(current)) + msg.dir + n) % n;
  goToSpace(state.pages[idx].key, 'user');
});

// ---------------------------------------------------------------- search results
// Search Snark itself is search/search.html, centered over the browser (see features/search-launcher.js).
// When you pick a result there, it opens it and the sidebar shows where it lives: its space,
// folders expanded, scrolled to, glowing for a moment.

/** ⌘K, / and 🔍 in the sidebar. A window, because Chrome can't hand keyboard focus from here to a page. */
function openSearch() {
  closeMenu();
  chrome.runtime.sendMessage({ target: 'sw', type: 'open-search', windowId, inPage: false }).catch(() => {});
}

// After a pick, the row it landed on glows briefly. Kept here (not on the DOM) because the
// sidebar re-renders as tabs open, so the glow is re-applied, mid-animation, after each render.
let flash = null; // { kind, id, scope, at, scroll }
const FLASH_MS = 1800;

function setFlash(kind, id, scope = null) {
  flash = { kind, id: String(id), scope, at: Date.now(), scroll: true };
}

function applyFlash() {
  if (!flash) return;
  const elapsed = Date.now() - flash.at;
  if (elapsed > FLASH_MS) { flash = null; return; }
  const attr = flash.kind === 'archived' ? 'idx' : 'id';
  const sel = `[data-kind="${flash.kind}"][data-${attr}="${CSS.escape(flash.id)}"]`;
  const scope = flash.scope != null ? document.querySelector(`.page[data-space="${CSS.escape(flash.scope)}"]`) : document;
  const el = scope?.querySelector(sel);
  if (!el) return;
  el.classList.add('found');
  el.style.animationDelay = `-${elapsed}ms`;
  if (flash.scroll && !scrolling) {
    flash.scroll = false;
    const box = el.closest('.page, .view');
    if (!box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
      box.scrollTo({ top: box.scrollTop + (r.top - b.top) - b.height / 3, behavior: 'smooth' });
    }
  }
}

/** Show a pin or folder in the sidebar: its space (or the Archive), folders expanded, scrolled to, glowing. */
function revealNode(id, { reason = 'reveal' } = {}) {
  const tree = state.tree;
  const n = T.byId(tree, id);
  if (!n) return;
  const archived = T.isArchived(tree, id);
  for (let a = T.byId(tree, n.parent); a && a.parent != null; a = T.byId(tree, a.parent)) {
    if (archived) ui.collapsed.add(`open:${a.id}`); // archived folders start collapsed, so "open" is the flag
    else ui.collapsed.delete(a.id);
  }
  saveUi();
  if (archived) {
    setFlash(n.type === 'pin' ? 'apin' : 'afolder', id);
    setView('archive');
  } else {
    const key = T.rootOf(tree, id)?.id;
    setFlash(n.type, id, key);
    setView('spaces');
    if (key !== current) goToSpace(key, reason);
  }
  render();
}

/** Show a picked search result. `open`: you pressed ↵ (the search page already opened it), not ⌘↵. */
async function showEntry(e, { open = false } = {}) {
  await ready;
  switch (e.kind) {
    case 'pin':
      return revealNode(e.id, { reason: open && !e.archived ? 'tab' : 'reveal' });
    case 'folder':
      if (e.archived) ui.collapsed.add(`open:${e.id}`);
      else ui.collapsed.delete(e.id);
      return revealNode(e.id);
    case 'space': {
      if (!state.spaceMap.has(e.id)) return;
      const wasElsewhere = ui.view !== 'spaces';
      setView('spaces');
      setFlash('space', e.id, e.id);
      if (wasElsewhere && e.id === current && open) enterSpace(current);
      else goToSpace(e.id, open ? 'user' : 'reveal');
      return render();
    }
    case 'fav':
      setFlash('fav', e.id);
      setView('spaces');
      return render();
    case 'tab': {
      setView('spaces');
      const key = state.spaceMap.has(e.spaceKey) ? e.spaceKey : current;
      setFlash('tab', e.id, key);
      if (key && key !== current) goToSpace(key, open ? 'tab' : 'reveal');
      return render();
    }
    case 'closed':
      if (open) return;
      setFlash('archived', e.id);
      setView('archive');
      return render();
    case 'action':
      switch (e.id) {
        case 'settings': return setView('settings');
        case 'archive': return setView('archive');
        case 'new-space': setView('spaces'); return createSpace();
        case 'pin-current': {
          const [tab] = await chrome.tabs.query({ active: true, windowId });
          if (!tab?.url || /^chrome(-extension)?:/.test(tab.url)) return;
          setView('spaces');
          if (tab.groupId === -1 && current) await T.pinTabAt(tab, await rootIdFor(current), null, opts());
          else await T.pinTab(tab, opts());
          const id = await T.pinIdForTab(tab.id);
          if (id) { await render(); revealNode(id); }
          return;
        }
      }
  }
}

// ---------------------------------------------------------------- settings reveal
let lastCfg = '';
function renderSettings() {
  const json = JSON.stringify(state.cfg);
  if (json === lastCfg) return;
  lastCfg = json;
  const root = $('#settings-body');
  root.replaceChildren();
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

  for (const meta of FEATURES) {
    const cfg = state.cfg[meta.id];
    const toggle = el('input', { type: 'checkbox', checked: cfg.enabled });
    toggle.addEventListener('change', () => setFeature(meta.id, { enabled: toggle.checked }));
    const optsEl = el('div', { className: 'opts' });
    for (const s of meta.settings ?? []) {
      if (s.hidden) continue;
      if (s.type === 'select') {
        const sel = el('select');
        for (const o of s.options) sel.append(el('option', { value: o.value, textContent: o.label, selected: String(cfg[s.key]) === o.value }));
        sel.addEventListener('change', () => setFeature(meta.id, { [s.key]: sel.value }));
        optsEl.append(el('label', {}, `${s.label} `, sel));
      } else {
        const box = el('input', { type: 'checkbox', checked: !!cfg[s.key] });
        box.addEventListener('change', () => setFeature(meta.id, { [s.key]: box.checked }));
        optsEl.append(el('label', {}, box, s.label));
      }
    }
    root.append(
      el('div', { className: 'feature' + (cfg.enabled ? '' : ' off') },
        el('div', { className: 'head' }, el('strong', { textContent: meta.name }), el('label', { className: 'switch' }, toggle, el('span'))),
        el('p', { className: 'desc muted', textContent: meta.description }),
        optsEl)
    );
  }
}

// ---------------------------------------------------------------- archive actions
async function archiveItem(id) {
  const n = T.byId(state.tree, id);
  await T.archiveNode(id);
  showNotice(`Archived “${esc(n?.title ?? 'item')}”.`, { action: { act: 'arch-restore-last', cmd: id, label: 'Restore' } });
}

async function restoreArchived(id) {
  try {
    const to = await T.restoreNode(id);
    const tree = await T.getTree();
    const space = T.rootOf(tree, to);
    showNotice(`Restored to ${esc(space?.icon ? `${space.icon} ` : '')}${esc(space?.title ?? 'its space')}.`);
  } catch (e) {
    showNotice(esc(e.message), { error: true });
  }
}

// ---------------------------------------------------------------- agent folder
let agent = { status: 'none' };
let noticeTimer = null;

function renderAgentUi() {
  const st = $('#agent-status');
  st.classList.toggle('warn', agent.status === 'needs-permission');
  st.textContent = agent.status === 'ok'
    ? `Connected to “${agent.name}”. Syncing in the background while Chrome is open.`
    : agent.status === 'needs-permission'
      ? `“${agent.name}” needs permission again (Chrome asks after a restart).`
      : 'Not connected.';
  $('[data-act="agent-choose"]').textContent = agent.status === 'none' ? 'Choose folder…' : 'Change folder…';
  $('[data-act="agent-reconnect"]').hidden = agent.status !== 'needs-permission';
  $('[data-act="agent-disconnect"]').hidden = agent.status === 'none';
  if (agent.status === 'needs-permission') {
    showNotice(`Agent folder “${esc(agent.name)}” is paused. Click anywhere to reconnect.`, { action: { act: 'agent-reconnect', label: 'Reconnect' }, sticky: true });
    armReconnectOnFirstClick();
  }
}

// Chrome only lets a page ask for folder permission during a click. Rather than making you find
// the Reconnect button, the first click anywhere in the sidebar asks (choose "Allow on every visit"
// if Chrome offers it, and this stops happening).
let reconnectArmed = false;
function armReconnectOnFirstClick() {
  if (reconnectArmed) return;
  reconnectArmed = true;
  document.addEventListener('pointerdown', async () => {
    reconnectArmed = false;
    if (agent.status === 'needs-permission') await agentReconnect().catch(() => {});
  }, { once: true, capture: true });
}

async function agentChoose() {
  try {
    agent = await AF.chooseAgentDir();
  } catch (e) {
    if (e?.name !== 'AbortError') showNotice(`Couldn’t use that folder: ${esc(e.message)}`, { error: true });
    return;
  }
  renderAgentUi();
  hideNotice();
  agentSyncHost();
}

let reconnecting = null;
async function agentReconnect() {
  if (reconnecting) return reconnecting; // one permission prompt at a time
  reconnecting = (async () => {
    try { agent = await AF.getAgentDir({ ask: true }); } finally { reconnecting = null; }
  })();
  await reconnecting;
  if (agent.status === 'ok') await AF.scaffold(agent.handle).catch((e) => console.warn('agent folder scaffold', e)); // upgrade guide/schema here too
  renderAgentUi();
  if (agent.status === 'ok') { hideNotice(); agentSyncHost(); }
}

async function agentUndoClick(cmdId, force = false) {
  try {
    const r = await agentUndo(cmdId, { force, ctx: { windowId, groups: state?.groups ?? [] } });
    if (r.status === 'conflict') {
      const list = r.conflicts.slice(0, 3).map(esc).join('; ') + (r.conflicts.length > 3 ? `; +${r.conflicts.length - 3} more` : '');
      showNotice(`${esc(r.summary)}: ${list}.`, { action: { act: 'agent-undo-force', cmd: cmdId, label: 'Undo the rest' }, sticky: true });
      return;
    }
    showNotice(esc(r.summary));
  } catch (e) {
    showNotice(esc(e.message), { error: true });
  }
}

function showNotice(html, { action, error = false, sticky = false } = {}) {
  const n = $('#notice');
  clearTimeout(noticeTimer);
  n.className = error ? 'err' : '';
  n.innerHTML = `<span class="msg">${html}</span>${
    action ? `<button class="undo" data-act="${action.act}"${action.cmd ? ` data-cmd="${esc(action.cmd)}"` : ''}>${esc(action.label)}</button>` : ''
  }<button data-act="notice-close" title="Dismiss">✕</button>`;
  n.hidden = false;
  if (!sticky) noticeTimer = setTimeout(hideNotice, 20000);
}
function hideNotice() {
  clearTimeout(noticeTimer);
  $('#notice').hidden = true;
}

// The agent folder is synced in the background (offscreen/offscreen.js + features/agent-host.js),
// so it keeps working with the sidebar closed. The sidebar only connects/reconnects it and shows
// a notice (with Undo) when a command is applied.
const AGENT_FLAG = 'agentFolder';
async function agentSyncHost() {
  if (agent.status === 'none') await chrome.storage.local.remove(AGENT_FLAG);
  else await chrome.storage.local.set({ [AGENT_FLAG]: { name: agent.name } });
  await chrome.runtime.sendMessage({ target: 'sw', type: 'agent-refresh' }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'agent-applied' || !msg.result) return;
  const r = msg.result;
  if (r.status === 'ok') showNotice(`<b>Agent:</b> ${esc(r.summary)}`, { action: r.undoId ? { act: 'agent-undo', cmd: r.undoId, label: 'Undo' } : null });
  else showNotice(`<b>Agent command failed:</b> ${esc(r.error)}`, { error: true });
});

// ---------------------------------------------------------------- backup
let pendingImport = null;
function backupStatus(msg, err = false) {
  const el = $('#backup-status');
  el.textContent = msg;
  el.classList.toggle('err', err);
}

async function doExport() {
  const data = await B.exportData();
  const json = JSON.stringify(data, null, 2);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `snark-backup-${stamp}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  let copied = false;
  try { await navigator.clipboard.writeText(json); copied = true; } catch {}
  backupStatus(`Exported ${B.summarize(data)}. Saved to Downloads${copied ? ' and copied to the clipboard' : ''}.`);
}

function stageImport(text) {
  try {
    pendingImport = B.parseBackup(text);
  } catch (e) {
    pendingImport = null;
    backupStatus(e.message, true);
    return;
  }
  const box = $('#import-confirm');
  box.hidden = false;
  box.innerHTML = `<span>This backup has ${esc(B.summarize(pendingImport))} (from v${esc(pendingImport.version)}). Importing <b>replaces</b> what’s in Snark now.</span>
    <span><button class="primary" data-act="import-confirm">Replace with backup</button> <button data-act="import-cancel">Cancel</button></span>`;
  backupStatus('');
}

function resetImport() {
  pendingImport = null;
  $('#import-confirm').hidden = true;
  $('#import-text').hidden = true;
  $('#import-text').value = '';
  $('#import-input').value = '';
}

async function doImport() {
  if (!pendingImport) return;
  const summary = B.summarize(pendingImport);
  await B.importData(pendingImport);
  resetImport();
  current = null;
  lastCfg = '';
  backupStatus(`Imported ${summary}.`);
  render();
}

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) stageImport(await file.text());
});
$('#import-text').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  if (v.startsWith('{') && v.endsWith('}')) stageImport(v);
});

// ---------------------------------------------------------------- inline rename
/** The row element may have been re-rendered since a menu opened; grab the live one. */
function freshRow(row) {
  if (!row || row.isConnected) return row;
  const { kind, id } = row.dataset;
  return document.querySelector(`.row[data-kind="${kind}"][data-id="${CSS.escape(id)}"]`);
}

function startRename(row, value, commit, { selector = '.title', allowEmpty = false } = {}) {
  row = freshRow(row);
  const target = row?.querySelector(selector);
  if (!target) return;
  editing = true;
  row.draggable = false;
  row.classList.add('editing'); // keeps the URL line visible while editing it
  const input = Object.assign(document.createElement('input'), { className: 'rename', value });
  target.replaceChildren(input);
  input.focus();
  input.select();
  for (const ev of ['click', 'dblclick', 'mousedown', 'contextmenu']) input.addEventListener(ev, (e) => e.stopPropagation());
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    editing = false;
    const v = input.value.trim();
    if (save && (v || allowEmpty) && v !== value) await commit(v);
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function renameNewNode(id) {
  await render();
  const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  const n = T.byId(state.tree, id);
  if (row && n) startRename(row, n.title, (v) => T.updateNode(id, { title: v }));
}

async function createSpace() {
  const id = await T.newFolder(null, 'New space');
  await render();
  current = id;
  await saveActiveSpace(id);
  editing = false;
  renderPages();
  markBar();
  renameRow(document.querySelector(`.page-head[data-id="${CSS.escape(id)}"]`));
}

function renameRow(row) {
  row = freshRow(row);
  if (!row) return;
  const { kind, id } = row.dataset;
  if (kind === 'pin' || kind === 'folder') {
    const n = T.byId(state.tree, id);
    startRename(row, n.title, (v) => T.updateNode(id, { title: v }));
  } else if (kind === 'space') {
    const s = state.spaceMap.get(id);
    startRename(row, s.title, async (v) => {
      if (s.root) await T.renameSpace(s.root.id, v, windowId);
      else await chrome.tabGroups.update(s.group.id, { title: v });
    });
  }
}

// ---------------------------------------------------------------- context menus
function menuFor(row) {
  const { kind, id } = row.dataset;

  if (kind === 'pin') {
    const p = T.byId(state.tree, id);
    const tab = state.tabsById.get(state.links[id]);
    const open = !!tab;
    const drifted = open && tab.url !== p.url;
    return [
      ...openCopyItems(p.url, tab),
      '-',
      { label: 'Rename…', run: () => renameRow(row) },
      { label: 'Replace pinned URL with current page', disabled: !drifted, run: () => T.setPinUrlToCurrent(id) },
      { label: 'Edit pinned URL…', run: () => startRename(row, p.url, (v) => T.updateNode(id, { url: normalizeUrl(v) }), { selector: '.sub' }) },
      { label: 'Go back to pinned URL', disabled: !drifted, run: () => T.resetPin(id) },
      { label: 'Add to Favorites', run: () => F.addFav({ url: p.url, title: p.title }) },
      ...moveToSpaceItems((key) => async () => T.moveTo(id, await rootIdFor(key), null, opts()), id),
      '-',
      { label: 'Archive', run: () => archiveItem(id) },
      { label: 'Close tab (keep pinned)', disabled: !open, run: () => T.closePin(id) },
      open
        ? { label: 'Unpin (keep tab open)', run: () => T.unpin(id) }
        : { label: 'Delete pin', danger: true, run: () => T.unpin(id) },
    ];
  }

  if (kind === 'folder') {
    return [
      { label: 'Open all', run: () => T.openFolder(id, opts()) },
      { label: 'Close all', run: () => T.closeFolder(id) },
      '-',
      { label: 'New folder inside', run: async () => { ui.collapsed.delete(id); saveUi(); renameNewNode(await T.newFolder(id)); } },
      { label: 'Rename…', run: () => renameRow(row) },
      ...moveToSpaceItems((key) => async () => T.moveTo(id, await rootIdFor(key), null, opts()), id),
      '-',
      { label: 'Archive folder', run: () => archiveItem(id) },
      { label: 'Delete folder (keeps its contents)', danger: true, run: () => T.deleteFolder(id) },
    ];
  }

  if (kind === 'space' || kind === 'space-empty') {
    const s = state.spaceMap.get(id);
    const head = document.querySelector(`.page-head[data-id="${CSS.escape(id)}"]`);
    const n = s.root ? T.pinsUnder(state.tree, s.root.id).length : 0;
    const roots = T.childrenOf(state.tree, null).filter((x) => x.type === 'folder');
    const ri = s.root ? roots.findIndex((r) => r.id === s.root.id) : -1;
    return [
      ...(s.root ? [
        { label: 'Open all pinned', run: () => T.openFolder(s.root.id, opts()) },
        { label: 'Close all pinned', run: () => T.closeFolder(s.root.id) },
        '-',
      ] : []),
      { label: 'New folder', run: async () => renameNewNode(await T.newFolder(await rootIdFor(id))) },
      { label: 'Rename…', run: () => renameRow(head) },
      {
        label: 'Icon (emoji)…',
        run: () => {
          const r = freshRow(head);
          if (!r) return;
          r.querySelector('.sicon').textContent = ' ';
          startRename(r, s.root?.icon ?? '', async (v) => T.updateNode(await rootIdFor(id), { icon: [...v].slice(0, 2).join('') }), { selector: '.sicon', allowEmpty: true });
        },
      },
      { header: 'Theme' },
      {
        swatches: Object.entries(THEMES).map(([k, t]) => ({ value: k, title: t.name, css: `linear-gradient(160deg, ${t.light[0]}, ${t.light[1]})` })),
        current: themeKeyFor(s),
        run: async (k) => T.updateNode(await rootIdFor(id), { theme: k }),
      },
      { header: 'Tab group color' },
      {
        swatches: Object.entries(COLORS).map(([k, hex]) => ({ value: k, title: k, css: hex })),
        current: s.color,
        run: async (c) => {
          if (s.root) await T.setSpaceColor(s.root.id, c, windowId);
          else await chrome.tabGroups.update(s.group.id, { color: c });
        },
      },
      ...(s.root ? [
        '-',
        { label: 'Move space left', disabled: ri <= 0, run: () => T.moveTo(s.root.id, null, roots[ri - 1].id, opts()) },
        { label: 'Move space right', disabled: ri < 0 || ri >= roots.length - 1, run: () => T.moveTo(s.root.id, null, roots[ri + 2]?.id ?? null, opts()) },
        '-',
        {
          label: 'Remove space…', danger: true,
          confirm: `Remove “${s.title}” and its ${n} pin${n === 1 ? '' : 's'}? Click again`,
          run: () => T.deleteFolder(s.root.id),
        },
      ] : []),
    ];
  }

  if (kind === 'tab') {
    const t = state.tabsById.get(+id);
    const here = state.spaceMap.get(current);
    const own = state.spaces.find((s) => s.group && s.group.id === t.groupId);
    const pinTarget = own ?? here;
    return [
      ...openCopyItems(t.url, t),
      '-',
      pinTarget
        ? { label: `Pin to ${pinTarget.title || 'this space'}`, run: async () => T.pinTabAt(t, await rootIdFor(pinTarget.key), null, opts()) }
        : { label: 'Pin to a new space', run: async () => T.pinTabAt(t, await T.ensureRoot('Pinned'), null, opts()) },
      ...state.spaces
        .filter((s) => s !== own)
        .map((s) => ({ label: `Move to ${s.title || 'Unnamed group'}`, run: () => joinSpace(t.id, s.key) })),
      { label: 'Add to Favorites', run: () => F.addTabAsFav(t) },
      '-',
      { label: 'Remove from space', disabled: t.groupId === -1, run: () => chrome.tabs.ungroup(t.id) },
      { label: 'Close tab', run: () => chrome.tabs.remove(t.id) },
    ];
  }

  if (kind === 'fav') {
    const f = state.favs.find((x) => x.id === id);
    const t = state.favTabs.get(id);
    return [
      ...openCopyItems(f.url, t),
      '-',
      { label: 'Replace favorite URL with current page', disabled: !t || t.url === f.url, run: () => F.updateFav(id, { url: t.url, title: t.title || f.title }) },
      '-',
      { label: 'Close tab (keep favorite)', disabled: !t, run: () => chrome.tabs.remove(t.id) },
      { label: 'Remove from Favorites', danger: true, run: async () => { await F.removeFav(id); if (t) await chrome.tabs.update(t.id, { pinned: false }); } },
    ];
  }

  if (kind === 'ptab') {
    const t = state.tabsById.get(+id);
    return [
      { label: 'Add to Favorites', run: () => F.addTabAsFav(t) },
      { label: 'Unpin from Chrome', run: () => chrome.tabs.update(t.id, { pinned: false }) },
      { label: 'Close tab', run: () => chrome.tabs.remove(t.id) },
    ];
  }

  if (kind === 'apin' || kind === 'afolder') {
    const n = T.byId(state.tree, id);
    return [
      { label: 'Restore (put back where it was)', run: () => restoreArchived(id) },
      ...(kind === 'apin' ? [{ label: 'Open (stays archived)', run: () => chrome.tabs.create({ windowId, url: n.url }) }] : []),
      '-',
      { label: 'Delete now', danger: true, confirm: 'Delete permanently? Click again', run: () => T.mutate((t) => T.removeNode(t, id)) },
    ];
  }

  if (kind === 'archived') {
    const i = +row.dataset.idx;
    return [
      { label: 'Restore', run: () => restore(i, windowId) },
      { label: 'Remove from list', run: () => forget(i) },
    ];
  }
  return [];
}

// ---- "open a copy" actions shared by pins, tabs and favorites.
// If the item's tab is open, the copy is of the page you're on; otherwise of the saved URL.
const canSplit = typeof chrome.tabs.createSplit === 'function'; // Chrome 155+

function openCopyItems(savedUrl, tab) {
  const url = tab?.url || savedUrl;
  return [
    { label: 'Duplicate', run: () => (tab ? chrome.tabs.duplicate(tab.id) : chrome.tabs.create({ windowId, url })) },
    {
      label: canSplit ? 'Open in Split' : 'Open in Split (needs Chrome 155+)',
      disabled: !canSplit,
      run: () => openInSplit(url),
    },
    { label: 'Open in Window', run: () => chrome.windows.create({ url, focused: true }) },
  ];
}

/** Open a copy side by side with the tab you're looking at, using Chrome's split view. */
async function openInSplit(url) {
  let [active] = await chrome.tabs.query({ active: true, windowId });
  try {
    if (active && active.splitViewId > -1) {
      await chrome.tabs.unsplit(active.splitViewId); // replace an existing split rather than fail
      active = await chrome.tabs.get(active.id);
    }
    await chrome.tabs.create({ url, splitWithTabId: active.id });
  } catch (e) {
    console.warn('split failed, opening next to the current tab instead', e);
    await chrome.tabs.create({ windowId, url, index: active ? active.index + 1 : undefined });
  }
}

function moveToSpaceItems(makeRun, nodeId) {
  const own = nodeId ? T.rootOf(state.tree, nodeId)?.id : current;
  const others = state.spaces.filter((s) => s.key !== own);
  if (!others.length) return [];
  return ['-', ...others.map((s) => ({ label: `Move to ${s.title || 'Unnamed group'}`, run: makeRun(s.key) }))];
}

function closeMenu() { $('#menu')?.remove(); }

function showMenu(items, x, y) {
  closeMenu();
  if (!items.length) return;
  const m = Object.assign(document.createElement('div'), { id: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(document.createElement('hr')); continue; }
    if (it.header) { m.append(Object.assign(document.createElement('div'), { className: 'label', textContent: it.header })); continue; }
    if (it.swatches) {
      const row = Object.assign(document.createElement('div'), { className: 'swatches' });
      for (const sw of it.swatches) {
        const b = Object.assign(document.createElement('button'), { className: 'swatch' + (sw.value === it.current ? ' on' : ''), title: sw.title });
        b.style.background = sw.css;
        b.addEventListener('click', async (e) => { e.stopPropagation(); closeMenu(); await it.run(sw.value); });
        row.append(b);
      }
      m.append(row);
      continue;
    }
    const b = Object.assign(document.createElement('button'), {
      className: 'item' + (it.danger ? ' danger' : ''), textContent: it.label, disabled: !!it.disabled,
    });
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (it.confirm && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = it.confirm; return; }
      closeMenu();
      await it.run();
    });
    m.append(b);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  m.style.top = `${y + r.height > innerHeight - 4 ? Math.max(4, y - r.height) : y}px`;
}

// ---------------------------------------------------------------- clicks
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#menu')) closeMenu();
  const act0 = e.target.closest('[data-act]')?.dataset.act;
  if (e.target.closest('#settings-body')) return;
  const actEl = e.target.closest('[data-act]');
  const row = e.target.closest('[data-kind]');


  if (actEl) {
    e.stopPropagation();
    switch (actEl.dataset.act) {
      case 'search': openSearch(); return;
      case 'gear': setView(ui.view === 'settings' ? 'spaces' : 'settings'); return;
      case 'view-archive': setView(ui.view === 'archive' ? 'spaces' : 'archive'); return;
      case 'shortcuts': chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); return;
      case 'export': await doExport(); return;
      case 'agent-choose': await agentChoose(); return;
      case 'agent-reconnect': await agentReconnect(); return;
      case 'agent-disconnect': await AF.disconnectAgentDir(); agent = { status: 'none' }; renderAgentUi(); agentSyncHost(); return;
      case 'agent-undo': await agentUndoClick(actEl.dataset.cmd); return;
      case 'agent-undo-force': await agentUndoClick(actEl.dataset.cmd, true); return;
      case 'notice-close': hideNotice(); return;
      case 'arch-restore-last': hideNotice(); await restoreArchived(actEl.dataset.cmd); return;
      case 'import-file': $('#import-input').click(); return;
      case 'import-paste': {
        const ta = $('#import-text');
        ta.hidden = !ta.hidden;
        if (!ta.hidden) ta.focus();
        return;
      }
      case 'import-confirm': await doImport(); return;
      case 'import-cancel': resetImport(); return;
      case 'menu': { const r = actEl.getBoundingClientRect(); showMenu(menuFor(row), r.left, r.bottom + 2); return; }
      case 'close-pin': await T.closePin(row.dataset.id); return;
      case 'close-tab': await chrome.tabs.remove(+row.dataset.id); return;
      case 'goto': {
        const wasElsewhere = ui.view !== 'spaces';
        setView('spaces');
        if (wasElsewhere && actEl.dataset.space === current) enterSpace(current);
        else goToSpace(actEl.dataset.space, 'user');
        return;
      }
      case 'arch-restore': await restoreArchived(row.dataset.id); return;
      case 'arch-after': await setFeature('autoClear', { archiveAfter: actEl.dataset.v }); return;
      case 'arch-clear': {
        if (!actEl.dataset.armed) { actEl.dataset.armed = '1'; actEl.textContent = 'Delete everything here?'; actEl.classList.add('danger'); return; }
        await T.mutate((t) => T.removeNode(t, ARCH));
        await clearArchive();
        showNotice('Archive emptied.');
        return;
      }
      case 'new-space': await createSpace(); return;
      case 'new-tab': {
        const tab = await chrome.tabs.create({ windowId });
        if (actEl.dataset.space) await joinSpace(tab.id, actEl.dataset.space).catch(() => {});
        return;
      }
      case 'clear': {
        const s = state.spaceMap.get(actEl.dataset.space);
        await archiveAndClose(spaceTabs(s).filter((t) => !t.active));
        return;
      }
      case 'pin-current': {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        if (!tab?.url) return;
        if (tab.groupId === -1 && current) await T.pinTabAt(tab, await rootIdFor(current), null, opts());
        else await T.pinTab(tab, opts());
        return;
      }
      case 'forget': await forget(+row.dataset.idx); return;
      case 'forget-all': await clearArchive(); return;
    }
  }
  if (!row || editing) return;

  const { kind, id } = row.dataset;
  switch (kind) {
    case 'pin': await T.openPin(id, opts()); break;
    case 'folder': toggleCollapsed(id); break;
    case 'fav': {
      const f = state.favs.find((x) => x.id === id);
      if (f) await F.openFav(f, windowId);
      break;
    }
    case 'tab':
    case 'ptab': {
      const t = state.tabsById.get(+id);
      if (!t) break;
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
      break;
    }
    case 'archived': await restore(+row.dataset.idx, windowId); break;
    case 'apin': {
      const n = T.byId(state.tree, id);
      if (n) await chrome.tabs.create({ windowId, url: n.url }); // opens as a normal tab; stays archived
      break;
    }
    case 'afolder': toggleCollapsed(`open:${id}`); break;
  }
});

document.addEventListener('dblclick', (e) => {
  const title = e.target.closest('.row .title');
  const row = title?.closest('[data-kind]');
  if (row) renameRow(row);
});

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-kind]');
  if (!row || e.target.closest('input')) return;
  const items = menuFor(row);
  if (!items.length) return;
  e.preventDefault();
  showMenu(items, e.clientX, e.clientY);
});

// If a remembered/remote icon fails to load, fall back to Chrome's own favicon cache.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || !img.dataset.page || img.dataset.fallback) return;
  img.dataset.fallback = '1';
  img.src = FI.chromeFavicon(img.dataset.page);
}, true);

document.addEventListener('keydown', (e) => {
  // ⌘K / Ctrl+K anywhere in the sidebar toggles search; "/" opens it when you're not typing somewhere.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!editing) openSearch();
    return;
  }
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !editing && !e.target.closest?.('input, textarea, select')) {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === 'Escape') {
    if ($('#menu')) closeMenu();
    else if (!editing) setView('spaces');
  }
});
window.addEventListener('blur', closeMenu);

// ---------------------------------------------------------------- drag & drop
function clearIndicators() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into'));
}

/** Work out where a drop at this pointer position would land. */
function dropTarget(e) {
  const src = dragSrc;
  const tree = state.tree;
  if (src.kind === 'archived' || src.kind === 'ptab') return null;

  const toArchive = e.target.closest('[data-drop="archive"], [data-zone="archive"]');
  if (toArchive) {
    if (!['pin', 'folder', 'tab'].includes(src.kind)) return null;
    if (src.archived && toArchive.dataset.zone === 'archive') return null; // already here
    return { el: toArchive, pos: 'into', zone: 'archive' };
  }

  const favRow = e.target.closest('#favorites');
  if (favRow) {
    if (!['fav', 'pin', 'tab'].includes(src.kind)) return null;
    const over = e.target.closest('.fav[data-kind="fav"]');
    if (over && over.dataset.id !== src.id) return { el: over, pos: 'before', zone: 'fav', before: over.dataset.id };
    return { el: favRow, pos: 'into', zone: 'fav', before: null };
  }
  if (src.kind === 'fav') return null; // favorites only reorder within their row

  const bar = e.target.closest('[data-drop="bar"]');
  if (bar) return { el: bar, pos: 'into', zone: 'bar', spaceKey: bar.dataset.space };

  const zone = e.target.closest('[data-zone]');
  const row = e.target.closest('.row[data-kind]');

  if (row && !row.closest('[data-zone]')) {
    const { kind, id } = row.dataset;
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if ((kind === 'pin' || kind === 'folder') && src.kind === 'folder' && T.isWithin(tree, id, src.id)) return null;

    if (kind === 'pin') {
      if (id === src.id) return null;
      const n = T.byId(tree, id);
      return y < 0.5
        ? { el: row, pos: 'before', parent: n.parent, before: id }
        : { el: row, pos: 'after', parent: n.parent, before: T.nextSiblingId(tree, id) };
    }
    if (kind === 'folder') {
      const n = T.byId(tree, id);
      if (y < 0.25) return { el: row, pos: 'before', parent: n.parent, before: id };
      if (y > 0.75 && ui.collapsed.has(id)) return { el: row, pos: 'after', parent: n.parent, before: T.nextSiblingId(tree, id) };
      return { el: row, pos: 'into', parent: id, before: null };
    }
    if (kind === 'space' || kind === 'space-empty') return { el: row, pos: 'into', spaceKey: id };
    return null;
  }

  if (zone && src.archived) return null; // use Restore, or drop it into a space's tree
  if (zone && (src.kind === 'pin' || src.kind === 'tab')) {
    if (zone.dataset.zone === 'today') return { el: zone, pos: 'into', zone: 'today', spaceKey: zone.dataset.space };
    if (zone.dataset.zone === 'loose') return { el: zone, pos: 'into', zone: 'loose' };
  }
  return null;
}

async function performDrop(src, tgt) {
  if (tgt.zone === 'archive') {
    if (src.kind === 'tab') {
      const tab = state.tabsById.get(+src.id);
      if (tab) await archiveAndClose([tab]);
    } else {
      await archiveItem(src.id);
    }
    return;
  }
  if (src.archived) {
    // Dragged out of the Archive into a space: move it there and drop its archive bookkeeping.
    const parent = tgt.spaceKey ? await rootIdFor(tgt.spaceKey) : tgt.parent;
    if (tgt.zone === 'fav') return F.addFav({ url: T.byId(state.tree, src.id)?.url, title: T.byId(state.tree, src.id)?.title }, tgt.before);
    if (parent == null) return;
    await T.moveTo(src.id, parent, tgt.spaceKey ? null : tgt.before, opts());
    await T.clearArchiveMarks(src.id);
    return;
  }
  if (tgt.zone === 'fav') {
    if (src.kind === 'fav') return F.moveFav(src.id, tgt.before);
    if (src.kind === 'tab') {
      const tab = state.tabsById.get(+src.id);
      if (tab) await F.addTabAsFav(tab, tgt.before);
      return;
    }
    if (src.kind === 'pin') {
      // Move: the pin becomes a favorite; its open tab (if any) becomes the favorite's tab.
      const p = T.byId(state.tree, src.id);
      const tab = await T.unpin(src.id);
      if (tab) await F.addTabAsFav({ ...tab, url: p.url, title: p.title }, tgt.before);
      else await F.addFav({ url: p.url, title: p.title }, tgt.before);
    }
    return;
  }
  if (tgt.zone === 'loose') {
    if (src.kind === 'pin') await T.unpin(src.id, { ungroup: true });
    else if (src.kind === 'tab') await chrome.tabs.ungroup(+src.id).catch(() => {});
    return;
  }
  if (tgt.zone === 'today') {
    // Into this space's Today: unpin (tab stays in the group), or bring a tab into the space.
    const tabId = src.kind === 'pin' ? (await T.unpin(src.id))?.id : +src.id;
    if (tabId) await joinSpace(tabId, tgt.spaceKey);
    return;
  }
  if (tgt.zone === 'bar') {
    if (src.kind === 'tab') await joinSpace(+src.id, tgt.spaceKey);
    else await T.moveTo(src.id, await rootIdFor(tgt.spaceKey), null, opts());
    return;
  }
  const parent = tgt.spaceKey ? await rootIdFor(tgt.spaceKey) : tgt.parent;
  const before = tgt.spaceKey ? null : tgt.before;
  if (src.kind === 'tab') {
    const tab = state.tabsById.get(+src.id);
    if (tab) await T.pinTabAt(tab, parent, before, opts());
  } else {
    await T.moveTo(src.id, parent, before, opts());
  }
}

let hoverTimer = null;
let hoverKey = null;
function hoverSwitch(key) {
  if (key === hoverKey) return;
  clearTimeout(hoverTimer);
  hoverKey = key;
  if (!key) return;
  if (key === ARCH) { if (ui.view !== 'archive') hoverTimer = setTimeout(() => setView('archive'), 550); return; }
  if (key !== current || ui.view !== 'spaces') hoverTimer = setTimeout(() => { setView('spaces'); goToSpace(key, 'drag'); }, 550);
}

document.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('[draggable="true"][data-kind]');
  if (!row || editing) return;
  closeMenu();
  const k0 = row.dataset.kind;
  dragSrc = k0 === 'apin' || k0 === 'afolder'
    ? { kind: k0 === 'apin' ? 'pin' : 'folder', id: row.dataset.id, archived: true }
    : { kind: k0, id: row.dataset.id };
  document.body.classList.add('dragging-any');
  e.dataTransfer.effectAllowed = 'move';
  const k = dragSrc.kind;
  const url = k === 'pin' ? T.byId(state.tree, row.dataset.id)?.url
    : k === 'fav' ? state.favs.find((f) => f.id === row.dataset.id)?.url
    : state.tabsById.get(+row.dataset.id)?.url;
  if (url) e.dataTransfer.setData('text/uri-list', url);
  requestAnimationFrame(() => row.classList.add('dragging'));
});

document.addEventListener('dragover', (e) => {
  if (!dragSrc) return;
  const tgt = dropTarget(e);
  clearIndicators();
  hoverSwitch(tgt?.zone === 'bar' ? tgt.spaceKey : tgt?.zone === 'archive' && tgt.el.closest('#bar') ? ARCH : null);
  if (!tgt) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  tgt.el.classList.add(`drop-${tgt.pos}`);
});

document.addEventListener('drop', async (e) => {
  if (!dragSrc) return;
  e.preventDefault();
  const tgt = dropTarget(e);
  const src = dragSrc;
  dragSrc = null;
  document.body.classList.remove('dragging-any');
  hoverSwitch(null);
  clearIndicators();
  if (tgt) {
    try { await performDrop(src, tgt); } catch (err) { console.warn('drop failed', err); }
  }
  render();
});

document.addEventListener('dragend', () => {
  dragSrc = null;
  document.body.classList.remove('dragging-any');
  hoverSwitch(null);
  clearIndicators();
  render();
});

// ---------------------------------------------------------------- live updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' || (area === 'local' && (changes.tree || changes.archive || changes.favorites || changes.favicons)) || (area === 'session' && (changes.pinLinks || changes.favLinks))) scheduleRender();
});
for (const ev of ['onUpdated', 'onRemoved', 'onCreated', 'onMoved', 'onAttached', 'onDetached']) {
  chrome.tabs[ev].addListener(scheduleRender);
}
for (const ev of ['onCreated', 'onUpdated', 'onRemoved', 'onMoved']) chrome.tabGroups[ev].addListener(scheduleRender);
window.addEventListener('resize', () => {
  if (!state) return; // panel can resize before the first load finishes
  const idx = Math.max(0, spaceIndex(current));
  pagesEl.scrollTo({ left: idx * pagesEl.clientWidth, behavior: 'instant' });
});

$('#version').textContent = `v${chrome.runtime.getManifest().version}`;

// Tell the background this window's sidebar is open, so ⌘B / Ctrl+B can close it.
function connectPanel() {
  const port = chrome.runtime.connect({ name: 'snark-panel' });
  port.postMessage({ type: 'hello', windowId });
  // So the Search Snark shortcut knows whether you pressed it here or on the page.
  const tellFocus = (e) => { try { port.postMessage({ type: 'focus', focused: e ? e.type === 'focus' : document.hasFocus() }); } catch {} };
  tellFocus(null);
  window.addEventListener('focus', tellFocus);
  window.addEventListener('blur', tellFocus);
  port.onDisconnect.addListener(() => { window.removeEventListener('focus', tellFocus); window.removeEventListener('blur', tellFocus); });
  const ping = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch {} }, 20000);
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'close') window.close();
    if (msg?.type === 'reveal' && msg.entry) showEntry(msg.entry, { open: msg.open }).catch((e) => console.warn('reveal failed', e));
  });
  port.onDisconnect.addListener(() => { clearInterval(ping); setTimeout(connectPanel, 200); }); // worker restarted
}
chrome.windows.getCurrent().then(async (w) => {
  windowId = w.id;
  connectPanel();
  await F.seedFavorites();
  await render();
  markReady();
  agent = await AF.getAgentDir().catch(() => ({ status: 'none' }));
  if (agent.status === 'ok') await AF.scaffold(agent.handle).catch((e) => console.warn('agent folder scaffold', e)); // refresh guide/schema after updates
  renderAgentUi();
  agentSyncHost(); // also upgrades installs from before the background host existed
});
