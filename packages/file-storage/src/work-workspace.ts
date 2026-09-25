import {
  fileStorageSpaceObjectKey,
  fileStorageTenantObjectKey,
} from "./internal-storage-path.js";

/**
 * Tiers that own a durable workspace folder. Thread deliberately has none —
 * a thread's durable output is artifacts; scratch belongs to its task.
 *
 * `space` is the steady container above Project (PLAN-spaces.md); `global`
 * remains the tenant-level tier above it.
 */
export type WorkContainerTier =
  | "task"
  | "routine"
  | "project"
  | "space"
  | "global";

/**
 * `space` and `global` share the `commons` segment on purpose: commons keeps its
 * meaning at BOTH roots. `tenants/<t>/ai/workspace/commons/` is the Global tier's
 * shared folder; `tenants/<t>/spaces/<s>/ai/workspace/commons/` is the space's own.
 * The root, not the segment, is what distinguishes them.
 */
const TIER_SEGMENT: Record<WorkContainerTier, string> = {
  global: "commons", // absorbs the existing /shared prefix — unchanged bytes
  project: "projects",
  routine: "routines",
  space: "commons",
  task: "tasks",
};

/** Container-relative commons folder — `/shared` mount bytes stay here. */
export const COMMONS_STORAGE_PREFIX = "ai/workspace/commons/";

/**
 * The folder inside a Space's commons that the rest of the company may read —
 * `/space/public` in a run, `/company/spaces/<key>/` in every other Space.
 */
export const SPACE_PUBLIC_FOLDER = "public";

/** Container-relative prefix of a Space's public folder. */
export const SPACE_PUBLIC_STORAGE_PREFIX = `${COMMONS_STORAGE_PREFIX}${SPACE_PUBLIC_FOLDER}/`;

/**
 * Full key prefix of the company drive (`/company/files`): the tenant-level
 * commons, which was `/shared` — same bytes, now read-only in every run and
 * written only by people holding `core.company_files.manage`.
 */
export function companyFilesPrefix(tenantId: string): string {
  return workWorkspacePrefix(tenantId, null, "global");
}

/** Full key prefix of a Space's public folder. */
export function spacePublicPrefix(tenantId: string, spaceId: string): string {
  return `${workWorkspacePrefix(tenantId, spaceId, "space")}${SPACE_PUBLIC_FOLDER}/`;
}

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
 * Enforce the biconditional `spaceId === null ⟺ tier === "global"`.
 *
 * Both directions matter. A missing space on a work tier would silently write
 * bytes back to the pre-space tenant root, quietly voiding the containment
 * guarantee; a space passed for `global` means the caller confused the tenant
 * commons with a space's commons, which is a different folder with different
 * reach. Fail loudly on either rather than resolving to a plausible path.
 */
function requireSpace(tier: WorkContainerTier, spaceId: string | null): string {
  if (tier === "global") {
    throw new Error("space_id_forbidden_for_global");
  }
  const trimmed = spaceId?.trim() ?? "";
  if (!trimmed) {
    throw new Error("space_id_required");
  }
  if (trimmed.includes("/") || trimmed.includes("..")) {
    throw new Error("space_id_invalid");
  }
  return trimmed;
}

/**
 * Full object-key prefix.
 *
 * - `global` → `tenants/<t>/ai/workspace/commons/` (tenant-level, spaceId must be null)
 * - `space`  → `tenants/<t>/spaces/<s>/ai/workspace/commons/` (id ignored)
 * - others   → `tenants/<t>/spaces/<s>/ai/workspace/<segment>/<id>/`
 *
 * `spaceId` is a required positional rather than an option bag so the compiler
 * visits every call site when a new tier is threaded through.
 *
 * Ids are opaque strings (task identifiers like `ENG-1`, UUIDs, etc.) —
 * do not assume UUID shape.
 */
export function workWorkspacePrefix(
  tenantId: string,
  spaceId: string | null,
  tier: WorkContainerTier,
  id?: string
): string {
  const trimmedTenant = tenantId.trim();
  if (!trimmedTenant) {
    throw new Error("tenant_id_required");
  }
  const segment = TIER_SEGMENT[tier];
  if (tier === "global") {
    if (spaceId !== null) {
      throw new Error("space_id_forbidden_for_global");
    }
    return `${fileStorageTenantObjectKey(trimmedTenant, "ai", "workspace", segment)}/`;
  }
  const space = requireSpace(tier, spaceId);
  if (tier === "space") {
    return `${fileStorageSpaceObjectKey(trimmedTenant, space, "ai", "workspace", segment)}/`;
  }
  return `${fileStorageSpaceObjectKey(trimmedTenant, space, "ai", "workspace", segment, requireId(tier, id))}/`;
}

/**
 * Container-relative prefix (no `tenants/<t>/` and no `spaces/<s>/`) for mount
 * tables and display paths — the segments BELOW the container root.
 *
 * Unchanged by the space tier on purpose: the space moves the root, not the
 * relative layout, which is what lets mount specs stay space-agnostic.
 */
export function workWorkspaceRelativePrefix(
  tier: WorkContainerTier,
  id?: string
): string {
  const segment = TIER_SEGMENT[tier];
  if (tier === "global" || tier === "space") {
    return COMMONS_STORAGE_PREFIX;
  }
  return `ai/workspace/${segment}/${requireId(tier, id)}/`;
}

const WORKSPACE_SEGMENTS = "tasks|routines|projects|commons";
const SPACE_PREFIX_PATTERN = new RegExp(
  `^tenants/[^/]+/spaces/([^/]+)/ai/workspace/(${WORKSPACE_SEGMENTS})(?:/([^/]+))?(?:/|$)`
);
const FULL_PREFIX_PATTERN = new RegExp(
  `^tenants/[^/]+/ai/workspace/(${WORKSPACE_SEGMENTS})(?:/([^/]+))?(?:/|$)`
);
const RELATIVE_PREFIX_PATTERN = new RegExp(
  `^ai/workspace/(${WORKSPACE_SEGMENTS})(?:/([^/]+))?(?:/|$)`
);

const SEGMENT_TO_TIER: Record<string, WorkContainerTier> = {
  commons: "global",
  projects: "project",
  routines: "routine",
  tasks: "task",
};

export interface ParsedWorkWorkspacePrefix {
  id: string | null;
  /** Present only for space-rooted keys; `null` for tenant-level ones. */
  spaceId: string | null;
  tier: WorkContainerTier;
}

/**
 * Parse a space-rooted, tenant-rooted or container-relative workspace prefix
 * back to tier + id.
 *
 * The `commons` segment resolves to `space` under a space root and to `global`
 * under the tenant root. A container-RELATIVE `ai/workspace/commons/` has no root
 * to disambiguate it and stays `global`, matching how mount specs read it.
 */
export function parseWorkWorkspacePrefix(
  prefix: string
): ParsedWorkWorkspacePrefix | null {
  const spaceMatch = SPACE_PREFIX_PATTERN.exec(prefix);
  if (spaceMatch) {
    const spaceId = spaceMatch[1] ?? null;
    const segment = spaceMatch[2];
    const tier = segment ? SEGMENT_TO_TIER[segment] : undefined;
    if (!(spaceId && tier)) {
      return null;
    }
    if (tier === "global") {
      return { id: null, spaceId, tier: "space" };
    }
    const id = spaceMatch[3] ?? null;
    return id ? { id, spaceId, tier } : null;
  }

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
    return { id: null, spaceId: null, tier };
  }
  const id = match[2] ?? null;
  if (!id) {
    return null;
  }
  return { id, spaceId: null, tier };
}
