/* ==========================================================================
   Schema migrations for data already sitting in a browser.

   Each migration is idempotent and keyed by a stored schema version, so a
   returning user's plans are upgraded in place rather than reset.
   ========================================================================== */

import store from './store.js';
import { workingDaysBetween } from './schedule.js';

const CURRENT_VERSION = 2;

export async function runMigrations() {
  const stored = (await store.meta('schemaVersion')) || 1;
  if (stored >= CURRENT_VERSION) return { from: stored, to: stored, changed: 0 };

  let changed = 0;

  if (stored < 2) changed += toSchedulingModel();

  await store.setMeta('schemaVersion', CURRENT_VERSION);
  await store.flush();
  return { from: stored, to: CURRENT_VERSION, changed };
}

/**
 * v1 -> v2: dependsOn[] becomes typed predecessor links, and tasks gain a
 * duration. Existing start dates are kept as manual anchors so a plan drawn
 * by hand does not jump the first time the scheduler runs.
 */
function toSchedulingModel() {
  let changed = 0;

  store.batch(() => {
    for (const task of store.all('tasks')) {
      const patch = {};

      if (!Array.isArray(task.predecessors)) {
        patch.predecessors = (task.dependsOn || []).map((id) => ({ id, type: 'FS', lag: 0 }));
      }

      if (task.duration === undefined || task.duration === null) {
        if (task.milestone) patch.duration = 0;
        else if (task.startDate && task.dueDate) {
          patch.duration = Math.max(1, workingDaysBetween(task.startDate, task.dueDate));
        } else patch.duration = 1;
      }

      if (task.manualStart === undefined) patch.manualStart = task.startDate || null;
      if (task.parentId === undefined) patch.parentId = null;
      if (task.outlineOrder === undefined) patch.outlineOrder = task.order ?? task.createdAt;

      if (Object.keys(patch).length) {
        store.update('tasks', task.id, patch);
        changed += 1;
      }
    }
  });

  return changed;
}

/** Mark a brand-new store as already current so migrations never re-run. */
export function stampVersion() {
  return store.setMeta('schemaVersion', CURRENT_VERSION);
}
