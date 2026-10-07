// Markup for a session as a large card (Today screen). Visual state comes from
// data-state + the --c custom property, so logging only changes an attribute.

import { sessionMeta, statusOf, typeLabel } from '../sessions.js';
import { icon, typeIcon } from './icons.js';
import { esc } from './dom.js';

export function stateMarks() {
  return `<span class="mark mark-check">${icon('check')}</span><span class="mark mark-caught">${icon('caught')}</span><span class="mark mark-live">Now</span><span class="mark mark-missed"></span>`;
}

export function typeTag(type, label = typeLabel(type)) {
  return `<span class="tag">${typeIcon(type)}${esc(label)}</span>`;
}

export function sessionCard(s) {
  const m = sessionMeta(s);
  return `<button class="card" data-sid="${esc(s.id)}" data-state="${statusOf(s)}" style="--c:${esc(m.color)}">
    <div class="card-time"><span>${s.start}</span><span class="end">${s.end}</span></div>
    <div class="card-body">
      <div class="card-title">${esc(m.moduleName)}</div>
      <div class="card-sub">${m.partName ? `${esc(m.partName)} · ` : ''}Week ${s.termWeek}</div>
      <div class="card-meta">${typeTag(s.type, m.typeLabel)}${s.location ? `<span class="loc">${icon('pin')}<span>${esc(s.location)}</span></span>` : ''}</div>
    </div>
    <div class="card-mark">${stateMarks()}</div>
  </button>`;
}
