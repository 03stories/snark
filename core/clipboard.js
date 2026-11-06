// The offscreen document (offscreen/offscreen.html) does clipboard writes for Copy URL, and, only
// when an agent folder is connected, hosts the agent folder in the background.
// Chrome allows one offscreen document per extension; both jobs share it.
const PATH = 'offscreen/offscreen.html';
let creating = null;

export async function hasOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(PATH)],
  });
  return existing.length > 0;
}

export async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: PATH,
      reasons: ['CLIPBOARD', 'BLOBS'],
      justification:
        'Copy the current tab URL to the clipboard. If the user connects a local agent folder, ' +
        'keep that folder (a File System Access handle) open to write state.json and read command files.',
    })
    .finally(() => (creating = null));
  await creating;
}

export async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

export async function copyText(text) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
  if (!res?.ok) throw new Error('Clipboard write failed');
}
