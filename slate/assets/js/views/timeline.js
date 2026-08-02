/* ==========================================================================
   Timeline (Gantt).

   Layout: a fixed left column of rows, and a horizontally scrolling right
   pane holding the date header, grid, bars and dependency arrows. The two
   panes share one vertical scroll — the right pane is the scroller and the
   left rows are translated to match.
   ========================================================================== */

import { h, mount, clear, throttleRaf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { statusOf, isDoneStatus, taskProgress } from '../data/schema.js';
import { state, isGroupCollapsed, toggleGroupCollapsed } from '../app/state.js';
import { suspendRender, resumeRender } from '../app/shell.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { showMenu, toast } from '../ui/overlay.js';
import { avatarStack, emptyState, openDatePicker } from '../ui/bits.js';
import {
  toDate, key as dateKey, addDays, diffDays, today, todayKey, startOfWeek,
  startOfMonth, isWeekend, isSameDay, formatDate, formatRange, monthNames, DAY_MS,
} from '../lib/date.js';

const ROW_H = 36;
const HEAD_H = 52;

const ZOOM = {
  day:     { px: 44,  minor: 'day',   major: 'week',    pad: 4 },
  week:    { px: 17,  minor: 'day',   major: 'month',   pad: 10 },
  month:   { px: 5.6, minor: 'week',  major: 'month',   pad: 24 },
  quarter: { px: 2.2, minor: 'month', major: 'quarter', pad: 60 },
};

let scrolledToToday = false;

export function renderTimeline(host, project) {
  if (!project) return;

  const zoom = ZOOM[state.zoom] || ZOOM.week;
  const allTasks = api.filterTasks(api.tasksOf(project.id), state.filters);

  if (!allTasks.length) {
    mount(host, emptyState({
      icon: 'timeline',
      title: 'Nothing to plot yet',
      text: 'Tasks with a start or due date appear on the timeline. Add dates to see them here.',
    }));
    return;
  }

  const rows = buildRows(project, allTasks);
  const range = computeRange(allTasks, zoom);
  const width = Math.max(600, Math.ceil(range.days * zoom.px));

  /* -- left pane -- */
  const leftRows = h('div.gantt__rows');
  rows.forEach((row) => leftRows.appendChild(leftRow(row, project)));
  const leftBody = h('div.gantt__left-body', leftRows);
  const left = h('div.gantt__left',
    h('div.gantt__left-head',
      h('span.u-grow', 'Task'),
      h('span', { style: { fontSize: '10px' } }, `${rows.filter((r) => r.kind === 'task').length}`)),
    leftBody);

  /* -- right pane -- */
  const canvas = h('div.gantt__canvas', { style: { width: `${width}px` } });
  canvas.appendChild(buildHeader(range, zoom, width));
  canvas.appendChild(buildGrid(range, zoom, width, rows.length));

  const rightRows = h('div.gantt__rows', { style: { width: `${width}px` } });
  rows.forEach((row) => rightRows.appendChild(rightRow(row, range, zoom, project)));
  canvas.appendChild(rightRows);
  canvas.appendChild(buildDependencies(rows, range, zoom, width));

  const right = h('div.gantt__right', canvas);

  const gantt = h('div.gantt', left, right);
  mount(host, gantt);

  /* -- scroll sync -- */
  const sync = throttleRaf(() => {
    leftRows.style.transform = `translateY(${-right.scrollTop}px)`;
  });
  right.addEventListener('scroll', sync, { passive: true });

  // Keep the left column's own wheel gestures driving the shared scroller.
  leftBody.addEventListener('wheel', (event) => {
    right.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  installBarDragging(right, canvas, range, zoom, project);

  if (!scrolledToToday) {
    const offset = diffDays(range.start, today()) * zoom.px;
    right.scrollLeft = Math.max(0, offset - right.clientWidth * 0.32);
    scrolledToToday = true;
  }
}

/* -- rows ----------------------------------------------------------------- */

function buildRows(project, tasks) {
  const groups = api.groupsOf(project.id);
  const rows = [];

  const push = (group, groupTasks) => {
    if (!groupTasks.length) return;
    const collapsed = isGroupCollapsed(group.id);
    const dated = groupTasks.filter((t) => t.startDate || t.dueDate);
    rows.push({
      kind: 'group',
      id: group.id,
      group,
      collapsed,
      count: groupTasks.length,
      start: dated.length ? dated.reduce((min, t) => min && min < (t.startDate || t.dueDate) ? min : (t.startDate || t.dueDate), null) : null,
      end: dated.length ? dated.reduce((max, t) => max && max > (t.dueDate || t.startDate) ? max : (t.dueDate || t.startDate), null) : null,
    });
    if (collapsed) return;
    api.sortTasks(groupTasks, state.sort.key === 'manual' ? 'startDate' : state.sort.key, state.sort.direction)
      .forEach((task) => rows.push({ kind: 'task', id: task.id, task }));
  };

  groups.forEach((group) => push(group, tasks.filter((t) => t.groupId === group.id)));

  const loose = tasks.filter((task) => !groups.some((g) => g.id === task.groupId));
  if (loose.length) {
    push({ id: '__none', name: 'No list', color: 'var(--text-4)' }, loose);
  }
  return rows;
}

function leftRow(row, project) {
  if (row.kind === 'group') {
    return h('div.grow-l.is-group', {
      class: row.collapsed ? 'is-collapsed' : '',
      dataset: { rowId: row.id },
      onClick: () => toggleGroupCollapsed(row.group.id),
    },
      icon('chevronDown', { size: 13, cls: 'grow-l__caret' }),
      h('span.nav-item__swatch', { style: { '--swatch': row.group.color, margin: '0 2px' } }),
      h('span.grow-l__title', row.group.name),
      h('span.col__count', row.count));
  }

  const task = row.task;
  return h('div.grow-l', {
    class: isDoneStatus(task.status) ? 'is-done' : '',
    dataset: { rowId: row.id, taskId: task.id },
    onClick: () => openTaskPanel(task.id),
  },
    h('span', { style: { width: '13px' } }),
    h('span.dot', { style: { background: statusOf(task.status).color, flex: 'none' } }),
    task.milestone ? icon('milestone', { size: 12, cls: 'u-muted' }) : null,
    h('span.grow-l__title', task.title),
    task.assigneeIds.length ? avatarStack(task.assigneeIds, { size: 'xs', max: 2 }) : null);
}

/* -- header & grid -------------------------------------------------------- */

function computeRange(tasks, zoom) {
  const dates = [];
  for (const task of tasks) {
    if (task.startDate) dates.push(task.startDate);
    if (task.dueDate) dates.push(task.dueDate);
  }
  dates.push(todayKey());

  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));

  const start = addDays(toDate(min), -zoom.pad);
  const end = addDays(toDate(max), zoom.pad);
  return { start, end, days: Math.max(1, diffDays(start, end) + 1) };
}

const xFor = (date, range, zoom) => diffDays(range.start, date) * zoom.px;

function buildHeader(range, zoom, width) {
  const major = h('div.gantt__head-major');
  const minor = h('div.gantt__head-minor');

  // Major band
  let cursor = new Date(range.start);
  while (cursor <= range.end) {
    let next;
    let label;
    if (zoom.major === 'week') {
      const weekStart = startOfWeek(cursor);
      next = addDays(weekStart, 7);
      label = `${monthNames[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()}`;
    } else if (zoom.major === 'month') {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = `${monthNames[cursor.getMonth()]}${cursor.getMonth() === 0 || cursor.getTime() === range.start.getTime() ? ` ${cursor.getFullYear()}` : ''}`;
    } else {
      const quarter = Math.floor(cursor.getMonth() / 3);
      next = new Date(cursor.getFullYear(), quarter * 3 + 3, 1);
      label = `Q${quarter + 1} ${cursor.getFullYear()}`;
    }

    const left = Math.max(0, xFor(cursor, range, zoom));
    const right = Math.min(width, xFor(next, range, zoom));
    major.appendChild(h('div.gantt__major', {
      style: { left: `${left}px`, width: `${Math.max(0, right - left)}px` },
    }, label));
    cursor = next;
  }

  // Minor band
  if (zoom.minor === 'day') {
    for (let i = 0; i < range.days; i += 1) {
      const day = addDays(range.start, i);
      const isToday = isSameDay(day, today());
      minor.appendChild(h('div.gantt__minor', {
        class: [isWeekend(day) ? 'is-weekend' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' '),
        style: { left: `${i * zoom.px}px`, width: `${zoom.px}px` },
      }, zoom.px >= 30 ? `${'SMTWTFS'[day.getDay()]} ${day.getDate()}` : String(day.getDate())));
    }
  } else if (zoom.minor === 'week') {
    let week = startOfWeek(range.start);
    while (week <= range.end) {
      const left = xFor(week, range, zoom);
      minor.appendChild(h('div.gantt__minor', {
        style: { left: `${left}px`, width: `${7 * zoom.px}px` },
      }, String(week.getDate())));
      week = addDays(week, 7);
    }
  } else {
    let month = startOfMonth(range.start);
    while (month <= range.end) {
      const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      minor.appendChild(h('div.gantt__minor', {
        style: {
          left: `${xFor(month, range, zoom)}px`,
          width: `${(diffDays(month, next)) * zoom.px}px`,
        },
      }, monthNames[month.getMonth()].slice(0, 1)));
      month = next;
    }
  }

  return h('div.gantt__head', { style: { width: `${width}px` } }, major, minor);
}

function buildGrid(range, zoom, width, rowCount) {
  const grid = h('div.gantt__grid', {
    style: { width: `${width}px`, height: `${rowCount * ROW_H}px` },
  });

  if (zoom.minor === 'day' && zoom.px >= 12) {
    for (let i = 0; i < range.days; i += 1) {
      const day = addDays(range.start, i);
      if (isWeekend(day) && state.prefs.showWeekends) {
        grid.appendChild(h('div.gantt__weekend', {
          style: { left: `${i * zoom.px}px`, width: `${zoom.px}px` },
        }));
      }
      grid.appendChild(h('div.gantt__gridline', {
        class: day.getDay() === 1 ? 'gantt__gridline--major' : '',
        style: { left: `${i * zoom.px}px` },
      }));
    }
  } else {
    let month = startOfMonth(range.start);
    while (month <= range.end) {
      grid.appendChild(h('div.gantt__gridline.gantt__gridline--major', {
        style: { left: `${xFor(month, range, zoom)}px` },
      }));
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    }
  }

  grid.appendChild(h('div.gantt__today', {
    style: { left: `${xFor(today(), range, zoom) + zoom.px / 2}px` },
    title: `Today — ${formatDate(today(), { withYear: true })}`,
  }));

  return grid;
}

/* -- bars ----------------------------------------------------------------- */

function rightRow(row, range, zoom, project) {
  const el = h('div.grow-r', { dataset: { rowId: row.id } });

  if (row.kind === 'group') {
    if (row.start && row.end) {
      const left = xFor(toDate(row.start), range, zoom);
      const right = xFor(addDays(toDate(row.end), 1), range, zoom);
      el.appendChild(h('div.gsummary', {
        style: { left: `${left}px`, width: `${Math.max(6, right - left)}px` },
        title: `${row.group.name}: ${formatRange(row.start, row.end)}`,
      }));
    }
    return el;
  }

  const task = row.task;
  const start = task.startDate || task.dueDate;
  const end = task.dueDate || task.startDate;

  if (!start) {
    el.appendChild(h('button.gbar__outside', {
      type: 'button',
      style: { left: `${Math.max(0, xFor(today(), range, zoom))}px`, pointerEvents: 'auto', cursor: 'pointer' },
      onClick: (event) => {
        event.stopPropagation();
        openDatePicker(event.currentTarget, {
          value: null,
          title: 'Set a due date',
          onPick: (picked) => api.updateTask(task.id, { dueDate: picked, startDate: picked }),
        });
      },
    }, icon('plus', { size: 11 }), 'Schedule'));
    return el;
  }

  const color = statusOf(task.status).color;
  const done = isDoneStatus(task.status);

  if (task.milestone) {
    const x = xFor(toDate(end), range, zoom) + zoom.px / 2;
    el.appendChild(h('div.gmilestone', {
      dataset: { taskId: task.id, dragMode: 'move' },
      style: { left: `${x}px`, '--bar-color': color },
      title: `${task.title} — ${formatDate(end, { withYear: true })}`,
    }));
    el.appendChild(h('div.gbar__outside', {
      style: { left: `${x + 14}px` },
    }, h('span', { style: { fontWeight: '600' } }, task.title)));
    return el;
  }

  const left = xFor(toDate(start), range, zoom);
  const right = xFor(addDays(toDate(end), 1), range, zoom);
  const barWidth = Math.max(zoom.px * 0.7, right - left);
  const percent = taskProgress(task);

  const bar = h('div.gbar', {
    dataset: { taskId: task.id, dragMode: 'move' },
    class: done ? 'is-done' : '',
    style: { left: `${left}px`, width: `${barWidth}px`, '--bar-color': color },
    title: `${task.title}\n${formatRange(task.startDate, task.dueDate)}`,
  },
    percent ? h('div.gbar__fill', { style: { width: `${percent}%` } }) : null,
    barWidth > 46 ? h('span.gbar__label', task.title) : null,
    h('div.gbar__handle.gbar__handle--s', { dataset: { dragMode: 'start' } }),
    h('div.gbar__handle.gbar__handle--e', { dataset: { dragMode: 'end' } }));

  el.appendChild(bar);

  if (barWidth <= 46) {
    el.appendChild(h('div.gbar__outside', {
      style: { left: `${left + barWidth + 8}px` },
    }, task.title));
  }

  return el;
}

/* -- dependency arrows ---------------------------------------------------- */

function buildDependencies(rows, range, zoom, width) {
  const svg = h('svg.gdeps', {
    style: { width: `${width}px`, height: `${rows.length * ROW_H}px`, top: `${HEAD_H}px` },
  });

  const rowIndex = new Map();
  rows.forEach((row, index) => { if (row.kind === 'task') rowIndex.set(row.id, index); });

  for (const row of rows) {
    if (row.kind !== 'task') continue;
    const task = row.task;
    if (!task.dependsOn?.length) continue;

    const toIndex = rowIndex.get(task.id);
    const taskStart = task.startDate || task.dueDate;
    if (toIndex === undefined || !taskStart) continue;

    for (const depId of task.dependsOn) {
      const fromIndex = rowIndex.get(depId);
      if (fromIndex === undefined) continue;
      const dep = store.get('tasks', depId);
      const depEnd = dep?.dueDate || dep?.startDate;
      if (!depEnd) continue;

      const sx = xFor(addDays(toDate(depEnd), 1), range, zoom);
      const sy = fromIndex * ROW_H + ROW_H / 2;
      const ex = xFor(toDate(taskStart), range, zoom);
      const ey = toIndex * ROW_H + ROW_H / 2;
      const late = diffDays(depEnd, taskStart) < 0;

      svg.appendChild(h('path', {
        d: elbow(sx, sy, ex, ey),
        class: late ? 'is-late' : '',
      }));
      svg.appendChild(h('path', {
        d: `M${ex - 6},${ey - 3.5} L${ex},${ey} L${ex - 6},${ey + 3.5} Z`,
        class: late ? 'gdep-head is-late' : 'gdep-head',
      }));
    }
  }

  return svg;
}

function elbow(sx, sy, ex, ey) {
  const gap = 9;
  if (ex >= sx + gap * 2) {
    const midX = sx + gap;
    return `M${sx},${sy} H${midX} V${ey} H${ex - 6}`;
  }
  // Predecessor finishes after the successor starts — route around the row.
  const detour = sy + (ey > sy ? ROW_H / 2 : -ROW_H / 2);
  return `M${sx},${sy} H${sx + gap} V${detour} H${ex - gap - 6} V${ey} H${ex - 6}`;
}

/* -- dragging ------------------------------------------------------------- */

function installBarDragging(scroller, canvas, range, zoom, project) {
  let drag = null;
  let tip = null;

  const showTip = (event, text) => {
    if (!tip) {
      tip = h('div.gantt-tip');
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = `${event.clientX + 14}px`;
    tip.style.top = `${event.clientY - 34}px`;
  };
  const hideTip = () => { tip?.remove(); tip = null; };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-drag-mode]');
    if (!handle) return;

    const bar = handle.closest('.gbar') || handle.closest('.gmilestone') || handle;
    const taskId = bar.dataset.taskId;
    const task = store.get('tasks', taskId);
    if (!task) return;

    drag = {
      taskId,
      task,
      bar,
      mode: handle.dataset.dragMode,
      startX: event.clientX,
      originLeft: parseFloat(bar.style.left) || 0,
      originWidth: parseFloat(bar.style.width) || 0,
      deltaDays: 0,
      active: false,
      pointerId: event.pointerId,
    };
    bar.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < 4) return;
      drag.active = true;
      suspendRender();
      drag.bar.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
    }

    const days = Math.round(dx / zoom.px);
    drag.deltaDays = days;

    const task = drag.task;
    const start = task.startDate || task.dueDate;
    const end = task.dueDate || task.startDate;

    if (drag.mode === 'move') {
      drag.bar.style.left = `${drag.originLeft + days * zoom.px}px`;
      showTip(event, task.milestone
        ? formatDate(addDays(toDate(end), days), { withYear: true })
        : `${formatDate(addDays(toDate(start), days))} → ${formatDate(addDays(toDate(end), days), { withYear: true })}`);
    } else if (drag.mode === 'start') {
      const maxShift = diffDays(start, end);
      const shift = Math.min(days, maxShift);
      drag.bar.style.left = `${drag.originLeft + shift * zoom.px}px`;
      drag.bar.style.width = `${Math.max(zoom.px * 0.7, drag.originWidth - shift * zoom.px)}px`;
      drag.deltaDays = shift;
      showTip(event, `Starts ${formatDate(addDays(toDate(start), shift), { withYear: true })}`);
    } else {
      const minShift = -diffDays(start, end);
      const shift = Math.max(days, minShift);
      drag.bar.style.width = `${Math.max(zoom.px * 0.7, drag.originWidth + shift * zoom.px)}px`;
      drag.deltaDays = shift;
      showTip(event, `Due ${formatDate(addDays(toDate(end), shift), { withYear: true })}`);
    }
  });

  const finish = (event) => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const current = drag;
    drag = null;
    hideTip();

    if (!current.active) {
      openTaskPanel(current.taskId);
      return;
    }

    current.bar.classList.remove('is-dragging');
    document.body.style.userSelect = '';

    const { task, deltaDays, mode } = current;
    if (deltaDays !== 0) {
      const start = task.startDate || task.dueDate;
      const end = task.dueDate || task.startDate;

      if (mode === 'move') {
        api.updateTask(task.id, {
          startDate: task.startDate ? dateKey(addDays(toDate(start), deltaDays)) : null,
          dueDate: task.dueDate ? dateKey(addDays(toDate(end), deltaDays)) : null,
        }, { verb: 'rescheduled' });
      } else if (mode === 'start') {
        api.updateTask(task.id, {
          startDate: dateKey(addDays(toDate(start), deltaDays)),
        }, { verb: 'changed the start date' });
      } else {
        api.updateTask(task.id, {
          dueDate: dateKey(addDays(toDate(end), deltaDays)),
        }, { verb: 'changed the due date' });
      }
    }

    resumeRender();
  };

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  // Right-click a bar for the quick actions people expect on a Gantt.
  canvas.addEventListener('contextmenu', (event) => {
    const bar = event.target.closest('.gbar, .gmilestone');
    if (!bar) return;
    event.preventDefault();
    const task = store.get('tasks', bar.dataset.taskId);
    if (!task) return;

    showMenu({
      left: event.clientX, right: event.clientX, top: event.clientY,
      bottom: event.clientY, width: 0, height: 0,
    }, {
      items: [
        { id: 'open', label: 'Open task', icon: 'external', onSelect: () => openTaskPanel(task.id) },
        {
          id: 'milestone',
          label: task.milestone ? 'Convert to task' : 'Convert to milestone',
          icon: 'milestone',
          onSelect: () => api.updateTask(task.id, { milestone: !task.milestone }, { verb: false }),
        },
        { separator: true },
        {
          id: 'clear',
          label: 'Clear dates',
          icon: 'x',
          onSelect: () => api.updateTask(task.id, { startDate: null, dueDate: null }, { verb: 'cleared the dates' }),
        },
      ],
    });
  });
}

export function resetTimelineScroll() { scrolledToToday = false; }
