// WEEK — calendar-style grid of one teaching week. Swipe or use the arrows to
// move between teaching weeks (vacations are skipped); "Today" jumps back.

import { getState } from '../store.js';
import { allSessions, statusOf, sessionMeta } from '../sessions.js';
import { teachingWeeks, fmtRange, addDays, toISO, DAY_SHORT, mondayOf, startOfDay } from '../calendar.js';
import { icon, typeIcon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { termFormPage } from './terms.js';

let idx = null; // which teaching week is showing (index into teachingWeeks)
let slideDir = 0; // -1 / 1 for the swipe animation on the next render
const HOUR_PX = 56;

function thisWeekIndex(weeks, now = new Date()) {
  const mon = mondayOf(now).getTime();
  let i = weeks.findIndex((w) => w.monday.getTime() === mon);
  if (i >= 0) return i;
  i = weeks.findIndex((w) => w.monday > now); // in a vacation: the next teaching week
  return i >= 0 ? i : weeks.length - 1;
}

/** Side-by-side lanes for sessions that overlap on the same day. */
function layoutDay(list) {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const s of cluster) {
      let lane = lanes.findIndex((end) => end <= s.startMin);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = s.endMin;
      out.push({ s, lane });
    }
    for (const o of out.slice(out.length - cluster.length)) o.lanes = lanes.length;
    cluster = [];
  };
  for (const s of sorted) {
    if (cluster.length && s.startMin >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  if (cluster.length) flush();
  return out;
}

function summaryHTML(list) {
  const now = Date.now();
  const c = { attended: 0, caught: 0, missed: 0, upcoming: 0 };
  for (const s of list) {
    const st = statusOf(s, now);
    c[st === 'live' ? 'upcoming' : st]++;
  }
  const item = (k, label) => (c[k] ? `<span class="ws ws-${k}"><i></i>${c[k]} ${label}</span>` : '');
  return item('attended', 'attended') + item('caught', 'caught up') + item('missed', 'missed') + item('upcoming', 'to come') || '<span class="ws">No sessions</span>';
}

export const weekPage = {
  tab: 'week',
  render(view, app) {
    const st = getState();
    const weeks = teachingWeeks(st);
    if (!weeks.length) {
      app.header({ title: 'Week', gear: true });
      view.innerHTML = `<div class="empty"><div class="big">No terms yet</div>Add a term to see your weeks.
        <div style="margin-top:18px"><button class="btn secondary" data-add-term>${icon('plus')}Add term</button></div></div>`;
      view.querySelector('[data-add-term]').onclick = () => app.push(termFormPage({ mode: 'settings' }));
      return;
    }
    const now = new Date();
    const ti = thisWeekIndex(weeks, now);
    if (idx == null || idx >= weeks.length) idx = ti;
    const w = weeks[idx];
    const nDays = st.settings.showWeekends ? 7 : 5;
    const lastDay = addDays(w.monday, nDays - 1);

    const go = (d) => {
      const n = Math.max(0, Math.min(weeks.length - 1, idx + d));
      if (n === idx) return;
      slideDir = n > idx ? 1 : -1;
      idx = n;
      app.rerender();
    };

    app.header({
      eyebrow: `${w.termName} · Week ${w.week}`,
      title: fmtRange(w.monday, lastDay),
      small: true,
      gear: true,
    });

    // sessions in this calendar week
    const from = toISO(w.monday), to = toISO(addDays(w.monday, 6));
    const list = allSessions().filter((s) => s.dateISO >= from && s.dateISO <= to && (nDays === 7 || s.day < 5));

    // visible hours: at least 9–17, stretched to fit everything
    let startH = 9, endH = 17;
    for (const s of list) {
      startH = Math.min(startH, Math.floor(s.startMin / 60));
      endH = Math.max(endH, Math.ceil(s.endMin / 60));
    }
    const hours = endH - startH;
    const todayISO = toISO(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let cols = '';
    for (let d = 0; d < nDays; d++) {
      const date = addDays(w.monday, d);
      const iso = toISO(date);
      const daySessions = list.filter((s) => s.dateISO === iso);
      let blocks = '';
      for (const { s, lane, lanes } of layoutDay(daySessions)) {
        const m = sessionMeta(s);
        const topPx = ((s.startMin - startH * 60) / 60) * HOUR_PX;
        const h = Math.max(22, ((s.endMin - s.startMin) / 60) * HOUR_PX - 2);
        blocks += `<button class="blk ${h >= 50 ? 'tall' : ''}" data-sid="${esc(s.id)}" data-state="${statusOf(s)}"
            style="--c:${esc(m.color)};top:${topPx + 1}px;height:${h}px;left:calc(${(lane / lanes) * 100}% + 1px);width:calc(${100 / lanes}% - 2px)"
            aria-label="${esc(m.moduleName)} ${s.start}">
          <span class="blk-code">${esc(m.moduleCode)}</span>
          <span class="blk-time">${s.start}</span>
          ${h >= 50 && m.partName ? `<span class="blk-part">${esc(m.partName)}</span>` : ''}
          <span class="blk-type">${typeIcon(s.type)}</span>
          <span class="blk-mark blk-check">${icon('check')}</span><span class="blk-mark blk-caught">${icon('caught')}</span>
        </button>`;
      }
      const nowLine =
        iso === todayISO && nowMin >= startH * 60 && nowMin <= endH * 60
          ? `<div class="now-line" style="top:${((nowMin - startH * 60) / 60) * HOUR_PX}px"></div>`
          : '';
      cols += `<div class="wk-col ${iso === todayISO ? 'is-today' : ''}">${blocks}${nowLine}</div>`;
    }

    const heads = Array.from({ length: nDays }, (_, d) => {
      const date = addDays(w.monday, d);
      const isToday = toISO(date) === todayISO;
      return `<div class="wk-day ${isToday ? 'is-today' : ''}"><span>${DAY_SHORT[d]}</span><b>${date.getDate()}</b></div>`;
    }).join('');

    const hourLabels = Array.from({ length: hours + 1 }, (_, i) => `<span style="top:${i * HOUR_PX}px">${String(startH + i).padStart(2, '0')}:00</span>`).join('');

    view.innerHTML = `
      <div class="wk-nav">
        <button class="icon-btn" data-wk-prev aria-label="Previous week" ${idx === 0 ? 'disabled' : ''}>${icon('back')}</button>
        <button class="today-pill" data-wk-today ${idx === ti ? 'disabled' : ''}>${idx === ti ? 'This week' : 'Today'}</button>
        <button class="icon-btn" data-wk-next aria-label="Next week" ${idx === weeks.length - 1 ? 'disabled' : ''}>${icon('chevron')}</button>
      </div>
      <div class="wk-sum" data-wk-sum>${summaryHTML(list)}</div>
      <div class="wk ${slideDir > 0 ? 'from-right' : slideDir < 0 ? 'from-left' : ''}" style="--days:${nDays};--hour:${HOUR_PX}px">
        <div class="wk-head"><div></div>${heads}</div>
        <div class="wk-body" style="height:${hours * HOUR_PX}px">
          <div class="wk-hours">${hourLabels}</div>
          <div class="wk-cols">${cols}</div>
        </div>
      </div>
      ${list.length ? '' : `<p class="section-note" style="text-align:center;margin-top:14px">Nothing in your timetable this week.</p>`}`;
    slideDir = 0;
    view.querySelector('[data-wk-prev]').onclick = () => go(-1);
    view.querySelector('[data-wk-next]').onclick = () => go(1);
    view.querySelector('[data-wk-today]').onclick = () => {
      slideDir = ti > idx ? 1 : -1;
      idx = ti;
      app.rerender();
    };

    // keep the summary current as blocks are logged
    view.addEventListener('attend:logged', () => {
      const el = view.querySelector('[data-wk-sum]');
      if (el) el.innerHTML = summaryHTML(list);
    });

    // scroll so the current time (or first session) is in view on this week
    requestAnimationFrame(() => {
      const target = idx === ti && nowMin > startH * 60 ? ((nowMin - startH * 60) / 60) * HOUR_PX - 120 : 0;
      if (target > 0) app.scroller.scrollTop = target;
    });

    // swipe between weeks
    const grid = view.querySelector('.wk');
    let sx = 0, sy = 0, tracking = false;
    grid.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  },
};

/** Called when the tab is reselected so the week resets to today next time. */
export function resetWeek() {
  idx = null;
}
