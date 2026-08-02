/* ==========================================================================
   Application shell: sidebar, topbar, view chrome and the re-render loop.
   ========================================================================== */

import { h, mount, clear, $, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import * as auth from '../data/auth.js';
import { PROJECT_COLORS, STATUSES, PRIORITIES, initialsOf, isDoneStatus } from '../data/schema.js';
import {
  state, setState, setPref, setFilters, clearFilters, toggleFilter,
  activeFilterCount, currentWorkspace, currentProject, rememberProject, currentRole,
} from './state.js';
import { navigate, currentQuery } from './router.js';
import { showMenu, showModal, closeMenu, confirmDialog, promptDialog, toast, attachTip } from '../ui/overlay.js';
import { avatar, statusDot, priorityMark } from '../ui/bits.js';
import { openTaskPanel, closeTaskPanel, isPanelOpen } from '../ui/taskpanel.js';
import { openPalette } from '../ui/palette.js';
import { renderHome } from '../views/home.js';
import { renderMyWork } from '../views/mywork.js';
import { renderBoard } from '../views/board.js';
import { renderTable } from '../views/table.js';
import { renderGantt } from '../views/gantt.js';
import { renderCalendar } from '../views/calendar.js';
import { renderPeople } from '../views/people.js';
import { renderDocs } from '../views/docs.js';
import { renderSettings } from '../views/settings.js';

let root = null;
let els = null;
let context = { view: 'home', projectId: null };
let renderQueued = false;
let suspended = 0;

/** Pause re-rendering during drags so the DOM under the pointer stays put. */
export function suspendRender() { suspended += 1; }
export function resumeRender({ rerender = true } = {}) {
  suspended = Math.max(0, suspended - 1);
  if (suspended === 0 && rerender) scheduleRender();
}

export function scheduleRender() {
  if (renderQueued || suspended > 0) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (suspended > 0) return;
    paint();
  });
}

/* -- entry ---------------------------------------------------------------- */

export function renderShell(container, ctx) {
  root = container;
  context = { ...context, ...ctx };

  if (!els || !root.contains(els.shell)) buildSkeleton();
  paint();
}

function buildSkeleton() {
  const sidebar = h('aside.sidebar');
  const main = h('main.main');
  const shell = h('div.shell', sidebar, main);
  els = { shell, sidebar, main };
  mount(root, shell);
}

function paint() {
  if (!els) return;
  const workspace = currentWorkspace();
  if (!workspace) return;

  els.shell.classList.toggle('is-collapsed', Boolean(state.prefs.sidebarCollapsed));
  els.shell.classList.toggle('is-nav-open', Boolean(state.navOpen));

  renderSidebar();
  renderMain();
}

/* -- sidebar -------------------------------------------------------------- */

function renderSidebar() {
  const workspace = currentWorkspace();
  const projects = api.projectsOf(workspace.id);
  const myOpen = api.myTasks(workspace.id, state.user.id).filter((t) => !isDoneStatus(t.status)).length;

  const head = h('div.sidebar__head',
    h('button.ws-switch', { type: 'button', onClick: (e) => openWorkspaceMenu(e.currentTarget) },
      h('span.ws-switch__mark', initialsOf(workspace.name).slice(0, 1)),
      h('span.ws-switch__name.u-grow', workspace.name),
      icon('chevronsUpDown', { size: 13, cls: 'ws-switch__caret' })),
    h('button.icon-btn', {
      type: 'button', title: 'Collapse sidebar', 'aria-label': 'Collapse sidebar',
      onClick: () => setPref('sidebarCollapsed', true),
    }, icon('sidebar', { size: 16 })));

  const main = h('div.nav-section',
    navLink('home', 'Home', `/w/${workspace.id}/home`, context.view === 'home'),
    navLink('inbox', 'My work', `/w/${workspace.id}/my-work`, context.view === 'my-work', myOpen || null),
    navLink('doc', 'Docs', `/w/${workspace.id}/docs`, context.view === 'docs' && !context.projectId),
    navLink('people', 'People', `/w/${workspace.id}/people`, context.view === 'people'));

  const projectSection = h('div.nav-section',
    h('div.nav-section__head', 'Projects',
      h('button.icon-btn', {
        type: 'button', title: 'New project', 'aria-label': 'New project',
        onClick: () => openNewProject(),
      }, icon('plus', { size: 14 }))));

  if (!projects.length) {
    projectSection.appendChild(h('button.nav-item', {
      type: 'button',
      style: { color: 'var(--text-4)' },
      onClick: () => openNewProject(),
    }, icon('plus', { size: 15, cls: 'nav-item__icon' }), h('span.nav-item__label', 'Create a project')));
  }

  projects.forEach((project) => {
    const active = context.projectId === project.id;
    const item = h('a.nav-item.nav-project', {
      href: `#/w/${workspace.id}/p/${project.id}/${defaultProjectView()}`,
      class: active ? 'is-active' : '',
    },
      h('span.nav-item__swatch', { style: { '--swatch': project.color } }),
      h('span.nav-item__label.u-grow', project.name),
      h('button.icon-btn.nav-item__more', {
        type: 'button', 'aria-label': `Options for ${project.name}`,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          openProjectMenu(event.currentTarget, project);
        },
      }, icon('more', { size: 14 })));
    projectSection.appendChild(item);
  });

  const scroll = h('div.sidebar__scroll', main, projectSection);

  const foot = h('div.sidebar__foot',
    h('button.user-chip', { type: 'button', onClick: (e) => openUserMenu(e.currentTarget) },
      avatar(state.user, 'md'),
      h('div.u-grow', { style: { textAlign: 'left', minWidth: 0 } },
        h('div.user-chip__name.u-truncate', state.user.name),
        h('div.user-chip__mail.u-truncate', state.user.email)),
      icon('chevronsUpDown', { size: 13, cls: 'ws-switch__caret' })));

  mount(els.sidebar, head, scroll, foot);
}

function navLink(iconName, label, href, active, count = null) {
  return h('a.nav-item', { href: `#${href}`, class: active ? 'is-active' : '' },
    icon(iconName, { size: 16, cls: 'nav-item__icon' }),
    h('span.nav-item__label.u-grow', label),
    count ? h('span.nav-item__count', count) : null);
}

function defaultProjectView() {
  return ['board', 'table', 'timeline', 'calendar', 'docs'].includes(context.view)
    ? context.view : 'board';
}

/* -- main column ---------------------------------------------------------- */

function renderMain() {
  const workspace = currentWorkspace();
  const project = currentProject();

  const crumbs = h('div.topbar__crumbs.u-grow');
  if (state.prefs.sidebarCollapsed) {
    crumbs.appendChild(h('button.icon-btn', {
      type: 'button', title: 'Show sidebar', 'aria-label': 'Show sidebar',
      onClick: () => setPref('sidebarCollapsed', false),
    }, icon('sidebar', { size: 16 })));
  }
  crumbs.appendChild(h('button.icon-btn.mobile-only', {
    type: 'button', 'aria-label': 'Open navigation',
    onClick: () => setState({ navOpen: !state.navOpen }),
  }, icon('menu', { size: 17 })));

  if (project) {
    crumbs.appendChild(h('span.crumb', workspace.name));
    crumbs.appendChild(h('span.crumb__sep', '/'));
    crumbs.appendChild(h('span.crumb.crumb--current.u-truncate', project.name));
  } else {
    crumbs.appendChild(h('span.crumb.crumb--current', titleForView(context.view)));
  }

  const topbar = h('div.topbar', crumbs,
    h('button.searchbtn', { type: 'button', onClick: () => openPalette() },
      icon('search', { size: 14 }),
      h('span', 'Search'),
      h('span.kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')),
    h('button.icon-btn', {
      type: 'button', title: 'Toggle theme', 'aria-label': 'Toggle theme',
      onClick: () => setPref('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
    }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', { size: 16 })),
    h('button.btn.btn--primary.btn--sm', {
      type: 'button',
      onClick: () => quickCreateTask(),
    }, icon('plus', { size: 14 }), 'New task'));

  const viewHost = h('div.view');
  const children = [topbar];

  if (project) {
    children.push(projectViewBar(workspace, project));
  }
  children.push(viewHost);

  mount(els.main, ...children);

  if (state.navOpen) {
    els.main.appendChild(h('div.nav-scrim', { onClick: () => setState({ navOpen: false }) }));
  }

  renderViewBody(viewHost, workspace, project);
}

function titleForView(view) {
  return {
    home: 'Home', 'my-work': 'My work', people: 'People',
    docs: 'Docs', settings: 'Settings',
  }[view] || 'Home';
}

function renderViewBody(host, workspace, project) {
  switch (context.view) {
    case 'home': return renderHome(host);
    case 'my-work': return renderMyWork(host);
    case 'people': return renderPeople(host);
    case 'docs': return renderDocs(host, { projectId: project?.id || null });
    case 'settings': return renderSettings(host);
    case 'board': return renderBoard(host, project);
    case 'table': return renderTable(host, project);
    case 'timeline': return renderGantt(host, project);
    case 'calendar': return renderCalendar(host, project);
    default: return renderHome(host);
  }
}

/* -- project view bar ----------------------------------------------------- */

function projectViewBar(workspace, project) {
  const tabs = [
    ['board', 'Board', 'board'],
    ['table', 'Table', 'table'],
    ['timeline', 'Gantt Chart', 'timeline'],
    ['calendar', 'Calendar', 'calendar'],
    ['docs', 'Docs', 'doc'],
  ];

  const tabRow = h('div.tabs', ...tabs.map(([id, label, iconName]) => h('a.tab', {
    href: `#/w/${workspace.id}/p/${project.id}/${id}`,
    class: context.view === id ? 'is-active' : '',
  }, icon(iconName, { size: 14, cls: 'tab__icon' }), label)));

  const search = h('input.input.view-search', {
    type: 'search',
    placeholder: 'Filter tasks',
    value: state.filters.query,
    oninput: debounce((event) => setFilters({ query: event.target.value }), 160),
  });

  const filterCount = activeFilterCount();
  if (context.view === 'timeline') {
    return h('div.viewbar', tabRow);
  }

  const toolbar = h('div.toolbar',
    search,
    h('button.filter-btn', {
      type: 'button',
      class: filterCount ? 'is-on' : '',
      onClick: (event) => openFilterMenu(event.currentTarget, workspace, project),
    },
      icon('filter', { size: 13 }),
      filterCount ? `${filterCount} filter${filterCount > 1 ? 's' : ''}` : 'Filter',
      filterCount ? h('span.filter-btn__clear', {
        onClick: (event) => { event.stopPropagation(); clearFilters(); },
      }, icon('x', { size: 12 })) : null),
    context.view === 'table' || context.view === 'board'
      ? h('button.filter-btn', {
        type: 'button',
        onClick: (event) => openSortMenu(event.currentTarget),
      }, icon('sort', { size: 13 }), sortLabel())
      : null,
    h('button.icon-btn', {
      type: 'button', title: 'Project settings', 'aria-label': 'Project settings',
      onClick: (event) => openProjectMenu(event.currentTarget, project),
    }, icon('more', { size: 16 })));

  return h('div.viewbar', tabRow, toolbar);
}

function sortLabel() {
  const names = {
    manual: 'Manual', title: 'Name', status: 'Status', priority: 'Priority',
    dueDate: 'Due date', startDate: 'Start date', created: 'Created', updated: 'Updated',
  };
  return names[state.sort.key] || 'Sort';
}

function zoomControl() {
  const levels = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']];
  return h('div.zoom', ...levels.map(([id, label]) => h('button.zoom__btn', {
    type: 'button',
    class: state.zoom === id ? 'is-active' : '',
    onClick: () => setState({ zoom: id }, 'zoom'),
  }, label)));
}

/* -- menus ---------------------------------------------------------------- */

function openFilterMenu(anchor, workspace, project) {
  const users = api.usersOf(workspace.id);
  const labels = api.labelsOf(workspace.id);

  const build = () => {
    const items = [
      { section: 'Status' },
      ...STATUSES.map((status) => ({
        id: `st:${status.id}`,
        label: status.name,
        swatch: status.color,
        selected: state.filters.status.includes(status.id),
        onSelect: () => toggleFilter('status', status.id),
      })),
      { separator: true },
      { section: 'Priority' },
      ...PRIORITIES.filter((p) => p.id !== 'none').map((priority) => ({
        id: `pr:${priority.id}`,
        label: priority.name,
        node: priorityMark(priority.id),
        selected: state.filters.priority.includes(priority.id),
        onSelect: () => toggleFilter('priority', priority.id),
      })),
      { separator: true },
      { section: 'Assignee' },
      {
        id: 'as:none',
        label: 'Unassigned',
        icon: 'user',
        selected: state.filters.assignee.includes('none'),
        onSelect: () => toggleFilter('assignee', 'none'),
      },
      ...users.map((user) => ({
        id: `as:${user.id}`,
        label: user.name,
        node: avatar(user, 'xs'),
        selected: state.filters.assignee.includes(user.id),
        onSelect: () => toggleFilter('assignee', user.id),
      })),
    ];

    if (labels.length) {
      items.push({ separator: true }, { section: 'Labels' });
      labels.forEach((label) => items.push({
        id: `lb:${label}`,
        label,
        icon: 'tag',
        selected: state.filters.label.includes(label),
        onSelect: () => toggleFilter('label', label),
      }));
    }

    items.push({ separator: true }, {
      id: 'hide-done',
      label: 'Hide completed',
      icon: 'check',
      selected: state.filters.hideDone,
      onSelect: () => setFilters({ hideDone: !state.filters.hideDone }),
    });

    return items;
  };

  showMenu(anchor, { items: build(), multi: true, rebuild: build, align: 'end', width: 220 });
}

function openSortMenu(anchor) {
  const options = [
    ['manual', 'Manual order'], ['title', 'Name'], ['status', 'Status'],
    ['priority', 'Priority'], ['dueDate', 'Due date'], ['startDate', 'Start date'],
    ['created', 'Date created'], ['updated', 'Last updated'],
  ];
  showMenu(anchor, {
    align: 'end',
    items: [
      { section: 'Sort by' },
      ...options.map(([id, label]) => ({
        id,
        label,
        selected: state.sort.key === id,
        onSelect: () => setState({ sort: { ...state.sort, key: id } }, 'sort'),
      })),
      { separator: true },
      {
        id: 'dir',
        label: state.sort.direction === 'asc' ? 'Ascending' : 'Descending',
        icon: state.sort.direction === 'asc' ? 'arrowUp' : 'arrowDown',
        onSelect: () => setState({
          sort: { ...state.sort, direction: state.sort.direction === 'asc' ? 'desc' : 'asc' },
        }, 'sort'),
      },
    ],
  });
}

function openWorkspaceMenu(anchor) {
  const workspaces = api.workspacesForUser(state.user.id);
  showMenu(anchor, {
    width: 230,
    items: [
      { section: 'Workspaces' },
      ...workspaces.map((ws) => ({
        id: ws.id,
        label: ws.name,
        selected: ws.id === state.workspaceId,
        onSelect: () => navigate(`/w/${ws.id}/home`),
      })),
      { separator: true },
      { id: 'new', label: 'New workspace', icon: 'plus', onSelect: () => openNewWorkspace() },
      { id: 'people', label: 'Members', icon: 'people', onSelect: () => navigate(`/w/${state.workspaceId}/people`) },
      { id: 'settings', label: 'Workspace settings', icon: 'settings', onSelect: () => navigate(`/w/${state.workspaceId}/settings`) },
    ],
  });
}

function openUserMenu(anchor) {
  showMenu(anchor, {
    side: 'top',
    width: 210,
    items: [
      { id: 'profile', label: 'Profile & settings', icon: 'user', onSelect: () => navigate(`/w/${state.workspaceId}/settings`) },
      {
        id: 'theme',
        label: 'Appearance',
        icon: 'moon',
        hint: state.prefs.theme,
        onSelect: () => showMenu(anchor, {
          side: 'top',
          items: ['system', 'light', 'dark'].map((choice) => ({
            id: choice,
            label: choice[0].toUpperCase() + choice.slice(1),
            selected: state.prefs.theme === choice,
            onSelect: () => setPref('theme', choice),
          })),
        }),
      },
      { separator: true },
      {
        id: 'signout',
        label: 'Sign out',
        icon: 'logout',
        danger: true,
        onSelect: async () => {
          await store.flush();
          await auth.logout();
          setState({ user: null, workspaceId: null, projectId: null }, 'signout');
          navigate('/login', { replace: true });
        },
      },
    ],
  });
}

function openProjectMenu(anchor, project) {
  const role = currentRole();
  showMenu(anchor, {
    align: 'end',
    items: [
      {
        id: 'rename',
        label: 'Rename project',
        icon: 'edit',
        onSelect: async () => {
          const name = await promptDialog({
            title: 'Rename project', label: 'Project name', value: project.name,
          });
          if (name) api.updateProject(project.id, { name });
        },
      },
      {
        id: 'color',
        label: 'Change colour',
        icon: 'tag',
        onSelect: () => showMenu(anchor, {
          items: PROJECT_COLORS.map((color, i) => ({
            id: color,
            label: `Colour ${i + 1}`,
            swatch: color,
            selected: project.color === color,
            onSelect: () => api.updateProject(project.id, { color }),
          })),
        }),
      },
      {
        id: 'archive',
        label: project.archived ? 'Unarchive' : 'Archive project',
        icon: 'archive',
        onSelect: () => {
          api.updateProject(project.id, { archived: !project.archived });
          toast(project.archived ? 'Project restored' : 'Project archived');
          if (!project.archived) navigate(`/w/${state.workspaceId}/home`);
        },
      },
      { separator: true },
      {
        id: 'delete',
        label: 'Delete project',
        icon: 'trash',
        danger: true,
        disabled: role === 'guest',
        onSelect: async () => {
          const stats = api.projectStats(project.id);
          const ok = await confirmDialog({
            title: `Delete "${project.name}"?`,
            message: `This permanently removes the project and its ${stats.total} task${stats.total === 1 ? '' : 's'}. This cannot be undone.`,
            confirmLabel: 'Delete project',
            danger: true,
          });
          if (!ok) return;
          api.deleteProject(project.id);
          toast('Project deleted');
          navigate(`/w/${state.workspaceId}/home`);
        },
      },
    ],
  });
}

/* -- creation flows ------------------------------------------------------- */

export function openNewProject() {
  const nameInput = h('input.input', { placeholder: 'e.g. Website relaunch', autofocus: true });
  const descInput = h('textarea.textarea', { placeholder: 'What is this project for?', rows: 2 });
  let color = PROJECT_COLORS[api.projectsOf(state.workspaceId).length % PROJECT_COLORS.length];

  const swatches = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
    ...PROJECT_COLORS.map((option) => {
      const dot = h('button', {
        type: 'button',
        'aria-label': `Colour ${option}`,
        style: {
          width: '22px', height: '22px', borderRadius: '6px', background: option,
          boxShadow: option === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'none',
        },
        onClick: () => {
          color = option;
          Array.from(swatches.children).forEach((child) => { child.style.boxShadow = 'none'; });
          dot.style.boxShadow = '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)';
        },
      });
      return dot;
    }));

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return false; }
    const project = api.createProject(state.workspaceId, {
      name, color, description: descInput.value.trim(),
    });
    toast(`Project "${name}" created`);
    navigate(`/w/${state.workspaceId}/p/${project.id}/board`);
    return true;
  };

  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); if (submit() !== false) closeMenu(); }
  });

  showModal({
    title: 'New project',
    subtitle: 'Projects hold task lists, timelines and docs.',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div.field', h('label.field__label', 'Name'), nameInput),
      h('div.field', h('label.field__label', 'Description'), descInput),
      h('div.field', h('label.field__label', 'Colour'), swatches)),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      { label: 'Create project', variant: 'primary', onClick: submit },
    ],
  });
}

function openNewWorkspace() {
  promptDialog({
    title: 'New workspace',
    label: 'Workspace name',
    placeholder: 'e.g. Acme Corp',
    confirmLabel: 'Create workspace',
  }).then((name) => {
    if (!name) return;
    const workspace = api.createWorkspace({ name, ownerId: state.user.id });
    toast(`Workspace "${name}" created`);
    navigate(`/w/${workspace.id}/home`);
  });
}

/** New-task dialog used by the topbar button and the ⌘K palette. */
export function quickCreateTask({ projectId = null, groupId = null, status = null, dueDate = null } = {}) {
  const projects = api.projectsOf(state.workspaceId);
  if (!projects.length) {
    toast('Create a project first');
    openNewProject();
    return;
  }

  let targetProject = store.get('projects', projectId || state.projectId) || projects[0];
  const titleInput = h('input.input', { placeholder: 'What needs doing?' });

  const projectButton = h('button.btn', { type: 'button' });
  const renderProjectButton = () => {
    mount(projectButton,
      h('span.dot', { style: { background: targetProject.color } }),
      h('span', targetProject.name));
  };
  renderProjectButton();
  projectButton.addEventListener('click', () => {
    showMenu(projectButton, {
      items: projects.map((project) => ({
        id: project.id,
        label: project.name,
        swatch: project.color,
        selected: project.id === targetProject.id,
        onSelect: () => { targetProject = project; renderProjectButton(); },
      })),
    });
  });

  const submit = () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return false; }
    const groups = api.groupsOf(targetProject.id);
    const task = api.createTask(targetProject.id, {
      title,
      status: status || 'todo',
      groupId: groupId && targetProject.id === projectId ? groupId : (groups[0]?.id || null),
      dueDate,
      assigneeIds: [state.user.id],
    });
    toast('Task created', { action: 'Open', onAction: () => openTaskPanel(task.id) });
    return true;
  };

  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const keepOpen = event.shiftKey;
      if (submit() !== false) {
        if (keepOpen) { titleInput.value = ''; titleInput.focus(); }
        else document.querySelector('.modal-scrim') && closeModalSafely();
      }
    }
  });

  showModal({
    title: 'New task',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      titleInput,
      h('div.u-row.u-gap-2', projectButton,
        h('span.field__hint', 'Shift + Enter adds another'))),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      { label: 'Add task', variant: 'primary', onClick: submit },
    ],
  });
}

function closeModalSafely() {
  import('../ui/overlay.js').then((m) => m.closeModal());
}

export { context as shellContext };
