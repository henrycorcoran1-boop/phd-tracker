/* ==========================================================================
   Gantt Chart view, following Microsoft Project.

   Split view: an editable entry table on the left (ID, Task Name, Duration,
   Start, Finish, Predecessors, Resource Names) and the bar chart on the
   right, sharing one vertical scroll. Dates are computed by the scheduler in
   data/schedule.js — the Start column pins a task, it does not set its plan.
   ========================================================================== */

import { h, mount, clear, throttleRaf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { isDoneStatus, taskProgress } from '../data/schema.js';
import {
  schedule, parsePredecessors, formatPredecessors, parseDuration,
  addWorkingDays, workingDaysBetween, isWorkingDay, nextWorkingDay,
  findCycles, LINK_TYPES, DEFAULT_CALENDAR,
} from '../data/schedule.js';
import { state } from '../app/state.js';
import { suspendRender, resumeRender, scheduleRender } from '../app/shell.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { showModal, closeModal, confirmDialog, toast, showMenu } from '../ui/overlay.js';
import { emptyState } from '../ui/bits.js';
import { exportGanttPdf } from './gantt-print.js';
import {
  toDate, key as dateKey, addDays, diffDays, today, isSameDay, monthNames,
  dayNamesShort, startOfWeek, startOfMonth,
} from '../lib/date.js';

const ROW_H = 26;
const HEAD_H = 44;
const COLS = '26px 36px minmax(170px, 1fr) 74px 96px 96px 116px 128px';

const SCALES = {
  days:    { px: 26,  minor: 'day',   major: 'week',    label: 'Days' },
  weeks:   { px: 9,   minor: 'week',  major: 'month',   label: 'Weeks' },
  months:  { px: 3.1, minor: 'month', major: 'quarter', label: 'Months' },
  quarters:{ px: 1.1, minor: 'quarter', major: 'year',  label: 'Quarters' },
};

/**
 * Live DOM handles for the current render. Selection and collapse are pure UI
 * state, so they are applied in place — a full shell repaint would replace the
 * node between the halves of a double-click and orphan any in-flight drag.
 */
const live = { ctx: null, gridBody: null, chart: null, toolbarHost: null };

/* View state that must survive the shell's re-renders. */
const view = {
  selection: [],
  anchor: null,
  editing: null,      // { taskId, column }
  scale: 'days',
  showCritical: true,
  split: 620,
  scrollLeft: null,
  scrollTop: 0,
  collapsed: new Set(),
  projectId: null,
};

export function renderGantt(host, project) {
  if (!project) return;

  if (view.projectId !== project.id) {
    view.projectId = project.id;
    view.selection = [];
    view.scrollLeft = null;
    view.scrollTop = 0;
  }

  const tasks = api.tasksOf(project.id);
  if (!tasks.length) {
    mount(host, emptyState({
      icon: 'timeline',
      title: 'No tasks to schedule',
      text: 'Add a task to start building the plan. Durations and predecessors drive the dates.',
      action: h('button.btn.btn--primary', {
        type: 'button',
        onClick: () => { api.insertTaskAfter(project.id, null, { title: 'New task' }); },
      }, icon('plus', { size: 14 }), 'Add task'),
    }));
    return;
  }

  // Pure computation for display — edits are what write dates back.
  const computed = schedule(tasks.map((task) => ({
    id: task.id,
    parentId: task.parentId || null,
    duration: task.duration ?? 1,
    predecessors: task.predecessors || [],
    manualStart: task.manualStart || null,
    milestone: task.milestone,
  })));

  const cycles = findCycles(tasks);
  const rows = buildRows(project, computed);
  const rowToId = new Map();
  const idToRow = new Map();
  // Row numbers are positional and contiguous, summary rows included, so the
  // Predecessors column reads the same way it does in MSP.
  rows.forEach((row, index) => {
    row.rowNumber = index + 1;
    if (row.kind !== 'task') return;
    rowToId.set(index + 1, row.task.id);
    idToRow.set(row.task.id, index + 1);
  });

  const range = computeRange(rows, computed);
  const scale = SCALES[view.scale];
  const width = Math.max(400, Math.ceil(range.days * scale.px));

  const ctx = { project, rows, computed, rowToId, idToRow, range, scale, width, cycles };

  const left = buildEntryTable(ctx);
  const splitter = h('div.msp__split', { title: 'Drag to resize' });
  const right = buildChart(ctx);

  const grid = h('div.msp', {
    style: { '--msp-cols': COLS, '--msp-split': `${view.split}px`, '--msp-row-h': `${ROW_H}px` },
  }, left.el, splitter, right.el);

  const toolbarHost = h('div', buildToolbar(ctx));

  mount(host, h('div', {
    style: { display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0' },
  }, toolbarHost, grid));

  live.ctx = ctx;
  live.gridBody = left.body;
  live.chart = right.chart;
  live.toolbarHost = toolbarHost;

  wireScrollSync(left, right);
  wireSplitter(splitter, grid);
  wireBarDragging(right, ctx);

  if (cycles.size) {
    const names = Array.from(cycles).map((id) => store.get('tasks', id)?.title).filter(Boolean);
    toast(`Circular dependency ignored: ${names.slice(0, 2).join(' → ')}${names.length > 2 ? '…' : ''}`,
      { tone: 'error' });
  }
}

/* -- rows ----------------------------------------------------------------- */

function buildRows(project, computed) {
  const all = api.outlineRows(project.id);
  const hidden = new Set();
  const out = [];

  for (const row of all) {
    const parentKey = row.kind === 'group' ? row.group.id : (row.task.parentId || null);
    if (parentKey && hidden.has(parentKey)) {
      if (row.kind === 'task') hidden.add(row.task.id);
      continue;
    }
    if (row.kind === 'group' && view.collapsed.has(row.group.id)) {
      hidden.add(row.group.id);
    }
    if (row.kind === 'task' && view.collapsed.has(row.task.id)) {
      hidden.add(row.task.id);
    }
    out.push(row);
  }

  // Group summary spans, computed from their members.
  for (const row of out) {
    if (row.kind !== 'group') continue;
    const members = api.tasksOf(project.id).filter((t) => t.groupId === row.group.id);
    let start = null;
    let finish = null;
    for (const member of members) {
      const c = computed.get(member.id);
      if (!c) continue;
      if (!start || c.start < start) start = c.start;
      if (!finish || c.finish > finish) finish = c.finish;
    }
    row.span = start ? { start, finish } : null;
    row.count = members.length;
  }

  return out;
}

function computeRange(rows, computed) {
  let min = null;
  let max = null;
  for (const c of computed.values()) {
    if (!min || c.start < min) min = c.start;
    if (!max || c.finish > max) max = c.finish;
  }
  if (!min) { min = today(); max = addDays(today(), 30); }

  const pad = view.scale === 'days' ? 3 : view.scale === 'weeks' ? 7 : 30;
  const start = startOfWeek(addDays(min, -pad));
  const end = addDays(max, pad);
  return { start, end, days: Math.max(7, diffDays(start, end) + 1) };
}

const xFor = (date, range, scale) => diffDays(range.start, date) * scale.px;

/* -- toolbar -------------------------------------------------------------- */

function buildToolbar(ctx) {
  const { project } = ctx;
  const sel = view.selection;
  const one = sel.length === 1 ? store.get('tasks', sel[0]) : null;

  const tool = (label, iconName, onClick, { disabled = false, on = false, title = '' } = {}) =>
    h('button.msp-tool', {
      type: 'button', disabled, title: title || label,
      class: on ? 'is-on' : '',
      onClick,
    }, icon(iconName, { size: 14 }), label);

  return h('div.msp-bar',
    tool('New task', 'plus', () => {
      const task = api.insertTaskAfter(project.id, sel[sel.length - 1] || null, { title: '' });
      api.rescheduleProject(project.id);
      view.selection = [task.id];
      view.editing = { taskId: task.id, column: 'name' };
      scheduleRender();
    }, { title: 'Insert a task below the selection' }),

    tool('Delete', 'trash', async () => {
      const names = sel.map((id) => store.get('tasks', id)?.title).filter(Boolean);
      const ok = await confirmDialog({
        title: sel.length === 1 ? `Delete "${names[0]}"?` : `Delete ${sel.length} tasks?`,
        message: 'Successor tasks will be rescheduled once the links are removed.',
        confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      store.batch(() => { sel.forEach((id) => api.deleteTask(id, { silent: true })); });
      api.rescheduleProject(project.id);
      view.selection = [];
      scheduleRender();
    }, { disabled: !sel.length }),

    h('div.msp-bar__sep'),

    tool('', 'chevronLeft', () => {
      store.batch(() => sel.forEach((id) => api.outdentTask(id)));
      api.rescheduleProject(project.id);
      scheduleRender();
    }, { disabled: !sel.length, title: 'Outdent (Alt+Shift+Left)' }),

    tool('', 'chevronRight', () => {
      store.batch(() => sel.forEach((id) => api.indentTask(project.id, id)));
      api.rescheduleProject(project.id);
      scheduleRender();
    }, { disabled: !sel.length, title: 'Indent (Alt+Shift+Right)' }),

    h('div.msp-bar__sep'),

    tool('Link', 'link', () => {
      const ordered = orderedSelection(ctx);
      api.linkTasks(ordered);
      toast(`Linked ${ordered.length} tasks finish-to-start`);
      scheduleRender();
    }, { disabled: sel.length < 2, title: 'Link the selected tasks (Ctrl+F2)' }),

    tool('Unlink', 'x', () => {
      api.unlinkTasks(orderedSelection(ctx));
      scheduleRender();
    }, { disabled: sel.length < 1, title: 'Unlink the selected tasks' }),

    h('div.msp-bar__sep'),

    tool('Information', 'doc', () => openTaskInformation(ctx, one),
      { disabled: !one, title: 'Task Information (Shift+F2)' }),

    tool('Details', 'external', () => one && openTaskPanel(one.id),
      { disabled: !one, title: 'Open the full task record' }),

    h('div.msp-bar__sep'),

    h('span', { style: { fontSize: '11px', color: 'var(--text-3)', marginRight: '2px' } }, 'Timescale'),
    ...Object.entries(SCALES).map(([id, cfg]) => h('button.msp-tool', {
      type: 'button',
      class: view.scale === id ? 'is-on' : '',
      onClick: () => { view.scale = id; view.scrollLeft = null; scheduleRender(); },
    }, cfg.label)),

    h('div.msp-bar__sep'),

    tool('Critical path', 'zap', () => { view.showCritical = !view.showCritical; scheduleRender(); },
      { on: view.showCritical, title: 'Highlight the critical path' }),

    tool('Scroll to today', 'calendar', () => { view.scrollLeft = null; scheduleRender(); }),

    h('div.u-spacer'),

    h('button.btn.btn--primary.btn--sm', {
      type: 'button',
      onClick: () => exportGanttPdf(ctx),
    }, icon('archive', { size: 13 }), 'Export PDF'));
}

function orderedSelection(ctx) {
  return ctx.rows
    .filter((row) => row.kind === 'task' && view.selection.includes(row.task.id))
    .map((row) => row.task.id);
}

/* -- entry table ---------------------------------------------------------- */

function buildEntryTable(ctx) {
  const { rows, computed, idToRow, cycles } = ctx;

  const head = h('div.msp-grid__head',
    h('div.msp-grid__th.msp-grid__th--center', { title: 'Indicators' }, 'i'),
    h('div.msp-grid__th.msp-grid__th--center', 'ID'),
    h('div.msp-grid__th', 'Task Name'),
    h('div.msp-grid__th.msp-grid__th--right', 'Duration'),
    h('div.msp-grid__th', 'Start'),
    h('div.msp-grid__th', 'Finish'),
    h('div.msp-grid__th', 'Predecessors'),
    h('div.msp-grid__th', 'Resource Names'));

  const body = h('div.msp-grid__body');

  rows.forEach((row, index) => {
    body.appendChild(row.kind === 'group'
      ? groupRow(ctx, row, index)
      : taskRow(ctx, row, index));
  });

  const scroller = h('div.msp__left-scroll', body);
  const el = h('div.msp__left', h('div.msp-grid', head), scroller);
  return { el, body, scroller };
}

function groupRow(ctx, row, index) {
  const collapsed = view.collapsed.has(row.group.id);
  const span = row.span;

  return h('div.msp-row.is-summary', {
    class: collapsed ? 'is-collapsed' : '',
    dataset: { rowIndex: index },
    onClick: () => {
      if (view.collapsed.has(row.group.id)) view.collapsed.delete(row.group.id);
      else view.collapsed.add(row.group.id);
      scheduleRender();
    },
  },
    h('div.msp-cell.msp-cell--center'),
    h('div.msp-cell.msp-cell--id', String(row.rowNumber)),
    h('div.msp-cell.msp-cell--name',
      h('span.msp-twist', icon('chevronDown', { size: 12 })),
      h('span.msp-name', row.group.name)),
    h('div.msp-cell.msp-cell--right.msp-cell--nums',
      span ? `${workingDaysBetween(span.start, span.finish)} d` : ''),
    h('div.msp-cell.msp-cell--nums', span ? fmt(span.start) : ''),
    h('div.msp-cell.msp-cell--nums', span ? fmt(span.finish) : ''),
    h('div.msp-cell'),
    h('div.msp-cell', `${row.count} task${row.count === 1 ? '' : 's'}`));
}

function taskRow(ctx, row, index) {
  const { computed, idToRow, cycles } = ctx;
  const task = row.task;
  const c = computed.get(task.id);
  const rowNumber = row.rowNumber;
  const selected = view.selection.includes(task.id);
  const isSummary = c?.isSummary;
  const hasChildren = api.tasksOf(task.projectId).some((t) => t.parentId === task.id);
  const collapsed = view.collapsed.has(task.id);

  const cell = (className, content, column) => {
    const editable = column && !isSummary;
    const el = h(`div.msp-cell.${className}`, {
      dataset: column ? { column } : {},
      onDblClick: editable ? (event) => { event.stopPropagation(); startEdit(ctx, task, column, el); } : null,
    });
    if (view.editing?.taskId === task.id && view.editing.column === column) {
      requestAnimationFrame(() => startEdit(ctx, task, column, el));
    }
    if (content !== null && content !== undefined) {
      if (content instanceof Node) el.appendChild(content);
      else el.appendChild(document.createTextNode(String(content)));
    }
    return el;
  };

  const indicators = h('div.msp-cell.msp-cell--center');
  if (cycles.has(task.id)) {
    indicators.appendChild(h('span.msp-flag.msp-flag--critical',
      { title: 'Circular dependency' }, icon('alert', { size: 11 })));
  } else if (isDoneStatus(task.status)) {
    indicators.appendChild(h('span.msp-flag', { title: 'Complete' }, icon('check', { size: 11 })));
  } else if (task.manualStart) {
    indicators.appendChild(h('span.msp-flag',
      { title: `Pinned to start ${fmt(task.manualStart)}` }, icon('flag', { size: 11 })));
  }

  const nameCell = h('div.msp-cell.msp-cell--name', {
    dataset: { column: 'name' },
    onDblClick: (event) => { event.stopPropagation(); startEdit(ctx, task, 'name', nameCell); },
  },
    h('span.msp-indent', { style: { width: `${(c?.level || 0) * 14}px` } }),
    hasChildren
      ? h('span.msp-twist', {
        onClick: (event) => {
          event.stopPropagation();
          if (collapsed) view.collapsed.delete(task.id);
          else view.collapsed.add(task.id);
          scheduleRender();
        },
      }, icon('chevronDown', { size: 12 }))
      : h('span.msp-indent', { style: { width: '14px' } }),
    h('span.msp-name', task.title || '(unnamed task)'));

  if (view.editing?.taskId === task.id && view.editing.column === 'name') {
    requestAnimationFrame(() => startEdit(ctx, task, 'name', nameCell));
  }

  const resources = task.assigneeIds
    .map((id) => store.get('users', id)?.name)
    .filter(Boolean)
    .join(', ');

  const el = h('div.msp-row', {
    class: [selected ? 'is-selected' : '', isSummary ? 'is-summary' : '',
      collapsed ? 'is-collapsed' : ''].filter(Boolean).join(' '),
    dataset: { taskId: task.id, rowIndex: index },
    onClick: (event) => selectRow(ctx, task.id, event),
    onContextMenu: (event) => {
      event.preventDefault();
      if (!view.selection.includes(task.id)) selectRow(ctx, task.id, {});
      openRowMenu(ctx, task, event);
    },
  },
    indicators,
    h('div.msp-cell.msp-cell--id', String(rowNumber)),
    nameCell,
    cell('msp-cell--right msp-cell--nums',
      c?.milestone ? '0 d' : `${c?.duration ?? task.duration} d`, 'duration'),
    cell('msp-cell--nums', c ? fmt(c.start) : '', 'start'),
    cell('msp-cell--nums', c ? fmt(c.finish) : '', 'finish'),
    cell('', formatPredecessors(task.predecessors, idToRow), 'predecessors'),
    cell('', resources, 'resources'));

  return el;
}

/* -- selection ------------------------------------------------------------ */

function selectRow(ctx, taskId, event) {
  const taskRows = ctx.rows.filter((r) => r.kind === 'task').map((r) => r.task.id);

  if (event.shiftKey && view.anchor) {
    const from = taskRows.indexOf(view.anchor);
    const to = taskRows.indexOf(taskId);
    if (from > -1 && to > -1) {
      view.selection = taskRows.slice(Math.min(from, to), Math.max(from, to) + 1);
    }
  } else if (event.metaKey || event.ctrlKey) {
    view.selection = view.selection.includes(taskId)
      ? view.selection.filter((id) => id !== taskId)
      : [...view.selection, taskId];
    view.anchor = taskId;
  } else {
    view.selection = [taskId];
    view.anchor = taskId;
  }
  refreshSelection();
}

/** Repaint only what selection affects, leaving the rest of the DOM alone. */
function refreshSelection() {
  if (!live.ctx) return;
  const selected = new Set(view.selection);

  live.gridBody?.querySelectorAll('.msp-row[data-task-id]').forEach((el) => {
    el.classList.toggle('is-selected', selected.has(el.dataset.taskId));
  });

  const bands = live.chart?.querySelectorAll('.msp-band') || [];
  live.ctx.rows.forEach((row, index) => {
    if (!bands[index]) return;
    bands[index].classList.toggle('is-selected',
      row.kind === 'task' && selected.has(row.task.id));
  });

  if (live.toolbarHost) mount(live.toolbarHost, buildToolbar(live.ctx));
}

/* -- cell editing --------------------------------------------------------- */

function startEdit(ctx, task, column, cellEl) {
  if (cellEl.querySelector('input')) return;
  view.editing = { taskId: task.id, column };

  const initial = {
    name: task.title,
    duration: String(task.duration ?? 1),
    start: ctx.computed.get(task.id) ? fmt(ctx.computed.get(task.id).start) : '',
    finish: ctx.computed.get(task.id) ? fmt(ctx.computed.get(task.id).finish) : '',
    predecessors: formatPredecessors(task.predecessors, ctx.idToRow),
    resources: task.assigneeIds.map((id) => store.get('users', id)?.name).filter(Boolean).join(', '),
  }[column] ?? '';

  const input = h('input.msp-cell__input', { value: initial, spellcheck: 'false' });
  const previous = Array.from(cellEl.childNodes);
  clear(cellEl);
  cellEl.classList.add('is-editing');
  cellEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit, move = null) => {
    if (done) return;
    done = true;
    view.editing = null;
    if (commit) applyEdit(ctx, task, column, input.value, move);
    else {
      cellEl.classList.remove('is-editing');
      clear(cellEl);
      previous.forEach((node) => cellEl.appendChild(node));
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true, 'down'); }
    else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    else if (event.key === 'Tab') { event.preventDefault(); finish(true, event.shiftKey ? 'left' : 'right'); }
  });
  input.addEventListener('blur', () => finish(true));
}

const EDITABLE_ORDER = ['name', 'duration', 'start', 'finish', 'predecessors', 'resources'];

function applyEdit(ctx, task, column, raw, move) {
  const { project, rowToId } = ctx;
  const value = raw.trim();

  switch (column) {
    case 'name':
      if (value !== task.title) api.updateTask(task.id, { title: value || 'New task' });
      break;

    case 'duration': {
      const days = parseDuration(value);
      if (days === null) { toast(`"${value}" is not a duration — try 5d or 2w`, { tone: 'error' }); break; }
      api.setDuration(task.id, days);
      break;
    }

    case 'start': {
      const parsed = parseDateInput(value);
      if (!parsed) { toast(`"${value}" is not a date`, { tone: 'error' }); break; }
      api.setManualStart(task.id, dateKey(parsed));
      break;
    }

    case 'finish': {
      const parsed = parseDateInput(value);
      if (!parsed) { toast(`"${value}" is not a date`, { tone: 'error' }); break; }
      const c = ctx.computed.get(task.id);
      const days = Math.max(task.milestone ? 0 : 1, workingDaysBetween(c.start, parsed));
      api.setDuration(task.id, days);
      break;
    }

    case 'predecessors': {
      const { links, errors } = parsePredecessors(value, rowToId);
      if (errors.length) toast(`Could not read: ${errors.join(', ')}`, { tone: 'error' });
      const result = api.setPredecessors(task.id, links);
      if (result?.rejected) toast('A link was skipped — it would create a loop', { tone: 'error' });
      break;
    }

    case 'resources': {
      const wanted = value.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
      const users = api.usersOf(project.workspaceId);
      const ids = wanted
        .map((name) => users.find((u) => u.name.toLowerCase() === name
          || u.name.toLowerCase().startsWith(name))?.id)
        .filter(Boolean);
      const unknown = wanted.length - ids.length;
      api.updateTask(task.id, { assigneeIds: ids }, { verb: 'changed assignees' });
      if (unknown > 0) toast(`${unknown} name${unknown === 1 ? '' : 's'} did not match a member`, { tone: 'error' });
      break;
    }

    default:
      break;
  }

  if (move) queueMove(ctx, task.id, column, move);
  scheduleRender();
}

/**
 * Enter moves the selection down, Tab moves the editor across — matching how
 * MSP's entry table behaves. Enter deliberately does not reopen an editor on
 * the next row; it just moves the cursor there.
 */
function queueMove(ctx, taskId, column, direction) {
  const taskRows = ctx.rows.filter((r) => r.kind === 'task').map((r) => r.task.id);
  const rowIndex = taskRows.indexOf(taskId);
  const colIndex = EDITABLE_ORDER.indexOf(column);

  if (direction === 'down' && rowIndex < taskRows.length - 1) {
    view.selection = [taskRows[rowIndex + 1]];
    view.anchor = taskRows[rowIndex + 1];
  } else if (direction === 'right' && colIndex < EDITABLE_ORDER.length - 1) {
    view.editing = { taskId, column: EDITABLE_ORDER[colIndex + 1] };
  } else if (direction === 'left' && colIndex > 0) {
    view.editing = { taskId, column: EDITABLE_ORDER[colIndex - 1] };
  }
}

/* -- chart ---------------------------------------------------------------- */

function buildChart(ctx) {
  const { rows, computed, range, scale, width } = ctx;

  const canvas = h('div.msp__canvas', { style: { width: `${width}px` } });
  canvas.appendChild(buildTimescale(ctx));

  const chart = h('div.msp-chart', {
    style: { height: `${rows.length * ROW_H}px`, width: `${width}px` },
  });

  /* non-working shading and gridlines */
  if (scale.px >= 6) {
    for (let i = 0; i < range.days; i += 1) {
      const day = addDays(range.start, i);
      if (!isWorkingDay(day)) {
        chart.appendChild(h('div.msp-nonworking', {
          style: { left: `${i * scale.px}px`, width: `${scale.px}px` },
        }));
      }
    }
  }
  appendGridlines(chart, ctx);

  /* row bands */
  rows.forEach((row, index) => {
    const selected = row.kind === 'task' && view.selection.includes(row.task.id);
    chart.appendChild(h('div.msp-band', {
      class: selected ? 'is-selected' : '',
      style: { top: `${index * ROW_H}px` },
    }));
  });

  /* today line */
  const todayX = xFor(today(), range, scale);
  if (todayX >= 0 && todayX <= width) {
    chart.appendChild(h('div.msp-today', { style: { left: `${todayX}px` } }));
  }

  /* bars */
  rows.forEach((row, index) => {
    const top = index * ROW_H;
    if (row.kind === 'group') {
      if (!row.span) return;
      const left = xFor(row.span.start, range, scale);
      const right = xFor(addDays(row.span.finish, 1), range, scale);
      chart.appendChild(h('div.msp-summarybar', {
        style: { left: `${left}px`, width: `${Math.max(6, right - left)}px`, top: `${top + 7}px` },
        title: `${row.group.name}: ${fmt(row.span.start)} – ${fmt(row.span.finish)}`,
      }));
      return;
    }

    const task = row.task;
    const c = computed.get(task.id);
    if (!c) return;
    const critical = view.showCritical && c.critical && !c.isSummary;
    const left = xFor(c.start, range, scale);
    const right = xFor(addDays(c.finish, 1), range, scale);

    if (c.milestone) {
      chart.appendChild(h('div.msp-milestone', {
        class: critical ? 'is-critical' : '',
        dataset: { taskId: task.id, dragMode: 'move' },
        style: { left: `${left - 5}px`, top: `${top + 7}px` },
        title: `${task.title} — ${fmt(c.start)}`,
      }));
      chart.appendChild(h('div.msp-barlabel', {
        style: { left: `${left + 10}px`, top: `${top}px` },
      }, `${task.title} ${fmt(c.start)}`));
      return;
    }

    if (c.isSummary) {
      chart.appendChild(h('div.msp-summarybar', {
        style: { left: `${left}px`, width: `${Math.max(6, right - left)}px`, top: `${top + 7}px` },
        title: `${task.title}: ${fmt(c.start)} – ${fmt(c.finish)}`,
      }));
      return;
    }

    const percent = taskProgress(task);
    const barWidth = Math.max(3, right - left);
    const bar = h('div.msp-taskbar', {
      class: critical ? 'is-critical' : '',
      dataset: { taskId: task.id, dragMode: 'move' },
      style: { left: `${left}px`, width: `${barWidth}px`, top: `${top + 7}px` },
      title: `${task.title}\n${fmt(c.start)} – ${fmt(c.finish)} (${c.duration} d)${percent ? `\n${percent}% complete` : ''}`,
    },
      percent ? h('div.msp-taskbar__progress', { style: { width: `${percent}%` } }) : null,
      h('div.msp-taskbar__grip.msp-taskbar__grip--s', { dataset: { dragMode: 'start' } }),
      h('div.msp-taskbar__grip.msp-taskbar__grip--e', { dataset: { dragMode: 'end' } }));
    chart.appendChild(bar);

    const resources = task.assigneeIds.map((id) => store.get('users', id)?.name?.split(' ')[0])
      .filter(Boolean).join(', ');
    if (resources) {
      chart.appendChild(h('div.msp-barlabel', {
        style: { left: `${left + barWidth + 5}px`, top: `${top}px` },
      }, resources));
    }
  });

  chart.appendChild(buildLinks(ctx));
  canvas.appendChild(chart);

  const el = h('div.msp__right', canvas);
  return { el, canvas, chart };
}

function appendGridlines(chart, ctx) {
  const { range, scale } = ctx;
  if (scale.minor === 'day' && scale.px >= 6) {
    for (let i = 0; i <= range.days; i += 1) {
      const day = addDays(range.start, i);
      chart.appendChild(h('div.msp-vline', {
        class: day.getDay() === 1 ? 'msp-vline--major' : '',
        style: { left: `${i * scale.px}px` },
      }));
    }
    return;
  }
  let cursor = startOfMonth(range.start);
  while (cursor <= range.end) {
    chart.appendChild(h('div.msp-vline.msp-vline--major', {
      style: { left: `${xFor(cursor, range, scale)}px` },
    }));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
}

function buildTimescale(ctx) {
  const { range, scale, width } = ctx;
  const major = h('div.msp-scale__tier');
  const minor = h('div.msp-scale__tier');

  /* major tier */
  let cursor = new Date(range.start);
  while (cursor <= range.end) {
    let next;
    let label;
    if (scale.major === 'week') {
      const ws = startOfWeek(cursor);
      next = addDays(ws, 7);
      label = `${monthNames[ws.getMonth()].slice(0, 3)} ${ws.getDate()}`;
    } else if (scale.major === 'month') {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = `${monthNames[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
    } else if (scale.major === 'quarter') {
      const q = Math.floor(cursor.getMonth() / 3);
      next = new Date(cursor.getFullYear(), q * 3 + 3, 1);
      label = `Q${q + 1} ${cursor.getFullYear()}`;
    } else {
      next = new Date(cursor.getFullYear() + 1, 0, 1);
      label = String(cursor.getFullYear());
    }
    const left = Math.max(0, xFor(cursor, range, scale));
    const right = Math.min(width, xFor(next, range, scale));
    major.appendChild(h('div.msp-scale__cell.msp-scale__cell--major', {
      style: { left: `${left}px`, width: `${Math.max(0, right - left)}px` },
    }, label));
    cursor = next;
  }

  /* minor tier */
  if (scale.minor === 'day') {
    for (let i = 0; i < range.days; i += 1) {
      const day = addDays(range.start, i);
      minor.appendChild(h('div.msp-scale__cell', {
        class: isSameDay(day, today()) ? 'is-today' : '',
        style: { left: `${i * scale.px}px`, width: `${scale.px}px` },
      }, scale.px >= 22 ? dayNamesShort[day.getDay()][0] + day.getDate() : String(day.getDate())));
    }
  } else if (scale.minor === 'week') {
    let week = startOfWeek(range.start);
    while (week <= range.end) {
      minor.appendChild(h('div.msp-scale__cell', {
        style: { left: `${xFor(week, range, scale)}px`, width: `${7 * scale.px}px` },
      }, String(week.getDate())));
      week = addDays(week, 7);
    }
  } else if (scale.minor === 'month') {
    let month = startOfMonth(range.start);
    while (month <= range.end) {
      const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      minor.appendChild(h('div.msp-scale__cell', {
        style: {
          left: `${xFor(month, range, scale)}px`,
          width: `${diffDays(month, next) * scale.px}px`,
        },
      }, monthNames[month.getMonth()].slice(0, 3)));
      month = next;
    }
  } else {
    let q = new Date(range.start.getFullYear(), Math.floor(range.start.getMonth() / 3) * 3, 1);
    while (q <= range.end) {
      const next = new Date(q.getFullYear(), q.getMonth() + 3, 1);
      minor.appendChild(h('div.msp-scale__cell', {
        style: { left: `${xFor(q, range, scale)}px`, width: `${diffDays(q, next) * scale.px}px` },
      }, `Q${Math.floor(q.getMonth() / 3) + 1}`));
      q = next;
    }
  }

  return h('div.msp-scale', { style: { width: `${width}px` } }, major, minor);
}

/* -- link lines ----------------------------------------------------------- */

function buildLinks(ctx) {
  const { rows, computed, range, scale, width } = ctx;
  const svg = h('svg.msp-links', {
    style: { width: `${width}px`, height: `${rows.length * ROW_H}px` },
  });

  const rowOf = new Map();
  rows.forEach((row, index) => { if (row.kind === 'task') rowOf.set(row.task.id, index); });

  for (const row of rows) {
    if (row.kind !== 'task') continue;
    const task = row.task;
    const toIndex = rowOf.get(task.id);
    const tc = computed.get(task.id);
    if (toIndex === undefined || !tc) continue;

    for (const link of task.predecessors || []) {
      const fromIndex = rowOf.get(link.id);
      const pc = computed.get(link.id);
      if (fromIndex === undefined || !pc) continue;

      const critical = view.showCritical && tc.critical && pc.critical;
      const y1 = fromIndex * ROW_H + 13;
      const y2 = toIndex * ROW_H + 13;

      const predStart = xFor(pc.start, range, scale);
      const predEnd = xFor(addDays(pc.finish, 1), range, scale);
      const succStart = xFor(tc.start, range, scale);
      const succEnd = xFor(addDays(tc.finish, 1), range, scale);

      let d;
      let arrow;
      switch (link.type) {
        case 'SS':
          d = routeToLeft(predStart, y1, succStart, y2, true);
          arrow = { x: succStart, y: y2, dir: 'right' };
          break;
        case 'FF':
          d = routeToRight(predEnd, y1, succEnd, y2);
          arrow = { x: succEnd, y: y2, dir: 'left' };
          break;
        case 'SF':
          d = routeToRight(predStart, y1, succEnd, y2);
          arrow = { x: succEnd, y: y2, dir: 'left' };
          break;
        case 'FS':
        default:
          d = routeFS(predEnd, y1, succStart, y2);
          arrow = { x: succStart, y: y2, dir: 'right' };
          break;
      }

      svg.appendChild(h('path', { d, class: critical ? 'is-critical' : '' }));
      svg.appendChild(h('polygon', {
        class: critical ? 'is-critical' : '',
        points: arrow.dir === 'right'
          ? `${arrow.x},${arrow.y} ${arrow.x - 5},${arrow.y - 3.5} ${arrow.x - 5},${arrow.y + 3.5}`
          : `${arrow.x},${arrow.y} ${arrow.x + 5},${arrow.y - 3.5} ${arrow.x + 5},${arrow.y + 3.5}`,
      }));
    }
  }

  return svg;
}

/** Finish-to-start: out of the predecessor's right edge, down, into the left. */
function routeFS(x1, y1, x2, y2) {
  const stub = 6;
  if (x2 >= x1 + stub * 2) {
    const midX = x2 - stub;
    return `M${x1},${y1} H${midX} V${y2} H${x2 - 5}`;
  }
  const drop = y2 > y1 ? ROW_H / 2 : -ROW_H / 2;
  return `M${x1},${y1} H${x1 + stub} V${y1 + drop} H${x2 - stub * 2} V${y2} H${x2 - 5}`;
}

function routeToLeft(x1, y1, x2, y2) {
  const stub = 8;
  const outer = Math.min(x1, x2) - stub;
  return `M${x1},${y1} H${outer} V${y2} H${x2 - 5}`;
}

function routeToRight(x1, y1, x2, y2) {
  const stub = 8;
  const outer = Math.max(x1, x2) + stub;
  return `M${x1},${y1} H${outer} V${y2} H${x2 + 5}`;
}

/* -- interaction ---------------------------------------------------------- */

function wireScrollSync(left, right) {
  const sync = throttleRaf(() => {
    left.body.style.transform = `translateY(${-right.el.scrollTop}px)`;
    view.scrollTop = right.el.scrollTop;
    view.scrollLeft = right.el.scrollLeft;
  });
  right.el.addEventListener('scroll', sync, { passive: true });

  left.scroller.addEventListener('wheel', (event) => {
    right.el.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  requestAnimationFrame(() => {
    if (view.scrollLeft === null) {
      const chartWidth = right.el.clientWidth;
      right.el.scrollLeft = Math.max(0,
        right.el.querySelector('.msp-today')
          ? parseFloat(right.el.querySelector('.msp-today').style.left) - chartWidth * 0.3
          : 0);
    } else {
      right.el.scrollLeft = view.scrollLeft;
    }
    right.el.scrollTop = view.scrollTop;
    left.body.style.transform = `translateY(${-right.el.scrollTop}px)`;
  });
}

function wireSplitter(splitter, grid) {
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = view.split;
    splitter.setPointerCapture(event.pointerId);

    const move = (e) => {
      view.split = Math.max(220, Math.min(1000, startWidth + (e.clientX - startX)));
      grid.style.setProperty('--msp-split', `${view.split}px`);
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });
}

function wireBarDragging(right, ctx) {
  const { range, scale, project } = ctx;
  let drag = null;
  let tip = null;

  const showTip = (event, html) => {
    if (!tip) { tip = h('div.msp-tip'); document.body.appendChild(tip); }
    tip.innerHTML = html;
    tip.style.left = `${event.clientX + 14}px`;
    tip.style.top = `${event.clientY + 16}px`;
  };
  const hideTip = () => { tip?.remove(); tip = null; };

  right.canvas.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-mode]');
    if (!handle || event.button !== 0) return;
    const barEl = handle.closest('[data-task-id]') || handle;
    const task = store.get('tasks', barEl.dataset.taskId);
    if (!task) return;

    drag = {
      task,
      el: barEl,
      mode: handle.dataset.dragMode,
      startX: event.clientX,
      originLeft: parseFloat(barEl.style.left) || 0,
      originWidth: parseFloat(barEl.style.width) || 0,
      days: 0,
      active: false,
      pointerId: event.pointerId,
    };
    barEl.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  right.canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < 4) return;
      drag.active = true;
      suspendRender();
      drag.el.classList.add('is-dragging');
    }

    const days = Math.round(dx / scale.px);
    drag.days = days;
    const c = ctx.computed.get(drag.task.id);

    if (drag.mode === 'move') {
      drag.el.style.left = `${drag.originLeft + days * scale.px}px`;
      const newStart = addWorkingDays(c.start, days);
      showTip(event, `Task: ${escapeHtml(drag.task.title)}<br>Start: ${fmt(newStart)}<br>Finish: ${fmt(addWorkingDays(newStart, Math.max(0, c.duration - 1)))}`);
    } else if (drag.mode === 'end') {
      const newWidth = Math.max(scale.px, drag.originWidth + days * scale.px);
      drag.el.style.width = `${newWidth}px`;
      const duration = Math.max(1, c.duration + days);
      showTip(event, `Task: ${escapeHtml(drag.task.title)}<br>Duration: ${duration} d<br>Finish: ${fmt(addWorkingDays(c.start, duration - 1))}`);
    } else {
      const shift = Math.min(days, c.duration - 1);
      drag.el.style.left = `${drag.originLeft + shift * scale.px}px`;
      drag.el.style.width = `${Math.max(scale.px, drag.originWidth - shift * scale.px)}px`;
      drag.days = shift;
      showTip(event, `Task: ${escapeHtml(drag.task.title)}<br>Start: ${fmt(addWorkingDays(c.start, shift))}<br>Duration: ${c.duration - shift} d`);
    }
  });

  const finish = (event) => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const current = drag;
    drag = null;
    hideTip();

    if (!current.active) {
      view.selection = [current.task.id];
      view.anchor = current.task.id;
      refreshSelection();
      return;
    }

    current.el.classList.remove('is-dragging');
    const c = ctx.computed.get(current.task.id);

    if (current.days !== 0) {
      if (current.mode === 'move') {
        api.setManualStart(current.task.id, dateKey(addWorkingDays(c.start, current.days)));
      } else if (current.mode === 'end') {
        api.setDuration(current.task.id, Math.max(1, c.duration + current.days));
      } else {
        api.setManualStart(current.task.id, dateKey(addWorkingDays(c.start, current.days)));
        api.setDuration(current.task.id, Math.max(1, c.duration - current.days));
      }
    }
    resumeRender();
  };

  right.canvas.addEventListener('pointerup', finish);
  right.canvas.addEventListener('pointercancel', finish);
}

function openRowMenu(ctx, task, event) {
  const anchorRect = {
    left: event.clientX, right: event.clientX,
    top: event.clientY, bottom: event.clientY, width: 0, height: 0,
  };
  showMenu(anchorRect, {
    items: [
      { id: 'info', label: 'Task Information…', icon: 'doc', onSelect: () => openTaskInformation(ctx, task) },
      { id: 'open', label: 'Open task record', icon: 'external', onSelect: () => openTaskPanel(task.id) },
      { separator: true },
      {
        id: 'insert', label: 'Insert task below', icon: 'plus',
        onSelect: () => {
          const created = api.insertTaskAfter(task.projectId, task.id, { title: '' });
          api.rescheduleProject(task.projectId);
          view.selection = [created.id];
          view.editing = { taskId: created.id, column: 'name' };
          scheduleRender();
        },
      },
      {
        id: 'milestone',
        label: task.milestone ? 'Convert to task' : 'Convert to milestone',
        icon: 'milestone',
        onSelect: () => api.setDuration(task.id, task.milestone ? 1 : 0),
      },
      {
        id: 'unpin', label: 'Clear pinned start', icon: 'x',
        disabled: !task.manualStart,
        onSelect: () => api.setManualStart(task.id, null),
      },
      { separator: true },
      {
        id: 'delete', label: 'Delete task', icon: 'trash', danger: true,
        onSelect: () => {
          api.deleteTask(task.id);
          api.rescheduleProject(task.projectId);
          view.selection = [];
          toast('Task deleted', { action: 'Undo', onAction: () => store.undo() });
        },
      },
    ],
  });
}

/* -- Task Information dialog ---------------------------------------------- */

function openTaskInformation(ctx, task) {
  if (!task) return;
  const { idToRow, rowToId, computed } = ctx;
  const c = computed.get(task.id);
  let links = [...(task.predecessors || [])];

  const nameInput = h('input.input', { value: task.title });
  const durationInput = h('input.input', { value: String(task.duration ?? 1) });
  const percentInput = h('input.input', { type: 'number', min: '0', max: '100', value: String(taskProgress(task)) });
  const startInput = h('input.input', { value: c ? fmt(c.start) : '', placeholder: 'dd/mm/yy' });

  const generalPane = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div.field', h('label.field__label', 'Name'), nameInput),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' } },
      h('div.field', h('label.field__label', 'Duration'), durationInput),
      h('div.field', h('label.field__label', 'Percent complete'), percentInput),
      h('div.field', h('label.field__label', 'Start (pins the task)'), startInput)),
    h('p.field__hint', c
      ? `Currently scheduled ${fmt(c.start)} – ${fmt(c.finish)}. ${c.critical ? 'On the critical path.' : `Total slack ${c.slack} d.`}`
      : ''));

  const predBody = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
  const renderPreds = () => {
    clear(predBody);
    predBody.appendChild(h('div.ti-grid',
      h('span.ti-grid__head', 'Task'),
      h('span.ti-grid__head', 'Type'),
      h('span.ti-grid__head', 'Lag')));

    links.forEach((link, index) => {
      const pred = store.get('tasks', link.id);
      const select = h('select.select', {
        onChange: (e) => { links[index] = { ...link, type: e.target.value }; },
      }, ...LINK_TYPES.map((type) => h('option', {
        value: type, selected: type === link.type,
      }, `${type} — ${{ FS: 'Finish-to-Start', SS: 'Start-to-Start', FF: 'Finish-to-Finish', SF: 'Start-to-Finish' }[type]}`)));

      const lag = h('input.input', {
        type: 'number', value: String(link.lag || 0),
        onChange: (e) => { links[index] = { ...link, lag: Number(e.target.value) || 0 }; },
      });

      predBody.appendChild(h('div.ti-grid',
        h('span', { style: { fontSize: '12px' } },
          `${idToRow.get(link.id) || '?'}  ${pred?.title || 'Unknown task'}`),
        select,
        h('div', { style: { display: 'flex', gap: '4px' } }, lag,
          h('button.icon-btn', {
            type: 'button', 'aria-label': 'Remove',
            onClick: () => { links.splice(index, 1); renderPreds(); },
          }, icon('x', { size: 13 })))));
    });

    const candidates = api.tasksOf(task.projectId)
      .filter((t) => t.id !== task.id && !links.some((l) => l.id === t.id));
    predBody.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      style: { alignSelf: 'flex-start', marginTop: '6px' },
      disabled: !candidates.length,
      onClick: (event) => showMenu(event.currentTarget, {
        search: true, width: 300, searchPlaceholder: 'Add a predecessor…',
        items: candidates.map((t) => ({
          id: t.id,
          label: t.title,
          hint: String(idToRow.get(t.id) || ''),
          onSelect: () => { links.push({ id: t.id, type: 'FS', lag: 0 }); renderPreds(); },
        })),
      }),
    }, icon('plus', { size: 13 }), 'Add predecessor'));
  };
  renderPreds();

  const panes = { General: generalPane, Predecessors: predBody };
  const paneHost = h('div');
  const tabs = h('div.ti-tabs');
  let active = 'General';

  const paint = () => {
    clear(tabs);
    Object.keys(panes).forEach((name) => {
      tabs.appendChild(h('button.ti-tab', {
        type: 'button',
        class: name === active ? 'is-active' : '',
        onClick: () => { active = name; paint(); },
      }, name));
    });
    mount(paneHost, panes[active]);
  };
  paint();

  showModal({
    title: 'Task Information',
    subtitle: `Row ${idToRow.get(task.id)} · ${task.title}`,
    wide: true,
    body: h('div', tabs, paneHost),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      {
        label: 'OK',
        variant: 'primary',
        onClick: () => {
          store.batch(() => {
            api.updateTask(task.id, {
              title: nameInput.value.trim() || task.title,
              progress: Math.max(0, Math.min(100, Number(percentInput.value) || 0)),
            });
            const days = parseDuration(durationInput.value);
            if (days !== null) api.setDuration(task.id, days);
            const pinned = parseDateInput(startInput.value);
            if (pinned) api.setManualStart(task.id, dateKey(pinned));
            api.setPredecessors(task.id, links);
          });
          api.rescheduleProject(task.projectId);
          scheduleRender();
        },
      },
    ],
  });
}

/* -- helpers -------------------------------------------------------------- */

/** MSP-style date column: "Mon 04/08/26". */
export function fmt(date) {
  const d = toDate(date);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dayNamesShort[d.getDay()]} ${dd}/${mm}/${yy}`;
}

/** Accepts "04/08/26", "4/8/2026", "2026-08-04" and "Mon 04/08/26". */
function parseDateInput(text) {
  const clean = String(text).replace(/^[A-Za-z]{3}\s+/, '').trim();
  if (!clean) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(clean);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(clean);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export const ganttView = view;
export { ROW_H as GANTT_ROW_H, xFor as ganttX };
