// Sample dataset so the app can be tried before entering a real timetable.
// The first term is placed so that "today" is always in its Week 3, with some history behind it.

import { emptyState } from './store.js';
import { mondayOf, addDays, toISO, startOfDay } from './calendar.js';

const MODULES = [
  ['m_csp', 'Control & Signal Processing', 'CSP', '#5B8CFF', 'Control Systems', 'Signal Processing'],
  ['m_tfl', 'Thermofluids', 'TFL', '#FF7A59', 'Thermodynamics', 'Fluid Mechanics'],
  ['m_smm', 'Solid Mechanics & Materials', 'SMM', '#34C789', 'Solid Mechanics', 'Materials'],
  ['m_edp', 'Engineering Design', 'EDP', '#B48CFF', 'Design Methods', 'Group Design Project'],
  ['m_mat', 'Engineering Maths', 'MAT', '#F2B33D', null, null], // not split into parts
];

// [day, start, end, module, type, location, repeat]
const SLOTS = [
  [0, '09:00', '10:00', 'm_csp', 'lecture', 'Room E101', 'every'],
  [0, '11:00', '12:00', 'm_mat', 'lecture', 'Main Hall', 'every'],
  [0, '14:00', '17:00', 'm_smm', 'lab', 'Materials Lab', 'odd'],
  [1, '10:00', '11:00', 'm_tfl', 'lecture', 'Room E101', 'every'],
  [1, '12:00', '13:00', 'm_csp', 'lecture', 'Room W204', 'every'],
  [1, '15:00', '16:00', 'm_edp', 'group', 'Design Studio', 'every'],
  [1, '17:00', '18:00', 'm_mat', 'lecture', 'Main Hall', 'every'],
  [2, '09:00', '10:00', 'm_smm', 'lecture', 'Room E101', 'every'],
  [2, '11:00', '12:00', 'm_mat', 'lecture', 'Main Hall', 'every'],
  [2, '14:00', '15:00', 'm_mat', 'tutorial', 'Room W110', 'every'],
  [3, '09:00', '10:00', 'm_tfl', 'lecture', 'Room W204', 'every'],
  [3, '11:00', '12:00', 'm_edp', 'lecture', 'Room E101', 'every'],
  [3, '13:00', '16:00', 'm_tfl', 'lab', 'Fluids Lab', 'even'],
  [4, '10:00', '11:00', 'm_smm', 'lecture', 'Room E101', 'every'],
  [4, '16:00', '17:00', 'm_tfl', 'seminar', 'Room W204', 'even'],
  [4, '12:00', '15:00', 'm_csp', 'lab', 'Electronics Lab', 'specific'],
];

// tiny deterministic PRNG from a string
function rand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function makeSampleState(now = new Date()) {
  const s = emptyState();
  const t1 = addDays(mondayOf(now), -14); // today = Week 3 of the first term
  s.terms = [
    { id: 'term_a', name: 'Michaelmas', start: toISO(t1), weeks: 10, lengthBy: 'weeks' },
    { id: 'term_b', name: 'Epiphany', start: toISO(addDays(t1, 7 * 15)), weeks: 10, lengthBy: 'weeks' },
    { id: 'term_c', name: 'Easter', start: toISO(addDays(t1, 7 * 29)), weeks: 2, lengthBy: 'weeks' },
  ];
  s.modules = MODULES.map(([id, name, code, color, p1, p2]) => ({
    id,
    name,
    code,
    color,
    parts: p1
      ? [
          { id: id + '_p1', name: p1, from: { t: 0, w: 1 }, to: { t: 0, w: 99 } },
          { id: id + '_p2', name: p2, from: { t: 1, w: 1 }, to: null },
        ]
      : [],
  }));
  s.template = SLOTS.map(([day, start, end, moduleId, type, location, kind], i) => ({
    id: 't' + i,
    day,
    start,
    end,
    moduleId,
    partId: 'auto',
    type,
    location,
    repeat: { kind, weeks: kind === 'specific' ? ['term_a:1', 'term_a:3', 'term_a:5', 'term_a:7', 'term_a:9', 'term_b:2', 'term_b:4', 'term_b:6', 'term_b:8', 'term_b:10'] : [] },
  }));
  s.setupDone = true;
  s.isSample = true;
  return s;
}

/** Fill in plausible attendance for sessions before today. Needs the generated session list. */
export function seedAttendance(state, sessions, now = new Date()) {
  const today = startOfDay(now).getTime();
  for (const x of sessions) {
    if (x.endTs >= today) continue;
    const r = rand(x.id);
    if (r < 0.6) state.attendance[x.id] = { status: 'attended', at: x.endTs };
    else if (r < 0.72) state.attendance[x.id] = { status: 'caught', at: x.endTs + 86400000 };
  }
}
