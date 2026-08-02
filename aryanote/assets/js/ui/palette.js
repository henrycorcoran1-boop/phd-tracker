/* ==========================================================================
   Command palette (⌘K): search tasks, projects, docs and people, and run
   the commands that would otherwise need a trip through the menus.
   ========================================================================== */

import { h, mount, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { statusOf, isDoneStatus, taskRef } from '../data/schema.js';
import { state, setPref, setFilters } from '../app/state.js';
import { navigate } from '../app/router.js';
import { openTaskPanel } from './taskpanel.js';
import { avatar } from './bits.js';

let scrim = null;
let onKeyDown = null;

export function isPaletteOpen() { return Boolean(scrim); }

export function closePalette() {
  if (!scrim) return;
  scrim.remove();
  scrim = null;
  document.removeEventListener('keydown', onKeyDown, true);
}

export function openPalette(initialQuery = '') {
  if (scrim) { closePalette(); return; }

  const input = h('input.palette__input', {
    type: 'text',
    placeholder: 'Search tasks, projects and docs, or run a command…',
    value: initialQuery,
    'aria-label': 'Search',
  });
  const list = h('div.palette__list');

  let results = [];
  let focusIndex = 0;

  const render = () => {
    results = search(input.value.trim());
    focusIndex = Math.min(focusIndex, Math.max(0, results.filter((r) => !r.group).length - 1));
    clear(list);

    if (!results.length) {
      list.appendChild(h('div.menu__empty', { style: { padding: '18px', textAlign: 'center' } },
        'Nothing matches that.'));
      return;
    }

    let selectableIndex = -1;
    results.forEach((result) => {
      if (result.group) {
        list.appendChild(h('div.palette__group', result.group));
        return;
      }
      selectableIndex += 1;
      const index = selectableIndex;
      const row = h('button.palette__item', {
        type: 'button',
        class: index === focusIndex ? 'is-focus' : '',
        onMouseEnter: () => { focusIndex = index; paintFocus(); },
        onClick: () => run(result),
      });
      if (result.node) row.appendChild(result.node);
      else row.appendChild(icon(result.icon || 'circle', { size: 15, cls: 'palette__icon' }));
      row.appendChild(h('span.u-truncate.u-grow', result.label));
      if (result.hint) row.appendChild(h('span.u-muted.u-truncate', { style: { flex: 'none', maxWidth: '160px' } }, result.hint));
      list.appendChild(row);
    });
  };

  const paintFocus = () => {
    const rows = Array.from(list.querySelectorAll('.palette__item'));
    rows.forEach((row, index) => row.classList.toggle('is-focus', index === focusIndex));
    rows[focusIndex]?.scrollIntoView({ block: 'nearest' });
  };

  const selectable = () => results.filter((r) => !r.group);

  const run = (result) => {
    closePalette();
    result.action?.();
  };

  input.addEventListener('input', () => { focusIndex = 0; render(); });
  input.addEventListener('keydown', (event) => {
    const items = selectable();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusIndex = (focusIndex + 1) % Math.max(1, items.length);
      paintFocus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusIndex = (focusIndex - 1 + items.length) % Math.max(1, items.length);
      paintFocus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = items[focusIndex];
      if (target) run(target);
    }
  });

  const palette = h('div.palette', input, list,
    h('div.palette__foot',
      h('span', h('span.kbd', '↑'), h('span.kbd', { style: { marginLeft: '3px' } }, '↓'), ' navigate'),
      h('span', h('span.kbd', '↵'), ' open'),
      h('span', h('span.kbd', 'esc'), ' close')));

  scrim = h('div.palette-scrim', {
    onPointerDown: (event) => { if (event.target === scrim) closePalette(); },
  }, palette);

  onKeyDown = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closePalette(); }
  };

  document.body.appendChild(scrim);
  document.addEventListener('keydown', onKeyDown, true);
  render();
  input.focus();
}

/* -- search --------------------------------------------------------------- */

function search(query) {
  const q = query.toLowerCase();
  const workspaceId = state.workspaceId;
  if (!workspaceId) return [];

  const results = [];
  const commands = buildCommands();

  if (!q) {
    results.push({ group: 'Jump to' });
    results.push(...navTargets().slice(0, 5));
    results.push({ group: 'Commands' });
    results.push(...commands.slice(0, 6));
    results.push({ group: 'Recent tasks' });
    results.push(...recentTasks().slice(0, 5));
    return results;
  }

  const matched = (text) => text.toLowerCase().includes(q);

  const tasks = api.tasksOfWorkspace(workspaceId)
    .filter((task) => {
      const project = store.get('projects', task.projectId);
      return matched(task.title)
        || matched(task.description || '')
        || (project && matched(taskRef(project, task)));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);

  const projects = api.projectsOf(workspaceId).filter((project) => matched(project.name));
  const docs = api.docsOf(workspaceId).filter((doc) => matched(doc.title) || matched(doc.body));
  const people = api.usersOf(workspaceId).filter((user) => matched(user.name) || matched(user.email));
  const matchingCommands = commands.filter((command) => matched(command.label));

  if (matchingCommands.length) {
    results.push({ group: 'Commands' });
    results.push(...matchingCommands);
  }
  if (tasks.length) {
    results.push({ group: 'Tasks' });
    results.push(...tasks.map(taskResult));
  }
  if (projects.length) {
    results.push({ group: 'Projects' });
    results.push(...projects.map((project) => ({
      label: project.name,
      node: h('span.dot', { style: { background: project.color, width: '9px', height: '9px' } }),
      hint: `${api.projectStats(project.id).total} tasks`,
      action: () => navigate(`/w/${workspaceId}/p/${project.id}/board`),
    })));
  }
  if (docs.length) {
    results.push({ group: 'Docs' });
    results.push(...docs.map((doc) => ({
      label: doc.title,
      icon: 'doc',
      action: () => navigate(`/w/${workspaceId}/docs`, { query: { doc: doc.id } }),
    })));
  }
  if (people.length) {
    results.push({ group: 'People' });
    results.push(...people.map((user) => ({
      label: user.name,
      node: avatar(user, 'xs'),
      hint: user.email,
      action: () => {
        setFilters({ assignee: [user.id] });
        navigate(`/w/${workspaceId}/people`);
      },
    })));
  }

  return results;
}

function taskResult(task) {
  const project = store.get('projects', task.projectId);
  return {
    label: task.title,
    node: h('span.dot', {
      style: {
        background: statusOf(task.status).color,
        width: '8px', height: '8px',
        opacity: isDoneStatus(task.status) ? '0.5' : '1',
      },
    }),
    hint: project ? `${project.name} · ${taskRef(project, task)}` : '',
    action: () => {
      if (project) navigate(`/w/${project.workspaceId}/p/${project.id}/board`);
      requestAnimationFrame(() => openTaskPanel(task.id));
    },
  };
}

function recentTasks() {
  return api.tasksOfWorkspace(state.workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6)
    .map(taskResult);
}

function navTargets() {
  const workspaceId = state.workspaceId;
  const base = [
    { label: 'Home', icon: 'home', action: () => navigate(`/w/${workspaceId}/home`) },
    { label: 'My work', icon: 'inbox', action: () => navigate(`/w/${workspaceId}/my-work`) },
    { label: 'Docs', icon: 'doc', action: () => navigate(`/w/${workspaceId}/docs`) },
    { label: 'People', icon: 'people', action: () => navigate(`/w/${workspaceId}/people`) },
    { label: 'Settings', icon: 'settings', action: () => navigate(`/w/${workspaceId}/settings`) },
  ];
  const projects = api.projectsOf(workspaceId).map((project) => ({
    label: project.name,
    node: h('span.dot', { style: { background: project.color, width: '9px', height: '9px' } }),
    hint: 'Project',
    action: () => navigate(`/w/${workspaceId}/p/${project.id}/board`),
  }));
  return [...base, ...projects];
}

function buildCommands() {
  const workspaceId = state.workspaceId;
  const projectId = state.projectId;

  const commands = [
    {
      label: 'New task',
      icon: 'plus',
      hint: 'C',
      action: () => import('../app/shell.js').then((m) => m.quickCreateTask()),
    },
    {
      label: 'New project',
      icon: 'folder',
      action: () => import('../app/shell.js').then((m) => m.openNewProject()),
    },
    {
      label: 'New doc',
      icon: 'doc',
      action: () => {
        const doc = api.createDoc(workspaceId, { projectId: null, title: 'Untitled' });
        navigate(`/w/${workspaceId}/docs`, { query: { doc: doc.id } });
      },
    },
    {
      label: `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} theme`,
      icon: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon',
      action: () => setPref('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
    },
    {
      label: state.prefs.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar',
      icon: 'sidebar',
      action: () => setPref('sidebarCollapsed', !state.prefs.sidebarCollapsed),
    },
    {
      label: 'Invite a teammate',
      icon: 'userPlus',
      action: () => navigate(`/w/${workspaceId}/people`, { query: { invite: '1' } }),
    },
  ];

  if (projectId) {
    ['board', 'table', 'timeline', 'calendar'].forEach((view) => {
      commands.push({
        label: `Open ${view} view`,
        icon: view === 'doc' ? 'doc' : view,
        action: () => navigate(`/w/${workspaceId}/p/${projectId}/${view}`),
      });
    });
  }

  return commands;
}
