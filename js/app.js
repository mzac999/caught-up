// App shell: header, tab bar, simple page stack, periodic refresh.

import { load, getState, onChange, replaceState, update, emptyState, requestPersistence } from './store.js';
import { allSessions, missedSessions } from './sessions.js';
import { makeSampleState, seedAttendance } from './seed.js';
import { icon } from './ui/icons.js';
import { esc } from './ui/dom.js';
import { confirmSheet } from './ui/toast.js';
import { dailySnapshot, snapshotNow } from './backup.js';
import { initLogging, refreshVisibleStates, isPopoverOpen, closePopover } from './ui/log.js';
import { todayPage } from './views/today.js';
import { weekPage, resetWeek } from './views/week.js';
import { catchupPage } from './views/catchup.js';
import { statsPage } from './views/stats.js';
import { settingsPage } from './views/settings.js';
import { welcomePage, setupStep } from './views/setup.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'today', page: todayPage },
  { id: 'week', label: 'Week', icon: 'week', page: weekPage },
  { id: 'catchup', label: 'Catch-up', icon: 'catchup', page: catchupPage },
  { id: 'stats', label: 'Stats', icon: 'stats', page: statsPage },
];

const root = document.getElementById('app');
root.innerHTML = `
  <div class="shell">
    <header class="topbar" id="topbar"></header>
    <main class="view" id="view"></main>
    <div class="footer" id="footer" hidden></div>
    <nav class="tabbar" id="tabbar">${TABS.map(
      (t) => `<button class="tab" data-tab="${t.id}" aria-label="${t.label}">${icon(t.icon)}<span>${t.label}</span>${
        t.id === 'catchup' ? '<span class="badge" id="badge" hidden></span>' : ''
      }</button>`
    ).join('')}</nav>
  </div>`;

const els = {
  top: document.getElementById('topbar'),
  view: document.getElementById('view'),
  footer: document.getElementById('footer'),
  tabbar: document.getElementById('tabbar'),
  badge: document.getElementById('badge'),
};

let tab = 'today';
let stack = []; // pushed pages (settings, setup, editors)

const app = {
  header({ eyebrow = '', title = '', small = false, back = false, gear = false, steps = null, right = '' } = {}) {
    els.top.classList.toggle('has-back', back);
    els.top.innerHTML = `
      ${back ? `<button class="icon-btn back-btn" data-back aria-label="Back">${icon('back')}</button>` : ''}
      <div class="titles">
        ${steps ? `<div class="steps">${Array.from({ length: steps.total }, (_, i) => `<i class="${i < steps.n ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
        <h1 class="title ${small ? 'sm' : ''}">${esc(title)}</h1>
      </div>
      ${right}
      ${gear ? `<button class="icon-btn" data-settings aria-label="Settings">${icon('gear')}</button>` : ''}`;
  },
  /** Set footer HTML (or null to hide). Returns the footer element for binding. */
  footer(html) {
    if (html == null) {
      els.footer.hidden = true;
      els.footer.innerHTML = '';
    } else {
      els.footer.hidden = false;
      els.footer.innerHTML = html;
    }
    return els.footer;
  },
  push(page) {
    stack.push(page);
    render('push');
  },
  pop() {
    stack.pop();
    render('pop');
  },
  replace(page) {
    stack[stack.length - 1] = page;
    render('push');
  },
  /** Clear the stack and show a tab. */
  home(t = 'today') {
    stack = [];
    tab = t;
    render('tab');
  },
  rerender() {
    render('none');
  },
  setStack(pages) {
    stack = pages;
    render('push');
  },
  loadSample() {
    snapshotNow('Before sample data');
    replaceState(makeSampleState());
    update((st) => seedAttendance(st, allSessions()), 'attendance');
    app.home('today');
  },
  startOwnSetup() {
    confirmSheet({
      title: 'Set up your timetable?',
      message: 'This clears the sample data and starts the setup.',
      confirmLabel: 'Start setup',
    }).then((ok) => {
      if (!ok) return;
      snapshotNow('Before new setup');
      replaceState(emptyState());
      app.setStack([setupStep(1)]);
    });
  },
  resetAll() {
    snapshotNow('Before reset');
    replaceState(emptyState());
    app.setStack([welcomePage]);
  },
  settingsPage,
  scroller: null,
};

function currentPage() {
  return stack.length ? stack[stack.length - 1] : TABS.find((t) => t.id === tab).page;
}

function render(how) {
  closePopover(true);
  const page = currentPage();
  const showTabs = !stack.length;
  els.tabbar.hidden = !showTabs;
  els.footer.hidden = true;
  els.footer.innerHTML = '';
  els.view.classList.remove('enter', 'enter-fade');
  els.view.innerHTML = '';
  els.view.scrollTop = 0;
  // fresh container per render so pages can attach listeners freely
  const content = document.createElement('div');
  content.className = 'page';
  els.view.append(content);
  page.render(content, app);
  if (how === 'push') {
    void els.view.offsetWidth;
    els.view.classList.add('enter');
  } else if (how === 'tab' || how === 'pop') {
    void els.view.offsetWidth;
    els.view.classList.add('enter-fade');
  }
  els.tabbar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  updateBadge();
}

let lastBadge = -1;
function updateBadge() {
  if (!getState().setupDone) return;
  const n = missedSessions().length;
  els.badge.hidden = n === 0;
  els.badge.textContent = n > 99 ? '99+' : String(n);
  if (lastBadge !== -1 && n !== lastBadge) {
    els.badge.classList.remove('bump');
    void els.badge.offsetWidth;
    els.badge.classList.add('bump');
    setTimeout(() => els.badge.classList.remove('bump'), 260);
  }
  lastBadge = n;
}

// ---- global events ----
els.tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (b.dataset.tab === tab && !stack.length) {
    if (tab === 'week') {
      resetWeek(); // tapping Week again jumps back to this week
      render('none');
    } else els.view.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  tab = b.dataset.tab;
  stack = [];
  render('tab');
});
els.top.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) app.pop();
  else if (e.target.closest('[data-settings]')) app.push(settingsPage);
});
app.scroller = els.view;
initLogging(els.view);
onChange(() => updateBadge());

// time passes: upcoming -> live -> missed, and the date rolls over
let lastDay = new Date().toDateString();
function tick() {
  if (!getState().setupDone) return;
  const today = new Date().toDateString();
  if (today !== lastDay && !stack.length && tab === 'today' && !isPopoverOpen()) {
    lastDay = today;
    render('none');
    return;
  }
  refreshVisibleStates();
  updateBadge();
}
setInterval(tick, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    dailySnapshot();
    tick();
  }
});

// ---- boot ----
load();
requestPersistence();
dailySnapshot(); // once a day, silently
// offline support (only when served over http/https, i.e. the hosted app)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
if (getState().setupDone) render('none');
else app.setStack([welcomePage]);
