// ⌘K search over everything in Snark. Pure (no chrome.* calls), so it's unit-tested.
//
// entriesFrom() flattens Snark's data into search entries:
//   { kind, id, title, url?, note?, path: [..titles], spaceKey?, icon?, open?, archived? }
// kinds: 'pin' | 'folder' | 'space' | 'fav' | 'tab' | 'closed' | 'action'
// search() ranks them for a query and returns { entry, score, marks } (marks = title ranges to highlight).

import * as T from './tree.js';

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const urlText = (u) => fold(u).replace(/^[a-z][\w+.-]*:\/\/(www\.)?/, '');
const isWordChar = (c) => /[\p{L}\p{N}]/u.test(c ?? '');

/** Ancestor folder titles of a node, from its space (or the Archive) down. */
function pathOf(tree, id, spaceLabel) {
  const out = [];
  let n = T.byId(tree, T.byId(tree, id)?.parent);
  while (n) {
    if (n.parent == null) {
      out.unshift(n.id === T.ARCHIVE_ID ? 'Archive' : spaceLabel(n));
      break;
    }
    out.unshift(n.title);
    n = T.byId(tree, n.parent);
  }
  return out;
}

/**
 * @param tree        the pinned tree (spaces → folders → pins, plus the Archive)
 * @param spaces      [{ key, title, root?, icon? }] spaces shown in the sidebar (incl. bare tab groups)
 * @param links       { pinId: tabId } pins whose tab is open
 * @param favs        favorites [{ id, title, url }]
 * @param tabs        open tabs that aren't pins/favorites: [{ id, title, url, spaceKey? }]
 * @param closed      the closed-tabs archive [{ title, url, closedAt }]
 * @param actions     [{ id, title, keywords? }]
 */
export function entriesFrom({ tree = [], spaces = [], links = {}, favs = [], tabs = [], closed = [], actions = [] }) {
  const label = (root) => `${root.icon ? `${root.icon} ` : ''}${root.title}`;
  const spaceByKey = new Map(spaces.map((s) => [s.key, s]));
  const out = [];

  for (const s of spaces) {
    const count = s.root ? T.pinsUnder(tree, s.root.id).length : 0;
    out.push({ kind: 'space', id: s.key, title: s.title || 'Unnamed group', icon: s.root?.icon ?? s.icon ?? null, spaceKey: s.key, path: [], count, color: s.color ?? null });
  }
  for (const n of tree) {
    if (n.parent == null) continue; // spaces + the Archive root
    const root = T.rootOf(tree, n.id);
    const archived = root?.id === T.ARCHIVE_ID;
    const base = { id: n.id, title: n.title, path: pathOf(tree, n.id, label), spaceKey: archived ? null : root?.id, archived };
    if (n.type === 'pin') out.push({ ...base, kind: 'pin', url: n.url, note: n.note ?? '', open: links[n.id] != null });
    else out.push({ ...base, kind: 'folder' });
  }
  for (const f of favs) out.push({ kind: 'fav', id: f.id, title: f.title || f.url, url: f.url, path: ['Favorites'] });
  for (const t of tabs) {
    const s = spaceByKey.get(t.spaceKey);
    out.push({ kind: 'tab', id: t.id, title: t.title || t.url, url: t.url, spaceKey: t.spaceKey ?? null, open: true,
      path: [s ? `${s.root?.icon ? `${s.root.icon} ` : ''}${s.title || 'Unnamed group'}` : 'Not in a space', 'Today'] });
  }
  closed.forEach((c, i) => out.push({ kind: 'closed', id: i, title: c.title || c.url, url: c.url, closedAt: c.closedAt, path: ['Archive', 'Closed tabs'], archived: true }));
  for (const a of actions) out.push({ kind: 'action', id: a.id, title: a.title, note: a.keywords ?? '', path: [] });
  return out;
}

// ---------------------------------------------------------------- matching

/** Index where `tok` starts a word in `s` (or -1). */
function wordStart(s, tok) {
  for (let i = s.indexOf(tok); i !== -1; i = s.indexOf(tok, i + 1)) {
    if (i === 0 || !isWordChar(s[i - 1])) return i;
  }
  return -1;
}

/** Characters of `tok` in order within `s`; returns their indexes, or null. Needs ≥3 chars and a tight-ish span. */
function subsequence(s, tok) {
  if (tok.length < 3) return null;
  const idx = [];
  let from = 0;
  for (const c of tok) {
    const i = s.indexOf(c, from);
    if (i === -1) return null;
    idx.push(i);
    from = i + 1;
  }
  const span = idx[idx.length - 1] - idx[0] + 1;
  return span <= tok.length * 4 ? idx : null;
}

function titleMatch(t, tok) {
  if (t.startsWith(tok)) return { score: 100, at: 0 };
  const w = wordStart(t, tok);
  if (w !== -1) return { score: 80, at: w };
  const i = t.indexOf(tok);
  if (i !== -1) return { score: 55, at: i };
  const sub = subsequence(t, tok);
  if (sub) return { score: 22, chars: sub };
  return null;
}

const KIND_BONUS = { pin: 14, fav: 12, space: 10, folder: 8, tab: 5, action: 0, closed: -12 };

function scoreEntry(e, tokens, { currentSpace } = {}) {
  const t = fold(e.title);
  const p = fold(e.path?.join(' › '));
  const u = urlText(e.url);
  const host = u.split(/[/?#]/)[0];
  const n = fold(e.note);
  let total = 0;
  const marks = [];
  for (const tok of tokens) {
    let best = 0;
    const tm = titleMatch(t, tok);
    if (tm) {
      best = tm.score;
      if (tm.chars) tm.chars.forEach((c) => marks.push([c, c + 1]));
      else marks.push([tm.at, tm.at + tok.length]);
    }
    if (best < 45) {
      if (host.startsWith(tok) || wordStart(host, tok) !== -1) best = Math.max(best, 45);
      else if (u.includes(tok)) best = Math.max(best, 25);
    }
    if (best < 40) {
      if (wordStart(p, tok) !== -1) best = Math.max(best, 40);
      else if (p.includes(tok)) best = Math.max(best, 28);
    }
    if (best < 18 && n.includes(tok)) best = 18;
    if (!best) return null; // every word has to match somewhere
    total += best;
  }
  if (t === tokens.join(' ')) total += 40;
  total += KIND_BONUS[e.kind] ?? 0;
  if (e.archived) total -= 18;
  if (e.open) total += 3;
  if (currentSpace && e.spaceKey === currentSpace) total += 2;
  total -= Math.min(10, t.length / 12); // shorter titles win ties
  return { score: total, marks: mergeRanges(marks, e.title) };
}

/** Merge overlapping [start, end) ranges. Only valid when folding didn't change the title's length. */
function mergeRanges(ranges, title) {
  if (fold(title).length !== String(title ?? '').length) return [];
  const sorted = ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

export function search(entries, query, { limit = 50, currentSpace = null } = {}) {
  const tokens = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits = [];
  for (const entry of entries) {
    const r = scoreEntry(entry, tokens, { currentSpace });
    if (r) hits.push({ entry, ...r });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Split a title into plain/marked chunks for rendering: [{ text, mark }]. */
export function chunks(title, marks = []) {
  const s = String(title ?? '');
  const out = [];
  let at = 0;
  for (const [a, b] of marks) {
    if (a > at) out.push({ text: s.slice(at, a), mark: false });
    out.push({ text: s.slice(a, b), mark: true });
    at = b;
  }
  if (at < s.length) out.push({ text: s.slice(at), mark: false });
  return out;
}

/** Stable key for an entry (recents, flash targets). */
export const keyOf = (e) => `${e.kind}:${e.id}`;
