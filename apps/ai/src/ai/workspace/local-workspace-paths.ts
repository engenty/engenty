import path from "node:path";

import { resolveSpaceDir, resolveSpacesDir } from "@engenty/environment/env";

/**
 * The host root for sandbox staging, Space drives and offline test mounts
 * (`ENGENTY_WORKSPACE_FS=local`) — `ENGENTY_SPACES_DIR`, the one root app-host
 * uses too.
 */
export function resolveEngentyHostRoot(): string {
  return resolveSpacesDir();
}

export function resolveTenantLocalWorkspaceBasePath(tenantId: string): string {
  return path.join(resolveEngentyHostRoot(), "tenants", tenantId.trim());
}

/**
 * Local staging dir for a synced writable mount.
 *
 * `spaceId` is part of the path for the same reason it is part of the storage
 * key: two spaces' commons share the identical RELATIVE path
 * (`ai/workspace/commons/`), so omitting it here would stage both into one
 * directory and let the sandbox sync one space's bytes into another. Staged
 * storage always sits under `ai/`, beside — never inside — the Space drive's
 * own folders.
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
    space
      ? resolveSpaceDir(tenantId, space)
      : resolveTenantLocalWorkspaceBasePath(tenantId),
    ...segments
  );
}

/** The Space drive's own folders — its computer's and its browser's state. */
export type SpaceDriveFolder =
  | "apps"
  | "browser/downloads"
  | "browser/profile"
  | "cache"
  | "home"
  | "sandbox";

/** One folder of a Space's drive (`resolveSpaceDir`). */
export function resolveSpaceDrivePath(
  tenantId: string,
  spaceId: string,
  folder: SpaceDriveFolder
): string {
  return path.join(resolveSpaceDir(tenantId, spaceId), ...folder.split("/"));
}

/** Package managers whose download cache is shared across a space's runs. */
export const SANDBOX_CACHE_TOOLS = ["bun", "npm", "uv"] as const;

export type SandboxCacheTool = (typeof SANDBOX_CACHE_TOOLS)[number];

/**
 * Host dirs holding the package-manager caches.
 *
 * These are the one part of a sandbox that SHOULD outlive its run: an agent
 * that installs pandas in a routine fire should not download it again on the
 * next one. They are a cache in the strict sense — nothing here is durable, and
 * the reaper is free to delete any of them at any time.
 *
 * In the Space drive (`cache/<tool>`) when the run has a space; tenant-rooted
 * (`ai/cache/<tool>`) otherwise.
 */
export function resolveSandboxCachePaths(
  tenantId: string,
  spaceId?: string
): Record<SandboxCacheTool, string> {
  const space = spaceId?.trim();
  const entries = SANDBOX_CACHE_TOOLS.map((tool) => [
    tool,
    space
      ? path.join(resolveSpaceDrivePath(tenantId, space, "cache"), tool)
      : resolveLocalMountBasePath(tenantId, `ai/cache/${tool}/`),
  ]);
  return Object.fromEntries(entries) as Record<SandboxCacheTool, string>;
}
