// The search page. It shows up two ways (features/search-launcher.js decides which):
//   frame:  an iframe the launcher drops over the web page you're on, centered with the page dimmed
//   window: a small window centered over the browser window, for pages Chrome won't let
//           extensions draw on (New Tab, chrome://, the Web Store) and for ⌘K in the sidebar
// Picking a result opens it from here, then asks the sidebar to show it.

import { createPalette } from './palette.js';
import { gather } from './data.js';
import * as T from '../core/tree.js';
import * as F from '../core/favorites.js';
import * as FI from '../core/favicons.js';
import { restore } from '../core/archive.js';

const COLORS = {
  grey: '#9aa0a6', blue: '#4c8bf5', red: '#e8453c', yellow: '#f9bb2d', green: '#3cba54',
  pink: '#ff63b8', purple: '#a142f4', cyan: '#24c1e0', orange: '#fa903e',
};
const FOLDER = `<svg viewBox="0 0 16 16"><path d="M1.5 4.5a1 1 0 011-1h3.6l1.4 1.5h6a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
const ARCHIVE = `<svg viewBox="0 0 16 16"><path d="M2 3.5h12v3H2zM3 6.5v6.5h10V6.5M6.5 9h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const GEAR = `<svg viewBox="0 0 20 20"><path fill="currentColor" d="M11.3 1.5l.4 2.2c.5.2 1 .5 1.4.8l2.1-.8 1.3 2.3-1.7 1.4c.1.5.1 1.1 0 1.6l1.7 1.4-1.3 2.3-2.1-.8c-.4.3-.9.6-1.4.8l-.4 2.2H8.7l-.4-2.2c-.5-.2-1-.5-1.4-.8l-2.1.8-1.3-2.3 1.7-1.4a5 5 0 010-1.6L3.5 6l1.3-2.3 2.1.8c.4-.3.9-.6 1.4-.8l.4-2.2h2.6zM10 7a3 3 0 100 6 3 3 0 000-6z" transform="translate(0 1)"/></svg>`;
const RECENTS = 'recentPicks';
const MAX_RECENTS = 6;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function main() {
  // Only pages the launcher opened (one-time token) get to show anything.
  const token = new URLSearchParams(location.search).get('t');
  const hello = await chrome.runtime.sendMessage({ target: 'sw', type: 'search-hello', token }).catch(() => null);
  if (!hello?.ok) return;
  const { windowId, mode } = hello;
  document.documentElement.dataset.mode = mode;

  const [data, stored] = await Promise.all([gather(windowId), chrome.storage.local.get(RECENTS)]);
  let recents = stored[RECENTS] ?? [];

  const img = (url, liveTab = null) =>
    `<img src="${esc(FI.iconFor(url, data.icons, { liveTab, useGoogle: data.useGoogle }))}" data-page="${esc(url)}" alt="">`;

  function icon(e) {
    switch (e.kind) {
      case 'space': {
        if (e.icon) return `<span class="pal-emoji">${esc(e.icon)}</span>`;
        const letter = (e.title || '?').trim().charAt(0).toUpperCase() || '?';
        return `<span class="pal-initial" style="background:${COLORS[e.color] ?? COLORS.grey}">${esc(letter)}</span>`;
      }
      case 'folder': return e.archived ? ARCHIVE : FOLDER;
      case 'action': return e.id === 'settings' ? GEAR : e.id === 'archive' ? ARCHIVE : '<span class="pal-glyph">›</span>';
      case 'tab': return img(e.url, data.tabsById.get(e.id));
      case 'pin': return img(e.url, data.tabsById.get(data.links[e.id]));
      default: return img(e.url);
    }
  }

  /** Open the result from here. Folders, spaces and actions are the sidebar's job. */
  async function openEntry(e) {
    switch (e.kind) {
      case 'pin':
        if (e.archived) return chrome.tabs.create({ windowId, url: e.url }); // stays archived
        return T.openPin(e.id, { windowId, pinsAtTop: data.pinsAtTop });
      case 'fav': return F.openFav({ id: e.id, url: e.url, title: e.title }, windowId);
      case 'tab':
        await chrome.tabs.update(e.id, { active: true });
        return chrome.windows.update(windowId, { focused: true });
      case 'closed': return restore(e.id, windowId);
    }
  }

  function pick(e, { reveal }) {
    if (e.kind === 'action' && e.id === 'shortcuts') return chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    // A restored closed tab doesn't need the sidebar; everything else is shown there.
    const showInSidebar = e.kind !== 'closed' || reveal;
    // Opening the side panel has to happen during this keypress/click, before anything async.
    if (showInSidebar) chrome.sidePanel.open({ windowId }).catch(() => {});
    return (async () => {
      if (!reveal) await openEntry(e);
      if (showInSidebar) await chrome.runtime.sendMessage({ target: 'sw', type: 'search-reveal', windowId, entry: e, open: !reveal });
    })();
  }

  function dismiss() {
    if (mode === 'frame') parent.postMessage('snark-search-close', '*');
    else window.close();
  }

  const palette = createPalette(document.getElementById('palette'), {
    entries: () => data.entries,
    currentSpace: () => data.currentSpace,
    recents: () => recents,
    icon,
    pick,
    remember: (key) => {
      recents = [key, ...recents.filter((k) => k !== key)].slice(0, MAX_RECENTS);
      chrome.storage.local.set({ [RECENTS]: recents }).catch(() => {});
    },
    onClose: dismiss,
  });
  palette.open();

  // If a remembered icon fails, fall back to Chrome's favicon cache.
  document.addEventListener('error', (ev) => {
    const el = ev.target;
    if (el?.tagName !== 'IMG' || !el.dataset.page || el.dataset.fallback) return;
    el.dataset.fallback = '1';
    el.src = FI.chromeFavicon(el.dataset.page);
  }, true);

  if (mode === 'window') {
    // Like Spotlight: clicking back into the browser dismisses it.
    window.addEventListener('blur', () => palette.close());
  } else {
    // The frame is shown before it can take keyboard focus; grab it once it's allowed.
    window.addEventListener('focus', () => palette.focus(), { once: true });
  }
}

main();
