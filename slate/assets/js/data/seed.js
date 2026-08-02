/* ==========================================================================
   Demo content. Generated relative to today so the timeline always looks live.
   ========================================================================== */

import store from './store.js';
import {
  makeUser, makeWorkspace, makeMember, makeProject, makeGroup, makeTask,
  makeComment, makeActivity, makeDoc, uid,
} from './schema.js';
import { key, addDays, today } from '../lib/date.js';

const d = (offset) => key(addDays(today(), offset));

const TEAM = [
  { name: 'Priya Raman',    email: 'priya@northwind.studio',  title: 'Product lead',      color: '#5a6b7d' },
  { name: 'Tom Okafor',     email: 'tom@northwind.studio',    title: 'Engineering',       color: '#5a7355' },
  { name: 'Elena Vasquez',  email: 'elena@northwind.studio',  title: 'Design',            color: '#8c5a6a' },
  { name: 'Sam Whitfield',  email: 'sam@northwind.studio',    title: 'Delivery manager',  color: '#8c7a3f' },
  { name: 'Nadia Haddad',   email: 'nadia@northwind.studio',  title: 'Research',          color: '#7a6c8c' },
];

/**
 * Populate a workspace for `ownerId` with three projects, a team, tasks,
 * comments and docs. Returns the workspace.
 */
export function seedWorkspace(ownerId, { name = 'Northwind Studio' } = {}) {
  return store.batch(() => {
    const owner = store.get('users', ownerId);
    const workspace = store.insert('workspaces', makeWorkspace({ name, ownerId }));
    store.insert('members', makeMember({ workspaceId: workspace.id, userId: ownerId, role: 'owner' }));

    // Teammates — placeholder accounts anyone can claim by signing up with
    // the same email address.
    const team = TEAM.map((person, i) => {
      const existing = store.find('users', (u) => u.email === person.email);
      const user = existing || store.insert('users', makeUser({ ...person, pending: true }));
      if (!store.find('members', (m) => m.workspaceId === workspace.id && m.userId === user.id)) {
        store.insert('members', makeMember({
          workspaceId: workspace.id,
          userId: user.id,
          role: i === 0 ? 'admin' : 'member',
        }));
      }
      return user;
    });

    const [priya, tom, elena, sam, nadia] = team;
    const everyone = [owner, ...team];

    const projects = [
      buildAtlas(workspace, { owner, priya, tom, elena, sam, nadia }),
      buildBrand(workspace, { owner, priya, elena, sam }),
      buildOps(workspace, { owner, sam, nadia, tom }),
    ];

    seedDocs(workspace, projects, owner);
    seedActivity(workspace, projects, everyone);

    return workspace;
  });
}

/* -- project builders ----------------------------------------------------- */

function buildAtlas(workspace, people) {
  const { owner, priya, tom, elena, sam, nadia } = people;
  const project = store.insert('projects', makeProject({
    workspaceId: workspace.id,
    name: 'Atlas Platform',
    key: 'ATL',
    color: '#3a5169',
    description: 'Rebuild of the core scheduling engine and the customer-facing dashboard.',
    startDate: d(-24),
    targetDate: d(46),
    order: 0,
  }));

  const lists = ['Discovery', 'Build', 'Launch'].map((name, i) => store.insert('groups', makeGroup({
    projectId: project.id, name, order: i,
    color: ['#7a6c8c', '#3a5169', '#5a7355'][i],
  })));

  const rows = [
    { t: 'Map the current scheduling data model', g: 0, s: 'done', p: 'high', a: [tom], sd: -24, dd: -17, est: 20 },
    { t: 'Interview 8 operations customers', g: 0, s: 'done', p: 'high', a: [nadia, priya], sd: -22, dd: -12, est: 24, lb: ['research'] },
    { t: 'Synthesise research into problem statements', g: 0, s: 'done', p: 'medium', a: [nadia], sd: -12, dd: -7, est: 10, lb: ['research'] },
    { t: 'Agree success metrics with leadership', g: 0, s: 'done', p: 'medium', a: [priya], sd: -10, dd: -6, est: 6 },
    { t: 'Discovery complete', g: 0, s: 'done', p: 'none', a: [], sd: -6, dd: -6, ms: true },

    { t: 'Schema migration plan', g: 1, s: 'done', p: 'urgent', a: [tom], sd: -8, dd: -2, est: 16 },
    { t: 'Build availability service', g: 1, s: 'doing', p: 'urgent', a: [tom, owner], sd: -2, dd: 9, est: 40, prog: 45, lb: ['engineering'] },
    { t: 'Dashboard information architecture', g: 1, s: 'doing', p: 'high', a: [elena], sd: -1, dd: 6, est: 18, prog: 60, lb: ['design'] },
    { t: 'Conflict-resolution rules engine', g: 1, s: 'todo', p: 'high', a: [tom], sd: 8, dd: 20, est: 34, lb: ['engineering'] },
    { t: 'High-fidelity dashboard designs', g: 1, s: 'todo', p: 'high', a: [elena], sd: 6, dd: 15, est: 24, lb: ['design'] },
    { t: 'Accessibility audit of new components', g: 1, s: 'backlog', p: 'medium', a: [elena, nadia], sd: 16, dd: 22, est: 12, lb: ['design', 'review'] },
    { t: 'Load-test the availability service', g: 1, s: 'blocked', p: 'high', a: [tom], sd: 11, dd: 17, est: 14, lb: ['engineering', 'blocked'] },
    { t: 'API documentation for partners', g: 1, s: 'backlog', p: 'low', a: [owner], sd: 18, dd: 26, est: 10, lb: ['writing'] },

    { t: 'Migration dry run on staging', g: 2, s: 'todo', p: 'urgent', a: [tom, sam], sd: 22, dd: 28, est: 20 },
    { t: 'Write customer release notes', g: 2, s: 'backlog', p: 'medium', a: [priya], sd: 28, dd: 33, est: 6, lb: ['writing'] },
    { t: 'Train the support team', g: 2, s: 'backlog', p: 'medium', a: [sam], sd: 30, dd: 36, est: 8 },
    { t: 'Public launch', g: 2, s: 'backlog', p: 'urgent', a: [priya, owner], sd: 42, dd: 42, ms: true },
  ];

  const created = addTasks(project, lists, rows);

  // Dependencies: research -> synthesis -> metrics, build chain, launch chain.
  link(created, 2, [1]);
  link(created, 3, [2]);
  link(created, 6, [5]);
  link(created, 8, [6]);
  link(created, 9, [7]);
  link(created, 11, [6]);
  link(created, 13, [6, 8]);
  link(created, 16, [13, 14, 15]);

  addComments(created[6], [
    [tom, 'Availability lookups are down to 40ms on the test dataset. Caching the recurrence expansion made the difference.', -3],
    [priya, 'That is well inside the target. Can we hold that with 10x the bookings?', -2],
    [tom, 'Load test is queued behind the staging refresh — tracked separately.', -1],
  ]);
  addComments(created[11], [
    [tom, 'Blocked until the staging environment is refreshed with production-shaped data.', -1],
  ]);
  addComments(created[7], [
    [elena, 'First pass at the IA is in the design file. The big change is collapsing scheduling and availability into one surface.', -2],
    [priya, 'Much clearer. Let us test the collapsed view with two of the ops customers before we commit.', -1],
  ]);

  store.update('tasks', created[6].id, {
    checklist: [
      { id: uid('chk'), text: 'Recurrence expansion', done: true },
      { id: uid('chk'), text: 'Timezone normalisation', done: true },
      { id: uid('chk'), text: 'Bulk availability endpoint', done: false },
      { id: uid('chk'), text: 'Cache invalidation on booking', done: false },
    ],
    description: 'Replace the nightly batch job with a service that answers availability queries directly.\n\nMust hold under 100ms at p95 for a 12-week window.',
  });

  return project;
}

function buildBrand(workspace, people) {
  const { owner, priya, elena, sam } = people;
  const project = store.insert('projects', makeProject({
    workspaceId: workspace.id,
    name: 'Brand & Website',
    key: 'BRA',
    color: '#8c5a6a',
    description: 'Refresh the brand system and rebuild the marketing site on it.',
    startDate: d(-10),
    targetDate: d(38),
    order: 1,
  }));

  const lists = ['Identity', 'Site build', 'Content'].map((name, i) => store.insert('groups', makeGroup({
    projectId: project.id, name, order: i,
    color: ['#8c5a6a', '#4f6d6b', '#9a7328'][i],
  })));

  const rows = [
    { t: 'Audit the existing brand assets', g: 0, s: 'done', p: 'medium', a: [elena], sd: -10, dd: -6, est: 8 },
    { t: 'Type and colour exploration', g: 0, s: 'done', p: 'high', a: [elena], sd: -6, dd: -1, est: 16, lb: ['design'] },
    { t: 'Present three directions to the team', g: 0, s: 'review', p: 'high', a: [elena, priya], sd: -2, dd: -1, est: 6, lb: ['design', 'review'] },
    { t: 'Component library in the design tool', g: 0, s: 'todo', p: 'medium', a: [elena], sd: 4, dd: 12, est: 22, lb: ['design'] },

    { t: 'Information architecture for the new site', g: 1, s: 'doing', p: 'high', a: [priya], sd: -1, dd: 5, est: 12, prog: 70 },
    { t: 'Build the design system in code', g: 1, s: 'todo', p: 'high', a: [owner], sd: 12, dd: 24, est: 36, lb: ['engineering'] },
    { t: 'Homepage build', g: 1, s: 'backlog', p: 'medium', a: [owner], sd: 24, dd: 31, est: 20 },
    { t: 'Analytics and consent banner', g: 1, s: 'backlog', p: 'low', a: [sam], sd: 28, dd: 32, est: 6 },

    { t: 'Rewrite the product pages', g: 2, s: 'todo', p: 'medium', a: [priya], sd: 8, dd: 18, est: 20, lb: ['writing'] },
    { t: 'Commission photography', g: 2, s: 'backlog', p: 'low', a: [sam], sd: 14, dd: 26, est: 10, lb: ['client'] },
    { t: 'Case study: Meridian rollout', g: 2, s: 'backlog', p: 'medium', a: [priya], sd: 20, dd: 30, est: 14, lb: ['writing', 'client'] },
    { t: 'Site live', g: 2, s: 'backlog', p: 'high', a: [owner], sd: 36, dd: 36, ms: true },
  ];

  const created = addTasks(project, lists, rows);
  link(created, 2, [1]);
  link(created, 3, [2]);
  link(created, 5, [3]);
  link(created, 6, [5]);
  link(created, 11, [6, 8]);

  addComments(created[2], [
    [priya, 'Direction two is the strongest — it reads as confident without being cold. Can we see it applied to a dense table?', -1],
  ]);

  return project;
}

function buildOps(workspace, people) {
  const { owner, sam, nadia, tom } = people;
  const project = store.insert('projects', makeProject({
    workspaceId: workspace.id,
    name: 'Client Onboarding',
    key: 'OPS',
    color: '#5a7355',
    description: 'Standardise how new clients are set up in their first thirty days.',
    startDate: d(-14),
    targetDate: d(30),
    order: 2,
  }));

  const lists = ['Meridian Group', 'Halton Rail', 'Process'].map((name, i) => store.insert('groups', makeGroup({
    projectId: project.id, name, order: i,
    color: ['#5a7355', '#6c7b8b', '#9c6b4a'][i],
  })));

  const rows = [
    { t: 'Kickoff workshop', g: 0, s: 'done', p: 'high', a: [sam], sd: -14, dd: -13, est: 4, lb: ['client'] },
    { t: 'Import historic schedules', g: 0, s: 'done', p: 'high', a: [tom], sd: -12, dd: -5, est: 16 },
    { t: 'Configure approval workflow', g: 0, s: 'doing', p: 'medium', a: [sam], sd: -4, dd: 0, est: 10, prog: 55, lb: ['client'] },
    { t: 'Train the Meridian schedulers', g: 0, s: 'todo', p: 'high', a: [sam, nadia], sd: 5, dd: 9, est: 12, lb: ['client'] },
    { t: 'Meridian go-live', g: 0, s: 'backlog', p: 'urgent', a: [sam], sd: 12, dd: 12, ms: true },

    { t: 'Scoping call with Halton', g: 1, s: 'done', p: 'medium', a: [sam], sd: -6, dd: -6, est: 2, lb: ['client'] },
    { t: 'Data quality review', g: 1, s: 'todo', p: 'high', a: [tom, nadia], sd: 2, dd: 10, est: 18 },
    { t: 'Depot rota migration', g: 1, s: 'backlog', p: 'medium', a: [tom], sd: 11, dd: 22, est: 26 },

    { t: 'Write the onboarding playbook', g: 2, s: 'doing', p: 'medium', a: [nadia], sd: -3, dd: 7, est: 14, prog: 35, lb: ['writing'] },
    { t: 'Template the kickoff deck', g: 2, s: 'backlog', p: 'low', a: [sam], sd: 8, dd: 14, est: 6 },
    { t: 'Automate the welcome sequence', g: 2, s: 'backlog', p: 'low', a: [owner], sd: 16, dd: 24, est: 12, lb: ['quick win'] },
  ];

  const created = addTasks(project, lists, rows);
  link(created, 2, [1]);
  link(created, 3, [2]);
  link(created, 4, [3]);
  link(created, 7, [6]);

  addComments(created[2], [
    [sam, 'Meridian want two approval levels above £5k. Straightforward with the current rules, just needs configuring per depot.', -2],
  ]);

  return project;
}

/* -- helpers -------------------------------------------------------------- */

function addTasks(project, lists, rows) {
  return rows.map((row, index) => {
    const number = index + 1;
    const task = store.insert('tasks', makeTask({
      projectId: project.id,
      groupId: lists[row.g].id,
      number,
      title: row.t,
      status: row.s,
      priority: row.p,
      assigneeIds: (row.a || []).map((u) => u.id),
      startDate: row.sd === undefined ? null : d(row.sd),
      dueDate: row.dd === undefined ? null : d(row.dd),
      estimate: row.est ?? null,
      progress: row.prog ?? 0,
      labels: row.lb || [],
      milestone: row.ms || false,
      order: index,
      createdBy: (row.a || [])[0]?.id || null,
      createdAt: Date.now() - (rows.length - index) * 3600000,
      completedAt: row.s === 'done' ? Date.now() - Math.abs(row.dd || 1) * 86400000 : null,
    }));
    return task;
  }).map((task, index, all) => {
    if (index === all.length - 1) store.update('projects', project.id, { counter: all.length });
    return task;
  });
}

function link(tasks, targetIndex, dependencyIndexes) {
  const target = tasks[targetIndex];
  if (!target) return;
  const dependsOn = dependencyIndexes.map((i) => tasks[i]?.id).filter(Boolean);
  store.update('tasks', target.id, { dependsOn });
}

function addComments(task, entries) {
  if (!task) return;
  entries.forEach(([author, body, dayOffset]) => {
    store.insert('comments', makeComment({
      taskId: task.id,
      authorId: author.id,
      body,
      createdAt: Date.now() + dayOffset * 86400000 + Math.random() * 3600000,
    }));
  });
}

function seedDocs(workspace, projects, owner) {
  store.insert('docs', makeDoc({
    workspaceId: workspace.id,
    projectId: null,
    authorId: owner.id,
    title: 'How we work',
    updatedAt: Date.now() - 2 * 86400000,
    body: `# How we work

A short guide to the rhythm of the studio. Keep it current — if something here is wrong, change it.

## The week

- **Monday** — planning. We pull work into *In progress* only when it is genuinely starting.
- **Wednesday** — mid-week check. Anything blocked for more than two days gets escalated here.
- **Friday** — demo and write-up. Ship notes go in the project doc, not in chat.

## Task hygiene

1. Every task has an owner and a due date. If it has neither, it is an idea, not a task.
2. Estimates are in hours and are a forecast, not a commitment.
3. If a task takes more than three days, break it down.

> A board that is honest about what is stuck is more useful than a board that looks tidy.

## Statuses

| Status | Means |
| --- | --- |
| Backlog | Agreed it matters, not scheduled |
| To do | Scheduled for this cycle |
| In progress | Someone is actively on it |
| In review | Waiting on another person |
| Blocked | Waiting on something outside our control |
| Done | Shipped and verified |
`,
  }));

  store.insert('docs', makeDoc({
    workspaceId: workspace.id,
    projectId: projects[0].id,
    authorId: owner.id,
    title: 'Atlas — technical approach',
    updatedAt: Date.now() - 6 * 3600000,
    body: `# Atlas technical approach

## Problem

The nightly batch job that precomputes availability is the source of most support tickets. It is stale by definition and it cannot answer questions about a window longer than four weeks.

## Approach

Replace it with a service that answers availability queries **on demand**, backed by a cache that is invalidated on booking.

- Expand recurrence rules lazily, not eagerly
- Normalise everything to UTC at the boundary
- Keep a per-resource cache keyed by \`resource:week\`

## Open questions

- [x] Do we need sub-minute granularity? *No — 5 minute slots are enough.*
- [ ] How do we handle resources that span timezones mid-shift?
- [ ] Is the partner API in scope for the first release?

## Targets

\`\`\`
p95 latency   < 100ms   (12-week window)
cache hit     > 90%
migration     zero downtime
\`\`\`
`,
  }));

  store.insert('docs', makeDoc({
    workspaceId: workspace.id,
    projectId: projects[2].id,
    authorId: owner.id,
    title: 'Onboarding playbook (draft)',
    updatedAt: Date.now() - 26 * 3600000,
    body: `# Onboarding playbook

The first thirty days decide whether a client renews. This is the sequence we run.

## Days 1–5

1. Kickoff workshop — map their current process before proposing ours
2. Identify the one metric they will judge us on
3. Agree the go-live date and work backwards from it

## Days 6–20

- Import historic data and reconcile it with them in the room
- Configure approvals to match their real authority levels, not the org chart
- Train the people who will use it daily, not their managers

## Days 21–30

- Shadow their first live week
- Hand over to support with a written summary
`,
  }));
}

function seedActivity(workspace, projects, people) {
  const verbs = [
    ['moved to In progress', 0], ['commented', 0], ['assigned', 1],
    ['created', 1], ['moved to Done', 2], ['changed the due date', 2],
    ['added a dependency', 0], ['moved to In review', 1],
  ];
  const tasks = projects.flatMap((p) => store.where('tasks', 'projectId', p.id));
  for (let i = 0; i < 22; i += 1) {
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    const [verb] = verbs[i % verbs.length];
    const actor = people[(i * 3) % people.length];
    if (!task || !actor) continue;
    store.insert('activity', makeActivity({
      workspaceId: workspace.id,
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      verb,
      detail: verb === 'assigned' ? people[(i + 1) % people.length].name : '',
      createdAt: Date.now() - i * 5400000 - Math.random() * 3600000,
    }));
  }
}

/* -- demo account --------------------------------------------------------- */

export const DEMO_EMAIL = 'alex@northwind.studio';

/** Ready-made account so the app can be explored without signing up. */
export function ensureDemoUser() {
  let user = store.find('users', (u) => u.email === DEMO_EMAIL);
  if (!user) {
    user = store.insert('users', makeUser({
      name: 'Alex Moore',
      email: DEMO_EMAIL,
      title: 'Studio director',
      color: '#3a5169',
      pending: false,
    }));
  }
  const hasWorkspace = store.find('members', (m) => m.userId === user.id);
  if (!hasWorkspace) seedWorkspace(user.id);
  return user;
}
