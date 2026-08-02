/* ==========================================================================
   Scheduling engine, modelled on Microsoft Project.

   Dates are derived, not stored by hand: a task has a duration in working
   days and a set of predecessor links, and the engine computes Start and
   Finish from them. Four link types are supported with lead/lag, exactly as
   MSP writes them in the Predecessors column:

     4        finish-to-start, no lag      (shorthand for 4FS)
     4FS+2d   finish-to-start, 2 day lag
     7SS      start-to-start
     9FF-1d   finish-to-finish, 1 day lead
     3SF      start-to-finish

   Finish is inclusive — a 5 day task starting Monday finishes Friday, which
   is what MSP shows and what people expect when reading a plan.
   ========================================================================== */

import { toDate, key as dateKey, addDays, isWeekend } from '../lib/date.js';

export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];

export const DEFAULT_CALENDAR = {
  // Monday–Friday, matching the MSP "Standard" base calendar.
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
};

/* -- working time --------------------------------------------------------- */

export function isWorkingDay(date, calendar = DEFAULT_CALENDAR) {
  const d = toDate(date);
  if (!d) return false;
  if (!calendar.workingDays.includes(d.getDay())) return false;
  return !calendar.holidays?.includes(dateKey(d));
}

/** Move forward to the next working day (returns the date itself if working). */
export function nextWorkingDay(date, calendar = DEFAULT_CALENDAR) {
  let d = toDate(date);
  let guard = 0;
  while (!isWorkingDay(d, calendar) && guard < 400) { d = addDays(d, 1); guard += 1; }
  return d;
}

export function prevWorkingDay(date, calendar = DEFAULT_CALENDAR) {
  let d = toDate(date);
  let guard = 0;
  while (!isWorkingDay(d, calendar) && guard < 400) { d = addDays(d, -1); guard += 1; }
  return d;
}

/**
 * Add `count` working days. 0 returns the same day (snapped to working time),
 * so finish = addWorkingDays(start, duration - 1).
 */
export function addWorkingDays(date, count, calendar = DEFAULT_CALENDAR) {
  let d = nextWorkingDay(date, calendar);
  let remaining = Math.abs(count);
  const step = count < 0 ? -1 : 1;
  let guard = 0;
  while (remaining > 0 && guard < 4000) {
    d = addDays(d, step);
    if (isWorkingDay(d, calendar)) remaining -= 1;
    guard += 1;
  }
  return d;
}

/** Inclusive count of working days between two dates. */
export function workingDaysBetween(start, finish, calendar = DEFAULT_CALENDAR) {
  const a = toDate(start);
  const b = toDate(finish);
  if (!a || !b || b < a) return 0;
  let count = 0;
  const cursor = new Date(a);
  let guard = 0;
  while (cursor <= b && guard < 4000) {
    if (isWorkingDay(cursor, calendar)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return count;
}

/* -- predecessor text ----------------------------------------------------- */

const LINK_RE = /^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+(?:\.\d+)?)?\s*(d|day|days|w|week|weeks)?$/i;

/**
 * Parse an MSP predecessor string into links.
 * `rowToId` maps the displayed row number to a task id.
 * Returns { links, errors }.
 */
export function parsePredecessors(text, rowToId) {
  const links = [];
  const errors = [];
  const parts = String(text || '').split(/[,;]/).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const match = LINK_RE.exec(part.replace(/\s+/g, ''));
    if (!match) { errors.push(part); continue; }

    const row = Number(match[1]);
    const id = rowToId.get(row);
    if (!id) { errors.push(part); continue; }

    let lag = match[3] ? Number(match[3].replace(/\s+/g, '')) : 0;
    const unit = (match[4] || 'd').toLowerCase();
    if (unit.startsWith('w')) lag *= 5;

    links.push({ id, type: (match[2] || 'FS').toUpperCase(), lag });
  }
  return { links, errors };
}

/** Render links back to MSP's column format, e.g. "3FS+2d, 7SS". */
export function formatPredecessors(links = [], idToRow) {
  return links
    .map((link) => {
      const row = idToRow.get(link.id);
      if (!row) return null;
      // MSP omits the type only for a plain finish-to-start with no lag;
      // once there is lag the type is always written out.
      const type = link.type === 'FS' && !link.lag ? '' : link.type;
      const lag = link.lag ? `${link.lag > 0 ? '+' : ''}${link.lag}d` : '';
      return `${row}${type}${lag}`;
    })
    .filter(Boolean)
    .join(', ');
}

/** "5d", "2w", "3" -> working days. Returns null when unparseable. */
export function parseDuration(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|week|weeks|h|hr|hrs|hour|hours)?\s*\??\s*$/i
    .exec(String(text ?? ''));
  if (!match) return null;
  let value = Number(match[1]);
  const unit = (match[2] || 'd').toLowerCase();
  if (unit.startsWith('w')) value *= 5;
  else if (unit.startsWith('h')) value /= 8;
  return Math.max(0, Math.round(value));
}

export function formatDuration(days) {
  const value = Number(days) || 0;
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

/* -- the engine ----------------------------------------------------------- */

/**
 * schedule(tasks, options) -> Map(taskId -> computed)
 *
 * computed: { start, finish, duration, isSummary, level, slack, critical }
 *
 * `tasks` are plain records carrying: id, parentId, duration, predecessors,
 * manualStart (optional pin), milestone.
 */
export function schedule(tasks, {
  calendar = DEFAULT_CALENDAR,
  projectStart = null,
} = {}) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map();
  for (const task of tasks) {
    const parent = task.parentId && byId.has(task.parentId) ? task.parentId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(task);
  }

  const isSummary = (id) => (children.get(id)?.length || 0) > 0;
  const start0 = nextWorkingDay(projectStart || earliestAnchor(tasks) || new Date(), calendar);

  const computed = new Map();
  const order = topoSort(tasks, byId);

  /* forward pass — leaves only; summaries roll up afterwards */
  for (const task of order) {
    if (isSummary(task.id)) continue;

    const duration = Math.max(0, Number(task.duration ?? 1));
    let start = task.manualStart ? nextWorkingDay(task.manualStart, calendar) : start0;

    for (const link of task.predecessors || []) {
      const pred = computed.get(link.id);
      if (!pred) continue;
      const lag = Number(link.lag) || 0;
      let candidate;

      switch (link.type) {
        case 'SS':
          candidate = addWorkingDays(pred.start, lag, calendar);
          break;
        case 'FF': {
          // Constrain the finish, then work back to a start.
          const finish = addWorkingDays(pred.finish, lag, calendar);
          candidate = duration <= 1 ? finish : addWorkingDays(finish, -(duration - 1), calendar);
          break;
        }
        case 'SF': {
          const finish = addWorkingDays(pred.start, lag, calendar);
          candidate = duration <= 1 ? finish : addWorkingDays(finish, -(duration - 1), calendar);
          break;
        }
        case 'FS':
        default:
          candidate = addWorkingDays(pred.finish, 1 + lag, calendar);
          break;
      }
      if (candidate > start) start = candidate;
    }

    start = nextWorkingDay(start, calendar);
    const finish = duration <= 1 ? start : addWorkingDays(start, duration - 1, calendar);
    computed.set(task.id, {
      start,
      finish,
      duration: duration || 0,
      isSummary: false,
      milestone: duration === 0 || Boolean(task.milestone),
    });
  }

  /* roll summaries up from the deepest level outwards */
  const rollUp = (id) => {
    const kids = children.get(id) || [];
    let start = null;
    let finish = null;
    for (const kid of kids) {
      if (isSummary(kid.id)) rollUp(kid.id);
      const c = computed.get(kid.id);
      if (!c) continue;
      if (!start || c.start < start) start = c.start;
      if (!finish || c.finish > finish) finish = c.finish;
    }
    if (id === null) return;
    if (!start) {
      computed.set(id, {
        start: start0, finish: start0, duration: 0, isSummary: true, milestone: false,
      });
      return;
    }
    computed.set(id, {
      start,
      finish,
      duration: workingDaysBetween(start, finish, calendar),
      isSummary: true,
      milestone: false,
    });
  };
  for (const task of tasks) if (isSummary(task.id) && !task.parentId) rollUp(task.id);
  // Nested summaries whose parent was not a root still need a pass.
  for (const task of tasks) if (isSummary(task.id) && !computed.has(task.id)) rollUp(task.id);

  /* backward pass — total slack and the critical path */
  const projectFinish = Array.from(computed.values())
    .reduce((max, c) => (!max || c.finish > max ? c.finish : max), null);

  const successors = new Map();
  for (const task of tasks) {
    for (const link of task.predecessors || []) {
      if (!successors.has(link.id)) successors.set(link.id, []);
      successors.get(link.id).push({ id: task.id, type: link.type, lag: Number(link.lag) || 0 });
    }
  }

  const lateFinish = new Map();
  for (const task of [...order].reverse()) {
    const c = computed.get(task.id);
    if (!c || c.isSummary) continue;
    const succs = successors.get(task.id) || [];
    let lf = projectFinish;
    for (const succ of succs) {
      const sc = computed.get(succ.id);
      const slf = lateFinish.get(succ.id) || sc?.finish;
      if (!sc || !slf) continue;
      const slateStart = sc.duration <= 1 ? slf : addWorkingDays(slf, -(sc.duration - 1), calendar);
      let candidate;
      switch (succ.type) {
        case 'SS': candidate = addWorkingDays(slateStart, -succ.lag, calendar); break;
        case 'FF': candidate = addWorkingDays(slf, -succ.lag, calendar); break;
        case 'SF': candidate = addWorkingDays(slf, -succ.lag, calendar); break;
        case 'FS':
        default: candidate = addWorkingDays(slateStart, -(1 + succ.lag), calendar); break;
      }
      if (!lf || candidate < lf) lf = candidate;
    }
    lateFinish.set(task.id, lf);
    const slack = workingDaysBetween(c.finish, lf, calendar) - 1;
    c.slack = Math.max(0, slack);
    c.critical = c.slack <= 0;
  }

  for (const c of computed.values()) {
    if (c.isSummary) {
      c.slack = 0;
      c.critical = false;
    }
  }

  /* outline levels */
  const levelOf = (task, depth = 0) => {
    if (!task.parentId || !byId.has(task.parentId) || depth > 30) return 0;
    return 1 + levelOf(byId.get(task.parentId), depth + 1);
  };
  for (const task of tasks) {
    const c = computed.get(task.id);
    if (c) {
      c.level = levelOf(task);
      c.isSummary = isSummary(task.id);
    }
  }

  return computed;
}

function earliestAnchor(tasks) {
  const anchors = tasks.map((t) => t.manualStart).filter(Boolean).sort();
  return anchors.length ? toDate(anchors[0]) : null;
}

/**
 * Dependency-first ordering. Links that would close a cycle are ignored here
 * so the plan still schedules; `findCycles` reports them to the user.
 */
function topoSort(tasks, byId) {
  const state = new Map();
  const out = [];

  const visit = (task) => {
    const status = state.get(task.id);
    if (status === 'done') return;
    if (status === 'visiting') return;
    state.set(task.id, 'visiting');
    for (const link of task.predecessors || []) {
      const pred = byId.get(link.id);
      if (pred) visit(pred);
    }
    state.set(task.id, 'done');
    out.push(task);
  };

  for (const task of tasks) visit(task);
  return out;
}

/** Task ids that take part in a circular dependency. */
export function findCycles(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map();
  const bad = new Set();

  const visit = (task, stack) => {
    if (state.get(task.id) === 'done') return;
    if (state.get(task.id) === 'visiting') {
      const from = stack.indexOf(task.id);
      stack.slice(from).forEach((id) => bad.add(id));
      return;
    }
    state.set(task.id, 'visiting');
    stack.push(task.id);
    for (const link of task.predecessors || []) {
      const pred = byId.get(link.id);
      if (pred) visit(pred, stack);
    }
    stack.pop();
    state.set(task.id, 'done');
  };

  for (const task of tasks) visit(task, []);
  return bad;
}

/** Would linking `fromId -> toId` close a loop? */
export function wouldCycle(tasks, toId, fromId) {
  if (toId === fromId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set();
  const walk = (id) => {
    if (id === toId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const task = byId.get(id);
    return (task?.predecessors || []).some((link) => walk(link.id));
  };
  return walk(fromId);
}
