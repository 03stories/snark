#!/usr/bin/env node
// Build the Chrome Web Store package:  npm run package
//
//   dist/snark-<version>.zip   upload this to the Chrome Web Store
//   dist/snark-<version>/      the same files unzipped ("Load unpacked" it once as a smoke test)
//
// - Only runtime files are included (no tests, docs, tools, package.json, feature template).
// - The manifest's name loses its " (dev)" suffix, so the store copy is plain "Snark".
// - The manifest's "key" is removed: the store rejects it on first upload and assigns its own ID.
//   (The repo keeps the key so unpacked dev installs have a stable ID.)
// - Every file referenced by the manifest, HTML (<script>/<link>) and JS imports must exist,
//   or the build fails.
// No dependencies: the zip is written with Node's zlib.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DIRS = ['core', 'features', 'sidepanel', 'offscreen', 'search', 'ui', 'icons'];
const INCLUDE_FILES = ['manifest.json', 'background.js', 'LICENSE'];
const EXCLUDE = [/(^|\/)\./, /^features\/_template\.js$/, /\.test\.js$/];

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// ---- collect files
const files = new Map(); // relative path -> Buffer
for (const f of INCLUDE_FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) fail(`missing ${f}`);
  files.set(f, fs.readFileSync(path.join(ROOT, f)));
}
for (const d of INCLUDE_DIRS) {
  for (const p of walk(path.join(ROOT, d))) {
    const r = rel(p);
    if (EXCLUDE.some((re) => re.test(r))) continue;
    files.set(r, fs.readFileSync(p));
  }
}

// ---- manifest: strip key, and drop the " (dev)" the repo's copy carries
const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
delete manifest.key;
manifest.name = manifest.name.replace(/\s*\(dev\)\s*$/i, '');
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
const { name, version } = manifest;

// ---- validate references
const problems = [];
const need = (ref, from) => { if (!files.has(ref)) problems.push(`${from} → ${ref} (not in package)`); };
need(manifest.background?.service_worker, 'manifest background');
need(manifest.side_panel?.default_path, 'manifest side_panel');
for (const p of Object.values(manifest.icons ?? {})) need(p, 'manifest icons');
for (const p of Object.values(manifest.action?.default_icon ?? {})) need(p, 'manifest action icon');
if (!manifest.icons?.['128']) problems.push('manifest has no 128px icon (required by the store)');

const resolveFrom = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
for (const [f, buf] of files) {
  const text = f.endsWith('.js') || f.endsWith('.html') ? buf.toString('utf8') : null;
  if (!text) continue;
  if (f.endsWith('.html')) {
    for (const m of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      if (!/^[a-z]+:/.test(m[1])) need(resolveFrom(f, m[1]), f);
    }
  } else {
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) need(resolveFrom(f, m[1]), f);
    if (/https?:\/\/[^'"`\s]+\.js['"`]/.test(text)) problems.push(`${f} looks like it loads remote code`);
  }
}
for (const ref of ['offscreen/offscreen.html']) need(ref, 'chrome.offscreen.createDocument');
for (const ref of ['search/search.html']) need(ref, 'features/search-launcher.js');
if (problems.length) fail(`package check failed:\n  ${problems.join('\n  ')}`);

// ---- write dist/<slug>-<version>/ and the zip
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const DIST = path.join(ROOT, 'dist');
const outDir = path.join(DIST, `${slug}-${version}`);
fs.rmSync(outDir, { recursive: true, force: true });
for (const [f, buf] of files) {
  fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
  fs.writeFileSync(path.join(outDir, f), buf);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const local = [];
const central = [];
let offset = 0;
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed timestamp → reproducible zips
for (const [f, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  const nameBuf = Buffer.from(f, 'utf8');
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(8, 8); head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(deflated.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
  local.push(head, nameBuf, deflated);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10); cd.writeUInt16LE(DOS_TIME, 12); cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(deflated.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);
  offset += head.length + nameBuf.length + deflated.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
const zipPath = path.join(DIST, `${slug}-${version}.zip`);
fs.writeFileSync(zipPath, Buffer.concat([...local, cdBuf, end]));

const kb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`✓ ${rel(zipPath)}  (${files.size} files, ${kb} KB, key stripped)`);
console.log(`✓ ${rel(outDir)}/  (load unpacked once to smoke-test before uploading)`);
