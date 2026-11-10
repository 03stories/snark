// Monogram "site icons" for the demo data (no real brands in store graphics).
import { SITES } from './demo.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function monogram(url) {
  let host = '';
  try { host = new URL(url).host; } catch {}
  const s = SITES[host] ?? { letter: (host[0] ?? '?').toUpperCase(), color: '#868e96' };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${s.color}"/><text x="16" y="22.5" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">${esc(s.letter)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
