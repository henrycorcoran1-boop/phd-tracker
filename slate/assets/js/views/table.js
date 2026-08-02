/* ==========================================================================
   Table view — dense, grouped by task list, with inline editing.
   ========================================================================== */

import { h, mount, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { statusOf, priorityOf, isDoneStatus, taskProgress } from '../data/schema.js';
import { state, setState, isGroupCollapsed, toggleGroupCollapsed } from '../app/state.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { showMenu, promptDialog, confirmDialog, toast } from '../ui/overlay.js';
import {
  avatarStack, avatar, statusPill, priorityMark, openStatusPicker, openPriorityPicker,
  openAssigneePicker, openDatePicker, emptyState,
} from '../ui/bits.js';
import { formatDate, formatDue, dueTone } from '../lib/date.js';

const COLUMNS = 'minmax(200px, 1fr) 118px 34px 96px 92px 92px 64px 28px';

export function renderTable(host, project) {
  if (!project) return;

  const tasks = api.filterTasks(api.tasksOf(project.id), state.filters);
  const groups = api.groupsOf(project.id);

  const wrap = h('div.table-wrap', { style: { '--tcols': COLUMNS } });
  wrap.appendChild(tableHead());

  if (!tasks.length) {
    wrap.appendChild(emptyState({
      icon: 'table',
      title: 'No tasks match',
      text: state.filters.query || api.tasksOf(project.id).length
        ? 'Try clearing the filters, or add a task to this project.'
        : 'Add your first task to get going.',
      action: h('button.btn.btn--primary', {
        type: 'button',
        onClick: () => addRow(project, groups[0]?.id || null),
      }, icon('plus', { size: 14 }), 'Add task'),
    }));
    mount(host, wrap);
    return;
  }

  const buckets = groups.map((group) => ({
    group,
    tasks: api.sortTasks(tasks.filter((t) => t.groupId === group.id), state.sort.key, state.sort.direction),
  }));

  const loose = tasks.filter((task) => !groups.some((g) => g.id === task.groupId));
  if (loose.length) {
    buckets.push({
      group: { id: '__none', name: 'No list', color: 'var(--text-4)' },
      tasks: api.sortTasks(loose, state.sort.key, state.sort.direction),
    });
  }

  buckets.forEach(({ group, tasks: rows }) => {
    if (!rows.length && group.id === '__none') return;
    wrap.appendChild(renderGroup(project, group, rows));
  });

  mount(host, wrap);
}

function tableHead() {
  const cell = (label, sortKey, right = false) => h('div.thead__cell', {
    class: right ? 'thead__cell--right' : '',
    onClick: sortKey ? () => {
      const same = state.sort.key === sortKey;
      setState({
        sort: {
          key: sortKey,
          direction: same && state.sort.direction === 'asc' ? 'desc' : 'asc',
        },
      }, 'sort');
    } : null,
  },
    label,
    sortKey && state.sort.key === sortKey
      ? icon(state.sort.direction === 'asc' ? 'arrowUp' : 'arrowDown', { size: 11, cls: 'thead__sort' })
      : null);

  return h('div.thead',
    cell('Task', 'title'),
    cell('Status', 'status'),
    cell('', 'priority'),
    cell('Assignees', null),
    cell('Start', 'startDate'),
    cell('Due', 'dueDate'),
    cell('Progress', null, true),
    h('div'));
}

function renderGroup(project, group, rows) {
  const collapsed = isGroupCollapsed(group.id);
  const done = rows.filter((task) => isDoneStatus(task.status)).length;

  const head = h('div.tgroup__head', {
    style: { '--group-color': group.color },
    onClick: (event) => {
      if (event.target.closest('button')) return;
      toggleGroupCollapsed(group.id);
    },
  },
    icon('chevronDown', { size: 14, cls: 'tgroup__caret' }),
    h('span.tgroup__name', group.name),
    h('span.col__count', rows.length),
    h('span.u-muted', { style: { fontSize: '11px' } }, `${done} done`),
    h('div.u-spacer'),
    h('button.icon-btn', {
      type: 'button', 'aria-label': `Add task to ${group.name}`,
      onClick: (event) => { event.stopPropagation(); addRow(project, group.id === '__none' ? null : group.id); },
    }, icon('plus', { size: 15 })),
    group.id !== '__none'
      ? h('button.icon-btn', {
        type: 'button', 'aria-label': `Options for ${group.name}`,
        onClick: (event) => {
          event.stopPropagation();
          showMenu(event.currentTarget, {
            align: 'end',
            items: [
              {
                id: 'rename', label: 'Rename list', icon: 'edit',
                onSelect: async () => {
                  const name = await promptDialog({ title: 'Rename list', label: 'Name', value: group.name });
                  if (name) store.update('groups', group.id, { name });
                },
              },
              { separator: true },
              {
                id: 'delete', label: 'Delete list', icon: 'trash', danger: true,
                onSelect: async () => {
                  const ok = await confirmDialog({
                    title: `Delete "${group.name}"?`,
                    message: rows.length
                      ? `${rows.length} task${rows.length === 1 ? '' : 's'} will be kept but moved out of this list.`
                      : 'This list is empty.',
                    confirmLabel: 'Delete list', danger: true,
                  });
                  if (ok) api.deleteGroup(group.id);
                },
              },
            ],
          });
        },
      }, icon('more', { size: 15 }))
      : null);

  const body = h('div.tgroup__rows');
  rows.forEach((task) => body.appendChild(renderRow(project, task)));
  body.appendChild(h('button.trow-add', {
    type: 'button',
    onClick: () => addRow(project, group.id === '__none' ? null : group.id),
  }, icon('plus', { size: 14 }), 'Add task'));

  return h('div.tgroup', { class: collapsed ? 'is-collapsed' : '' }, head, body);
}

function renderRow(project, task) {
  const done = isDoneStatus(task.status);
  const workspaceId = project.workspaceId;

  const titleCell = h('div.trow__cell',
    h('span.trow__key', `${project.key}-${task.number}`),
    task.milestone ? icon('milestone', { size: 13, cls: 'u-muted' }) : null,
    h('span.trow__title', task.title));

  // A single click opens the task, a double click renames it in place. The
  // short timer lets the second click cancel the first one's navigation.
  let clickTimer = null;
  const row = h('div.trow', {
    dataset: { taskId: task.id },
    class: done ? 'is-done' : '',
    onClick: (event) => {
      if (event.target.closest('button, input')) return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => openTaskPanel(task.id), 210);
    },
    onDblClick: (event) => {
      if (event.target.closest('button, input')) return;
      clearTimeout(clickTimer);
      startTitleEdit(row, titleCell, task);
    },
  });

  row.appendChild(titleCell);

  row.appendChild(h('div.trow__cell',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => openStatusPicker(event.currentTarget, task),
    }, statusPill(task.status))));

  row.appendChild(h('div.trow__cell',
    h('button.cell-btn', {
      type: 'button',
      style: { padding: '0 4px' },
      onClick: (event) => openPriorityPicker(event.currentTarget, task),
    }, priorityMark(task.priority))));

  row.appendChild(h('div.trow__cell',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => openAssigneePicker(event.currentTarget, task, workspaceId),
    }, task.assigneeIds.length
      ? avatarStack(task.assigneeIds, { size: 'xs', max: 3 })
      : h('span.avatar-empty', { style: { width: '20px', height: '20px' } }, icon('plus', { size: 11 })))));

  row.appendChild(dateCell(task, 'startDate', 'Start'));
  row.appendChild(dateCell(task, 'dueDate', 'Due'));

  const percent = taskProgress(task);
  row.appendChild(h('div.trow__cell.trow__cell--right',
    h('span.u-nums', { style: { fontSize: '12px', color: percent === 100 ? 'var(--st-done)' : 'var(--text-3)' } },
      `${percent}%`)));

  row.appendChild(h('div.trow__cell',
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Task actions',
      style: { width: '24px', height: '24px' },
      onClick: (event) => openRowMenu(event.currentTarget, task),
    }, icon('more', { size: 14 }))));

  return row;
}

function dateCell(task, field, label) {
  const value = task[field];
  const tone = field === 'dueDate' ? dueTone(value, isDoneStatus(task.status)) : '';
  return h('div.trow__cell',
    h('button.cell-btn', {
      type: 'button',
      class: value ? '' : 'cell-btn--empty',
      style: tone === 'overdue' ? { color: 'var(--pr-urgent)', fontWeight: '600' }
        : tone === 'due-soon' ? { color: 'var(--pr-high)', fontWeight: '600' } : {},
      onClick: (event) => openDatePicker(event.currentTarget, {
        value,
        title: label,
        min: field === 'dueDate' ? task.startDate : null,
        onPick: (picked) => api.updateTask(task.id, { [field]: picked }),
      }),
    }, value ? formatDate(value) : h('span', '—')));
}

function openRowMenu(anchor, task) {
  showMenu(anchor, {
    align: 'end',
    items: [
      { id: 'open', label: 'Open task', icon: 'external', onSelect: () => openTaskPanel(task.id) },
      {
        id: 'rename', label: 'Rename', icon: 'edit',
        onSelect: () => {
          const row = document.querySelector(`.trow[data-task-id="${task.id}"]`);
          if (row) startTitleEdit(row, row.firstElementChild, task);
        },
      },
      {
        id: 'duplicate', label: 'Duplicate', icon: 'copy',
        onSelect: () => { api.duplicateTask(task.id); toast('Task duplicated'); },
      },
      {
        id: 'milestone',
        label: task.milestone ? 'Remove milestone' : 'Mark as milestone',
        icon: 'milestone',
        onSelect: () => api.updateTask(task.id, { milestone: !task.milestone }, { verb: false }),
      },
      { separator: true },
      {
        id: 'delete', label: 'Delete task', icon: 'trash', danger: true,
        onSelect: () => {
          api.deleteTask(task.id);
          toast('Task deleted', { action: 'Undo', onAction: () => store.undo() });
        },
      },
    ],
  });
}

/* -- inline editing ------------------------------------------------------- */

function startTitleEdit(row, cell, task) {
  const input = h('input.input.trow__input', { value: task.title });
  const original = Array.from(cell.childNodes);
  clear(cell);
  cell.appendChild(input);
  input.focus();
  input.select();

  const finish = (save) => {
    const value = input.value.trim();
    if (save && value && value !== task.title) {
      api.updateTask(task.id, { title: value });
    } else {
      clear(cell);
      original.forEach((node) => cell.appendChild(node));
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function addRow(project, groupId) {
  const task = api.createTask(project.id, {
    title: 'New task',
    status: 'todo',
    groupId,
    order: Date.now(),
  });
  requestAnimationFrame(() => {
    const row = document.querySelector(`.trow[data-task-id="${task.id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    startTitleEdit(row, row.firstElementChild, task);
  });
}
