// Agent folder tests: the command engine and inbox processing, against an in-memory
// chrome.storage and an in-memory folder (fake File System Access handles).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- minimal chrome mock
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

const { applyCommand, undo } = await import('../core/agent-ops.js');
const { processInbox, writeState } = await import('../core/agent-folder.js');
const T = await import('../core/tree.js');

beforeEach(() => { areas.local = {}; areas.session = {}; });
const tree = () => areas.local.tree ?? [];
const titles = (parent) => T.childrenOf(tree(), parent).map((n) => n.title);
const root = (title) => tree().find((n) => n.parent == null && n.title === title);

const research = {
  id: 'vec-1',
  summary: 'Vector DBs',
  ops: [{
    op: 'createSpace', title: 'Vector DBs', icon: '🧠', theme: 'lilac', color: 'purple',
    items: [
      { pin: 'Overview', url: 'https://example.com/overview', note: 'Start here' },
      { folder: 'Docs', items: [{ pin: 'pgvector', url: 'https://github.com/pgvector/pgvector' }, { folder: 'Deep', items: [] }] },
    ],
  }],
};

test('createSpace builds nested folders and pins', async () => {
  const r = await applyCommand(research);
  assert.equal(r.status, 'ok');
  const s = root('Vector DBs');
  assert.deepEqual([s.icon, s.theme, s.color], ['🧠', 'lilac', 'purple']);
  assert.deepEqual(titles(s.id), ['Overview', 'Docs']);
  const docs = tree().find((n) => n.title === 'Docs');
  assert.deepEqual(titles(docs.id), ['pgvector', 'Deep']);
  assert.equal(tree().find((n) => n.title === 'Overview').note, 'Start here');
  assert.match(r.summary, /Created space “Vector DBs”/);
  assert.equal(r.stats.pins, 2);
});

test('re-sending with ifExists=merge skips duplicate pins', async () => {
  await applyCommand(research);
  const again = structuredClone(research);
  again.ops[0].ifExists = 'merge';
  const r = await applyCommand(again);
  assert.equal(r.stats.pins, 0);
  assert.equal(r.stats.skipped, 2);
  assert.equal(tree().filter((n) => n.type === 'pin').length, 2);
});

test('createSpace refuses an existing space by default', async () => {
  await applyCommand(research);
  await assert.rejects(applyCommand(research), /already exists/);
});

test('commands are atomic: a bad op changes nothing', async () => {
  await applyCommand(research);
  const before = JSON.stringify(tree());
  await assert.rejects(
    applyCommand({ ops: [
      { op: 'addItems', space: 'Vector DBs', items: [{ pin: 'ok', url: 'https://ok.example/' }] },
      { op: 'addItems', space: 'Vector DBs', items: [{ pin: 'bad', url: 'javascript:alert(1)' }] },
    ] }),
    /ops\[1\].*not an http\(s\) URL/
  );
  assert.equal(JSON.stringify(tree()), before);
});

test('addItems creates a folder path; position top', async () => {
  await applyCommand(research);
  await applyCommand({ ops: [{ op: 'addItems', space: 'vector dbs', path: ['Tools', 'Hosted'], items: [{ pin: 'A', url: 'https://a.example/' }] }] });
  await applyCommand({ ops: [{ op: 'addItems', space: 'Vector DBs', path: ['Tools', 'Hosted'], position: 'top', items: [{ pin: 'B', url: 'https://b.example/' }] }] });
  const hosted = tree().find((n) => n.title === 'Hosted');
  assert.deepEqual(titles(hosted.id), ['B', 'A']);
});

test('a Chrome tab group name works as a space and gets saved', async () => {
  const r = await applyCommand(
    { ops: [{ op: 'addItems', space: 'Clients', items: [{ pin: 'LinkedIn', url: 'https://linkedin.com/' }] }] },
    { groups: [{ id: 7, title: 'Clients', color: 'red' }] }
  );
  assert.equal(r.status, 'ok');
  assert.equal(root('Clients').color, 'red');
});

test('unknown spaces, ids, themes and ops give clear errors', async () => {
  await assert.rejects(applyCommand({ ops: [{ op: 'addItems', space: 'Nope', items: [] }] }), /no space called "Nope"/);
  await assert.rejects(applyCommand({ ops: [{ op: 'update', id: 'x' }] }), /no item with id "x"/);
  await assert.rejects(applyCommand({ ops: [{ op: 'createSpace', title: 'T', theme: 'neon' }] }), /unknown theme "neon"/);
  await assert.rejects(applyCommand({ ops: [{ op: 'explode' }] }), /unknown op/);
  await assert.rejects(applyCommand({ nope: 1 }), /needs an "ops" list/);
});

test('update, move and remove', async () => {
  await applyCommand(research);
  const pin = tree().find((n) => n.title === 'pgvector');
  const docs = tree().find((n) => n.title === 'Docs');
  await applyCommand({ ops: [
    { op: 'createSpace', title: 'Archive' },
    { op: 'update', id: pin.id, title: 'pgvector (Postgres)' },
    { op: 'move', id: pin.id, to: { space: 'Archive', path: ['Old'] } },
    { op: 'remove', id: docs.id },
  ] });
  const moved = tree().find((n) => n.id === pin.id);
  assert.equal(moved.title, 'pgvector (Postgres)');
  assert.equal(T.rootOf(tree(), pin.id).title, 'Archive');
  assert.equal(tree().find((n) => n.id === docs.id), undefined);
  assert.equal(tree().find((n) => n.title === 'Deep'), undefined); // removed with its folder
});

test('cannot move a folder into itself', async () => {
  await applyCommand(research);
  const docs = tree().find((n) => n.title === 'Docs');
  await assert.rejects(applyCommand({ ops: [{ op: 'move', id: docs.id, to: { space: 'Vector DBs', path: ['Docs', 'Deep'] } }] }), /into itself/);
});

test('favorites add (deduped) and remove', async () => {
  await applyCommand({ ops: [{ op: 'addFavorites', items: [{ title: 'Gmail', url: 'https://mail.google.com/' }, { title: 'Gmail again', url: 'https://mail.google.com/' }] }] });
  assert.equal(areas.local.favorites.length, 1);
  await applyCommand({ ops: [{ op: 'removeFavorite', url: 'https://mail.google.com/' }] });
  assert.equal(areas.local.favorites.length, 0);
});

test('undo restores the state before a command (by id or latest)', async () => {
  await applyCommand(research);
  await applyCommand({ id: 'more', ops: [{ op: 'addItems', space: 'Vector DBs', items: [{ pin: 'X', url: 'https://x.example/' }] }] });
  await undo('more');
  assert.equal(tree().some((n) => n.title === 'X'), false);
  const r = await applyCommand({ ops: [{ op: 'undo' }] });
  assert.match(r.summary, /Undid/);
  assert.equal(tree().length, 0);
  await assert.rejects(undo(), /nothing to undo/);
});

// ---- selective undo: your edits made after a command survive its undo
const T2 = T;
async function userEdit(fn) { await T2.mutate(fn); } // what the sidebar does

test('undo keeps edits made after the command', async () => {
  await applyCommand(research);
  // user adds their own pin to another space and renames the space
  await applyCommand({ id: 'mine', ops: [{ op: 'createSpace', title: 'Mine' }] });
  await userEdit((t) => [...t, { id: 'u1', type: 'pin', parent: root('Mine').id, title: 'My pin', url: 'https://mine.example/' }]);
  await userEdit((t) => t.map((n) => (n.title === 'Mine' ? { ...n, title: 'Mine (renamed)' } : n)));
  const r = await undo('vec-1');
  assert.equal(r.status, 'ok');
  assert.equal(root('Vector DBs'), undefined);                       // the command's space is gone
  assert.ok(tree().some((n) => n.id === 'u1'));                       // the user's later pin stayed
  assert.ok(root('Mine (renamed)'));                                  // and their rename stayed
});

test('undo reports a conflict if you changed something it added, and force undoes the rest', async () => {
  await applyCommand(research);
  const pin = tree().find((n) => n.title === 'pgvector');
  await userEdit((t) => t.map((n) => (n.id === pin.id ? { ...n, title: 'pgvector (my notes)' } : n)));
  const before = JSON.stringify(tree());
  const r = await undo('vec-1');
  assert.equal(r.status, 'conflict');
  assert.match(r.conflicts.join(), /“pgvector” has been changed since/);
  assert.equal(JSON.stringify(tree()), before);                       // nothing changed
  const f = await undo('vec-1', { force: true });
  assert.equal(f.status, 'ok');
  assert.ok(tree().some((n) => n.title === 'pgvector (my notes)'));   // your edited pin is kept...
  assert.ok(tree().some((n) => n.title === 'Docs'));                  // ...with the folders it needs
  assert.equal(tree().some((n) => n.title === 'Overview'), false);    // everything else is undone
});

test('a folder the command created is kept if you put your own items in it', async () => {
  await applyCommand(research);
  const docs = tree().find((n) => n.title === 'Docs');
  await userEdit((t) => [...t, { id: 'u2', type: 'pin', parent: docs.id, title: 'Mine', url: 'https://m.example/' }]);
  const r = await undo('vec-1');
  assert.equal(r.status, 'conflict');
  assert.match(r.conflicts.join(), /“Docs” still has 1 item in it/);
});

test('undo puts back removed and moved items, in place', async () => {
  await applyCommand(research);
  await applyCommand({ ops: [{ op: 'createSpace', title: 'Archive' }] });
  const s = root('Vector DBs');
  const overview = tree().find((n) => n.title === 'Overview');
  const docs = tree().find((n) => n.title === 'Docs');
  await applyCommand({ id: 'tidy', ops: [
    { op: 'remove', id: overview.id },
    { op: 'move', id: docs.id, to: { space: 'Archive' } },
    { op: 'updateSpace', space: 'Vector DBs', title: 'Vectors', theme: 'sky' },
  ] });
  assert.equal(titles(s.id).length, 0);
  await undo('tidy');
  assert.deepEqual(titles(s.id), ['Overview', 'Docs']);               // same order as before
  assert.equal(root('Vector DBs').theme, 'lilac');
});

test('favorites undo selectively too', async () => {
  await applyCommand({ id: 'f1', ops: [{ op: 'addFavorites', items: [{ title: 'A', url: 'https://a.example/' }] }] });
  areas.local.favorites.push({ id: 'mine', title: 'Mine', url: 'https://mine.example/' }); // added by hand
  await undo('f1');
  assert.deepEqual(areas.local.favorites.map((f) => f.title), ['Mine']);
});

test('old whole-snapshot undo entries are ignored', async () => {
  areas.local.agentUndo = [{ id: 'old', at: 1, summary: 'old', before: { tree: [], favorites: [] } }];
  await assert.rejects(undo('old'), /nothing to undo/);
});

// ---- in-memory File System Access handles
class FakeFile {
  constructor() { this.text = ''; this.lastModified = 0; }
}
class FakeDir {
  constructor(name = 'root') { this.name = name; this.kind = 'directory'; this.items = new Map(); }
  async getDirectoryHandle(n, { create } = {}) {
    if (!this.items.has(n)) { if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); this.items.set(n, new FakeDir(n)); }
    return this.items.get(n);
  }
  async getFileHandle(n, { create } = {}) {
    if (!this.items.has(n)) { if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); this.items.set(n, new FakeFile()); }
    const f = this.items.get(n);
    return {
      kind: 'file',
      getFile: async () => ({ text: async () => f.text, lastModified: f.lastModified }),
      createWritable: async () => { let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { f.text = buf; f.lastModified = Date.now(); } }; },
    };
  }
  async removeEntry(n) { this.items.delete(n); }
  async *entries() { for (const [n, v] of this.items) yield [n, v instanceof FakeDir ? v : await this.getFileHandle(n)]; }
  put(name, text, ageMs = 5000) { const f = new FakeFile(); f.text = text; f.lastModified = Date.now() - ageMs; this.items.set(name, f); }
  read(name) { return this.items.get(name)?.text; }
}

test('processInbox applies ready files in order, writes results and a log', async () => {
  const dir = new FakeDir();
  const inbox = await dir.getDirectoryHandle('inbox', { create: true });
  inbox.put('02-more.json', JSON.stringify({ ops: [{ op: 'addItems', space: 'Vector DBs', items: [{ pin: 'X', url: 'https://x.example/' }] }] }));
  inbox.put('01-space.json', JSON.stringify(research));
  inbox.put('03-broken.json', '{ not json');
  inbox.put('_draft.json', JSON.stringify(research));
  inbox.put('04-fresh.json', JSON.stringify(research), 0); // still being written

  const seen = [];
  const results = await processInbox(dir, {}, (r) => seen.push(r.file));
  assert.deepEqual(seen, ['01-space.json', '02-more.json', '03-broken.json']);
  assert.deepEqual(results.map((r) => r.status), ['ok', 'ok', 'error']);
  assert.match(results[2].error, /Invalid JSON/);
  assert.deepEqual([...inbox.items.keys()].sort(), ['04-fresh.json', '_draft.json']);

  const processed = await dir.getDirectoryHandle('processed');
  const r1 = JSON.parse(processed.read('01-space.result.json'));
  assert.equal(r1.status, 'ok');
  assert.ok(r1.created.some((c) => c.type === 'space' && c.title === 'Vector DBs'));
  const log = dir.read('activity.log').trim().split('\n');
  assert.equal(log.length, 3);
  assert.match(log[0], /✓ 01-space\.json \(Vector DBs\) — Created space “Vector DBs”/);
  assert.match(log[2], /✗ 03-broken\.json/);
});

test('writeState only rewrites when content changes', async () => {
  const dir = new FakeDir();
  assert.equal(await writeState(dir, { a: 1 }), true);
  assert.equal(await writeState(dir, { a: 1 }), false);
  assert.equal(await writeState(dir, { a: 2 }), true);
  assert.equal(JSON.parse(dir.read('state.json')).a, 2);
});

test('AGENTS.md: created, upgraded if unedited, left alone if edited', async () => {
  const { scaffold } = await import('../core/agent-folder.js');
  const { AGENTS_MD } = await import('../core/agent-templates.js');
  const fresh = new FakeDir();
  await scaffold(fresh);
  assert.equal(fresh.read('AGENTS.md'), AGENTS_MD);
  assert.ok(fresh.items.has('inbox') && fresh.items.has('processed') && fresh.items.has('skills'));

  const edited = new FakeDir();
  edited.put('AGENTS.md', '# my own rules');
  await scaffold(edited);
  assert.equal(edited.read('AGENTS.md'), '# my own rules');
  assert.equal(edited.read('AGENTS.latest.md'), AGENTS_MD);
});

test('updateFavorite renames, re-points and reorders; update on a favorite id says to use it', async () => {
  await applyCommand({ ops: [{ op: 'addFavorites', items: [
    { title: 'Inbox (495) - james@… - Mail', url: 'https://mail.google.com/mail/u/0/#inbox' },
    { title: 'HEY', url: 'https://app.hey.com/' },
  ] }] });
  const [gmail, hey] = areas.local.favorites;
  await assert.rejects(applyCommand({ ops: [{ op: 'update', id: gmail.id, title: 'Gmail' }] }), /use updateFavorite/);
  await applyCommand({ ops: [
    { op: 'updateFavorite', id: gmail.id, title: 'Gmail' },
    { op: 'updateFavorite', id: hey.id, position: 'first' },
  ] });
  assert.deepEqual(areas.local.favorites.map((f) => f.title), ['HEY', 'Gmail']);
  assert.equal(areas.local.favorites[1].id, gmail.id); // same id, so its open tab stays attached
  const r = await undo();
  assert.equal(r.status, 'ok');
  assert.deepEqual(areas.local.favorites.map((f) => f.title), ['Inbox (495) - james@… - Mail', 'HEY']);
});

test('processInbox can hand commands to another context (the background host does this)', async () => {
  const dir = new FakeDir();
  const inbox = await dir.getDirectoryHandle('inbox', { create: true });
  inbox.put('01.json', JSON.stringify({ summary: 'hi', ops: [{ op: 'createSpace', title: 'Elsewhere' }] }));
  const seen = [];
  const results = await processInbox(dir, {}, null, async (cmd) => { seen.push(cmd.summary); return { status: 'ok', summary: 'applied remotely' }; });
  assert.deepEqual(seen, ['hi']);
  assert.equal(results[0].summary, 'applied remotely');
  assert.equal(tree().some((n) => n.title === 'Elsewhere'), false); // the default engine wasn't used
  assert.match(dir.read('activity.log'), /✓ 01\.json \(hi\) — applied remotely/);
});
