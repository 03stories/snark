import { getFeature } from '../core/settings.js';
import { copyText } from '../core/clipboard.js';
import { toast, flashBadge } from '../core/toast.js';

export const id = 'copyUrl';

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi)$/i;

function stripTracking(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

export function init() {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'copy-url' && command !== 'copy-url-markdown') return;
    const cfg = await getFeature(id);
    if (!cfg.enabled) return;

    tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab?.url) return;

    const url = cfg.stripTracking ? stripTracking(tab.url) : tab.url;
    const markdown = command === 'copy-url-markdown';
    const title = (tab.title || url).replace(/([[\]])/g, '\\$1');
    const text = markdown ? `[${title}](${url})` : url;

    await copyText(text);
    if (cfg.showToast) await toast(tab.id, markdown ? 'Copied Markdown link' : 'Copied URL');
    else await flashBadge(tab.id);
  });
}
