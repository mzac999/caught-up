// Automatic backups.
//
// iPhone web apps can't write files silently, so backups work in two layers:
//  1. Automatic snapshots inside the app: once a day when the app opens (and before
//     anything destructive like import/reset), keeping the newest 3. Restore from Settings.
//  2. A backup file ("Caught-Up backup.json") you save to Files with one tap (always the same name, so iOS
//     offers to replace the old one). The app remembers when you last did this and
//     shows a gentle reminder on Today after a week.

import { getState, SCHEMA_VERSION } from './store.js';
import { toISO } from './calendar.js';

const SNAP_KEY = 'lectureTracker.snapshots';
const META_KEY = 'lectureTracker.backupMeta';
const KEEP = 3;
export const REMIND_AFTER_DAYS = 7;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- snapshots ----------
/** Newest first: [{ at, reason, data }] */
export function listSnapshots() {
  return read(SNAP_KEY, []);
}

export function snapshotNow(reason = 'Daily') {
  const st = getState();
  if (!st.setupDone) return false;
  const snaps = listSnapshots();
  snaps.unshift({ at: Date.now(), reason, version: SCHEMA_VERSION, data: JSON.parse(JSON.stringify(st)) });
  let list = snaps.slice(0, KEEP);
  // if storage is tight, keep fewer rather than fail
  while (list.length && !write(SNAP_KEY, list)) list = list.slice(0, list.length - 1);
  return list.length > 0;
}

/** Once a day, the first time the app is opened or brought back. */
export function dailySnapshot() {
  const snaps = listSnapshots();
  const today = toISO(new Date());
  const lastDaily = snaps.find((s) => s.reason === 'Daily');
  if (lastDaily && toISO(new Date(lastDaily.at)) === today) return false;
  return snapshotNow('Daily');
}

export function lastSnapshotAt() {
  const s = listSnapshots()[0];
  return s ? s.at : null;
}

// ---------- file backups ----------
export function getMeta() {
  return read(META_KEY, { lastFileAt: null, remindHiddenUntil: 0 });
}
export function markFileSaved() {
  write(META_KEY, { ...getMeta(), lastFileAt: Date.now() });
}
export function snoozeReminder(days = 2) {
  write(META_KEY, { ...getMeta(), remindHiddenUntil: Date.now() + days * 864e5 });
}
/** True when a file backup is due (setup done, some history, none saved for a week). */
export function fileBackupDue(now = Date.now()) {
  const st = getState();
  if (!st.setupDone || st.isSample) return false;
  const meta = getMeta();
  if (meta.remindHiddenUntil > now) return false;
  if (!Object.keys(st.attendance).length) return false;
  return !meta.lastFileAt || now - meta.lastFileAt > REMIND_AFTER_DAYS * 864e5;
}

// ---------- formatting ----------
export function ago(ts, now = Date.now()) {
  if (!ts) return 'never';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(toISO(new Date(now))) - new Date(toISO(d))) / 864e5);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
