/* ==========================================================================
   Entity definitions, enums and factories.
   ========================================================================== */

export const COLLECTIONS = [
  'users', 'workspaces', 'members', 'projects', 'groups',
  'tasks', 'comments', 'activity', 'docs',
];

/* Statuses ---------------------------------------------------------------- */
export const STATUSES = [
  { id: 'backlog',  name: 'Backlog',     color: 'var(--st-backlog)', group: 'open',   icon: 'circle', hollow: true },
  { id: 'todo',     name: 'To do',       color: 'var(--st-planned)', group: 'open',   icon: 'circle', hollow: true },
  { id: 'doing',    name: 'In progress', color: 'var(--st-active)',  group: 'active', icon: 'circle' },
  { id: 'review',   name: 'In review',   color: 'var(--st-review)',  group: 'active', icon: 'circle' },
  { id: 'done',     name: 'Done',        color: 'var(--st-done)',    group: 'closed', icon: 'check' },
  { id: 'blocked',  name: 'Blocked',     color: 'var(--st-blocked)', group: 'open',   icon: 'alert' },
];

export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
export const statusOf = (id) => STATUS_BY_ID[id] || STATUS_BY_ID.backlog;
export const isDoneStatus = (id) => statusOf(id).group === 'closed';

/* Priorities -------------------------------------------------------------- */
export const PRIORITIES = [
  { id: 'none',   name: 'No priority', level: 0, color: 'var(--pr-low)' },
  { id: 'low',    name: 'Low',         level: 1, color: 'var(--pr-low)' },
  { id: 'medium', name: 'Medium',      level: 2, color: 'var(--pr-medium)' },
  { id: 'high',   name: 'High',        level: 3, color: 'var(--pr-high)' },
  { id: 'urgent', name: 'Urgent',      level: 3, color: 'var(--pr-urgent)' },
];

export const PRIORITY_BY_ID = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]));
export const priorityOf = (id) => PRIORITY_BY_ID[id] || PRIORITY_BY_ID.none;
export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/* Roles ------------------------------------------------------------------- */
export const ROLES = [
  { id: 'owner',  name: 'Owner',  desc: 'Full access, including deleting the workspace.' },
  { id: 'admin',  name: 'Admin',  desc: 'Manage projects, members and settings.' },
  { id: 'member', name: 'Member', desc: 'Create and edit tasks across projects.' },
  { id: 'guest',  name: 'Guest',  desc: 'View and comment only.' },
];
export const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[2];
export const canManage = (role) => role === 'owner' || role === 'admin';
export const canEdit = (role) => role !== 'guest';

/* Palettes ---------------------------------------------------------------- */
/* Low-chroma earth tones. These sit beside each other constantly — in the
   sidebar, on cards, in avatar stacks — so they are kept close in value and
   saturation to read as one family rather than a set of highlighter pens. */
export const PROJECT_COLORS = [
  '#3a5169', '#5a7355', '#9c4a38', '#7a6c8c', '#9a7328',
  '#4f6d6b', '#8c5a6a', '#6c7b8b', '#6b7a4f', '#9c6b4a',
];

export const AVATAR_COLORS = [
  '#5a6b7d', '#5a7355', '#9c6b4a', '#7a6c8c', '#8c7a3f',
  '#4f6d6b', '#8c5a5a', '#6b6355', '#5f7a8c', '#7a6b4f',
  '#6b5f7a', '#7d6b5a',
];

export const LABEL_SUGGESTIONS = [
  'design', 'engineering', 'research', 'bug', 'blocked',
  'client', 'admin', 'writing', 'review', 'quick win',
];

/* ID generation ----------------------------------------------------------- */
let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic colour pick from a string. */
export function colorFor(seed, palette = AVATAR_COLORS) {
  let hash = 0;
  const str = String(seed || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Short project key, e.g. "Website Redesign" -> "WEB". */
export function keyFrom(name, taken = []) {
  const words = String(name).trim().toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let base;
  if (!words.length) base = 'PRJ';
  else if (words.length === 1) base = words[0].slice(0, 3);
  else base = words.slice(0, 3).map((w) => w[0]).join('');
  base = base.padEnd(2, 'X');
  let candidate = base;
  let n = 1;
  while (taken.includes(candidate)) { n += 1; candidate = `${base}${n}`; }
  return candidate;
}

/* Factories --------------------------------------------------------------- */
export function makeUser(data = {}) {
  const name = data.name || 'Unnamed';
  return {
    id: data.id || uid('usr'),
    name,
    email: (data.email || '').toLowerCase().trim(),
    title: data.title || '',
    passwordHash: data.passwordHash || null,
    salt: data.salt || null,
    color: data.color || colorFor(data.email || name),
    pending: data.pending ?? false,
    createdAt: data.createdAt || Date.now(),
  };
}

export function makeWorkspace(data = {}) {
  return {
    id: data.id || uid('ws'),
    name: data.name || 'My workspace',
    ownerId: data.ownerId || null,
    createdAt: data.createdAt || Date.now(),
  };
}

export function makeMember(data = {}) {
  return {
    id: data.id || uid('mem'),
    workspaceId: data.workspaceId,
    userId: data.userId,
    role: data.role || 'member',
    joinedAt: data.joinedAt || Date.now(),
  };
}

export function makeProject(data = {}) {
  return {
    id: data.id || uid('prj'),
    workspaceId: data.workspaceId,
    name: data.name || 'Untitled project',
    key: data.key || 'PRJ',
    color: data.color || PROJECT_COLORS[0],
    description: data.description || '',
    startDate: data.startDate || null,
    targetDate: data.targetDate || null,
    archived: data.archived ?? false,
    counter: data.counter || 0,
    createdAt: data.createdAt || Date.now(),
    order: data.order ?? 0,
  };
}

export function makeGroup(data = {}) {
  return {
    id: data.id || uid('grp'),
    projectId: data.projectId,
    name: data.name || 'New list',
    color: data.color || PROJECT_COLORS[1],
    collapsed: data.collapsed ?? false,
    order: data.order ?? 0,
    createdAt: data.createdAt || Date.now(),
  };
}

export function makeTask(data = {}) {
  const now = Date.now();
  return {
    id: data.id || uid('tsk'),
    projectId: data.projectId,
    groupId: data.groupId || null,
    number: data.number || 0,
    // Scheduling: duration and links drive the dates; startDate/dueDate below
    // are the engine's output, cached so the other views can read them.
    duration: data.duration ?? (data.milestone ? 0 : 1),
    predecessors: data.predecessors
      || (data.dependsOn || []).map((id) => ({ id, type: 'FS', lag: 0 })),
    parentId: data.parentId || null,
    manualStart: data.manualStart || null,
    outlineOrder: data.outlineOrder ?? (data.order ?? now),
    title: data.title || 'New task',
    description: data.description || '',
    status: data.status || 'backlog',
    priority: data.priority || 'none',
    assigneeIds: data.assigneeIds || [],
    createdBy: data.createdBy || null,
    startDate: data.startDate || null,
    dueDate: data.dueDate || null,
    estimate: data.estimate ?? null,
    progress: data.progress ?? 0,
    labels: data.labels || [],
    checklist: data.checklist || [],
    dependsOn: data.dependsOn || [],
    milestone: data.milestone ?? false,
    order: data.order ?? now,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    completedAt: data.completedAt || null,
  };
}

export function makeComment(data = {}) {
  return {
    id: data.id || uid('cmt'),
    taskId: data.taskId,
    authorId: data.authorId,
    body: data.body || '',
    createdAt: data.createdAt || Date.now(),
  };
}

export function makeActivity(data = {}) {
  return {
    id: data.id || uid('act'),
    workspaceId: data.workspaceId,
    projectId: data.projectId || null,
    taskId: data.taskId || null,
    actorId: data.actorId,
    verb: data.verb,
    detail: data.detail || '',
    createdAt: data.createdAt || Date.now(),
  };
}

export function makeDoc(data = {}) {
  return {
    id: data.id || uid('doc'),
    workspaceId: data.workspaceId,
    projectId: data.projectId || null,
    title: data.title || 'Untitled',
    body: data.body || '',
    authorId: data.authorId || null,
    createdAt: data.createdAt || Date.now(),
    updatedAt: data.updatedAt || Date.now(),
  };
}

/** Derived completion for a task — explicit progress, else checklist ratio. */
export function taskProgress(task) {
  if (isDoneStatus(task.status)) return 100;
  if (task.progress) return Math.max(0, Math.min(100, task.progress));
  if (task.checklist?.length) {
    const done = task.checklist.filter((i) => i.done).length;
    return Math.round((done / task.checklist.length) * 100);
  }
  return 0;
}

export const taskRef = (project, task) =>
  project ? `${project.key}-${task.number}` : `#${task.number}`;
