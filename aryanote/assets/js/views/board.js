/* ==========================================================================
   Kanban board. Columns are statuses (or task lists when grouping by list).
   Drag and drop is pointer-based so it works with mouse, pen and touch.
   ========================================================================== */

import { h, mount, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { STATUSES, statusOf, isDoneStatus, taskProgress } from '../data/schema.js';
import { state, setState } from '../app/state.js';
import { suspendRender, resumeRender, scheduleRender } from '../app/shell.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { showMenu, toast, confirmDialog, promptDialog } from '../ui/overlay.js';
import {
  avatarStack, priorityMark, dueChip, labelChips, progressMeter, emptyState,
} from '../ui/bits.js';

export function renderBoard(host, project) {
  if (!project) return;

  const board = h('div.board');
  const tasks = api.filterTasks(api.tasksOf(project.id), state.filters);
  const columns = buildColumns(project, tasks);

  columns.forEach((column) => board.appendChild(renderColumn(project, column)));

  if (state.groupBy === 'group') {
    board.appendChild(h('button.col', {
      type: 'button',
      style: {
        minHeight: '44px', justifyContent: 'center', alignItems: 'center',
        width: '180px', color: 'var(--text-4)', fontSize: '13px', cursor: 'pointer',
        background: 'transparent', borderStyle: 'dashed',
      },
      onClick: async () => {
        const name = await promptDialog({
          title: 'New list', label: 'List name', placeholder: 'e.g. Ready for review',
          confirmLabel: 'Add list',
        });
        if (name) api.createGroup(project.id, name);
      },
    }, icon('plus', { size: 15 }), 'Add list'));
  }

  mount(host, board);
  installDragAndDrop(board, project);
}

function buildColumns(project, tasks) {
  if (state.groupBy === 'status') {
    return STATUSES.map((status) => ({
      id: status.id,
      kind: 'status',
      name: status.name,
      color: status.color,
      tasks: sorted(tasks.filter((task) => task.status === status.id)),
    }));
  }

  const groups = api.groupsOf(project.id);
  const columns = groups.map((group) => ({
    id: group.id,
    kind: 'group',
    name: group.name,
    color: group.color,
    group,
    tasks: sorted(tasks.filter((task) => task.groupId === group.id)),
  }));

  const loose = sorted(tasks.filter((task) => !task.groupId || !groups.some((g) => g.id === task.groupId)));
  if (loose.length) {
    columns.push({ id: '__none', kind: 'group', name: 'No list', color: 'var(--text-4)', tasks: loose });
  }
  return columns;
}

function sorted(tasks) {
  return api.sortTasks(tasks, state.sort.key, state.sort.direction);
}

/* -- column --------------------------------------------------------------- */

function renderColumn(project, column) {
  const list = h('div.col__list', { dataset: { columnId: column.id, columnKind: column.kind } });

  column.tasks.forEach((task) => list.appendChild(taskCard(task, project)));

  if (!column.tasks.length) {
    list.appendChild(h('div', {
      style: {
        padding: '14px 8px', textAlign: 'center', fontSize: '12px',
        color: 'var(--text-4)', border: '1px dashed var(--border)',
        borderRadius: '8px', margin: '2px 0',
      },
    }, 'Nothing here yet'));
  }

  const head = h('div.col__head',
    h('span.col__name', { style: { '--col-color': column.color } },
      column.kind === 'status'
        ? h('span.dot', { style: { background: column.color } })
        : h('span.nav-item__swatch', { style: { '--swatch': column.color, margin: 0 } }),
      column.name),
    h('span.col__count', column.tasks.length),
    h('button.icon-btn', {
      type: 'button', 'aria-label': `Add task to ${column.name}`,
      onClick: () => startInlineAdd(list, project, column),
    }, icon('plus', { size: 15 })),
    column.kind === 'group' && column.group
      ? h('button.icon-btn', {
        type: 'button', 'aria-label': `Options for ${column.name}`,
        onClick: (event) => openColumnMenu(event.currentTarget, project, column),
      }, icon('more', { size: 15 }))
      : null);

  const foot = h('div.col__foot',
    h('button.col__add', {
      type: 'button',
      onClick: () => startInlineAdd(list, project, column),
    }, icon('plus', { size: 14 }), 'Add task'));

  return h('div.col', { dataset: { columnId: column.id, columnKind: column.kind } }, head, list, foot);
}

function openColumnMenu(anchor, project, column) {
  showMenu(anchor, {
    align: 'end',
    items: [
      {
        id: 'rename',
        label: 'Rename list',
        icon: 'edit',
        onSelect: async () => {
          const name = await promptDialog({ title: 'Rename list', label: 'Name', value: column.name });
          if (name) store.update('groups', column.id, { name });
        },
      },
      {
        id: 'add',
        label: 'Add task',
        icon: 'plus',
        onSelect: () => {
          const list = document.querySelector(`.col__list[data-column-id="${column.id}"]`);
          if (list) startInlineAdd(list, project, column);
        },
      },
      { separator: true },
      {
        id: 'delete',
        label: 'Delete list',
        icon: 'trash',
        danger: true,
        onSelect: async () => {
          const count = column.tasks.length;
          const ok = await confirmDialog({
            title: `Delete "${column.name}"?`,
            message: count
              ? `${count} task${count === 1 ? '' : 's'} will be moved out of this list but kept in the project.`
              : 'This list is empty and will be removed.',
            confirmLabel: 'Delete list',
            danger: true,
          });
          if (ok) api.deleteGroup(column.id);
        },
      },
    ],
  });
}

/* -- inline add ----------------------------------------------------------- */

function startInlineAdd(list, project, column) {
  const existing = list.querySelector('.inline-add');
  if (existing) { existing.querySelector('textarea').focus(); return; }

  const input = h('textarea.textarea', {
    placeholder: 'Task name…',
    rows: 2,
    style: { fontSize: '13px', minHeight: '58px', margin: '0' },
  });

  const commit = (keepOpen) => {
    const title = input.value.trim();
    if (!title) { wrap.remove(); return; }
    api.createTask(project.id, {
      title,
      status: column.kind === 'status' ? column.id : 'todo',
      groupId: column.kind === 'group' && column.id !== '__none' ? column.id : null,
      order: (column.tasks[column.tasks.length - 1]?.order ?? 0) + 1,
    });
    if (keepOpen) {
      input.value = '';
      requestAnimationFrame(() => {
        const fresh = document.querySelector(`.col__list[data-column-id="${column.id}"]`);
        if (fresh) startInlineAdd(fresh, project, { ...column, tasks: [] });
      });
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit(true);
    } else if (event.key === 'Escape') {
      wrap.remove();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) commit(false);
    else wrap.remove();
  });

  const wrap = h('div.inline-add', { style: { padding: '1px' } }, input);
  list.appendChild(wrap);
  input.focus();
  wrap.scrollIntoView({ block: 'nearest' });
}

/* -- card ----------------------------------------------------------------- */

function taskCard(task, project) {
  const done = isDoneStatus(task.status);
  const assignees = task.assigneeIds.length
    ? avatarStack(task.assigneeIds, { size: 'xs', onSurface2: false })
    : null;

  const card = h('div.tcard', {
    dataset: { taskId: task.id },
    class: done ? 'is-done' : '',
    tabindex: '0',
    role: 'button',
    'aria-label': task.title,
  });

  card.appendChild(h('div.tcard__top',
    h('span.tcard__title', task.title),
    h('span.tcard__key', `${project.key}-${task.number}`)));

  const labels = labelChips(task.labels, { max: 3 });
  if (labels) card.appendChild(labels);

  const meter = progressMeter(task);
  if (meter && !done) card.appendChild(h('div.tcard__bar', meter));

  const foot = h('div.tcard__foot');
  if (state.groupBy === 'status') {
    if (task.priority !== 'none') foot.appendChild(priorityMark(task.priority));
  } else {
    foot.appendChild(h('span.status-pill', { style: { '--pill-color': statusOf(task.status).color } },
      h('span.dot'), statusOf(task.status).name));
  }

  const due = dueChip(task);
  if (due) foot.appendChild(due);

  if (task.checklist?.length) {
    const complete = task.checklist.filter((item) => item.done).length;
    foot.appendChild(h('span.tcard__stat',
      icon('checkSquare', { size: 12 }),
      `${complete}/${task.checklist.length}`));
  }

  const commentCount = store.where('comments', 'taskId', task.id).length;
  if (commentCount) {
    foot.appendChild(h('span.tcard__stat', icon('message', { size: 12 }), String(commentCount)));
  }

  if (task.dependsOn?.length) {
    const late = api.violatedDependencies(task).length;
    foot.appendChild(h('span.tcard__stat', {
      class: late ? 'tcard__stat--overdue' : '',
      title: late ? 'Starts before a dependency finishes' : 'Has dependencies',
    }, icon('link', { size: 12 }), String(task.dependsOn.length)));
  }

  if (assignees) {
    foot.appendChild(h('span', { style: { marginLeft: 'auto' } }, assignees));
  }

  card.appendChild(foot);

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTaskPanel(task.id);
    }
  });

  return card;
}

/* -- drag and drop -------------------------------------------------------- */

function installDragAndDrop(board, project) {
  let drag = null;

  board.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const card = event.target.closest('.tcard');
    if (!card || event.target.closest('button, a, input, textarea')) return;

    const rect = card.getBoundingClientRect();
    drag = {
      card,
      taskId: card.dataset.taskId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      active: false,
      ghost: null,
      placeholder: null,
      pointerId: event.pointerId,
      moved: false,
    };
    card.setPointerCapture?.(event.pointerId);
  });

  board.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 5) return;
      beginDrag(drag);
    }
    drag.moved = true;
    event.preventDefault();

    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;

    positionPlaceholder(board, drag, event.clientX, event.clientY);
  });

  const finish = (event) => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const current = drag;
    drag = null;

    if (!current.active) {
      // A plain click — open the task.
      if (!current.moved) openTaskPanel(current.taskId);
      return;
    }

    current.ghost.remove();
    current.card.classList.remove('is-source');
    document.body.style.userSelect = '';

    const placeholder = current.placeholder;
    const targetList = placeholder?.parentElement;

    if (targetList) {
      const columnId = targetList.dataset.columnId;
      const columnKind = targetList.dataset.columnKind;
      const siblings = Array.from(targetList.children)
        .filter((el) => el.classList.contains('tcard') && el !== current.card);
      const index = Array.from(targetList.children).indexOf(placeholder);
      const after = siblings.filter((el) =>
        Array.from(targetList.children).indexOf(el) < index).pop();
      const before = siblings.find((el) =>
        Array.from(targetList.children).indexOf(el) > index);

      const move = { beforeId: before?.dataset.taskId || null, afterId: after?.dataset.taskId || null };
      if (columnKind === 'status') move.status = columnId;
      else move.groupId = columnId === '__none' ? null : columnId;

      api.moveTask(current.taskId, move);
    }

    placeholder?.remove();
    resumeRender();
  };

  board.addEventListener('pointerup', finish);
  board.addEventListener('pointercancel', finish);

  function beginDrag(current) {
    current.active = true;
    suspendRender();
    document.body.style.userSelect = 'none';

    const ghost = current.card.cloneNode(true);
    ghost.classList.add('is-ghost');
    ghost.style.width = `${current.width}px`;
    document.body.appendChild(ghost);
    current.ghost = ghost;

    current.card.classList.add('is-source');

    const placeholder = h('div.drop-line');
    placeholder.style.height = '2px';
    current.placeholder = placeholder;
    current.card.parentElement.insertBefore(placeholder, current.card.nextSibling);
  }
}

function positionPlaceholder(board, drag, x, y) {
  const lists = Array.from(board.querySelectorAll('.col__list'));
  let targetList = null;

  for (const list of lists) {
    const rect = list.parentElement.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right) { targetList = list; break; }
  }
  if (!targetList) return;

  board.querySelectorAll('.col').forEach((col) => col.classList.remove('is-drop-target'));
  targetList.parentElement.classList.add('is-drop-target');

  const cards = Array.from(targetList.querySelectorAll('.tcard'))
    .filter((card) => card !== drag.card);

  let next = null;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) { next = card; break; }
  }

  if (next) targetList.insertBefore(drag.placeholder, next);
  else targetList.appendChild(drag.placeholder);
}
