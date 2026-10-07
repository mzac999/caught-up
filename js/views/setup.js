// First-run flow: Welcome -> Term dates -> Modules -> Typical week -> Today.

import { update } from '../store.js';
import { modulesPage, templatePage } from './editors.js';
import { termsListPage } from './terms.js';
import { toast } from '../ui/toast.js';
import { importFlow } from './settings.js';

export const welcomePage = {
  render(view, app) {
    app.header({ title: '' });
    view.innerHTML = `
      <div class="welcome">
        <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="16" fill="#1c1c21"/>
          <rect x="14" y="16" width="36" height="9" rx="4.5" fill="#5B8CFF"/>
          <rect x="14" y="28" width="36" height="9" rx="4.5" fill="none" stroke="#FF7A59" stroke-width="2" stroke-dasharray="4 3"/>
          <rect x="14" y="40" width="36" height="9" rx="4.5" fill="#34C789"/>
        </svg>
        <h1>Caught-Up</h1>
        <p>Log lectures in a tap, see exactly what you've missed, and keep the catch-up backlog small.</p>
        <button class="btn primary block" data-setup>Set up my timetable</button>
        <button class="btn secondary block" data-sample>Try with sample data</button>
        <button class="btn ghost block" data-restore>Restore from a backup</button>
        <input type="file" accept=".json,application/json" data-restore-file hidden>
      </div>`;
    view.querySelector('[data-setup]').onclick = () => app.setStack([setupStep(1)]);
    view.querySelector('[data-sample]').onclick = () => app.loadSample();
    const file = view.querySelector('[data-restore-file]');
    view.querySelector('[data-restore]').onclick = () => file.click();
    file.addEventListener('change', () => importFlow(file, app));
  },
};

export function setupStep(n) {
  if (n === 1)
    return termsListPage({
      mode: 'setup',
      onBack: (app) => app.setStack([welcomePage]),
      onNext: (app) => app.push(setupStep(2)),
    });
  if (n === 2)
    return modulesPage({
      mode: 'setup',
      onBack: (app) => app.pop(),
      onNext: (app) => app.push(setupStep(3)),
    });
  return templatePage({
    mode: 'setup',
    onBack: (app) => app.pop(),
    onNext: (app) => {
      update((st) => {
        st.setupDone = true;
      });
      app.home('today');
      toast('All set');
    },
  });
}
