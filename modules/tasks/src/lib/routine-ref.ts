// modules/tasks/src/lib/routine-ref.ts — package-exported like task-workspace.
/** Memory entity scope for a schedule routine (trigger). */
export const ROUTINE_ENTITY_TYPE = "tasks.routine";

export function routineEntityRef(triggerId: string): string {
  return `${ROUTINE_ENTITY_TYPE}:${triggerId}`;
}
