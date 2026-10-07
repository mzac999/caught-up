// TERMS — list + add/edit form. Used in first-run setup (step 1) and Settings.
// Start with no terms; add whichever term you know the dates for, add more any time.

import { getState, update, uid } from '../store.js';
import { freezePast } from '../sessions.js';
import {
  sortedTerms, termEndDate, weeksBetween, fmtShortDate, mondayOf, parseISO, addDays, toISO, startOfDay,
} from '../calendar.js';
import { icon } from '../ui/icons.js';
import { esc, on } from '../ui/dom.js';
import { confirmSheet, toast } from '../ui/toast.js';

const MAX_WEEKS = 30;

/**
 * Module parts point at weeks by term position ({t, w}). When terms are added,
 * removed or re-dated their order can change, so re-point every ref.
 */
function remapRefs(st, oldIds, newIds) {
  const map = (ref, isEnd) => {
    if (!ref) return ref;
    if (ref.t >= oldIds.length) {
      // "next term" placeholder -> the first term after all the previously known ones
      const lastOld = Math.max(-1, ...oldIds.map((x) => newIds.indexOf(x)));
      return { t: lastOld + 1, w: ref.w };
    }
    const id = oldIds[ref.t];
    const nt = newIds.indexOf(id);
    if (nt >= 0) return { t: nt, w: ref.w };
    // the term was deleted: start -> following term, end -> end of the previous term
    const before = oldIds.slice(0, ref.t).filter((x) => newIds.includes(x)).length;
    return isEnd ? { t: Math.max(0, before - 1), w: 99 } : { t: before, w: 1 };
  };
  for (const m of st.modules)
    for (const p of m.parts) {
      p.from = map(p.from, false);
      p.to = map(p.to, true);
    }
}

function commitTerms(mutator) {
  update((st) => {
    freezePast(st);
    const oldIds = sortedTerms(st).map((t) => t.id);
    mutator(st);
    remapRefs(st, oldIds, sortedTerms(st).map((t) => t.id));
  });
}

function termRange(t) {
  return `${fmtShortDate(mondayOf(parseISO(t.start)))} – ${fmtShortDate(termEndDate(t))}`;
}

function termStatus(t) {
  const today = startOfDay(new Date());
  const m = mondayOf(parseISO(t.start));
  if (today < m) return 'Upcoming';
  if (today > termEndDate(t)) return 'Finished';
  return 'Now';
}

// ======================================================================
// LIST
// ======================================================================
export function termsListPage(opts) {
  const { mode } = opts;
  return {
    render(view, app) {
      const st = getState();
      const terms = sortedTerms(st);
      if (mode === 'setup') app.header({ steps: { n: 1, total: 3 }, eyebrow: 'Step 1 of 3', title: 'Terms' });
      else app.header({ back: true, title: 'Terms', small: true });

      view.innerHTML = `
        <p class="lead">${
          mode === 'setup'
            ? 'Add the term you have dates for. You can add the rest later, whenever you know them.'
            : 'Add a new term or tap one to change it. Past sessions keep their dates.'
        }</p>
        ${terms.length ? `<div class="section"><div class="group">
          ${terms.map((t) => {
            const s = termStatus(t);
            return `<button class="row" data-term="${esc(t.id)}">
              <div class="grow"><div class="label">${esc(t.name)}</div>
                <div class="sub">${termRange(t)} · ${t.weeks} week${t.weeks === 1 ? '' : 's'}</div></div>
              <span class="pill ${s === 'Now' ? 'on' : ''}">${s}</span>
              ${icon('chevron', 'chev')}</button>`;
          }).join('')}
        </div></div>` : `<div class="empty-card">${icon('today')}<div>No terms yet</div></div>`}
        <button class="add-btn" data-add>${icon('plus')}Add term</button>`;

      on(view, '[data-term]', (el) => app.push(termFormPage({ id: el.dataset.term, mode })));
      on(view, '[data-add]', () => app.push(termFormPage({ mode })));

      if (mode === 'setup') {
        const f = app.footer(`<button class="btn ghost" data-b>Back</button><button class="btn primary" data-n ${terms.length ? '' : 'disabled'}>Next</button>`);
        f.querySelector('[data-b]').onclick = () => opts.onBack(app);
        f.querySelector('[data-n]').onclick = () => opts.onNext(app);
      }
    },
  };
}

// ======================================================================
// ADD / EDIT FORM
// ======================================================================
export function termFormPage({ id, mode, prev = null }) {
  const st0 = getState();
  const existing = id ? st0.terms.find((t) => t.id === id) : null;
  const count = st0.terms.length;
  const last = sortedTerms(st0).slice(-1)[0];
  const draft = existing
    ? { lengthBy: 'weeks', ...existing }
    : {
        id: uid('term'),
        name: '',
        start: '',
        weeks: (prev && prev.weeks) || (last && last.weeks) || 10,
        lengthBy: 'weeks',
        end: '',
      };
  if (draft.lengthBy === 'end' && !draft.end && draft.start) draft.end = toISO(termEndDate(draft));
  const placeholder = `Term ${count + (existing ? 0 : 1)}`;

  return {
    render(view, app) {
      app.header({ back: true, title: existing ? 'Edit term' : 'Add term', small: true });

      const lengthRow =
        draft.lengthBy === 'weeks'
          ? `<div class="row"><span class="label grow">Teaching weeks</span>
               <div class="stepper">
                 <button data-step="-1" aria-label="Fewer weeks">−</button>
                 <input type="number" inputmode="numeric" min="1" max="${MAX_WEEKS}" data-f="weeks" value="${draft.weeks}" aria-label="Weeks">
                 <button data-step="1" aria-label="More weeks">+</button>
               </div></div>`
          : `<label class="row"><span class="label grow">Last day</span><input type="date" data-f="end" value="${esc(draft.end)}"></label>`;

      view.innerHTML = `
        <div class="section"><div class="group">
          <input class="field" data-f="name" placeholder="${placeholder}" value="${esc(draft.name)}" autocomplete="off" aria-label="Term name">
          <label class="row"><span class="label grow">Starts</span><input type="date" data-f="start" value="${esc(draft.start)}"></label>
        </div>
        <p class="section-note">Any day in the first week works. Weeks run Monday to Sunday.</p></div>

        <div class="section"><div class="section-title">Length</div>
          <div class="seg" data-seg="lengthBy">
            <button data-v="weeks" class="${draft.lengthBy === 'weeks' ? 'on' : ''}">Number of weeks</button>
            <button data-v="end" class="${draft.lengthBy === 'end' ? 'on' : ''}">End date</button>
          </div>
          <div class="group" style="margin-top:10px">${lengthRow}</div>
          <p class="section-note" data-summary></p>
        </div>`;

      const summary = view.querySelector('[data-summary]');
      const problem = () => {
        if (!draft.start) return 'Choose a start date.';
        if (draft.lengthBy === 'end') {
          if (!draft.end) return 'Choose the last day of term.';
          if (draft.weeks < 1) return 'The end date is before the start.';
        }
        if (draft.weeks < 1 || draft.weeks > MAX_WEEKS) return `Length must be 1–${MAX_WEEKS} weeks.`;
        const a = mondayOf(parseISO(draft.start));
        const b = addDays(a, draft.weeks * 7);
        for (const t of sortedTerms(getState())) {
          if (t.id === draft.id) continue;
          const c = t.monday, d = addDays(t.monday, t.weeks * 7);
          if (a < d && c < b) return `Overlaps ${t.name} (${termRange(t)}).`;
        }
        return '';
      };
      const refresh = () => {
        if (draft.lengthBy === 'end' && draft.start && draft.end) draft.weeks = weeksBetween(draft.start, draft.end);
        const p = problem();
        summary.style.color = p && draft.start ? 'var(--danger)' : '';
        summary.textContent = p
          ? draft.start ? p : ''
          : `${termRange(draft)} · ${draft.weeks} teaching week${draft.weeks === 1 ? '' : 's'}`;
      };
      refresh();

      view.oninput = (e) => {
        const f = e.target.dataset.f;
        if (f === 'name') draft.name = e.target.value;
        else if (f === 'start') draft.start = e.target.value;
        else if (f === 'end') draft.end = e.target.value;
        else if (f === 'weeks') draft.weeks = Math.max(0, Math.min(MAX_WEEKS, parseInt(e.target.value, 10) || 0));
        refresh();
      };
      view.onchange = view.oninput; // iOS date pickers report via change
      view.onclick = (e) => {
        const step = e.target.closest('[data-step]');
        if (step) {
          draft.weeks = Math.max(1, Math.min(MAX_WEEKS, (draft.weeks || 0) + +step.dataset.step));
          view.querySelector('[data-f="weeks"]').value = draft.weeks;
          refresh();
          return;
        }
        const seg = e.target.closest('[data-seg] button');
        if (seg && seg.dataset.v !== draft.lengthBy) {
          draft.lengthBy = seg.dataset.v;
          if (draft.lengthBy === 'end' && draft.start && !draft.end) draft.end = toISO(termEndDate(draft));
          const y = app.scroller.scrollTop;
          this.render(view, app);
          app.scroller.scrollTop = y;
        }
      };

      const save = () => {
        const p = problem();
        if (p) {
          toast(p.replace(/\.$/, ''));
          return false;
        }
        const clean = {
          id: draft.id,
          name: draft.name.trim() || placeholder,
          start: draft.start,
          weeks: draft.weeks,
          lengthBy: draft.lengthBy,
          ...(draft.lengthBy === 'end' ? { end: draft.end } : {}),
        };
        commitTerms((s) => {
          const i = s.terms.findIndex((t) => t.id === clean.id);
          if (i >= 0) s.terms[i] = clean;
          else s.terms.push(clean);
        });
        return clean;
      };

      const f = app.footer(
        existing
          ? `<button class="btn danger icon-only" data-del aria-label="Delete term">${icon('trash')}</button><button class="btn primary" data-save>Save</button>`
          : `<button class="btn secondary" data-another>Add another</button><button class="btn primary" data-save>Save</button>`
      );
      f.querySelector('[data-save]').onclick = () => {
        const t = save();
        if (!t) return;
        toast(`${t.name} saved`);
        app.pop();
      };
      const another = f.querySelector('[data-another]');
      if (another)
        another.onclick = () => {
          const t = save();
          if (!t) return;
          toast(`${t.name} saved`);
          app.replace(termFormPage({ mode, prev: t }));
        };
      const del = f.querySelector('[data-del]');
      if (del)
        del.onclick = async () => {
          const ok = await confirmSheet({
            title: `Delete ${existing.name}?`,
            message: 'Its future sessions are removed. Sessions that already happened, and anything you logged, are kept.',
            confirmLabel: 'Delete term',
            danger: true,
          });
          if (!ok) return;
          commitTerms((s) => {
            s.terms = s.terms.filter((t) => t.id !== draft.id);
          });
          app.pop();
        };
    },
  };
}
