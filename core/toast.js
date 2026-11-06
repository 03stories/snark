// Shows a small pill at the top of the page. Falls back to a
// toolbar badge on pages extensions can't script (chrome://, Web Store, PDFs).

export async function toast(tabId, message) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: renderToast, args: [message] });
  } catch {
    await flashBadge(tabId);
  }
}

export async function flashBadge(tabId, text = '✓') {
  await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
}

// Runs inside the page. Must be self-contained.
function renderToast(message) {
  const ID = '__myarc_toast';
  document.getElementById(ID)?.remove();
  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText =
    'all:initial;position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .t{font:500 13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#fff;
       background:rgba(28,28,30,.92);padding:8px 14px;border-radius:999px;
       box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:8px;align-items:center;
       opacity:0;transform:translateY(-6px);transition:opacity .18s,transform .18s}
    .t.in{opacity:1;transform:none}
    .c{color:#4ade80;font-weight:700}
  </style><div class="t"><span class="c">✓</span><span class="m"></span></div>`;
  const t = root.querySelector('.t');
  root.querySelector('.m').textContent = message;
  document.documentElement.appendChild(host);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => host.remove(), 250);
  }, 1400);
}
