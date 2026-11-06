// Service workers can't touch the clipboard, so we use an offscreen document.
const PATH = 'offscreen/offscreen.html';
let creating = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(PATH)],
  });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({ url: PATH, reasons: ['CLIPBOARD'], justification: 'Copy tab URL to clipboard' })
    .finally(() => (creating = null));
  await creating;
}

export async function copyText(text) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
  if (!res?.ok) throw new Error('Clipboard write failed');
}
