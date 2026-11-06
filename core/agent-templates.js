// Files Snark writes into the agent folder. AGENTS.md, CLAUDE.md and skills/* are only
// created if missing (so your edits stick); commands.schema.json is regenerated each time.

import { THEME_KEYS, COLORS } from './agent-ops.js';

// sha256 of earlier, unedited AGENTS.md versions, which are safe to replace on upgrade.
export const AGENTS_MD_REPLACEABLE = [
  'd251395c3794aaf3ae18868ac1f5bd11eb6a2af1f85e4eeb79efdf24b3d3e01a', // v0.4.0
  'e29652c03c39372bf080f8ed4ffb366b15ab4e09fa3daaed5e7d52d111c6d713', // v0.4.1
  '3e534a9cf4a87ad529abe873c95a571d504a1fe50688c19f9f70d5d514c3feb0', // v0.4.2
  '9045f56b214c277ce2fdf07d47330ba9b8a18ae343984e209a4ba6951a534704', // v0.5.0
  'a0f0d0ae59b8aa56eb17172857ee6e89851910d75529d2b26647e7d66188c6de', // v0.5.1 (as myArc)
  '39549f3703bf1505e1df3dcaeb1c392bfa4f3df773610d4acdff4f4a45e1b8b6', // v1.1.0
];

export const AGENTS_MD = `<!-- Snark AGENTS.md v7. Edit freely: Snark only replaces unedited copies. -->
# Snark agent folder

This folder is a two-way bridge to **Snark**, a spaces-and-pinned-tabs sidebar extension running in
the user's Chrome. Read \`state.json\` to see their spaces, folders, pins and favorites.
Write a command file into \`inbox/\` to change them. Snark picks it up within a few seconds
while Chrome is running (no sidebar needed), applies it, and moves it to \`processed/\` with the result.

## Files

| Path | Who writes it | What it is |
|---|---|---|
| \`state.json\` | Snark | Live snapshot. **Read-only**: edits are overwritten. |
| \`inbox/*.json\` | you (the agent) | Commands to apply, one per file. |
| \`processed/*.result.json\` | Snark | The command you sent, plus \`status\`, \`summary\`, \`created\` ids or \`error\`. |
| \`activity.log\` | Snark | One line per applied command, newest last. |
| \`skills/\` | anyone | Reusable recipes (see \`skills/research-space.md\`). |
| \`commands.schema.json\` | Snark | JSON Schema for command files. |

## The model

- **Space**: a top-level area the user swipes between. Each one is also a Chrome tab group
  with the same name. It has a \`title\`, an optional emoji \`icon\`, a gradient \`theme\` and a
  tab-group \`color\`.
- **Folder**: nests inside a space or another folder, as deep as you like.
- **Pin**: a saved link (\`title\` + \`url\`). The pinned URL stays the same while the user
  browses. Pins you create start closed, so no tabs open.
- **Favorite**: an icon in the row at the top, shared by every space.
- **Today** (\`spaces[].today\`) and **notInSpace**: the user's open, unpinned tabs. Read-only context.
- **Archive**: one global place for things that are on their way out, shown as the last page
  of the sidebar (\`state.json\` → \`archive.items\`). Archived pins and folders remember where they
  came from (\`fromSpace\`) and are deleted after \`archive.emptyAfterHours\` (null = never). Tabs
  closed by Clear / auto-clear are listed in \`archive.closedTabs\`. To put something stale away,
  use the \`archive\` op, **not** \`remove\`.

Every space, folder and pin in \`state.json\` has an \`id\`. Use ids to update, move or remove
things. Spaces can also be referred to by title (case-insensitive).

Themes: ${THEME_KEYS.join(', ')}
Colors: ${COLORS.join(', ')}

## Working alongside the user

The user edits Snark by hand at the same time you do. To never undo their work:

- **Read \`state.json\` right before writing each command**, not from memory or an earlier
  read in the conversation. It's rewritten within ~2 seconds of any change while Chrome is running.
- **Send changes, not copies.** Commands are applied to the user's live data at that moment.
  Only the items you name are touched; there's no "replace everything" op, on purpose.
- **Refer to existing items by \`id\`.** Titles can change. If an id no longer exists, the
  command fails without changing anything: re-read \`state.json\` and retry.
- **Don't rename or edit things the user didn't ask about.** If you think something should
  change, suggest it to the user first.

## Command files

Write UTF-8 JSON to \`inbox/<something-unique>.json\`, e.g. \`inbox/20261105-1530-vector-dbs.json\`.
Files are processed in name order. Files starting with \`.\` or \`_\` are ignored, so you can
write \`_draft.json\` and rename it when ready.

\`\`\`json
{
  "id": "vector-dbs-1",
  "summary": "Research space on vector databases",
  "ops": [ { "op": "...", ... } ]
}
\`\`\`

A command is **all or nothing**: if any op fails, nothing changes and the result explains
which op failed and why. Pins whose URL already exists in the same folder are skipped, so
re-sending a command is safe.

### Ops

**createSpace** creates a space, optionally with contents.
\`\`\`json
{ "op": "createSpace", "title": "Vector DBs", "icon": "🧠", "theme": "lilac", "color": "purple",
  "ifExists": "error",
  "items": [
    { "pin": "Overview: what is a vector DB", "url": "https://example.com/overview", "note": "Start here" },
    { "folder": "Docs", "items": [
      { "pin": "pgvector README", "url": "https://github.com/pgvector/pgvector" }
    ] }
  ] }
\`\`\`
\`ifExists\`: \`"error"\` (default) or \`"merge"\` (add to the existing space).

**addItems** adds pins and folders into a space or a folder path. Missing folders are created.
\`\`\`json
{ "op": "addItems", "space": "Work", "path": ["Projects", "Refs"], "position": "bottom",
  "items": [ { "pin": "Figma file", "url": "https://www.figma.com/file/..." } ] }
\`\`\`
\`position\`: \`"bottom"\` (default) or \`"top"\`. Add \`"createSpace": true\` to create the space if it's missing.

**updateSpace** changes a space: \`{ "op": "updateSpace", "space": "Work", "title": "Work 2027", "icon": "💼", "theme": "sky", "color": "blue" }\`

**update** renames a pin or folder, or changes a pin's URL or note:
\`{ "op": "update", "id": "<id>", "title": "New label", "url": "https://...", "note": "..." }\`

**move** moves a pin or folder: \`{ "op": "move", "id": "<id>", "to": { "space": "Research", "path": ["Reading"] }, "position": "top" }\`

**remove** removes a pin or folder (\`"keepContents": true\` moves a folder's contents up a level).
Removing a space removes everything in it; tabs stay open. Only remove things when the user asks.

**archive** \`{ "op": "archive", "id": "<pin or folder id>" }\` moves it to the Archive (its tab, if open,
stays open as a normal tab). **restore** \`{ "op": "restore", "id": "<id from archive.items>" }\` puts it
back in the same folder and position if they still exist, otherwise at the top of its space.
Spaces themselves can't be archived.

**addFavorites** \`{ "op": "addFavorites", "items": [ { "title": "Gmail", "url": "https://mail.google.com/" } ] }\`

**updateFavorite** \`{ "op": "updateFavorite", "id": "<id>", "title": "Gmail", "url": "https://...", "position": "first" }\`
renames a favorite, changes its URL, or moves it (\`"first"\`, \`"last"\` or an index). Its open tab stays attached.

**removeFavorite** \`{ "op": "removeFavorite", "id": "<id>" }\` (or \`"url"\`)

**undo** \`{ "ops": [ { "op": "undo", "command": "vector-dbs-1" } ] }\` reverses one earlier
command (the latest if \`command\` is omitted). Only that command's own changes are reversed:
what it added is removed, what it removed comes back, what it renamed or moved goes back.
Anything the user changed since is kept. If an item it needs to touch was changed since (for
example the user renamed a pin it added, or put their own pins into a folder it created), the
undo stops with \`"status": "conflict"\` and a list of those items. Tell the user. Add
\`"force": true\` to reverse everything else and leave the conflicting items as they are.
The last 20 commands can be undone.

## Guidelines

- Read \`state.json\` first. Reuse existing spaces and folders instead of making near-duplicates.
- Keep it tidy: short, human titles (not page titles full of " | Site name"); 3–7 folders per
  space; group by purpose (Start here, Docs, Tools, Examples, Discussion...).
- Prefer canonical, stable URLs (official docs, repos, papers) over search-result or tracking links.
- Put a sentence of context in \`note\` when it helps. The user sees it on hover.
- After writing a command, wait a few seconds and check \`processed/<same name>.result.json\`.
  If it's still in \`inbox/\` after ~10 seconds, Chrome is probably closed, or the folder needs
  permission again: tell the user to open the Snark sidebar and click once (it reconnects).
- Never write to \`state.json\` and never delete other files here.
`;

export const CLAUDE_MD = `See [AGENTS.md](AGENTS.md). This folder is the Snark agent bridge: read \`state.json\`, write commands to \`inbox/\`.
`;

export const SKILL_RESEARCH = `# Skill: research a topic into a Snark space

Use when the user says something like "research X and make me a space/folder for it".

1. Read \`../state.json\`. Is there already a space or folder for this topic? If so, add to it
   (\`addItems\`, or \`createSpace\` with \`"ifExists": "merge"\`).
2. Research. Collect 10–30 high-quality links. For each, keep a short title and a one-line note.
3. Organize into 3–6 folders, e.g. **Start here**, **Concepts**, **Docs & tools**, **Tutorials**,
   **Case studies**, **Discussion**. Put the 1–3 best overview links at the top of the space, outside folders.
4. Pick an emoji icon and a theme that fit the topic.
5. Write one command file to \`../inbox/\` with a single \`createSpace\` op containing everything.
6. Check \`../processed/\` for the result and tell the user what you added: space name,
   folder names and link count, plus anything that failed.
`;

export function schemaJson() {
  const item = {
    oneOf: [
      { type: 'object', required: ['pin', 'url'], properties: { pin: { type: 'string' }, url: { type: 'string', format: 'uri' }, note: { type: 'string' } } },
      { type: 'object', required: ['folder'], properties: { folder: { type: 'string' }, items: { type: 'array', items: { $ref: '#/$defs/item' } } } },
    ],
  };
  const op = (name, props, required = []) => ({
    type: 'object', required: ['op', ...required], properties: { op: { const: name }, ...props },
  });
  const space = { oneOf: [{ type: 'string' }, { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } }] };
  const style = { icon: { type: 'string' }, theme: { enum: THEME_KEYS }, color: { enum: COLORS } };
  const position = { enum: ['top', 'bottom'] };
  return JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Snark agent command',
    description: 'Generated by Snark. Drop files matching this schema into inbox/.',
    type: 'object',
    required: ['ops'],
    properties: {
      id: { type: 'string' },
      summary: { type: 'string' },
      ops: {
        type: 'array', minItems: 1,
        items: {
          oneOf: [
            op('createSpace', { title: { type: 'string' }, ...style, ifExists: { enum: ['error', 'merge'] }, position, items: { type: 'array', items: { $ref: '#/$defs/item' } } }, ['title']),
            op('addItems', { space, path: { type: 'array', items: { type: 'string' } }, position, createSpace: { type: 'boolean' }, createPath: { type: 'boolean' }, items: { type: 'array', items: { $ref: '#/$defs/item' } } }, ['space', 'items']),
            op('updateSpace', { space, title: { type: 'string' }, ...style }, ['space']),
            op('update', { id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } }, ['id']),
            op('move', { id: { type: 'string' }, to: { type: 'object', properties: { space, path: { type: 'array', items: { type: 'string' } } }, required: ['space'] }, position }, ['id', 'to']),
            op('remove', { id: { type: 'string' }, keepContents: { type: 'boolean' } }, ['id']),
            op('archive', { id: { type: 'string' } }, ['id']),
            op('restore', { id: { type: 'string' } }, ['id']),
            op('addFavorites', { items: { type: 'array', items: { type: 'object', required: ['url'], properties: { title: { type: 'string' }, url: { type: 'string' } } } } }, ['items']),
            op('updateFavorite', { id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, position: { oneOf: [{ enum: ['first', 'last'] }, { type: 'integer', minimum: 0 }] } }, ['id']),
            op('removeFavorite', { id: { type: 'string' }, url: { type: 'string' } }),
            op('undo', { command: { type: 'string' } }),
          ],
        },
      },
    },
    $defs: { item },
  }, null, 2);
}
