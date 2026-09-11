import type { OperationSpacePolicy } from "@engenty/plugin-sdk";

/** List/create/collection ops: core injects `auth.spaceId` into `space_id`. */
export const TASKS_COLLECTION_SPACE_POLICY = {
  kind: "space_owned",
} as const satisfies OperationSpacePolicy;

/** Tenant-wide task-module defaults (no `space_id` column). */
export const TASKS_SETTINGS_SPACE_POLICY = {
  kind: "tenant_shared",
} as const satisfies OperationSpacePolicy;

/** Direct row lookup against core's `tasks` record source. */
export function tasksRecordSpacePolicy(
  idInputKey: string
): OperationSpacePolicy {
  return {
    kind: "space_owned",
    record: { idInputKey, moduleId: "tasks" },
  };
}
