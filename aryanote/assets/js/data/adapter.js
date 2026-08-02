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

const NS = 'aryanote.v1';

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
      console.warn('[aryanote] localStorage unavailable, continuing in memory', err);
    }
  }

  async read(collection) {
    const raw = this._get(this._key(collection));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn(`[aryanote] could not parse "${collection}"`, err);
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

  /**
   * Adopt data written under a previous namespace (the app was called Slate
   * before AryaNote). Only runs when this namespace is still empty, so it can
   * never clobber current data.
   */
  adoptLegacyNamespace(oldNs) {
    if (!this.available || oldNs === this.ns) return 0;
    try {
      const keys = [];
      let hasCurrent = false;
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(`${this.ns}:`)) hasCurrent = true;
        else if (key.startsWith(`${oldNs}:`)) keys.push(key);
      }
      if (hasCurrent || !keys.length) return 0;

      for (const key of keys) {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
          window.localStorage.setItem(`${this.ns}:${key.slice(oldNs.length + 1)}`, value);
        }
      }
      return keys.length;
    } catch (err) {
      console.warn('[aryanote] could not adopt legacy data', err);
      return 0;
    }
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
    const probe = '__aryanote_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
