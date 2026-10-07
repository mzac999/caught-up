// Turns the weekly template into concrete sessions for every teaching week of
// every term, and works out each session's attendance state.
// Session id = "<template slot id>:<term id>:<week in term>" — stable when terms
// are added, renamed or reordered.

import { teachingWeeks, cmpRef, addDays, hhmmToMinutes, toISO, parseISO } from './calendar.js';
import { getState, getRev, update } from './store.js';

// Session types: four presets plus any labels you create with "Other"
// (stored in state.customTypes and offered for every module).
export const PRESET_TYPES = [
  { id: 'lecture', label: 'Lecture' },
  { id: 'tutorial', label: 'Tutorial' },
  { id: 'lab', label: 'Lab' },
  { id: 'seminar', label: 'Seminar' },
];
export function allTypes(state = getState()) {
  return [...PRESET_TYPES, ...(state.customTypes || [])];
}
export function typeLabel(id, fallback = 'Other') {
  const t = allTypes().find((x) => x.id === id);
  return t ? t.label : fallback;
}

export const REPEAT_LABELS = {
  every: 'Every week',
  odd: 'Odd weeks',
  even: 'Even weeks',
  specific: 'Specific weeks',
};

// ---------- lookup helpers ----------
export function moduleById(state, id) {
  return state.modules.find((m) => m.id === id) || null;
}
export function partById(mod, id) {
  return mod ? mod.parts.find((p) => p.id === id) || null : null;
}
/** Is week ref {t, w} inside a part's range? (from null = from the start, to null = no end) */
export function partCovers(part, ref) {
  const from = part.from || { t: 0, w: 1 };
  return cmpRef(from, ref) <= 0 && (!part.to || cmpRef(ref, part.to) <= 0);
}
/** Which part of a module runs in a given week (first match). */
export function partForWeek(mod, ref) {
  return mod.parts.find((p) => partCovers(p, ref)) || null;
}

/** Key used for "specific weeks": "<termId>:<week>" */
export function weekKey(termId, week) {
  return `${termId}:${week}`;
}

function repeatMatches(repeat, key, termWeek) {
  const kind = (repeat && repeat.kind) || 'every';
  // Odd/even use the week number within the term (Week 1, 3, 5... of each term).
  if (kind === 'odd') return termWeek % 2 === 1;
  if (kind === 'even') return termWeek % 2 === 0;
  if (kind === 'specific') return (repeat.weeks || []).includes(key);
  return true;
}

function build(base, date) {
  const startMin = hhmmToMinutes(base.start);
  const endMin = hhmmToMinutes(base.end);
  const startTs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, startMin).getTime();
  const endTs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, endMin).getTime();
  return { ...base, date, dateISO: toISO(date), startMin, endMin, startTs, endTs };
}

/** Raw generation from the current template (ignores frozen history). */
export function generateFromTemplate(state) {
  const out = [];
  const weeks = teachingWeeks(state);
  for (const t of state.template) {
    const mod = moduleById(state, t.moduleId);
    if (!mod) continue;
    for (const w of weeks) {
      if (!repeatMatches(t.repeat, weekKey(w.termId, w.week), w.week)) continue;
      const ref = { t: w.termIndex, w: w.week };
      let part = null;
      if (mod.parts && mod.parts.length) {
        const fixed = t.partId && t.partId !== 'auto' ? partById(mod, t.partId) : null;
        part = fixed ? (partCovers(fixed, ref) ? fixed : null) : partForWeek(mod, ref);
        if (!part) continue; // no part of this module runs this week
      }
      const date = addDays(w.monday, t.day);
      out.push(
        build(
          {
            id: `${t.id}:${w.termId}:${w.week}`,
            tplId: t.id,
            g: w.g,
            termId: w.termId,
            termName: w.termName,
            termWeek: w.week,
            day: t.day,
            start: t.start,
            end: t.end,
            moduleId: mod.id,
            partId: part ? part.id : null,
            type: t.type,
            location: t.location || '',
            frozen: false,
          },
          date
        )
      );
    }
  }
  return out;
}

function fromSnapshot(id, snap) {
  return build({ ...snap, id, frozen: true }, parseISO(snap.dateISO));
}

let cache = { rev: -1, list: [], byId: new Map() };

/**
 * The real session list: frozen past sessions + template sessions that start
 * after the last timetable edit. Cached until the structure changes.
 */
export function allSessions() {
  const rev = getRev();
  if (cache.rev === rev) return cache.list;
  const state = getState();
  const gen = generateFromTemplate(state);
  const frozen = state.frozen || {};
  const cutoff = state.frozenAt || 0;
  const ordinal = new Map(teachingWeeks(state).map((w) => [`${w.termId}:${w.week}`, w.g]));
  const list = Object.entries(frozen).map(([id, snap]) => {
    const s = fromSnapshot(id, snap);
    s.g = ordinal.get(`${snap.termId}:${snap.termWeek}`) || null;
    return s;
  });
  for (const s of gen) if (!frozen[s.id] && s.startTs >= cutoff) list.push(s);
  list.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
  cache = { rev, list, byId: new Map(list.map((s) => [s.id, s])) };
  return list;
}

export function sessionById(id) {
  allSessions();
  return cache.byId.get(id) || null;
}

/**
 * Lock in every session that has already started, so editing the template only
 * changes the future. Call BEFORE applying a timetable/module/term edit.
 */
export function freezePast(state, now = Date.now()) {
  if (!state.setupDone) return; // during first-run setup nothing is locked
  const current = allSessions();
  state.frozen = state.frozen || {};
  for (const s of current) {
    if (s.startTs < now && !state.frozen[s.id]) {
      const mod = moduleById(state, s.moduleId);
      const part = partById(mod, s.partId);
      state.frozen[s.id] = {
        tplId: s.tplId,
        termId: s.termId,
        termName: s.termName,
        termWeek: s.termWeek,
        day: s.day,
        dateISO: s.dateISO,
        start: s.start,
        end: s.end,
        moduleId: s.moduleId,
        partId: s.partId,
        type: s.type,
        location: s.location,
        // name/colour snapshot in case the module is later deleted
        moduleName: mod ? mod.name : '',
        moduleCode: mod ? mod.code : '',
        color: mod ? mod.color : '#888',
        partName: part ? part.name : '',
        typeLabel: typeLabel(s.type),
      };
    }
  }
  state.frozenAt = Math.max(state.frozenAt || 0, now);
}

/** Drop locked-in past sessions that have no attendance logged, so they regenerate from the template. */
export function rebuildPastUnlogged(state) {
  for (const id of Object.keys(state.frozen || {})) {
    if (!state.attendance[id]) delete state.frozen[id];
  }
  state.frozenAt = null; // logged sessions stay locked; everything else regenerates
}

// ---------- status ----------
/** 'upcoming' | 'live' (started, unlogged) | 'missed' | 'attended' | 'caught' */
export function statusOf(s, now = Date.now()) {
  const a = getState().attendance[s.id];
  if (a) return a.status;
  if (now < s.startTs) return 'upcoming';
  if (now < s.endTs) return 'live';
  return 'missed';
}

export function canLog(s, now = Date.now()) {
  return now >= s.startTs;
}

export function setStatus(id, status) {
  update((st) => {
    if (status) st.attendance[id] = { status, at: Date.now() };
    else delete st.attendance[id];
  }, 'attendance');
}

export function missedSessions(now = Date.now()) {
  return allSessions().filter((s) => statusOf(s, now) === 'missed');
}

// ---------- display ----------
export function sessionMeta(s) {
  const state = getState();
  const mod = moduleById(state, s.moduleId);
  const part = partById(mod, s.partId);
  return {
    moduleName: mod ? mod.name : s.moduleName || 'Deleted module',
    moduleCode: mod ? mod.code : s.moduleCode || '?',
    color: mod ? mod.color : s.color || '#888',
    partName: part ? part.name : s.partName || '',
    typeLabel: typeLabel(s.type, s.typeLabel || 'Other'),
  };
}

/** "<Module> - <Part name> Week <n>" (or "<Module> Week <n>" if not split; n = week within the term) */
export function sessionName(s, { week = true } = {}) {
  const m = sessionMeta(s);
  const base = m.partName ? `${m.moduleName} - ${m.partName}` : m.moduleName;
  return week ? `${base} Week ${s.termWeek}` : base;
}
