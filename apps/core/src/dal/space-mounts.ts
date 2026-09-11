/**
 * `core.space_mount` — mount = grant (PLAN-spaces.md Phase 3).
 *
 * A space declares AVAILABILITY for four resource kinds: modules, agents, skills
 * and connections. Availability is a filter over ONE tenant library, never a copy
 * and never a second store — skills stay at `tenants/<t>/ai/skills/…` and agents
 * stay in `core.agents`; a mount only says which of them this space can touch.
 *
 * Everything that asks "what can this space touch" goes through
 * {@link resolveSpaceResourceSurface}. One function on purpose: the setup dialog
 * shows counts from it and the agent assembler narrows tools from it, and if those
 * were two queries the numbers on screen would eventually lie about what the agent
 * actually got.
 */
import { listModuleDynamicCapabilitySeeds } from "@engenty/ai-core";
import {
  deriveSpaceAgentCapabilities,
  hiredAgentMountKeys,
  isBaselineSpaceMount,
  SPACE_AGENT_LIMIT,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConnectorIdsForConnections } from "./space-connection-lookup.js";

/**
 * Which agents each module OWNS — mounting the module mounts them, so a
 * module's specialists never need (and never get) their own `agent` rows.
 * Read off the in-process AI registrations; an agent whose config disclaims
 * module ownership (`moduleId: null` — copilot, coordinator) is not derived
 * and reaches spaces through the baseline mounts instead.
 */
export function moduleAgentIdsFromSeeds(): ReadonlyMap<
  string,
  readonly string[]
> {
  const map = new Map<string, string[]>();
  for (const seed of listModuleDynamicCapabilitySeeds()) {
    const owned = (seed.agentConfigs ?? [])
      .filter((config) => config.moduleId === seed.moduleId)
      .map((config) => config.id);
    if (owned.length > 0) {
      map.set(seed.moduleId, owned);
    }
  }
  return map;
}

export const SPACE_RESOURCE_TYPES = [
  "module",
  "agent",
  "skill",
  "connection",
] as const;
export type SpaceResourceType = (typeof SPACE_RESOURCE_TYPES)[number];

/** What a mounted module shows by default. Records themselves never move. */
export type SpaceRecordScope = "space" | "all";

/**
 * What this space's engentys may do with the module's data.
 *
 * This is the authoring surface for authorization, not a second authorization
 * system: {@link deriveSpaceAgentCapabilities} turns it into capability ids, and
 * the capability system stays the only thing that decides.
 */
export type SpaceAgentAccess = "none" | "read" | "write";

export interface SpaceMount {
  agentAccess: SpaceAgentAccess | null;
  createdAt: string;
  isRequired: boolean;
  recordScope: SpaceRecordScope | null;
  /** Agent-only: the agent key whose room this agent's reports also land in. */
  reportsTo: string | null;
  resourceKey: string;
  resourceType: SpaceResourceType;
  spaceId: string;
  tenantId: string;
}

export interface SpaceMountInput {
  agentAccess?: SpaceAgentAccess | null;
  isRequired?: boolean;
  recordScope?: SpaceRecordScope | null;
  /** Agent-only. Omitted preserves; null clears. */
  reportsTo?: string | null;
  resourceKey: string;
  resourceType: SpaceResourceType;
}

const COLUMNS =
  "tenant_id, space_id, resource_type, resource_key, record_scope, agent_access, is_required, reports_to, created_at";

interface SpaceMountRow {
  agent_access: string | null;
  created_at: string;
  is_required: boolean;
  record_scope: string | null;
  reports_to: string | null;
  resource_key: string;
  resource_type: string;
  space_id: string;
  tenant_id: string;
}

function mapMount(row: SpaceMountRow): SpaceMount {
  return {
    agentAccess: (row.agent_access as SpaceAgentAccess | null) ?? null,
    createdAt: row.created_at,
    isRequired: row.is_required,
    recordScope: (row.record_scope as SpaceRecordScope | null) ?? null,
    reportsTo: row.reports_to ?? null,
    resourceKey: row.resource_key,
    resourceType: row.resource_type as SpaceResourceType,
    spaceId: row.space_id,
    tenantId: row.tenant_id,
  };
}

function mountsTable(client: SupabaseClient) {
  return client.schema("core").from("space_mount");
}

/**
 * The `agent_access` value a mount is stored with.
 *
 * Module: required by the database, and `none` is the safe default — a module
 * mounted for its pages only. Connection: optional, and an omitted one stays
 * NULL rather than becoming `none`, because `none` on an account is an explicit
 * "engentys get nothing here" while NULL means the space never said. Anything
 * else: NULL, which the database enforces.
 */
function mountAgentAccess(
  input: Pick<SpaceMountInput, "agentAccess" | "resourceType">
): SpaceAgentAccess | null {
  if (input.resourceType === "module") {
    return input.agentAccess ?? "none";
  }
  if (input.resourceType === "connection") {
    return input.agentAccess ?? null;
  }
  return null;
}

export async function listSpaceMounts(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<SpaceMount[]> {
  const result = await mountsTable(client)
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .order("resource_type", { ascending: true })
    .order("resource_key", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceMountRow[]).map(mapMount);
}

/** Thrown when a mount would take a space past {@link SPACE_AGENT_LIMIT}. */
export class SpaceAgentLimitError extends Error {
  constructor(spaceId: string) {
    super(
      `space_agent_limit: this space already has ${SPACE_AGENT_LIMIT} engenties; remove one before hiring another.`
    );
    this.name = "space_agent_limit";
    this.spaceId = spaceId;
  }

  readonly spaceId: string;
}

/**
 * Refuse agent mounts past the per-space limit. `adding` are the agent keys
 * about to be written; keys already mounted (a field-only re-PUT, a setup
 * that re-lists the roster) do not count twice.
 */
export function assertSpaceAgentLimit(
  spaceId: string,
  existing: readonly SpaceMount[],
  adding: readonly string[]
): void {
  const hired = new Set(hiredAgentMountKeys(existing));
  for (const key of adding) {
    if (
      !(
        hired.has(key) ||
        isBaselineSpaceMount({ resourceKey: key, resourceType: "agent" })
      )
    ) {
      hired.add(key);
    }
  }
  if (hired.size > SPACE_AGENT_LIMIT) {
    throw new SpaceAgentLimitError(spaceId);
  }
}

/**
 * Create or update one mount. The caller MUST have already established that the
 * principal administers the tenant — mounting an agent with `agent_access:
 * "write"` hands that agent write access to the space's data, so this is a
 * grant-issuing action (the database refuses a member write too; see the
 * migration).
 */
export async function upsertSpaceMount(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  input: SpaceMountInput
): Promise<SpaceMount> {
  const isModule = input.resourceType === "module";
  if (input.resourceType === "agent") {
    assertSpaceAgentLimit(
      spaceId,
      await listSpaceMounts(client, tenantId, spaceId),
      [input.resourceKey]
    );
  }
  const result = await mountsTable(client)
    .upsert(
      {
        // The database rejects module-only settings on the wrong kind of
        // mount, so normalise here rather than passing a caller's stray value
        // through. A connection mount MAY carry a level and defaults to null —
        // "this space has not decided", which falls back to the account's own
        // `autonomous_mode` (PLAN-connections-ux.md B1).
        agent_access: mountAgentAccess(input),
        // Omitted-preserving: an upsert only updates the columns it names, so
        // a field-only PUT on a baseline-required row must not demote it to
        // removable. Inserts get the column default (false).
        ...(input.isRequired === undefined
          ? {}
          : { is_required: input.isRequired }),
        // Undecided unless a caller says otherwise; nothing reads it yet.
        record_scope: isModule ? (input.recordScope ?? null) : null,
        // Agent-only routing; omitted-preserving like `is_required`, and a
        // non-agent mount always writes null so the check cannot trip.
        ...(input.resourceType === "agent"
          ? input.reportsTo === undefined
            ? {}
            : { reports_to: input.reportsTo }
          : { reports_to: null }),
        resource_key: input.resourceKey,
        resource_type: input.resourceType,
        space_id: spaceId,
        tenant_id: tenantId,
      },
      { onConflict: "tenant_id,space_id,resource_type,resource_key" }
    )
    .select(COLUMNS)
    .single();
  if (result.error) {
    throw result.error;
  }
  return mapMount(result.data as SpaceMountRow);
}

/**
 * Remove a mount. Unmounting HIDES records, it never deletes them — the records
 * live in their module's tables and are only filtered by `record_scope`. Say that
 * out loud wherever this is offered in the UI.
 */
export async function removeSpaceMount(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  resourceType: SpaceResourceType,
  resourceKey: string
): Promise<void> {
  const result = await mountsTable(client)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("resource_type", resourceType)
    .eq("resource_key", resourceKey);
  if (result.error) {
    throw result.error;
  }
}

export interface SpaceResourceSurface {
  /** Agent ids available in this space. */
  agents: string[];
  /**
   * Capability ids the mounts imply for this space's engentys, derived by
   * `deriveSpaceAgentCapabilities` — the ONE rule core and apps/ai share.
   */
  capabilities: string[];
  /**
   * ACCOUNT ids this space's engentys may reach — `module_connections.connections`
   * primary keys, not connector ids (PLAN-spaces.md Phase CN.3).
   *
   * The distinction is the whole point of CN.3: mounting "Gmail" used to grant
   * every Gmail account in the tenant, because the key was the connector. It is
   * now one account per mount, so a space that works `info@company.com` cannot
   * reach a colleague's mailbox that happens to use the same provider.
   */
  connections: string[];
  /**
   * Connector ids the mounted accounts belong to, de-duplicated.
   *
   * Derived, never stored: the AI-side gate recognises a connector operation by
   * tool prefix and needs the connector, while the account-level refusal
   * happens later, once the call's connection is resolved. Both gates, C3a's
   * rule — hiding alone is decoration, refusing alone wastes a turn.
   */
  connectors: string[];
  counts: {
    agents: number;
    connections: number;
    modules: number;
    skills: number;
  };
  /** Modules with their per-space settings, keyed by module id. */
  modules: Array<{
    agentAccess: SpaceAgentAccess;
    isRequired: boolean;
    moduleId: string;
    /** Null on every row today — reserved, see the mount table's column comment. */
    recordScope: SpaceRecordScope | null;
  }>;
  /** Skill names loadable in this space (filter over the tenant library). */
  skills: string[];
  spaceId: string;
  /**
   * Hired engenties that report to nobody here — the explicit `agent` mounts
   * with no `reports_to`, baseline excluded. The assembler gives these the
   * first engenty's setup and hiring tools: a lead may grow the team, a
   * report may not.
   */
  topLevelAgents: string[];
}

/**
 * THE function: everything available in a space, across all four kinds.
 *
 * The setup dialog renders its counts from this and the agent assembler narrows
 * from this. Two queries would drift; one cannot.
 */
export async function resolveSpaceResourceSurface(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<SpaceResourceSurface> {
  const mounts = await listSpaceMounts(client, tenantId, spaceId);
  // The one impure step: a connection mount names an account, and the connector
  // it belongs to lives in the connections module's schema. Resolved here so
  // `surfaceFromMounts` stays a pure projection that tests can drive directly.
  const connectorIds = await resolveConnectorIdsForConnections(
    client,
    tenantId,
    mounts
      .filter((mount) => mount.resourceType === "connection")
      .map((mount) => mount.resourceKey)
  );
  return surfaceFromMounts(
    spaceId,
    mounts,
    connectorIds,
    moduleAgentIdsFromSeeds()
  );
}

/** Pure projection of mount rows onto the surface — the testable half. */
export function surfaceFromMounts(
  spaceId: string,
  mounts: SpaceMount[],
  /** Connector id per mounted connection id; empty when nothing resolved. */
  connectorIdsByConnectionId: ReadonlyMap<string, string> = new Map(),
  /** Agents each mounted module brings with it; see {@link moduleAgentIdsFromSeeds}. */
  agentIdsByModule: ReadonlyMap<string, readonly string[]> = new Map()
): SpaceResourceSurface {
  const modules = mounts
    .filter((mount) => mount.resourceType === "module")
    .map((mount) => ({
      // The database guarantees `agent_access` on a module mount; the fallback
      // is for rows read through a client that predates the constraint.
      // `record_scope` is passed through as-is — it is undecided, and inventing
      // a value here is what the column's own default used to do.
      agentAccess: mount.agentAccess ?? "none",
      isRequired: mount.isRequired,
      moduleId: mount.resourceKey,
      recordScope: mount.recordScope,
    }));
  const keysOf = (type: SpaceResourceType) =>
    mounts
      .filter((mount) => mount.resourceType === type)
      .map((mount) => mount.resourceKey);
  // Mounting a module mounts its agents: the union of explicit `agent` rows
  // (baseline + hired) and the mounted modules' own specialists.
  //
  // Deliberately NOT filtered by tenant module enablement: a tenant-disabled
  // module's agents still derive here, and the module gate refuses their
  // operations at call time. Deriving from a tenant lookup instead would make
  // this projection impure and would hide the agent while its rows, threads
  // and routines still exist.
  const agents = [
    ...new Set([
      ...keysOf("agent"),
      ...modules.flatMap(
        (module) => agentIdsByModule.get(module.moduleId) ?? []
      ),
    ]),
  ];
  const topLevelAgents = mounts
    .filter(
      (mount) =>
        mount.resourceType === "agent" &&
        !mount.reportsTo?.trim() &&
        !isBaselineSpaceMount(mount)
    )
    .map((mount) => mount.resourceKey);
  const skills = keysOf("skill");
  const connections = keysOf("connection");
  // Capabilities stay CONNECTOR-shaped: `module.connections.write.<connectorId>`
  // is the selector CON-02 scopes roles with, and inventing a per-account
  // variant here would produce ids nothing matches. An account whose connector
  // did not resolve contributes nothing — see the lookup's note on failing shut.
  const connectors = [
    ...new Set(
      connections
        .map((connectionId) => connectorIdsByConnectionId.get(connectionId))
        .filter((connectorId): connectorId is string => Boolean(connectorId))
    ),
  ].sort();
  return {
    agents,
    capabilities: deriveSpaceAgentCapabilities({ connectors, modules }),
    connections,
    connectors,
    counts: {
      agents: agents.length,
      connections: connections.length,
      modules: modules.length,
      skills: skills.length,
    },
    modules,
    skills,
    spaceId,
    topLevelAgents,
  };
}
