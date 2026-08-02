/* ==========================================================================
   Tiny DOM layer. No framework — just a hyperscript helper and event glue.
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'g', 'polyline', 'polygon', 'text', 'defs', 'marker', 'ellipse']);

/**
 * h('div.cls#id', {props}, ...children)
 * Props starting with "on" bind listeners; `style` and `dataset` take objects.
 */
export function h(spec, props, ...children) {
  let tag = spec;
  let cls = '';
  let id = '';

  const hashAt = spec.indexOf('#');
  if (hashAt > -1) {
    id = spec.slice(hashAt + 1).split('.')[0];
    tag = spec.slice(0, hashAt) + spec.slice(hashAt + 1 + id.length);
  }
  const parts = tag.split('.');
  tag = parts[0] || 'div';
  if (parts.length > 1) cls = parts.slice(1).join(' ');

  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  if (cls) el.setAttribute('class', cls);
  if (id) el.id = id;

  if (props && (typeof props !== 'object' || Array.isArray(props) || props instanceof Node)) {
    children.unshift(props);
    props = null;
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.setAttribute('class', [cls, value].filter(Boolean).join(' '));
      } else if (key === 'style' && typeof value === 'object') {
        // Custom properties must go through setProperty — assigning them as
        // plain keys (Object.assign) is silently dropped by CSSStyleDeclaration.
        for (const [prop, val] of Object.entries(value)) {
          if (val === null || val === undefined || val === false) continue;
          if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
          else el.style[prop] = val;
        }
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'ref' && typeof value === 'function') {
        value(el);
      } else if (key in el && !SVG_TAGS.has(tag) && typeof value !== 'object') {
        try { el[key] = value; } catch { el.setAttribute(key, value); }
      } else {
        el.setAttribute(key, value === true ? '' : value);
      }
    }
  }

  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(parent, ...children) {
  clear(parent);
  return append(parent, children);
}

export function on(el, type, sel, handler) {
  if (typeof sel === 'function') {
    el.addEventListener(sel === handler ? type : type, sel);
    return () => el.removeEventListener(type, sel);
  }
  const wrapped = (event) => {
    const target = event.target.closest(sel);
    if (target && el.contains(target)) handler(event, target);
  };
  el.addEventListener(type, wrapped);
  return () => el.removeEventListener(type, wrapped);
}

/** Escape text for safe interpolation into innerHTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Grow a textarea to fit its content. */
export function autosize(textarea) {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea.addEventListener('input', resize);
  requestAnimationFrame(resize);
  return resize;
}

export function raf(fn) { return requestAnimationFrame(fn); }

export function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttleRaf(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/**
 * Position a floating element next to an anchor, flipping when it would
 * overflow the viewport.
 */
export function anchorTo(el, anchor, { align = 'start', side = 'bottom', gap = 5 } = {}) {
  const a = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  el.style.visibility = 'hidden';
  el.style.left = '0px';
  el.style.top = '0px';
  const box = el.getBoundingClientRect();

  let top = side === 'top' ? a.top - box.height - gap : a.bottom + gap;
  if (top + box.height > vh - 8) top = Math.max(8, a.top - box.height - gap);
  if (top < 8) top = 8;

  let left = align === 'end' ? a.right - box.width : a.left;
  if (align === 'center') left = a.left + a.width / 2 - box.width / 2;
  left = Math.min(Math.max(8, left), vw - box.width - 8);

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.visibility = '';
  return el;
}

/** Trap Tab focus inside a container while it is open. */
export function trapFocus(container) {
  const selector = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const onKey = (event) => {
    if (event.key !== 'Tab') return;
    const items = $$(selector, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}
