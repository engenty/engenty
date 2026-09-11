import type { OperationSpacePolicy } from "@engenty/plugin-sdk";

/** List/create/collection ops: core injects `auth.spaceId` into `space_id`. */
export const PROJECTS_COLLECTION_SPACE_POLICY = {
  kind: "space_owned",
} as const satisfies OperationSpacePolicy;

/** Tenant-wide project defaults (no `space_id` column). */
export const PROJECTS_SETTINGS_SPACE_POLICY = {
  kind: "tenant_shared",
} as const satisfies OperationSpacePolicy;

/** Direct project id, or a child that derives Space from `project_id`. */
export function projectsRecordSpacePolicy(
  idInputKey: string
): OperationSpacePolicy {
  return {
    kind: "space_owned",
    record: { idInputKey, moduleId: "projects" },
  };
}
