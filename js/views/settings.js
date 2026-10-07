// SETTINGS (gear icon). Timetable editors, display options, data tools.

import { getState, update } from '../store.js';
import { rebuildPastUnlogged } from '../sessions.js';
import { modulesPage, templatePage } from './editors.js';
import { termsListPage, termFormPage } from './terms.js';
import { typesPage } from './types.js';
import { exportJSON, exportCSV, readBackup, restore } from '../data.js';
import { lastSnapshotAt, getMeta, ago, snapshotNow } from '../backup.js';
import { backupsPage } from './backups.js';
import { icon } from '../ui/icons.js';
import { on } from '../ui/dom.js';
import { confirmSheet, toast } from '../ui/toast.js';
import { sortedTerms } from '../calendar.js';
import { esc } from '../ui/dom.js';

export const settingsPage = {
  render(view, app) {
    const st = getState();
    const terms = sortedTerms(st);
    app.header({ back: true, title: 'Settings', small: true });
    const row = (attr, label, sub = '', cls = '') =>
      `<button class="row ${cls}" ${attr}><div class="grow"><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${icon('chevron', 'chev')}</button>`;

    view.innerHTML = `
      ${st.isSample ? `<div class="banner">${icon('sparkle')}<span>You're using sample data</span><button data-own>Set up mine</button></div>` : ''}
      <div class="section"><div class="section-title">Timetable</div><div class="group">
        ${row('data-go="terms"', 'Terms', terms.length ? esc(terms.map((t) => t.name).join(', ')) : 'None yet')}
        <button class="row accent" data-add-term>${icon('plus')}<span class="label">Add another term</span></button>
        ${row('data-go="modules"', 'Modules', `${st.modules.length} module${st.modules.length === 1 ? '' : 's'}`)}
        ${row('data-go="types"', 'Session types', `Lecture, Tutorial, Lab, Seminar${(st.customTypes || []).length ? ` + ${st.customTypes.length} of yours` : ''}`)}
        ${row('data-go="template"', 'Weekly timetable', `${st.template.length} session${st.template.length === 1 ? '' : 's'} per typical week`)}
      </div></div>

      <div class="section"><div class="section-title">Display</div><div class="group">
        <label class="row"><span class="label grow">Show weekends</span>
          <span class="switch"><input type="checkbox" data-weekends ${st.settings.showWeekends ? 'checked' : ''}><span></span></span></label>
      </div></div>

      <div class="section"><div class="section-title">Backups</div><div class="group">
        ${row('data-auto', 'Automatic backup', `Last saved ${ago(lastSnapshotAt())} · keeps the last 3`)}
        ${row('data-export', 'Save backup to Files', `Last saved to Files ${ago(getMeta().lastFileAt)}`)}
        ${row('data-import', 'Import backup', 'Restore from a backup file (replaces current data)')}
        <input type="file" accept=".json,application/json" data-import-file hidden>
      </div>
      <p class="section-note">Automatic backups stay on this phone. Save to Files (iCloud Drive) now and then so you have a copy if the phone is lost or reset.</p></div>

      <div class="section"><div class="section-title">Data</div><div class="group">
        ${row('data-csv', 'Export attendance log', 'Spreadsheet (.csv) of every session so far')}
        ${row('data-sample', 'Load sample data', 'Replaces everything with demo modules')}
        ${row('data-rebuild', 'Rebuild past weeks', 'Regenerate unlogged past sessions from the current timetable')}
        ${row('data-reset', 'Reset all data', '', 'danger')}
      </div></div>`;

    on(view, '[data-go]', (el) => {
      const k = el.dataset.go;
      app.push(k === 'types' ? typesPage : k === 'terms' ? termsListPage({ mode: 'settings' }) : k === 'modules' ? modulesPage({ mode: 'settings' }) : templatePage({ mode: 'settings' }));
    });
    on(view, '[data-own]', () => app.startOwnSetup());
    on(view, '[data-export]', async () => {
      if (await exportJSON()) app.rerender();
    });
    on(view, '[data-auto]', () => app.push(backupsPage));
    on(view, '[data-csv]', () => exportCSV());
    on(view, '[data-import]', () => view.querySelector('[data-import-file]').click());
    view.querySelector('[data-import-file]').addEventListener('change', (e) => importFlow(e.target, app));
    on(view, '[data-add-term]', () => app.push(termFormPage({ mode: 'settings' })));
    view.querySelector('[data-weekends]').addEventListener('change', (e) => {
      update((s) => {
        s.settings.showWeekends = e.target.checked;
      }, 'settings');
    });
    on(view, '[data-sample]', async () => {
      if (await confirmSheet({ title: 'Load sample data?', message: 'This replaces all your current data.', confirmLabel: 'Load sample', danger: !st.isSample }))
        app.loadSample();
    });
    on(view, '[data-rebuild]', async () => {
      const ok = await confirmSheet({
        title: 'Rebuild past weeks?',
        message: 'Past sessions with nothing logged are regenerated from your current timetable. Anything you logged stays exactly as it is.',
        confirmLabel: 'Rebuild',
      });
      if (!ok) return;
      update((s) => rebuildPastUnlogged(s));
      toast('Past weeks rebuilt');
      app.rerender();
    });
    on(view, '[data-reset]', async () => {
      const ok = await confirmSheet({
        title: 'Reset all data?',
        message: 'Deletes your modules, timetable and every logged session. This cannot be undone.',
        confirmLabel: 'Reset everything',
        danger: true,
      });
      if (ok) app.resetAll();
    });
  },
};

/** Shared by Settings and the welcome screen. */
export async function importFlow(input, app) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const { data, exportedAt } = await readBackup(file);
    const when = exportedAt ? new Date(exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unknown date';
    const n = Object.keys(data.attendance || {}).length;
    const ok = await confirmSheet({
      title: 'Restore this backup?',
      message: `Backup from ${when}: ${data.modules.length} modules, ${n} logged sessions. This replaces everything currently in the app.`,
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    snapshotNow('Before import');
    restore(data);
    toast('Backup restored');
    app.home('today');
  } catch (err) {
    toast(err.message || 'Could not read that file', 3000);
  }
}
