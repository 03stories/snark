// Builds store/src/graphics.html: the Chrome Web Store graphics, laid out around Snark's real UI
// (snapshots from snap.mjs, styled with the extension's own CSS, scoped per instance).
//
//   node tools/store/compose.mjs
// Open graphics.html#a1 … #marquee to see one artboard at 1:1 at the top-left (for capture);
// with no hash it shows them all, scaled to fit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monogram } from './icons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '../..');
const read = (p) => fs.readFileSync(path.join(EXT, p), 'utf8');
const snap = (name) => JSON.parse(read(`store/src/snaps/${name}.json`));
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(EXT, 'icons/icon128.png')).toString('base64')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- scope the extension's CSS
function scopeSel(sel, scope) {
  const s = sel.trim();
  if (!s) return null;
  if (/^(html|body|:root|html:root)$/.test(s) || s === 'html, body') return scope;
  if (/\bhtml\b/.test(s) && /data-mode/.test(s)) return null; // search page's own frame/window modes
  if (/^body\s/.test(s)) return `${scope} ${s.replace(/^body\s+/, '')}`;
  if (s === '*') return `${scope}, ${scope} *`;
  return `${scope} ${s}`;
}
function scopeCss(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith('@media')) {
      if (!/prefers-color-scheme:\s*dark/.test(head)) out += `${head}{${scopeCss(body, scope)}}\n`; // light mode only
    } else if (head.startsWith('@keyframes')) {
      out += `${head}{${body}}\n`;
    } else {
      const sels = head.split(',').map((x) => scopeSel(x, scope)).filter(Boolean);
      if (sels.length) out += `${sels.join(',')}{${body}}\n`;
    }
    i = j;
  }
  return out;
}
const SB_CSS = scopeCss(read('ui/base.css') + read('sidepanel/sidepanel.css'), '.sb');
const SS_CSS = scopeCss(read('ui/base.css') + read('search/search.css'), '.ss');

// ---------------------------------------------------------------- building blocks
const GROUP = { blue: '#1a73e8', green: '#1e8e3e', orange: '#e8710a', purple: '#9334e6', grey: '#5f6368' };

function sidebar(name, { w = 300, h = 600, header = true, cls = '' } = {}) {
  const s = snap(name);
  return `<div class="sp ${cls}" style="width:${w}px;height:${h}px">
    ${header ? `<div class="sp-head"><img src="${ICON}" alt=""><span>Snark</span><i>▾</i><b>✕</b></div>` : ''}
    <div class="sb" style="${s.bodyStyle}">${s.html}</div>
  </div>`;
}

function searchBox() {
  const s = snap('search');
  return `<div class="ss" data-mode="frame">${s.html}</div>`;
}

function tabstrip(active, extra = []) {
  const fav = (host) => `<span class="bt pinned"><img src="${monogram(`https://${host}/`)}" alt=""></span>`;
  const tab = (t, host, on) => `<span class="bt${on ? ' on' : ''}"><img src="${monogram(`https://${host}/`)}" alt=""><em>${esc(t)}</em><u>✕</u></span>`;
  const chip = (t, c, open) => `<span class="chip${open ? ' open' : ''}" style="--c:${GROUP[c]}">${esc(t)}</span>`;
  const work = [
    ['Launch plan · Tidepool', 'plan.tidepool.app'],
    ...extra,
    ['Pricing page draft', 'docs.lumen.so'],
    ['Sprint 42 · Kanbo', 'board.kanbo.io'],
    ['How to write a changelog…', 'news.tidyweb.dev'],
  ];
  return `<div class="strip">
    <span class="lights"><i></i><i></i><i></i></span>
    ${fav('mail.postbox.app')}${fav('cal.dayline.app')}${fav('chat.hivechat.io')}
    ${chip('Work', 'blue', true)}<span class="grp" style="--c:${GROUP.blue}">${work.map(([t, h]) => tab(t, h, t === active)).join('')}</span>
    ${chip('Home', 'green')}${chip('Side project', 'orange')}
    <span class="newtab">+</span>
  </div>`;
}

function toolbar(url) {
  return `<div class="tools"><span class="nav">←</span><span class="nav">→</span><span class="nav">↻</span>
    <span class="omni"><span class="lock">⌁</span>${esc(url.replace(/^https:\/\//, ''))}</span>
    <span class="ext"><img src="${ICON}" alt=""></span><span class="avatar"></span></div>`;
}

function browser({ w, h, url, active, page, side, sideW = 300, overlay = '', extraTabs = [] }) {
  return `<div class="win" style="width:${w}px;height:${h}px">
    ${tabstrip(active, extraTabs)}
    ${toolbar(url)}
    <div class="body">
      ${side ? sidebar(side, { w: sideW, h: h - 84 }) : ''}
      <div class="web">${page}${overlay}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- fake web pages (just enough to read as pages)
const lines = (n, widths = [96, 88, 92, 70]) => Array.from({ length: n }, (_, i) => `<i style="width:${widths[i % widths.length]}%"></i>`).join('');
const PAGE_LAUNCH = `<div class="doc">
  <div class="doc-crumbs">Tidepool › Projects › Q4</div>
  <h1>Q4 launch plan</h1>
  <div class="meta"><span class="pill blue">On track</span><span>Owner: Priya</span><span>Ships Nov 18</span></div>
  <h2>Goals</h2><div class="ln">${lines(3)}</div>
  <h2>Timeline</h2>
  <div class="tl"><div><b>Beta</b><span>Oct 6</span></div><div><b>Pricing final</b><span>Oct 27</span></div><div class="now"><b>Launch</b><span>Nov 18</span></div></div>
  <h2>Risks</h2><div class="ln">${lines(4)}</div>
</div>`;
const PAGE_PRICING = `<div class="doc">
  <div class="doc-crumbs">tidyweb.dev › reviews</div>
  <h1>Competitor pricing, compared</h1>
  <div class="ln">${lines(2)}</div>
  <div class="plans">${['Starter', 'Team', 'Business'].map((p, i) => `<div class="plan${i === 1 ? ' hot' : ''}"><b>${p}</b><strong>$${[0, 12, 29][i]}</strong><span>per seat / mo</span><div class="ln">${lines(4)}</div></div>`).join('')}</div>
  <div class="ln">${lines(3)}</div>
</div>`;
const PAGE_CHECKLIST = `<div class="doc">
  <div class="doc-crumbs">Lumen › Docs</div>
  <h1>Launch checklist</h1>
  <ul class="checks">${['Freeze pricing page', 'Changelog written (and readable)', 'Status page ready', 'Support macros updated', 'Tell sales before Twitter does', 'Celebrate, briefly'].map((t, i) => `<li class="${i < 3 ? 'done' : ''}"><i></i>${t}</li>`).join('')}</ul>
</div>`;

// ---------------------------------------------------------------- artboards
const H = (t) => `<h1 class="hl">${t}</h1>`;
const brand = `<div class="brand"><img src="${ICON}" alt=""><span>Snark</span></div>`;

const A1 = `<section class="ab a1" id="a1" style="width:1280px;height:800px">
  <div class="copy">
    ${brand}
    ${H('Your tabs, bookmarked, in spaces.')}
    <p class="lede">The sidebar you miss, in the browser you already use.</p>
    <ul class="points">
      <li><b>Spaces</b> are real Chrome tab groups, each with its own look.</li>
      <li><b>Pins</b> remember where they belong, even after you wander.</li>
      <li><b>Today</b> tidies itself. Yesterday’s tabs go to the Archive.</li>
    </ul>
    <p class="aside">No new browser required.</p>
  </div>
  <div class="stage" style="left:500px;top:52px">${browser({ w: 740, h: 696, url: 'https://plan.tidepool.app/launch-q4', active: 'Launch plan · Tidepool', page: PAGE_LAUNCH, side: 'work' })}</div>
</section>`;

const A2 = `<section class="ab a2" id="a2" style="width:1280px;height:800px">
  <div class="top">
    ${H('Swipe between spaces. Feel organized.')}
    <p class="lede">Each space is a real Chrome tab group, with its own color, icon and mood lighting.</p>
  </div>
  <div class="trio">
    ${[['work', 'Work', 'blue'], ['home', 'Home', 'green'], ['side', 'Side project', 'orange']].map(([n, t, c], i) => `
      <figure style="--i:${i}">
        ${sidebar(n, { w: 300, h: 520, header: false, cls: 'card' })}
        <figcaption><span class="dot" style="background:${GROUP[c]}"></span>${t} <em>= a tab group</em></figcaption>
      </figure>`).join('<div class="swipe"><span>⟵ ⟶</span><em>two-finger swipe</em></div>')}
  </div>
</section>`;

const A3 = `<section class="ab a3" id="a3" style="width:1280px;height:800px">
  <div class="copy">
    ${brand}
    ${H('Pinned tabs that actually stay pinned.')}
    <p class="lede">Wander off all you like. One click takes you back to where you meant to be.</p>
    <ul class="points">
      <li><b>Close the tab,</b> keep the pin.</li>
      <li><b>Liked where you ended up?</b> Make it the new pinned URL.</li>
      <li><b>Open in Split</b> or a new window from any pin.</li>
    </ul>
  </div>
  <div class="stage" style="left:500px;top:52px">${browser({ w: 740, h: 696, url: 'https://news.tidyweb.dev/competitor-pricing', active: 'Pricing page draft', page: PAGE_PRICING, side: 'drift' })}</div>
  <div class="callout" data-anchor='.row[data-id="pricing"]' data-side="left" data-bend="-1" style="--dx:-215px;--dy:178px">↳ you wandered.</div>
  <div class="callout" data-anchor='#menu .item:nth-of-type(7)' data-side="left" data-bend="1" style="--dx:-340px;--dy:50px">one click, and you’re back.</div>
</section>`;

const A4 = `<section class="ab a4" id="a4" style="width:1280px;height:800px">
  <div class="top">
    <div>
      ${H('<span class="keys"><kbd>⌘</kbd><kbd>K</kbd></span> Because you have 214 tabs.')}
      <p class="lede">Find any pin, folder or tab. Snark opens it and shows you where you put it.</p>
    </div>
  </div>
  <div class="stage" style="left:60px;top:196px">${browser({ w: 1160, h: 580, url: 'https://docs.lumen.so/launch-checklist', active: 'Launch checklist', extraTabs: [['Launch checklist', 'docs.lumen.so']], page: PAGE_CHECKLIST, side: 'found', overlay: searchBox() })}</div>
  <div class="callout" data-anchor='.sb .row[data-id="launchchk"]' data-side="right" data-bend="1" style="--dx:70px;--dy:150px">found it. it was in Q4 launch.</div>
</section>`;

const JSON_CMD = `{
  <k>"summary"</k>: <s>"Learning folder"</s>,
  <k>"ops"</k>: [{
    <k>"op"</k>: <s>"addItems"</s>,
    <k>"space"</k>: <s>"Work"</s>,
    <k>"path"</k>: [<s>"Learning"</s>],
    <k>"items"</k>: [
      { <k>"pin"</k>: <s>"Design systems, explained"</s>,
        <k>"url"</k>: <s>"https://wiki.fernhill.dev/…"</s> },
      <c>…5 more</c>
    ]
  }]
}`;
const A5 = `<section class="ab a5" id="a5" style="width:1280px;height:800px">
  <div class="top">
    ${H('Hand the mess to your AI.')}
    <p class="lede">Point Snark at a folder. Your agent reads your spaces and files tidy little requests. You keep the Undo button.</p>
  </div>
  <div class="flow">
    <div class="panel chat">
      <div class="step"><b>1</b> Ask your agent</div>
      <div class="bubble me">Round up the best design-system docs into Work › Learning.</div>
      <div class="bubble bot">On it. I read <code>state.json</code>, found six good ones, and dropped a request in Snark’s inbox.</div>
      <div class="file-chip">📄 inbox/learning.json</div>
      <div class="bubble me small">you’re the best</div>
    </div>
    <div class="arrow">→</div>
    <div class="panel files">
      <div class="step"><b>2</b> It’s just files</div>
      <div class="finder">
        <div class="finder-bar"><span class="lights"><i></i><i></i><i></i></span><span>Snark-data</span></div>
        <div class="f"><span>📘</span>AGENTS.md<em>how to talk to Snark</em></div>
        <div class="f"><span>📄</span>state.json<em>your spaces, read-only</em></div>
        <div class="f on"><span>📂</span>inbox<em></em></div>
        <div class="f in new"><span>📄</span>learning.json<em class="badge">new</em></div>
        <div class="f"><span>📁</span>processed<em>results</em></div>
        <div class="f"><span>📄</span>activity.log<em>every change, logged</em></div>
      </div>
      <pre class="code">${JSON_CMD}</pre>
    </div>
    <div class="arrow">→</div>
    <div class="panel result">
      <div class="step"><b>3</b> Snark applies it. You keep Undo.</div>
      ${sidebar('agent', { w: 300, h: 498, header: false, cls: 'card' })}
    </div>
  </div>
  <p class="foot">Plain files. No servers. Every change undoable.</p>
</section>`;

const TILE = `<section class="ab tile" id="tile" style="width:440px;height:280px">
  <img class="t-icon" src="${ICON}" alt="">
  <div class="t-name">Snark</div>
  <div class="t-tag">Tabs, tamed. Mostly.</div>
  <div class="t-spaces"><span style="--c:${GROUP.blue}">💼</span><span style="--c:${GROUP.green}">🏠</span><span style="--c:${GROUP.orange}">🎨</span><span style="--c:${GROUP.purple}">📚</span></div>
</section>`;

const MARQUEE = `<section class="ab marquee" id="marquee" style="width:1400px;height:560px">
  <div class="copy">
    ${brand}
    ${H('Your tabs, bookmarked, in spaces.')}
    <p class="lede">The sidebar you miss, in the browser you already use.</p>
  </div>
  <div class="stage" style="left:640px;top:64px">${browser({ w: 720, h: 620, url: 'https://plan.tidepool.app/launch-q4', active: 'Launch plan · Tidepool', page: PAGE_LAUNCH, side: 'work' })}</div>
</section>`;

const ARTBOARDS = [
  ['a1', '1 · Overview', 1280, 800], ['a2', '2 · Spaces', 1280, 800], ['a3', '3 · Pinned tabs', 1280, 800],
  ['a4', '4 · Search', 1280, 800], ['a5', '5 · Agent folder', 1280, 800], ['tile', 'Small promo tile', 440, 280], ['marquee', 'Marquee', 1400, 560],
];

// ---------------------------------------------------------------- page
const CSS = read('tools/store/graphics.css');
const html = `<title>Snark Store Graphics</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${CSS}
/* ---- Snark's own UI, scoped ---- */
${SB_CSS}
${SS_CSS}
</style>
<header class="gallery-head">
  <h1>Snark store graphics</h1>
  <p>Chrome Web Store images, built around the extension’s real interface with demo data. Add <code>#a1</code>…<code>#a5</code>, <code>#tile</code> or <code>#marquee</code> to the address to see one at full size.</p>
</header>
<main class="gallery">
${ARTBOARDS.map(([id, label, w, h]) => `<figure class="slot" data-id="${id}" style="--w:${w};--h:${h}"><figcaption>${label} <span>${w}×${h}</span></figcaption><div class="fit">${{ a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, tile: TILE, marquee: MARQUEE }[id]}</div></figure>`).join('\n')}
</main>
<script>
${read('tools/store/graphics.js')}
</script>`;

fs.writeFileSync(path.join(EXT, 'store/src/graphics.html'), html);
console.log(`✓ store/src/graphics.html (${(html.length / 1024).toFixed(0)} KB)`);
