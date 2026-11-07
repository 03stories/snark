import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../core/search.js';
import { ARCHIVE_ID } from '../core/tree.js';

const tree = [
  { id: 'home', type: 'folder', parent: null, title: 'Home', icon: '🏠' },
  { id: 'adopt', type: 'folder', parent: 'home', title: 'Adoption' },
  { id: 'money', type: 'folder', parent: 'adopt', title: 'Costs & money' },
  { id: 'irs', type: 'pin', parent: 'money', title: 'IRS Adoption Credit', url: 'https://www.irs.gov/credits-deductions/individuals/adoption-credit', note: 'Form 8839' },
  { id: 'bills', type: 'folder', parent: 'home', title: 'Bills' },
  { id: 'power', type: 'pin', parent: 'bills', title: 'Georgia Power', url: 'https://www.georgiapower.com/' },
  { id: 'work', type: 'folder', parent: null, title: 'Forward' },
  { id: 'gh', type: 'pin', parent: 'work', title: 'GitHub', url: 'https://github.com/03stories/snark' },
  { id: ARCHIVE_ID, type: 'folder', parent: null, title: 'Archive' },
  { id: 'old', type: 'pin', parent: ARCHIVE_ID, title: 'Old GitHub board', url: 'https://github.com/orgs/x/projects/1' },
];
const spaces = [
  { key: 'home', title: 'Home', root: tree[0] },
  { key: 'work', title: 'Forward', root: tree[6] },
];
const entries = S.entriesFrom({
  tree, spaces, links: { gh: 5 },
  favs: [{ id: 'f1', title: 'Gmail', url: 'https://mail.google.com/' }],
  tabs: [{ id: 99, title: 'Snark issues', url: 'https://github.com/03stories/snark/issues', spaceKey: 'work' }],
  closed: [{ title: 'Recipe', url: 'https://cooking.example/recipe', closedAt: 1 }],
  actions: [{ id: 'settings', title: 'Open Settings', keywords: 'preferences options' }],
});
const ids = (q, o) => S.search(entries, q, o).map((h) => S.keyOf(h.entry));

test('entries carry folder paths starting at the space (with its icon)', () => {
  const irs = entries.find((e) => e.id === 'irs');
  assert.deepEqual(irs.path, ['🏠 Home', 'Adoption', 'Costs & money']);
  assert.equal(irs.spaceKey, 'home');
  assert.equal(entries.find((e) => e.id === 'old').archived, true);
  assert.deepEqual(entries.find((e) => e.id === 'old').path, ['Archive']);
  assert.equal(entries.find((e) => e.id === 'gh').open, true);
  assert.equal(entries.filter((e) => e.kind === 'space').length, 2);
});

test('title prefix beats everything; pins outrank archived copies', () => {
  const r = ids('git');
  assert.equal(r[0], 'pin:gh');
  assert.ok(r.indexOf('pin:old') > r.indexOf('pin:gh'));
});

test('every word must match, across title, folder path and URL', () => {
  assert.deepEqual(ids('adoption irs').slice(0, 1), ['pin:irs']);
  assert.ok(ids('money credit').includes('pin:irs'));      // path + title
  assert.ok(ids('irs.gov').includes('pin:irs'));           // url
  assert.ok(ids('8839').includes('pin:irs'));              // note
  assert.deepEqual(ids('adoption zebra'), []);
});

test('folders and spaces are findable', () => {
  assert.equal(ids('bills')[0], 'folder:bills');
  assert.equal(ids('forw')[0], 'space:work');
});

test('fuzzy subsequence as a last resort', () => {
  assert.ok(ids('gpwr').includes('pin:power'));
  assert.deepEqual(ids('zq'), []);
});

test('favorites, open tabs, closed tabs and actions are included', () => {
  assert.equal(ids('gmail')[0], 'fav:f1');
  assert.ok(ids('issues').includes('tab:99'));
  assert.ok(ids('recipe').includes('closed:0'));
  assert.equal(ids('preferences')[0], 'action:settings');
});

test('accents and case are ignored', () => {
  const e = S.entriesFrom({ tree: [{ id: 's', type: 'folder', parent: null, title: 'S' }, { id: 'c', type: 'pin', parent: 's', title: 'Café Olé', url: 'https://x.test' }] });
  assert.equal(S.search(e, 'cafe ole')[0].entry.id, 'c');
});

test('marks highlight the matched title text', () => {
  const [hit] = S.search(entries, 'credit irs');
  assert.equal(hit.entry.id, 'irs');
  const parts = S.chunks(hit.entry.title, hit.marks).filter((c) => c.mark).map((c) => c.text);
  assert.deepEqual(parts, ['IRS', 'Credit']);
});

test('empty query returns nothing', () => {
  assert.deepEqual(S.search(entries, '   '), []);
});
