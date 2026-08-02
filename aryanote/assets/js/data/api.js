/* ==========================================================================
   Domain operations. Views never mutate the store directly — they call these,
   so numbering, cascades, activity logging and undo stay consistent.
   ========================================================================== */

import store from './store.js';
import {
  makeWorkspace, makeMember, makeProject, makeGroup, makeTask,
  makeComment, makeActivity, makeDoc, makeUser,
  keyFrom, isDoneStatus, PROJECT_COLORS, PRIORITY_ORDER, statusOf, STATUSES,
} from './schema.js';
import { todayKey, toDate, diffDays, key as dateKey } from '../lib/date.js';
import { schedule, wouldCycle } from './schedule.js';

/* -- session-scoped actor ------------------------------------------------- */
let actorId = null;
export const setActor = (id) => { actorId = id; };
export const getActorId = () => actorId;

/* -- workspaces ----------------------------------------------------------- */

export function createWorkspace({ name, ownerId }) {
  return store.batch(() => {
    const ws = store.insert('workspaces', makeWorkspace({ name, ownerId }));
    store.insert('members', makeMember({ workspaceId: ws.id, userId: ownerId, role: 'owner' }));
    return ws;
  });
}

export function workspacesForUser(userId) {
  const ids = new Set(store.filter('members', (m) => m.userId === userId).map((m) => m.workspaceId));
  return store.all('workspaces')
    .filter((ws) => ids.has(ws.id))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function membersOf(workspaceId) {
  return store.where('members', 'workspaceId', workspaceId)
    .map((member) => ({ ...member, user: store.get('users', member.userId) }))
    .filter((m) => m.user)
    .sort((a, b) => {
      if (a.user.pending !== b.user.pending) return a.user.pending ? 1 : -1;
      return a.user.name.localeCompare(b.user.name);
    });
}

export function memberRole(workspaceId, userId) {
  const member = store.find('members', (m) => m.workspaceId === workspaceId && m.userId === userId);
  return member?.role || null;
}

export function usersOf(workspaceId) {
  return membersOf(workspaceId).map((m) => m.user);
}

/** Add someone by email. Creates a placeholder account they can claim later. */
export function inviteMember(workspaceId, { name, email, role = 'member' }) {
  const clean = (email || '').toLowerCase().trim();
  return store.batch(() => {
    let user = clean ? store.find('users', (u) => u.email === clean) : null;
    if (!user) {
      user = store.insert('users', makeUser({
        name: name || clean.split('@')[0] || 'Teammate',
        email: clean,
        pending: true,
      }));
    }
    const existing = store.find('members', (m) => m.workspaceId === workspaceId && m.userId === user.id);
    if (existing) return { user, member: existing, alreadyMember: true };
    const member = store.insert('members', makeMember({ workspaceId, userId: user.id, role }));
    log({ workspaceId, verb: 'invited', detail: user.name });
    return { user, member, alreadyMember: false };
  });
}

export function removeMember(workspaceId, userId) {
  return store.batch(() => {
    const member = store.find('members', (m) => m.workspaceId === workspaceId && m.userId === userId);
    if (member) store.remove('members', member.id);
    // Leave their name on history, but drop them from open assignments.
    for (const project of store.where('projects', 'workspaceId', workspaceId)) {
      for (const task of store.where('tasks', 'projectId', project.id)) {
        if (task.assigneeIds.includes(userId)) {
          store.update('tasks', task.id, {
            assigneeIds: task.assigneeIds.filter((id) => id !== userId),
          });
        }
      }
    }
    return member;
  });
}

export function setMemberRole(workspaceId, userId, role) {
  const member = store.find('members', (m) => m.workspaceId === workspaceId && m.userId === userId);
  if (member) store.update('members', member.id, { role });
  return member;
}

/* -- projects ------------------------------------------------------------- */

export function projectsOf(workspaceId, { includeArchived = false } = {}) {
  return store.where('projects', 'workspaceId', workspaceId)
    .filter((p) => includeArchived || !p.archived)
    .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
}

export function createProject(workspaceId, { name, color, description = '', withStarterLists = true }) {
  return store.batch(() => {
    const existing = projectsOf(workspaceId, { includeArchived: true });
    const project = store.insert('projects', makeProject({
      workspaceId,
      name,
      description,
      key: keyFrom(name, existing.map((p) => p.key)),
      color: color || PROJECT_COLORS[existing.length % PROJECT_COLORS.length],
      order: existing.length,
    }));
    if (withStarterLists) {
      ['Planning', 'In flight', 'Wrap up'].forEach((listName, i) => {
        store.insert('groups', makeGroup({
          projectId: project.id,
          name: listName,
          color: PROJECT_COLORS[(i + 2) % PROJECT_COLORS.length],
          order: i,
        }));
      });
    }
    log({ workspaceId, projectId: project.id, verb: 'created project', detail: project.name });
    return project;
  });
}

export function updateProject(id, patch) {
  return store.update('projects', id, patch);
}

export function deleteProject(id) {
  return store.batch(() => {
    const project = store.get('projects', id);
    if (!project) return null;
    const tasks = store.where('tasks', 'projectId', id);
    for (const task of tasks) {
      store.removeWhere('comments', (c) => c.taskId === task.id);
      store.remove('tasks', task.id);
    }
    store.removeWhere('groups', (g) => g.projectId === id);
    store.removeWhere('docs', (d) => d.projectId === id);
    store.remove('projects', id);
    log({ workspaceId: project.workspaceId, verb: 'deleted project', detail: project.name });
    return project;
  });
}

/* -- groups (task lists) -------------------------------------------------- */

export function groupsOf(projectId) {
  return store.where('groups', 'projectId', projectId)
    .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
}

export function createGroup(projectId, name = 'New list') {
  const existing = groupsOf(projectId);
  return store.insert('groups', makeGroup({
    projectId,
    name,
    color: PROJECT_COLORS[(existing.length + 2) % PROJECT_COLORS.length],
    order: existing.length,
  }));
}

export function deleteGroup(groupId, { deleteTasks = false } = {}) {
  return store.batch(() => {
    const group = store.get('groups', groupId);
    if (!group) return null;
    const tasks = store.where('tasks', 'projectId', group.projectId)
      .filter((t) => t.groupId === groupId);
    for (const task of tasks) {
      if (deleteTasks) deleteTask(task.id, { silent: true });
      else store.update('tasks', task.id, { groupId: null });
    }
    store.remove('groups', groupId);
    return group;
  });
}

/* -- tasks ---------------------------------------------------------------- */

export function tasksOf(projectId) {
  return store.where('tasks', 'projectId', projectId);
}

export function tasksOfWorkspace(workspaceId) {
  const projects = projectsOf(workspaceId, { includeArchived: true });
  return projects.flatMap((p) => tasksOf(p.id));
}

export function createTask(projectId, data = {}) {
  return store.batch(() => {
    const project = store.get('projects', projectId);
    if (!project) return null;
    const number = (project.counter || 0) + 1;
    store.update('projects', projectId, { counter: number });

    const siblings = tasksOf(projectId).filter((t) => t.groupId === (data.groupId || null));
    const order = data.order ?? (siblings.length
      ? Math.min(...siblings.map((t) => t.order)) - 1
      : 0);

    const task = store.insert('tasks', makeTask({
      ...data,
      projectId,
      number,
      order,
      createdBy: data.createdBy || actorId,
    }));
    log({
      workspaceId: project.workspaceId,
      projectId,
      taskId: task.id,
      verb: 'created',
      detail: task.title,
    });
    return task;
  });
}

export function updateTask(id, patch, { verb = null, detail = '' } = {}) {
  return store.batch(() => {
    const before = store.get('tasks', id);
    if (!before) return null;
    const changes = { ...patch, updatedAt: Date.now() };

    if (patch.status && patch.status !== before.status) {
      const nowDone = isDoneStatus(patch.status);
      changes.completedAt = nowDone ? Date.now() : null;
      if (nowDone) changes.progress = 100;
      else if (before.progress === 100) changes.progress = 0;
    }

    const task = store.update('tasks', id, changes);
    const project = store.get('projects', task.projectId);
    if (project && verb !== false) {
      log({
        workspaceId: project.workspaceId,
        projectId: project.id,
        taskId: task.id,
        verb: verb || describeChange(before, changes),
        detail,
      });
    }
    return task;
  });
}

function describeChange(before, changes) {
  if (changes.status && changes.status !== before.status) {
    return `moved to ${statusOf(changes.status).name}`;
  }
  if (changes.assigneeIds) return 'changed assignees';
  if (changes.dueDate !== undefined && changes.dueDate !== before.dueDate) return 'changed the due date';
  if (changes.priority && changes.priority !== before.priority) return 'changed priority';
  if (changes.title && changes.title !== before.title) return 'renamed the task';
  return 'updated';
}

export function deleteTask(id, { silent = false } = {}) {
  return store.batch(() => {
    const task = store.get('tasks', id);
    if (!task) return null;
    const comments = store.where('comments', 'taskId', id);
    store.removeWhere('comments', (c) => c.taskId === id);
    // Drop dangling dependency references.
    for (const other of tasksOf(task.projectId)) {
      if (other.dependsOn?.includes(id)) {
        store.update('tasks', other.id, { dependsOn: other.dependsOn.filter((d) => d !== id) });
      }
    }
    store.remove('tasks', id);

    if (!silent) {
      store.pushUndo(`Deleted "${task.title}"`, () => {
        store.batch(() => {
          store.insert('tasks', task);
          comments.forEach((c) => store.insert('comments', c));
        });
      });
    }
    return task;
  });
}

export function duplicateTask(id) {
  const source = store.get('tasks', id);
  if (!source) return null;
  return createTask(source.projectId, {
    ...source,
    id: undefined,
    number: undefined,
    title: `${source.title} (copy)`,
    createdAt: undefined,
    updatedAt: undefined,
    completedAt: null,
    status: source.status,
    order: source.order + 0.5,
  });
}

export function toggleAssignee(taskId, userId) {
  const task = store.get('tasks', taskId);
  if (!task) return null;
  const has = task.assigneeIds.includes(userId);
  const assigneeIds = has
    ? task.assigneeIds.filter((id) => id !== userId)
    : [...task.assigneeIds, userId];
  const user = store.get('users', userId);
  return updateTask(taskId, { assigneeIds }, {
    verb: has ? 'unassigned' : 'assigned',
    detail: user?.name || '',
  });
}

export function moveTask(taskId, { status, groupId, beforeId = null, afterId = null }) {
  const task = store.get('tasks', taskId);
  if (!task) return null;

  const patch = {};
  if (status !== undefined && status !== task.status) patch.status = status;
  if (groupId !== undefined && groupId !== task.groupId) patch.groupId = groupId;

  const targetStatus = status ?? task.status;
  const targetGroup = groupId !== undefined ? groupId : task.groupId;
  const siblings = tasksOf(task.projectId)
    .filter((t) => t.id !== taskId
      && (status !== undefined ? t.status === targetStatus : true)
      && (groupId !== undefined ? t.groupId === targetGroup : true))
    .sort((a, b) => a.order - b.order);

  patch.order = computeOrder(siblings, beforeId, afterId);
  return updateTask(taskId, patch, { verb: patch.status ? undefined : false });
}

/** Fractional ordering so reordering never rewrites the whole list. */
function computeOrder(siblings, beforeId, afterId) {
  const index = (id) => siblings.findIndex((t) => t.id === id);
  if (beforeId) {
    const i = index(beforeId);
    if (i > -1) {
      const prev = siblings[i - 1];
      return prev ? (prev.order + siblings[i].order) / 2 : siblings[i].order - 1;
    }
  }
  if (afterId) {
    const i = index(afterId);
    if (i > -1) {
      const next = siblings[i + 1];
      return next ? (siblings[i].order + next.order) / 2 : siblings[i].order + 1;
    }
  }
  return siblings.length ? siblings[siblings.length - 1].order + 1 : 0;
}

/** Shift a task's dates, keeping duration. Used by timeline dragging. */
export function shiftTaskDates(taskId, days) {
  const task = store.get('tasks', taskId);
  if (!task || !days) return null;
  const patch = {};
  if (task.startDate) patch.startDate = dateKey(addDaysKey(task.startDate, days));
  if (task.dueDate) patch.dueDate = dateKey(addDaysKey(task.dueDate, days));
  return updateTask(taskId, patch, { verb: 'rescheduled' });
}

function addDaysKey(key, days) {
  const d = toDate(key);
  d.setDate(d.getDate() + days);
  return d;
}

/* -- scheduling ----------------------------------------------------------- */

/**
 * Run the scheduler over a project and cache the resulting dates back onto
 * the tasks, so board, table and calendar all read the same plan. Returns the
 * computed map keyed by task id.
 */
export function rescheduleProject(projectId) {
  const tasks = tasksOf(projectId);
  if (!tasks.length) return new Map();

  const computed = schedule(tasks.map((task) => ({
    id: task.id,
    parentId: task.parentId || null,
    duration: task.duration ?? 1,
    predecessors: task.predecessors || [],
    manualStart: task.manualStart || null,
    milestone: task.milestone,
  })));

  store.batch(() => {
    for (const task of tasks) {
      const c = computed.get(task.id);
      if (!c) continue;
      const startDate = dateKey(c.start);
      const dueDate = dateKey(c.finish);
      if (task.startDate !== startDate || task.dueDate !== dueDate) {
        // Written directly: a recalculation is not a user edit worth logging.
        store.update('tasks', task.id, { startDate, dueDate });
      }
    }
  });

  return computed;
}

/** Ordered rows for the Gantt: group summaries followed by their tasks. */
export function outlineRows(projectId) {
  const groups = groupsOf(projectId);
  const tasks = tasksOf(projectId);
  const rows = [];

  const byParent = new Map();
  for (const task of tasks) {
    const parent = task.parentId && tasks.some((t) => t.id === task.parentId)
      ? task.parentId : null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(task);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.outlineOrder ?? a.order) - (b.outlineOrder ?? b.order));
  }

  const pushTask = (task, level) => {
    rows.push({ kind: 'task', task, level });
    (byParent.get(task.id) || []).forEach((child) => pushTask(child, level + 1));
  };

  for (const group of groups) {
    const members = (byParent.get(null) || []).filter((t) => t.groupId === group.id);
    rows.push({ kind: 'group', group, level: 0 });
    members.forEach((task) => pushTask(task, 1));
  }

  const orphans = (byParent.get(null) || [])
    .filter((task) => !groups.some((g) => g.id === task.groupId));
  if (orphans.length) {
    rows.push({ kind: 'group', group: { id: '__none', name: 'Unassigned', color: 'var(--text-4)' }, level: 0 });
    orphans.forEach((task) => pushTask(task, 1));
  }

  return rows;
}

/** Insert a task directly beneath `afterTaskId`, at the same outline level. */
export function insertTaskAfter(projectId, afterTaskId, data = {}) {
  const after = afterTaskId ? store.get('tasks', afterTaskId) : null;
  const siblings = tasksOf(projectId)
    .filter((t) => (t.parentId || null) === (after?.parentId || null))
    .sort((a, b) => (a.outlineOrder ?? a.order) - (b.outlineOrder ?? b.order));

  let outlineOrder = 0;
  if (after) {
    const index = siblings.findIndex((t) => t.id === after.id);
    const next = siblings[index + 1];
    const base = after.outlineOrder ?? after.order;
    outlineOrder = next ? (base + (next.outlineOrder ?? next.order)) / 2 : base + 1;
  } else if (siblings.length) {
    outlineOrder = Math.min(...siblings.map((t) => t.outlineOrder ?? t.order)) - 1;
  }

  return createTask(projectId, {
    title: data.title ?? '',
    status: data.status || 'todo',
    groupId: data.groupId !== undefined ? data.groupId : (after?.groupId ?? null),
    parentId: data.parentId !== undefined ? data.parentId : (after?.parentId ?? null),
    duration: data.duration ?? 1,
    outlineOrder,
    order: outlineOrder,
    ...data,
  });
}

/** Indent a task so it becomes a child of the row above it. */
export function indentTask(projectId, taskId) {
  const rows = outlineRows(projectId).filter((r) => r.kind === 'task');
  const index = rows.findIndex((r) => r.task.id === taskId);
  if (index <= 0) return null;

  const task = rows[index].task;
  const above = rows[index - 1].task;
  if (above.id === task.parentId) return null;

  // The new parent is the row above, or its ancestor at the matching level.
  let candidate = above;
  while (candidate && levelOfTask(candidate) > levelOfTask(task)) {
    candidate = store.get('tasks', candidate.parentId);
  }
  if (!candidate) return null;

  return updateTask(taskId, {
    parentId: candidate.id,
    groupId: candidate.groupId,
  }, { verb: 'indented the task' });
}

export function outdentTask(taskId) {
  const task = store.get('tasks', taskId);
  if (!task?.parentId) return null;
  const parent = store.get('tasks', task.parentId);
  return updateTask(taskId, {
    parentId: parent?.parentId || null,
    groupId: parent?.groupId ?? task.groupId,
  }, { verb: 'outdented the task' });
}

function levelOfTask(task, depth = 0) {
  if (!task?.parentId || depth > 30) return 0;
  return 1 + levelOfTask(store.get('tasks', task.parentId), depth + 1);
}

/** Link tasks in sequence with finish-to-start, as MSP's chain button does. */
export function linkTasks(taskIds) {
  return store.batch(() => {
    for (let i = 1; i < taskIds.length; i += 1) {
      const target = store.get('tasks', taskIds[i]);
      if (!target) continue;
      const predId = taskIds[i - 1];
      if (target.predecessors?.some((link) => link.id === predId)) continue;
      if (wouldCycle(tasksOf(target.projectId), target.id, predId)) continue;
      store.update('tasks', target.id, {
        predecessors: [...(target.predecessors || []), { id: predId, type: 'FS', lag: 0 }],
        manualStart: null,
      });
    }
    const first = store.get('tasks', taskIds[0]);
    if (first) rescheduleProject(first.projectId);
  });
}

export function unlinkTasks(taskIds) {
  return store.batch(() => {
    const set = new Set(taskIds);
    for (const id of taskIds) {
      const task = store.get('tasks', id);
      if (!task) continue;
      store.update('tasks', id, {
        predecessors: (task.predecessors || []).filter((link) => !set.has(link.id)),
      });
    }
    const first = store.get('tasks', taskIds[0]);
    if (first) rescheduleProject(first.projectId);
  });
}

export function setPredecessors(taskId, links) {
  const task = store.get('tasks', taskId);
  if (!task) return null;
  const safe = links.filter((link) =>
    link.id !== taskId && !wouldCycle(tasksOf(task.projectId), taskId, link.id));
  const result = updateTask(taskId, {
    predecessors: safe,
    manualStart: safe.length ? null : task.manualStart,
  }, { verb: 'changed predecessors' });
  rescheduleProject(task.projectId);
  return { task: result, rejected: links.length - safe.length };
}

export function setDuration(taskId, duration) {
  const task = store.get('tasks', taskId);
  if (!task) return null;
  const result = updateTask(taskId, {
    duration: Math.max(0, duration),
    milestone: duration === 0,
  }, { verb: 'changed the duration' });
  rescheduleProject(task.projectId);
  return result;
}

/** Pin a task to a start date (MSP's Start-No-Earlier-Than in effect). */
export function setManualStart(taskId, startKey) {
  const task = store.get('tasks', taskId);
  if (!task) return null;
  const result = updateTask(taskId, { manualStart: startKey }, { verb: 'rescheduled' });
  rescheduleProject(task.projectId);
  return result;
}

/* -- dependencies --------------------------------------------------------- */

export function addDependency(taskId, dependsOnId) {
  if (taskId === dependsOnId) return null;
  const task = store.get('tasks', taskId);
  if (!task || task.dependsOn.includes(dependsOnId)) return null;
  if (createsCycle(taskId, dependsOnId)) return { error: 'That would create a circular dependency.' };
  return updateTask(taskId, { dependsOn: [...task.dependsOn, dependsOnId] }, { verb: 'added a dependency' });
}

export function removeDependency(taskId, dependsOnId) {
  const task = store.get('tasks', taskId);
  if (!task) return null;
  return updateTask(taskId, {
    dependsOn: task.dependsOn.filter((id) => id !== dependsOnId),
  }, { verb: 'removed a dependency' });
}

function createsCycle(taskId, candidateId) {
  const seen = new Set();
  const walk = (id) => {
    if (id === taskId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const node = store.get('tasks', id);
    return (node?.dependsOn || []).some(walk);
  };
  return walk(candidateId);
}

/** Dependencies whose predecessor finishes after this task starts. */
export function violatedDependencies(task) {
  if (!task.startDate) return [];
  return (task.dependsOn || [])
    .map((id) => store.get('tasks', id))
    .filter((dep) => dep && dep.dueDate && diffDays(dep.dueDate, task.startDate) < 0);
}

/* -- comments & activity -------------------------------------------------- */

export function commentsOf(taskId) {
  return store.where('comments', 'taskId', taskId).sort((a, b) => a.createdAt - b.createdAt);
}

export function addComment(taskId, body) {
  const text = body.trim();
  if (!text) return null;
  return store.batch(() => {
    const comment = store.insert('comments', makeComment({ taskId, authorId: actorId, body: text }));
    const task = store.get('tasks', taskId);
    const project = task && store.get('projects', task.projectId);
    if (project) {
      log({ workspaceId: project.workspaceId, projectId: project.id, taskId, verb: 'commented' });
    }
    return comment;
  });
}

export function deleteComment(id) {
  return store.remove('comments', id);
}

export function log({ workspaceId, projectId = null, taskId = null, verb, detail = '' }) {
  if (!workspaceId || !actorId) return null;
  const entry = store.insert('activity', makeActivity({
    workspaceId, projectId, taskId, actorId, verb, detail,
  }));
  // Keep the log bounded — this is a client-side store, not an audit trail.
  const all = store.where('activity', 'workspaceId', workspaceId);
  if (all.length > 400) {
    all.sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, all.length - 400)
      .forEach((old) => store.remove('activity', old.id));
  }
  return entry;
}

export function activityOf(workspaceId, { taskId = null, limit = 40 } = {}) {
  return store.where('activity', 'workspaceId', workspaceId)
    .filter((a) => (taskId ? a.taskId === taskId : true))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/* -- docs ----------------------------------------------------------------- */

export function docsOf(workspaceId, projectId = undefined) {
  return store.where('docs', 'workspaceId', workspaceId)
    .filter((d) => (projectId === undefined ? true : d.projectId === projectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createDoc(workspaceId, { projectId = null, title = 'Untitled', body = '' } = {}) {
  const doc = store.insert('docs', makeDoc({ workspaceId, projectId, title, body, authorId: actorId }));
  log({ workspaceId, projectId, verb: 'created a doc', detail: title });
  return doc;
}

export function updateDoc(id, patch) {
  return store.update('docs', id, { ...patch, updatedAt: Date.now() });
}

export function deleteDoc(id) {
  return store.remove('docs', id);
}

/* -- derived queries ------------------------------------------------------ */

export function sortTasks(tasks, sortKey = 'manual', direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  const sorted = [...tasks];
  const compare = {
    manual: (a, b) => a.order - b.order,
    title: (a, b) => a.title.localeCompare(b.title),
    status: (a, b) => STATUSES.findIndex((s) => s.id === a.status) - STATUSES.findIndex((s) => s.id === b.status),
    priority: (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    dueDate: (a, b) => nullsLast(a.dueDate, b.dueDate),
    startDate: (a, b) => nullsLast(a.startDate, b.startDate),
    created: (a, b) => a.createdAt - b.createdAt,
    updated: (a, b) => a.updatedAt - b.updatedAt,
  }[sortKey] || ((a, b) => a.order - b.order);

  return sorted.sort((a, b) => compare(a, b) * dir || a.order - b.order);
}

function nullsLast(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function filterTasks(tasks, filters = {}) {
  const query = (filters.query || '').trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.status?.length && !filters.status.includes(task.status)) return false;
    if (filters.priority?.length && !filters.priority.includes(task.priority)) return false;
    if (filters.assignee?.length) {
      const wantsNobody = filters.assignee.includes('none');
      const matches = task.assigneeIds.some((id) => filters.assignee.includes(id));
      if (!(matches || (wantsNobody && task.assigneeIds.length === 0))) return false;
    }
    if (filters.label?.length && !task.labels.some((l) => filters.label.includes(l))) return false;
    if (filters.hideDone && isDoneStatus(task.status)) return false;
    if (query) {
      const haystack = `${task.title} ${task.description} ${task.labels.join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function labelsOf(workspaceId) {
  const set = new Set();
  for (const task of tasksOfWorkspace(workspaceId)) {
    task.labels.forEach((l) => set.add(l));
  }
  return Array.from(set).sort();
}

export function myTasks(workspaceId, userId) {
  return tasksOfWorkspace(workspaceId).filter((t) => t.assigneeIds.includes(userId));
}

export function projectStats(projectId) {
  const tasks = tasksOf(projectId);
  const done = tasks.filter((t) => isDoneStatus(t.status)).length;
  const overdue = tasks.filter((t) => !isDoneStatus(t.status) && t.dueDate && t.dueDate < todayKey()).length;
  return {
    total: tasks.length,
    done,
    overdue,
    active: tasks.filter((t) => statusOf(t.status).group === 'active').length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

export function workspaceStats(workspaceId) {
  const tasks = tasksOfWorkspace(workspaceId);
  const today = todayKey();
  const byStatus = {};
  for (const status of STATUSES) byStatus[status.id] = 0;
  for (const task of tasks) byStatus[task.status] = (byStatus[task.status] || 0) + 1;

  const completedThisWeek = tasks.filter((t) =>
    t.completedAt && Date.now() - t.completedAt < 7 * 86400000).length;

  return {
    total: tasks.length,
    open: tasks.filter((t) => !isDoneStatus(t.status)).length,
    done: tasks.filter((t) => isDoneStatus(t.status)).length,
    overdue: tasks.filter((t) => !isDoneStatus(t.status) && t.dueDate && t.dueDate < today).length,
    dueToday: tasks.filter((t) => !isDoneStatus(t.status) && t.dueDate === today).length,
    unassigned: tasks.filter((t) => !isDoneStatus(t.status) && !t.assigneeIds.length).length,
    completedThisWeek,
    byStatus,
  };
}

export function workloadOf(workspaceId) {
  const users = usersOf(workspaceId);
  const tasks = tasksOfWorkspace(workspaceId).filter((t) => !isDoneStatus(t.status));
  return users.map((user) => {
    const assigned = tasks.filter((t) => t.assigneeIds.includes(user.id));
    return {
      user,
      total: assigned.length,
      overdue: assigned.filter((t) => t.dueDate && t.dueDate < todayKey()).length,
      active: assigned.filter((t) => statusOf(t.status).group === 'active').length,
    };
  }).sort((a, b) => b.total - a.total);
}
