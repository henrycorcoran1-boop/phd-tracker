/* ==========================================================================
   Shared render pieces and field pickers used across every view.
   ========================================================================== */

import { h, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { showMenu, closeMenu, attachTip } from './overlay.js';
import store from '../data/store.js';
import {
  STATUSES, statusOf, PRIORITIES, priorityOf, initialsOf, isDoneStatus,
  LABEL_SUGGESTIONS, taskProgress,
} from '../data/schema.js';
import * as api from '../data/api.js';
import {
  formatDue, dueTone, formatDate, todayKey, key as dateKey, toDate, today,
  addDays, addMonths, startOfMonth, dayNamesShort, monthNames, isSameDay, diffDays,
} from '../lib/date.js';

/* -- people --------------------------------------------------------------- */

export function avatar(user, size = 'sm') {
  if (!user) return h(`span.avatar.avatar--${size}`, { style: { background: 'var(--paper-400)' } }, '?');
  const el = h(`span.avatar.avatar--${size}`, {
    style: { background: user.color },
    class: user.pending ? 'avatar--pending' : '',
    title: user.name,
  }, initialsOf(user.name));
  return el;
}

export function avatarStack(userIds, { size = 'sm', max = 3, onSurface2 = false } = {}) {
  const users = userIds.map((id) => store.get('users', id)).filter(Boolean);
  const stack = h('span.avatar-stack', { class: onSurface2 ? 'avatar-stack--on-2' : '' });
  users.slice(0, max).forEach((user) => stack.appendChild(avatar(user, size)));
  if (users.length > max) {
    stack.appendChild(h(`span.avatar.avatar--${size}`, {
      style: { background: 'var(--paper-500)' },
      title: users.slice(max).map((u) => u.name).join(', '),
    }, `+${users.length - max}`));
  }
  return stack;
}

/* -- status & priority ---------------------------------------------------- */

export function statusPill(statusId, { compact = false } = {}) {
  const status = statusOf(statusId);
  return h('span.status-pill', { style: { '--pill-color': status.color } },
    h('span.dot', { class: status.hollow ? 'dot--hollow' : '' }),
    compact ? null : status.name);
}

export function statusDot(statusId, size = 8) {
  const status = statusOf(statusId);
  return h('span.dot', {
    class: status.hollow ? 'dot--hollow' : '',
    style: {
      '--pill-color': status.color,
      background: status.color,
      width: `${size}px`,
      height: `${size}px`,
    },
    title: status.name,
  });
}

export function priorityMark(priorityId) {
  const priority = priorityOf(priorityId);
  if (priority.id === 'none') {
    return h('span.pri-mark', { 'data-level': 0, style: { color: 'var(--text-4)' }, title: 'No priority' },
      h('i'), h('i'), h('i'));
  }
  const el = h('span.pri-mark', {
    'data-level': priority.level,
    style: { color: priority.color },
    title: `${priority.name} priority`,
  }, h('i'), h('i'), h('i'));
  return el;
}

/* -- dates ---------------------------------------------------------------- */

export function dueChip(task, { icon: withIcon = true } = {}) {
  if (!task.dueDate) return null;
  const tone = dueTone(task.dueDate, isDoneStatus(task.status));
  const el = h('span.tcard__stat', {
    class: tone ? `tcard__stat--${tone}` : '',
    title: `Due ${formatDate(task.dueDate, { withYear: true })}`,
  });
  if (withIcon) el.appendChild(icon(tone === 'overdue' ? 'alert' : 'clock', { size: 12 }));
  el.appendChild(h('span', formatDue(task.dueDate)));
  return el;
}

/* -- labels --------------------------------------------------------------- */

export function labelChips(labels = [], { max = 3 } = {}) {
  if (!labels.length) return null;
  const wrap = h('span.tcard__labels');
  labels.slice(0, max).forEach((label) => wrap.appendChild(h('span.label-chip', label)));
  if (labels.length > max) wrap.appendChild(h('span.label-chip', `+${labels.length - max}`));
  return wrap;
}

/* -- pickers -------------------------------------------------------------- */

export function openStatusPicker(anchor, task) {
  showMenu(anchor, {
    items: STATUSES.map((status) => ({
      id: status.id,
      label: status.name,
      swatch: status.color,
      selected: status.id === task.status,
      onSelect: () => api.updateTask(task.id, { status: status.id }),
    })),
  });
}

export function openPriorityPicker(anchor, task) {
  showMenu(anchor, {
    items: PRIORITIES.map((priority) => ({
      id: priority.id,
      label: priority.name,
      node: priorityMark(priority.id),
      selected: priority.id === task.priority,
      onSelect: () => api.updateTask(task.id, { priority: priority.id }),
    })),
  });
}

export function openAssigneePicker(anchor, task, workspaceId) {
  const build = () => {
    const current = store.get('tasks', task.id) || task;
    const users = api.usersOf(workspaceId);
    return users.map((user) => ({
      id: user.id,
      label: user.name,
      hint: user.pending ? 'invited' : '',
      node: avatar(user, 'xs'),
      selected: current.assigneeIds.includes(user.id),
      onSelect: () => api.toggleAssignee(task.id, user.id),
    }));
  };

  showMenu(anchor, {
    items: build(),
    search: true,
    searchPlaceholder: 'Assign to…',
    multi: true,
    rebuild: build,
    emptyText: 'No matching people',
  });
}

export function openLabelPicker(anchor, task, workspaceId) {
  const build = () => {
    const current = store.get('tasks', task.id) || task;
    const known = new Set([...api.labelsOf(workspaceId), ...LABEL_SUGGESTIONS, ...current.labels]);
    return Array.from(known).sort().map((label) => ({
      id: label,
      label,
      selected: current.labels.includes(label),
      onSelect: () => {
        const now = store.get('tasks', task.id);
        const labels = now.labels.includes(label)
          ? now.labels.filter((l) => l !== label)
          : [...now.labels, label];
        api.updateTask(task.id, { labels }, { verb: false });
      },
    }));
  };

  const input = h('input.input', { placeholder: 'New label…', style: { height: '28px', minHeight: '28px' } });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = input.value.trim().toLowerCase();
    if (!value) return;
    const now = store.get('tasks', task.id);
    if (!now.labels.includes(value)) {
      api.updateTask(task.id, { labels: [...now.labels, value] }, { verb: false });
    }
    closeMenu();
  });

  showMenu(anchor, {
    items: build(),
    search: true,
    searchPlaceholder: 'Filter labels…',
    multi: true,
    rebuild: build,
    footer: h('div', { style: { padding: '6px', borderTop: '1px solid var(--border-soft)' } }, input),
  });
}

/* -- date picker ---------------------------------------------------------- */

/**
 * openDatePicker(anchor, { value, onPick(dateKeyOrNull), min, allowClear })
 */
export function openDatePicker(anchor, { value = null, onPick, min = null, allowClear = true, title = null }) {
  let cursor = startOfMonth(value || today());

  const wrap = h('div', { style: { width: '244px' } });

  const render = () => {
    clear(wrap);

    if (title) wrap.appendChild(h('div.menu__label', title));

    const head = h('div.u-row', { style: { justifyContent: 'space-between', padding: '2px 4px 6px' } },
      h('button.icon-btn', {
        type: 'button', 'aria-label': 'Previous month',
        onClick: (e) => { e.stopPropagation(); cursor = addMonths(cursor, -1); render(); },
      }, icon('chevronLeft', { size: 15 })),
      h('span', { style: { fontSize: '13px', fontWeight: '600' } },
        `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`),
      h('button.icon-btn', {
        type: 'button', 'aria-label': 'Next month',
        onClick: (e) => { e.stopPropagation(); cursor = addMonths(cursor, 1); render(); },
      }, icon('chevronRight', { size: 15 })));
    wrap.appendChild(head);

    const grid = h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' },
    });
    dayNamesShort.slice(1).concat(dayNamesShort[0]).forEach((day) => {
      grid.appendChild(h('div', {
        style: {
          fontSize: '10px', fontWeight: '600', color: 'var(--text-4)',
          textAlign: 'center', padding: '2px 0', textTransform: 'uppercase',
        },
      }, day[0]));
    });

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(first, -offset);
    const selected = value ? toDate(value) : null;
    const minDate = min ? toDate(min) : null;

    for (let i = 0; i < 42; i += 1) {
      const day = addDays(start, i);
      const outside = day.getMonth() !== cursor.getMonth();
      const disabled = minDate && day < minDate;
      const isToday = isSameDay(day, today());
      const isSelected = selected && isSameDay(day, selected);

      grid.appendChild(h('button', {
        type: 'button',
        disabled,
        style: {
          height: '28px', borderRadius: '5px', fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          color: isSelected ? '#fff' : outside ? 'var(--text-4)' : 'var(--text)',
          background: isSelected ? 'var(--accent)' : 'transparent',
          fontWeight: isSelected || isToday ? '650' : '450',
          opacity: disabled ? '0.35' : '1',
          boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--accent-border)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        },
        onPointerEnter: (e) => { if (!isSelected && !disabled) e.currentTarget.style.background = 'var(--surface-hover)'; },
        onPointerLeave: (e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; },
        onClick: (e) => { e.stopPropagation(); onPick(dateKey(day)); closeMenu(); },
      }, day.getDate()));
    }
    wrap.appendChild(grid);

    const quick = h('div', {
      style: {
        display: 'flex', gap: '4px', flexWrap: 'wrap',
        marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-soft)',
      },
    });
    const shortcuts = [
      ['Today', 0], ['Tomorrow', 1], ['+1 week', 7], ['+2 weeks', 14],
    ];
    shortcuts.forEach(([label, offsetDays]) => {
      quick.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        onClick: (e) => { e.stopPropagation(); onPick(dateKey(addDays(today(), offsetDays))); closeMenu(); },
      }, label));
    });
    if (allowClear && value) {
      quick.appendChild(h('button.btn.btn--sm.btn--danger', {
        type: 'button',
        onClick: (e) => { e.stopPropagation(); onPick(null); closeMenu(); },
      }, 'Clear'));
    }
    wrap.appendChild(quick);
  };

  render();

  showMenu(anchor, { items: [], width: 258, footer: wrap, emptyText: '' });
  // The calendar lives in the footer slot; drop the empty list placeholder.
  const menu = document.querySelector('.menu .menu__list');
  if (menu) menu.remove();
}

/* -- project picker ------------------------------------------------------- */

export function openProjectPicker(anchor, workspaceId, { selectedId = null, onPick }) {
  showMenu(anchor, {
    search: true,
    searchPlaceholder: 'Find a project…',
    items: api.projectsOf(workspaceId).map((project) => ({
      id: project.id,
      label: project.name,
      swatch: project.color,
      selected: project.id === selectedId,
      onSelect: () => onPick(project),
    })),
  });
}

/* -- misc ----------------------------------------------------------------- */

export function progressMeter(task) {
  const percent = taskProgress(task);
  if (!percent) return null;
  return h('div.meter', { title: `${percent}% complete` },
    h('div.meter__fill', {
      style: {
        width: `${percent}%`,
        background: percent === 100 ? 'var(--st-done)' : 'var(--accent)',
      },
    }));
}

export function emptyState({ icon: iconName = 'layers', title, text, action = null }) {
  return h('div.empty',
    h('div.empty__icon', icon(iconName, { size: 20 })),
    h('div.empty__title', title),
    text ? h('div.empty__text', text) : null,
    action);
}

export function sectionCard(title, { count = null, action = null, body }) {
  return h('div.card',
    h('div.card__head',
      h('span.card__title', title),
      count !== null ? h('span.section__count', count) : null,
      action ? h('div', { style: { marginLeft: 'auto' } }, action) : null),
    body);
}

/** Compact "3 of 8" style counter used in headers. */
export function ratio(done, total) {
  return h('span.u-muted.u-nums', { style: { fontSize: '12px' } }, `${done}/${total}`);
}

export { attachTip };
