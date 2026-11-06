import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.chrome = { storage: { local: {}, session: {}, sync: {} } };
const { buildSnapshot, spacesFor } = await import('../core/agent-snapshot.js');
const { ARCHIVE_ID } = await import('../core/tree.js');

const tree = [
  { id: 'W', type: 'folder', parent: null, title: 'Work', icon: '💼', color: 'blue' },
  { id: 'p1', type: 'pin', parent: 'W', title: 'Dashboard', url: 'https://dash.example/' },
  { id: 'F', type: 'folder', parent: 'W', title: 'Repos' },
  { id: 'p2', type: 'pin', parent: 'F', title: 'PRs', url: 'https://git.example/prs', note: 'mine' },
  { id: ARCHIVE_ID, type: 'folder', parent: null, title: 'Archive' },
  { id: 'old', type: 'pin', parent: ARCHIVE_ID, title: 'Old', url: 'https://old.example/', archivedAt: 0, from: { spaceTitle: 'Work' } },
];
const groups = [{ id: 7, title: 'Work', color: 'blue' }, { id: 8, title: 'Loose group', color: 'red' }];
const tabs = [
  { id: 1, windowId: 1, groupId: 7, url: 'https://dash.example/?tab=2', title: 'Dash', pinned: false },
  { id: 2, windowId: 1, groupId: 7, url: 'https://news.example/', title: 'News', pinned: false },
  { id: 3, windowId: 1, groupId: -1, url: 'https://loose.example/', title: 'Loose', pinned: false },
  { id: 4, windowId: 1, groupId: -1, url: 'https://mail.example/', title: 'Mail', pinned: true },
];

test('spaces: saved spaces matched to groups by title, plus unsaved groups; the Archive is never a space', () => {
  assert.deepEqual(spacesFor(tree, groups).map((s) => [s.key, s.title, !!s.group]), [['W', 'Work', true], ['g:8', 'Loose group', true]]);
});

test('snapshot: pins with open/currentUrl, nested folders, Today, notInSpace, archive, favorites', () => {
  const s = buildSnapshot({ tree, links: { p1: 1, ghost: 99 }, tabs, groups, windowId: 1, favorites: [{ id: 'f', title: 'Mail', url: 'https://mail.example/' }],
    cfg: { autoClear: { archiveAfter: '168' } }, closedTabs: [{ title: 'X', url: 'https://x.example/', closedAt: 0 }], activeSpaceKey: 'W', version: '9.9' });
  const work = s.spaces[0];
  assert.equal(s.currentSpace, 'Work');
  assert.deepEqual(work.items[0], { type: 'pin', id: 'p1', title: 'Dashboard', url: 'https://dash.example/', open: true, currentUrl: 'https://dash.example/?tab=2' });
  assert.equal(work.items[1].items[0].note, 'mine');
  assert.deepEqual(work.today.map((t) => t.title), ['News']);          // the open pin's tab isn't "Today"
  assert.deepEqual(s.notInSpace.map((t) => t.title), ['Loose']);      // Chrome-pinned tabs excluded
  assert.equal(s.archive.emptyAfterHours, 168);
  assert.equal(s.archive.items[0].fromSpace, 'Work');
  assert.equal(s.archive.closedTabs.length, 1);
  assert.equal(s.favorites[0].title, 'Mail');
  assert.equal(s.version, '9.9');
});
