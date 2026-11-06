import { getFeature, setFeature } from '../core/settings.js';
import * as T from '../core/tree.js';
import { getLinks } from '../core/tree.js';
import { archiveAndClose } from '../core/archive.js';

export const id = 'autoClear';
const ALARM = 'autoClear';

// The clock starts no earlier than when the feature was turned on, or when this
// browser session started, so turning it on never mass-closes old tabs.
async function sessionStart() {
  const { sessionStart } = await chrome.storage.session.get('sessionStart');
  if (sessionStart) return sessionStart;
  const now = Date.now();
  await chrome.storage.session.set({ sessionStart: now });
  return now;
}

// ---- The global Archive (see core/tree.js). Archived items carry `archivedAt`; once they've been
// there longer than the setting they're deleted. Closed tabs in Recently cleared use the same timer.
// The first sweep also moves the contents of any old per-space "Archive" folders into it.
export const isArchiveFolder = (n) => n?.type === 'folder' && n.parent != null && /^archive$/i.test(String(n.title).trim());

/** Pure: returns { tree, changed, removedPins }. */
export function sweepTree(tree, hours, now = Date.now(), { migrate = false } = {}) {
  let t = tree.map((n) => ({ ...n }));
  let changed = false;

  if (migrate) {
    for (const f of t.filter((n) => isArchiveFolder(n) && !T.isArchived(t, n.id))) {
      for (const c of T.childrenOf(t, f.id)) {
        t = T.archiveInTree(t, c.id, c.archivedAt ?? now);
        t = t.map((x) => (x.id === c.id && x.from ? { ...x, from: { ...x.from, parent: f.parent, before: null } } : x));
      }
      t = t.filter((n) => n.id !== f.id);
      changed = true;
    }
  }

  for (let i = 0; i < t.length; i++) {
    const n = t[i];
    const inArchive = n.parent === T.ARCHIVE_ID;
    if (inArchive && !n.archivedAt) { t[i] = { ...n, archivedAt: now }; changed = true; }
    else if (!inArchive && (n.archivedAt || n.from)) { t[i] = T.unmark(n); changed = true; }
  }

  const removedPins = [];
  if (hours > 0) {
    for (const c of T.childrenOf(t, T.ARCHIVE_ID)) {
      if (now - c.archivedAt <= hours * 3600e3) continue;
      removedPins.push(...(c.type === 'pin' ? [c] : T.pinsUnder(t, c.id)));
      t = T.removeNode(t, c.id);
      changed = true;
    }
  }
  return { tree: changed ? t : tree, changed, removedPins };
}

export async function sweepArchive(hours, now = Date.now()) {
  const { archiveMigrated, archive: closed = [] } = await chrome.storage.local.get(['archiveMigrated', 'archive']);
  const opts = { migrate: !archiveMigrated };
  let removed = [];
  if (sweepTree(await T.getTree(), hours, now, opts).changed) { // don't write when nothing changed
    await T.mutate((t) => {
      const r = sweepTree(t, hours, now, opts);
      removed = r.removedPins;
      return r.tree;
    });
  }
  if (!archiveMigrated) await chrome.storage.local.set({ archiveMigrated: true });
  if (removed.length) {
    const links = await T.getLinks();
    for (const p of removed) delete links[p.id];
    await T.setLinks(links);
  }
  // Closed tabs follow the same timer.
  if (hours > 0) {
    const keep = closed.filter((c) => now - (c.closedAt ?? now) <= hours * 3600e3);
    if (keep.length !== closed.length) await chrome.storage.local.set({ archive: keep });
  }
  return removed.length;
}

export async function run() {
  const cfg = await getFeature(id);
  // The Archive timer is set on the Archive page and runs even if idle-tab clearing is off.
  await sweepArchive(Number(cfg.archiveAfter ?? 0)).catch((e) => console.warn('archive sweep failed', e));
  if (!cfg.enabled) return;
  const maxIdle = Number(cfg.after) * 3600e3;
  const floor = Math.max(cfg.enabledAt ?? 0, await sessionStart());
  const now = Date.now();
  const [tabs, links] = await Promise.all([chrome.tabs.query({}), getLinks()]);
  const linked = new Set(Object.values(links));

  const stale = tabs.filter(
    (t) =>
      !t.pinned &&
      !t.active &&
      !t.audible &&
      !linked.has(t.id) &&
      (cfg.includeGrouped || t.groupId === -1) &&
      now - Math.max(t.lastAccessed ?? 0, floor) > maxIdle
  );
  if (stale.length) await archiveAndClose(stale);
}

export function init() {
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) run();
  });
  sessionStart();
}

// On extension updates, restart the clock so a changed default never closes tabs straight away.
export async function onInstalled(details) {
  if (details?.reason === 'update') await setFeature(id, { enabledAt: Date.now() });
}

export async function apply(cfg) {
  if (!(await chrome.alarms.get(ALARM))) chrome.alarms.create(ALARM, { periodInMinutes: 30 });
  sweepArchive(0).catch(() => {}); // migrate/stamp right away (0 = never removes anything)
  if (cfg.enabled) {
    if (!cfg.enabledAt) await setFeature(id, { enabledAt: Date.now() });
  } else if (cfg.enabledAt) {
    await setFeature(id, { enabledAt: null });
  }
}
