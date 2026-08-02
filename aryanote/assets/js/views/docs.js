/* ==========================================================================
   Docs — long-form notes alongside the work, written in Markdown.
   ========================================================================== */

import { h, mount, autosize, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { state, currentWorkspace } from '../app/state.js';
import { currentQuery, setQuery } from '../app/router.js';
import { showMenu, confirmDialog, toast, promptDialog } from '../ui/overlay.js';
import { emptyState } from '../ui/bits.js';
import { renderMarkdown, excerpt } from '../lib/markdown.js';
import { timeAgo, formatDateTime } from '../lib/date.js';

// Docs open rendered; clicking the page drops into the Markdown editor.
let previewMode = true;

export function renderDocs(host, { projectId = null } = {}) {
  const workspace = currentWorkspace();
  const docs = api.docsOf(workspace.id);
  const query = currentQuery();
  const active = store.get('docs', query.doc) || docs[0] || null;

  if (!docs.length) {
    mount(host, h('div.view__scroll', h('div.page', emptyState({
      icon: 'doc',
      title: 'No docs yet',
      text: 'Write specs, meeting notes and playbooks next to the work they belong to. Markdown is supported.',
      action: h('button.btn.btn--primary', {
        type: 'button',
        onClick: () => createDoc(workspace, projectId),
      }, icon('plus', { size: 14 }), 'New doc'),
    }))));
    return;
  }

  const list = h('div.docs__list',
    h('button.btn.btn--block', {
      type: 'button',
      style: { marginBottom: '8px' },
      onClick: () => createDoc(workspace, projectId),
    }, icon('plus', { size: 14 }), 'New doc'),
    ...docs.map((doc) => {
      const project = doc.projectId ? store.get('projects', doc.projectId) : null;
      return h('button.docs__item', {
        type: 'button',
        class: active && doc.id === active.id ? 'is-active' : '',
        onClick: () => { setQuery({ doc: doc.id }); renderDocs(host, { projectId }); },
      },
        h('span.docs__item-title', doc.title || 'Untitled'),
        h('span.docs__item-meta',
          project ? `${project.name} · ` : '',
          timeAgo(doc.updatedAt)));
    }));

  const editor = h('div.docs__editor');
  if (active) editor.appendChild(docEditor(active, workspace, host, projectId));

  mount(host, h('div.docs', list, editor));
}

function docEditor(doc, workspace, host, projectId) {
  const title = h('textarea.docs__title', {
    rows: 1,
    value: doc.title,
    placeholder: 'Untitled',
    'aria-label': 'Doc title',
  });
  autosize(title);

  const saveTitle = debounce(() => {
    const value = title.value.replace(/\n/g, '').trim();
    api.updateDoc(doc.id, { title: value || 'Untitled' });
  }, 500);
  title.addEventListener('input', saveTitle);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); body.focus(); }
  });

  const project = doc.projectId ? store.get('projects', doc.projectId) : null;
  const author = store.get('users', doc.authorId);

  const meta = h('div.docs__meta',
    h('button.cell-btn', {
      type: 'button',
      onClick: (event) => {
        showMenu(event.currentTarget, {
          items: [
            {
              id: 'none', label: 'No project', selected: !doc.projectId,
              onSelect: () => { api.updateDoc(doc.id, { projectId: null }); renderDocs(host, { projectId }); },
            },
            { separator: true },
            ...api.projectsOf(workspace.id).map((option) => ({
              id: option.id,
              label: option.name,
              swatch: option.color,
              selected: option.id === doc.projectId,
              onSelect: () => { api.updateDoc(doc.id, { projectId: option.id }); renderDocs(host, { projectId }); },
            })),
          ],
        });
      },
    }, project
      ? [h('span.dot', { style: { background: project.color } }), h('span', project.name)]
      : h('span.u-muted', 'No project')),
    h('span', '·'),
    h('span', `Edited ${timeAgo(doc.updatedAt)}`),
    author ? h('span', `by ${author.name}`) : null,
    h('div.u-spacer'),
    h('button.btn.btn--sm', {
      type: 'button',
      onClick: () => { previewMode = !previewMode; renderDocs(host, { projectId }); },
    }, icon(previewMode ? 'edit' : 'doc', { size: 13 }), previewMode ? 'Edit' : 'Preview'),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Doc actions',
      onClick: (event) => {
        showMenu(event.currentTarget, {
          align: 'end',
          items: [
            {
              id: 'duplicate', label: 'Duplicate', icon: 'copy',
              onSelect: () => {
                const copy = api.createDoc(workspace.id, {
                  projectId: doc.projectId,
                  title: `${doc.title} (copy)`,
                  body: doc.body,
                });
                setQuery({ doc: copy.id });
                renderDocs(host, { projectId });
              },
            },
            { separator: true },
            {
              id: 'delete', label: 'Delete doc', icon: 'trash', danger: true,
              onSelect: async () => {
                const ok = await confirmDialog({
                  title: `Delete "${doc.title}"?`,
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete', danger: true,
                });
                if (!ok) return;
                api.deleteDoc(doc.id);
                setQuery({ doc: null });
                toast('Doc deleted');
                renderDocs(host, { projectId });
              },
            },
          ],
        });
      },
    }, icon('more', { size: 15 })));

  const body = h('textarea.docs__area', {
    value: doc.body,
    placeholder: 'Start writing…\n\nMarkdown works: # headings, **bold**, - lists, `code`, > quotes and | tables |.',
    spellcheck: 'true',
    'aria-label': 'Doc body',
  });
  autosize(body);

  const saveBody = debounce(() => api.updateDoc(doc.id, { body: body.value }), 500);
  body.addEventListener('input', saveBody);
  body.addEventListener('keydown', (event) => {
    // Tab inserts two spaces rather than moving focus out of the editor.
    if (event.key === 'Tab') {
      event.preventDefault();
      const { selectionStart, selectionEnd, value } = body;
      body.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      body.selectionStart = body.selectionEnd = selectionStart + 2;
      saveBody();
    }
  });

  const content = previewMode
    ? h('div.md', {
      style: { marginTop: '20px', cursor: 'text', minHeight: '300px' },
      title: 'Click to edit',
      html: renderMarkdown(doc.body)
        || '<p class="u-muted">Nothing written yet — click to start.</p>',
      onClick: (event) => {
        if (event.target.closest('a, input')) return;
        previewMode = false;
        renderDocs(host, { projectId });
        requestAnimationFrame(() => {
          const area = document.querySelector('.docs__area');
          area?.focus();
          area?.setSelectionRange(area.value.length, area.value.length);
        });
      },
    })
    : body;

  return h('div.docs__inner', title, meta, content);
}

function createDoc(workspace, projectId) {
  const doc = api.createDoc(workspace.id, { projectId, title: 'Untitled' });
  setQuery({ doc: doc.id });
  previewMode = false;
  requestAnimationFrame(() => {
    document.querySelector('.docs__title')?.focus();
  });
}
