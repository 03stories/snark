import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const expectedTag = `v${version}`;
const tag = process.argv[2] || expectedTag;
if (tag !== expectedTag) {
  console.error(`Release tag ${tag} does not match the manifest version. Expected ${expectedTag}.`);
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const entries = changelog.split(/^##[ \t]+/m).slice(1);
const matches = entries.filter((entry) => entry.split(/\s/, 1)[0] === version);
const notes = matches[0]?.split(/\r?\n/).slice(1).join('\n').trim();
if (matches.length !== 1 || !notes) {
  console.error(`CHANGELOG.md must contain exactly one non-empty level-two entry for ${version}.`);
  process.exit(1);
}

process.stdout.write(`${notes}\n`);
