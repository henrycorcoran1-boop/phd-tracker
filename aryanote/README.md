# AryaNote

A project management workspace — boards, tables, calendars, a real Gantt timeline, docs and team assignment. No build step, no dependencies, no server: it is plain ES modules and CSS, so it deploys anywhere static files can be served, including the GitHub Pages setup this repository already uses.

Live path once merged to `main`: **`/aryanote/`**

---

## What it does

**Accounts & teams**
- Sign up, sign in, sign out, change password. Passwords are stretched with PBKDF2-SHA256 (210k iterations) through WebCrypto; only the derived hash is stored.
- Multiple workspaces per account, with owner / admin / member / guest roles.
- Invite people by email. An invited person can be assigned tasks straight away, and when they later sign up with that same address they **claim** the placeholder account and inherit everything already assigned to them.

**Projects & tasks**
- Projects contain task lists ("groups"), each with its own colour.
- Tasks carry status, priority, multiple assignees, start and due dates, estimate, progress, labels, subtasks, dependencies, comments and an activity trail.
- Milestones are tasks flagged as a single point in time; they render as diamonds on the timeline.

**Four views per project**
- **Board** — kanban by task list or status, with pointer-based drag and drop (mouse, pen and touch), inline card creation.
- **Table** — dense grouped rows, sortable columns, inline rename, cell-level editing of status, priority, assignees and dates.
- **Gantt Chart** — modelled on Microsoft Project; see below.
- **Calendar** — month grid by due date, click a day to add.

## The Gantt Chart view

This is a real scheduling tool, not a bar chart. Dates are **derived**: a task has a duration in working days and a set of predecessor links, and the engine computes Start and Finish from them. Change a duration and everything downstream moves.

**Entry table** (left) — ID, Task Name, Duration, Start, Finish, Predecessors, Resource Names. Double-click any cell to edit; Enter commits and moves down, Tab moves across, Escape cancels. Drag the splitter to widen it.

**Predecessors** use MSP's own notation, typed straight into the column:

| Entry | Meaning |
| --- | --- |
| `4` | Finish-to-start on row 4, no lag |
| `4FS+2d` | Finish-to-start with 2 days lag |
| `7SS` | Start-to-start |
| `9FF-1d` | Finish-to-finish, 1 day lead |
| `3SF` | Start-to-finish |

Multiple links are comma-separated. All four link types carry lead/lag, and a link that would close a loop is rejected rather than silently breaking the plan — circular references are detected and flagged in the indicators column.

**Chart** (right) — blue task bars with a black progress bar inside, black summary bars with down-turned end caps, black milestone diamonds, and orthogonal link arrows routed per link type. The **critical path** is computed with a full backward pass (total slack) and can be toggled red. Non-working days are shaded, today is a dashed red line, and the timescale switches between Days, Weeks, Months and Quarters.

**Editing** — insert and delete rows, indent/outdent to build the outline (indenting turns a task into a summary), select two or more rows and Link them finish-to-start, or Unlink. Drag a bar to reschedule it, drag either end to change its duration. Right-click a bar for the quick actions. The Task Information dialog gives the General and Predecessors tabs, with a type dropdown and lag field per link.

**Working time** — Monday to Friday by default, so a 5-day task starting Monday finishes Friday and durations never silently absorb a weekend. The calendar is a single object in `data/schedule.js` if you need to change it.

**Export to PDF** — builds a dedicated print document (project header, legend, repeated column headers, page breaks between row blocks) and hands it to the browser's print dialog; choose *Save as PDF* as the destination. A4, A3 or Letter landscape, over the whole project or the next 3/12 months. The output is vector with selectable text. Turn on "Background graphics" in the print dialog so the bars are included.

### Where it stops short of Microsoft Project

Worth knowing before anyone plans a programme on it:

- **Resources are names, not effort.** There is no work/units model, no cost, no resource levelling and no over-allocation warning. Assigning three people to a task does not shorten it.
- **One constraint type.** Editing Start pins a task, equivalent to Start-No-Earlier-Than. The other seven MSP constraint types, deadlines and task calendars are not implemented.
- **Auto-scheduled only.** There is no manually-scheduled task mode with the placeholder dates MSP allows.
- **Days, not hours.** Durations are whole working days; elapsed durations (`3ed`) and part-days are not supported.
- **No baselines**, so no plan-versus-actual variance, and no earned value.
- **One calendar** for the whole project — no per-task or per-resource calendars, and holidays are an empty list you would populate in code.
- **No .mpp import or export.** JSON export in Settings is the only round trip.

The parts people actually use daily — the entry grid, the four link types with lag, duration-driven rescheduling, the outline, the critical path and printing — are here and behave the way they do in MSP.

**Across the workspace**
- Home dashboard: open/overdue/due-today counts, per-project progress split by status, upcoming deadlines, workload per person, recent activity.
- My work: everything assigned to you bucketed into overdue / today / next 7 days / later / undated.
- Docs: Markdown notes attached to a project or the workspace, rendered by default and editable on click.
- Command palette (`⌘K` / `Ctrl K`) over tasks, projects, docs, people and commands.
- Filters (status, priority, assignee, label, hide-completed), sorting, dark mode, keyboard shortcuts (`?` lists them), undo for deletions, JSON export and import.

---

## Running it

It is static, but ES modules need HTTP — opening `index.html` from the filesystem will not work.

```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/aryanote/
```

On the sign-in screen, **Explore the demo workspace** loads a populated studio — three projects, six people, ~40 tasks with dependencies and comments — dated relative to today, so the timeline always looks current.

---

## Design language

Editorial rather than dashboard. The rules, if you extend it:

- **Warm paper and ink.** The neutral ramp (`--paper-*`) is warm, not blue-grey. Canvas `#faf8f4`, ink `#1a1815`.
- **Colour is signal, never decoration.** Status and priority use low-chroma earth tones — moss, ochre, slate, rust — and appear as a small dot beside plain text, never as a tinted fill behind it. Overdue is the one place a colour is allowed to be loud.
- **Primary actions are ink**, not a brand colour. `--accent` (a muted slate navy) is reserved for links, focus rings and selection.
- **Hairlines, not boxes.** Shadows are near-zero; separation comes from 1px rules and whitespace. Radii stay in the 3–8px range.
- **Type carries hierarchy.** A serif face (`--font-serif`, system stack) sets page titles, the sign-in headline and dashboard figures; the sans UI face handles everything functional. Section headings are small, uppercase and letterspaced rather than large and bold.

Status marks distinguish *not started* from *in flight*: `hollow: true` statuses render as an empty ring, everything else as a filled dot.

## Architecture

```
aryanote/
├── index.html                  app shell + pre-paint theme script
├── manifest.webmanifest
└── assets/
    ├── css/
    │   ├── tokens.css          colour, type, spacing, motion; light + dark
    │   ├── base.css            reset and shared components
    │   ├── app.css             shell, sidebar, topbar, auth
    │   ├── views.css           board, table, calendar, panel, docs
    │   ├── gantt.css           MS Project-style Gantt chart
    │   └── print.css           PDF / print output
    └── js/
        ├── lib/                dom, date, markdown, icons  (no app knowledge)
        ├── data/               adapter, store, schema, api, auth, schedule, seed
        ├── app/                main, router, state, shell
        ├── views/              one module per screen
        └── ui/                 overlay, bits, taskpanel, palette
```

The dependency direction is one-way: `lib` knows nothing, `data` uses `lib`, `views`/`ui` use `data`, and `app` wires them together.

### The data layer

`data/store.js` holds records in `Map`s with secondary indexes on the hot lookups (`tasks.projectId`, `comments.taskId`, …). Reads are synchronous so view code stays simple; writes mutate memory, notify subscribers on the next microtask, and persist on a 250 ms debounce.

`data/api.js` is the only thing views call to change data. Task numbering, cascading deletes, dependency cycle checks, activity logging and undo all live there, so no view can get them wrong.

### Swapping in a real backend

Persistence sits behind one interface with four methods, in `data/adapter.js`:

```js
read(collection)            -> Promise<Array<Record>>
write(collection, records)  -> Promise<void>
readMeta(key)               -> Promise<any>
writeMeta(key, value)       -> Promise<void>
```

`LocalAdapter` implements it against `localStorage`. `RestAdapter` in the same file implements it against an HTTP API and is ready to use:

```js
// assets/js/app/main.js
await store.init(new RestAdapter('/api', { token }));
```

Nothing in `views/`, `ui/` or `app/` assumes storage is local or synchronous, so that one line is the whole switch. Two things genuinely need server work when you make that move:

1. **Authentication.** `data/auth.js` verifies the password hash on the client. That protects the stored record, but a browser cannot enforce an access boundary — move `login`/`signup` behind the API and issue a session token.
2. **Write conflicts.** `store.flush()` writes whole collections. Against a shared database you want per-record `PATCH` plus a version or timestamp check; the store already tracks which collections are dirty, which is the natural place to narrow that down.

---

## Honest limitations

- **Data is per-browser.** Everything lives in this browser's `localStorage`. Two people on two machines do not see each other's boards, and clearing site data starts you fresh. Settings → Export JSON takes a backup. This is the deliberate trade for a zero-server deployment; the adapter above is the way out.
- **Client-side auth.** As described above — real hashing, but not a real access boundary.
- **Storage ceiling.** `localStorage` is typically ~5 MB, which is thousands of tasks, but not unlimited. The adapter degrades to in-memory rather than throwing if the quota is hit or storage is blocked (private browsing).
- **No file uploads or notifications.** Both need a server.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl K` | Search and commands |
| `C` | New task |
| `/` | Focus the filter box |
| `G` then `H` / `M` / `P` / `D` | Home / My work / People / Docs |
| `⌘Z` / `Ctrl Z` | Undo the last deletion |
| `Esc` | Close panel or dialog |
| `?` | Shortcut list |

---

## Browser support

Modern evergreen browsers (ES modules, `CSS color-mix`, pointer events, WebCrypto). Chrome, Edge, Firefox and Safari current releases. Serve over HTTPS or `localhost` so `crypto.subtle` is available — outside a secure context the app warns on the sign-in screen and falls back to a weaker hash.
