// CATCH-UP — every missed session (finished, nothing logged), with sort/filter.
// Tap one to mark it Caught up (or Attended); it slides out of the list.

import { getState, update } from '../store.js';
import { missedSessions, sessionMeta, sessionName, moduleById, allTypes, typeLabel, setStatus } from '../sessions.js';
import { fmtShortDate, daysBetween } from '../calendar.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { typeTag } from '../ui/session-card.js';
import { toast } from '../ui/toast.js';

const SORTS = { oldest: 'Oldest first', newest: 'Newest first', module: 'By module', type: 'By type' };

function getFilters() {
  return { sort: 'oldest', module: 'all', part: 'all', type: 'all', ...(getState().settings.catchup || {}) };
}
function saveFilters(f) {
  update((s) => {
    s.settings.catchup = f;
  }, 'settings');
}

function ageText(days) {
  if (days <= 0) return ['Today', ''];
  return [String(days), days === 1 ? 'day ago' : 'days ago'];
}

function row(s, today, showWeek = true) {
  const m = sessionMeta(s);
  const days = daysBetween(s.date, today);
  const [n, unit] = ageText(days);
  return `<button class="ci" data-sid="${esc(s.id)}" data-state="missed" data-primary="caught" style="--c:${esc(m.color)}">
    <span class="ci-bar"></span>
    <span class="ci-body">
      <span class="ci-title">${esc(sessionName(s, { week: showWeek }))}</span>
      <span class="ci-meta">${typeTag(s.type, m.typeLabel)}<span>${fmtShortDate(s.date)} · ${s.start}</span></span>
    </span>
    <span class="ci-age ${days > 7 ? 'old' : ''}"><b>${n}</b>${unit ? `<span>${unit}</span>` : ''}</span>
  </button>`;
}

function summaryText(all, today) {
  if (!all.length) return 'Nothing to catch up';
  const oldest = daysBetween(all[0].date, today);
  return `<b>${all.length}</b> to catch up${oldest > 0 ? ` · oldest <b>${oldest}</b> day${oldest === 1 ? '' : 's'} ago` : ''}`;
}

export const catchupPage = {
  tab: 'catchup',
  render(view, app) {
    const st = getState();
    const f = getFilters();
    const today = new Date();
    const all = missedSessions();
    const mod = f.module !== 'all' ? moduleById(st, f.module) : null;
    if (f.module !== 'all' && !mod) f.module = 'all';
    if (!mod || !mod.parts.some((p) => p.id === f.part)) f.part = 'all';

    let list = all.filter(
      (s) => (f.module === 'all' || s.moduleId === f.module) && (f.part === 'all' || s.partId === f.part) && (f.type === 'all' || s.type === f.type)
    );
    list.sort((a, b) => (f.sort === 'newest' ? b.startTs - a.startTs : a.startTs - b.startTs));

    app.header({ title: 'Catch-up', gear: true });

    if (!all.length) {
      view.innerHTML = `<div class="empty">${icon('check', 'empty-ic')}<div class="big">All caught up</div>Nothing missed right now.</div>`;
      return;
    }

    // ---- controls
    const typesPresent = allTypes(st).filter((t) => all.some((s) => s.type === t.id));
    const sel = (key, opts, val, label) =>
      `<select class="pill-select ${val !== 'all' && key !== 'sort' ? 'on' : ''}" data-filter="${key}" aria-label="${label}">${opts
        .map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select>`;
    const controls = `<div class="filters">
      ${sel('sort', Object.entries(SORTS), f.sort, 'Sort')}
      ${sel('module', [['all', 'All modules'], ...st.modules.map((m) => [m.id, m.code || m.name])], f.module, 'Module')}
      ${mod && mod.parts.length ? sel('part', [['all', 'All parts'], ...mod.parts.map((p) => [p.id, p.name])], f.part, 'Part') : ''}
      ${sel('type', [['all', 'All types'], ...typesPresent.map((t) => [t.id, t.label])], f.type, 'Type')}
    </div>`;

    // ---- list (grouped when sorting by module or type)
    let body = '';
    if (!list.length) {
      body = `<div class="empty"><div class="big">Nothing matches</div>Try a different filter.</div>`;
    } else if (f.sort === 'module' || f.sort === 'type') {
      const keyOf = (s) => (f.sort === 'module' ? s.moduleId : s.type);
      const order = f.sort === 'module' ? st.modules.map((m) => m.id) : allTypes(st).map((t) => t.id);
      const keys = [...new Set(list.map(keyOf))].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      for (const k of keys) {
        const items = list.filter((s) => keyOf(s) === k);
        const first = sessionMeta(items[0]);
        const title = f.sort === 'module' ? first.moduleName : typeLabel(k, first.typeLabel);
        body += `<div class="ci-group" data-group>
          <div class="section-title ci-head">${f.sort === 'module' ? `<span class="dot" style="--c:${esc(first.color)}"></span>` : ''}${esc(title)}<span class="ci-count">${items.length}</span></div>
          <div class="ci-list">${items.map((s) => row(s, today)).join('')}</div></div>`;
      }
    } else {
      // date order: group each teaching week behind a bracket on the right, so the
      // week number doesn't need repeating in every name
      const multiTerm = new Set(list.map((s) => s.termId)).size > 1;
      let i = 0;
      while (i < list.length) {
        const k = `${list[i].termId}:${list[i].termWeek}`;
        const items = [];
        while (i < list.length && `${list[i].termId}:${list[i].termWeek}` === k) items.push(list[i++]);
        const s0 = items[0];
        const term = s0.termName || '';
        body += `<div class="ci-week" data-group aria-label="${esc(term)} week ${s0.termWeek}">
          <div class="ci-list">${items.map((s) => row(s, today, false)).join('')}</div>
          <div class="ci-bracket"><span class="ci-wk">Wk<b>${s0.termWeek}</b>${multiTerm ? `<small>${esc(term.slice(0, 3))}</small>` : ''}</span></div>
        </div>`;
      }
    }

    view.innerHTML = `<p class="ci-summary" data-ci-summary>${summaryText(all, today)}</p>
      ${controls}
      ${list.length !== all.length ? `<p class="section-note" style="margin:0 4px 10px">Showing ${list.length} of ${all.length}</p>` : ''}
      ${body}`;

    view.addEventListener('change', (e) => {
      const k = e.target.dataset.filter;
      if (!k) return;
      const next = { ...f, [k]: e.target.value };
      if (k === 'module') next.part = 'all';
      saveFilters(next);
      app.rerender();
    });

    // a row was logged: slide it out, offer undo
    view.addEventListener('attend:logged', (e) => {
      const { id, status } = e.detail;
      if (!status) return;
      const el = view.querySelector(`.ci[data-sid="${CSS.escape(id)}"]`);
      if (!el) return;
      const name = el.querySelector('.ci-title').textContent;
      el.style.height = el.offsetHeight + 'px';
      setTimeout(() => {
        el.classList.add('gone');
        el.style.height = '0px';
      }, 260);
      setTimeout(() => {
        const group = el.closest('[data-group]');
        el.remove();
        if (group) {
          const n = group.querySelectorAll('.ci').length;
          const count = group.querySelector('.ci-count');
          if (!n) group.remove();
          else if (count) count.textContent = n;
        }
        if (!view.querySelector('.ci')) app.rerender();
        const sum = view.querySelector('[data-ci-summary]');
        if (sum) sum.innerHTML = summaryText(missedSessions(), new Date());
      }, 620);
      toast(`${status === 'caught' ? 'Caught up' : 'Attended'}: ${name}`, 4000, {
        action: 'Undo',
        onAction: () => {
          setStatus(id, null);
          app.rerender();
        },
      });
    });
  },
};
