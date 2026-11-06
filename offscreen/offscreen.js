// Snark's offscreen document. It has two jobs:
//
// 1. Clipboard writes for Copy URL (service workers can't touch the clipboard).
// 2. The agent-folder host, and only once you've connected an agent folder. It stays open in the
//    background, which keeps the folder permission alive after the sidebar closes (Chrome drops it
//    when the extension's last page closes). It watches inbox/, writes state.json/processed/
//    activity.log, and hands each command to the background service worker, which applies it.
//    Offscreen pages only get chrome.runtime, so all data access happens in the worker.

import * as AF from '../core/agent-folder.js';

let agent = { status: 'none' };
let pendingSnapshot = null;
let scaffolded = false;
let busy = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  switch (msg.type) {
    case 'copy': {
      const ta = document.getElementById('t');
      ta.value = msg.text;
      ta.select();
      sendResponse({ ok: document.execCommand('copy') });
      return;
    }
    case 'agent-state':
      pendingSnapshot = msg.snapshot;
      flushState();
      sendResponse({ ok: true });
      return;
    case 'agent-refresh':
      refresh().then(() => { tick(); sendResponse({ status: agent.status }); });
      return true;
  }
});

async function refresh() {
  agent = await AF.getAgentDir().catch(() => ({ status: 'none' }));
  if (agent.status === 'ok' && !scaffolded) {
    await AF.scaffold(agent.handle).catch((e) => console.warn('agent scaffold', e));
    scaffolded = true;
  }
}

function onError(e) {
  if (['NotAllowedError', 'NotFoundError', 'SecurityError'].includes(e?.name)) agent = { ...agent, status: 'needs-permission' };
  else console.warn('agent folder', e);
}

async function flushState() {
  if (agent.status !== 'ok' || !pendingSnapshot) return;
  try {
    await AF.writeState(agent.handle, pendingSnapshot);
    pendingSnapshot = null;
  } catch (e) {
    onError(e);
  }
}

async function applyViaWorker(command) {
  const r = await chrome.runtime.sendMessage({ target: 'sw', type: 'agent-apply', command }).catch((e) => ({ status: 'error', error: String(e?.message ?? e) }));
  return r ?? { status: 'error', error: 'Snark’s background script didn’t answer' };
}

const announce = (result) => chrome.runtime.sendMessage({ type: 'agent-applied', result }).catch(() => {}); // the sidebar shows a notice with Undo

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (agent.status !== 'ok') await refresh(); // permission may have been granted from the sidebar
    if (agent.status !== 'ok') return;
    await AF.processInbox(agent.handle, {}, announce, applyViaWorker);
    await flushState();
  } catch (e) {
    onError(e);
  } finally {
    busy = false;
  }
}

refresh().then(tick);
setInterval(tick, 2000);
