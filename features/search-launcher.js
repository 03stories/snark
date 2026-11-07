// Opens Search Snark centered over the browser, and routes picked results to the sidebar.
//
// - From the "Search Snark" shortcut (⌘K on Mac) on a normal web page: an iframe with search/search.html is
//   dropped over the page (centered, page dimmed). The shortcut grants activeTab, so this needs
//   no extra permissions. It's removed again when you pick something or press Esc.
// - Where that's not possible (New Tab, chrome:// pages, the Web Store, pages that block it) and
//   when you press it in the sidebar (Chrome won't move keyboard focus from the sidebar into a page):
//   a small popup window centered over the browser window.
//
// Each launch gets a one-time token; search.html shows nothing unless its token checks out, so
// other sites can't embed it.

const SESSIONS = 'searchSessions';  // storage.session: token -> { windowId, mode, at, ready }
const WINDOW = 'searchWindow';      // storage.session: id of the open search window
const URL_PATH = 'search/search.html';
const W = 660;
const H = 500;
const TTL = 60_000;

async function sessions() {
  const all = (await chrome.storage.session.get(SESSIONS))[SESSIONS] ?? {};
  const now = Date.now();
  for (const [k, s] of Object.entries(all)) if (now - s.at > TTL) delete all[k];
  return all;
}
async function putSession(token, s) {
  const all = await sessions();
  if (s) all[token] = { ...s, at: Date.now() };
  else delete all[token];
  await chrome.storage.session.set({ [SESSIONS]: all });
}

// ---------------------------------------------------------------- in-page overlay
// These two run inside the web page (isolated world), via chrome.scripting.

function mountOverlay(src) {
  const ID = '__snark_search__';
  const old = document.getElementById(ID);
  if (old) { old.remove(); return 'closed'; } // the shortcut again closes it
  // The box may have just closed itself on the same keypress; don't pop it right back open.
  if (Date.now() - (globalThis.__snarkClosedAt ?? 0) < 400) return 'closed';
  const f = document.createElement('iframe');
  f.id = ID;
  f.src = src;
  f.setAttribute('aria-label', 'Search Snark');
  f.style.cssText = [
    'position:fixed', 'inset:0', 'width:100vw', 'height:100vh', 'max-width:none', 'max-height:none',
    'margin:0', 'padding:0', 'border:0', 'display:block', 'visibility:visible', 'opacity:1',
    'z-index:2147483647', 'background:transparent', 'color-scheme:normal', 'transform:none', 'filter:none',
  ].map((d) => `${d} !important`).join(';');
  const prevFocus = document.activeElement;
  const done = () => {
    removeEventListener('message', onMsg, true);
    f.remove();
    globalThis.__snarkClosedAt = Date.now();
    if (prevFocus && prevFocus.isConnected) prevFocus.focus?.({ preventScroll: true });
  };
  const onMsg = (e) => {
    if (e.source === f.contentWindow && e.data === 'snark-search-close') { e.stopImmediatePropagation(); done(); }
  };
  addEventListener('message', onMsg, true);
  f.addEventListener('load', () => f.focus());
  (document.body ?? document.documentElement).append(f);
  f.focus();
  return 'opened';
}

function unmountOverlay() {
  document.getElementById('__snark_search__')?.remove();
}

const scriptable = (url) => /^(https?|file):/i.test(url ?? '') && !/^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/i.test(url);

async function openInPage(tab) {
  const token = crypto.randomUUID();
  await putSession(token, { windowId: tab.windowId, mode: 'frame' });
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: mountOverlay,
      args: [chrome.runtime.getURL(`${URL_PATH}?t=${token}`)],
    });
    if (res?.result === 'closed') { await putSession(token, null); return true; }
  } catch {
    await putSession(token, null); // no access to this page
    return false;
  }
  // If the page blocked the frame (some sites' security policies do), use a window instead.
  setTimeout(async () => {
    const s = (await sessions())[token];
    if (!s || s.ready) return;
    await putSession(token, null);
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: unmountOverlay }).catch(() => {});
    openWindow(tab.windowId);
  }, 1500);
  return true;
}

// ---------------------------------------------------------------- centered window

let opening = null; // one window at a time, even if the shortcut and the sidebar both ask

function openWindow(windowId) {
  opening ??= openWindowNow(windowId).finally(() => { opening = null; });
  return opening;
}

async function openWindowNow(windowId) {
  const existing = (await chrome.storage.session.get(WINDOW))[WINDOW];
  if (existing != null && (await chrome.windows.get(existing).catch(() => null))) {
    // The shortcut pressed inside the search window closes it; from anywhere else, brings it forward.
    if (existing === windowId) return chrome.windows.remove(existing).catch(() => {});
    return chrome.windows.update(existing, { focused: true });
  }
  const token = crypto.randomUUID();
  await putSession(token, { windowId, mode: 'window' });
  const host = await chrome.windows.get(windowId).catch(() => null);
  const pos = host
    ? { left: Math.round(host.left + (host.width - W) / 2), top: Math.round(host.top + Math.max(48, Math.min(160, (host.height - H) / 4))) }
    : {};
  const win = await chrome.windows.create({ url: chrome.runtime.getURL(`${URL_PATH}?t=${token}`), type: 'popup', width: W, height: H, focused: true, ...pos });
  await chrome.storage.session.set({ [WINDOW]: win.id });
}

/** Open Search Snark for a browser window. `inPage`: try the overlay on its active tab first. */
export async function openSearch(windowId, { inPage = true } = {}) {
  if (inPage) {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && scriptable(tab.url) && (await openInPage(tab))) return;
  }
  await openWindow(windowId);
}

// ---------------------------------------------------------------- results → sidebar

const pendingReveal = new Map(); // windowId -> { msg, at } for a sidebar that's still opening

/** Call when a sidebar connects; hands it a result it was opened to show. */
export function onPanelHello(windowId, port) {
  const p = pendingReveal.get(windowId);
  pendingReveal.delete(windowId);
  if (p && Date.now() - p.at < 10_000) port.postMessage(p.msg);
}

export function init({ panels }) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.target !== 'sw') return;
    if (msg.type === 'open-search') {
      openSearch(msg.windowId, { inPage: msg.inPage !== false }).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    }
    if (msg.type === 'search-hello') {
      // Only extension pages (our iframe / window) may claim a token.
      if (sender.id !== chrome.runtime.id || !String(sender.url ?? '').startsWith(chrome.runtime.getURL(URL_PATH))) return;
      (async () => {
        const all = await sessions();
        const s = all[msg.token];
        if (!s || s.ready) return sendResponse({ ok: false });
        all[msg.token] = { ...s, ready: true };
        await chrome.storage.session.set({ [SESSIONS]: all });
        sendResponse({ ok: true, windowId: s.windowId, mode: s.mode });
      })();
      return true;
    }
    if (msg.type === 'search-reveal') {
      const out = { type: 'reveal', entry: msg.entry, open: !!msg.open };
      const port = panels.get(msg.windowId);
      if (port) port.postMessage(out);
      else pendingReveal.set(msg.windowId, { msg: out, at: Date.now() });
      sendResponse({ ok: true });
    }
  });
  chrome.windows.onRemoved.addListener(async (id) => {
    const cur = (await chrome.storage.session.get(WINDOW))[WINDOW];
    if (cur === id) await chrome.storage.session.remove(WINDOW);
  });
}
