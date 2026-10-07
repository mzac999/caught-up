// SESSION TYPES — presets plus your own labels (created via "Other" or here).

import { getState, update, uid } from '../store.js';
import { PRESET_TYPES, freezePast } from '../sessions.js';
import { icon, typeIcon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { confirmSheet, toast } from '../ui/toast.js';

export const typesPage = {
  render(view, app) {
    const st = getState();
    const custom = st.customTypes || [];
    app.header({ back: true, title: 'Session types', small: true });

    view.innerHTML = `
      <div class="section"><div class="section-title">Built in</div><div class="group">
        ${PRESET_TYPES.map((t) => `<div class="row">${typeIcon(t.id)}<span class="label grow">${t.label}</span></div>`).join('')}
      </div></div>

      <div class="section"><div class="section-title">Your types</div>
        ${custom.length ? `<div class="group">
          ${custom.map((t) => `<div class="row">${typeIcon(t.id)}
              <input type="text" class="grow-input" data-rename="${esc(t.id)}" value="${esc(t.label)}" maxlength="24" aria-label="Rename ${esc(t.label)}">
              <button class="icon-btn" data-del-type="${esc(t.id)}" aria-label="Delete ${esc(t.label)}">${icon('trash')}</button></div>`).join('')}
        </div>` : ''}
        <div class="group" style="margin-top:${custom.length ? 10 : 0}px"><div class="row">${icon('plus')}
          <input type="text" class="grow-input" data-new-type placeholder="Add a type, e.g. Workshop" maxlength="24" autocomplete="off" aria-label="New session type">
          <button class="btn-sm" data-add-type>Add</button></div></div>
        <p class="section-note">Tap a name to rename it. Your types appear for every module.</p>
      </div>`;

    const add = () => {
      const input = view.querySelector('[data-new-type]');
      const label = input.value.trim();
      if (!label) return toast('Type a name first');
      const all = [...PRESET_TYPES, ...(getState().customTypes || [])];
      if (all.some((t) => t.label.toLowerCase() === label.toLowerCase())) return toast(`${label} already exists`);
      update((s) => {
        s.customTypes = [...(s.customTypes || []), { id: uid('type'), label }];
      }, 'settings');
      app.rerender();
    };

    view.onclick = async (e) => {
      if (e.target.closest('[data-add-type]')) return add();
      const del = e.target.closest('[data-del-type]');
      if (!del) return;
      const id = del.dataset.delType;
      const t = custom.find((x) => x.id === id);
      const used = getState().template.filter((s) => s.type === id).length;
      const ok = await confirmSheet({
        title: `Delete ${t.label}?`,
        message: used
          ? `${used} timetable session${used === 1 ? ' uses' : 's use'} it and will switch to Lecture from now on. Past sessions keep their label.`
          : 'Past sessions keep their label.',
        confirmLabel: 'Delete type',
        danger: true,
      });
      if (!ok) return;
      update((s) => {
        if (used) freezePast(s);
        s.customTypes = (s.customTypes || []).filter((x) => x.id !== id);
        s.template.forEach((slot) => {
          if (slot.type === id) slot.type = 'lecture';
        });
      }, used ? 'structure' : 'settings');
      app.rerender();
    };
    view.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.dataset.newType != null) {
        e.preventDefault();
        add();
      } else if (e.key === 'Enter' && e.target.dataset.rename != null) e.target.blur();
    };
    view.onchange = (e) => {
      const id = e.target.dataset.rename;
      if (id == null) return;
      const label = e.target.value.trim();
      if (!label) {
        e.target.value = custom.find((x) => x.id === id).label;
        return;
      }
      update((s) => {
        const t = (s.customTypes || []).find((x) => x.id === id);
        if (t) t.label = label;
      }, 'structure'); // labels show on sessions, so refresh them
      toast('Renamed');
    };
  },
};
