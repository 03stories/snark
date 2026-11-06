<img src="icons/icon128.png" width="64" alt="Snark icon" align="left">

# Snark

**Spaces, pinned tabs and nested folders in Chrome's side panel.**
The best part of a browser that was promised to be free forever, now for the one you already use.

Private by design: no account, no analytics, no servers. See [PRIVACY.md](PRIVACY.md). Changes are in [CHANGELOG.md](CHANGELOG.md). License: [MIT](LICENSE).

## Install / reload

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Click the toolbar icon to open the sidebar. Pin the icon in the toolbar so it's always there.
4. After you edit any file, click the reload icon on the extension's card. Close and reopen the sidebar to pick up changes to the sidebar itself.

**⌘B** (Ctrl+B on Windows/Linux) opens and closes the sidebar. Settings and the Archive open from the bottom bar (⚙ and 🗄) as their own screens; click a space icon or press Esc to go back.

**Moving the folder:** the manifest's `key` gives Snark a fixed ID (`ehphddjhccoiekiolhdhjcngcilbhijl`). But **removing an extension in Chrome deletes its data**, so before moving or re-adding the folder, export a backup: **⚙ → Backup → Export**. Then click **Load unpacked** and choose the new folder; with the same ID, Chrome should update the existing install. If Chrome adds a second copy instead, remove the old one, then use **Import** and choose your agent folder again. Export and Import are also how you move to another computer or Chrome profile.

## The sidebar

```
[Gmail][Cal][…]           ← Favorites: saved, shared by every space and window
┌────────── Work ─────────┐ ← one page per space; swipe sideways to switch
 💼 Work                   ← space = a Chrome tab group (matched by name)
   Team dashboard              ← pinned tab (open, or greyed out when closed)
   ▾ Repos                     ← folder (nest as deep as you like)
      Open PRs
      ↳ Release checklist      ← ↳ = you navigated away; hover to see the pinned URL
 ─────────────── ↓ Clear
 ＋ New Tab
   Weekly notes                ← Today: this space's unpinned tabs
 NOT IN A SPACE · 1
   Hacker News                 ← ungrouped tabs (any page)
└─────────────────────────┘
  🗄 ⚙   💼  🏠  📚    ＋        ← Archive · Settings · space icons · new space
```

### Favorites
- The icon row at the top is the same in every space and every window.
- Clicking a favorite focuses its tab in this window, or opens it as a Chrome-pinned tab.
- **Adding:** right-click a tab or pin → *Add to Favorites*, or drag it into the row.
- **Reordering:** drag favorites within the row.
- **Favorite menu:** replace URL with current page, close tab (keep favorite), remove.
- Chrome-pinned tabs that aren't favorites still show, dimmed.

### Spaces
- **Each space is one Chrome tab group with the same name, shown as its own page.**
  - Swipe sideways with two fingers, click an icon in the bottom bar, or use the *next/previous space* shortcuts to switch.
  - Each space gets its own **gradient theme**, and the colors blend as you swipe.
  - Chrome groups you haven't pinned anything into still appear as spaces.
- **Switching spaces:**
  - It jumps to the tab you last used in that space.
  - It collapses the other spaces' groups in Chrome's tab strip. You can turn this off in settings.
  - Activating a tab from another space, from Chrome's strip or anywhere else, moves the sidebar to that space.
- **New tabs join the space you're in.** That covers ⌘T, ＋ New Tab and restored tabs. Links opened from a grouped tab already land in its group. You can turn this off in settings.
- **Space menu** (right-click the space name, or use ⋯):
  - Rename (also renames the Chrome group)
  - Icon (type an emoji; leave it empty to show the first letter)
  - Theme
  - Tab group color
  - New folder
  - Open all / close all pinned
  - Move left / right
  - Remove (asks for confirmation first)

### Pinned tabs
- **Pinned URL never changes when you browse.** You can navigate freely inside a pinned tab. When you close it (with **—**, ⌘W, or anything else), the pin stays, and clicking it again reopens the original pinned URL.
- **Right-click a pin, or use its ⋯ button, to:**
  - **Duplicate**, **Open in Split** (side by side with your current tab, Chrome 155+), or **Open in Window**. Each makes a copy and leaves the pin as it is.
  - Rename it (the label stays even when the page title changes)
  - **Replace pinned URL with current page**
  - **Edit pinned URL…**
  - Go back to the pinned URL
  - Move it to another space
  - Close the tab but keep the pin
  - Unpin
- Double-click any name to rename it.
- Pinned tabs sit at the top of their Chrome tab group, in sidebar order. You can turn this off in settings.

### Folders and drag and drop
- Right-click a folder for: open all, close all, new folder inside, rename, move to another space, and delete. Deleting a folder keeps its contents.
- **Drag and drop:**
  - Reorder pins and folders.
  - Drop on the middle of a folder to put the item inside it.
  - Drag a tab from Today into the tree to pin it.
  - Drag a pin to Today to unpin it.
  - Drag a pin to "Not in a space" to take it out of the space completely.
  - **Drop anything on a space icon in the bottom bar** to move it to that space.
  - **Hover over a space icon while dragging** to switch to that space and drop it precisely.
- Dragging a pinned tab into another group in Chrome's own tab strip moves its pin to that space.

### Today and auto-clear
- **Today**, below the line on each page, lists that space's unpinned tabs.
- **↓ Clear** closes them all except the tab you're on.
- **Auto-clear** closes unpinned tabs you haven't looked at in a while: 24 hours by default, adjustable in ⚙.
  - It never closes Chrome-pinned tabs, the active tab, or tabs playing audio.
  - Its timer restarts when you turn the feature on, start the browser, or update the extension.
- Closed tabs go to the Archive page's **Closed tabs** list.

### Archive
- **One global Archive**: click 🗄 in the bottom bar to open it (click again, press Esc or pick a space to go back).
- **Archiving:** right-click a pin or folder → **Archive**, or drag it (or a tab) onto 🗄.
- **The list:** items are shown newest first, with a subtle label for the space they came from. ↩︎ **Restore** puts an item back exactly where it was.
- **Clearing:** set **Empty after** (Never / 1 day / 1 week / 1 month) at the top of the page. It applies to both put-away items and closed tabs. **Clear now** empties everything after asking.

### Opening the sidebar
- Click the toolbar icon, or press **⌘B** / **Ctrl+B** ("Open or close the Snark sidebar"). You can change the key at `chrome://extensions/shortcuts`. Note that while it's set to ⌘B, websites like Gmail or Google Docs won't get ⌘B for **bold**.
- To put the sidebar on the left, set **Side panel → Show on left** at `chrome://settings/appearance`.
- Chrome only lets extensions open the side panel after you click or press a shortcut. Chrome normally keeps the panel open in a window once you've opened it, and brings it back when it restores your windows.

## Agent folder (let Claude edit Snark)

1. ⚙ → **Agent folder** → **Choose folder…** and pick a folder, e.g. `~/Desktop/Snark-data`.
2. Snark writes `AGENTS.md`, `state.json` and the `inbox/`, `processed/` and `skills/` folders into it.
3. Give Claude, or any agent, access to that folder and ask it to do things like "research vector databases and make me a space".
   - It reads `state.json` and writes a command file to `inbox/`.
   - Snark applies it within a couple of seconds while Chrome is running, even with the sidebar closed, and shows a notice with **Undo** in the sidebar.
   - The command, its result and a log line stay in the folder, so you can always see what changed.

`AGENTS.md` describes the format and rules; edit it or add recipes to `skills/` to shape how agents work. Chrome asks for folder permission again after a restart; your first click in the sidebar reconnects it (choose **Allow on every visit** if offered). Until then, commands wait in `inbox/`. While Chrome is open, a small hidden page keeps the folder connected, so closing and reopening the sidebar doesn't ask again.

## Copy URL
- **⌘⇧C** copies the current tab's URL and shows a toast.
- **Copy as Markdown link** has no default shortcut, because Chrome rejects Ctrl+Alt combinations. Assign one at `chrome://extensions/shortcuts`; ⌘⇧L is one option.
- Optional setting: strip tracking parameters (`utm_*`, `fbclid`, …) from copied URLs.

## Development

```
npm test           # unit tests (Node 20+)
npm run package    # dist/snark-<version>.zip for the Chrome Web Store (strips "key", checks references)
npm run icons      # regenerate icons/ from tools/make-icons.py (Pillow + numpy)
```

```
background.js          service worker: opens the sidebar from the toolbar, loads feature modules
features/registry.js   feature list + settings (drives the ⚙ reveal)
features/*.js          one file per feature (copy-url, group-pins, auto-clear, _template)
core/tree.js           spaces/folders/pins data model + tab-group actions
core/archive.js        Recently cleared
core/favorites.js      Favorites row
core/agent-ops.js      agent command engine (ops, validation, undo)
core/agent-folder.js   agent folder sync (File System Access: state.json, inbox → processed, log)
core/agent-templates.js AGENTS.md / CLAUDE.md / skill / schema written into the agent folder
core/backup.js         Export / Import
core/settings.js       feature settings (chrome.storage.sync)
core/clipboard.js      offscreen-document clipboard writes
core/toast.js          on-page toast
sidepanel/             the sidebar UI (sidepanel.js) + gradient themes (themes.js)
tests/                 unit tests: tree model, agent commands, inbox processing, archive, icons (npm test)
tools/                 package.mjs (store zip), make-icons.py, make-promo.py
store/                 store listing images (not shipped in the extension)
docs/                  PUBLISHING.md checklist, STORE_LISTING.md draft
```

**Where data is stored:**
- Pins and folders: `chrome.storage.local` → `tree`.
- Which tab belongs to which pin: `chrome.storage.session` → `pinLinks`. These are cleared on restart, and open tabs are matched back to pins by URL.
- Favorites: `chrome.storage.local` → `favorites`. Each window's favorite tabs: `chrome.storage.session` → `favLinks`.
- Per-space theme and icon: on the space's folder in `tree` (`theme`, `icon`).
- Which space each window is in: `chrome.storage.session` → `activeSpace`. New tabs use this to pick a space.
- Feature settings: `chrome.storage.sync`.

Run `npm test` (Node 20+). It tests the pure tree operations: moving, nesting, deleting and migration.

### Adding a tweak
1. Copy `features/_template.js`.
2. Add a metadata entry to `features/registry.js`. Settings can be `boolean` or `select`.
3. Import the new file in `background.js` and add it to `modules`.
4. If it needs a shortcut, add a `commands` entry to `manifest.json`. Chrome allows at most 4 suggested keys, and none can combine Ctrl+Alt.
