// Site icons for pins, tabs, favorites and cleared items.
//
// Order of preference:
//   1. the open tab's own icon (always right once the page has loaded)
//   2. an icon remembered from a tab seen earlier: for that exact pinned URL, else for its site
//      (so Docs vs Sheets on docs.google.com keep their own icons)
//   3. Google's favicon service, for sites never opened in this profile (optional setting, off by default)
//   4. Chrome's favicon cache for the exact URL (often a grey globe)
//
// Remembered icons live in chrome.storage.local under "favicons": { "u:<url>" | "o:<origin>": iconUrl }.

const KEY = 'favicons';
const MAX = 400;           // entries kept (newest win)
const MAX_INLINE = 2048;   // longest data: icon kept; keeps the cache well under storage.local's quota

export const originOf = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.origin : null;
  } catch {
    return null;
  }
};

/** Remote icons, or small inline ones (some sites use data: icons). */
export const usableIcon = (f) => !!f && (/^https?:\/\//.test(f) || (f.startsWith('data:image/') && f.length <= MAX_INLINE));

export const chromeFavicon = (url) => chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url || '')}&size=32`);
const googleFavicon = (origin) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(origin).hostname)}&sz=32`;

export async function getIconCache() {
  return (await chrome.storage.local.get(KEY))[KEY] ?? {};
}

/** pairs: [[key, iconUrl]] where key is "u:<url>" or "o:<origin>". Writes only if something changed. */
export async function rememberIcons(pairs) {
  const fresh = pairs.filter(([k, f]) => k && usableIcon(f));
  if (!fresh.length) return;
  const cache = await getIconCache();
  let changed = false;
  for (const [k, f] of fresh) {
    if (cache[k] === f) continue;
    delete cache[k]; // re-insert so the newest are kept when trimming
    cache[k] = f;
    changed = true;
  }
  if (!changed) return;
  const keys = Object.keys(cache);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete cache[k];
  await chrome.storage.local.set({ [KEY]: cache });
}

/** Keys to remember for a loaded tab (and the saved URL it belongs to, if any). */
export function iconPairsForTab(tab, savedUrl) {
  if (!usableIcon(tab?.favIconUrl)) return [];
  const pairs = [];
  const o = originOf(tab.url);
  if (o) pairs.push([`o:${o}`, tab.favIconUrl]);
  if (savedUrl && o) pairs.push([`u:${savedUrl}`, tab.favIconUrl]);
  return pairs;
}

export function iconFor(url, cache = {}, { liveTab = null, useGoogle = false } = {}) {
  if (usableIcon(liveTab?.favIconUrl)) return liveTab.favIconUrl;
  const o = originOf(url);
  if (cache[`u:${url}`]) return cache[`u:${url}`];
  if (o && cache[`o:${o}`]) return cache[`o:${o}`];
  if (useGoogle && o) return googleFavicon(o);
  return chromeFavicon(url);
}
