import type { EngentySpace, EngentySpaceSurface } from "../core-http-client.js";
import type { RunSpace, RunSpaceResolution } from "./run-space.js";

/**
 * Exact unresolved rule emitted in runtime context. Module/connector work is
 * refused for this run; the prompt must not look like a tenant-global session.
 */
export const UNRESOLVED_SPACE_MODULE_WORK_RULE =
  "Do not perform module work. This run claimed a Space but could not resolve it. Module, connector, delegation, and /data tools are refused until the Space is available. This is not a missing app and not a transient catalog miss — do not retry. Platform tools and open-ended chat still work.";

export type SpaceRuntimeRecordScope = "space" | "tenant_shared" | "unspecified";

export function recordScopeLabel(
  recordScope: EngentySpaceSurface["modules"][number]["recordScope"]
): SpaceRuntimeRecordScope {
  if (recordScope === "space") {
    return "space";
  }
  if (recordScope === "all") {
    return "tenant_shared";
  }
  return "unspecified";
}

function formatCurrentSpaceLine(
  space: RunSpace,
  identity: EngentySpace | null | undefined
): string {
  const id = space.spaceId;
  if (!identity) {
    return `- current_space: (${id})`;
  }
  const personal = identity.ownerUserId
    ? " — this is the user's PERSONAL space"
    : "";
  return `- current_space: ${identity.name} (${identity.key}, ${id})${personal}`;
}

function formatMountedModules(surface: EngentySpaceSurface): string[] {
  const mounts = surface.modules
    .filter((mount) => mount.agentAccess !== "none")
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  const lines = ["- space_mounted_modules:"];
  if (mounts.length === 0) {
    lines.push("  (none)");
    return lines;
  }
  for (const mount of mounts) {
    lines.push(
      `  - ${mount.moduleId}: access=${mount.agentAccess}, records=${recordScopeLabel(mount.recordScope)}`
    );
  }
  return lines;
}

function formatNameList(label: string, names: readonly string[]): string {
  const sorted = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return `- ${label}: ${sorted.length > 0 ? sorted.join(", ") : "none"}`;
}

/** Registry identity of a mounted Engenty, for the roster the model reads. */
export interface SpaceAgentIdentity {
  description?: string;
  id: string;
  name: string;
}

const AGENT_DESCRIPTION_MAX = 140;

/**
 * The Space's Engenty roster. Users address agents by display name ("the
 * joker agent"), never by id — an id-only list makes the model ask what a
 * name it was never shown refers to. With identities the roster carries
 * name + one line of purpose; ids the registry could not identify stay as
 * bare ids rather than disappearing.
 */
/** How the team hangs together, as the roster names it per agent. */
export interface SpaceAgentRelations {
  /** Agent id → the agent it reports to (the mount's `reports_to`). */
  reportsTo: ReadonlyMap<string, string>;
  /** Hired engenties whose mount names nobody — the Space's coordinators. */
  topLevel: ReadonlySet<string>;
}

export function spaceAgentRelationsFromSurface(
  surface: Pick<EngentySpaceSurface, "agentReportsTo" | "topLevelAgents">
): SpaceAgentRelations {
  return {
    reportsTo: new Map(Object.entries(surface.agentReportsTo ?? {})),
    topLevel: new Set(surface.topLevelAgents ?? []),
  };
}

/**
 * The relationship tail of one roster line: `reports to X`, `coordinator`,
 * `reports: a, b` — so an agent knows who is above and beside it, and a
 * coordinator knows whose work it answers for. Empty when the Space says
 * nothing about this agent.
 */
export function formatAgentRelationTail(
  id: string,
  relations: SpaceAgentRelations | undefined,
  nameOf: (agentId: string) => string
): string {
  if (!relations) {
    return "";
  }
  const parts: string[] = [];
  const manager = relations.reportsTo.get(id);
  if (manager) {
    parts.push(`reports to ${nameOf(manager)}`);
  } else if (relations.topLevel.has(id)) {
    parts.push("coordinator — reports to nobody, may hire and set up");
  }
  const reports = [...relations.reportsTo.entries()]
    .filter(([, to]) => to === id)
    .map(([from]) => nameOf(from))
    .sort((a, b) => a.localeCompare(b));
  if (reports.length > 0) {
    parts.push(`reports: ${reports.join(", ")}`);
  }
  return parts.length > 0 ? ` [${parts.join("; ")}]` : "";
}

function formatMountedAgents(
  agentIds: ReadonlySet<string>,
  identities: readonly SpaceAgentIdentity[] | undefined,
  relations: SpaceAgentRelations | undefined
): string[] {
  const ids = [...agentIds].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const byId = new Map((identities ?? []).map((meta) => [meta.id, meta]));
  if (ids.length === 0 || byId.size === 0) {
    return [formatNameList("space_mounted_agents", ids)];
  }
  const nameOf = (agentId: string) => byId.get(agentId)?.name ?? agentId;
  const lines = ["- space_mounted_agents (address by id):"];
  for (const id of ids) {
    const meta = byId.get(id);
    const tail = formatAgentRelationTail(id, relations, nameOf);
    if (!meta) {
      lines.push(`  - ${id}${tail}`);
      continue;
    }
    const description = meta.description?.trim().replace(/\s+/g, " ") ?? "";
    const clipped =
      description.length > AGENT_DESCRIPTION_MAX
        ? `${description.slice(0, AGENT_DESCRIPTION_MAX - 1)}…`
        : description;
    lines.push(
      `  - ${id} — ${meta.name}${clipped ? `: ${clipped}` : ""}${tail}`
    );
  }
  return lines;
}

function agentAccessibleModuleIds(surface: EngentySpaceSurface): Set<string> {
  return new Set(
    surface.modules
      .filter((mount) => mount.agentAccess !== "none")
      .map((mount) => mount.moduleId)
  );
}

/**
 * Render the Space facts the model must treat as authoritative for this run.
 * Dynamic: lives in the tail runtime processor, not the cacheable prompt prefix.
 */
export function formatSpaceRuntimeBlock(input: {
  /** Registry identities for the mounted Engentys (id → name/description). */
  agentIdentities?: readonly SpaceAgentIdentity[];
  resolution: RunSpaceResolution;
  spaceIdentity?: EngentySpace | null;
  tenantModuleIds?: readonly string[];
}): string[] {
  const { resolution } = input;
  if (resolution.kind === "unresolved") {
    return [
      "- current_space: unresolved",
      `- ${UNRESOLVED_SPACE_MODULE_WORK_RULE}`,
    ];
  }
  if (resolution.kind === "global") {
    const lines = [
      "- current_space: global",
      "- This run has no Space by design (tenant-global).",
    ];
    appendTenantInstalledModules(lines, input.tenantModuleIds, "global");
    return lines;
  }

  const { space } = resolution;
  const { surface } = space;
  const mountedIds = agentAccessibleModuleIds(surface);
  const tenantModuleIds = input.tenantModuleIds;
  const hasOther = tenantModuleIds
    ? tenantModuleIds.some((id) => !mountedIds.has(id))
    : undefined;

  const lines = [
    formatCurrentSpaceLine(space, input.spaceIdentity),
    ...formatMountedModules(surface),
    ...formatMountedAgents(
      space.agentIds,
      input.agentIdentities,
      spaceAgentRelationsFromSurface(surface)
    ),
    `- space_mounted_connections: ${surface.connections.length}`,
    formatNameList("space_mounted_skills", surface.skills),
  ];
  if (hasOther !== undefined) {
    lines.push(
      `- tenant_has_other_modules: ${hasOther} (not mounted here; do not treat as missing globally)`
    );
  }
  appendTenantInstalledModules(lines, tenantModuleIds, "space");
  return lines;
}

export function formatTenantInstalledModuleLine(
  tenantModuleIds: readonly string[],
  mode: "global" | "space"
): string {
  const sorted = [...tenantModuleIds].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) {
    return "- tenant_installed_modules: none reported by core";
  }
  const note =
    mode === "space"
      ? "not callable from this Space; do not treat an unmounted app as missing globally"
      : "callable in this tenant-global run";
  return `- tenant_installed_modules: ${sorted.join(", ")} (${note})`;
}

function appendTenantInstalledModules(
  lines: string[],
  tenantModuleIds: readonly string[] | undefined,
  mode: "global" | "space"
): void {
  if (!tenantModuleIds) {
    return;
  }
  lines.push(formatTenantInstalledModuleLine(tenantModuleIds, mode));
}
