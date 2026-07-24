import { fileStorageTenantObjectKey } from "./internal-storage-path.js";

/**
 * Tiers that own a durable workspace folder. Thread deliberately has none —
 * a thread's durable output is artifacts; scratch belongs to its task.
 */
export type WorkContainerTier =
  | "task"
  | "routine"
  | "goal"
  | "project"
  | "global";

const TIER_SEGMENT: Record<WorkContainerTier, string> = {
  global: "commons", // absorbs the existing /shared prefix — unchanged bytes
  goal: "goals",
  project: "projects",
  routine: "routines",
  task: "tasks",
};

/** Tenant-relative commons folder — `/shared` mount bytes stay here. */
export const COMMONS_STORAGE_PREFIX = "ai/workspace/commons/";

function requireId(tier: WorkContainerTier, id: string | undefined): string {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`${tier}_id_required`);
  }
  if (trimmed.includes("/") || trimmed.includes("..")) {
    throw new Error(`${tier}_id_invalid`);
  }
  return trimmed;
}

/**
 * Full object-key prefix: `tenants/<t>/ai/workspace/<segment>/<id>/`.
 * Global ignores id and maps to the commons folder.
 *
 * Ids are opaque strings (task identifiers like `ENG-1`, UUIDs, etc.) —
 * do not assume UUID shape.
 */
export function workWorkspacePrefix(
  tenantId: string,
  tier: WorkContainerTier,
  id?: string
): string {
  const trimmedTenant = tenantId.trim();
  if (!trimmedTenant) {
    throw new Error("tenant_id_required");
  }
  const segment = TIER_SEGMENT[tier];
  return tier === "global"
    ? `${fileStorageTenantObjectKey(trimmedTenant, "ai", "workspace", segment)}/`
    : `${fileStorageTenantObjectKey(trimmedTenant, "ai", "workspace", segment, requireId(tier, id))}/`;
}

/**
 * Tenant-relative prefix (no `tenants/<tid>/`) for mount tables and display
 * paths — same segments as {@link workWorkspacePrefix}.
 */
export function workWorkspaceRelativePrefix(
  tier: WorkContainerTier,
  id?: string
): string {
  const segment = TIER_SEGMENT[tier];
  if (tier === "global") {
    return COMMONS_STORAGE_PREFIX;
  }
  return `ai/workspace/${segment}/${requireId(tier, id)}/`;
}

const FULL_PREFIX_PATTERN =
  /^tenants\/[^/]+\/ai\/workspace\/(tasks|routines|goals|projects|commons)(?:\/([^/]+))?(?:\/|$)/;
const RELATIVE_PREFIX_PATTERN =
  /^ai\/workspace\/(tasks|routines|goals|projects|commons)(?:\/([^/]+))?(?:\/|$)/;

const SEGMENT_TO_TIER: Record<string, WorkContainerTier> = {
  commons: "global",
  goals: "goal",
  projects: "project",
  routines: "routine",
  tasks: "task",
};

/** Parse a full or tenant-relative workspace prefix back to tier + id. */
export function parseWorkWorkspacePrefix(prefix: string): {
  tier: WorkContainerTier;
  id: string | null;
} | null {
  const match =
    FULL_PREFIX_PATTERN.exec(prefix) ?? RELATIVE_PREFIX_PATTERN.exec(prefix);
  if (!match) {
    return null;
  }
  const segment = match[1];
  const tier = segment ? SEGMENT_TO_TIER[segment] : undefined;
  if (!tier) {
    return null;
  }
  if (tier === "global") {
    return { tier, id: null };
  }
  const id = match[2] ?? null;
  if (!id) {
    return null;
  }
  return { tier, id };
}
