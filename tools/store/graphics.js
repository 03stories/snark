// Fits artboards to the window for review, or shows one at 1:1 for capture (#a1 … #marquee),
// then places the hand-drawn notes next to the UI they point at.
(function () {
  const slots = [...document.querySelectorAll('.slot')];

  function layout() {
    // #a1 shows one artboard at 1:1; #a1-0 / #a1-1 show its top / bottom half (for capture
    // in a viewport shorter than the artboard).
    const [want, partStr] = location.hash.slice(1).split('-');
    const part = partStr == null || partStr.startsWith('x') ? null : +partStr;
    const capture = slots.some((s) => s.dataset.id === want);
    document.body.classList.toggle('capture', capture);
    for (const slot of slots) {
      const w = +slot.style.getPropertyValue('--w');
      const h = +slot.style.getPropertyValue('--h');
      slot.classList.toggle('show', capture && slot.dataset.id === want);
      const avail = slot.parentElement.clientWidth || w;
      const k = capture ? 1 : Math.min(1, avail / w);
      const fit = slot.querySelector('.fit');
      const ab = fit.firstElementChild;
      // #id-0 / #id-1: top / bottom half; #id-x0 / #id-x1: left / right half
      const horiz = partStr?.startsWith('x');
      const cut = capture && partStr != null && slot.classList.contains('show');
      const n = horiz ? +partStr.slice(1) : part;
      fit.style.width = `${cut && horiz ? w / 2 : w * k}px`;
      fit.style.height = `${cut && !horiz ? h / 2 : h * k}px`;
      ab.style.transform = cut ? (horiz ? `translateX(${-n * (w / 2)}px)` : `translateY(${-n * (h / 2)}px)`) : k === 1 ? '' : `scale(${k})`;
      ab.dataset.k = k;
    }
    for (const ab of document.querySelectorAll('.ab')) { placeMenu(ab); placeNotes(ab); }
  }

  // Artboard-local box of an element (undoing the review scale).
  function box(el, ab) {
    const k = +ab.dataset.k || 1;
    const a = ab.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: (r.left - a.left) / k, y: (r.top - a.top) / k, w: r.width / k, h: r.height / k };
  }

  // The context menu was captured without a layout; put it under the pin it belongs to.
  function placeMenu(ab) {
    const menu = ab.querySelector('#menu');
    const row = ab.querySelector('.row.force-sub');
    if (!menu || !row) return;
    const sb = row.closest('.sb');
    const k = +ab.dataset.k || 1;
    const s = sb.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    menu.style.left = `${(r.left - s.left) / k + 36}px`;
    menu.style.top = `${(r.bottom - s.top) / k + 30}px`;
    menu.style.minWidth = '230px';
  }

  // Hand-drawn notes: data-anchor (a selector), data-side (left | right | below) and --dx/--dy
  // (the note's top-left, relative to that side of the target). The arrow runs from the note's
  // nearest edge to the target with a gentle curve.
  function placeNotes(ab) {
    ab.querySelector('svg.arrows')?.remove();
    const notes = [...ab.querySelectorAll('.callout[data-anchor]')];
    if (!notes.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'arrows');
    ab.append(svg);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const note of notes) {
      const target = ab.querySelector(note.dataset.anchor.replace(/^\.a\d\s+/, ''));
      if (!target) { note.hidden = true; continue; }
      const t = box(target, ab);
      const cs = getComputedStyle(note);
      const dx = parseFloat(cs.getPropertyValue('--dx')) || 0;
      const dy = parseFloat(cs.getPropertyValue('--dy')) || 0;
      const side = note.dataset.side || 'right';
      const ax = side === 'left' ? t.x : side === 'right' ? t.x + t.w : t.x + t.w / 2;
      const ay = side === 'below' ? t.y + t.h : t.y + t.h / 2;
      note.style.left = `${ax + dx}px`;
      note.style.top = `${ay + dy}px`;
      const n = box(note, ab);
      let sx = clamp(ax, n.x, n.x + n.w);
      let sy = clamp(ay, n.y, n.y + n.h);
      const len0 = Math.hypot(ax - sx, ay - sy) || 1;
      sx += ((ax - sx) / len0) * 8; sy += ((ay - sy) / len0) * 8;
      const ex = ax + ((sx - ax) / len0) * 8;
      const ey = ay + ((sy - ay) / len0) * 8;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const bend = 0.22 * (note.dataset.bend ? +note.dataset.bend : 1);
      const cx = mx - (ey - sy) * bend, cy = my + (ex - sx) * bend;
      const ang = Math.atan2(ey - cy, ex - cx);
      const hx = (a) => ex - 13 * Math.cos(ang + a);
      const hy = (a) => ey - 13 * Math.sin(ang + a);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${sx},${sy} Q${cx},${cy} ${ex},${ey} M${hx(0.45)},${hy(0.45)} L${ex},${ey} L${hx(-0.45)},${hy(-0.45)}`);
      svg.append(p);
    }
  }

  addEventListener('hashchange', layout);
  addEventListener('resize', layout);
  (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(layout));
  layout();
})();
