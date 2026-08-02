/* ==========================================================================
   Overlays: dropdown menus, modals, confirm dialogs, toasts, tooltips.
   ========================================================================== */

import { h, mount, clear, anchorTo, trapFocus, $$ } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

/* -- menus ---------------------------------------------------------------- */

let openMenu = null;

export function closeMenu() {
  if (!openMenu) return;
  openMenu.el.remove();
  document.removeEventListener('pointerdown', openMenu.onOutside, true);
  document.removeEventListener('keydown', openMenu.onKey, true);
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
  openMenu.onClose?.();
  openMenu = null;
}

/**
 * showMenu(anchorEl, {
 *   items: [{ id, label, icon, selected, danger, hint, section, onSelect }],
 *   search: bool, multi: bool, onSelect(item), footer: Node
 * })
 */
export function showMenu(anchor, options = {}) {
  closeMenu();

  const {
    items: initialItems = [], search = false, searchPlaceholder = 'Search…',
    align = 'start', side = 'bottom', width = null,
    onSelect = null, onClose = null, footer = null, emptyText = 'Nothing found',
  } = options;

  // Multi-select menus rebuild their items in place, so this stays mutable.
  let items = initialItems;

  const list = h('div.menu__list');
  const el = h('div.menu', { role: 'menu' });
  if (width) el.style.minWidth = `${width}px`;

  let filtered = items;
  let focusIndex = -1;

  const searchInput = search
    ? h('input.input', { type: 'text', placeholder: searchPlaceholder, autocomplete: 'off' })
    : null;

  if (search) {
    el.appendChild(h('div.menu__search', searchInput));
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      filtered = q
        ? items.filter((item) => !item.separator
            && `${item.label} ${item.hint || ''}`.toLowerCase().includes(q))
        : items;
      focusIndex = filtered.findIndex((i) => !i.separator && !i.section);
      renderList();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        step(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = filtered[focusIndex];
        if (item) pick(item);
      }
    });
  }

  el.appendChild(list);
  if (footer) el.appendChild(footer);

  function renderList() {
    clear(list);
    if (!filtered.length) {
      list.appendChild(h('div.menu__empty', emptyText));
      return;
    }
    filtered.forEach((item, index) => {
      if (item.separator) { list.appendChild(h('div.menu__sep')); return; }
      if (item.section) { list.appendChild(h('div.menu__label', item.section)); return; }

      const row = h('button.menu__item', {
        type: 'button',
        role: 'menuitem',
        class: [item.selected ? 'is-selected' : '', item.danger ? 'menu__item--danger' : '',
          index === focusIndex ? 'is-focus' : ''].filter(Boolean).join(' '),
        onClick: (event) => { event.stopPropagation(); pick(item); },
      });

      if (item.swatch) {
        row.appendChild(h('span.dot', { style: { background: item.swatch, width: '9px', height: '9px' } }));
      } else if (item.node) {
        row.appendChild(item.node);
      } else if (item.icon) {
        row.appendChild(icon(item.icon, { size: 15, cls: 'palette__icon' }));
      }

      row.appendChild(h('span.u-truncate', item.label));
      if (item.hint) row.appendChild(h('span.u-muted', { style: { marginLeft: 'auto', fontSize: '11px' } }, item.hint));
      if (item.selected) row.appendChild(icon('check', { size: 14, cls: 'menu__check' }));
      list.appendChild(row);
    });
  }

  function step(delta) {
    const selectable = filtered.map((item, i) => (!item.separator && !item.section ? i : -1)).filter((i) => i > -1);
    if (!selectable.length) return;
    const position = selectable.indexOf(focusIndex);
    const next = position === -1
      ? (delta > 0 ? selectable[0] : selectable[selectable.length - 1])
      : selectable[(position + delta + selectable.length) % selectable.length];
    focusIndex = next;
    renderList();
    list.children[focusIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function pick(item) {
    if (item.disabled) return;
    const keepOpen = options.multi || item.keepOpen;
    item.onSelect?.(item);
    onSelect?.(item);
    if (!keepOpen) closeMenu();
    else if (options.rebuild) {
      items = options.rebuild();
      const q = searchInput?.value.trim().toLowerCase();
      filtered = q
        ? items.filter((entry) => !entry.separator
            && `${entry.label} ${entry.hint || ''}`.toLowerCase().includes(q))
        : items;
      renderList();
    }
  }

  renderList();
  document.body.appendChild(el);
  anchorTo(el, anchor, { align, side });

  const onOutside = (event) => {
    if (!el.contains(event.target)) closeMenu();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeMenu(); }
    else if (!search && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (!search && event.key === 'Enter' && filtered[focusIndex]) {
      event.preventDefault();
      pick(filtered[focusIndex]);
    }
  };

  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  openMenu = { el, onOutside, onKey, onClose };
  if (searchInput) requestAnimationFrame(() => searchInput.focus());
  return el;
}

/* -- modals --------------------------------------------------------------- */

let openModal = null;

export function closeModal() {
  if (!openModal) return;
  openModal.release?.();
  openModal.scrim.remove();
  document.removeEventListener('keydown', openModal.onKey, true);
  openModal.previous?.focus?.();
  openModal = null;
}

/**
 * showModal({ title, subtitle, body: Node, actions: [{label, variant, onClick}] })
 * `onClick` returning false keeps the modal open.
 */
export function showModal({ title, subtitle = '', body = null, actions = [], wide = false, onClose = null }) {
  closeModal();
  const previous = document.activeElement;

  const modal = h('div.modal', { class: wide ? 'modal--wide' : '', role: 'dialog', 'aria-modal': 'true' });
  modal.appendChild(h('div.modal__head',
    h('div.u-grow',
      h('div.modal__title', title),
      subtitle ? h('div.modal__sub', subtitle) : null),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Close', onClick: () => { closeModal(); onClose?.(); },
    }, icon('x', { size: 16 }))));

  if (body) modal.appendChild(h('div.modal__body', body));

  if (actions.length) {
    modal.appendChild(h('div.modal__foot', ...actions.map((action) => h('button.btn', {
      type: 'button',
      class: action.variant === 'primary' ? 'btn--primary'
        : action.variant === 'danger' ? 'btn--danger' : '',
      onClick: async () => {
        const result = await action.onClick?.();
        if (result !== false) closeModal();
      },
    }, action.label))));
  }

  const scrim = h('div.modal-scrim', {
    onPointerDown: (event) => {
      if (event.target === scrim) { closeModal(); onClose?.(); }
    },
  }, modal);

  const onKey = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeModal(); onClose?.(); }
  };

  document.body.appendChild(scrim);
  document.addEventListener('keydown', onKey, true);
  const release = trapFocus(modal);
  openModal = { scrim, onKey, previous, release };

  requestAnimationFrame(() => {
    const target = modal.querySelector('input, textarea, button.btn--primary');
    target?.focus();
    if (target?.select) target.select();
  });

  return { modal, close: closeModal };
}

export function confirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false,
}) {
  return new Promise((resolve) => {
    showModal({
      title,
      body: h('p', { style: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6', margin: 0 } }, message),
      actions: [
        { label: cancelLabel, onClick: () => resolve(false) },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

/** Single-field prompt. Resolves to the trimmed string, or null if cancelled. */
export function promptDialog({ title, label, placeholder = '', value = '', confirmLabel = 'Save', multiline = false }) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea.textarea', { placeholder, value })
      : h('input.input', { type: 'text', placeholder, value });

    const submit = () => {
      const text = input.value.trim();
      if (!text) { input.focus(); return false; }
      resolve(text);
      return true;
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (submit() !== false) closeModal();
      }
    });

    showModal({
      title,
      body: h('div.field', label ? h('label.field__label', label) : null, input),
      actions: [
        { label: 'Cancel', onClick: () => resolve(null) },
        { label: confirmLabel, variant: 'primary', onClick: submit },
      ],
      onClose: () => resolve(null),
    });
  });
}

/* -- toasts --------------------------------------------------------------- */

let toastHost = null;

export function toast(message, { action = null, onAction = null, duration = 4200, tone = '' } = {}) {
  if (!toastHost) {
    toastHost = h('div.toast-host', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }

  const el = h('div.toast',
    tone === 'error' ? icon('alert', { size: 15 }) : null,
    h('span.u-grow', message),
    action ? h('button.toast__action', {
      type: 'button',
      onClick: () => { onAction?.(); dismiss(); },
    }, action) : null);

  let timer = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 180);
  }

  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(dismiss, 1600); });

  toastHost.appendChild(el);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  return dismiss;
}

/* -- tooltips ------------------------------------------------------------- */

let tipEl = null;
let tipTimer = null;

export function attachTip(el, text, { side = 'top' } = {}) {
  const show = () => {
    tipTimer = setTimeout(() => {
      hideTip();
      tipEl = h('div.tip', typeof text === 'function' ? text() : text);
      document.body.appendChild(tipEl);
      anchorTo(tipEl, el, { align: 'center', side, gap: 6 });
    }, 380);
  };
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('pointerdown', hideTip);
  return () => {
    el.removeEventListener('pointerenter', show);
    el.removeEventListener('pointerleave', hideTip);
  };
}

export function hideTip() {
  clearTimeout(tipTimer);
  tipEl?.remove();
  tipEl = null;
}

export const isOverlayOpen = () => Boolean(openMenu || openModal);
