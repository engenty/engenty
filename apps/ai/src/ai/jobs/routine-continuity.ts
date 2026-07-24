// Memory entity ref for schedule routines. Storage prefixes live in
// `@engenty/file-storage` (`workWorkspacePrefix`) — apps/ai keeps no
// build-time dependency on the tasks module (ops go over HTTP by operationId).

import { workWorkspacePrefix } from "@engenty/file-storage";

/** Memory entity scope for a schedule routine (trigger). */
export const ROUTINE_ENTITY_TYPE = "tasks.routine";

export function routineEntityRef(triggerId: string): string {
  return `${ROUTINE_ENTITY_TYPE}:${triggerId}`;
}

/** Storage prefix for a routine's durable workspace (survives task generations). */
export function routineWorkspaceStoragePrefix(
  tenantId: string,
  triggerId: string
): string {
  const trimmed = triggerId.trim();
  if (!trimmed) {
    throw new Error("trigger_id_invalid");
  }
  return workWorkspacePrefix(tenantId, "routine", trimmed);
}
