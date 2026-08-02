/* ==========================================================================
   Storage adapters.

   Everything above this file talks to an adapter through four async methods:

     read(collection)            -> Promise<Array<Record>>
     write(collection, records)  -> Promise<void>
     readMeta(key)               -> Promise<any>
     writeMeta(key, value)       -> Promise<void>

   `LocalAdapter` persists to localStorage so the app runs with no server.
   `RestAdapter` below is the drop-in replacement once a backend exists —
   swapping adapters is the only change required, because no view or store
   code assumes storage is local or synchronous.
   ========================================================================== */

const NS = 'slate.v1';

export class LocalAdapter {
  constructor(namespace = NS) {
    this.ns = namespace;
    this.available = probeStorage();
    this.memory = new Map();
  }

  _key(collection) { return `${this.ns}:${collection}`; }

  _get(key) {
    if (!this.available) return this.memory.get(key) ?? null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  _set(key, value) {
    if (!this.available) { this.memory.set(key, value); return; }
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Quota exceeded or storage disabled mid-session — degrade to memory
      // rather than losing the user's in-flight edits.
      this.available = false;
      this.memory.set(key, value);
      console.warn('[slate] localStorage unavailable, continuing in memory', err);
    }
  }

  async read(collection) {
    const raw = this._get(this._key(collection));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn(`[slate] could not parse "${collection}"`, err);
      return [];
    }
  }

  async write(collection, records) {
    this._set(this._key(collection), JSON.stringify(records));
  }

  async readMeta(key) {
    const raw = this._get(`${this.ns}:meta:${key}`);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async writeMeta(key, value) {
    this._set(`${this.ns}:meta:${key}`, JSON.stringify(value));
  }

  async clearAll() {
    if (!this.available) { this.memory.clear(); return; }
    const doomed = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${this.ns}:`)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  }

  /** Everything under the namespace, for export/backup. */
  async dump(collections) {
    const out = {};
    for (const name of collections) out[name] = await this.read(name);
    return out;
  }
}

/**
 * Reference implementation for a hosted backend. Not wired up yet — kept here
 * so the contract the rest of the app depends on stays explicit.
 *
 *   store.use(new RestAdapter('/api'))
 */
export class RestAdapter {
  constructor(baseUrl, { token = null, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
  }

  async _request(path, options = {}) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.status === 204 ? null : res.json();
  }

  read(collection) { return this._request(`/${collection}`); }
  write(collection, records) {
    return this._request(`/${collection}`, { method: 'PUT', body: JSON.stringify(records) });
  }
  readMeta(key) { return this._request(`/meta/${encodeURIComponent(key)}`); }
  writeMeta(key, value) {
    return this._request(`/meta/${encodeURIComponent(key)}`, {
      method: 'PUT', body: JSON.stringify(value),
    });
  }
}

function probeStorage() {
  try {
    const probe = '__slate_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
