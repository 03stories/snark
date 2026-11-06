// Background half of the agent folder (see offscreen/offscreen.js for the file half).
// Only active once an agent folder is connected (the sidebar sets `agentFolder` in storage.local).
//
// - Keeps the offscreen document open, so the folder permission outlives the sidebar.
// - Applies commands the offscreen document reads from inbox/ (needs chrome.storage/tabs, which
//   offscreen pages don't have).
// - Rebuilds the state.json snapshot whenever spaces, pins, favorites, tabs or settings change.

import { applyCommand } from '../core/agent-ops.js';
import { gatherSnapshot, agentWindow } from '../core/agent-snapshot.js';
import { getAll } from '../core/settings.js';
import { ensureOffscreen, closeOffscreen } from '../core/clipboard.js';

const FLAG = 'agentFolder';
const isConnected = async () => !!(await chrome.storage.local.get(FLAG))[FLAG];

let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSnapshot, 1200);
}

async function pushSnapshot() {
  try {
    if (!(await isConnected())) return;
    await ensureOffscreen();
    const snapshot = await gatherSnapshot(getAll);
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'agent-state', snapshot }).catch(() => {});
  } catch (e) {
    console.warn('agent snapshot', e);
  }
}

async function applyFromInbox(command) {
  const windowId = await agentWindow();
  const groups = windowId != null ? await chrome.tabGroups.query({ windowId }) : [];
  try {
    return await applyCommand(command, { windowId, groups });
  } catch (e) {
    return { status: 'error', error: String(e?.message ?? e) };
  } finally {
    schedulePush();
  }
}

export function init() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.target !== 'sw') return;
    if (msg.type === 'agent-apply') {
      applyFromInbox(msg.command).then(sendResponse);
      return true;
    }
    if (msg.type === 'agent-refresh') {
      (async () => {
        if (await isConnected()) {
          await ensureOffscreen();
          await chrome.runtime.sendMessage({ target: 'offscreen', type: 'agent-refresh' }).catch(() => {});
          schedulePush();
        } else {
          await closeOffscreen(); // reopened on demand for Copy URL
        }
        sendResponse({ ok: true });
      })();
      return true;
    }
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.tree || ch.favorites || ch.archive || ch[FLAG])) schedulePush();
    else if (area === 'sync' && ch.features) schedulePush();
    else if (area === 'session' && (ch.pinLinks || ch.activeSpace)) schedulePush();
  });
  for (const e of ['onCreated', 'onUpdated', 'onRemoved', 'onMoved', 'onAttached', 'onDetached']) chrome.tabs[e].addListener(schedulePush);
  for (const e of ['onCreated', 'onUpdated', 'onRemoved']) chrome.tabGroups[e].addListener(schedulePush);

  // Each time the worker starts (browser start, extension reload…), make sure the host is running.
  isConnected().then((c) => c && ensureOffscreen().then(schedulePush)).catch(() => {});
}
