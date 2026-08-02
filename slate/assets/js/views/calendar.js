/* ==========================================================================
   Month calendar — tasks land on their due date.
   ========================================================================== */

import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as api from '../data/api.js';
import { statusOf, isDoneStatus } from '../data/schema.js';
import { state, setState } from '../app/state.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { showMenu } from '../ui/overlay.js';
import { avatarStack } from '../ui/bits.js';
import {
  today, todayKey, key as dateKey, addDays, addMonths, startOfMonth,
  isSameDay, isWeekend, monthNames, dayNamesShort, formatDate,
} from '../lib/date.js';

let cursor = null;

export function renderCalendar(host, project) {
  if (!project) return;
  if (!cursor) cursor = startOfMonth(today());

  const tasks = api.filterTasks(api.tasksOf(project.id), state.filters);
  const byDate = new Map();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    if (!byDate.has(task.dueDate)) byDate.set(task.dueDate, []);
    byDate.get(task.dueDate).push(task);
  }

  const undated = tasks.filter((task) => !task.dueDate).length;

  const bar = h('div.viewbar', { style: { borderBottom: '1px solid var(--border)' } },
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Previous month',
      onClick: () => { cursor = addMonths(cursor, -1); setState({}, 'calendar'); },
    }, icon('chevronLeft', { size: 16 })),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Next month',
      onClick: () => { cursor = addMonths(cursor, 1); setState({}, 'calendar'); },
    }, icon('chevronRight', { size: 16 })),
    h('span', { style: { fontSize: '14px', fontWeight: '620', letterSpacing: '-0.01em', marginLeft: '6px' } },
      `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`),
    h('button.btn.btn--sm', {
      type: 'button',
      style: { marginLeft: '8px' },
      onClick: () => { cursor = startOfMonth(today()); setState({}, 'calendar'); },
    }, 'Today'),
    h('div.u-spacer'),
    undated
      ? h('span.u-muted', { style: { fontSize: '12px' } },
        `${undated} task${undated === 1 ? '' : 's'} without a due date`)
      : null);

  const dow = h('div.cal__dow', ...dayNamesShort.slice(1).concat(dayNamesShort[0])
    .map((day) => h('span', day)));

  const grid = h('div.cal__grid');
  const first = startOfMonth(cursor);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  const weeks = Math.ceil((offset + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7);

  for (let i = 0; i < weeks * 7; i += 1) {
    const day = addDays(start, i);
    grid.appendChild(dayCell(day, cursor, byDate.get(dateKey(day)) || [], project));
  }

  mount(host, h('div.cal', bar, dow, grid));
}

function dayCell(day, cursorMonth, tasks, project) {
  const outside = day.getMonth() !== cursorMonth.getMonth();
  const isToday = isSameDay(day, today());

  const cell = h('div.cal__day', {
    class: [outside ? 'is-outside' : '', isToday ? 'is-today' : '',
      isWeekend(day) && !outside ? 'is-weekend' : ''].filter(Boolean).join(' '),
  });

  cell.appendChild(h('span.cal__daynum', day.getDate()));

  const visible = tasks.slice(0, 3);
  visible.forEach((task) => {
    const status = statusOf(task.status);
    cell.appendChild(h('div.cal__pill', {
      style: { '--pill-color': status.color },
      title: `${project.key}-${task.number} · ${task.title}`,
      onClick: (event) => { event.stopPropagation(); openTaskPanel(task.id); },
    },
      h('span', {
        style: isDoneStatus(task.status)
          ? { textDecoration: 'line-through', color: 'var(--text-3)' } : {},
      }, task.title),
      task.assigneeIds.length ? avatarStack(task.assigneeIds, { size: 'xs', max: 1 }) : null));
  });

  if (tasks.length > visible.length) {
    cell.appendChild(h('button.cal__more', {
      type: 'button',
      onClick: (event) => {
        event.stopPropagation();
        showMenu(event.currentTarget, {
          width: 240,
          items: [
            { section: formatDate(day, { withYear: true }) },
            ...tasks.map((task) => ({
              id: task.id,
              label: task.title,
              swatch: statusOf(task.status).color,
              onSelect: () => openTaskPanel(task.id),
            })),
          ],
        });
      },
    }, `+${tasks.length - visible.length} more`));
  }

  cell.appendChild(h('button.cal__add', {
    type: 'button',
    'aria-label': `Add task on ${formatDate(day)}`,
    onClick: (event) => {
      event.stopPropagation();
      const groups = api.groupsOf(project.id);
      const task = api.createTask(project.id, {
        title: 'New task',
        status: 'todo',
        dueDate: dateKey(day),
        groupId: groups[0]?.id || null,
      });
      openTaskPanel(task.id);
    },
  }, icon('plus', { size: 12 })));

  return cell;
}
