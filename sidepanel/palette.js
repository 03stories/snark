// The ⌘K palette: type to find any pin, folder, space, favorite, tab or archived item.
// ↵ opens it and shows it in the sidebar; ⌘↵ (Ctrl+↵) only shows it. The sidebar supplies the
// data and the actions through `provider`; this file is just the UI and the keyboard.

import * as S from '../core/search.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; } };
const RECENTS = 'recentPicks';
const MAX_RECENTS = 6;
const KIND_LABEL = { folder: 'Folder', space: 'Space', fav: 'Favorite', tab: 'Tab', closed: 'Closed tab', action: '' };

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS) || '[]'); } catch { return []; }
}
function saveRecent(key) {
  try {
    const list = [key, ...loadRecents().filter((k) => k !== key)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS, JSON.stringify(list));
  } catch {}
}

/**
 * provider: {
 *   entries(): search entries (core/search.js)
 *   currentSpace(): key of the space on screen
 *   icon(entry): HTML for the row's icon
 *   pick(entry, { reveal }): open / show it
 * }
 */
export function createPalette(root, provider) {
  root.innerHTML = `
    <div class="pal-scrim" data-pal="close"></div>
    <div class="pal-box" role="dialog" aria-label="Search Snark">
      <div class="pal-field">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input class="pal-input" type="text" placeholder="Jump to a pin, folder, space…" autocomplete="off" spellcheck="false"
               role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list">
      </div>
      <div class="pal-list" id="pal-list" role="listbox"></div>
      <div class="pal-foot"><span><kbd>↵</kbd> open</span><span><kbd>${/Mac/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'}↵</kbd> show only</span><span><kbd>esc</kbd> close</span></div>
    </div>`;
  const input = root.querySelector('.pal-input');
  const list = root.querySelector('.pal-list');
  let rows = [];   // entries in display order (selectable)
  let sel = 0;
  let lastPointer = null;

  function results(q) {
    const entries = provider.entries();
    if (q.trim()) return { groups: [{ hits: S.search(entries, q, { currentSpace: provider.currentSpace() }) }] };
    const byKey = new Map(entries.map((e) => [S.keyOf(e), e]));
    const recent = loadRecents().map((k) => byKey.get(k)).filter(Boolean).map((entry) => ({ entry, marks: [] }));
    const spaces = entries.filter((e) => e.kind === 'space').map((entry) => ({ entry, marks: [] }));
    return { groups: [{ label: 'Recent', hits: recent }, { label: 'Spaces', hits: spaces }], empty: true };
  }

  function sub(e) {
    const where = e.path?.length ? e.path.join(' › ') : '';
    if (e.kind === 'space') return e.count ? `${e.count} pin${e.count === 1 ? '' : 's'}` : '';
    const h = e.url ? host(e.url) : '';
    return [where, h].filter(Boolean).join(' · ');
  }

  function rowHtml({ entry: e, marks }, i) {
    const title = S.chunks(e.title, marks).map((c) => (c.mark ? `<mark>${esc(c.text)}</mark>` : esc(c.text))).join('');
    const label = e.archived && e.kind !== 'closed' ? 'Archived' : KIND_LABEL[e.kind] ?? '';
    const right = e.kind === 'pin' && e.open && !e.archived ? '<span class="pal-dot" title="Open"></span>' : label ? `<span class="pal-kind">${label}</span>` : '';
    const s = sub(e);
    return `<div class="pal-row${i === sel ? ' sel' : ''}" role="option" id="pal-opt-${i}" aria-selected="${i === sel}" data-i="${i}">
      <span class="pal-ico">${provider.icon(e)}</span>
      <div class="pal-text"><div class="pal-title">${title}</div>${s ? `<div class="pal-sub">${esc(s)}</div>` : ''}</div>
      ${right}
    </div>`;
  }

  function draw() {
    const { groups, empty } = results(input.value);
    rows = [];
    let html = '';
    for (const g of groups) {
      if (!g.hits.length) continue;
      if (g.label) html += `<div class="pal-head">${g.label}</div>`;
      for (const h of g.hits) { html += rowHtml(h, rows.length); rows.push(h.entry); }
    }
    if (!rows.length) {
      html = empty
        ? '<div class="pal-empty">Type to search pins, folders, tabs and the Archive.</div>'
        : `<div class="pal-empty">Nothing matches “${esc(input.value.trim())}”.</div>`;
    }
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    list.innerHTML = html;
    markSel();
  }

  function markSel() {
    list.querySelectorAll('.pal-row').forEach((r) => {
      const on = +r.dataset.i === sel;
      r.classList.toggle('sel', on);
      r.setAttribute('aria-selected', on);
    });
    input.setAttribute('aria-activedescendant', rows.length ? `pal-opt-${sel}` : '');
    list.querySelector('.pal-row.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function move(d) {
    if (!rows.length) return;
    sel = (sel + d + rows.length) % rows.length;
    markSel();
  }

  async function choose(i, reveal) {
    const e = rows[i];
    if (!e) return;
    saveRecent(S.keyOf(e));
    close();
    try { await provider.pick(e, { reveal }); } catch (err) { console.warn('palette pick failed', err); }
  }

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
    else if (e.key === 'PageDown' && rows.length) { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 8); markSel(); }
    else if (e.key === 'PageUp' && rows.length) { e.preventDefault(); sel = Math.max(0, sel - 8); markSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel, mod); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't also leave Settings/Archive
      if (input.value) { input.value = ''; sel = 0; draw(); } else close();
    }
  });
  // Hover selects, but only when the mouse really moved (not when the list scrolls under it).
  list.addEventListener('mousemove', (e) => {
    if (lastPointer && lastPointer.x === e.clientX && lastPointer.y === e.clientY) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    const r = e.target.closest('.pal-row');
    if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; markSel(); }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', (e) => {
    const r = e.target.closest('.pal-row');
    if (r) choose(+r.dataset.i, e.metaKey || e.ctrlKey);
  });
  root.addEventListener('click', (e) => { if (e.target.closest('[data-pal="close"]')) close(); });
  // Clicks inside the palette shouldn't reach the sidebar's own handlers.
  for (const ev of ['click', 'contextmenu', 'dblclick']) root.addEventListener(ev, (e) => e.stopPropagation());

  function open(q = '') {
    if (q || !isOpen()) input.value = q; // already open: keep what you typed
    root.hidden = false;
    sel = 0;
    lastPointer = null;
    draw();
    window.focus();
    input.focus();
    input.select();
  }
  function close() {
    root.hidden = true;
    input.blur();
  }
  const isOpen = () => !root.hidden;
  const toggle = () => (isOpen() ? close() : open());

  return { open, close, toggle, isOpen, refresh: () => isOpen() && draw() };
}
