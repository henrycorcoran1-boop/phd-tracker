/* ==========================================================================
   Sign in / create account.
   ========================================================================== */

import { h, mount, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as auth from '../data/auth.js';
import * as api from '../data/api.js';
import store from '../data/store.js';
import { seedWorkspace, ensureDemoUser, DEMO_EMAIL } from '../data/seed.js';
import { navigate } from '../app/router.js';
import { setState } from '../app/state.js';
import { toast } from '../ui/overlay.js';

const DEMO_PASSWORD = 'northwind2024';

export function renderAuth(root, { mode = 'login' } = {}) {
  const view = h('div.auth');
  view.appendChild(formColumn(mode));
  view.appendChild(artColumn());
  mount(root, view);
}

/* -- left: the form ------------------------------------------------------- */

function formColumn(mode) {
  const isSignup = mode === 'signup';
  const errorBox = h('div.auth__err.u-hidden');
  const fields = {};

  const field = (name, label, attrs = {}) => {
    const input = h('input.input', { name, autocomplete: attrs.autocomplete || 'off', ...attrs });
    const error = h('div.field__error.u-hidden');
    fields[name] = { input, error };
    return h('div.field', h('label.field__label', label), input, error);
  };

  const submit = h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' },
    isSignup ? 'Create account' : 'Sign in');

  const strengthBar = h('div', {
    style: { display: 'flex', gap: '3px', marginTop: '6px' },
  }, ...[0, 1, 2, 3].map(() => h('div', {
    style: { height: '3px', flex: '1', borderRadius: '2px', background: 'var(--surface-3)' },
  })));

  const form = h('form.auth__form', { novalidate: true });
  form.appendChild(errorBox);

  if (isSignup) {
    form.appendChild(field('name', 'Full name', { placeholder: 'Alex Moore', autocomplete: 'name' }));
  }
  form.appendChild(field('email', 'Work email', {
    type: 'email', placeholder: 'you@company.com', autocomplete: 'email',
  }));
  const passwordField = field('password', 'Password', {
    type: 'password',
    placeholder: isSignup ? 'At least 8 characters' : '',
    autocomplete: isSignup ? 'new-password' : 'current-password',
  });
  form.appendChild(passwordField);

  if (isSignup) {
    passwordField.appendChild(strengthBar);
    fields.password.input.addEventListener('input', () => {
      const score = auth.passwordScore(fields.password.input.value);
      const colors = ['var(--pr-urgent)', 'var(--pr-high)', 'var(--pr-medium)', 'var(--st-done)'];
      Array.from(strengthBar.children).forEach((bar, i) => {
        bar.style.background = i < score ? colors[Math.max(0, score - 1)] : 'var(--surface-3)';
      });
    });
  }

  form.appendChild(submit);

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    Object.values(fields).forEach(({ input, error }) => {
      input.removeAttribute('aria-invalid');
      error.classList.add('u-hidden');
    });
    errorBox.classList.add('u-hidden');

    const values = {
      name: fields.name?.input.value.trim() || '',
      email: fields.email.input.value.trim(),
      password: fields.password.input.value,
    };

    if (isSignup) {
      const errors = auth.validateSignup(values);
      if (Object.keys(errors).length) {
        for (const [name, message] of Object.entries(errors)) {
          const target = fields[name];
          if (!target) continue;
          target.input.setAttribute('aria-invalid', 'true');
          target.error.textContent = message;
          target.error.classList.remove('u-hidden');
        }
        fields[Object.keys(errors)[0]]?.input.focus();
        return;
      }
    } else if (!values.email || !values.password) {
      showError(errorBox, 'Enter your email and password.');
      return;
    }

    busy = true;
    submit.disabled = true;
    submit.textContent = isSignup ? 'Creating account…' : 'Signing in…';

    try {
      const result = isSignup ? await auth.signup(values) : await auth.login(values);
      if (result.error) {
        showError(errorBox, result.error);
        return;
      }
      await finishSignIn(result.user, { isNew: isSignup, claimed: result.claimed });
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = isSignup ? 'Create account' : 'Sign in';
    }
  });

  const demoButton = h('button.btn.btn--block', {
    type: 'button',
    onClick: async () => {
      const user = ensureDemoUser();
      await auth.startSession(user.id);
      await finishSignIn(user, { isNew: false, demo: true });
    },
  }, icon('zap', { size: 15 }), 'Explore the demo workspace');

  return h('div.auth__form-col',
    h('div.auth__inner',
      h('div.auth__brand',
        brandMark(26),
        h('span.auth__brand-name', 'Slate')),
      h('h1.auth__title', isSignup ? 'Create your workspace' : 'Welcome back'),
      h('p.auth__sub', isSignup
        ? 'Plan the work, share it with your team, and see where it stands.'
        : 'Sign in to pick up where your team left off.'),
      form,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0 16px' } },
        h('div', { style: { flex: '1', height: '1px', background: 'var(--border)' } }),
        h('span', { style: { fontSize: '11px', color: 'var(--text-4)', fontWeight: '600', letterSpacing: '0.04em' } }, 'OR'),
        h('div', { style: { flex: '1', height: '1px', background: 'var(--border)' } })),
      demoButton,
      h('p.auth__alt',
        isSignup ? 'Already have an account? ' : 'New here? ',
        h('a', {
          href: isSignup ? '#/login' : '#/signup',
        }, isSignup ? 'Sign in' : 'Create an account')),
      !auth.hasStrongCrypto()
        ? h('div.auth__note', 'This page is not running in a secure context, so password hashing has fallen back to a weaker method. Serve the app over https (or localhost) for full-strength hashing.')
        : h('div.auth__note',
          'Accounts and data are stored in this browser. Passwords are hashed with PBKDF2 before being saved — but a browser-only app cannot enforce access the way a server can, so treat this as a working prototype rather than a vault.')));
}

function showError(box, message) {
  box.textContent = message;
  box.classList.remove('u-hidden');
}

async function finishSignIn(user, { isNew = false, claimed = false, demo = false } = {}) {
  api.setActor(user.id);

  let workspaces = api.workspacesForUser(user.id);
  if (!workspaces.length) {
    // First run for this account — give them a populated workspace so the
    // product is explorable rather than an empty shell.
    seedWorkspace(user.id, { name: 'Northwind Studio' });
    workspaces = api.workspacesForUser(user.id);
  }

  await store.flush();
  setState({ user }, 'signin');

  const workspace = workspaces[0];
  navigate(`/w/${workspace.id}/home`, { replace: true });

  if (claimed) toast(`Welcome, ${user.name.split(' ')[0]} — your invitations are waiting`);
  else if (demo) toast('Signed in to the demo workspace');
  else if (isNew) toast('Workspace ready — everything here is yours to change');
}

/* -- right: the marketing panel ------------------------------------------- */

function artColumn() {
  return h('div.auth__art',
    h('div.auth__art-inner',
      h('p.auth__quote', 'Every project, every deadline, every owner — on one surface your whole team trusts.'),
      h('p.auth__quote-sub', 'Boards, tables, calendars and a real Gantt timeline, without the setup ceremony.'),
      previewMock()));
}

function previewMock() {
  const bar = (width, color = 'var(--surface-3)') => h('div.auth-preview__bar-fill', {
    style: { width, background: color },
  });

  const rows = [
    ['62%', '#3a5169'],
    ['38%', '#5a7355'],
    ['78%', '#9a7328'],
    ['46%', '#7a6c8c'],
    ['58%', '#6c7b8b'],
  ];

  return h('div.auth-preview',
    h('div.auth-preview__bar',
      h('span.auth-preview__dot'), h('span.auth-preview__dot'), h('span.auth-preview__dot')),
    h('div.auth-preview__body',
      ...rows.map(([width, color], i) => h('div.auth-preview__row',
        h('span.dot', { style: { background: color, width: '7px', height: '7px' } }),
        bar(`${30 + i * 6}%`),
        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '5px' } },
          h('div', {
            style: {
              width: '46px', height: '8px', borderRadius: '99px',
              background: color, opacity: '0.28',
            },
          }),
          h('div', {
            style: {
              width: `${18 + i * 4}px`, height: '8px', borderRadius: '99px',
              background: color, opacity: '0.7',
            },
          }))))));
}

export function brandMark(size = 24) {
  const svg = icon('mark', { size, stroke: 1.8 });
  svg.style.color = 'var(--text)';
  return svg;
}
