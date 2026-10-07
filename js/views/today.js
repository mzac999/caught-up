// TODAY — the screen the app opens on.

import { getState } from '../store.js';
import { allSessions } from '../sessions.js';
import { dateToWeek, weekLabel, toISO, fmtLongDate, nextTeachingWeek, fmtShortDate } from '../calendar.js';
import { sessionCard } from '../ui/session-card.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { termFormPage } from './terms.js';
import { fileBackupDue, getMeta, ago, snoozeReminder } from '../backup.js';
import { exportJSON } from '../data.js';

export const todayPage = {
  tab: 'today',
  render(view, app) {
    const state = getState();
    const now = new Date();
    const wk = dateToWeek(state, now);
    app.header({ eyebrow: wk ? weekLabel(state, wk.g) : 'Vacation', title: fmtLongDate(now), gear: true });

    const iso = toISO(now);
    const list = allSessions().filter((s) => s.dateISO === iso);

    let html = '';
    if (state.isSample) {
      html += `<div class="banner">${icon('sparkle')}<span>Sample data</span><button data-own-setup>Set up mine</button></div>`;
    }
    if (fileBackupDue()) {
      const last = getMeta().lastFileAt;
      html += `<div class="banner backup-banner">${icon('copy')}<span>Back up to Files<small>${last ? `Last saved ${ago(last)}` : 'Not saved yet'}</small></span>
        <button data-backup-save>Save</button><button class="banner-x" data-backup-later aria-label="Remind me later">✕</button></div>`;
    }
    if (list.length) {
      html += `<div class="cards">${list.map(sessionCard).join('')}</div>`;
    } else if (!wk) {
      const next = nextTeachingWeek(state, now);
      html += `<div class="empty"><div class="big">No teaching this week</div>${
        next
          ? `${esc(next.termName)} starts ${fmtShortDate(next.monday)}`
          : `No upcoming term yet.<div style="margin-top:18px"><button class="btn secondary" data-add-term>${icon('plus')}Add next term</button></div>`
      }</div>`;
    } else {
      html += `<div class="empty"><div class="big">Nothing scheduled today</div>Enjoy the free time.</div>`;
    }
    view.innerHTML = html;

    const bSave = view.querySelector('[data-backup-save]');
    if (bSave)
      bSave.onclick = async () => {
        if (await exportJSON()) app.rerender();
      };
    const bLater = view.querySelector('[data-backup-later]');
    if (bLater)
      bLater.onclick = () => {
        snoozeReminder(2);
        app.rerender();
      };
    const own = view.querySelector('[data-own-setup]');
    if (own) own.addEventListener('click', () => app.startOwnSetup());
    const add = view.querySelector('[data-add-term]');
    if (add) add.addEventListener('click', () => app.push(termFormPage({ mode: 'settings' })));
  },
};
