// Backups: full JSON export/import (to move phones) and a CSV of the attendance log.

import { getState, replaceState, SCHEMA_VERSION } from './store.js';
import { allSessions, statusOf, sessionMeta, sessionName } from './sessions.js';
import { toISO, DAY_SHORT } from './calendar.js';
import { markFileSaved } from './backup.js';

const STATUS_TEXT = { attended: 'Attended', caught: 'Caught up', missed: 'Missed', live: 'In progress', upcoming: 'Upcoming' };

/** Save a file: share sheet on iPhone ("Save to Files"), normal download elsewhere. */
export async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // user closed the share sheet
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/** Always the same file name, so saving again offers to replace the previous backup. */
export async function exportJSON() {
  const payload = { app: 'caught-up', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: getState() };
  const ok = await saveFile('Caught-Up backup.json', JSON.stringify(payload, null, 2), 'application/json');
  if (ok) markFileSaved();
  return ok;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every session that has started, with its status. */
export function exportCSV() {
  const now = Date.now();
  const att = getState().attendance;
  const head = ['Date', 'Day', 'Start', 'End', 'Term', 'Week', 'Session', 'Module', 'Code', 'Part', 'Type', 'Location', 'Status', 'Logged at'];
  const rows = [head];
  for (const s of allSessions()) {
    if (s.startTs > now) continue;
    const m = sessionMeta(s);
    const a = att[s.id];
    rows.push([
      s.dateISO, DAY_SHORT[s.day], s.start, s.end, s.termName || '', s.termWeek, sessionName(s), m.moduleName, m.moduleCode, m.partName,
      m.typeLabel, s.location, STATUS_TEXT[statusOf(s, now)], a ? new Date(a.at).toISOString().slice(0, 16).replace('T', ' ') : '',
    ]);
  }
  const text = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return saveFile(`caught-up-attendance-${toISO(new Date())}.csv`, text, 'text/csv');
}

/** Read and check a backup file. Resolves { data, exportedAt } or throws a readable Error. */
export async function readBackup(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch (e) {
    throw new Error("That file isn't a valid backup (not JSON).");
  }
  // 'attend' = backups made before the app was renamed
  const data = obj && (obj.app === 'caught-up' || obj.app === 'attend') ? obj.data : obj;
  if (!data || !Array.isArray(data.modules) || !Array.isArray(data.template) || typeof data.attendance !== 'object') {
    throw new Error("That file doesn't look like a Caught-Up backup.");
  }
  return { data, exportedAt: obj.exportedAt || null };
}

export function restore(data) {
  replaceState(data);
}
