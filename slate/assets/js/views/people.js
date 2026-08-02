/* ==========================================================================
   People — members, roles, invitations and per-person workload.
   ========================================================================== */

import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { ROLES, roleOf, canManage, isDoneStatus, statusOf } from '../data/schema.js';
import { state, currentWorkspace, currentRole, setFilters } from '../app/state.js';
import { currentQuery, setQuery } from '../app/router.js';
import { EMAIL_RE } from '../data/auth.js';
import { showMenu, showModal, confirmDialog, toast, closeModal } from '../ui/overlay.js';
import { openTaskPanel } from '../ui/taskpanel.js';
import { avatar, emptyState } from '../ui/bits.js';
import { formatDate, timeAgo, todayKey } from '../lib/date.js';

export function renderPeople(host) {
  const workspace = currentWorkspace();
  const members = api.membersOf(workspace.id);
  const role = currentRole();
  const workload = new Map(api.workloadOf(workspace.id).map((entry) => [entry.user.id, entry]));

  const page = h('div.page.page--wide',
    h('div.page__head',
      h('div.u-row', { style: { justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px' } },
        h('div',
          h('div.page__eyebrow', workspace.name),
          h('h1.page__title', 'People'),
          h('p.page__sub', `${members.length} member${members.length === 1 ? '' : 's'} · anyone invited can be assigned to tasks straight away`)),
        canManage(role)
          ? h('button.btn.btn--primary', { type: 'button', onClick: () => openInvite(workspace) },
            icon('userPlus', { size: 15 }), 'Invite people')
          : null)));

  page.appendChild(h('div.people-grid',
    ...members.map((member) => personCard(member, workspace, role, workload.get(member.userId)))));

  const pending = members.filter((member) => member.user.pending);
  if (pending.length) {
    page.appendChild(h('div.section',
      h('div.card',
        h('div.card__head',
          icon('clock', { size: 15, cls: 'u-muted' }),
          h('span.card__title', 'Waiting to join'),
          h('span.section__count', pending.length)),
        h('div.card__body',
          h('p.u-muted', { style: { fontSize: '13px', lineHeight: '1.6', margin: 0 } },
            'These people have a place in the workspace and can be assigned work, but have not created an account yet. When they sign up with the same email address, they take over the account and inherit everything already assigned to them.')))));
  }

  mount(host, h('div.view__scroll', page));

  if (currentQuery().invite) {
    setQuery({ invite: null });
    if (canManage(role)) openInvite(workspace);
  }
}

function personCard(member, workspace, viewerRole, load) {
  const { user } = member;
  const isSelf = user.id === state.user.id;
  const open = load?.total || 0;

  return h('div.person',
    h('div.person__top',
      avatar(user, 'lg'),
      h('div.u-grow', { style: { minWidth: 0 } },
        h('div.person__name.u-truncate',
          user.name,
          isSelf ? h('span.badge', { style: { marginLeft: '6px' } }, 'You') : null),
        h('div.person__mail.u-truncate', user.email || 'No email'),
        user.title ? h('div.person__mail.u-truncate', user.title) : null),
      canManage(viewerRole) && !isSelf
        ? h('button.icon-btn', {
          type: 'button', 'aria-label': `Manage ${user.name}`,
          onClick: (event) => openMemberMenu(event.currentTarget, member, workspace),
        }, icon('more', { size: 16 }))
        : null),

    h('div.u-row.u-gap-2',
      h('span.badge', { class: member.role === 'owner' ? 'badge--accent' : '' }, roleOf(member.role).name),
      user.pending ? h('span.badge', { style: { color: 'var(--pr-high)' } }, 'Invited') : null),

    h('div.person__stats',
      h('div',
        h('div.person__stat-val', String(open)),
        h('div.person__stat-label', 'Open tasks')),
      h('div',
        h('div.person__stat-val', {
          style: load?.overdue ? { color: 'var(--pr-urgent)' } : {},
        }, String(load?.overdue || 0)),
        h('div.person__stat-label', 'Overdue')),
      h('div',
        h('div.person__stat-val', String(load?.active || 0)),
        h('div.person__stat-label', 'In flight')),
      h('div.u-spacer'),
      h('button.btn.btn--sm', {
        type: 'button',
        onClick: () => openPersonTasks(user, workspace),
      }, 'View work')));
}

function openMemberMenu(anchor, member, workspace) {
  showMenu(anchor, {
    align: 'end',
    items: [
      { section: 'Role' },
      ...ROLES.filter((role) => role.id !== 'owner').map((role) => ({
        id: role.id,
        label: role.name,
        hint: role.desc,
        selected: member.role === role.id,
        onSelect: () => {
          api.setMemberRole(workspace.id, member.userId, role.id);
          toast(`${member.user.name} is now ${role.name.toLowerCase()}`);
        },
      })),
      { separator: true },
      {
        id: 'remove',
        label: 'Remove from workspace',
        icon: 'trash',
        danger: true,
        onSelect: async () => {
          const ok = await confirmDialog({
            title: `Remove ${member.user.name}?`,
            message: 'They lose access to this workspace and are unassigned from open tasks. Their comments and history stay.',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          api.removeMember(workspace.id, member.userId);
          toast(`${member.user.name} removed`);
        },
      },
    ],
  });
}

function openPersonTasks(user, workspace) {
  const tasks = api.tasksOfWorkspace(workspace.id)
    .filter((task) => task.assigneeIds.includes(user.id) && !isDoneStatus(task.status))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const body = h('div', { style: { maxHeight: '50vh', overflowY: 'auto', margin: '0 -20px' } });

  if (!tasks.length) {
    body.appendChild(h('p.u-muted', { style: { fontSize: '13px', padding: '0 20px' } },
      'No open tasks assigned.'));
  } else {
    tasks.forEach((task) => {
      const project = store.get('projects', task.projectId);
      body.appendChild(h('div.list-row', {
        onClick: () => { closeModal(); openTaskPanel(task.id); },
      },
        h('span.dot', { style: { background: statusOf(task.status).color, flex: 'none' } }),
        h('div.u-grow', { style: { minWidth: 0 } },
          h('div.list-row__title', task.title),
          h('div.list-row__sub', project?.name || '')),
        task.dueDate
          ? h('span.u-muted', { style: { fontSize: '12px' } }, formatDate(task.dueDate))
          : null));
    });
  }

  showModal({
    title: `${user.name}'s open work`,
    subtitle: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
    body,
    wide: true,
    actions: [{ label: 'Close', onClick: () => {} }],
  });
}

/* -- invitations ---------------------------------------------------------- */

function openInvite(workspace) {
  const nameInput = h('input.input', { placeholder: 'Jordan Ellis', autocomplete: 'off' });
  const emailInput = h('input.input', { type: 'email', placeholder: 'jordan@company.com', autocomplete: 'off' });
  const error = h('div.field__error.u-hidden');
  let role = 'member';

  const roleButton = h('button.btn', { type: 'button' }, roleOf(role).name);
  roleButton.addEventListener('click', () => {
    showMenu(roleButton, {
      items: ROLES.filter((option) => option.id !== 'owner').map((option) => ({
        id: option.id,
        label: option.name,
        hint: option.desc,
        selected: option.id === role,
        onSelect: () => { role = option.id; roleButton.textContent = option.name; },
      })),
    });
  });

  const submit = () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      error.textContent = 'Enter a valid email address.';
      error.classList.remove('u-hidden');
      emailInput.focus();
      return false;
    }
    const result = api.inviteMember(workspace.id, {
      name: nameInput.value.trim(),
      email,
      role,
    });
    if (result.alreadyMember) {
      error.textContent = 'That person is already in this workspace.';
      error.classList.remove('u-hidden');
      return false;
    }
    toast(`${result.user.name} added to ${workspace.name}`);
    return true;
  };

  emailInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); if (submit() !== false) closeModal(); }
  });

  showModal({
    title: 'Invite people',
    subtitle: 'They can be assigned tasks immediately, and claim the account when they sign up with this email.',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div.field', h('label.field__label', 'Name'), nameInput),
      h('div.field', h('label.field__label', 'Email'), emailInput, error),
      h('div.field', h('label.field__label', 'Role'), h('div', roleButton))),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      { label: 'Send invite', variant: 'primary', onClick: submit },
    ],
  });
}
