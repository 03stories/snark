// The agent folder: a folder you pick (e.g. ~/Desktop/Snark-data) that Snark keeps in sync.
// (Internal ids below still say "myarc", the earlier name, so existing connections keep working.)
// Uses the File System Access API from the sidebar page; the folder handle is kept in IndexedDB.

import { applyCommand } from './agent-ops.js';
import { AGENTS_MD, AGENTS_MD_REPLACEABLE, CLAUDE_MD, SKILL_RESEARCH, schemaJson } from './agent-templates.js';

const DB = 'myarc';
const STORE = 'kv';
const KEY = 'agentDir';
const LOG_MAX_LINES = 1000;

// ---- tiny IndexedDB key/value store (FileSystemHandles can be stored there, not in chrome.storage)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kv(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
const kvGet = (k) => kv('readonly', (s) => s.get(k));
const kvSet = (k, v) => kv('readwrite', (s) => s.put(v, k));
const kvDel = (k) => kv('readwrite', (s) => s.delete(k));

// ---- folder handle & permission
/** { status: 'none' | 'ok' | 'needs-permission', handle?, name? } */
export async function getAgentDir({ ask = false } = {}) {
  const handle = await kvGet(KEY).catch(() => null);
  if (!handle) return { status: 'none' };
  let p = await handle.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && ask) p = await handle.requestPermission({ mode: 'readwrite' });
  return { status: p === 'granted' ? 'ok' : 'needs-permission', handle, name: handle.name };
}

/** Must be called from a click (it shows Chrome's folder picker). */
export async function chooseAgentDir() {
  const handle = await window.showDirectoryPicker({ id: 'myarc-agent', mode: 'readwrite', startIn: 'desktop' });
  await kvSet(KEY, handle);
  await scaffold(handle);
  return getAgentDir();
}

export async function disconnectAgentDir() {
  await kvDel(KEY);
}

// ---- file helpers
async function writeFile(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function readFile(dir, name) {
  return (await (await dir.getFileHandle(name)).getFile()).text();
}
async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}
async function writeIfMissing(dir, name, text) {
  if (!(await exists(dir, name))) await writeFile(dir, name, text);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create AGENTS.md, or upgrade it, but only if it's an unedited copy of an earlier version. */
async function writeAgentsMd(root) {
  if (!(await exists(root, 'AGENTS.md'))) return writeFile(root, 'AGENTS.md', AGENTS_MD);
  const current = await readFile(root, 'AGENTS.md');
  if (current === AGENTS_MD) return;
  if (AGENTS_MD_REPLACEABLE.includes(await sha256(current))) return writeFile(root, 'AGENTS.md', AGENTS_MD);
  // Edited by you: leave it, and put the new version next to it for reference.
  await writeFile(root, 'AGENTS.latest.md', AGENTS_MD);
}

export async function scaffold(root) {
  await root.getDirectoryHandle('inbox', { create: true });
  await root.getDirectoryHandle('processed', { create: true });
  const skills = await root.getDirectoryHandle('skills', { create: true });
  await writeAgentsMd(root);
  await writeIfMissing(root, 'CLAUDE.md', CLAUDE_MD);
  await writeIfMissing(skills, 'research-space.md', SKILL_RESEARCH);
  await writeFile(root, 'commands.schema.json', schemaJson());
}

// ---- state.json
let lastStateBody = '';
export async function writeState(root, snapshot) {
  const body = JSON.stringify(snapshot);
  if (body === lastStateBody) return false;
  lastStateBody = body;
  await writeFile(root, 'state.json', JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }, null, 2));
  return true;
}

// ---- inbox → processed
async function appendLog(root, line) {
  let text = '';
  try { text = await readFile(root, 'activity.log'); } catch {}
  const lines = (text ? text.replace(/\n$/, '').split('\n') : []).concat(line).slice(-LOG_MAX_LINES);
  await writeFile(root, 'activity.log', lines.join('\n') + '\n');
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Apply every ready command file in inbox/ (oldest name first).
 * Files modified in the last second are left for the next pass, in case they're still being written.
 */
/**
 * `apply(command, ctx)` applies one command and returns its result. It's the command engine by
 * default; the background host passes a function that hands the command to the service worker.
 */
export async function processInbox(root, ctx, onDone, apply = applyCommand) {
  const inbox = await root.getDirectoryHandle('inbox', { create: true });
  const processed = await root.getDirectoryHandle('processed', { create: true });
  const ready = [];
  for await (const [name, entry] of inbox.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json') || name.startsWith('.') || name.startsWith('_')) continue;
    const file = await entry.getFile();
    if (Date.now() - file.lastModified < 1000) continue;
    ready.push(name);
  }
  ready.sort();
  const results = [];
  for (const name of ready) {
    const text = await readFile(inbox, name);
    let command = null;
    let result;
    try {
      command = JSON.parse(text);
      result = await apply(command, ctx);
    } catch (e) {
      result = { status: 'error', error: e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : String(e?.message ?? e) };
    }
    const out = { file: name, processedAt: new Date().toISOString(), ...result, command: command ?? text };
    const base = name.replace(/\.json$/, '');
    await writeFile(processed, `${base}.result.json`, JSON.stringify(out, null, 2));
    await inbox.removeEntry(name);
    const label = command?.summary ? ` (${command.summary})` : '';
    await appendLog(root, `${stamp()}  ${result.status === 'ok' ? '✓' : '✗'} ${name}${label} — ${result.status === 'ok' ? result.summary : result.error}`);
    results.push(out);
    onDone?.(out);
  }
  return results;
}
