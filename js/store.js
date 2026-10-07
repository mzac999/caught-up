// Local persistence. Everything lives in one JSON object in localStorage.
// (Small data: a full year is a few hundred sessions, so this is instant.)

const KEY = 'lectureTracker.v1';
export const SCHEMA_VERSION = 2;

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    setupDone: false,
    isSample: false,
    settings: { showWeekends: false },
    // { id, name, start 'YYYY-MM-DD', weeks, lengthBy: 'weeks'|'end', end? }
    terms: [],
    // { id, name, code, color, parts: [{ id, name, from, to }, { ... }] }
    // from/to are week refs { t: termIndex, w: week } (see calendar.js); to = null means no end
    modules: [],
    // { id, day (0=Mon), start 'HH:MM', end 'HH:MM', moduleId, partId ('auto' | part id),
    //   type ('lecture'|'lab'|'group'), location,
    //   repeat: { kind: 'every'|'odd'|'even'|'specific', weeks: ['<termId>:<week>', ...] } }
    template: [],
    // your own session types from "Other": [{ id, label }] — offered for every module
    customTypes: [{ id: 'group', label: 'Group Meeting' }],
    // sessionId -> { status: 'attended' | 'caught', at: epoch ms }
    attendance: {},
    // Past sessions locked in when the timetable is edited, so history never shifts.
    // sessionId -> snapshot (see sessions.js freezePast)
    frozen: {},
    frozenAt: null,
  };
}

let state = null;
let structRev = 0; // bumps when anything that changes the session list changes
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch (e) {
    state = emptyState();
  }
  return state;
}

// v1 had three fixed terms (10/10/2 weeks) and global week numbers 1..22.
function migrateV1(s) {
  const LEN = [10, 10, 2];
  const old = s.terms || [];
  const terms = [];
  old.forEach((t, i) => {
    if (t && t.start) terms.push({ id: `term${i + 1}`, name: `Term ${i + 1}`, start: t.start, weeks: LEN[i], lengthBy: 'weeks' });
  });
  terms.sort((a, b) => a.start.localeCompare(b.start));
  const toOld = (g) => (g <= 10 ? [0, g] : g <= 20 ? [1, g - 10] : [2, g - 20]);
  const idxOf = (oi) => {
    const k = terms.findIndex((t) => t.id === `term${oi + 1}`);
    return k >= 0 ? k : terms.filter((t) => +t.id.slice(4) - 1 < oi).length;
  };
  const ref = (g) => {
    const [oi, w] = toOld(g);
    return { t: idxOf(oi), w };
  };
  const key = (g) => {
    const [oi, w] = toOld(g);
    return `term${oi + 1}:${w}`;
  };
  const sid = (id) => {
    const m = /^(.*):(\d+)$/.exec(id);
    return m ? `${m[1]}:${key(+m[2])}` : id;
  };
  for (const m of s.modules || [])
    for (const p of m.parts || []) {
      p.from = typeof p.from === 'number' ? ref(p.from) : p.from;
      p.to = typeof p.to === 'number' ? (p.to >= 22 ? null : ref(p.to)) : p.to;
    }
  for (const t of s.template || []) if (t.repeat && t.repeat.weeks) t.repeat.weeks = t.repeat.weeks.map((g) => (typeof g === 'number' ? key(g) : g));
  const att = {};
  for (const [id, v] of Object.entries(s.attendance || {})) att[sid(id)] = v;
  const fr = {};
  for (const [id, v] of Object.entries(s.frozen || {})) {
    const [oi, w] = toOld(v.g || 1);
    fr[sid(id)] = { ...v, termId: `term${oi + 1}`, termName: `Term ${oi + 1}`, termWeek: w };
  }
  return { ...s, terms, attendance: att, frozen: fr, version: 2 };
}

function migrate(s) {
  if (!s.version || s.version < 2) s = migrateV1(s);
  const base = emptyState();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  out.version = SCHEMA_VERSION;
  return out;
}

export function getState() {
  return state || load();
}

export function getRev() {
  return structRev;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed', e);
  }
}

/**
 * Mutate state. `kind` = 'attendance' for logging (cheap, no session regen) or
 * 'structure' for anything that changes the generated session list.
 */
export function update(mutator, kind = 'structure') {
  mutator(state);
  if (kind === 'structure') structRev++;
  persist();
  listeners.forEach((fn) => fn(kind));
}

export function replaceState(next) {
  state = migrate(next);
  structRev++;
  persist();
  listeners.forEach((fn) => fn('structure'));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** Ask the browser not to evict our storage (iOS honours this for installed PWAs). */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) {
    /* not supported — fine */
  }
}
