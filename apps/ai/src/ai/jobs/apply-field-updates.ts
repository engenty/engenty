// Apply user-approved field updates to a subject, generically — for ANY module,
// not just contacts. A subject's `context_type` is dotted `"<module>.<entity>"`
// (e.g. "contacts.person", "offers.offer"), and every module exposes a
// `<module>_update(id, patch)` gateway operation by convention. So the right
// write is derived from the context_type; no per-module hardcoding.
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import type { AiSessionScope } from "../sessions/types.js";

/** `"contacts.person"` → `"contacts_update"`; null when the type has no module. */
export function moduleUpdateOperationForContextType(
  contextType: string
): string | null {
  const moduleId = contextType.split(".")[0]?.trim();
  return moduleId ? `${moduleId}_update` : null;
}

/**
 * Write `patch` onto the subject `(contextType, contextId)` via its module's
 * update operation. Returns the number of fields applied. Throws if the
 * context_type has no resolvable module (the core gateway rejects an unknown
 * operation — no silent fallback).
 */
export async function applyApprovedFieldUpdates(params: {
  contextId: string;
  contextType: string;
  patch: Record<string, unknown>;
  scope: AiSessionScope;
}): Promise<{ applied: number }> {
  const operationId = moduleUpdateOperationForContextType(params.contextType);
  if (!operationId) {
    throw new Error(`apply: unresolvable context_type "${params.contextType}"`);
  }
  const fields = Object.keys(params.patch);
  if (fields.length === 0) {
    return { applied: 0 };
  }
  const invoke = createScopeModuleOperationInvoker(params.scope);
  await invoke(operationId, { id: params.contextId, patch: params.patch });
  return { applied: fields.length };
}
