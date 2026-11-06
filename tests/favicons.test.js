import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.chrome = {
  runtime: { getURL: (p) => `chrome-extension://x${p}` },
  storage: { local: { get: async (k) => (k in store ? { [k]: structuredClone(store[k]) } : {}), set: async (o) => Object.assign(store, structuredClone(o)) } },
};
const FI = await import('../core/favicons.js');

test('live tab icon wins', () => {
  assert.equal(FI.iconFor('https://www.netflix.com/browse', {}, { liveTab: { favIconUrl: 'https://n.example/i.ico' } }), 'https://n.example/i.ico');
});

test('remembered exact-URL icon beats the site icon (Docs vs Sheets)', () => {
  const cache = { 'o:https://docs.google.com': 'docs.ico', 'u:https://docs.google.com/spreadsheets/d/1': 'sheets.ico' };
  assert.equal(FI.iconFor('https://docs.google.com/spreadsheets/d/1', cache), 'sheets.ico');
  assert.equal(FI.iconFor('https://docs.google.com/document/d/2', cache), 'docs.ico');
});

test('falls back to Google, or to Chrome when Google is off', () => {
  assert.match(FI.iconFor('https://www.hulu.com/hub/home', {}), /^chrome-extension:\/\/x\/_favicon\//); // off by default
  assert.match(FI.iconFor('https://www.hulu.com/hub/home', {}, { useGoogle: true }), /google\.com\/s2\/favicons\?domain=www\.hulu\.com/);
});

test('rememberIcons stores site + exact URL, skips junk, only writes on change', async () => {
  const tab = { url: 'https://www.netflix.com/browse?x=1', favIconUrl: 'https://assets.nflxext.com/favicon.ico' };
  await FI.rememberIcons(FI.iconPairsForTab(tab, 'https://www.netflix.com/browse'));
  const c = await FI.getIconCache();
  assert.equal(c['o:https://www.netflix.com'], tab.favIconUrl);
  assert.equal(c['u:https://www.netflix.com/browse'], tab.favIconUrl);
  assert.deepEqual(FI.iconPairsForTab({ url: 'https://a.example/', favIconUrl: 'chrome://favicon/x' }), []);
  assert.deepEqual(FI.iconPairsForTab({ url: 'chrome://extensions/', favIconUrl: 'https://x/i.ico' }), []);
});

test('large inline icons are not cached (storage budget)', () => {
  assert.equal(FI.usableIcon('data:image/png;base64,' + 'A'.repeat(100)), true);
  assert.equal(FI.usableIcon('data:image/png;base64,' + 'A'.repeat(5000)), false);
});
