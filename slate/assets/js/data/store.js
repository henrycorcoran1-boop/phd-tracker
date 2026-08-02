/* ==========================================================================
   Reactive in-memory store backed by a pluggable adapter.

   Reads are synchronous (records live in Maps, with a couple of secondary
   indexes for the hot paths); writes mutate memory, notify subscribers on the
   next microtask, and persist on a debounce. That keeps view code simple
   while leaving persistence free to become a network call later.
   ========================================================================== */

import { COLLECTIONS } from './schema.js';

const PERSIST_DEBOUNCE = 250;

class Store {
  constructor() {
    this.adapter = null;
    this.data = new Map();      // collection -> Map(id -> record)
    this.indexes = new Map();   // "collection.field" -> Map(value -> Set(id))
    this.subscribers = new Set();
    this.dirty = new Set();
    this.notifyQueued = false;
    this.persistTimer = null;
    this.undoStack = [];
    this.batchDepth = 0;
    this.ready = false;

    for (const name of COLLECTIONS) this.data.set(name, new Map());
  }

  /* -- lifecycle -------------------------------------------------------- */

  async init(adapter) {
    this.adapter = adapter;
    for (const name of COLLECTIONS) {
      const records = await adapter.read(name);
      const map = new Map();
      for (const record of records) if (record && record.id) map.set(record.id, record);
      this.data.set(name, map);
    }
    this._buildIndexes();
    this.ready = true;
    return this;
  }

  /** Swap the persistence backend at runtime (e.g. local -> REST). */
  use(adapter) { this.adapter = adapter; }

  _buildIndexes() {
    this.indexes.clear();
    this._index('tasks', 'projectId');
    this._index('groups', 'projectId');
    this._index('projects', 'workspaceId');
    this._index('members', 'workspaceId');
    this._index('comments', 'taskId');
    this._index('activity', 'workspaceId');
    this._index('docs', 'workspaceId');
  }

  _index(collection, field) {
    const map = new Map();
    for (const record of this.data.get(collection).values()) {
      const value = record[field];
      if (value === undefined || value === null) continue;
      if (!map.has(value)) map.set(value, new Set());
      map.get(value).add(record.id);
    }
    this.indexes.set(`${collection}.${field}`, map);
  }

  _indexAdd(collection, record) {
    for (const [key, map] of this.indexes) {
      const [name, field] = key.split('.');
      if (name !== collection) continue;
      const value = record[field];
      if (value === undefined || value === null) continue;
      if (!map.has(value)) map.set(value, new Set());
      map.get(value).add(record.id);
    }
  }

  _indexRemove(collection, record) {
    for (const [key, map] of this.indexes) {
      const [name, field] = key.split('.');
      if (name !== collection) continue;
      const bucket = map.get(record[field]);
      if (bucket) bucket.delete(record.id);
    }
  }

  /* -- reads ------------------------------------------------------------ */

  get(collection, id) {
    if (!id) return null;
    return this.data.get(collection)?.get(id) || null;
  }

  all(collection) {
    return Array.from(this.data.get(collection)?.values() || []);
  }

  count(collection) {
    return this.data.get(collection)?.size || 0;
  }

  /** Indexed lookup when available, linear scan otherwise. */
  where(collection, field, value) {
    const index = this.indexes.get(`${collection}.${field}`);
    if (index) {
      const ids = index.get(value);
      if (!ids) return [];
      const map = this.data.get(collection);
      const out = [];
      for (const id of ids) {
        const record = map.get(id);
        if (record) out.push(record);
      }
      return out;
    }
    return this.all(collection).filter((record) => record[field] === value);
  }

  find(collection, predicate) {
    for (const record of this.data.get(collection).values()) {
      if (predicate(record)) return record;
    }
    return null;
  }

  filter(collection, predicate) {
    return this.all(collection).filter(predicate);
  }

  /* -- writes ----------------------------------------------------------- */

  insert(collection, record) {
    this.data.get(collection).set(record.id, record);
    this._indexAdd(collection, record);
    this._touch(collection);
    return record;
  }

  insertMany(collection, records) {
    for (const record of records) this.insert(collection, record);
    return records;
  }

  update(collection, id, patch) {
    const map = this.data.get(collection);
    const current = map.get(id);
    if (!current) return null;

    const changed = typeof patch === 'function' ? patch(current) : patch;
    if (!changed) return current;

    this._indexRemove(collection, current);
    const next = { ...current, ...changed };
    map.set(id, next);
    this._indexAdd(collection, next);
    this._touch(collection);
    return next;
  }

  remove(collection, id) {
    const map = this.data.get(collection);
    const record = map.get(id);
    if (!record) return null;
    this._indexRemove(collection, record);
    map.delete(id);
    this._touch(collection);
    return record;
  }

  removeWhere(collection, predicate) {
    const doomed = this.all(collection).filter(predicate);
    for (const record of doomed) this.remove(collection, record.id);
    return doomed;
  }

  /** Group several mutations into a single notify + persist. */
  batch(fn) {
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0) {
        this._scheduleNotify();
        this._schedulePersist();
      }
    }
  }

  _touch(collection) {
    this.dirty.add(collection);
    if (this.batchDepth > 0) return;
    this._scheduleNotify();
    this._schedulePersist();
  }

  /* -- subscriptions ---------------------------------------------------- */

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  _scheduleNotify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      const changed = new Set(this.dirty);
      for (const fn of Array.from(this.subscribers)) {
        try { fn(changed); } catch (err) { console.error('[slate] subscriber failed', err); }
      }
    });
  }

  /** Force an immediate re-render pass (used after imperative bulk edits). */
  notify() {
    for (const fn of Array.from(this.subscribers)) {
      try { fn(new Set(this.dirty)); } catch (err) { console.error('[slate] subscriber failed', err); }
    }
  }

  /* -- persistence ------------------------------------------------------ */

  _schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flush(), PERSIST_DEBOUNCE);
  }

  async flush() {
    if (!this.adapter || !this.dirty.size) return;
    const collections = Array.from(this.dirty);
    this.dirty.clear();
    await Promise.all(collections.map((name) =>
      this.adapter.write(name, this.all(name)).catch((err) => {
        console.error(`[slate] failed to persist ${name}`, err);
        this.dirty.add(name);
      })));
  }

  meta(key) { return this.adapter.readMeta(key); }
  setMeta(key, value) { return this.adapter.writeMeta(key, value); }

  /* -- undo ------------------------------------------------------------- */

  pushUndo(label, undoFn) {
    this.undoStack.push({ label, undo: undoFn, at: Date.now() });
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    entry.undo();
    return entry.label;
  }

  async reset() {
    for (const name of COLLECTIONS) this.data.set(name, new Map());
    this.indexes.clear();
    this._buildIndexes();
    this.undoStack = [];
    if (this.adapter?.clearAll) await this.adapter.clearAll();
    this._scheduleNotify();
  }
}

export const store = new Store();
export default store;
