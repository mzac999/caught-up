// Editors for modules and the weekly template (terms live in terms.js).
// Used by both the first-run setup (mode 'setup') and Settings (mode 'settings').
// Every save goes through commit(), which first locks in past sessions so
// editing the timetable never rewrites history or loses attendance.

import { getState, update, uid } from '../store.js';
import { freezePast, moduleById, allTypes, typeLabel, REPEAT_LABELS, weekKey } from '../sessions.js';
import { DAY_NAMES, DAY_SHORT, sortedTerms, hhmmToMinutes, minutesToHHMM } from '../calendar.js';
import { icon, typeIcon } from '../ui/icons.js';
import { esc, on } from '../ui/dom.js';
import { confirmSheet, toast } from '../ui/toast.js';

export const PALETTE = [
  '#5B8CFF', '#2EC4D6', '#34C789', '#9BD34A', '#F2B33D', '#FF9F43',
  '#FF7A59', '#FF6B9A', '#E46CF0', '#B48CFF', '#7C83FF', '#C9A27E',
];

function commit(mutator) {
  update((st) => {
    freezePast(st);
    mutator(st);
  });
}

function stepHeader(app, n, title) {
  app.header({ steps: { n, total: 3 }, eyebrow: `Step ${n} of 3`, title });
}

function setupFooter(app, { nextLabel = 'Next', canNext, onBack, onNext }) {
  const f = app.footer(`<button class="btn ghost" data-b>Back</button><button class="btn primary" data-n ${canNext ? '' : 'disabled'}>${nextLabel}</button>`);
  f.querySelector('[data-b]').onclick = () => onBack(app);
  f.querySelector('[data-n]').onclick = () => onNext(app);
  return f.querySelector('[data-n]');
}

// ======================================================================
// MODULES
// ======================================================================
export function modulesPage(opts) {
  const { mode } = opts;
  return {
    render(view, app) {
      const state = getState();
      if (mode === 'setup') stepHeader(app, 2, 'Modules');
      else app.header({ back: true, title: 'Modules', small: true });

      view.innerHTML = `
        ${mode === 'setup' ? '<p class="lead">Add each module with a colour and its two parts.</p>' : ''}
        ${state.modules.length ? `<div class="section"><div class="group">
          ${state.modules.map((m) => `
            <button class="row" data-mod="${m.id}" style="--c:${m.color}">
              <span class="dot"></span>
              <div class="grow"><div class="label">${esc(m.name)}</div>
                <div class="sub">${m.parts.length ? m.parts.map((p) => esc(p.name)).join(' · ') : 'Not split into parts'}</div></div>
              <span class="chip-code">${esc(m.code)}</span>
              ${icon('chevron', 'chev')}
            </button>`).join('')}
        </div></div>` : ''}
        <button class="add-btn" data-add>${icon('plus')}Add module</button>`;

      on(view, '[data-mod]', (el) => app.push(moduleFormPage({ id: el.dataset.mod, mode })));
      on(view, '[data-add]', () => app.push(moduleFormPage({ mode })));

      if (mode === 'setup') {
        setupFooter(app, { canNext: state.modules.length > 0, onBack: opts.onBack, onNext: opts.onNext });
      }
    },
  };
}

// ---------- module parts ----------
// A module can be one block (parts = []) or split into 2–5 parts. Each part runs
// From a term/week To a term/week. Week 99 = "end of that term"; to = null = no end.
const MAX_PARTS = 5;
const END_W = 99;

function rangeKey(ref, isEnd) {
  if (!ref) return Infinity;
  return ref.t * 100 + Math.min(ref.w, END_W);
}

function nextStart(ref, terms) {
  if (!ref) return null;
  const t = terms[ref.t];
  if (ref.w >= END_W || (t && ref.w >= t.weeks)) return { t: ref.t + 1, w: 1 };
  return { t: ref.t, w: ref.w + 1 };
}

function defaultParts(terms) {
  // Part 1: the first term; Part 2: the following term onwards
  // (if only one term exists yet, Part 2 starts in "Next term")
  return [
    { id: uid('p'), name: '', from: { t: 0, w: 1 }, to: { t: 0, w: END_W } },
    { id: uid('p'), name: '', from: { t: 1, w: 1 }, to: null },
  ];
}

/** New part picks up where the last one ends (the last one gets an end if it had none). */
function addPart(parts, terms) {
  const n = terms.length;
  const prev = parts[parts.length - 1];
  if (!prev.to) prev.to = { t: Math.min(prev.from.t, n), w: END_W };
  let from = nextStart(prev.to, terms) || { t: n, w: 1 };
  if (from.t > n) from = { t: n, w: 1 }; // can't point past "Next term"
  parts.push({ id: uid('p'), name: '', from, to: null });
}

function termSelect(terms, ref, kind, i) {
  const n = terms.length;
  const opts = terms.map((t) => [String(t.index), t.name]);
  opts.push([String(n), 'Next term']);
  if (kind === 'to') opts.push(['none', 'No end']);
  const cur = ref ? String(Math.min(ref.t, n)) : 'none';
  return `<select class="pill-select" data-p${kind}-term="${i}" aria-label="${kind === 'from' ? 'From' : 'To'} term">${opts
    .map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;
}

function weekSelect(terms, ref, kind, i) {
  if (!ref) return '';
  const t = terms[ref.t];
  const opts = [];
  if (kind === 'to') opts.push([String(END_W), 'End']);
  if (t) for (let w = 1; w <= t.weeks; w++) opts.push([String(w), `Wk ${w}`]);
  else if (kind === 'from') opts.push(['1', 'Wk 1']);
  const cur = String(t && ref.w < END_W ? Math.min(ref.w, t.weeks) : kind === 'to' ? END_W : 1);
  return `<select class="pill-select" data-p${kind}-week="${i}" aria-label="${kind === 'from' ? 'From' : 'To'} week">${opts
    .map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)
    .join('')}</select>`;
}

function overlaps(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      if (rangeKey(b.from) <= rangeKey(a.to, true) && rangeKey(a.from) <= rangeKey(b.to, true)) out.push([i + 1, j + 1]);
    }
  return out;
}

function initials(name) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !/^(and|of|the|for|in)$/i.test(w));
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
}

export function moduleFormPage({ id, mode }) {
  const state = getState();
  const existing = id ? moduleById(state, id) : null;
  const used = new Set(state.modules.map((m) => m.color));
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uid('m'), name: '', code: '', color: PALETTE.find((c) => !used.has(c)) || PALETTE[0], parts: [] };
  if (!Array.isArray(draft.parts)) draft.parts = [];
  let codeTouched = !!existing;

  return {
    render(view, app) {
      app.header({ back: true, title: existing ? 'Edit module' : 'New module', small: true });
      const st = getState();
      const terms = sortedTerms(st);
      const split = draft.parts.length > 0;
      const clash = overlaps(draft.parts);

      view.innerHTML = `
        <div class="section"><div class="group">
          <input class="field" data-f="name" placeholder="Module name" value="${esc(draft.name)}" autocomplete="off" aria-label="Module name">
          <label class="row"><span class="label grow">Short code</span>
            <input type="text" data-f="code" maxlength="6" placeholder="e.g. CSP" value="${esc(draft.code)}" autocapitalize="characters" autocomplete="off"></label>
        </div></div>

        <div class="section"><div class="section-title">Colour</div>
          <div class="group"><div class="swatches">
            ${PALETTE.map((c) => `<button class="swatch ${c === draft.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}
          </div></div></div>

        <div class="section"><div class="group">
          <label class="row"><div class="grow"><div class="label">Split into parts</div>
            <div class="sub">${split ? `${draft.parts.length} parts` : 'One block for the whole module'}</div></div>
            <span class="switch"><input type="checkbox" data-split ${split ? 'checked' : ''}><span></span></span></label>
        </div>
        ${split ? '' : '<p class="section-note">Turn on if the module has separate parts, like two topics or lecturers across the year. Sessions are then named after the part.</p>'}
        </div>

        ${draft.parts.map((p, i) => `
          <div class="section">
            <div class="section-head"><span class="section-title">Part ${i + 1}</span>
              ${draft.parts.length > 2 ? `<button class="link-btn" data-remove="${i}">Remove</button>` : ''}</div>
            <div class="group">
              <input class="field" data-part-name="${i}" placeholder="Part ${i + 1} name" value="${esc(p.name)}" autocomplete="off" aria-label="Part ${i + 1} name">
              <div class="row"><span class="label grow">From</span>${termSelect(terms, p.from, 'from', i)}${weekSelect(terms, p.from, 'from', i)}</div>
              <div class="row"><span class="label grow">To</span>${termSelect(terms, p.to, 'to', i)}${weekSelect(terms, p.to, 'to', i)}</div>
            </div></div>`).join('')}

        ${split ? `
          ${draft.parts.length < MAX_PARTS ? `<button class="add-btn" data-add-part>${icon('plus')}Add part</button>` : `<p class="section-note">Up to ${MAX_PARTS} parts.</p>`}
          ${clash.length ? `<p class="section-note warn">${clash.map(([a, b]) => `Parts ${a} and ${b} overlap`).join(' · ')}. In overlapping weeks, "Auto" sessions use the earlier part.</p>` : ''}
          <p class="section-note">"Next term" means the term after the ones you've added, so a part can be set up before its dates are known.</p>` : ''}`;

      const keepScroll = () => {
        const y = app.scroller.scrollTop;
        this.render(view, app);
        app.scroller.scrollTop = y;
      };

      view.oninput = (e) => {
        const t = e.target;
        if (t.dataset.f === 'name') {
          draft.name = t.value;
          if (!codeTouched) {
            draft.code = initials(t.value);
            view.querySelector('[data-f="code"]').value = draft.code;
          }
        } else if (t.dataset.f === 'code') {
          codeTouched = true;
          draft.code = t.value.toUpperCase();
        } else if (t.dataset.partName != null) draft.parts[t.dataset.partName].name = t.value;
      };
      view.onchange = (e) => {
        const t = e.target, d = t.dataset;
        if (d.split != null) {
          draft.parts = t.checked ? defaultParts(terms) : [];
          return keepScroll();
        }
        let p;
        if (d.pfromTerm != null) {
          p = draft.parts[d.pfromTerm];
          p.from = { t: +t.value, w: 1 };
        } else if (d.pfromWeek != null) {
          p = draft.parts[d.pfromWeek];
          p.from = { ...p.from, w: +t.value };
        } else if (d.ptoTerm != null) {
          p = draft.parts[d.ptoTerm];
          p.to = t.value === 'none' ? null : { t: +t.value, w: END_W };
        } else if (d.ptoWeek != null) {
          p = draft.parts[d.ptoWeek];
          p.to = { ...p.to, w: +t.value };
        } else return;
        keepScroll();
      };
      view.onclick = (e) => {
        const sw = e.target.closest('[data-color]');
        if (sw) {
          draft.color = sw.dataset.color;
          view.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === sw));
          return;
        }
        if (e.target.closest('[data-add-part]')) {
          addPart(draft.parts, terms);
          keepScroll();
          return;
        }
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          draft.parts.splice(+rm.dataset.remove, 1);
          keepScroll();
        }
      };

      const f = app.footer(`${existing ? `<button class="btn danger icon-only" data-del aria-label="Delete module">${icon('trash')}</button>` : ''}<button class="btn primary" data-save>Save</button>`);
      f.querySelector('[data-save]').onclick = () => {
        if (!draft.name.trim()) {
          toast('Give the module a name');
          view.querySelector('[data-f="name"]').focus();
          return;
        }
        draft.name = draft.name.trim();
        draft.code = (draft.code || initials(draft.name)).trim();
        draft.parts.forEach((p, i) => {
          p.name = p.name.trim() || `Part ${i + 1}`;
          if (p.from && p.to && rangeKey(p.from) > rangeKey(p.to)) [p.from, p.to] = [{ t: p.to.t, w: Math.min(p.to.w, 1) || 1 }, { t: p.from.t, w: END_W }];
        });
        commit((s) => {
          const i = s.modules.findIndex((m) => m.id === draft.id);
          if (i >= 0) s.modules[i] = draft;
          else s.modules.push(draft);
        });
        app.pop();
      };
      const del = f.querySelector('[data-del]');
      if (del)
        del.onclick = async () => {
          const ok = await confirmSheet({
            title: `Delete ${existing.name}?`,
            message: 'Its timetable slots are removed. Past sessions and attendance you already logged are kept.',
            confirmLabel: 'Delete module',
            danger: true,
          });
          if (!ok) return;
          commit((s) => {
            s.modules = s.modules.filter((m) => m.id !== draft.id);
            s.template = s.template.filter((t) => t.moduleId !== draft.id);
          });
          app.pop();
        };
    },
  };
}

// ======================================================================
// WEEKLY TEMPLATE
// ======================================================================
function repeatText(st, r) {
  if (!r || r.kind !== 'specific') return REPEAT_LABELS[(r && r.kind) || 'every'];
  const n = (r.weeks || []).length;
  return n ? `${n} specific week${n > 1 ? 's' : ''}` : 'No weeks chosen';
}

export function templatePage(opts) {
  const { mode } = opts;
  return {
    render(view, app) {
      const st = getState();
      if (mode === 'setup') stepHeader(app, 3, 'Typical week');
      else app.header({ back: true, title: 'Weekly timetable', small: true });

      const hasWeekend = st.template.some((t) => t.day >= 5);
      const days = st.settings.showWeekends || hasWeekend ? 7 : 5;
      let html = mode === 'setup'
        ? '<p class="lead">Enter one typical week. It repeats across every week of your terms using each session\'s pattern.</p>'
        : '<p class="lead">Changes apply from now on. Attendance you\'ve logged is never lost.</p>';
      for (let d = 0; d < days; d++) {
        const slots = st.template.filter((t) => t.day === d).sort((a, b) => a.start.localeCompare(b.start));
        html += `<div class="section"><div class="section-title">${DAY_NAMES[d]}</div><div class="group">
          ${slots.map((t) => {
            const m = moduleById(st, t.moduleId);
            const split = m && m.parts.length;
            const part = !split ? '' : t.partId === 'auto' || !m.parts.some((p) => p.id === t.partId) ? 'Auto part' : m.parts.find((p) => p.id === t.partId).name;
            return `<button class="row" data-slot="${t.id}" style="--c:${m ? m.color : '#888'}">
              <span class="dot"></span>
              <div class="grow">
                <div class="label num">${t.start}–${t.end} <span class="chip-code">${esc(m ? m.code : '?')}</span></div>
                <div class="sub">${esc(typeLabel(t.type))}${part ? ' · ' + esc(part) : ''} · ${repeatText(st, t.repeat)}${t.location ? ' · ' + esc(t.location) : ''}</div>
              </div>${icon('chevron', 'chev')}</button>`;
          }).join('')}
          <button class="row accent" data-add-day="${d}">${icon('plus')}<span class="label">Add session</span></button>
        </div></div>`;
      }
      view.innerHTML = html;

      on(view, '[data-slot]', (el) => app.push(slotFormPage({ id: el.dataset.slot, mode })));
      on(view, '[data-add-day]', (el) => app.push(slotFormPage({ day: +el.dataset.addDay, mode })));

      if (mode === 'setup') {
        setupFooter(app, { nextLabel: 'Finish', canNext: st.template.length > 0, onBack: opts.onBack, onNext: opts.onNext });
      }
    },
  };
}

export function slotFormPage({ id, day = 0, mode, prefill = null }) {
  const st0 = getState();
  const existing = id ? st0.template.find((t) => t.id === id) : null;
  const last = st0.template[st0.template.length - 1];
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : prefill || {
        id: uid('t'),
        day,
        start: '09:00',
        end: '10:00',
        moduleId: (last && last.moduleId) || (st0.modules[0] && st0.modules[0].id) || '',
        partId: 'auto',
        type: 'lecture',
        location: '',
        repeat: { kind: 'every', weeks: [] },
      };
  if (!draft.repeat) draft.repeat = { kind: 'every', weeks: [] };
  let addingType = false;

  return {
    render(view, app) {
      const st = getState();
      app.header({ back: true, title: existing ? 'Edit session' : 'New session', small: true });
      const mod = moduleById(st, draft.moduleId);
      if (mod && draft.partId !== 'auto' && !mod.parts.some((p) => p.id === draft.partId)) draft.partId = 'auto';
      const showDays = st.settings.showWeekends || draft.day >= 5 ? 7 : 5;

      const seg = (name, items, val) =>
        `<div class="seg ${name === 'day' ? 'days' : ''}" data-seg="${name}">${items
          .map(([v, label]) => `<button data-v="${esc(v)}" class="${String(v) === String(val) ? 'on' : ''}">${label}</button>`)
          .join('')}</div>`;

      let weeksGrid = '';
      if (draft.repeat.kind === 'specific') {
        weeksGrid = '<div class="group" style="margin-top:10px"><div class="weeks-grid">';
        for (const t of sortedTerms(st)) {
          weeksGrid += `<div class="term-label">${esc(t.name)}</div>`;
          for (let w = 1; w <= t.weeks; w++) {
            const k = weekKey(t.id, w);
            weeksGrid += `<button class="wk ${draft.repeat.weeks.includes(k) ? 'on' : ''}" data-wk="${k}">${w}</button>`;
          }
        }
        weeksGrid += '</div></div><p class="section-note">Weeks in terms you add later can be picked here once they exist.</p>';
      }

      view.innerHTML = `
        <div class="section"><div class="section-title">Day</div>
          ${seg('day', DAY_SHORT.slice(0, showDays).map((d, i) => [i, d]), draft.day)}</div>

        <div class="section"><div class="section-title">Time</div><div class="group">
          <label class="row"><span class="label grow">Starts</span><input type="time" data-f="start" value="${draft.start}" step="300"></label>
          <label class="row"><span class="label grow">Ends</span><input type="time" data-f="end" value="${draft.end}" step="300"></label>
        </div></div>

        <div class="section"><div class="section-title">Module</div>
          <div class="chips">${st.modules.map((m) => `
            <button class="chip ${m.id === draft.moduleId ? 'on' : ''}" data-module="${m.id}" style="--c:${m.color}"><span class="dot"></span>${esc(m.code)}</button>`).join('')}
          </div></div>

        ${mod && mod.parts.length ? `<div class="section"><div class="section-title">Part</div>
          ${seg('part', [['auto', 'Auto'], ...mod.parts.map((p) => [p.id, esc(p.name)])], draft.partId)}
          <p class="section-note">${draft.partId === 'auto' ? 'Uses whichever part runs that week.' : 'Only generated in the weeks this part runs.'}</p></div>` : ''}

        <div class="section"><div class="section-title">Type</div>
          <div class="chips">
            ${allTypes(st).map((t) => `<button class="chip ${t.id === draft.type ? 'on' : ''}" data-type="${esc(t.id)}">${typeIcon(t.id)}${esc(t.label)}</button>`).join('')}
            <button class="chip ${addingType ? 'on' : ''}" data-type-other>${icon('plus')}Other</button>
          </div>
          ${addingType ? `<div class="group" style="margin-top:10px"><div class="row">
              <input type="text" class="grow-input" data-new-type placeholder="New type, e.g. Workshop" maxlength="24" autocomplete="off" aria-label="New session type">
              <button class="btn-sm" data-type-save>Add</button></div></div>
            <p class="section-note">Your new type is saved and offered for every module. Rename or remove it in Settings → Session types.</p>` : ''}
        </div>

        <div class="section"><div class="group">
          <label class="row"><span class="label">Location</span><input type="text" data-f="location" placeholder="Optional" value="${esc(draft.location)}" autocomplete="off"></label>
        </div></div>

        <div class="section"><div class="section-title">Repeats</div>
          ${seg('repeat', Object.entries(REPEAT_LABELS).map(([k, l]) => [k, l.replace(' weeks', '').replace(' week', '')]), draft.repeat.kind)}
          ${draft.repeat.kind === 'odd' ? '<p class="section-note">Weeks 1, 3, 5… of each term.</p>' : ''}
          ${draft.repeat.kind === 'even' ? '<p class="section-note">Weeks 2, 4, 6… of each term.</p>' : ''}
          ${weeksGrid}
        </div>`;

      const keepScroll = () => {
        const y = app.scroller.scrollTop;
        this.render(view, app);
        app.scroller.scrollTop = y;
      };

      view.oninput = (e) => {
        const f = e.target.dataset.f;
        if (f === 'location') draft.location = e.target.value;
      };
      view.onchange = (e) => {
        const f = e.target.dataset.f;
        if (f === 'start' && e.target.value) {
          const len = hhmmToMinutes(draft.end) - hhmmToMinutes(draft.start);
          draft.start = e.target.value;
          // keep the same duration when the start moves
          const newEnd = Math.min(hhmmToMinutes(draft.start) + Math.max(len, 30), 23 * 60 + 55);
          draft.end = minutesToHHMM(newEnd);
          view.querySelector('[data-f="end"]').value = draft.end;
        } else if (f === 'end' && e.target.value) draft.end = e.target.value;
      };
      const addType = () => {
        const input = view.querySelector('[data-new-type]');
        const label = (input && input.value.trim()) || '';
        if (!label) return toast('Type a name for the new type');
        const dupe = allTypes().find((t) => t.label.toLowerCase() === label.toLowerCase());
        if (dupe) draft.type = dupe.id;
        else {
          const nt = { id: uid('type'), label };
          update((s) => {
            s.customTypes = [...(s.customTypes || []), nt];
          }, 'settings');
          draft.type = nt.id;
          toast(`${label} added`);
        }
        addingType = false;
        keepScroll();
      };
      view.onkeydown = (e) => {
        if (e.key === 'Enter' && e.target.dataset.newType != null) {
          e.preventDefault();
          addType();
        }
      };

      view.onclick = (e) => {
        const ty = e.target.closest('[data-type]');
        if (ty) {
          draft.type = ty.dataset.type;
          addingType = false;
          keepScroll();
          return;
        }
        if (e.target.closest('[data-type-other]')) {
          addingType = !addingType;
          keepScroll();
          if (addingType) view.querySelector('[data-new-type]').focus();
          return;
        }
        if (e.target.closest('[data-type-save]')) return addType();
        const segBtn = e.target.closest('[data-seg] button');
        if (segBtn) {
          const name = segBtn.parentElement.dataset.seg;
          const v = segBtn.dataset.v;
          if (name === 'day') draft.day = +v;
          if (name === 'part') draft.partId = v;
          if (name === 'repeat') draft.repeat.kind = v;
          keepScroll();
          return;
        }
        const m = e.target.closest('[data-module]');
        if (m) {
          draft.moduleId = m.dataset.module;
          draft.partId = 'auto';
          keepScroll();
          return;
        }
        const wk = e.target.closest('[data-wk]');
        if (wk) {
          const k = wk.dataset.wk;
          const ws = draft.repeat.weeks;
          const i = ws.indexOf(k);
          if (i >= 0) ws.splice(i, 1);
          else ws.push(k);
          wk.classList.toggle('on', i < 0);
        }
      };

      const f = app.footer(`
        ${existing ? `<button class="btn danger icon-only" data-del aria-label="Delete session">${icon('trash')}</button>
        <button class="btn secondary icon-only" data-dup aria-label="Duplicate">${icon('copy')}</button>` : ''}
        <button class="btn primary" data-save>Save</button>`);

      const valid = () => {
        if (!draft.moduleId || !moduleById(getState(), draft.moduleId)) return toast('Choose a module'), false;
        if (hhmmToMinutes(draft.end) <= hhmmToMinutes(draft.start)) return toast('End time must be after start'), false;
        if (draft.repeat.kind === 'specific' && !draft.repeat.weeks.length) return toast('Pick at least one week'), false;
        return true;
      };
      const save = () =>
        commit((s) => {
          const clean = { ...draft, location: draft.location.trim() };
          if (clean.repeat.kind !== 'specific') clean.repeat = { kind: clean.repeat.kind, weeks: [] };
          const i = s.template.findIndex((t) => t.id === clean.id);
          if (i >= 0) s.template[i] = clean;
          else s.template.push(clean);
        });

      f.querySelector('[data-save]').onclick = () => {
        if (!valid()) return;
        save();
        app.pop();
      };
      const dup = f.querySelector('[data-dup]');
      if (dup)
        dup.onclick = () => {
          if (!valid()) return;
          save();
          const copy = JSON.parse(JSON.stringify(draft));
          copy.id = uid('t');
          app.replace(slotFormPage({ mode, prefill: copy }));
          toast('Saved · now editing a copy');
        };
      const del = f.querySelector('[data-del]');
      if (del)
        del.onclick = async () => {
          const ok = await confirmSheet({
            title: 'Delete this session?',
            message: 'Future occurrences are removed. Past sessions and logged attendance are kept.',
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
          commit((s) => {
            s.template = s.template.filter((t) => t.id !== draft.id);
          });
          app.pop();
        };
    },
  };
}
