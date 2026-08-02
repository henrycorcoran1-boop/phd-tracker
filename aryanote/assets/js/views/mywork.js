/* ==========================================================================
   My work — everything assigned to the signed-in user, bucketed by urgency.
   ========================================================================== */

import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { statusOf, isDoneStatus } from '../data/schema.js';
import { state, currentWorkspace } from '../app/state.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { quickCreateTask } from '../app/shell.js';
import {
  statusPill, priorityMark, emptyState, openStatusPicker, openDatePicker, avatarStack,
} from '../ui/bits.js';
import { formatDue, formatDate, todayKey, diffDays, today, addDays, key as dateKey } from '../lib/date.js';

export function renderMyWork(host) {
  const workspace = currentWorkspace();
  const mine = api.myTasks(workspace.id, state.user.id);
  const open = mine.filter((task) => !isDoneStatus(task.status));
  const todayStr = todayKey();
  const weekEnd = dateKey(addDays(today(), 7));

  const buckets = [
    {
      id: 'overdue',
      title: 'Overdue',
      tone: 'var(--pr-urgent)',
      tasks: open.filter((task) => task.dueDate && task.dueDate < todayStr),
    },
    {
      id: 'today',
      title: 'Today',
      tone: 'var(--pr-high)',
      tasks: open.filter((task) => task.dueDate === todayStr),
    },
    {
      id: 'week',
      title: 'Next 7 days',
      tone: 'var(--accent)',
      tasks: open.filter((task) => task.dueDate && task.dueDate > todayStr && task.dueDate <= weekEnd),
    },
    {
      id: 'later',
      title: 'Later',
      tone: 'var(--text-4)',
      tasks: open.filter((task) => task.dueDate && task.dueDate > weekEnd),
    },
    {
      id: 'undated',
      title: 'No due date',
      tone: 'var(--text-4)',
      tasks: open.filter((task) => !task.dueDate),
    },
  ].filter((bucket) => bucket.tasks.length);

  const recentlyDone = mine
    .filter((task) => isDoneStatus(task.status) && task.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 6);

  const page = h('div.page',
    h('div.page__head',
      h('div.u-row', { style: { justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px' } },
        h('div',
          h('div.page__eyebrow', workspace.name),
          h('h1.page__title', 'My work'),
          h('p.page__sub', open.length
            ? `${open.length} open task${open.length === 1 ? '' : 's'} assigned to you`
            : 'Nothing assigned to you right now')),
        h('button.btn.btn--primary', { type: 'button', onClick: () => quickCreateTask() },
          icon('plus', { size: 14 }), 'New task'))));

  if (!open.length) {
    page.appendChild(emptyState({
      icon: 'check',
      title: 'Your queue is clear',
      text: 'Nothing is assigned to you at the moment. Pick something up from a project board, or create a task.',
      action: h('button.btn.btn--primary', { type: 'button', onClick: () => quickCreateTask() },
        icon('plus', { size: 14 }), 'Create a task'),
    }));
  }

  buckets.forEach((bucket) => {
    const body = h('div');
    bucket.tasks
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
      .forEach((task) => body.appendChild(taskRow(task, bucket)));

    page.appendChild(h('div.section',
      h('div.section__head',
        h('span.dot', { style: { background: bucket.tone } }),
        h('span.section__title', bucket.title),
        h('span.section__count', bucket.tasks.length)),
      h('div.card', body)));
  });

  if (recentlyDone.length) {
    const body = h('div');
    recentlyDone.forEach((task) => body.appendChild(taskRow(task, { id: 'done' })));
    page.appendChild(h('div.section',
      h('div.section__head',
        h('span.section__title', 'Recently completed'),
        h('span.section__count', recentlyDone.length)),
      h('div.card', body)));
  }

  mount(host, h('div.view__scroll', page));
}

function taskRow(task, bucket) {
  const project = store.get('projects', task.projectId);
  const done = isDoneStatus(task.status);

  return h('div.list-row', { onClick: () => openTaskPanel(task.id) },
    h('input.checkbox', {
      type: 'checkbox',
      checked: done,
      'aria-label': `Mark "${task.title}" done`,
      onClick: (event) => event.stopPropagation(),
      onChange: () => api.updateTask(task.id, { status: done ? 'todo' : 'done' }),
    }),
    h('div.u-grow', { style: { minWidth: 0 } },
      h('div.list-row__title', {
        style: done ? { color: 'var(--text-3)', textDecoration: 'line-through' } : {},
      }, task.title),
      h('div.list-row__sub',
        project ? `${project.name} · ${project.key}-${task.number}` : '')),

    task.priority !== 'none' ? priorityMark(task.priority) : null,

    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => { event.stopPropagation(); openStatusPicker(event.currentTarget, task); },
    }, statusPill(task.status)),

    h('button.cell-btn', {
      type: 'button',
      class: task.dueDate ? '' : 'cell-btn--empty',
      style: { minWidth: '76px', justifyContent: 'flex-end' },
      onClick: (event) => {
        event.stopPropagation();
        openDatePicker(event.currentTarget, {
          value: task.dueDate,
          title: 'Due date',
          onPick: (picked) => api.updateTask(task.id, { dueDate: picked }),
        });
      },
    }, task.dueDate ? formatDue(task.dueDate) : 'Set date'));
}
