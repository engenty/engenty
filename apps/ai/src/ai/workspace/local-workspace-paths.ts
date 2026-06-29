import os from "node:os";
import path from "node:path";

/** Local mirror root for sandbox staging and offline test mounts (`ENGENTY_WORKSPACE_FS=local`). */
export function resolveEngentyLocalWorkspaceRoot(): string {
  const fromEnv = process.env.ENGENTY_LOCAL_WORKSPACE_ROOT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(os.tmpdir(), "engenty-workspaces");
}

export function resolveTenantLocalWorkspaceBasePath(tenantId: string): string {
  return path.join(
    resolveEngentyLocalWorkspaceRoot(),
    "tenants",
    tenantId.trim()
  );
}

export function resolveLocalMountBasePath(
  tenantId: string,
  fileStorageRelativePath: string
): string {
  const segments = fileStorageRelativePath
    .split("/")
    .filter((segment) => segment.length > 0);
  return path.join(resolveTenantLocalWorkspaceBasePath(tenantId), ...segments);
}
