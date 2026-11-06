# Security

## Reporting a problem
Please report security issues privately using GitHub's **"Report a vulnerability"** option (the
Security tab of this repository), not a public issue. Include steps to reproduce if you can.

## Design notes
- **No remote code.** Everything Snark runs ships in the extension package. The only network
  requests it can make are image requests for site icons, and Google's favicon service is only
  contacted when you turn that option on.
- **No host permissions.** Snark doesn't ask for access to the websites you visit. The Copy URL toast
  uses `activeTab`, which only applies to the tab you're on and only after you press the shortcut.
- **HTML is escaped.** Titles, URLs and notes are escaped before they're put into the sidebar's HTML.
- **Agent folder trust model.** If you connect an agent folder, any program that can write to that
  folder can change your Snark data: add, move, rename or archive pins and spaces. Safeguards:
  - you pick the folder explicitly, and can disconnect it at any time
  - commands only accept `http(s)` links (no `javascript:`, `file:` or `data:` URLs)
  - commands are all or nothing, every change is logged in `activity.log`, and each one can be undone
  - commands are only processed while a Snark sidebar is open

  Only connect a folder that you, and programs you trust, can write to.
