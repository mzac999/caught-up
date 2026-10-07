// Tiny SVG bar chart (stacked), sized to the container's real width so text is
// never stretched. Bars get a 4px rounded top, square base, 2px gap between
// stacked segments. Tapping a bar calls onPick(i) so the page can show a readout.

import { esc } from './dom.js';

function topRounded(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * bars: [{ label, group, segs: [{ v, cls }] }]   (segs bottom → top; v in data units)
 * max: top of the y axis; ticks: values for gridlines; fmt: tick label formatter
 */
export function barChart({ width, height = 150, bars, max, ticks, fmt = (v) => v, selected = -1 }) {
  const m = { l: 36, r: 4, t: 8, b: 34 };
  const pw = Math.max(10, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const n = Math.max(1, bars.length);
  const band = pw / n;
  const bw = Math.max(3, Math.min(18, band * 0.62));
  const y = (v) => m.t + ph - (Math.min(v, max) / max) * ph;

  let g = '';
  for (const t of ticks) {
    g += `<line x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}" class="ch-grid"/>`;
    g += `<text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end" class="ch-tick">${esc(fmt(t))}</text>`;
  }

  const every = band >= 16 ? 1 : band >= 9 ? 2 : 3;
  let lastGroup = null;
  bars.forEach((b, i) => {
    const cx = m.l + band * i + band / 2;
    const x = cx - bw / 2;
    if (i === selected) g += `<rect x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" class="ch-sel"/>`;
    let base = m.t + ph;
    const segs = b.segs.filter((s) => s.v > 0);
    segs.forEach((s, k) => {
      const h = (Math.min(s.v, max) / max) * ph;
      const isTop = k === segs.length - 1;
      const gap = k > 0 ? 2 : 0;
      const top = base - h;
      const hh = Math.max(0, h - gap);
      g += isTop
        ? `<path d="${topRounded(x, top, bw, hh, 4)}" class="${s.cls}"/>`
        : `<rect x="${x}" y="${top}" width="${bw}" height="${hh}" class="${s.cls}"/>`;
      base = top;
    });
    if (!segs.length && b.empty) g += `<line x1="${x}" x2="${x + bw}" y1="${m.t + ph - 1}" y2="${m.t + ph - 1}" class="ch-empty"/>`;
    if (i % every === 0 || b.group !== lastGroup)
      g += `<text x="${cx}" y="${m.t + ph + 13}" text-anchor="middle" class="ch-x">${esc(b.label)}</text>`;
    if (b.group !== lastGroup) {
      let span = bars.slice(i).findIndex((x) => x.group !== b.group);
      if (span < 0) span = bars.length - i;
      const chars = Math.max(1, Math.floor((span * band) / 6.2));
      const name = b.group.length > chars ? b.group.slice(0, Math.max(1, chars - 1)) + '…' : b.group;
      g += `<text x="${m.l + band * i + 2}" y="${m.t + ph + 28}" class="ch-group">${esc(name)}</text>`;
      if (i > 0) g += `<line x1="${m.l + band * i}" x2="${m.l + band * i}" y1="${m.t + ph + 2}" y2="${m.t + ph + 30}" class="ch-div"/>`;
      lastGroup = b.group;
    }
    g += `<rect x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph + 20}" class="ch-hit" data-bar="${i}"/>`;
  });
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${g}</svg>`;
}

/**
 * Donut (pie with a hole). segs: [{ v, cls }] drawn clockwise from 12 o'clock with
 * a 2px gap between segments. Empty data draws just the track.
 */
export function donut({ size = 120, stroke = 14, segs, center = '', sub = '' }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const total = segs.reduce((n, s) => n + s.v, 0);
  const live = segs.filter((s) => s.v > 0);
  const gap = live.length > 1 ? 2 : 0;
  let off = 0;
  let arcs = `<circle cx="${c}" cy="${c}" r="${r}" class="dn-track" stroke-width="${stroke}"/>`;
  if (total > 0)
    for (const s of live) {
      const len = (s.v / total) * C;
      arcs += `<circle cx="${c}" cy="${c}" r="${r}" class="${s.cls}" stroke-width="${stroke}"
        stroke-dasharray="${Math.max(0.01, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"/>`;
      off += len;
    }
  const big = Math.round(size * 0.2);
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">${arcs}
    <text x="${c}" y="${c + (sub ? big * 0.2 : big * 0.35)}" text-anchor="middle" class="dn-center" style="font-size:${big}px">${esc(center)}</text>
    ${sub ? `<text x="${c}" y="${c + big * 0.2 + Math.round(size * 0.11)}" text-anchor="middle" class="dn-sub" style="font-size:${Math.max(9, Math.round(size * 0.085))}px">${esc(sub)}</text>` : ''}
  </svg>`;
}
