// Favorites: the icon row at the top of the sidebar, shared by every space and window.
//
// Stored in chrome.storage.local under "favorites": [{ id, url, title }].
// Each window gets its own live tab per favorite, kept as a Chrome-pinned tab.
// Links live in chrome.storage.session under "favLinks": { [windowId]: { [favId]: tabId } }.

const KEY = 'favorites';
const LINKS = 'favLinks';

export const origin = (u) => { try { return new URL(u).origin; } catch { return u; } };

export async function getFavs() {
  return (await chrome.storage.local.get(KEY))[KEY] ?? [];
}
async function saveFavs(f) {
  await chrome.storage.local.set({ [KEY]: f });
}
export async function getFavLinks() {
  return (await chrome.storage.session.get(LINKS))[LINKS] ?? {};
}
async function setFavLink(windowId, favId, tabId) {
  const all = await getFavLinks();
  const w = (all[windowId] ??= {});
  if (tabId == null) delete w[favId];
  else w[favId] = tabId;
  await chrome.storage.session.set({ [LINKS]: all });
}

/** First run: import whatever Chrome-pinned tabs exist (any window) as favorites. */
export async function seedFavorites() {
  const r = await chrome.storage.local.get(KEY);
  if (r[KEY]) return;
  const pinned = await chrome.tabs.query({ pinned: true });
  const seen = new Set();
  const favs = [];
  for (const t of pinned) {
    if (!t.url || seen.has(origin(t.url))) continue;
    seen.add(origin(t.url));
    favs.push({ id: crypto.randomUUID(), url: t.url, title: t.title || t.url });
  }
  await saveFavs(favs);
}

export async function addFav({ url, title }, beforeId = null) {
  const favs = await getFavs();
  let fav = favs.find((f) => f.url === url);
  if (!fav) {
    fav = { id: crypto.randomUUID(), url, title: title || url };
    const i = beforeId ? favs.findIndex((f) => f.id === beforeId) : -1;
    if (i < 0) favs.push(fav);
    else favs.splice(i, 0, fav);
    await saveFavs(favs);
  }
  return fav;
}

/** Make an open tab a favorite: it becomes Chrome-pinned and linked in its window. */
export async function addTabAsFav(tab, beforeId = null) {
  const fav = await addFav({ url: tab.url, title: tab.title }, beforeId);
  await chrome.tabs.update(tab.id, { pinned: true });
  await setFavLink(tab.windowId, fav.id, tab.id);
  return fav;
}

export async function removeFav(id) {
  await saveFavs((await getFavs()).filter((f) => f.id !== id));
}

export async function updateFav(id, patch) {
  await saveFavs((await getFavs()).map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

export async function moveFav(id, beforeId = null) {
  if (id === beforeId) return;
  const favs = await getFavs();
  const fav = favs.find((f) => f.id === id);
  if (!fav) return;
  const rest = favs.filter((f) => f.id !== id);
  const i = beforeId ? rest.findIndex((f) => f.id === beforeId) : -1;
  if (i < 0) rest.push(fav);
  else rest.splice(i, 0, fav);
  await saveFavs(rest);
}

/**
 * Find this window's live tab for each favorite: its linked tab, else a Chrome-pinned
 * tab with the same URL, else one on the same site. Returns Map favId -> tab.
 */
export function matchFavTabs(favs, linksForWindow, pinnedTabs) {
  const out = new Map();
  const used = new Set();
  const byId = new Map(pinnedTabs.map((t) => [t.id, t]));
  for (const f of favs) {
    const t = byId.get(linksForWindow?.[f.id]);
    if (t) { out.set(f.id, t); used.add(t.id); }
  }
  for (const pass of [(t, f) => t.url === f.url, (t, f) => origin(t.url) === origin(f.url)]) {
    for (const f of favs) {
      if (out.has(f.id)) continue;
      const t = pinnedTabs.find((x) => !used.has(x.id) && pass(x, f));
      if (t) { out.set(f.id, t); used.add(t.id); }
    }
  }
  return out;
}

export async function openFav(fav, windowId) {
  const [links, pinned] = await Promise.all([getFavLinks(), chrome.tabs.query({ windowId, pinned: true })]);
  const favs = await getFavs();
  const t = matchFavTabs(favs, links[windowId], pinned).get(fav.id);
  if (t) {
    await chrome.tabs.update(t.id, { active: true });
    if (links[windowId]?.[fav.id] !== t.id) await setFavLink(windowId, fav.id, t.id);
    return t;
  }
  const tab = await chrome.tabs.create({ windowId, url: fav.url, pinned: true, active: true });
  await setFavLink(windowId, fav.id, tab.id);
  return tab;
}
