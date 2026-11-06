# Chrome Web Store listing (draft)

## Name (max 75 characters)
Snark — Spaces & pinned tabs in your side panel

## Summary (max 132 characters; this is also the manifest description)
Spaces, pinned tabs and nested folders in your side panel. Swipe between workspaces; stale tabs tidy themselves away.

## Category
Productivity → Workflow & Planning (or Tools)

## Description

The best part of a browser that was promised to be free forever, now for the one you already use.

Snark turns Chrome's side panel into a calm home for your tabs:

• **Spaces you swipe between.** Each one is a Chrome tab group with its own colors, icon and gradient. Switching spaces brings back the tab you were on and folds the others away.
• **Pinned tabs that stay put.** Browse freely inside a pinned tab. Close it, and clicking the pin brings you back to the page you pinned. Rename pins so they keep your label even when the page title changes.
• **Nested folders.** Organize pins as deep as you like, and drag and drop everything.
• **Favorites.** A row of icons for the sites you live in, shared by every space and window.
• **Today.** Each space keeps its unpinned tabs below the line. New tabs join the space you're in.
• **Auto-clear and Archive.** Tabs you haven't touched in a day close on their own, and archived pins and folders empty after a timer you choose. Everything goes to the Archive first, so you can restore it.
• **Copy URL** with ⌘⇧C (Ctrl+Shift+C), with a little toast. Optionally strips tracking parameters.
• **Backup** to a JSON file, and restore it on any computer.
• **For power users: an agent folder.** Point Snark at a local folder and an AI agent (or a script) can read your spaces and add or organize pins through plain JSON files, with every change undoable.

Private by design: no account, no analytics, no servers. Everything is stored in your browser, or in a folder you choose.

## Single purpose (dashboard field)
Organize and switch between tabs in Chrome's side panel: spaces (tab groups), pinned tabs, folders and favorites, plus related tab housekeeping (auto-clear, archive, copy URL).

## Permission justifications
| Permission | Why |
|---|---|
| `tabs` | Read tab titles and URLs to show, pin and organize your tabs in the side panel. |
| `tabGroups` | Each space is a Chrome tab group: create, rename, color and collapse groups. |
| `storage` | Save your spaces, pins, favorites and settings in your browser. |
| `sidePanel` | The whole interface lives in Chrome's side panel. |
| `contextMenus` | "Pin tab to sidebar" on the page and toolbar right-click menus. |
| `alarms` | Run auto-clear and Archive cleanup periodically. |
| `favicon` | Show site icons next to pins and favorites. |
| `scripting`, `activeTab` | Show a small "Copied URL" toast on the page you're on, only after you press the shortcut. |
| `offscreen`, `clipboardWrite` | Write the copied URL to your clipboard. |

No host permissions. No remote code.

## Privacy practices (data-use form)
- **Data handled:** "Web history" (the titles and URLs of your tabs) and "Website content" (site icons).
- **Use:** used only for the extension's single purpose, stored locally, and never sold or transferred.
- **Optional, off by default:** when "Fill in icons from Google's favicon service" is turned on, the domain of a site you haven't opened yet is sent to Google to fetch its icon.
- **Optional:** if you connect an agent folder, your spaces, pins and open-tab URLs are written to that local folder.
- **Privacy policy URL:** link to `PRIVACY.md` on GitHub, or a GitHub Pages copy of it.

## Assets still needed
- [ ] Icon 128×128 (plus 16/32/48 in the package)
- [ ] 1–5 screenshots, 1280×800
- [ ] Small promo tile, 440×280
- [ ] Support URL: GitHub Issues
