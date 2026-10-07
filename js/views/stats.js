// STATS — attendance first. Tap the attendance card for pie charts (whole year,
// each term, each module). Below: modules, weekly attendance and backlog charts.
// Everything follows the term selector (one term, or all terms) and the type filter.
// Only finished sessions count.

import { getState, update } from '../store.js';
import { allSessions, statusOf, sessionMeta, sessionName, moduleById, allTypes } from '../sessions.js';
import { teachingWeeks, sortedTerms, termEndDate, addDays, toISO, fmtShortDate, partRangeLabel, mondayOf, parseISO } from '../calendar.js';
import { icon, typeIcon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { barChart, donut } from '../ui/chart.js';

// ---------- maths ----------
export function tally(list, now = Date.now()) {
  let finished = 0, att = 0, caught = 0, missed = 0;
  for (const s of list) {
    if (s.endTs > now) continue;
    finished++;
    const st = statusOf(s, now);
    if (st === 'attended') att++;
    else if (st === 'caught') caught++;
    else missed++;
  }
  return { finished, att, caught, missed, live: finished ? att / finished : null, done: finished ? (att + caught) / finished : null };
}
export const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);

const segsOf = (t) => [
  { v: t.att, cls: 'dn-a' },
  { v: t.caught, cls: 'dn-c' },
  { v: t.missed, cls: 'dn-m' },
];

// ---------- filters (remembered in settings) ----------
function typeFilter() {
  return getState().settings.statsType || 'all';
}
function byType(list) {
  const t = typeFilter();
  return t === 'all' ? list : list.filter((s) => s.type === t);
}
function setSetting(key, value, app) {
  update((s) => {
    s.settings[key] = value;
  }, 'settings');
  const y = app.scroller.scrollTop;
  app.rerender();
  app.scroller.scrollTop = y;
}

/** The term running now, else the most recent one that has started, else the first. */
function currentTermId(terms, now = new Date()) {
  const t = terms.find((t) => t.monday <= now && now <= addDays(termEndDate(t), 2));
  if (t) return t.id;
  const started = terms.filter((t) => t.monday <= now);
  return (started[started.length - 1] || terms[0] || {}).id || null;
}
/** 'all' or a term id */
function scope(terms) {
  const v = getState().settings.statsTerm;
  if (v === 'all' && terms.length > 1) return 'all';
  if (v && terms.some((t) => t.id === v)) return v;
  return currentTermId(terms) || 'all';
}
function byScope(list, sc) {
  return sc === 'all' ? list : list.filter((s) => s.termId === sc);
}

/** Teaching weeks that have started (within the scope), each with its sessions. */
function weeksSoFar(list, sc, now) {
  const out = [];
  for (const w of teachingWeeks(getState())) {
    if (w.monday.getTime() > now) break;
    if (sc !== 'all' && w.termId !== sc) continue;
    const from = toISO(w.monday), to = toISO(addDays(w.monday, 6));
    out.push({ w, sessions: list.filter((s) => s.dateISO >= from && s.dateISO <= to), end: addDays(w.monday, 7).getTime() - 1 });
  }
  return out;
}

/** Outstanding missed sessions as they stood at time T (uses when each was caught up). */
function backlogAt(list, T) {
  const att = getState().attendance;
  let n = 0;
  for (const s of list) {
    if (s.endTs > T) continue;
    const a = att[s.id];
    if (!a) n++;
    else if (a.status === 'caught' && a.at > T) n++;
  }
  return n;
}

// ---------- shared bits ----------
function bar(t) {
  if (!t.finished) return '<div class="mbar"></div>';
  const a = (t.att / t.finished) * 100, c = (t.caught / t.finished) * 100;
  return `<div class="mbar">${a ? `<i class="seg-a" style="width:${a}%"></i>` : ''}${c ? `<i class="seg-c" style="width:${c}%"></i>` : ''}</div>`;
}

function legendRows(t) {
  const share = (n) => (t.finished ? ` <span class="faint">${Math.round((n / t.finished) * 100)}%</span>` : '');
  return `<div class="dn-legend">
    <div><i class="sw-a"></i>Attended live<b class="num">${t.att}${share(t.att)}</b></div>
    <div><i class="sw-c"></i>Caught up<b class="num">${t.caught}${share(t.caught)}</b></div>
    <div><i class="sw-m"></i>Missed<b class="num">${t.missed}${share(t.missed)}</b></div>
  </div>`;
}

function typeChips(list) {
  const present = allTypes(getState()).filter((t) => list.some((s) => s.type === t.id));
  if (present.length < 2) return '';
  const cur = typeFilter();
  return `<div class="chips scroll">${[['all', 'All types', ''], ...present.map((t) => [t.id, t.label, typeIcon(t.id)])]
    .map(([id, l, ic]) => `<button class="chip ${id === cur ? 'on' : ''}" data-type="${esc(id)}">${ic}${esc(l)}</button>`)
    .join('')}</div>`;
}

function termSeg(terms, sc) {
  if (!terms.length) return '';
  const items = terms.map((t) => [t.id, t.name]);
  if (terms.length > 1) items.push(['all', 'All terms']);
  return `<div class="seg term-seg">${items
    .map(([id, l]) => `<button data-term="${esc(id)}" class="${id === sc ? 'on' : ''}">${esc(l)}</button>`)
    .join('')}</div>`;
}

// ---------- main page ----------
export const statsPage = {
  tab: 'stats',
  render(view, app) {
    const st = getState();
    const now = Date.now();
    app.header({ title: 'Stats', gear: true });
    const everything = allSessions();
    if (!everything.length) {
      view.innerHTML = `<div class="empty"><div class="big">No sessions yet</div>Stats appear once your timetable has sessions.</div>`;
      return;
    }
    const terms = sortedTerms(st);
    const sc = scope(terms);
    const scName = sc === 'all' ? 'All terms' : (terms.find((t) => t.id === sc) || {}).name || '';
    const list = byScope(byType(everything), sc);
    const t = tally(list, now);
    const backlogNow = list.filter((s) => statusOf(s, now) === 'missed').length;

    // modules
    const modRows = st.modules
      .map((m) => {
        const ms = list.filter((s) => s.moduleId === m.id);
        if (!ms.length) return '';
        const mt = tally(ms, now);
        const parts = m.parts
          .map((p) => {
            const ps = ms.filter((s) => s.partId === p.id);
            if (!ps.length) return '';
            const pt = tally(ps, now);
            return `<div class="mpart"><span>${esc(p.name)}</span><span class="num">${pct(pt.live)} · ${pct(pt.done)}</span></div>`;
          })
          .join('');
        return `<button class="mrow" data-module="${m.id}" style="--c:${m.color}">
          <div class="mrow-top"><span class="dot"></span><span class="mrow-name">${esc(m.name)}</span>
            <span class="mrow-pct num">${pct(mt.live)}<small> live</small> · ${pct(mt.done)}<small> done</small></span>${icon('chevron', 'chev')}</div>
          ${bar(mt)}${parts ? `<div class="mparts">${parts}</div>` : ''}</button>`;
      })
      .join('');

    // weekly series
    const wks = weeksSoFar(list, sc, now);
    const wkBars = wks.map(({ w, sessions }) => {
      const wt = tally(sessions, now);
      return {
        label: String(w.week),
        group: w.termName,
        empty: !wt.finished,
        segs: wt.finished ? [{ v: (wt.att / wt.finished) * 100, cls: 'seg-a' }, { v: (wt.caught / wt.finished) * 100, cls: 'seg-c' }] : [],
        info: wt.finished
          ? `${esc(w.termName)} · Week ${w.week}: <b>${pct(wt.live)}</b> live · <b>${pct(wt.done)}</b> done <span class="faint">(${wt.finished} session${wt.finished === 1 ? '' : 's'})</span>`
          : `${esc(w.termName)} · Week ${w.week}: nothing finished`,
      };
    });
    const blBars = wks.map(({ w, end }) => {
      const n = backlogAt(list, Math.min(end, now));
      return { label: String(w.week), group: w.termName, segs: [{ v: n, cls: 'seg-b' }], n, info: `End of ${esc(w.termName)} · Week ${w.week}${end > now ? ' (so far)' : ''}: <b>${n}</b> to catch up` };
    });
    const blMax = Math.max(4, ...blBars.map((b) => b.n));
    const blStep = Math.ceil(blMax / 4);

    view.innerHTML = `
      ${termSeg(terms, sc)}
      ${typeChips(everything)}

      <button class="hero" data-open-att>
        <div class="hero-text">
          <div class="tile-label">Attendance${scName ? ` · ${esc(scName)}` : ''}</div>
          <div class="hero-num">${pct(t.live)}</div>
          <div class="tile-sub"><b>${pct(t.done)}</b>&nbsp;incl. caught up · ${t.finished} sessions</div>
          <div class="hero-link">See breakdown ${icon('chevron')}</div>
        </div>
        ${donut({ size: 112, stroke: 13, segs: segsOf(t) })}
      </button>

      <button class="tile tile-wide" data-goto-catchup>
        <div><div class="tile-label">Backlog now</div><div class="tile-num">${backlogNow}</div></div>
        <div class="tile-sub">${backlogNow ? 'sessions to catch up' : 'nothing to catch up'} ${icon('chevron', 'chev')}</div>
      </button>

      <div class="section"><div class="section-title">Modules</div>
        <div class="mlist">${modRows || '<p class="section-note">No sessions here yet.</p>'}</div></div>

      <div class="section"><div class="section-title">Weekly attendance</div>
        <div class="chart-card"><div class="legend"><span><i class="seg-a"></i>Attended live</span><span><i class="seg-c"></i>Caught up</span></div>
        <div class="readout" data-readout="wk"></div><div data-chart="wk"></div></div></div>

      <div class="section"><div class="section-title">Backlog at the end of each week</div>
        <div class="chart-card"><div class="readout" data-readout="bl"></div><div data-chart="bl"></div></div></div>`;

    view.querySelectorAll('[data-term]').forEach((b) => (b.onclick = () => setSetting('statsTerm', b.dataset.term, app)));
    view.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => setSetting('statsType', b.dataset.type, app)));
    view.querySelector('[data-open-att]').onclick = () => app.push(attendancePage());
    view.querySelector('[data-goto-catchup]').onclick = () => app.home('catchup');
    view.querySelectorAll('[data-module]').forEach((b) => (b.onclick = () => app.push(modulePage(b.dataset.module))));
    const seg = view.querySelector('.term-seg .on');
    if (seg) seg.scrollIntoView({ block: 'nearest', inline: 'center' });

    const mount = (key, bars, opts) => {
      const box = view.querySelector(`[data-chart="${key}"]`);
      const out = view.querySelector(`[data-readout="${key}"]`);
      if (!bars.length) {
        box.innerHTML = '<p class="section-note">Appears once the first week of this term has started.</p>';
        return;
      }
      let sel = bars.length - 1;
      const draw = () => {
        box.innerHTML = barChart({ width: box.clientWidth || 320, bars, selected: sel, ...opts });
        out.innerHTML = bars[sel].info;
      };
      draw();
      box.addEventListener('click', (e) => {
        const h = e.target.closest('[data-bar]');
        if (!h) return;
        sel = +h.dataset.bar;
        draw();
      });
    };
    mount('wk', wkBars, { max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` });
    mount('bl', blBars, { max: blStep * 4, ticks: [0, blStep * 2, blStep * 4], fmt: (v) => String(v) });
  },
};

// ---------- attendance breakdown (pie charts) ----------
export function attendancePage() {
  return {
    render(view, app) {
      const st = getState();
      const now = Date.now();
      const ty = typeFilter();
      const typeName = ty === 'all' ? '' : (allTypes(st).find((x) => x.id === ty) || {}).label;
      app.header({ back: true, eyebrow: typeName ? `${typeName} only` : 'Finished sessions', title: 'Attendance', small: true });
      const list = byType(allSessions());
      const year = tally(list, now);
      const terms = sortedTerms(st).filter((t) => list.some((s) => s.termId === t.id && s.endTs <= now));

      const termCards = terms
        .map((t) => {
          const tt = tally(list.filter((s) => s.termId === t.id), now);
          return `<button class="dn-card" data-pick-term="${esc(t.id)}">
            ${donut({ size: 92, stroke: 11, segs: segsOf(tt), center: pct(tt.live) })}
            <div class="dn-name">${esc(t.name)}</div><div class="dn-meta">${pct(tt.done)} done · ${tt.finished}</div></button>`;
        })
        .join('');

      const modCards = st.modules
        .map((m) => {
          const mt = tally(list.filter((s) => s.moduleId === m.id), now);
          if (!mt.finished) return '';
          return `<button class="dn-card" data-module="${m.id}" style="--c:${m.color}">
            ${donut({ size: 92, stroke: 11, segs: segsOf(mt), center: pct(mt.live) })}
            <div class="dn-name"><span class="dot"></span>${esc(m.code || m.name)}</div>
            <div class="dn-meta">${pct(mt.done)} done · ${mt.finished}</div></button>`;
        })
        .join('');

      view.innerHTML = `
        <div class="section"><div class="section-title">Whole year</div>
          <div class="dn-hero stack">
            ${donut({ size: 176, stroke: 18, segs: segsOf(year), center: pct(year.live), sub: 'attended live' })}
            <div class="dn-side">${legendRows(year)}
              <div class="dn-total">Completion <b>${pct(year.done)}</b><br><span class="faint">${year.finished} finished sessions</span></div></div>
          </div></div>

        ${terms.length > 1 ? `<div class="section"><div class="section-title">By term</div>
          <div class="dn-grid">${termCards}</div>
          <p class="section-note">Tap a term to see its weekly charts on the Stats page.</p></div>` : ''}

        <div class="section"><div class="section-title">By module</div>
          ${modCards ? `<div class="dn-grid">${modCards}</div>` : '<p class="section-note">Nothing finished yet.</p>'}
          <p class="section-note">Centre number = attended live. Tap a module for its sessions.</p></div>`;

      view.querySelectorAll('[data-module]').forEach((b) => (b.onclick = () => app.push(modulePage(b.dataset.module))));
      view.querySelectorAll('[data-pick-term]').forEach(
        (b) =>
          (b.onclick = () => {
            update((s) => {
              s.settings.statsTerm = b.dataset.pickTerm;
            }, 'settings');
            app.pop();
          })
      );
    },
  };
}

// ---------- module page ----------
export function modulePage(moduleId) {
  let showUpcoming = false;
  return {
    render(view, app) {
      const st = getState();
      const m = moduleById(st, moduleId);
      if (!m) {
        app.header({ back: true, title: 'Module', small: true });
        view.innerHTML = '<div class="empty">This module was deleted.</div>';
        return;
      }
      const now = Date.now();
      const ty = typeFilter();
      const typeName = ty === 'all' ? '' : (allTypes(st).find((x) => x.id === ty) || {}).label;
      app.header({ back: true, eyebrow: m.code + (typeName ? ` · ${typeName} only` : ''), title: m.name, small: true });

      const list = byType(allSessions().filter((s) => s.moduleId === m.id));
      const summary = () => {
        const t = tally(list, now);
        const parts = m.parts.length
          ? `<div class="section"><div class="section-title">Parts</div><div class="group">${m.parts
              .map((p) => {
                const pt = tally(list.filter((s) => s.partId === p.id), now);
                return `<div class="row prow"><div class="grow"><div class="label">${esc(p.name)}</div>
                  <div class="sub">${esc(partRangeLabel(st, p))}</div>${bar(pt)}</div>
                  <div class="prow-pct num"><b>${pct(pt.live)}</b><span>${pct(pt.done)} done</span></div></div>`;
              })
              .join('')}</div></div>`
          : '';
        return `<div class="dn-hero mod" style="--c:${esc(m.color)}">
            ${donut({ size: 116, stroke: 14, segs: segsOf(t), center: pct(t.live), sub: 'live' })}
            <div class="dn-side">${legendRows(t)}<div class="dn-total">Completion <b>${pct(t.done)}</b></div></div>
          </div>${parts}`;
      };

      const started = list.filter((s) => s.startTs <= now).reverse();
      const upcoming = list.filter((s) => s.startTs > now);
      const groupHTML = (items) => {
        let html = '', cur = null;
        for (const s of items) {
          const key = `${s.termName} · Week ${s.termWeek}`;
          if (key !== cur) {
            if (cur) html += '</div></div>';
            html += `<div class="section"><div class="section-title">${esc(key)}</div><div class="group">`;
            cur = key;
          }
          const meta = sessionMeta(s);
          html += `<button class="row srow" data-sid="${esc(s.id)}" data-state="${statusOf(s, now)}" style="--c:${esc(meta.color)}">
            <span class="sdot">${icon('check', 's-check')}${icon('caught', 's-caught')}</span>
            <div class="grow"><div class="label">${esc(sessionName(s))}</div>
              <div class="sub">${esc(meta.typeLabel)} · ${fmtShortDate(s.date)} · ${s.start}</div></div>
            <span class="sstate"></span></button>`;
        }
        if (cur) html += '</div></div>';
        return html;
      };

      view.innerHTML = `
        <div data-summary>${summary()}</div>
        <p class="section-note" style="margin:-8px 4px 18px">Tap a session to log it, or tap a logged one to undo.</p>
        ${groupHTML(started) || '<p class="section-note">No sessions yet.</p>'}
        ${upcoming.length ? (showUpcoming ? `<div class="section-title" style="margin-top:8px">Upcoming</div>${groupHTML(upcoming)}` : `<button class="add-btn" data-show-up>Show ${upcoming.length} upcoming</button>`) : ''}`;

      view.addEventListener('attend:logged', () => {
        view.querySelector('[data-summary]').innerHTML = summary();
      });
      const up = view.querySelector('[data-show-up]');
      if (up)
        up.onclick = () => {
          showUpcoming = true;
          const y = app.scroller.scrollTop;
          app.rerender();
          app.scroller.scrollTop = y;
        };
    },
  };
}
