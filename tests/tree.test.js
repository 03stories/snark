// Run with: npm test   (or: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../core/tree.js';

const f = (id, parent = null, title = id) => ({ id, type: 'folder', parent, title });
const p = (id, parent, url = `https://${id}.test`) => ({ id, type: 'pin', parent, title: id, url });
const order = (nodes, parent) => T.childrenOf(nodes, parent).map((n) => n.id);

const sample = () => [f('S'), p('a', 'S'), f('F', 'S'), p('b', 'F'), p('c', 'F'), p('d', 'S'), f('S2')];

test('childrenOf keeps array order', () => {
  assert.deepEqual(order(sample(), 'S'), ['a', 'F', 'd']);
  assert.deepEqual(order(sample(), null), ['S', 'S2']);
});

test('rootOf / isWithin / pinsUnder', () => {
  const t = sample();
  assert.equal(T.rootOf(t, 'c').id, 'S');
  assert.ok(T.isWithin(t, 'c', 'S'));
  assert.ok(!T.isWithin(t, 'a', 'F'));
  assert.deepEqual(T.pinsUnder(t, 'S').map((n) => n.id), ['a', 'b', 'c', 'd']);
});

test('moveNode before a sibling and to the end', () => {
  let t = T.moveNode(sample(), 'd', 'S', 'a');
  assert.deepEqual(order(t, 'S'), ['d', 'a', 'F']);
  t = T.moveNode(t, 'd', 'F', null);
  assert.deepEqual(order(t, 'F'), ['b', 'c', 'd']);
  assert.deepEqual(order(t, 'S'), ['a', 'F']);
});

test('moveNode across spaces', () => {
  const t = T.moveNode(sample(), 'F', 'S2', null);
  assert.equal(T.rootOf(t, 'b').id, 'S2');
  assert.deepEqual(T.pinsUnder(t, 'S2').map((n) => n.id), ['b', 'c']);
});

test('moveNode refuses to put a folder inside itself', () => {
  const t = sample();
  assert.equal(T.moveNode(t, 'S', 'F', null), t);
  assert.equal(T.moveNode(t, 'F', 'F', null), t);
});

test('nextSiblingId', () => {
  assert.equal(T.nextSiblingId(sample(), 'a'), 'F');
  assert.equal(T.nextSiblingId(sample(), 'd'), null);
});

test('removeNode keepChildren hands contents to the parent, in place', () => {
  const t = T.removeNode(sample(), 'F', { keepChildren: true });
  assert.deepEqual(order(t, 'S'), ['a', 'b', 'c', 'd']);
});

test('removeNode drops descendants by default', () => {
  const t = T.removeNode(sample(), 'S');
  assert.deepEqual(t.map((n) => n.id), ['S2']);
});

test('insertNode before a sibling', () => {
  const t = T.insertNode(sample(), p('z', 'F'), 'c');
  assert.deepEqual(order(t, 'F'), ['b', 'z', 'c']);
});

test('migrateLegacy groups v0.1 pins into spaces and keeps pin ids', () => {
  const t = T.migrateLegacy([
    { id: '1', title: 'A', url: 'https://a', group: 'Work', color: 'blue' },
    { id: '2', title: 'B', url: 'https://b', group: 'Home', color: 'red' },
    { id: '3', title: 'C', url: 'https://c', group: 'Work', color: 'blue' },
  ]);
  const roots = T.childrenOf(t, null);
  assert.deepEqual(roots.map((r) => [r.title, r.color]), [['Work', 'blue'], ['Home', 'red']]);
  assert.deepEqual(T.pinsUnder(t, roots[0].id).map((n) => n.id), ['1', '3']);
});
