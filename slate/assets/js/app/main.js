/* ==========================================================================
   Bootstrap: load storage, restore the session, wire routes and shortcuts.
   ========================================================================== */

import { $, h, mount } from '../lib/dom.js';
import store from '../data/store.js';
import { LocalAdapter } from '../data/adapter.js';
import * as auth from '../data/auth.js';
import * as api from '../data/api.js';
import { route, setNotFound, startRouter, navigate, currentQuery } from './router.js';
import {
  state, setState, loadPrefs, applyTheme, onStateChange, rememberProject, setFilters,
} from './state.js';
import { renderShell, scheduleRender, quickCreateTask } from './shell.js';
import { renderAuth } from '../views/auth.js';
import { openTaskPanel, closeTaskPanel, isPanelOpen, openTaskId } from '../ui/taskpanel.js';
import { openPalette, closePalette, isPaletteOpen } from '../ui/palette.js';
import { closeMenu, closeModal, toast } from '../ui/overlay.js';
import { resetTimelineScroll } from '../views/timeline.js';

const root = $('#root');

async function boot() {
  await store.init(new LocalAdapter());
  await loadPrefs();
  applyTheme();

  const user = await auth.currentUser();
  if (user) {
    state.user = user;
    api.setActor(user.id);
  }

  registerRoutes();
  wireGlobalListeners();
  startRouter();
  $('.boot')?.remove();
}

/* -- routes --------------------------------------------------------------- */

function registerRoutes() {
  route('/login', () => renderAuthRoute('login'));
  route('/signup', () => renderAuthRoute('signup'));

  route('/', () => landing());

  route('/w/:workspaceId', ({ params }) => enter(params, 'home'));
  route('/w/:workspaceId/home', ({ params }) => enter(params, 'home'));
  route('/w/:workspaceId/my-work', ({ params }) => enter(params, 'my-work'));
  route('/w/:workspaceId/people', ({ params }) => enter(params, 'people'));
  route('/w/:workspaceId/docs', ({ params }) => enter(params, 'docs'));
  route('/w/:workspaceId/settings', ({ params }) => enter(params, 'settings'));

  ['board', 'table', 'timeline', 'calendar', 'docs'].forEach((view) => {
    route(`/w/:workspaceId/p/:projectId/${view}`, ({ params }) => enter(params, view));
  });

  setNotFound(() => landing());
}

function landing() {
  if (!state.user) { navigate('/login', { replace: true }); return; }
  const workspaces = api.workspacesForUser(state.user.id);
  if (!workspaces.length) { navigate('/login', { replace: true }); return; }
  navigate(`/w/${workspaces[0].id}/home`, { replace: true });
}

function renderAuthRoute(mode) {
  if (state.user) { landing(); return; }
  closeTaskPanel();
  closePalette();
  renderAuth(root, { mode });
}

function enter(params, view) {
  if (!state.user) { navigate('/login', { replace: true }); return; }

  const workspace = store.get('workspaces', params.workspaceId);
  const isMember = workspace && store.find('members', (m) =>
    m.workspaceId === workspace.id && m.userId === state.user.id);

  if (!workspace || !isMember) {
    toast('That workspace is not available', { tone: 'error' });
    landing();
    return;
  }

  let projectId = params.projectId || null;
  if (projectId && !store.get('projects', projectId)) {
    toast('That project no longer exists', { tone: 'error' });
    navigate(`/w/${workspace.id}/home`, { replace: true });
    return;
  }

  const changedProject = projectId && projectId !== state.projectId;
  const changedWorkspace = workspace.id !== state.workspaceId;
  if (changedProject || changedWorkspace) resetTimelineScroll();
  if (changedWorkspace) setFilters({ query: '', status: [], priority: [], assignee: [], label: [] });

  state.workspaceId = workspace.id;
  state.projectId = projectId;
  state.view = view;
  state.navOpen = false;

  if (projectId) rememberProject(workspace.id, projectId);

  renderShell(root, { view, projectId, workspaceId: workspace.id });

  // Deep link straight to a task: #/w/…/board?task=tsk_123
  const { task } = currentQuery();
  if (task && task !== openTaskId()) openTaskPanel(task);
  else if (!task && isPanelOpen()) closeTaskPanel();
}

/* -- listeners ------------------------------------------------------------ */

function wireGlobalListeners() {
  store.subscribe(() => { if (state.user && state.workspaceId) scheduleRender(); });
  onStateChange(() => { if (state.user && state.workspaceId) scheduleRender(); });

  window.addEventListener('keydown', onShortcut);

  // Persist before the tab goes away so nothing is lost on close.
  window.addEventListener('beforeunload', () => { store.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
}

function onShortcut(event) {
  const target = event.target;
  const typing = target instanceof HTMLElement
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  const mod = event.metaKey || event.ctrlKey;

  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
    return;
  }

  if (mod && event.key.toLowerCase() === 'z' && !typing) {
    const label = store.undo();
    if (label) toast(`Undone — ${label}`);
    return;
  }

  if (typing || !state.user || !state.workspaceId) return;

  switch (event.key) {
    case 'c':
      event.preventDefault();
      quickCreateTask();
      break;
    case '/':
      event.preventDefault();
      document.querySelector('.view-search')?.focus();
      break;
    case '?':
      event.preventDefault();
      showShortcuts();
      break;
    case 'Escape':
      if (!isPaletteOpen() && !isPanelOpen()) {
        closeMenu();
        closeModal();
      }
      break;
    default:
      break;
  }

  // g-then-key navigation, e.g. "g h" for home.
  if (event.key === 'g') {
    const onNext = (next) => {
      window.removeEventListener('keydown', onNext, true);
      const map = {
        h: 'home', m: 'my-work', p: 'people', d: 'docs', s: 'settings',
      };
      const destination = map[next.key];
      if (destination) {
        next.preventDefault();
        navigate(`/w/${state.workspaceId}/${destination}`);
      }
    };
    window.addEventListener('keydown', onNext, true);
    setTimeout(() => window.removeEventListener('keydown', onNext, true), 1200);
  }
}

function showShortcuts() {
  import('../ui/overlay.js').then(({ showModal }) => {
    const pairs = [
      ['⌘/Ctrl K', 'Open search and commands'],
      ['C', 'Create a task'],
      ['/', 'Focus the filter box'],
      ['G then H', 'Go home'],
      ['G then M', 'Go to my work'],
      ['G then P', 'Go to people'],
      ['G then D', 'Go to docs'],
      ['⌘/Ctrl Z', 'Undo the last deletion'],
      ['Esc', 'Close panel or dialog'],
      ['?', 'This list'],
    ];
    showModal({
      title: 'Keyboard shortcuts',
      body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
        ...pairs.map(([keys, description]) => h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '7px 0', borderBottom: '1px solid var(--border-soft)',
          },
        },
          h('span', { style: { fontSize: '13px', color: 'var(--text-2)', flex: '1' } }, description),
          h('span.kbd', { style: { minWidth: 'auto', padding: '0 7px' } }, keys)))),
      actions: [{ label: 'Close', variant: 'primary', onClick: () => {} }],
    });
  });
}

/* -- go ------------------------------------------------------------------- */

boot().catch((err) => {
  console.error('[slate] failed to start', err);
  mount(root, h('div', {
    style: {
      display: 'grid', placeItems: 'center', height: '100%',
      padding: '24px', textAlign: 'center',
    },
  },
    h('div',
      h('h1', { style: { fontSize: '18px', marginBottom: '8px' } }, 'Slate could not start'),
      h('p', { style: { color: 'var(--text-3)', fontSize: '14px', maxWidth: '420px' } },
        'Something went wrong while loading your data. Opening the browser console will show the details.'),
      h('pre', {
        style: {
          marginTop: '16px', padding: '12px', background: 'var(--surface-2)',
          borderRadius: '8px', fontSize: '12px', textAlign: 'left', overflow: 'auto',
          maxWidth: '520px',
        },
      }, String(err?.stack || err)))));
});
