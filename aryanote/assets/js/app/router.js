/* ==========================================================================
   Hash router. Routes look like:
     #/login
     #/w/:workspaceId/home
     #/w/:workspaceId/p/:projectId/board?task=tsk_123
   ========================================================================== */

const routes = [];
let currentHandler = null;
let notFound = null;

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(`^${pattern
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, name) => { keys.push(name); return '/([^/]+)'; })
    .replace(/\*/g, '.*')}$`);
  routes.push({ regex, keys, handler });
}

export function setNotFound(handler) { notFound = handler; }

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  const query = {};
  new URLSearchParams(queryString).forEach((value, key) => { query[key] = value; });
  return { path: path || '/', query };
}

export function resolve() {
  const { path, query } = parseHash();
  for (const entry of routes) {
    const match = entry.regex.exec(path);
    if (!match) continue;
    const params = {};
    entry.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
    currentHandler = entry.handler;
    return entry.handler({ params, query, path });
  }
  return notFound?.({ path, query });
}

export function navigate(path, { replace = false, query = null } = {}) {
  let target = path;
  if (query && Object.keys(query).length) {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== null && v !== undefined),
    );
    const qs = params.toString();
    if (qs) target += `?${qs}`;
  }
  const next = `#${target}`;
  if (window.location.hash === next) { resolve(); return; }
  if (replace) window.location.replace(next);
  else window.location.hash = next;
}

/** Change the query string without re-running the route handler. */
export function setQuery(patch, { silent = true } = {}) {
  const { path, query } = parseHash();
  const merged = { ...query, ...patch };
  Object.keys(merged).forEach((key) => {
    if (merged[key] === null || merged[key] === undefined || merged[key] === '') delete merged[key];
  });
  const qs = new URLSearchParams(merged).toString();
  const next = `#${path}${qs ? `?${qs}` : ''}`;
  if (window.location.hash === next) return;
  // replaceState does not fire hashchange, so a silent update needs no
  // suppression flag — assigning location.hash is the only path that routes.
  if (silent) window.history.replaceState(null, '', next);
  else window.location.hash = next;
}

export function startRouter() {
  window.addEventListener('hashchange', () => resolve());
  resolve();
}

export const currentPath = () => parseHash().path;
export const currentQuery = () => parseHash().query;
