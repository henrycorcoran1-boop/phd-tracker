# Slate

A project management workspace — boards, tables, calendars, a real Gantt timeline, docs and team assignment. No build step, no dependencies, no server: it is plain ES modules and CSS, so it deploys anywhere static files can be served, including the GitHub Pages setup this repository already uses.

Live path once merged to `main`: **`/slate/`**

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
- **Timeline** — a genuine Gantt: draggable bars, resize handles on both ends, finish-to-start dependency arrows (highlighted red when a task starts before its predecessor finishes), group roll-up bars, a today marker, and day / week / month / quarter zoom.
- **Calendar** — month grid by due date, click a day to add.

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
# then open http://localhost:8000/slate/
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
slate/
├── index.html                  app shell + pre-paint theme script
├── manifest.webmanifest
└── assets/
    ├── css/
    │   ├── tokens.css          colour, type, spacing, motion; light + dark
    │   ├── base.css            reset and shared components
    │   ├── app.css             shell, sidebar, topbar, auth
    │   └── views.css           board, table, gantt, calendar, panel, docs
    └── js/
        ├── lib/                dom, date, markdown, icons  (no app knowledge)
        ├── data/               adapter, store, schema, api, auth, seed
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
