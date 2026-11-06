chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'copy') {
    const ta = document.getElementById('t');
    ta.value = msg.text;
    ta.select();
    const ok = document.execCommand('copy');
    sendResponse({ ok });
  }
});
