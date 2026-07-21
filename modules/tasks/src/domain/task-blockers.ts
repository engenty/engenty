// Task dependency graph — pure logic (agent coordination, Phase 1).
//
// A blocker is "resolved" ONLY when its status is 'done'. Any other status —
// including 'cancelled' — leaves it OPEN, mirroring paperclip semantics: a
// cancelled blocker must be removed/replaced explicitly, it does not
// auto-resolve the dependent. Kept free of DB access so it unit-tests without
// Supabase; the DB-touching validation takes an injected loader.

import { TASK_TERMINAL_STATUSES } from "./task-lifecycle.js";

/** Blocker ids that are NOT yet resolved (status !== 'done'). */
export function openBlockerIds(
  blockedByIds: readonly string[],
  statusById: ReadonlyMap<string, string | undefined>
): string[] {
  return blockedByIds.filter((id) => statusById.get(id) !== "done");
}

/** True when every listed child status is terminal (done/cancelled). */
export function allChildrenTerminal(childStatuses: readonly string[]): boolean {
  return (
    childStatuses.length > 0 &&
    childStatuses.every((s) => TASK_TERMINAL_STATUSES.has(s))
  );
}

/** Dedupe + trim a proposed blocker set. */
export function normalizeBlockerIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export interface BlockerValidationDeps {
  /**
   * The stored `blocked_by_task_ids` for a task id, or `null` when the task
   * does not exist in the caller's tenant/scope. Used for existence checks and
   * the transitive cycle walk.
   */
  loadBlockedBy: (id: string) => Promise<string[] | null>;
}

// Safety cap on the cycle walk so a corrupt graph can never spin forever.
const MAX_BLOCKER_WALK = 4096;

/**
 * Validate a proposed `blocked_by` set for `taskId` (null when creating a task
 * that has no id yet — no self/cycle target then). Throws on self-reference, an
 * unknown blocker id, or a cycle (a blocker that is transitively blocked by
 * `taskId`). Returns the normalized (deduped, trimmed) set to persist.
 */
export async function validateBlockedBy(
  taskId: string | null,
  blockedBy: readonly string[],
  deps: BlockerValidationDeps
): Promise<string[]> {
  const unique = normalizeBlockerIds(blockedBy);
  if (unique.length === 0) {
    return unique;
  }
  if (taskId && unique.includes(taskId)) {
    throw new Error("task_blocker_self_reference");
  }

  // Walk each blocker's own blocker chain. Existence is validated along the
  // way (a null load = unknown id); reaching `taskId` proves a cycle.
  const visited = new Set<string>();
  const frontier = [...unique];
  let steps = 0;
  while (frontier.length > 0) {
    if (steps++ > MAX_BLOCKER_WALK) {
      throw new Error("task_blocker_chain_too_deep");
    }
    const id = frontier.shift();
    if (id === undefined || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const childBlockers = await deps.loadBlockedBy(id);
    if (childBlockers === null) {
      throw new Error(`task_blocker_unknown:${id}`);
    }
    for (const child of childBlockers) {
      if (taskId && child === taskId) {
        throw new Error("task_blocker_cycle");
      }
      frontier.push(child);
    }
  }
  return unique;
}
