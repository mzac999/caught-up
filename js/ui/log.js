// The tap-to-log interaction, shared by every screen that shows sessions.
// Any element with data-sid="<session id>" inside a root passed to initLogging()
// gets: press-scale, popover (Attended / Caught up), tap-again-to-undo.
// State is applied in place (data-state attribute) so CSS can animate the colour change.

import { sessionById, statusOf, setStatus } from '../sessions.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

let open = null; // { pop, backdrop, el }

export function initLogging(root) {
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('click', onClick);
}

function onDown(e) {
  const el = e.target.closest('[data-sid]');
  if (!el || open) return;
  el.classList.add('pressed');
  const x0 = e.clientX, y0 = e.clientY;
  const release = () => {
    if (!(open && open.el === el)) el.classList.remove('pressed');
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
    window.removeEventListener('pointermove', move);
  };
  const move = (ev) => {
    if (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8) release();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('pointermove', move, { passive: true });
}

function onClick(e) {
  const el = e.target.closest('[data-sid]');
  if (!el) return;
  const s = sessionById(el.dataset.sid);
  if (!s) return;
  const st = statusOf(s);
  if (st === 'attended' || st === 'caught') {
    el.classList.remove('pressed');
    setStatus(s.id, null); // one tap undo, no confirmation
    applyState(s.id);
    announce(el, s.id, null);
  } else if (st === 'upcoming') {
    el.classList.remove('pressed');
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    toast(`Starts at ${s.start}`);
  } else {
    openPopover(el, s);
  }
}

export function openPopover(el, s, { onDone } = {}) {
  closePopover(true);
  el.classList.add('pressed');
  const color = getComputedStyle(el).getPropertyValue('--c') || '#888';
  const caughtFirst = el.dataset.primary === 'caught'; // Catch-up list leads with "Caught up"

  const backdrop = document.createElement('div');
  backdrop.className = 'pop-backdrop';
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'menu');
  pop.style.setProperty('--c', color.trim());
  const bA = `<button class="pop-btn ${caughtFirst ? '' : 'primary'}" data-act="attended" role="menuitem">${icon('check')}Attended</button>`;
  const bC = `<button class="pop-btn ${caughtFirst ? 'primary' : ''}" data-act="caught" role="menuitem">${icon('caught')}Caught up</button>`;
  pop.innerHTML = caughtFirst ? bC + bA : bA + bC;
  document.body.append(backdrop, pop);

  // position next to the tapped element
  const r = el.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const bottomLimit = vh - 96; // keep clear of the tab bar
  let top;
  if (r.bottom + 10 + ph < bottomLimit) {
    top = r.bottom + 10;
    pop.style.transformOrigin = 'top center';
  } else if (r.top - 10 - ph > 10) {
    top = r.top - 10 - ph;
    pop.style.transformOrigin = 'bottom center';
  } else {
    top = Math.max(10, r.top + r.height / 2 - ph / 2);
  }
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(12, Math.min(vw - pw - 12, left));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  open = { pop, backdrop, el };

  pop.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    setStatus(s.id, b.dataset.act);
    closePopover();
    // let the scale settle, then the colour transition runs
    applyState(s.id);
    announce(el, s.id, b.dataset.act);
    onDone && onDone(b.dataset.act);
  });
  backdrop.addEventListener('click', () => closePopover());
  backdrop.addEventListener('pointerdown', (ev) => ev.preventDefault());
  document.addEventListener('keydown', escClose);
  pop.querySelector('button').focus({ preventScroll: true });
}

/** Tell the page a session changed (bubbles to the page container). */
function announce(el, id, status) {
  el.dispatchEvent(new CustomEvent('attend:logged', { bubbles: true, detail: { id, status } }));
}

function escClose(e) {
  if (e.key === 'Escape') closePopover();
}

export function closePopover(instant = false) {
  if (!open) return;
  const { pop, backdrop, el } = open;
  open = null;
  document.removeEventListener('keydown', escClose);
  el.classList.remove('pressed');
  if (instant) {
    pop.remove();
    backdrop.remove();
    return;
  }
  pop.classList.add('out');
  backdrop.classList.add('out');
  setTimeout(() => {
    pop.remove();
    backdrop.remove();
  }, 160);
}

export function isPopoverOpen() {
  return !!open;
}

/** Update every on-screen element for this session to its current state. */
export function applyState(id) {
  const s = sessionById(id);
  if (!s) return;
  const st = statusOf(s);
  document.querySelectorAll(`[data-sid="${CSS.escape(id)}"]`).forEach((el) => {
    if (el.dataset.state !== st) el.dataset.state = st;
  });
}

/** Re-check every visible session (time passing turns upcoming -> live -> missed). */
export function refreshVisibleStates() {
  const seen = new Set();
  document.querySelectorAll('[data-sid]').forEach((el) => {
    const id = el.dataset.sid;
    if (seen.has(id)) return;
    seen.add(id);
    applyState(id);
  });
}
