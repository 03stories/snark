# Working on Snark

Snark is a Manifest V3 Chrome extension for spaces, pinned tabs, nested folders, favorites, and archive in the Chrome side panel. The extension uses plain JavaScript ES modules, HTML, and CSS and runs directly from the source tree. See [README.md](README.md) for product behavior and development setup.

## Branches and pull requests

- Start each change on a dedicated branch based on `origin/main`. Use the `codex/` prefix for branches created by Codex. Continue on the existing branch when following up on the same pull request.
- Open a pull request into `main` for every change, including documentation and release preparation. Keep commits on the work branch and merge through the pull request so the review and change history stay visible.

## Release versioning

- Use a patch bump for user-facing fixes and small refinements. Use a minor bump for substantial new features or workflow changes. Keep the current version for documentation and sample-data changes.
- Set the release version in `manifest.json` and add a matching `## <version>` section to `CHANGELOG.md` in the release pull request. A short title after the version is optional. Write concise, user-facing bullets in order of impact. Describe what people will notice and include any steps they need to take. These bullets can also be adapted for the Chrome Web Store listing description.
- CI checks the changelog entry for the manifest version and uploads the ZIP as a workflow artifact for pull requests and pushes to `main`. For a deliberate GitHub Release, tag the merged release commit `v<version>` using the manifest version. The tag build uses that changelog section for the release notes and attaches the ZIP. Chrome Web Store listing edits and submissions are separate steps.

## Development and checks

- Load the repository root via **Load unpacked** in `chrome://extensions` with Developer mode on. Use a separate Chrome profile for `Snark (dev)` to avoid sharing tab groups and shortcuts with the store install. After editing, reload the extension and reopen the sidebar.
- Run `npm test` with Node 20 or newer. CI uses Node 22 and checks JavaScript syntax with `node --check`. The unit tests use Node’s built-in test runner and require no dependency install.
- Run `npm run package` for changes that affect shipped files or references. It validates the runtime files and writes `dist/snark-<version>/` and `dist/snark-<version>.zip`. The packaged manifest drops the dev name suffix and the stable unpacked `key`. Keep `dist/` out of commits.
- Smoke-test changes involving Chrome APIs, shortcuts, or UI in the unpacked extension. Use the dev profile for backup import tests. Import replaces saved Snark data, so export first if the profile contains anything you want to keep.

## Code map

- `manifest.json` defines permissions, shortcuts, and extension entry points. `background.js` is the service worker. Register its event listeners synchronously so they are available on every worker start.
- `sidepanel/` owns the sidebar and themes. `features/group-pins.js` manages tab-group behavior and `features/auto-clear.js` handles tab cleanup and archive retention. For a configurable feature, start with `features/_template.js`, add settings metadata in `features/registry.js`, and wire it into `background.js`.
- `core/tree.js` owns spaces, folders, pins, and their Chrome tab-group operations. Use `spaceRoots()` to exclude the reserved Archive root and `mutate()` for tree read-modify-write operations. `core/archive.js` handles the separate closed-tab list.
- `core/search.js` builds and ranks search entries. `search/` owns the palette UI, data, and actions. `features/search-launcher.js` handles opening the palette and routing picks to the sidebar.
- `core/agent-snapshot.js` builds the agent folder’s `state.json`. `core/agent-folder.js` handles files and scaffolding, `offscreen/` keeps the chosen folder connection alive, and `features/agent-host.js` routes commands to `core/agent-ops.js` for validation, application, and undo. The `AGENTS.md` template in `core/agent-templates.js` documents that user-facing bridge. Keep the generated schema and usage instructions aligned with command changes.

## Data and privacy

- Spaces are matched to Chrome tab groups by title. The saved tree is a flat array whose order determines sibling order. A pin’s saved URL stays fixed during navigation. Persistent tree, favorites, and archive data use `chrome.storage.local`. Live tab links and per-window active space use `chrome.storage.session`. Feature settings use `chrome.storage.sync`.
- Preserve compatibility with existing saved data and JSON backups when changing the model. `core/backup.js` exports local data and settings. Session tab links are rebuilt after import or restart.
- Keep the extension free of remote code and broad host permissions. Preserve the search page’s one-time launch token and escape user-controlled values inserted as HTML. Review [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) when changing permissions, network behavior, or data handling.
