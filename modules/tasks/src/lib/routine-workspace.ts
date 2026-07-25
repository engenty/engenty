import {
  pathSegmentsAfterFileStorageTenantRoot,
  workWorkspacePrefix,
} from "@engenty/file-storage";

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

export function routineWorkspaceTenantRelativeDisplayPath(
  tenantId: string,
  triggerId: string
): string {
  const prefix = routineWorkspaceStoragePrefix(tenantId, triggerId);
  const segments = pathSegmentsAfterFileStorageTenantRoot(
    prefix.replace(/\/$/, "")
  );
  return `${segments.join("/")}/`;
}

const ROUTINE_WORKSPACE_STORAGE_PREFIX_PATTERN =
  /^tenants\/[^/]+\/ai\/workspace\/routines\/([^/]+)(?:\/|$)/;
const ROUTINE_WORKSPACE_STORAGE_PREFIX_RELATIVE_PATTERN =
  /^ai\/workspace\/routines\/([^/]+)(?:\/|$)/;

export function triggerIdFromRoutineStoragePrefix(
  prefix: string
): string | null {
  const match =
    ROUTINE_WORKSPACE_STORAGE_PREFIX_PATTERN.exec(prefix) ??
    ROUTINE_WORKSPACE_STORAGE_PREFIX_RELATIVE_PATTERN.exec(prefix);
  return match?.[1] ?? null;
}
