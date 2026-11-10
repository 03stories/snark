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
• **Search Snark (⌘⇧K).** A search box centered over the page. Type a few letters to find any pin, folder or tab; Snark opens it and shows you where it lives.
• **Favorites.** A row of icons for the sites you live in, shared by every space and window.
• **Today.** Each space keeps its unpinned tabs below the line. New tabs join the space you're in.
• **Auto-clear and Archive.** Tabs you haven't touched in a day close on their own, and archived pins and folders empty after a timer you choose. Everything goes to the Archive first, so you can restore it.
• **Copy URL** with ⌘⇧C (Ctrl+Shift+C), with a little toast. Optionally strips tracking parameters.
• **Backup** to a JSON file, and restore it on any computer.
• **For power users: an agent folder.** Point Snark at a local folder and an AI agent (or a script) can read your spaces and add or organize pins through plain JSON files, with every change undoable. It keeps working while the sidebar is closed.

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
| `scripting`, `activeTab` | Only after you press one of Snark's shortcuts, on the tab you're on: show a small "Copied URL" toast, or show the Search Snark box over the page (an iframe of the extension's own search page, removed when you close it). |
| `offscreen`, `clipboardWrite` | Write the copied URL to your clipboard. **Only if the user connects a local agent folder**, the same offscreen document stays open to keep that folder (a File System Access handle) available, so it can write `state.json` and read command files while the sidebar is closed. Without an agent folder it's only opened briefly for clipboard writes. See the reviewer note below. |

No host permissions. No remote code.

**Web accessible resources:** `search/search.html` and the modules it loads, so the search box can be shown over the current page in an iframe. It shows nothing unless the extension opened it, using a one-time token checked by the background script, so other sites can't embed it.

## Note for reviewers: the offscreen document (put in "Notes for reviewer" / justification)
Snark creates one offscreen document with reasons `CLIPBOARD` and `BLOBS`.
- **For everyone:** it writes the copied tab URL to the clipboard (Copy URL shortcut).
- **Only if the user explicitly connects a local "agent folder"** (Settings → Agent folder → Choose folder): it stays open to hold that folder. The folder is a File System Access directory handle the user picked. The document writes `state.json` / `activity.log` and reads JSON command files from `inbox/`, then passes them to the service worker to apply.
  - Chrome drops File System Access permission when an extension's last page closes. Keeping this document open is what lets the user grant access once per browser session, instead of every time they open the side panel.
- No remote code, no network access, and no other APIs are used. It closes again when the user disconnects the folder.

There's no offscreen reason specifically for file-system access, which is why this is explained here. If the review objects, the fallback is the previous behavior (sync only while the side panel is open).

## Privacy practices (data-use form)
- **Data handled:** "Web history" (the titles and URLs of your tabs) and "Website content" (site icons).
- **Use:** used only for the extension's single purpose, stored locally, and never sold or transferred.
- **Optional, off by default:** when "Fill in icons from Google's favicon service" is turned on, the domain of a site you haven't opened yet is sent to Google to fetch its icon.
- **Optional:** if you connect an agent folder, your spaces, pins and open-tab URLs are written to that local folder.
- **Privacy policy URL:** link to `PRIVACY.md` on GitHub, or a GitHub Pages copy of it.

## Images (in `store/`, 24-bit PNG, no alpha)
Upload in this order. They're built from Snark's real sidebar and search UI with demo data; see `tools/store/README.md` to rebuild them.

| File | Slot | What it says |
|---|---|---|
| `screenshot-1-overview.png` | Screenshot 1 (1280×800) | "Your tabs, bookmarked, in spaces." The sidebar you miss, in the browser you already use. |
| `screenshot-2-spaces.png` | Screenshot 2 | "Swipe between spaces. Feel organized." Each space is a real tab group. |
| `screenshot-3-pinned.png` | Screenshot 3 | "Pinned tabs that actually stay pinned." Wander off; one click back. |
| `screenshot-4-search.png` | Screenshot 4 | "⌘K. Because you have 214 tabs." Search that shows you where you put it. |
| `screenshot-5-agent.png` | Screenshot 5 | "Hand the mess to your AI." The agent folder, as a three-step story. |
| `promo-440x280.png` | Small promo tile | Snark · "Tabs, tamed. Mostly." |
| `marquee-1400x560.png` | Marquee (optional) | Headline 1 with the sidebar. |

## Still to do in the dashboard
- [ ] Support URL: GitHub Issues
