// Inlined counterparts of `@engenty/tasks/lib/routine-ref` and
// `@engenty/tasks/lib/routine-workspace` — apps/ai keeps no build-time
// dependency on the tasks module (ops go over HTTP by operationId).

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
  return `tenants/${tenantId}/ai/workspace/routines/${trimmed}/`;
}
