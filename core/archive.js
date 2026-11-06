// "Recently cleared" — tabs closed by Today's Clear button or auto-clear, so nothing is lost.
const KEY = 'archive';
const MAX = 100;

export async function getArchive() {
  return (await chrome.storage.local.get(KEY))[KEY] ?? [];
}

export async function archiveAndClose(tabs) {
  if (!tabs.length) return;
  const items = tabs
    .filter((t) => t.url && !t.url.startsWith('chrome://newtab'))
    .map((t) => ({ url: t.url, title: t.title || t.url, closedAt: Date.now() }));
  const cur = await getArchive();
  await chrome.storage.local.set({ [KEY]: [...items, ...cur].slice(0, MAX) });
  await chrome.tabs.remove(tabs.map((t) => t.id)).catch(() => {});
}

/** Add items ({ url, title, source? }) to Recently cleared without closing anything. */
export async function addToArchive(items) {
  if (!items.length) return;
  const now = Date.now();
  const cur = await getArchive();
  const add = items.filter((i) => i.url).map((i) => ({ url: i.url, title: i.title || i.url, closedAt: now, ...(i.source ? { source: i.source } : {}) }));
  await chrome.storage.local.set({ [KEY]: [...add, ...cur].slice(0, MAX) });
}

export async function restore(index, windowId) {
  const a = await getArchive();
  const it = a[index];
  if (!it) return;
  a.splice(index, 1);
  await chrome.storage.local.set({ [KEY]: a });
  await chrome.tabs.create({ windowId, url: it.url });
}

export async function forget(index) {
  const a = await getArchive();
  a.splice(index, 1);
  await chrome.storage.local.set({ [KEY]: a });
}

export async function clearArchive() {
  await chrome.storage.local.set({ [KEY]: [] });
}
