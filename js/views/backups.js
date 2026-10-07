// Automatic backups list (Settings → Automatic backup): restore any of the last 3.

import { listSnapshots, snapshotNow, ago } from '../backup.js';
import { restore } from '../data.js';
import { esc } from '../ui/dom.js';
import { confirmSheet, toast } from '../ui/toast.js';

export const backupsPage = {
  render(view, app) {
    app.header({ back: true, title: 'Automatic backup', small: true });
    const snaps = listSnapshots();
    view.innerHTML = `
      <p class="lead">The app saves a copy of everything once a day when you open it, and before any import or reset. The newest 3 are kept on this phone.</p>
      ${snaps.length ? `<div class="section"><div class="group">
        ${snaps.map((s, i) => {
          const logged = Object.keys(s.data.attendance || {}).length;
          return `<div class="row"><div class="grow">
              <div class="label">${esc(ago(s.at).replace(/^./, (c) => c.toUpperCase()))}</div>
              <div class="sub">${esc(s.reason)} · ${(s.data.modules || []).length} modules · ${logged} logged</div></div>
            <button class="btn-sm ghost-sm" data-restore="${i}">Restore</button></div>`;
        }).join('')}
      </div></div>` : '<div class="empty-card">No automatic backups yet. One is made the next time you open the app.</div>'}
      <button class="add-btn" data-now>Back up now</button>
      <p class="section-note">These copies live inside the app. To keep a copy if you lose or reset your phone, use "Save backup to Files" in Settings.</p>`;

    view.querySelector('[data-now]').onclick = () => {
      snapshotNow('Manual');
      toast('Backed up');
      app.rerender();
    };
    view.querySelectorAll('[data-restore]').forEach((b) => {
      b.onclick = async () => {
        const s = snaps[+b.dataset.restore];
        const ok = await confirmSheet({
          title: 'Restore this backup?',
          message: `Everything goes back to how it was ${ago(s.at)}. Your current data is backed up first, so you can undo this.`,
          confirmLabel: 'Restore',
          danger: true,
        });
        if (!ok) return;
        snapshotNow('Before restore');
        restore(s.data);
        toast('Backup restored');
        app.home('today');
      };
    });
  },
};
