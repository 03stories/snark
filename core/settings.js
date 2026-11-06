import { FEATURES } from '../features/registry.js';

const KEY = 'features';

function defaultsFor(meta) {
  const out = { enabled: meta.default };
  for (const s of meta.settings ?? []) out[s.key] = s.default;
  return out;
}

export async function getAll() {
  const { [KEY]: stored = {} } = await chrome.storage.sync.get(KEY);
  const out = {};
  for (const m of FEATURES) out[m.id] = { ...defaultsFor(m), ...(stored[m.id] ?? {}) };
  return out;
}

export async function getFeature(id) {
  return (await getAll())[id];
}

export async function setFeature(id, patch) {
  const { [KEY]: stored = {} } = await chrome.storage.sync.get(KEY);
  stored[id] = { ...(stored[id] ?? {}), ...patch };
  await chrome.storage.sync.set({ [KEY]: stored });
}

export function onFeaturesChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) getAll().then(cb);
  });
}
