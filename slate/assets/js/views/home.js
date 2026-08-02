/* ==========================================================================
   Home — workspace overview: numbers, projects, deadlines, workload, activity.
   ========================================================================== */

import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { STATUSES, statusOf, isDoneStatus } from '../data/schema.js';
import { state, currentWorkspace } from '../app/state.js';
import { navigate } from '../app/router.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { openNewProject, quickCreateTask } from '../app/shell.js';
import { avatar, avatarStack, statusPill, priorityMark, emptyState, dueChip } from '../ui/bits.js';
import { formatDue, formatDate, timeAgo, todayKey, dueTone } from '../lib/date.js';

export function renderHome(host) {
  const workspace = currentWorkspace();
  const stats = api.workspaceStats(workspace.id);
  const projects = api.projectsOf(workspace.id);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const page = h('div.page.page--wide',
    h('div.page__head',
      h('div.u-row', { style: { justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } },
        h('div',
          h('div.page__eyebrow', workspace.name),
          h('h1.page__title', `${greeting}, ${state.user.name.split(' ')[0]}`),
          h('p.page__sub', summaryLine(stats))),
        h('div.u-row.u-gap-2',
          h('button.btn', { type: 'button', onClick: () => openNewProject() },
            icon('folder', { size: 14 }), 'New project'),
          h('button.btn.btn--primary', { type: 'button', onClick: () => quickCreateTask() },
            icon('plus', { size: 14 }), 'New task')))));

  page.appendChild(statBlock(stats, workspace));

  if (!projects.length) {
    page.appendChild(h('div.section', emptyState({
      icon: 'folder',
      title: 'No projects yet',
      text: 'Projects hold your task lists, timeline and docs. Create the first one to get going.',
      action: h('button.btn.btn--primary', { type: 'button', onClick: () => openNewProject() },
        icon('plus', { size: 14 }), 'Create a project'),
    })));
    mount(host, h('div.view__scroll', page));
    return;
  }

  page.appendChild(h('div.section',
    h('div.section__head',
      h('span.section__title', 'Projects'),
      h('span.section__count', projects.length)),
    h('div.people-grid', ...projects.map((project) => projectCard(project, workspace)))));

  page.appendChild(h('div.section',
    h('div.dash-grid',
      deadlinesCard(workspace),
      h('div.u-col.u-gap-4', workloadCard(workspace), activityCard(workspace)))));

  mount(host, h('div.view__scroll', page));
}

function summaryLine(stats) {
  if (!stats.total) return 'Nothing scheduled yet — create a project to get started.';
  const parts = [];
  if (stats.overdue) parts.push(`${stats.overdue} overdue`);
  if (stats.dueToday) parts.push(`${stats.dueToday} due today`);
  parts.push(`${stats.open} open of ${stats.total}`);
  return parts.join(' · ');
}

/* -- stats ---------------------------------------------------------------- */

function statBlock(stats, workspace) {
  const cards = [
    {
      label: 'Open tasks',
      value: stats.open,
      foot: `${stats.done} completed`,
    },
    {
      label: 'Due today',
      value: stats.dueToday,
      foot: stats.dueToday ? 'Worth a look before the day runs away' : 'Nothing due today',
    },
    {
      label: 'Overdue',
      value: stats.overdue,
      tone: stats.overdue ? 'down' : null,
      foot: stats.overdue ? 'Needs rescheduling or closing' : 'Everything on schedule',
    },
    {
      label: 'Completed this week',
      value: stats.completedThisWeek,
      tone: stats.completedThisWeek ? 'up' : null,
      foot: stats.unassigned ? `${stats.unassigned} tasks unassigned` : 'All open work has an owner',
    },
  ];

  return h('div.stat-grid', ...cards.map((card) => h('div.stat',
    h('div.stat__label', card.label),
    h('div.stat__value', {
      style: card.tone === 'down' && card.value ? { color: 'var(--pr-urgent)' } : {},
    }, String(card.value)),
    h('div.stat__foot', card.foot))));
}

/* -- projects ------------------------------------------------------------- */

function projectCard(project, workspace) {
  const stats = api.projectStats(project.id);
  const tasks = api.tasksOf(project.id);
  const assignees = Array.from(new Set(tasks.flatMap((task) => task.assigneeIds)));

  const segments = STATUSES.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status.id).length,
  })).filter((segment) => segment.count);

  return h('div.person', {
    style: { cursor: 'pointer' },
    onClick: () => navigate(`/w/${workspace.id}/p/${project.id}/board`),
  },
    h('div.person__top',
      h('span', {
        style: {
          width: '10px', height: '10px', borderRadius: '3px',
          background: project.color, flex: 'none',
        },
      }),
      h('div.u-grow', { style: { minWidth: 0 } },
        h('div.person__name.u-truncate', project.name),
        h('div.person__mail.u-truncate',
          project.targetDate ? `Target ${formatDate(project.targetDate)}` : `${stats.total} tasks`)),
      assignees.length ? avatarStack(assignees, { size: 'xs', max: 3 }) : null),

    h('div',
      h('div.u-row', { style: { justifyContent: 'space-between', marginBottom: '6px' } },
        h('span.u-muted', { style: { fontSize: '11px' } }, `${stats.percent}% complete`),
        stats.overdue
          ? h('span', { style: { fontSize: '11px', color: 'var(--pr-urgent)', fontWeight: '600' } },
            `${stats.overdue} overdue`)
          : h('span.u-muted', { style: { fontSize: '11px' } }, `${stats.done}/${stats.total}`)),
      h('div.bar-track', ...segments.map((segment) => h('div.bar-seg', {
        style: {
          width: `${(segment.count / stats.total) * 100}%`,
          background: segment.status.color,
          opacity: segment.status.group === 'closed' ? '1' : '0.75',
        },
        title: `${segment.status.name}: ${segment.count}`,
      })))));
}

/* -- deadlines ------------------------------------------------------------ */

function deadlinesCard(workspace) {
  const today = todayKey();
  const upcoming = api.tasksOfWorkspace(workspace.id)
    .filter((task) => task.dueDate && !isDoneStatus(task.status))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .slice(0, 9);

  const body = h('div');
  if (!upcoming.length) {
    body.appendChild(emptyState({
      icon: 'calendar',
      title: 'No deadlines',
      text: 'Give tasks a due date and the next ones will show up here.',
    }));
  } else {
    upcoming.forEach((task) => {
      const project = store.get('projects', task.projectId);
      const tone = dueTone(task.dueDate);
      body.appendChild(h('div.list-row', { onClick: () => openTaskPanel(task.id) },
        h('span.dot', { style: { background: statusOf(task.status).color, flex: 'none' } }),
        h('div.u-grow', { style: { minWidth: 0 } },
          h('div.list-row__title', task.title),
          h('div.list-row__sub', project ? project.name : '')),
        task.priority !== 'none' ? priorityMark(task.priority) : null,
        h('span', {
          style: {
            fontSize: '12px', fontWeight: tone ? '600' : '500', flex: 'none',
            color: tone === 'overdue' ? 'var(--pr-urgent)'
              : tone === 'due-soon' ? 'var(--pr-high)' : 'var(--text-3)',
          },
        }, formatDue(task.dueDate)),
        task.assigneeIds.length ? avatarStack(task.assigneeIds, { size: 'xs', max: 2 }) : null));
    });
  }

  return h('div.card',
    h('div.card__head',
      h('span.card__title', 'Upcoming deadlines'),
      h('div.u-spacer'),
      h('a.btn.btn--sm', { href: `#/w/${workspace.id}/my-work` }, 'My work')),
    body);
}

/* -- workload ------------------------------------------------------------- */

function workloadCard(workspace) {
  const workload = api.workloadOf(workspace.id).slice(0, 6);
  const max = Math.max(1, ...workload.map((entry) => entry.total));

  const body = h('div.card__body',
    workload.length
      ? h('div.bars', ...workload.map((entry) => h('div.bar-row',
        h('div.u-row.u-gap-2', { style: { minWidth: 0 } },
          avatar(entry.user, 'xs'),
          h('span.bar-row__name', entry.user.name.split(' ')[0])),
        h('div.bar-track',
          h('div.bar-seg', {
            style: {
              width: `${((entry.total - entry.overdue) / max) * 100}%`,
              background: 'var(--accent)',
            },
            title: `${entry.total - entry.overdue} on track`,
          }),
          entry.overdue
            ? h('div.bar-seg', {
              style: { width: `${(entry.overdue / max) * 100}%`, background: 'var(--pr-urgent)' },
              title: `${entry.overdue} overdue`,
            })
            : null),
        h('span.bar-row__val', String(entry.total)))))
      : h('p.u-muted', { style: { fontSize: '13px' } }, 'No open work assigned yet.'));

  return h('div.card',
    h('div.card__head',
      h('span.card__title', 'Workload'),
      h('div.u-spacer'),
      h('a.btn.btn--sm', { href: `#/w/${workspace.id}/people` }, 'People')),
    body);
}

/* -- activity ------------------------------------------------------------- */

function activityCard(workspace) {
  const entries = api.activityOf(workspace.id, { limit: 12 });

  const body = h('div.card__body',
    entries.length
      ? h('div.activity', ...entries.map((entry) => {
        const actor = store.get('users', entry.actorId);
        const task = entry.taskId ? store.get('tasks', entry.taskId) : null;
        return h('div.act', {
          style: task ? { cursor: 'pointer' } : {},
          onClick: task ? () => openTaskPanel(task.id) : null,
        },
          h('b', actor?.name?.split(' ')[0] || 'Someone'),
          h('span', entry.verb),
          task ? h('span', { style: { color: 'var(--text-2)' } }, `"${truncate(task.title, 32)}"`) : null,
          h('time', timeAgo(entry.createdAt)));
      }))
      : h('p.u-muted', { style: { fontSize: '13px' } }, 'Activity will show up here as the team works.'));

  return h('div.card',
    h('div.card__head', h('span.card__title', 'Recent activity')),
    body);
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
