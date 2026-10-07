# Caught-Up — lecture attendance tracker

Plain HTML/CSS/JS (ES modules), no build step, no dependencies. Static site.

## Run locally
```
cd lecture-tracker
python3 -m http.server 8000
# open http://localhost:8000
```
(ES modules need a server; opening index.html directly from disk won't work.)

## Where things live
| File | What it does |
|---|---|
| `css/app.css` | All styling. **Design tokens are at the top** (colours, radii, spacing, motion, and the `--upcoming-fill` / `--attended-mix` / `--caught-fill` recipes that control how each session state looks). |
| `js/calendar.js` | Term/week maths for user-defined terms, date ↔ "Michaelmas · Week 3". |
| `js/views/terms.js` | Terms list + Add/Edit term (name, start, length in weeks or by end date). |
| `js/store.js` | Data shape + localStorage persistence. |
| `js/sessions.js` | Template → sessions for every term week, stable IDs (`<slotId>:<termId>:<week>`), status logic, session naming, locking past sessions on edits. |
| `js/seed.js` | Sample modules + timetable (today is always Week 3 of the first term). |
| `js/ui/log.js` | The tap-to-log interaction (press-scale, popover, undo). Works on any element with `data-sid`. |
| `js/ui/session-card.js` | Today card markup. |
| `js/views/today.js` `week.js` `catchup.js` `stats.js` | The four tabs (stats.js also holds the module page). |
| `js/views/setup.js` `terms.js` `editors.js` `types.js` `settings.js` | First-run setup, terms, modules/timetable, session types, Settings. |
| `js/ui/chart.js` | Small SVG bar chart used by Stats. |
| `js/data.js` | Export/import JSON backup, CSV attendance log. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and Home Screen install. |
| `js/app.js` | Shell: header, tab bar, page stack, timers. |

## How timetable edits keep history
Saving any timetable/module/term change first "freezes" every session that has already started
(`freezePast` in `sessions.js`). Frozen sessions keep their date, time and attendance; only sessions
from now on are regenerated. Settings → *Rebuild past weeks* regenerates past sessions that have
nothing logged (logged ones always stay).

## Terms
Start with no terms and add them one at a time (Settings → Terms or Add another term).
Each term: name, start date (snaps to Monday), length as a number of weeks or an end date.
Session IDs are `<slot>:<termId>:<week>`, so adding, renaming or re-dating terms never loses attendance.
Module parts point at term positions ({t, w}); "Next term" and "No end" let a part be set up
before its term exists.

## Modules & parts
A module is one block by default (`parts: []`, sessions named "<Module> Week n"). Turn on
"Split into parts" for 2–5 parts, each with a name and From/To (term + week; week 99 = end of term).
Overlapping parts are flagged; "Auto" sessions use the earliest matching part.

## Session types
Presets: Lecture, Tutorial, Lab, Seminar. "Other" creates your own label, stored in
`state.customTypes` and offered for every module (Settings → Session types to rename/delete).
"Group Meeting" starts as one of your types.

## Conventions (easy to change)
- "Week n" in session names = week within the term (`sessionName` in `sessions.js`).
- Odd/even repeat = odd/even week within the term (`repeatMatches` in `sessions.js`).
- A session's part can be **Auto**: uses whichever of the module's parts runs that week.

## Status
All seven build steps are done. Hosting and iPhone install: see INSTALL.md.
