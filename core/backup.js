// Export / import everything Snark saves: spaces, folders, pins, favorites,
// archive (chrome.storage.local) and feature settings (chrome.storage.sync).
// Live tab links (chrome.storage.session) aren't exported; they're rebuilt by URL.

export async function exportData() {
  const [local, sync] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]);
  delete local.agentUndo; // undo history is only meaningful in this browser
  return {
    app: 'Snark',
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    local,
    sync,
  };
}

export function summarize(data) {
  const tree = data?.local?.tree ?? [];
  const spaces = tree.filter((n) => n.parent == null && n.type === 'folder' && n.id !== '__archive__').length;
  const pins = tree.filter((n) => n.type === 'pin').length + (data?.local?.pins?.length ?? 0);
  const favs = data?.local?.favorites?.length ?? 0;
  return `${spaces} space${spaces === 1 ? '' : 's'}, ${pins} pin${pins === 1 ? '' : 's'}, ${favs} favorite${favs === 1 ? '' : 's'}`;
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That isn’t valid JSON.'); }
  if (!['Snark', 'myArc'].includes(data?.app) || typeof data.local !== 'object') throw new Error('That isn’t a Snark backup.'); // myArc = earlier name
  return data;
}

/** Replace all saved data with the backup's. */
export async function importData(data) {
  await chrome.storage.local.clear();
  await chrome.storage.local.set(data.local);
  if (data.sync && typeof data.sync === 'object') {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set(data.sync);
  }
  await chrome.storage.session.remove(['pinLinks', 'favLinks']);
}
