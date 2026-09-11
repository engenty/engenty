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
  computer_network_tier?: "none" | "egress" | null;
  description?: string | null;
  icon?: string | null;
  mounts: SpaceMountPayload[];
  name: string;
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

/** One connected account, as the mount picker needs it (Phase CN.3). */
export interface SpaceCatalogConnection {
  display_name?: string | null;
  external_account?: string | null;
  id: string;
  owner_user_id?: string | null;
  sharing?: "org" | "personal";
}

export interface SpaceCatalogConnector {
  /**
   * Accounts connected for this connector that the CALLER may see — the
   * catalog filters to org-shared plus their own. These are what a space
   * mounts; the connector itself is not mountable (Phase CN.3).
   */
  actions?: { id: string }[];
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

export type UserBrowserState = "absent" | "running" | "stopped";

export interface UserBrowserStatus {
  cdpUrl: string;
  sandboxId: string;
  state: UserBrowserState;
}

/** The caller's own browser in this Space — running, asleep, or never started. */
export function readUserBrowser(spaceId: string) {
  return requestAiJson<UserBrowserStatus>(
    `/ai/sandboxes/browser?space_id=${encodeURIComponent(spaceId)}`
  );
}

/**
 * Start (or wake) the caller's own browser in this Space.
 *
 * Declared, never implicit: a chat turn must not conjure a long-lived service,
 * so this call IS the declaration. Idempotent — an already-running browser
 * answers with the same endpoint.
 */
export function startUserBrowser(spaceId: string) {
  return requestAiJson<UserBrowserStatus>("/ai/sandboxes/browser", {
    body: { space_id: spaceId },
    method: "POST",
  });
}

/** Put the caller's browser to sleep; logins stay. */
export function stopUserBrowser(spaceId: string) {
  return requestAiJson<UserBrowserStatus>("/ai/sandboxes/browser/stop", {
    body: { space_id: spaceId },
    method: "POST",
  });
}

/** Stop the caller's browser and forget every login in it. */
export function signOutUserBrowser(spaceId: string) {
  return requestAiJson<UserBrowserStatus>("/ai/sandboxes/browser/sign-out", {
    body: { space_id: spaceId },
    method: "POST",
  });
}

/**
 * A 60 s ticket for ONE live-view connection to the caller's own browser.
 * `ws_url` is path-only (`/ai/v1/browser/stream?ticket=…`); the view
 * resolves it against the AI base URL.
 */
export function mintUserBrowserTicket(spaceId: string) {
  return requestAiJson<{
    sandbox_id: string;
    state: UserBrowserState;
    ws_url: string;
  }>("/ai/sandboxes/browser/ticket", {
    body: { space_id: spaceId },
    method: "POST",
  });
}

export interface SpaceBrowserGrant {
  /** Agents may start the caller's browser here without asking first. */
  autostart: boolean;
  space_id: string;
  /** Agents may drive the caller's browser while the caller is away. */
  unattended: boolean;
}

/** The caller's own consent for their browser in this Space. */
export function getSpaceBrowserGrant(spaceId: string, signal?: AbortSignal) {
  return request<SpaceBrowserGrant>(
    `/api/spaces/${encodeURIComponent(spaceId)}/browser-grant`,
    { signal }
  );
}

/** Patch one or both flags; an omitted flag keeps its value. */
export function putSpaceBrowserGrant(
  spaceId: string,
  patch: Partial<Pick<SpaceBrowserGrant, "autostart" | "unattended">>
) {
  return request<SpaceBrowserGrant>(
    `/api/spaces/${encodeURIComponent(spaceId)}/browser-grant`,
    { body: patch, method: "PUT" }
  );
}
