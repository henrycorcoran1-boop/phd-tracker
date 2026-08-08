/* ==========================================================================
   Settings — profile, appearance, workspace and data management.
   ========================================================================== */

import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import * as auth from '../data/auth.js';
import { COLLECTIONS } from '../data/schema.js';
import { state, setState, setPref, currentWorkspace, currentRole } from '../app/state.js';
import { canManage } from '../data/schema.js';
import { navigate } from '../app/router.js';
import { showModal, confirmDialog, toast, closeModal } from '../ui/overlay.js';
import { avatar } from '../ui/bits.js';
import { formatDate, formatDateTime } from '../lib/date.js';

export function renderSettings(host) {
  const workspace = currentWorkspace();
  const role = currentRole();

  const page = h('div.page',
    h('div.page__head',
      h('div.page__eyebrow', workspace.name),
      h('h1.page__title', 'Settings')),

    card('Profile', profileSection()),
    card('Appearance', appearanceSection()),
    card('Workspace', workspaceSection(workspace, role)),
    card('Your data', dataSection()));

  mount(host, h('div.view__scroll', page));
}

function card(title, body) {
  return h('div.section',
    h('div.card',
      h('div.card__head', h('span.card__title', title)),
      h('div.card__body', { style: { paddingTop: '4px', paddingBottom: '4px' } }, body)));
}

function row(name, desc, control) {
  return h('div.setting-row',
    h('div',
      h('div.setting-row__name', name),
      desc ? h('div.setting-row__desc', desc) : null),
    h('div.setting-row__control', control));
}

/* -- profile -------------------------------------------------------------- */

function profileSection() {
  const user = state.user;

  const nameInput = h('input.input', {
    value: user.name,
    style: { width: '220px' },
    onChange: (event) => {
      const value = event.target.value.trim();
      if (!value) { event.target.value = user.name; return; }
      const updated = auth.updateProfile(user.id, { name: value });
      setState({ user: updated }, 'profile');
      toast('Name updated');
    },
  });

  const titleInput = h('input.input', {
    value: user.title || '',
    placeholder: 'e.g. Product lead',
    style: { width: '220px' },
    onChange: (event) => {
      const updated = auth.updateProfile(user.id, { title: event.target.value.trim() });
      setState({ user: updated }, 'profile');
    },
  });

  return h('div',
    h('div.setting-row',
      h('div.u-row.u-gap-3',
        avatar(user, 'xl'),
        h('div',
          h('div.setting-row__name', user.name),
          h('div.setting-row__desc', user.email))),
      h('div.setting-row__control',
        h('button.btn', {
          type: 'button',
          onClick: () => openPasswordModal(),
        }, 'Change password'))),
    row('Display name', 'How your name appears on tasks and comments.', nameInput),
    row('Job title', 'Optional — shown on your profile card.', titleInput));
}

function openPasswordModal() {
  const current = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const next = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const error = h('div.field__error.u-hidden');

  const submit = async () => {
    const result = await auth.changePassword(state.user.id, {
      current: current.value,
      next: next.value,
    });
    if (result.error) {
      error.textContent = result.error;
      error.classList.remove('u-hidden');
      return false;
    }
    toast('Password changed');
    return true;
  };

  showModal({
    title: 'Change password',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div.field', h('label.field__label', 'Current password'), current),
      h('div.field', h('label.field__label', 'New password'), next,
        h('span.field__hint', 'At least 8 characters.')),
      error),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      { label: 'Update password', variant: 'primary', onClick: submit },
    ],
  });
}

/* -- appearance ----------------------------------------------------------- */

function appearanceSection() {
  const themeControl = h('div.seg', ...['system', 'light', 'dark'].map((choice) => h('button.seg__btn', {
    type: 'button',
    class: state.prefs.theme === choice ? 'is-active' : '',
    onClick: () => setPref('theme', choice),
  }, choice[0].toUpperCase() + choice.slice(1))));

  const weekendControl = h('div.seg',
    h('button.seg__btn', {
      type: 'button',
      class: state.prefs.showWeekends ? 'is-active' : '',
      onClick: () => setPref('showWeekends', true),
    }, 'Shown'),
    h('button.seg__btn', {
      type: 'button',
      class: !state.prefs.showWeekends ? 'is-active' : '',
      onClick: () => setPref('showWeekends', false),
    }, 'Hidden'));

  return h('div',
    row('Theme', 'System follows your operating system setting.', themeControl),
    row('Weekend shading', 'Shade Saturdays and Sundays on the timeline.', weekendControl));
}

/* -- workspace ------------------------------------------------------------ */

function workspaceSection(workspace, role) {
  const nameInput = h('input.input', {
    value: workspace.name,
    style: { width: '220px' },
    disabled: !canManage(role),
    onChange: (event) => {
      const value = event.target.value.trim();
      if (!value) { event.target.value = workspace.name; return; }
      store.update('workspaces', workspace.id, { name: value });
      toast('Workspace renamed');
    },
  });

  const members = api.membersOf(workspace.id);
  const projects = api.projectsOf(workspace.id, { includeArchived: true });
  const tasks = api.tasksOfWorkspace(workspace.id);

  return h('div',
    row('Workspace name', canManage(role) ? 'Visible to everyone in the workspace.' : 'Only owners and admins can rename the workspace.', nameInput),
    row('Members', `${members.length} member${members.length === 1 ? '' : 's'} · your role is ${role}.`,
      h('a.btn', { href: `#/w/${workspace.id}/people` }, 'Manage people')),
    row('Contents', `${projects.length} project${projects.length === 1 ? '' : 's'}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}, created ${formatDate(new Date(workspace.createdAt), { withYear: true })}.`,
      h('a.btn', { href: `#/w/${workspace.id}/home` }, 'Open home')));
}

/* -- data ----------------------------------------------------------------- */

function dataSection() {
  return h('div',
    row('Export', 'Download everything in this browser as a JSON file — accounts (hashed passwords excluded), projects, tasks, comments and docs.',
      h('button.btn', { type: 'button', onClick: exportData }, icon('archive', { size: 14 }), 'Export JSON')),
    row('Import', 'Restore from a previously exported file. This replaces what is currently stored.',
      h('button.btn', { type: 'button', onClick: importData }, 'Import JSON')),
    row('Where your data lives', 'Everything is stored in this browser only. Clearing site data, or opening the app in a different browser, means starting fresh. Sign out does not delete anything.',
      h('button.btn.btn--danger', { type: 'button', onClick: resetEverything }, icon('trash', { size: 14 }), 'Reset all data')));
}

async function exportData() {
  await store.flush();
  const payload = { version: 1, exportedAt: new Date().toISOString(), collections: {} };
  for (const name of COLLECTIONS) {
    payload.collections[name] = store.all(name).map((record) => {
      if (name !== 'users') return record;
      const { passwordHash, salt, ...safe } = record;
      return safe;
    });
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', {
    href: url,
    download: `aryanote-export-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Export downloaded');
}

function importData() {
  const input = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      if (!payload?.collections) throw new Error('Unrecognised file');

      const ok = await confirmDialog({
        title: 'Replace current data?',
        message: 'Importing overwrites the projects, tasks and docs currently stored in this browser. Your own account and password are kept.',
        confirmLabel: 'Import',
        danger: true,
      });
      if (!ok) return;

      const me = state.user;
      store.batch(() => {
        for (const name of COLLECTIONS) {
          const incoming = payload.collections[name] || [];
          store.removeWhere(name, () => true);
          incoming.forEach((record) => {
            if (name === 'users' && record.id === me.id) {
              store.insert(name, { ...record, passwordHash: me.passwordHash, salt: me.salt });
            } else {
              store.insert(name, record);
            }
          });
        }
        if (!store.get('users', me.id)) store.insert('users', me);
      });

      await store.flush();
      toast('Import complete');
      const workspaces = api.workspacesForUser(me.id);
      navigate(workspaces.length ? `/w/${workspaces[0].id}/home` : '/login', { replace: true });
    } catch (err) {
      console.error(err);
      toast('That file could not be imported', { tone: 'error' });
    }
  });

  input.click();
}

async function resetEverything() {
  const ok = await confirmDialog({
    title: 'Delete everything?',
    message: 'This removes every account, project, task and doc stored in this browser. It cannot be undone — export first if you want a copy.',
    confirmLabel: 'Delete everything',
    danger: true,
  });
  if (!ok) return;

  await store.reset();
  await auth.logout();
  setState({ user: null, workspaceId: null, projectId: null }, 'reset');
  navigate('/login', { replace: true });
  toast('All data cleared');
}
