// Calendar maths: maps real dates <-> teaching weeks.
// Terms are user-defined: { id, name, start 'YYYY-MM-DD', weeks }. Vacations are
// simply the gaps between terms. Terms are always handled in date order.
// A "week ref" is { t: termIndex (0-based, date order), w: weekInTerm (1-based) }.

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- basic date helpers (all local time) ----------
export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Monday = 0 ... Sunday = 6 */
export function dayIndex(d) {
  return (d.getDay() + 6) % 7;
}
export function mondayOf(d) {
  return addDays(startOfDay(d), -dayIndex(d));
}
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}
export function minutesToHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function hhmmToMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
export function fmtDayMonth(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtLongDate(d) {
  return `${DAY_NAMES[dayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtShortDate(d) {
  return `${DAY_SHORT[dayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** "12–16 Oct" or "29 Sep – 3 Oct" */
export function fmtRange(a, b) {
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${fmtDayMonth(a)} – ${fmtDayMonth(b)}`;
}

// ---------- terms & teaching weeks ----------
/** Terms sorted by start date, each with its Monday and index. */
export function sortedTerms(state) {
  return (state.terms || [])
    .filter((t) => t.start && t.weeks > 0)
    .map((t) => ({ ...t, monday: mondayOf(parseISO(t.start)) }))
    .sort((a, b) => a.monday - b.monday)
    .map((t, index) => ({ ...t, index }));
}

/** Last teaching day (Friday of the final week). */
export function termEndDate(term) {
  return addDays(mondayOf(parseISO(term.start)), term.weeks * 7 - 3);
}

/** Every teaching week in order: { g (1-based ordinal), termId, termIndex, termName, week, monday }. */
export function teachingWeeks(state) {
  const out = [];
  for (const t of sortedTerms(state)) {
    for (let w = 1; w <= t.weeks; w++) {
      out.push({ g: out.length + 1, termId: t.id, termIndex: t.index, termName: t.name, week: w, monday: addDays(t.monday, (w - 1) * 7) });
    }
  }
  return out;
}

export function weekInfo(state, g) {
  return teachingWeeks(state)[g - 1] || null;
}

/** Which teaching week a date falls in, or null (vacation / outside any term). */
export function dateToWeek(state, date) {
  const mon = mondayOf(date);
  return teachingWeeks(state).find((w) => w.monday.getTime() === mon.getTime()) || null;
}

/** "Term 1 · Week 3" (uses the term's own name) */
export function weekLabel(state, g) {
  const w = weekInfo(state, g);
  return w ? `${w.termName} · Week ${w.week}` : '';
}

/** Compare two week refs ({t, w}); null = open end. */
export function cmpRef(a, b) {
  return a.t - b.t || a.w - b.w;
}

/** Label for a week ref, e.g. "Term 1 · W3"; refs to a term not added yet read "Next term". */
export function refLabel(state, ref) {
  if (!ref) return 'No end';
  const terms = sortedTerms(state);
  const t = terms[ref.t];
  if (!t) return ref.t === terms.length ? 'Next term' : `Term ${ref.t + 1}`;
  return `${t.name} · W${Math.min(ref.w, t.weeks)}`;
}

/** Compact range for a module part, e.g. "Michaelmas W1–10" or "Epiphany W1 → onwards". */
export function partRangeLabel(state, p) {
  const terms = sortedTerms(state);
  const from = p.from || { t: 0, w: 1 };
  if (p.to && from.t === p.to.t && terms[from.t]) {
    const t = terms[from.t];
    return `${t.name} W${Math.min(from.w, t.weeks)}–${Math.min(p.to.w, t.weeks)}`;
  }
  return `${refLabel(state, from)} → ${p.to ? refLabel(state, p.to) : 'onwards'}`;
}

/** Next teaching week starting after `date` (for vacation messages). */
export function nextTeachingWeek(state, date) {
  return teachingWeeks(state).find((w) => w.monday > date) || null;
}

/** Whole weeks covered from the start date's Monday to an end date (inclusive). */
export function weeksBetween(startISO, endISO) {
  const m = mondayOf(parseISO(startISO));
  const days = daysBetween(m, parseISO(endISO));
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}
