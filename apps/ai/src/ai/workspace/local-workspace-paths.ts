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

/**
 * Local staging dir for a synced writable mount.
 *
 * `spaceId` is part of the path for the same reason it is part of the storage
 * key: two spaces' commons share the identical RELATIVE path
 * (`ai/workspace/commons/`), so omitting it here would stage both into one
 * directory and let the sandbox sync one space's bytes into another.
 */
export function resolveLocalMountBasePath(
  tenantId: string,
  fileStorageRelativePath: string,
  spaceId?: string
): string {
  const segments = fileStorageRelativePath
    .split("/")
    .filter((segment) => segment.length > 0);
  const space = spaceId?.trim();
  return path.join(
    resolveTenantLocalWorkspaceBasePath(tenantId),
    ...(space ? ["spaces", space] : []),
    ...segments
  );
}

/** Package managers whose download cache is shared across a space's runs. */
export const SANDBOX_CACHE_TOOLS = ["bun", "npm", "uv"] as const;

export type SandboxCacheTool = (typeof SANDBOX_CACHE_TOOLS)[number];

/**
 * Host dirs holding a space's package-manager caches.
 *
 * These are the one part of a sandbox that SHOULD outlive its run: an agent
 * that installs pandas in a routine fire should not download it again on the
 * next one. They are a cache in the strict sense — nothing here is durable, and
 * the reaper is free to delete any of them at any time.
 *
 * Space-rooted when the run has a space, tenant-rooted otherwise, matching
 * every other work mount.
 */
export function resolveSandboxCachePaths(
  tenantId: string,
  spaceId?: string
): Record<SandboxCacheTool, string> {
  const entries = SANDBOX_CACHE_TOOLS.map((tool) => [
    tool,
    resolveLocalMountBasePath(tenantId, `ai/cache/${tool}/`, spaceId),
  ]);
  return Object.fromEntries(entries) as Record<SandboxCacheTool, string>;
}
