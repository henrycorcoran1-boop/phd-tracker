/* ==========================================================================
   Task detail drawer: properties, description, subtasks, dependencies,
   comments and activity.
   ========================================================================== */

import { h, mount, clear, autosize, esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { statusOf, priorityOf, isDoneStatus, uid, taskProgress, taskRef } from '../data/schema.js';
import { state } from '../app/state.js';
import { setQuery } from '../app/router.js';
import { showMenu, confirmDialog, toast, closeMenu } from './overlay.js';
import {
  avatar, avatarStack, statusPill, priorityMark, openStatusPicker, openPriorityPicker,
  openAssigneePicker, openLabelPicker, openDatePicker,
} from './bits.js';
import { formatDate, formatDateTime, timeAgo, dueTone, diffDays, formatRange } from '../lib/date.js';
import { renderMarkdown } from '../lib/markdown.js';

let panelEl = null;
let scrimEl = null;
let openId = null;
let unsubscribe = null;

export const isPanelOpen = () => Boolean(openId);
export const openTaskId = () => openId;

export function openTaskPanel(taskId) {
  const task = store.get('tasks', taskId);
  if (!task) return;

  const first = !openId;
  openId = taskId;
  setQuery({ task: taskId });

  if (first) {
    scrimEl = h('div.panel-scrim', { onPointerDown: () => closeTaskPanel() });
    panelEl = h('aside.panel', { role: 'dialog', 'aria-label': 'Task details' });
    document.body.appendChild(scrimEl);
    document.body.appendChild(panelEl);
    document.addEventListener('keydown', onKeyDown, true);
    unsubscribe = store.subscribe(() => { if (openId) paint(); });
  }

  paint();
}

export function closeTaskPanel() {
  if (!openId) return;
  openId = null;
  setQuery({ task: null });
  panelEl?.remove();
  scrimEl?.remove();
  panelEl = null;
  scrimEl = null;
  document.removeEventListener('keydown', onKeyDown, true);
  unsubscribe?.();
  unsubscribe = null;
}

function onKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (document.querySelector('.menu, .modal-scrim')) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    active.blur();
    return;
  }
  event.stopPropagation();
  closeTaskPanel();
}

/* -- render --------------------------------------------------------------- */

function paint() {
  const task = store.get('tasks', openId);
  if (!task) { closeTaskPanel(); return; }

  const project = store.get('projects', task.projectId);
  const workspaceId = project?.workspaceId || state.workspaceId;
  const scrollTop = panelEl.querySelector('.panel__body')?.scrollTop || 0;

  const head = h('div.panel__head',
    h('button.icon-btn', {
      type: 'button', title: 'Close', 'aria-label': 'Close',
      onClick: () => closeTaskPanel(),
    }, icon('x', { size: 17 })),
    h('span.panel__key', project ? taskRef(project, task) : `#${task.number}`),
    project ? h('span.badge', { style: { marginLeft: '4px' } },
      h('span.dot', { style: { background: project.color } }), project.name) : null,
    h('div.u-spacer'),
    h('button.btn.btn--sm', {
      type: 'button',
      onClick: () => api.updateTask(task.id, {
        status: isDoneStatus(task.status) ? 'todo' : 'done',
      }),
    }, icon('check', { size: 13 }), isDoneStatus(task.status) ? 'Reopen' : 'Mark done'),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'More actions',
      onClick: (event) => openTaskMenu(event.currentTarget, task),
    }, icon('more', { size: 16 })));

  const body = h('div.panel__body');

  /* title */
  const title = h('textarea.panel__title', { rows: 1, value: task.title, 'aria-label': 'Task title' });
  autosize(title);
  const commitTitle = () => {
    const value = title.value.trim();
    if (value && value !== task.title) api.updateTask(task.id, { title: value });
    else if (!value) title.value = task.title;
  };
  title.addEventListener('blur', commitTitle);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); title.blur(); }
  });
  body.appendChild(title);

  /* properties */
  body.appendChild(propsBlock(task, project, workspaceId));

  /* description */
  body.appendChild(descriptionBlock(task));

  /* checklist */
  body.appendChild(checklistBlock(task));

  /* dependencies */
  body.appendChild(dependencyBlock(task, project));

  /* comments */
  body.appendChild(commentsBlock(task));

  /* activity */
  body.appendChild(activityBlock(task, workspaceId));

  mount(panelEl, head, body);
  body.scrollTop = scrollTop;
}

/* -- blocks --------------------------------------------------------------- */

function propRow(label, iconName, value) {
  return h('div.prop',
    h('div.prop__label', icon(iconName, { size: 14 }), label),
    h('div.prop__value', value));
}

function propsBlock(task, project, workspaceId) {
  const props = h('div.props');

  props.appendChild(propRow('Status', 'circle',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => openStatusPicker(event.currentTarget, task),
    }, statusPill(task.status))));

  props.appendChild(propRow('Priority', 'flag',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => openPriorityPicker(event.currentTarget, task),
    }, priorityMark(task.priority),
      h('span', { style: { marginLeft: '4px' } }, priorityOf(task.priority).name))));

  const assigneeButton = h('button.cell-btn', {
    type: 'button',
    onClick: (event) => openAssigneePicker(event.currentTarget, task, workspaceId),
  });
  if (task.assigneeIds.length) {
    const users = task.assigneeIds.map((id) => store.get('users', id)).filter(Boolean);
    assigneeButton.appendChild(avatarStack(task.assigneeIds, { size: 'xs', max: 3 }));
    assigneeButton.appendChild(h('span', { style: { marginLeft: '5px' } },
      users.length === 1 ? users[0].name : `${users.length} people`));
  } else {
    assigneeButton.appendChild(h('span.avatar-empty', { style: { width: '20px', height: '20px' } },
      icon('plus', { size: 11 })));
    assigneeButton.appendChild(h('span.u-muted', { style: { marginLeft: '5px' } }, 'Unassigned'));
  }
  props.appendChild(propRow('Assignees', 'user', assigneeButton));

  props.appendChild(propRow('Start', 'calendar', dateButton(task, 'startDate', 'Start date')));

  const dueTone_ = dueTone(task.dueDate, isDoneStatus(task.status));
  const dueControl = h('div.u-row.u-gap-2',
    dateButton(task, 'dueDate', 'Due date'),
    dueTone_ === 'overdue' && task.dueDate
      ? h('span.badge', { style: { background: 'color-mix(in srgb, var(--pr-urgent) 14%, transparent)', color: 'var(--pr-urgent)' } },
        `${Math.abs(diffDays(new Date(), task.dueDate))}d overdue`)
      : null);
  props.appendChild(propRow('Due', 'clock', dueControl));

  if (task.startDate && task.dueDate) {
    const days = diffDays(task.startDate, task.dueDate) + 1;
    props.appendChild(propRow('Duration', 'timeline',
      h('span.u-muted', { style: { fontSize: '13px' } }, `${days} day${days === 1 ? '' : 's'}`)));
  }

  const estimateInput = h('input.input', {
    type: 'number', min: '0', step: '1', value: task.estimate ?? '',
    placeholder: '—',
    style: { width: '78px', height: '26px', minHeight: '26px', fontSize: '13px' },
    onChange: (event) => {
      const value = event.target.value === '' ? null : Number(event.target.value);
      api.updateTask(task.id, { estimate: value }, { verb: false });
    },
  });
  props.appendChild(propRow('Estimate', 'clock',
    h('div.u-row.u-gap-2', estimateInput, h('span.u-muted', { style: { fontSize: '12px' } }, 'hours'))));

  const percent = taskProgress(task);
  const slider = h('input', {
    type: 'range', min: '0', max: '100', step: '5', value: percent,
    style: { width: '130px', accentColor: 'var(--accent)' },
    onInput: (event) => api.updateTask(task.id, { progress: Number(event.target.value) }, { verb: false }),
  });
  props.appendChild(propRow('Progress', 'trend',
    h('div.u-row.u-gap-2', slider,
      h('span.u-nums', { style: { fontSize: '12px', color: 'var(--text-3)' } }, `${percent}%`))));

  const labelControl = h('div.prop__value');
  task.labels.forEach((label) => {
    labelControl.appendChild(h('button.label-chip', {
      type: 'button',
      title: 'Remove label',
      onClick: () => api.updateTask(task.id, {
        labels: task.labels.filter((l) => l !== label),
      }, { verb: false }),
    }, label));
  });
  labelControl.appendChild(h('button.cell-btn.cell-btn--empty', {
    type: 'button',
    onClick: (event) => openLabelPicker(event.currentTarget, task, workspaceId),
  }, icon('plus', { size: 12 }), task.labels.length ? '' : 'Add label'));
  props.appendChild(propRow('Labels', 'tag', labelControl));

  props.appendChild(propRow('List', 'folder',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => {
        const groups = api.groupsOf(task.projectId);
        showMenu(event.currentTarget, {
          items: [
            ...groups.map((group) => ({
              id: group.id,
              label: group.name,
              swatch: group.color,
              selected: group.id === task.groupId,
              onSelect: () => api.updateTask(task.id, { groupId: group.id }, { verb: false }),
            })),
            { separator: true },
            {
              id: 'none', label: 'No list', selected: !task.groupId,
              onSelect: () => api.updateTask(task.id, { groupId: null }, { verb: false }),
            },
          ],
        });
      },
    }, store.get('groups', task.groupId)?.name || h('span.u-muted', 'No list'))));

  return props;
}

function dateButton(task, field, label) {
  const value = task[field];
  return h('button.cell-btn', {
    type: 'button',
    class: value ? '' : 'cell-btn--empty',
    onClick: (event) => openDatePicker(event.currentTarget, {
      value,
      title: label,
      min: field === 'dueDate' ? task.startDate : null,
      onPick: (picked) => api.updateTask(task.id, { [field]: picked }),
    }),
  }, value ? formatDate(value, { withYear: true }) : 'Set date');
}

function descriptionBlock(task) {
  const section = h('div.panel__section',
    h('div.panel__section-head', h('span.panel__section-title', 'Description')));

  const view = h('div.desc', {
    class: task.description ? '' : 'desc--empty',
    html: task.description
      ? renderMarkdown(task.description)
      : 'Add a description — Markdown works here.',
  });
  view.classList.add('md');

  view.addEventListener('click', (event) => {
    if (event.target.tagName === 'A') return;
    const editor = h('textarea.textarea', {
      value: task.description,
      placeholder: 'Add more detail…',
      style: { minHeight: '120px', fontSize: '13px', lineHeight: '1.6' },
    });
    const save = () => {
      if (editor.value !== task.description) {
        api.updateTask(task.id, { description: editor.value }, { verb: false });
      } else {
        paint();
      }
    };
    editor.addEventListener('blur', save);
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); paint(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); editor.blur(); }
    });
    view.replaceWith(editor);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });

  section.appendChild(view);
  return section;
}

function checklistBlock(task) {
  const items = task.checklist || [];
  const done = items.filter((item) => item.done).length;

  const section = h('div.panel__section',
    h('div.panel__section-head',
      h('span.panel__section-title', 'Subtasks'),
      items.length ? h('span.u-muted.u-nums', { style: { fontSize: '12px' } }, `${done}/${items.length}`) : null,
      h('div.u-spacer')));

  if (items.length) {
    section.appendChild(h('div.meter', { style: { marginBottom: '8px' } },
      h('div.meter__fill', {
        style: {
          width: `${(done / items.length) * 100}%`,
          background: done === items.length ? 'var(--st-done)' : 'var(--accent)',
        },
      })));
  }

  const list = h('div');
  items.forEach((item) => {
    const text = h('span.check-item__text', item.text);
    const row = h('div.check-item', { class: item.done ? 'is-done' : '' },
      h('input.checkbox', {
        type: 'checkbox',
        checked: item.done,
        'aria-label': item.text,
        onChange: () => updateChecklist(task, items.map((i) =>
          (i.id === item.id ? { ...i, done: !i.done } : i))),
      }),
      text,
      h('button.icon-btn', {
        type: 'button', 'aria-label': 'Delete subtask',
        onClick: () => updateChecklist(task, items.filter((i) => i.id !== item.id)),
      }, icon('x', { size: 13 })));

    text.addEventListener('dblclick', () => {
      const input = h('input.input', { value: item.text, style: { height: '26px', minHeight: '26px' } });
      const commit = (save) => {
        if (save && input.value.trim()) {
          updateChecklist(task, items.map((i) =>
            (i.id === item.id ? { ...i, text: input.value.trim() } : i)));
        } else paint();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commit(true);
        if (event.key === 'Escape') commit(false);
      });
      input.addEventListener('blur', () => commit(true));
      text.replaceWith(input);
      input.focus();
      input.select();
    });

    list.appendChild(row);
  });
  section.appendChild(list);

  const add = h('input.input', {
    placeholder: 'Add a subtask…',
    style: { height: '30px', minHeight: '30px', fontSize: '13px', marginTop: '4px' },
  });
  add.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = add.value.trim();
    if (!value) return;
    updateChecklist(task, [...items, { id: uid('chk'), text: value, done: false }]);
  });
  section.appendChild(add);

  return section;
}

function updateChecklist(task, checklist) {
  api.updateTask(task.id, { checklist }, { verb: false });
}

function dependencyBlock(task, project) {
  const deps = (task.dependsOn || []).map((id) => store.get('tasks', id)).filter(Boolean);
  const blocking = api.tasksOf(task.projectId).filter((t) => t.dependsOn?.includes(task.id));

  const section = h('div.panel__section',
    h('div.panel__section-head',
      h('span.panel__section-title', 'Dependencies'),
      h('div.u-spacer'),
      h('button.btn.btn--sm', {
        type: 'button',
        onClick: (event) => {
          const candidates = api.tasksOf(task.projectId)
            .filter((t) => t.id !== task.id && !task.dependsOn.includes(t.id));
          showMenu(event.currentTarget, {
            search: true,
            align: 'end',
            width: 280,
            searchPlaceholder: 'Depends on…',
            emptyText: 'No other tasks in this project',
            items: candidates.map((candidate) => ({
              id: candidate.id,
              label: candidate.title,
              hint: project ? taskRef(project, candidate) : '',
              swatch: statusOf(candidate.status).color,
              onSelect: () => {
                const result = api.addDependency(task.id, candidate.id);
                if (result?.error) toast(result.error, { tone: 'error' });
              },
            })),
          });
        },
      }, icon('plus', { size: 13 }), 'Add')));

  if (!deps.length && !blocking.length) {
    section.appendChild(h('p.u-muted', { style: { fontSize: '12px', padding: '2px 6px' } },
      'No dependencies. Add one to show the link on the timeline.'));
    return section;
  }

  if (deps.length) {
    section.appendChild(h('div.menu__label', { style: { padding: '4px 6px' } }, 'Waiting on'));
    deps.forEach((dep) => {
      const late = dep.dueDate && task.startDate && diffDays(dep.dueDate, task.startDate) < 0;
      section.appendChild(h('div.dep-row', { onClick: () => openTaskPanel(dep.id) },
        h('span.dot', { style: { background: statusOf(dep.status).color } }),
        h('span.dep-row__title', dep.title),
        late ? h('span.badge', {
          style: { background: 'color-mix(in srgb, var(--pr-urgent) 14%, transparent)', color: 'var(--pr-urgent)' },
          title: 'This task starts before its dependency finishes',
        }, 'conflict') : null,
        dep.dueDate ? h('span.u-muted', { style: { fontSize: '11px' } }, formatDate(dep.dueDate)) : null,
        h('button.icon-btn', {
          type: 'button', 'aria-label': 'Remove dependency',
          onClick: (event) => { event.stopPropagation(); api.removeDependency(task.id, dep.id); },
        }, icon('x', { size: 13 }))));
    });
  }

  if (blocking.length) {
    section.appendChild(h('div.menu__label', { style: { padding: '8px 6px 4px' } }, 'Blocking'));
    blocking.forEach((other) => {
      section.appendChild(h('div.dep-row', { onClick: () => openTaskPanel(other.id) },
        h('span.dot', { style: { background: statusOf(other.status).color } }),
        h('span.dep-row__title', other.title),
        other.startDate ? h('span.u-muted', { style: { fontSize: '11px' } }, formatDate(other.startDate)) : null));
    });
  }

  return section;
}

function commentsBlock(task) {
  const comments = api.commentsOf(task.id);

  const section = h('div.panel__section',
    h('div.panel__section-head',
      h('span.panel__section-title', 'Comments'),
      comments.length ? h('span.u-muted', { style: { fontSize: '12px' } }, comments.length) : null));

  comments.forEach((comment) => {
    const author = store.get('users', comment.authorId);
    section.appendChild(h('div.comment',
      avatar(author, 'sm'),
      h('div.u-grow',
        h('div.comment__head',
          h('span.comment__author', author?.name || 'Someone'),
          h('span.comment__time', { title: formatDateTime(comment.createdAt) }, timeAgo(comment.createdAt)),
          comment.authorId === state.user.id
            ? h('button.icon-btn', {
              type: 'button',
              style: { marginLeft: 'auto', width: '22px', height: '22px' },
              'aria-label': 'Delete comment',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Delete comment?',
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete', danger: true,
                });
                if (ok) api.deleteComment(comment.id);
              },
            }, icon('trash', { size: 12 }))
            : null),
        h('div.comment__body', comment.body))));
  });

  const input = h('textarea.textarea', { placeholder: 'Leave a comment…', rows: 2 });
  const send = h('button.btn.btn--primary.btn--sm', {
    type: 'button',
    onClick: () => {
      if (!input.value.trim()) return;
      api.addComment(task.id, input.value);
      input.value = '';
    },
  }, 'Comment');

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send.click();
    }
  });

  section.appendChild(h('div.comment-form',
    avatar(state.user, 'sm'),
    h('div.u-grow.u-col.u-gap-2', input,
      h('div.u-row.u-gap-2',
        h('span.field__hint', navigator.platform.includes('Mac') ? '⌘↵ to send' : 'Ctrl+↵ to send'),
        h('div.u-spacer'), send))));

  return section;
}

function activityBlock(task, workspaceId) {
  const entries = api.activityOf(workspaceId, { taskId: task.id, limit: 12 });
  const section = h('div.panel__section',
    h('div.panel__section-head', h('span.panel__section-title', 'Activity')));

  const created = store.get('users', task.createdBy);
  const list = h('div.activity');

  entries.forEach((entry) => {
    const actor = store.get('users', entry.actorId);
    list.appendChild(h('div.act',
      h('b', actor?.name?.split(' ')[0] || 'Someone'),
      h('span', entry.verb),
      entry.detail ? h('b', entry.detail) : null,
      h('time', { title: formatDateTime(entry.createdAt) }, timeAgo(entry.createdAt))));
  });

  list.appendChild(h('div.act',
    h('b', created?.name?.split(' ')[0] || 'Someone'),
    h('span', 'created this task'),
    h('time', { title: formatDateTime(task.createdAt) }, timeAgo(task.createdAt))));

  section.appendChild(list);
  return section;
}

/* -- menu ----------------------------------------------------------------- */

function openTaskMenu(anchor, task) {
  showMenu(anchor, {
    align: 'end',
    items: [
      {
        id: 'duplicate', label: 'Duplicate task', icon: 'copy',
        onSelect: () => {
          const copy = api.duplicateTask(task.id);
          toast('Task duplicated', { action: 'Open', onAction: () => openTaskPanel(copy.id) });
        },
      },
      {
        id: 'milestone',
        label: task.milestone ? 'Convert to task' : 'Convert to milestone',
        icon: 'milestone',
        onSelect: () => api.updateTask(task.id, { milestone: !task.milestone }, { verb: false }),
      },
      {
        id: 'copy-link', label: 'Copy link', icon: 'link',
        onSelect: async () => {
          const url = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
          try {
            await navigator.clipboard.writeText(url);
            toast('Link copied');
          } catch {
            toast('Could not copy — copy it from the address bar', { tone: 'error' });
          }
        },
      },
      { separator: true },
      {
        id: 'delete', label: 'Delete task', icon: 'trash', danger: true,
        onSelect: async () => {
          const ok = await confirmDialog({
            title: `Delete "${task.title}"?`,
            message: 'The task and its comments will be removed. You can undo this straight after.',
            confirmLabel: 'Delete task', danger: true,
          });
          if (!ok) return;
          api.deleteTask(task.id);
          closeTaskPanel();
          toast('Task deleted', { action: 'Undo', onAction: () => store.undo() });
        },
      },
    ],
  });
}
