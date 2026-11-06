# Snark privacy policy

_Last updated: November 5, 2026_

Snark is a Chrome extension that organizes your tabs into spaces, pinned tabs, folders and favorites
in Chrome's side panel. It is built to work entirely on your own computer.

## The short version
- **No account, no analytics, no ads, no servers.** Snark has no backend. The developer never receives your data.
- Everything Snark saves stays **in your browser** (Chrome's extension storage) or in a **folder you choose**.
- Nothing is sold or shared, and nothing is used for anything except the features described here.

## What Snark reads
To show and organize your tabs, Snark reads the **titles, URLs and icons of your open tabs** and your
**tab groups**. It does not read the content of web pages. The only exception is the "Copied URL" toast,
which briefly adds a small label to the page you're on after you press the Copy URL shortcut, and then removes it.

## What Snark stores, and where
In Chrome's extension storage, on your computer:
- your spaces, folders, pinned tabs (title and URL) and favorites
- the Archive (items you put away, and recently closed tabs)
- remembered site icons for pages you've opened
- your settings

Chrome may sync your **settings** (not your pins) across your signed-in Chrome browsers via Chrome Sync,
if you use it.

## Optional features that involve something outside the extension
- **Site icons.** For pages you've opened, Snark shows the site's own icon, which your browser loads from
  that site, just as the page itself does. No other data is sent.
- **Google favicon lookup (off by default).** If you turn on "Fill in icons for sites you haven't opened
  yet", Snark asks Google's public favicon service for the icon of a site you haven't opened yet. That
  request includes the site's domain name (for example `example.com`), but no full URLs or other data.
- **Agent folder (off until you set it up).** If you connect a folder, Snark writes a copy of your spaces,
  pins, favorites and the titles/URLs of open tabs to `state.json` in that folder, and reads command files
  that you, or a program you run, put there. The folder is on your computer and stays under your control.
- **Backup / Export.** Creates a JSON file in your Downloads folder when you ask. It goes nowhere else.

## Your control
- Turn features on or off in Snark's settings (⚙).
- Disconnect the agent folder at any time (⚙ → Agent folder → Disconnect).
- Removing the extension deletes everything it stored in Chrome. Files you exported, and your agent
  folder, stay where you put them.

## Contact
Questions or concerns: open an issue on the project's GitHub repository.
