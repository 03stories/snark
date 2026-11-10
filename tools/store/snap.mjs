// Runs Snark's real sidebar (or search page) against the demo data in jsdom and saves the
// resulting markup, which compose.mjs places into the store graphics.
//
//   JSDOM=/path/to/jsdom node tools/store/snap.mjs <scenario>     (one scenario per process)
// Scenarios: work home side drift found agent search

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './demo.mjs';
import { monogram } from './icons.mjs';

const { JSDOM } = await import(process.env.JSDOM ?? 'jsdom');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '../..');
const OUT = path.join(EXT, 'store/src/snaps');
const scenario = process.argv[2] ?? 'work';
const isSearch = scenario === 'search';

// ---------------------------------------------------------------- page + chrome.* mock
const page = isSearch ? 'search/search.html' : 'sidepanel/sidepanel.html';
const html = fs.readFileSync(path.join(EXT, page), 'utf8').replace(/<script.*<\/script>/s, '');
const dom = new JSDOM(html, { url: `http://localhost/${page}?t=DEMO`, pretendToBeVisual: true });
const w = dom.window;
for (const k of ['document', 'localStorage', 'HTMLElement', 'Node', 'innerWidth', 'innerHeight', 'requestAnimationFrame', 'cancelAnimationFrame', 'location']) globalThis[k] = w[k];
globalThis.window = w;
globalThis.parent = w;
globalThis.addEventListener = w.addEventListener.bind(w);
globalThis.CSS = { escape: (s) => String(s).replace(/"/g, '\\"') };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'MacIntel', clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
w.Element.prototype.scrollTo = function (o) { this.scrollLeft = o.left ?? this.scrollLeft; this.dispatchEvent(new w.Event('scroll')); setTimeout(() => this.dispatchEvent(new w.Event('scrollend')), 5); };
w.Element.prototype.scrollIntoView = function () {};
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return this.id === 'pages' ? 340 : 0; } });
w.close = () => {};
w.focus = () => {};

const ev = () => { const ls = []; return { addListener: (f) => ls.push(f), fire: (...a) => ls.forEach((f) => f(...a)) }; };
const storage = { onChanged: ev() };
const area = (name) => { let d = {}; return {
  get: async (k) => { const ks = k == null ? Object.keys(d) : [].concat(k); return Object.fromEntries(ks.filter((x) => x in d).map((x) => [x, structuredClone(d[x])])); },
  set: async (o) => { const ch = {}; for (const [k, v] of Object.entries(o)) { ch[k] = { newValue: v }; d[k] = structuredClone(v); } storage.onChanged.fire(ch, name); },
  remove: async (k) => { for (const x of [].concat(k)) delete d[x]; } }; };
storage.local = area('local'); storage.session = area('session'); storage.sync = area('sync');

let tabs = structuredClone(D.tabs);
let groups = structuredClone(D.groups);
let tree = structuredClone(D.tree);
let links = { ...D.links };
let collapsed = ['ds', 'team'];
let nextTab = 200;
const tabsEv = { onUpdated: ev(), onActivated: ev(), onRemoved: ev(), onCreated: ev(), onMoved: ev(), onAttached: ev(), onDetached: ev() };
let port = null;
const activate = (id) => tabs.forEach((t) => (t.active = t.id === id));
const showGroup = (gid) => groups.forEach((g) => (g.collapsed = g.id !== gid));

globalThis.chrome = {
  storage,
  runtime: {
    id: 'demo', getURL: (p) => `chrome-extension://demo/${p.replace(/^\//, '')}`, getManifest: () => ({ version: '1.4.1' }), onMessage: ev(),
    sendMessage: async (m) => (m?.type === 'search-hello' ? { ok: true, windowId: D.WIN, mode: 'frame' } : { ok: true }),
    connect: () => (port = { postMessage() {}, onMessage: ev(), onDisconnect: ev() }),
  },
  sidePanel: { open: async () => {} },
  windows: { getCurrent: async () => ({ id: D.WIN }), update: async () => {}, create: async () => ({}), get: async () => ({ id: D.WIN }) },
  tabs: {
    query: async (q = {}) => tabs.filter((t) => (q.groupId == null || t.groupId === q.groupId) && (q.active == null || t.active === q.active) && (q.pinned == null || t.pinned === q.pinned) && (q.windowId == null || t.windowId === q.windowId)).map((t) => ({ ...t, index: tabs.indexOf(t) })),
    get: async (id) => ({ ...tabs.find((t) => t.id === id) }),
    create: async ({ url, windowId = D.WIN, pinned = false }) => { const t = { id: nextTab++, windowId, url, title: url, pinned, active: false, groupId: -1 }; tabs.push(t); return { ...t }; },
    update: async (id, p) => { const t = tabs.find((x) => x.id === id); if (p.active) activate(id); Object.assign(t, p); return { ...t }; },
    createSplit: async () => {}, remove: async () => {}, group: async ({ groupId }) => groupId ?? 100, ungroup: async () => {}, move: async () => {}, duplicate: async () => ({}),
    ...tabsEv,
  },
  tabGroups: {
    query: async (q = {}) => groups.filter((g) => (q.title == null || g.title === q.title) && (q.windowId == null || g.windowId === q.windowId)).map((g) => ({ ...g })),
    get: async (id) => ({ ...groups.find((g) => g.id === id) }),
    update: async (id, p) => Object.assign(groups.find((g) => g.id === id), p),
    onCreated: ev(), onUpdated: ev(), onRemoved: ev(), onMoved: ev(),
  },
};

// ---------------------------------------------------------------- scenario setup
const LEARNING = [
  ['Design systems, explained', 'wiki.fernhill.dev', 'ds-explained'],
  ['Token naming guide', 'docs.lumen.so', 'token-naming'],
  ['Accessible color palettes', 'read.longform.club', 'a11y-color'],
  ['Component API checklist', 'wiki.fernhill.dev', 'api-checklist'],
  ['Spacing scales that work', 'news.tidyweb.dev', 'spacing'],
  ['Docs people actually read', 'read.longform.club', 'docs'],
];

switch (scenario) {
  case 'home': activate(20); showGroup(101); break;
  case 'side': activate(30); showGroup(102); break;
  case 'drift': {
    const t = tabs.find((x) => x.id === 11);
    Object.assign(t, { url: 'https://news.tidyweb.dev/competitor-pricing', title: 'Competitor pricing, compared' });
    activate(11);
    break;
  }
  case 'found': {
    tabs.push({ id: 15, windowId: D.WIN, groupId: 100, title: 'Launch checklist', url: 'https://docs.lumen.so/launch-checklist', pinned: false, active: false });
    links.launchchk = 15;
    activate(15);
    break;
  }
  case 'agent': {
    const i = tree.findIndex((n) => n.id === 'ds');
    tree.splice(i, 0, { id: 'learning', type: 'folder', parent: 'work', title: 'Learning' },
      ...LEARNING.map(([title, host, p], k) => ({ id: `l${k}`, type: 'pin', parent: 'learning', title, url: `https://${host}/${p}` })));
    collapsed = ['q4', 'ds', 'team'];
    break;
  }
}

await storage.local.set({ tree, favorites: D.favorites, archive: D.closed, recentPicks: ['pin:sprint', 'space:home'] });
await storage.session.set({ pinLinks: links, favLinks: D.favLinks, activeSpace: { [D.WIN]: 'work' } });
localStorage.setItem('ui', JSON.stringify({ collapsed }));

await import(path.join(EXT, isSearch ? 'search/search.js' : 'sidepanel/sidepanel.js'));
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
await wait(400);

// ---------------------------------------------------------------- scenario actions
if (scenario === 'drift') {
  const row = $('.page[data-space="work"] .row.pin[data-id="pricing"]');
  row.classList.add('force-sub');
  row.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, clientX: 0, clientY: 0 }));
  await wait(50);
  // A graphic needs the interesting half of the menu, not every "Move to…".
  const items = [...document.querySelectorAll('#menu > *')];
  const cut = items.findIndex((el) => el.textContent === 'Add to Favorites');
  items.slice(cut).forEach((el) => el.remove());
  document.querySelector('#menu > hr:last-child')?.remove();
}
if (scenario === 'found') {
  port.onMessage.fire({ type: 'reveal', entry: { kind: 'pin', id: 'launchchk' }, open: true });
  await wait(700);
}
if (scenario === 'agent') {
  port.onMessage.fire({ type: 'reveal', entry: { kind: 'folder', id: 'learning' }, open: false });
  await wait(500);
  chrome.runtime.onMessage.fire({ type: 'agent-applied', result: { status: 'ok', summary: 'Created folder “Learning”, 6 new pins', undoId: 'demo' } });
  await wait(100);
}
if (isSearch) {
  const input = $('.pal-input');
  input.value = 'launch';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.setAttribute('value', 'launch');
  await wait(50);
  // Highlight the one we're "about to open", and keep the list to what fits in the graphic.
  const want = [...document.querySelectorAll('.pal-row')].findIndex((r) => r.textContent.includes('Launch checklist'));
  for (let i = 0; i < want; i++) input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  [...document.querySelectorAll('.pal-row')].slice(5).forEach((r) => r.remove());
}

// ---------------------------------------------------------------- serialize
// A still image has no scroll position: keep only the space on screen.
const on = $('.bar-space.on')?.dataset.space;
if (on) document.querySelectorAll('#pages .page').forEach((p) => { if (p.dataset.space !== on) p.remove(); });
// Keep the glow at its brightest (the composition is a still image).
document.querySelectorAll('.found').forEach((el) => { el.classList.remove('found'); el.classList.add('found-still'); el.style.removeProperty('animation-delay'); });
// Demo monogram icons instead of Chrome's favicon cache.
document.querySelectorAll('img[data-page]').forEach((img) => { img.src = monogram(img.dataset.page); });

const out = {
  scenario,
  html: document.body.innerHTML.replace(/\s*<script[^>]*><\/script>/g, ''),
  bodyStyle: document.body.getAttribute('style') ?? '',
  mode: document.documentElement.dataset.mode ?? null,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${scenario}.json`), JSON.stringify(out));
console.log(`✓ ${scenario}: ${out.html.length} chars ${out.bodyStyle}`);
process.exit(0);
