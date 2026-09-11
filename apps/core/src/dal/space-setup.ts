/**
 * ONE write path for a space's mounts (PLAN-spaces.md Phase 3b).
 *
 * The dialog that creates a space and the dialog that edits one are the same
 * component, so the thing they post has to be the same thing too: a complete
 * desired mount set. Everything else — which rows are new, which changed, which
 * must go — is derived here rather than assembled by the caller, because a
 * create-only writer and an edit-only writer always drift, and this one carries
 * capability grants.
 *
 * Two refusals live in this file, and both are the second half of a rule the
 * dialog already enforces visually:
 *  - a set missing a baseline mount is rejected outright (the checklist's "a
 *    POST that omits it must fail"), and
 *  - a set that would drop an `is_required` row is rejected rather than
 *    silently repaired, so a caller bypassing the dialog hears about it.
 */
import {
  type ModuleMountRequires,
  missingBaselineMounts,
  missingMountDependencies,
  type SpaceMountDeclaration,
  spaceMountKey,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertSpaceAgentLimit,
  listSpaceMounts,
  moduleAgentIdsFromSeeds,
  type SpaceAgentAccess,
  type SpaceMount,
  type SpaceRecordScope,
  type SpaceResourceSurface,
  type SpaceResourceType,
  surfaceFromMounts,
} from "./space-mounts.js";

export interface DesiredSpaceMount {
  agentAccess?: SpaceAgentAccess | null;
  recordScope?: SpaceRecordScope | null;
  resourceKey: string;
  resourceType: SpaceResourceType;
}

/** A mount with the module-only columns settled the way the table stores them. */
export interface NormalizedSpaceMount {
  agentAccess: SpaceAgentAccess | null;
  recordScope: SpaceRecordScope | null;
  resourceKey: string;
  resourceType: SpaceResourceType;
}

export interface SpaceSetupPlan {
  /** Existing rows that are `is_required` and were left out of the desired set. */
  protectedRemovals: NormalizedSpaceMount[];
  /** Rows to delete: present, not desired, not required. */
  remove: NormalizedSpaceMount[];
  /** Rows already correct — reported so a no-op apply is visible as one. */
  unchanged: NormalizedSpaceMount[];
  /** Rows to write: new, or whose module settings changed. */
  upsert: NormalizedSpaceMount[];
}

/**
 * The level a desired mount is stored with.
 *
 * Module: the database requires one, and `none` — mounted for its pages, closed
 * to the space's engentys — is the safe default. Connection: optional since
 * PLAN-connections-ux.md B1, and an omitted one stays NULL, which means "this
 * space has not decided" and falls back to the account's own `autonomous_mode`.
 * `none` on an account is the opposite: an explicit "engentys get nothing here".
 * Agent and skill mounts are availability only and carry nothing.
 */
function desiredAgentAccess(mount: DesiredSpaceMount): SpaceAgentAccess | null {
  if (mount.resourceType === "module") {
    return mount.agentAccess ?? "none";
  }
  if (mount.resourceType === "connection") {
    return mount.agentAccess ?? null;
  }
  return null;
}

/**
 * Settle a desired mount the way the database will store it.
 *
 * The per-kind columns are normalised in one place because
 * `space_mount_module_config_check` and `space_mount_access_config_check`
 * reject both a module mount that omits them and a mount of the wrong kind
 * that carries them — a caller passing either through untouched gets a
 * constraint violation instead of a diff.
 */
export function normalizeDesiredMount(
  mount: DesiredSpaceMount
): NormalizedSpaceMount {
  const isModule = mount.resourceType === "module";
  return {
    agentAccess: desiredAgentAccess(mount),
    // No default. An absent `record_scope` means undecided, not `space` — see
    // `20260812000000_core_space_mount_record_scope_optional.sql`.
    recordScope: isModule ? (mount.recordScope ?? null) : null,
    resourceKey: mount.resourceKey.trim(),
    resourceType: mount.resourceType,
  };
}

function sameSettings(
  desired: NormalizedSpaceMount,
  existing: SpaceMount
): boolean {
  return (
    desired.agentAccess === existing.agentAccess &&
    desired.recordScope === existing.recordScope
  );
}

/**
 * Diff a desired mount set against what the space has. Pure, so the interesting
 * cases (a changed access level, a protected row left out, a set that is already
 * correct) are testable without a database.
 */
export function planSpaceSetup(params: {
  desired: readonly DesiredSpaceMount[];
  existing: readonly SpaceMount[];
}): SpaceSetupPlan {
  const desired = new Map<string, NormalizedSpaceMount>();
  for (const mount of params.desired) {
    const normalized = normalizeDesiredMount(mount);
    if (!normalized.resourceKey) {
      // A blank key would write `module..read` into the grant set.
      continue;
    }
    desired.set(spaceMountKey(normalized), normalized);
  }
  const existing = new Map(
    params.existing.map((mount) => [spaceMountKey(mount), mount] as const)
  );

  const plan: SpaceSetupPlan = {
    protectedRemovals: [],
    remove: [],
    unchanged: [],
    upsert: [],
  };
  for (const [key, mount] of desired) {
    const current = existing.get(key);
    if (!current) {
      plan.upsert.push(mount);
    } else if (sameSettings(mount, current)) {
      plan.unchanged.push(mount);
    } else {
      plan.upsert.push(mount);
    }
  }
  for (const [key, mount] of existing) {
    if (desired.has(key)) {
      continue;
    }
    const dropped: NormalizedSpaceMount = {
      agentAccess: mount.agentAccess,
      recordScope: mount.recordScope,
      resourceKey: mount.resourceKey,
      resourceType: mount.resourceType,
    };
    if (mount.isRequired) {
      plan.protectedRemovals.push(dropped);
    } else {
      plan.remove.push(dropped);
    }
  }
  return plan;
}

/**
 * The desired set for an ADDITIVE apply: everything the space already has, plus
 * what the caller asked for (PLAN-connections-ux.md B2).
 *
 * `applySpaceSetup` reconciles a COMPLETE set, which is right for the dialog —
 * it knows the whole picture — and wrong for every other caller: a chat turn
 * that only knows "add Inbox and this mailbox" would drop every mount it forgot
 * to resend. Merging here means the additive path shares one apply, one
 * baseline check and one diff with the dialog, instead of being a second writer
 * that can disagree with the first.
 *
 * Added mounts win on conflict, which is what makes this the level's writer as
 * well: re-adding a mount with a new access level is how the level changes.
 * Re-adding one WITHOUT a level keeps the level it has — that is how a mount is
 * re-added to retry its module's setup without also resetting its access.
 */
export function mergeDesiredMounts(params: {
  added: readonly DesiredSpaceMount[];
  existing: readonly SpaceMount[];
}): DesiredSpaceMount[] {
  const desired = new Map<string, DesiredSpaceMount>();
  for (const mount of params.existing) {
    desired.set(spaceMountKey(mount), {
      agentAccess: mount.agentAccess,
      recordScope: mount.recordScope,
      resourceKey: mount.resourceKey,
      resourceType: mount.resourceType,
    });
  }
  for (const mount of params.added) {
    const normalized = normalizeDesiredMount(mount);
    if (!normalized.resourceKey) {
      continue;
    }
    const key = spaceMountKey(normalized);
    const current = desired.get(key);
    desired.set(
      key,
      current
        ? {
            ...normalized,
            ...(mount.agentAccess === undefined
              ? { agentAccess: current.agentAccess ?? null }
              : {}),
            ...(mount.recordScope === undefined
              ? { recordScope: current.recordScope ?? null }
              : {}),
          }
        : normalized
    );
  }
  return [...desired.values()];
}

/** An account a module needs but the space does not have (B3). */
export interface UnsatisfiedConnectionNeed {
  capability: SpaceConnectionCapability;
  moduleId: string;
}

/** The connector capabilities a module can declare a need for. */
export type SpaceConnectionCapability = "files" | "storage" | "stream";

/**
 * Which of the added modules still need an account here.
 *
 * "Add Inbox" is an unfinished sentence without a mailbox, and the surface that
 * asked deserves to hear that in the same answer rather than discovering it as
 * an empty page later. OPTIONAL needs are never reported: an app that works
 * without an account must not look broken because one could be added.
 *
 * Nothing is refused on the strength of this — a module may be mounted before
 * its account exists, and often has to be (the account is connected next).
 */
export function unsatisfiedConnectionNeeds(params: {
  /** Module ids in this apply's desired set. */
  moduleIds: readonly string[];
  /** Capability sets of the accounts the space will have after the apply. */
  mountedCapabilities: readonly Readonly<
    Partial<Record<SpaceConnectionCapability, boolean>>
  >[];
  /** Manifest-declared needs, by module id. */
  needsByModule: ReadonlyMap<
    string,
    readonly { capability: SpaceConnectionCapability; required?: boolean }[]
  >;
}): UnsatisfiedConnectionNeed[] {
  const unsatisfied: UnsatisfiedConnectionNeed[] = [];
  for (const moduleId of params.moduleIds) {
    for (const need of params.needsByModule.get(moduleId) ?? []) {
      if (need.required === false) {
        continue;
      }
      const satisfied = params.mountedCapabilities.some(
        (capabilities) => capabilities[need.capability] === true
      );
      if (!satisfied) {
        unsatisfied.push({ capability: need.capability, moduleId });
      }
    }
  }
  return unsatisfied;
}

/** Identity of a mount, which is all a rejection needs to name it. */
type SpaceMountRef = Pick<
  SpaceMountDeclaration,
  "resourceKey" | "resourceType"
>;

export type SpaceSetupErrorCode =
  | "space_setup_missing_required"
  | "space_setup_required_mount_removal"
  | "space_setup_missing_dependency";

export class SpaceSetupError extends Error {
  readonly mounts: readonly SpaceMountRef[];

  constructor(
    code: SpaceSetupErrorCode,
    mounts: readonly SpaceMountRef[],
    detail?: string
  ) {
    super(`${code}: ${detail ?? mounts.map(spaceMountKey).join(", ")}`);
    this.mounts = mounts;
    this.name = code;
  }
}

/**
 * Throw unless every module mount's dependencies are in the set too.
 *
 * `requires` comes from the installed manifests — the same `requires` the
 * plugin installer checks — so a space cannot hold projects without tasks any
 * more than a tenant can. Pure like the baseline assert, for the same reason:
 * a create runs it before the insert.
 */
export function assertSpaceSetupDependencies(
  desired: readonly DesiredSpaceMount[],
  requires: ModuleMountRequires
): void {
  const missing = missingMountDependencies(
    desired.map((mount) => ({
      resourceKey: mount.resourceKey.trim(),
      resourceType: mount.resourceType,
    })),
    requires
  );
  if (missing.length > 0) {
    throw new SpaceSetupError(
      "space_setup_missing_dependency",
      missing.map((entry) => ({
        resourceKey: entry.requires,
        resourceType: "module" as const,
      })),
      missing
        .map((entry) => `${entry.moduleId} requires ${entry.requires}`)
        .join(", ")
    );
  }
}

/**
 * Throw unless the desired set carries every baseline mount.
 *
 * Separate from {@link applySpaceSetup} so a create can run it BEFORE inserting
 * the space row — the check needs no database, and a rejected create that
 * nonetheless leaves a half-made space behind is a worse answer than no space.
 */
export function assertSpaceSetupBaseline(
  desired: readonly DesiredSpaceMount[]
): void {
  const missing = missingBaselineMounts(
    desired.map((mount) => ({
      resourceKey: mount.resourceKey.trim(),
      resourceType: mount.resourceType,
    }))
  );
  if (missing.length > 0) {
    throw new SpaceSetupError("space_setup_missing_required", missing);
  }
}

/**
 * Apply a complete desired mount set to a space and return the resulting
 * surface — the same {@link SpaceResourceSurface} the dialog reads, so a write
 * answers "what does this space have now" without a second round trip that
 * could disagree with the write that just happened.
 *
 * Not a transaction: PostgREST gives us no multi-statement one here. The write
 * order is chosen so a failure halfway leaves a space with MORE mounted than
 * intended rather than less — upserts first, removals after — because an extra
 * app in the Apps tab is a visible annoyance while a missing one silently
 * breaks a space's engentys.
 */
export async function applySpaceSetup(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  desired: readonly DesiredSpaceMount[],
  options: {
    /** Module dependencies to close over; omitted means "not checked". */
    requires?: ModuleMountRequires;
  } = {}
): Promise<{ plan: SpaceSetupPlan; surface: SpaceResourceSurface }> {
  assertSpaceSetupBaseline(desired);
  if (options.requires) {
    assertSpaceSetupDependencies(desired, options.requires);
  }

  const existing = await listSpaceMounts(client, tenantId, spaceId);
  const plan = planSpaceSetup({ desired, existing });
  if (plan.protectedRemovals.length > 0) {
    throw new SpaceSetupError(
      "space_setup_required_mount_removal",
      plan.protectedRemovals
    );
  }

  assertSpaceAgentLimit(
    spaceId,
    existing,
    plan.upsert
      .filter((mount) => mount.resourceType === "agent")
      .map((mount) => mount.resourceKey)
  );

  const table = () => client.schema("core").from("space_mount");
  if (plan.upsert.length > 0) {
    const requiredKeys = new Set(
      existing.filter((mount) => mount.isRequired).map(spaceMountKey)
    );
    const result = await table().upsert(
      plan.upsert.map((mount) => ({
        agent_access: mount.agentAccess,
        // Required-ness belongs to the baseline, not to whoever posted last:
        // preserve it on an existing row and never let a payload set it.
        is_required: requiredKeys.has(spaceMountKey(mount)),
        record_scope: mount.recordScope,
        resource_key: mount.resourceKey,
        resource_type: mount.resourceType,
        space_id: spaceId,
        tenant_id: tenantId,
      })),
      { onConflict: "tenant_id,space_id,resource_type,resource_key" }
    );
    if (result.error) {
      throw result.error;
    }
  }

  // Grouped by kind so this is one statement per resource type rather than one
  // per row; the PK is composite, so a flat `.in()` over keys alone would also
  // match the same key under another kind.
  const removalsByType = new Map<SpaceResourceType, string[]>();
  for (const mount of plan.remove) {
    const keys = removalsByType.get(mount.resourceType) ?? [];
    keys.push(mount.resourceKey);
    removalsByType.set(mount.resourceType, keys);
  }
  for (const [resourceType, keys] of removalsByType) {
    // Unmounting HIDES records; it never deletes them. The records live in
    // their module's own tables and are only filtered by `record_scope`.
    const result = await table()
      .delete()
      .eq("tenant_id", tenantId)
      .eq("space_id", spaceId)
      .eq("resource_type", resourceType)
      .in("resource_key", keys);
    if (result.error) {
      throw result.error;
    }
  }

  const mounts = await listSpaceMounts(client, tenantId, spaceId);
  return {
    plan,
    surface: surfaceFromMounts(
      spaceId,
      mounts,
      new Map(),
      moduleAgentIdsFromSeeds()
    ),
  };
}
