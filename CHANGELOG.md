# Changelog

## 1.4.0 — Search, centered over the browser

- **Search Snark now opens centered over the page** you're on (⌘⇧K / Ctrl+Shift+K), with the page dimmed behind it, instead of inside the sidebar.
- **⌘K, / and 🔍 in the sidebar open it as a small window** centered over the browser window. Pages extensions can't draw on also get the window: New Tab, `chrome://` pages and the Web Store.
- **Picking a result opens the sidebar if it's closed** and shows the result there: its space, its folders expanded, scrolled to and highlighted.
- Recent picks are now kept in Snark's storage, so they're the same wherever search opens.

## 1.3.0 — ⌘K search

- **Search everything with ⌘K** (Ctrl+K) in the sidebar, **/**, or 🔍 in the bottom bar. It covers pins, folders, spaces, favorites, open tabs, the Archive and closed tabs. It matches titles, folder paths, URLs and notes, and forgives small typos.
- **↵ opens the result and shows it in the sidebar.** The sidebar jumps to its space, expands its folders, scrolls to it and highlights it. **⌘↵** only shows it.
- With nothing typed, the palette lists your recent picks and your spaces. It can also run a few actions: Open Settings, Open Archive, New space, Pin current tab.
- **New shortcut: ⌘⇧K / Ctrl+Shift+K ("Search Snark")** opens the sidebar straight into search from any page.

## 1.2.0 — The agent folder keeps working with the sidebar closed

- **Agent folder sync moved to the background.** A hidden offscreen page holds the folder and the background script applies commands. That page only exists while an agent folder is connected.
  - Commands dropped into `inbox/` are applied, and `state.json` stays current, **while the sidebar is closed**, as long as Chrome is running.
  - **Reconnect should only be needed once per Chrome restart**, not every time you open the sidebar. Chrome drops folder permission when an extension's last page closes; the hidden page keeps one open. This is experimental, so please report if it still asks.
- AGENTS.md v7 reflects this. Unedited copies upgrade automatically.

## 1.1.0

- **⌘B / Ctrl+B opens and closes the sidebar.** You can change it at `chrome://extensions/shortcuts`. While it's ⌘B, web apps don't receive ⌘B (bold).
- **Archive and Settings are their own screens**, opened from 🗄 and ⚙ in the bottom bar. Click again, press Esc, or pick a space to go back.
  - The Archive is no longer a page you swipe to.
  - Settings are no longer a popup.

## 1.0.0 — First public release

- **Spaces** you swipe between in Chrome's side panel. Each one is a Chrome tab group with its own icon, gradient theme and color. Switching brings back your last tab and folds the other spaces' groups away.
- **Pinned tabs** whose URL stays put while you browse, with Duplicate, Open in Split, and Open in Window.
- **Nested folders**, and drag and drop everywhere.
- **Favorites** shared across every space and window.
- **Today:** each space's unpinned tabs. New tabs join the space you're in.
- **Archive:** one place for put-away pins and folders, and for closed tabs. Items can be restored to where they came from, and the Archive empties on a timer you choose.
- **Auto-clear** of idle tabs (24 h by default).
- **Copy URL** (⌘⇧C / Ctrl+Shift+C), with a toast and optional tracking-parameter stripping.
- **Backup:** export to and import from JSON.
- **Agent folder:** a local folder where an AI agent or script can read `state.json` and send JSON commands. Commands are applied all or nothing, each one is logged, and it can be undone without touching your later edits.
- Privacy first: no account, no analytics, no servers. Google favicon lookups are off by default.
