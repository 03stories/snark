// The global Archive: archive/restore in the tree, the sweep (expiry + one-time migration of old
// per-space "Archive" folders), and agent archive/restore ops with selective undo.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const areas = { local: {}, session: {}, sync: {} };
const area = (name) => ({
  get: async (k) => {
    const d = areas[name];
    const keys = k == null ? Object.keys(d) : [].concat(k);
    return Object.fromEntries(keys.filter((x) => x in d).map((x) => [x, structuredClone(d[x])]));
  },
  set: async (o) => { for (const [k, v] of Object.entries(o)) areas[name][k] = structuredClone(v); },
  remove: async (k) => { for (const x of [].concat(k)) delete areas[name][x]; },
});
globalThis.chrome = {
  storage: { local: area('local'), session: area('session'), sync: area('sync') },
  tabGroups: { query: async () => [], update: async () => {} },
  tabs: { get: async () => { throw new Error('no tab'); } },
};
const T = await import('../core/tree.js');
const { sweepTree, sweepArchive } = await import('../features/auto-clear.js');
const { applyCommand, undo } = await import('../core/agent-ops.js');

const DAY = 86400e3;
const base = () => [
  { id: 'S', type: 'folder', parent: null, title: 'Personal', icon: '👤' },
  { id: 'H', type: 'folder', parent: null, title: 'Home' },
  { id: 'a', type: 'pin', parent: 'S', title: 'A', url: 'https://a.example/' },
  { id: 'F', type: 'folder', parent: 'S', title: 'Folder' },
  { id: 'b', type: 'pin', parent: 'F', title: 'B', url: 'https://b.example/' },
  { id: 'c', type: 'pin', parent: 'S', title: 'C', url: 'https://c.example/' },
];
const kids = (t, p) => T.childrenOf(t, p).map((n) => n.id);
beforeEach(() => { areas.local = {}; areas.session = {}; });

test('the Archive is never a space', () => {
  const t = T.archiveInTree(base(), 'a', 1);
  assert.deepEqual(T.spaceRoots(t).map((n) => n.id), ['S', 'H']);
  assert.ok(T.isArchived(t, 'a'));
  assert.ok(!T.isArchived(t, T.ARCHIVE_ID));
});

test('archiving records where it came from; newest first', () => {
  let t = T.archiveInTree(base(), 'a', 1);
  t = T.archiveInTree(t, 'F', 2);
  assert.deepEqual(kids(t, T.ARCHIVE_ID), ['F', 'a']);
  const a = T.byId(t, 'a');
  assert.deepEqual(a.from, { space: 'S', spaceTitle: 'Personal', spaceIcon: '👤', parent: 'S', before: 'F' });
  assert.equal(a.archivedAt, 1);
  assert.ok(T.isArchived(t, 'b')); // folder contents come along
});

test('restore puts it back in place, else top of its space, else first space', () => {
  let t = T.archiveInTree(base(), 'a', 1);
  let r = T.restoreInTree(t, 'a');
  assert.deepEqual(kids(r.nodes, 'S'), ['a', 'F', 'c']);
  assert.equal(T.byId(r.nodes, 'a').from, undefined);

  t = T.archiveInTree(base(), 'b', 1);           // from Folder
  t = T.removeNode(t, 'F');                       // ...which is then deleted
  r = T.restoreInTree(t, 'b');
  assert.deepEqual(kids(r.nodes, 'S'), ['b', 'a', 'c']); // top of Personal

  t = T.archiveInTree(base(), 'a', 1);
  t = T.removeNode(t, 'S');                       // whole space gone
  r = T.restoreInTree(t, 'a');
  assert.equal(T.byId(r.nodes, 'a').parent, 'H');
  assert.throws(() => T.restoreInTree(base(), 'a'), /isn’t in the Archive/);
});

test('sweep: stamps, expires after the period, unmarks items dragged out', () => {
  let t = [...base(), { id: T.ARCHIVE_ID, type: 'folder', parent: null, title: 'Archive' }];
  t = t.map((n) => (n.id === 'c' ? { ...n, parent: T.ARCHIVE_ID } : n));
  let r = sweepTree(t, 24, 1000);
  assert.equal(T.byId(r.tree, 'c').archivedAt, 1000);
  assert.equal(sweepTree(r.tree, 24, 1000 + DAY - 1).changed, false);
  r = sweepTree(r.tree, 24, 1000 + DAY + 1);
  assert.equal(T.byId(r.tree, 'c'), undefined);
  assert.deepEqual(r.removedPins.map((p) => p.id), ['c']);

  const dragged = T.archiveInTree(base(), 'a', 5).map((n) => (n.id === 'a' ? { ...n, parent: 'H' } : n));
  const u = sweepTree(dragged, 0, 10);
  assert.equal(T.byId(u.tree, 'a').archivedAt, undefined);
  assert.equal(T.byId(u.tree, 'a').from, undefined);
});

test('one-time migration moves old per-space Archive folders into the global Archive', () => {
  const old = [
    ...base(),
    { id: 'OA', type: 'folder', parent: 'S', title: 'Archive' },
    { id: 'x', type: 'pin', parent: 'OA', title: 'X', url: 'https://x.example/', archivedAt: 50 },
    { id: 'y', type: 'pin', parent: 'OA', title: 'Y', url: 'https://y.example/' },
  ];
  const r = sweepTree(old, 0, 100, { migrate: true });
  assert.equal(T.byId(r.tree, 'OA'), undefined);
  assert.equal(T.byId(r.tree, 'x').archivedAt, 50);            // clock kept
  assert.equal(T.byId(r.tree, 'y').archivedAt, 100);
  assert.equal(T.byId(r.tree, 'x').from.spaceTitle, 'Personal');
  assert.equal(T.byId(r.tree, 'x').from.parent, 'S');           // restores into the space, not the deleted folder
  assert.equal(sweepTree(old, 0, 100).tree.some((n) => n.id === 'OA'), true); // without migrate: untouched
});

test('sweepArchive migrates once, and closed tabs share the timer', async () => {
  areas.local.tree = [...base(), { id: 'OA', type: 'folder', parent: 'S', title: 'Archive' }];
  areas.local.archive = [{ url: 'https://old/', title: 'old', closedAt: 0 }, { url: 'https://new/', title: 'new', closedAt: 10 * DAY }];
  await sweepArchive(24, 10 * DAY + 1000);
  assert.equal(areas.local.archiveMigrated, true);
  assert.deepEqual(areas.local.archive.map((c) => c.title), ['new']);
  areas.local.tree.push({ id: 'OA2', type: 'folder', parent: 'S', title: 'Archive' }); // a new folder named Archive later
  await sweepArchive(24, 10 * DAY + 2000);
  assert.ok(areas.local.tree.some((n) => n.id === 'OA2'));      // left alone after the one-time migration
});

test('agent archive/restore ops, and undo of an archive', async () => {
  areas.local.tree = base();
  const r = await applyCommand({ id: 'put-away', ops: [{ op: 'archive', id: 'F' }] });
  assert.equal(r.status, 'ok');
  assert.match(r.summary, /1 archived/);
  assert.ok(T.isArchived(areas.local.tree, 'b'));
  await assert.rejects(applyCommand({ ops: [{ op: 'archive', id: 'S' }] }), /spaces can't be archived/);
  await assert.rejects(applyCommand({ ops: [{ op: 'remove', id: T.ARCHIVE_ID }] }), /no item with id/);

  await undo('put-away');
  assert.deepEqual(kids(areas.local.tree, 'S'), ['a', 'F', 'c']);
  assert.equal(T.byId(areas.local.tree, 'F').archivedAt, undefined);

  await applyCommand({ ops: [{ op: 'archive', id: 'a' }] });
  await applyCommand({ ops: [{ op: 'restore', id: 'a' }] });
  assert.deepEqual(kids(areas.local.tree, 'S'), ['a', 'F', 'c']);
  // the Archive root can't be used as a space by name
  await assert.rejects(applyCommand({ ops: [{ op: 'addItems', space: 'Archive', items: [] }] }), /no space called "Archive"/);
});
