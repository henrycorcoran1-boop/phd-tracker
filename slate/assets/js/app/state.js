/* ==========================================================================
   Session and view state — the things that are not persisted records:
   who is signed in, which workspace is open, filters, sort and theme.
   ========================================================================== */

import store from '../data/store.js';

const PREFS_KEY = 'prefs';

export const state = {
  user: null,
  workspaceId: null,
  projectId: null,
  view: 'board',
  navOpen: false,
  filters: { query: '', status: [], priority: [], assignee: [], label: [], hideDone: false },
  sort: { key: 'manual', direction: 'asc' },
  groupBy: 'group',
  zoom: 'week',
  prefs: {
    theme: 'system',
    sidebarCollapsed: false,
    weekStartsOn: 1,
    showWeekends: true,
    lastWorkspaceId: null,
    lastProjectByWorkspace: {},
    collapsedGroups: {},
  },
};

const listeners = new Set();

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitStateChange(reason = '') {
  for (const fn of Array.from(listeners)) {
    try { fn(reason); } catch (err) { console.error('[slate] state listener failed', err); }
  }
}

/** Merge into state and notify. */
export function setState(patch, reason = '') {
  Object.assign(state, patch);
  emitStateChange(reason);
}

export function setFilters(patch) {
  state.filters = { ...state.filters, ...patch };
  emitStateChange('filters');
}

export function clearFilters() {
  state.filters = { query: '', status: [], priority: [], assignee: [], label: [], hideDone: false };
  emitStateChange('filters');
}

export function activeFilterCount() {
  const f = state.filters;
  return f.status.length + f.priority.length + f.assignee.length + f.label.length
    + (f.hideDone ? 1 : 0) + (f.query ? 1 : 0);
}

export function toggleFilter(kind, value) {
  const list = state.filters[kind] || [];
  state.filters = {
    ...state.filters,
    [kind]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
  };
  emitStateChange('filters');
}

/* -- preferences ---------------------------------------------------------- */

export async function loadPrefs() {
  const saved = await store.meta(PREFS_KEY);
  if (saved) state.prefs = { ...state.prefs, ...saved };
  applyTheme();
  return state.prefs;
}

export function setPref(key, value) {
  state.prefs = { ...state.prefs, [key]: value };
  store.setMeta(PREFS_KEY, state.prefs);
  if (key === 'theme') applyTheme();
  emitStateChange(`pref:${key}`);
}

export function rememberProject(workspaceId, projectId) {
  const map = { ...state.prefs.lastProjectByWorkspace, [workspaceId]: projectId };
  setPref('lastProjectByWorkspace', map);
}

export function isGroupCollapsed(groupId) {
  return Boolean(state.prefs.collapsedGroups?.[groupId]);
}

export function toggleGroupCollapsed(groupId) {
  const map = { ...(state.prefs.collapsedGroups || {}) };
  if (map[groupId]) delete map[groupId];
  else map[groupId] = true;
  setPref('collapsedGroups', map);
}

/* -- theme ---------------------------------------------------------------- */

const media = window.matchMedia?.('(prefers-color-scheme: dark)');

export function applyTheme() {
  const choice = state.prefs.theme || 'system';
  const dark = choice === 'dark' || (choice === 'system' && media?.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#14120f' : '#faf8f4');
}

media?.addEventListener?.('change', () => {
  if (state.prefs.theme === 'system') applyTheme();
});

/* -- convenience ---------------------------------------------------------- */

export const currentWorkspace = () => store.get('workspaces', state.workspaceId);
export const currentProject = () => store.get('projects', state.projectId);
export const currentRole = () => {
  if (!state.user || !state.workspaceId) return null;
  const member = store.find('members', (m) =>
    m.workspaceId === state.workspaceId && m.userId === state.user.id);
  return member?.role || null;
};
