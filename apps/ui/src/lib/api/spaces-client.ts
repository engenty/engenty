/**
 * Spaces HTTP client (PLAN-spaces.md Phase 3b).
 *
 * The setup dialog needs four catalogs that live in three services: modules from
 * core's plugin registry, agents and skills from the AI service, connectors from
 * the connections module's tool catalog. They are fetched separately on purpose
 * — a single "space catalog" endpoint in core would have to proxy the AI service
 * to build it, which buys one round trip and costs a coupling.
 *
 * The WRITE side is the opposite: one endpoint each for create and edit, both
 * taking the complete desired mount set, because create-only and edit-only
 * writers drift and these carry capability grants.
 */
import { requestApiJson } from "@engenty/api-client";
import type {
  SpaceMountDeclaration,
  SpaceResourceKind,
} from "@engenty/plugin-sdk";
import { request, requestAiJson } from "./client";

export interface Space {
  /** Override of tenant agent-approval mode. Null inherits. */
  agentApprovalMode: "manual" | "auto" | "pass-all" | null;
  color: string | null;
  /** Hosts this space's computer may reach beyond the shared registry list. */
  computerEgressHosts: string[];
  /** Network reach of this space's shared computer. Null inherits the host. */
  computerNetworkTier: "none" | "egress" | null;
  createdAt: string;
  /**
   * When set, the space is marked for deletion. Hidden from the rail; shown on
   * the admin spaces list until the background sweep hard-deletes it.
   */
  deletedAt: string | null;
  /** One line about what this space is for. Shown on its home. */
  description: string | null;
  icon: string | null;
  id: string;
  isDefault: boolean;
  key: string;
  name: string;
  /** Set ⇒ somebody's personal space (PLAN-spaces.md Phase P). */
  ownerUserId: string | null;
  /**
   * Whether the company reads this space's `public/` folder. Null follows the
   * visibility — see {@link spacePublishesToCompany}.
   */
  publishToCompany: boolean | null;
  purgeAfter: string | null;
  tenantId: string;
  visibility: "open" | "private";
}

/**
 * A space this user owns — their personal one.
 *
 * The list `/api/spaces` returns is already membership-filtered server-side, so
 * at most one space here can be owned by the viewer and the check needs no
 * identity of its own. That is deliberate: the UI never decides who may see a
 * space, it only decides how to group what it was given.
 */
export function isPersonalSpace(space: Space): boolean {
  return space.ownerUserId != null;
}

/** Same rule as core: an open team space publishes unless turned off. */
export function spacePublishesToCompany(
  space: Pick<Space, "ownerUserId" | "publishToCompany" | "visibility">
): boolean {
  if (space.publishToCompany !== null) {
    return space.publishToCompany;
  }
  return space.visibility === "open" && space.ownerUserId === null;
}

export interface SpaceMount {
  agentAccess: "none" | "read" | "write" | null;
  createdAt: string;
  isRequired: boolean;
  recordScope: "space" | "all" | null;
  /** For an agent mount: the agent it reports to in THIS space, if any. */
  reportsTo?: string | null;
  resourceKey: string;
  resourceType: SpaceResourceKind;
  spaceId: string;
  tenantId: string;
}

export interface SpaceSurface {
  agents: string[];
  capabilities: string[];
  connections: string[];
  /**
   * Connector ids of the mounted accounts, derived by core. Optional so a UI
   * built against an older surface payload still type-checks.
   */
  connectors?: string[];
  counts: {
    agents: number;
    connections: number;
    modules: number;
    skills: number;
  };
  modules: Array<{
    agentAccess: "none" | "read" | "write";
    isRequired: boolean;
    moduleId: string;
    recordScope: "space" | "all";
  }>;
  skills: string[];
  spaceId: string;
}

export interface SpaceCatalogModule {
  category: string | null;
  description: string | null;
  id: string;
  name: string;
  /** Module ids this one needs mounted alongside it (manifest `requires`). */
  requires?: string[];
}

export interface SpaceSetupCatalog {
  baseline: SpaceMountDeclaration[];
  modules: SpaceCatalogModule[];
  templates: Array<{
    description: string;
    featuredMountKeys?: string[];
    id: string;
    /** Already includes the baseline — post it back unchanged. */
    mounts: SpaceMountDeclaration[];
    name: string;
  }>;
}

/** Wire shape of a mount in a setup payload (snake_case, like the table). */
export interface SpaceMountPayload {
  agent_access?: "none" | "read" | "write";
  record_scope?: "space" | "all";
  resource_key: string;
  resource_type: SpaceResourceKind;
}

export function toSpaceMountPayload(
  mount: SpaceMountDeclaration
): SpaceMountPayload {
  return {
    resource_key: mount.resourceKey,
    resource_type: mount.resourceType,
    ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
    ...(mount.recordScope ? { record_scope: mount.recordScope } : {}),
  };
}

export function getSpaces(
  signal?: AbortSignal,
  options?: { includeDeleted?: boolean }
) {
  const query = options?.includeDeleted ? "?include_deleted=1" : "";
  return request<Space[]>(`/api/spaces${query}`, { signal });
}

export interface SpaceMember {
  createdAt: string;
  displayName: string | null;
  email: string | null;
  role: "member" | "owner";
  spaceId: string;
  userId: string;
}

/** Everyone in a space. Gated on being able to ENTER it, not on being an admin. */
export function getSpaceMembers(spaceId: string, signal?: AbortSignal) {
  return request<SpaceMember[]>(
    `/api/spaces/${encodeURIComponent(spaceId)}/members`,
    { signal }
  );
}

export function addSpaceMember(spaceId: string, userId: string) {
  return request<SpaceMember>(
    `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`,
    { body: {}, method: "PUT" }
  );
}

export function removeSpaceMember(spaceId: string, userId: string) {
  return request<{ removed: boolean }>(
    `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

export function deleteSpace(spaceId: string, confirmName: string) {
  return request<Space>(`/api/spaces/${encodeURIComponent(spaceId)}`, {
    body: { confirm_name: confirmName },
    method: "DELETE",
  });
}

export function restoreSpace(spaceId: string) {
  return request<Space>(`/api/spaces/${encodeURIComponent(spaceId)}/restore`, {
    method: "POST",
  });
}

export interface DirectoryUser {
  displayName: string | null;
  email: string;
  id: string;
}

/**
 * The tenant directory — names and ids, nothing else.
 *
 * Deliberately NOT `/api/users`: that one is `select("*")` and would hand this
 * picker everybody's private phone number and home address to render a list.
 */
export function getUserDirectory(signal?: AbortSignal) {
  return request<DirectoryUser[]>("/api/users/directory", { signal });
}

export interface ResolvedRecordSpace {
  key: string;
  /**
   * `record` — the record really is in this space. `default` — nothing was
   * found and this is the tenant's default space. Keep them apart: only the
   * first justifies rewriting a deep link as if it had always pointed here.
   */
  source: "record" | "default";
  spaceId: string;
}

/** Where a legacy `/mdl/<module>/<record>` link should land. */
export function resolveRecordSpace(
  input: { moduleId: string; recordId?: string },
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ module: input.moduleId });
  if (input.recordId) {
    query.set("recordId", input.recordId);
  }
  return request<ResolvedRecordSpace>(
    `/api/spaces/resolve-record?${query.toString()}`,
    { signal }
  );
}

export function getSpaceSetupCatalog(signal?: AbortSignal) {
  return request<SpaceSetupCatalog>("/api/spaces/setup-catalog", { signal });
}

export function getSpaceMounts(spaceId: string, signal?: AbortSignal) {
  return request<SpaceMount[]>(
    `/api/spaces/${encodeURIComponent(spaceId)}/mounts`,
    { signal }
  );
}

export function getSpaceSurface(spaceId: string, signal?: AbortSignal) {
  return request<SpaceSurface>(
    `/api/spaces/${encodeURIComponent(spaceId)}/surface`,
    { signal }
  );
}

export interface SpaceSetupPayload {
  agent_approval_mode?: "manual" | "auto" | "pass-all" | null;
  color?: string | null;
  computer_egress_hosts?: string[];
  computer_network_tier?: "none" | "egress" | null;
  description?: string | null;
  icon?: string | null;
  mounts: SpaceMountPayload[];
  name: string;
  publish_to_company?: boolean | null;
  visibility?: "open" | "private";
}

/**
 * One module's first-use setup, run by core when the module was mounted (its
 * manifest `mountOperation`). `ready: false` with `needs` or `error` is a
 * placement that stands with a setup that did not finish; re-adding the
 * module retries it.
 */
export interface SpaceMountSetupResult {
  error?: string;
  module_id: string;
  /** What the module says it still lacks (`ai_gateway`, …). */
  needs: string[];
  ready: boolean;
}

export function createSpaceWithSetup(
  payload: SpaceSetupPayload & { key: string }
) {
  return request<{
    mounted: SpaceMountSetupResult[];
    space: Space;
    surface: SpaceSurface;
  }>("/api/spaces", {
    method: "POST",
    body: payload,
  });
}

export function updateSpaceSetup(spaceId: string, payload: SpaceSetupPayload) {
  return request<{
    mounted: SpaceMountSetupResult[];
    removed: Array<{ resourceKey: string; resourceType: SpaceResourceKind }>;
    space: Space;
    surface: SpaceSurface;
  }>(`/api/spaces/${encodeURIComponent(spaceId)}/setup`, {
    method: "PUT",
    body: payload,
  });
}

export function putSpaceSkillPack(spaceId: string, category: string) {
  return request<{ category: string; mounted: string[] }>(
    `/api/spaces/${encodeURIComponent(spaceId)}/skill-packs/${encodeURIComponent(category)}`,
    { method: "PUT" }
  );
}

export function deleteSpaceSkillPack(spaceId: string, category: string) {
  return request<{
    category: string;
    retained: string[];
    unmounted: string[];
  }>(
    `/api/spaces/${encodeURIComponent(spaceId)}/skill-packs/${encodeURIComponent(category)}`,
    { method: "DELETE" }
  );
}

export interface SpaceCatalogAgent {
  /** Generated portrait storage key; blob silhouette when absent. */
  avatarUrl?: string | null;
  /** Declared a sandbox, so a compute placement is meaningful for it. */
  can_execute?: boolean;
  description?: string | null;
  /** Blob character; omitted agents hash a stable kind from their id. */
  engenty?: string | null;
  id: string;
  /** Owning module; the dialog groups by that module's plugin category. */
  managed_by_module?: string | null;
  name: string;
  role?: string;
  skillIds?: string[];
  source?: string;
}

export async function getSpaceAgentCatalog(signal?: AbortSignal) {
  const result = await requestAiJson<{ agents: SpaceCatalogAgent[] }>(
    "/ai/registry/agents",
    { signal }
  );
  return result.agents ?? [];
}

export interface SpaceCatalogSkill {
  category?: string;
  description: string;
  engenty_modules?: string[];
  name: string;
  source?: string;
  tags?: string[];
  tier: "managed" | "custom";
  title?: string;
}

export async function getSpaceSkillCatalog(signal?: AbortSignal) {
  const result = await requestAiJson<{ skills: SpaceCatalogSkill[] }>(
    "/ai/skills",
    { signal }
  );
  return result.skills ?? [];
}

/** One connected account. It belongs to one Space (`space_id`). */
export interface SpaceCatalogConnection {
  display_name?: string | null;
  external_account?: string | null;
  id: string;
  space_id: string;
}

export interface SpaceCatalogConnector {
  actions?: { id: string }[];
  /** Accounts the caller may see, each owned by one Space (`space_id`). */
  connections?: SpaceCatalogConnection[];
  description?: string | null;
  id: string;
  module_id?: string;
  name?: string;
  title?: string;
}

export async function getSpaceConnectorCatalog(signal?: AbortSignal) {
  // The connections module exposes its catalog as a module operation rather than
  // a REST route; this is the same call the tenant connections settings make.
  const result = await requestApiJson<{ connectors: SpaceCatalogConnector[] }>(
    "/api/tools/connections_catalog/invoke",
    { body: { input: {} }, method: "POST", signal }
  );
  return result.connectors ?? [];
}
