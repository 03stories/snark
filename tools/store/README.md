# Store images

The Chrome Web Store screenshots, promo tile and marquee in `store/` are designed scenes built
around Snark's **real** sidebar and search UI, running on made-up demo data (`demo.mjs`: no real
brands, nobody's real tabs).

1. **Snapshot the UI.** `snap.mjs` runs `sidepanel/sidepanel.js` (or `search/search.js`) in jsdom
   against the demo data with a mocked `chrome.*`, puts it in each state the images need, and saves
   the markup to `store/src/snaps/`.
   ```
   npm i --no-save jsdom
   for s in work home side drift found agent search; do node tools/store/snap.mjs $s; done
   ```
2. **Compose.** `compose.mjs` lays the snapshots into 1280×800 / 440×280 / 1400×560 artboards
   (browser frame, headlines, hand-drawn callouts), styled with the extension's own CSS scoped
   per instance, and writes `store/src/graphics.html` (+ `graphics.css`, `graphics.js`).
   ```
   node tools/store/compose.mjs
   ```
3. **Render and capture in real Chrome.** Open `graphics.html` in Chrome (any http(s) host).
   `#a1`…`#a5`, `#tile` and `#marquee` show one artboard alone, 1:1, at the top-left on magenta;
   `#marquee-x0` / `#marquee-x1` show its left and right halves. Screenshot each.
4. **Crop to spec.** `crop.py` finds the artboard on the magenta, resizes to the exact store size
   and saves a 24-bit PNG (no alpha):
   ```
   python3 tools/store/crop.py capture.png store/screenshot-1-overview.png 1280 800
   python3 tools/store/crop.py left.png+right.png store/marquee-1400x560.png 1400 560
   ```
