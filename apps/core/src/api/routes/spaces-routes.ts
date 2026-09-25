/**
 * Spaces + space mounts (PLAN-spaces.md Phase 0/3/3b).
 *
 * The write side is ADMIN-ONLY, and not as a nicety: creating a space and
 * mounting into it is a grant-issuing action (a module mounted with
 * `agent_access: "write"` hands the space's engentys write access to that
 * module's data). If any member could do it, the setup dialog would be a
 * privilege-escalation path — the exact thing §1c's "never infer authorization
 * from membership" rules out. Gated here for a useful error, and again by the
 * RLS policy for anything that reaches PostgREST directly.
 *
 * Phase 3b adds the setup path the dialog actually uses: POST a space WITH its
 * mount set, PUT the same shape to edit one. Both land in `applySpaceSetup`, so
 * create and edit are one write path rather than two that drift.
 */

import {
  COMPUTER_EGRESS_HOSTS_MAX,
  type ModuleMountRequires,
  moduleMountDependents,
  moduleMountRequiresFromPlugins,
  parseComputerEgressHost,
  SPACE_BASELINE_MOUNTS,
  SPACE_TEMPLATES,
  spaceTemplateMounts,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createCoreUsersDal } from "../../dal/core-users.js";
import { getSpaceBrowserGrant } from "../../dal/space-browser-grants.js";
import {
  addSpaceMember,
  claimOrphanedSpace,
  findAccessibleSpace,
  listAccessibleSpaces,
  listSpaceMembers,
  listSpacesForUser,
  removeSpaceMember,
} from "../../dal/space-membership.js";
import {
  listSpaceMounts,
  moduleAgentIdsFromSeeds,
  removeSpaceMount,
  resolveSpaceResourceSurface,
  SPACE_RESOURCE_TYPES,
  SpaceAgentLimitError,
  upsertSpaceMount,
} from "../../dal/space-mounts.js";
import {
  findSpaceIdForRecord,
  hasSpaceRecordSource,
} from "../../dal/space-record-lookup.js";
import {
  applySpaceSetup,
  assertSpaceSetupBaseline,
  assertSpaceSetupDependencies,
  type DesiredSpaceMount,
  mergeDesiredMounts,
  type SpaceConnectionCapability,
  SpaceSetupError,
  unsatisfiedConnectionNeeds,
} from "../../dal/space-setup.js";
import {
  mountLibrarySkillPack,
  UnknownSkillPackError,
  unmountLibrarySkillPack,
} from "../../dal/space-skill-packs.js";
import {
  createSpace,
  getDefaultSpace,
  getSpaceById,
  getSpaceByKey,
  listMarkedDeletedSpaces,
  markSpaceDeleted,
  restoreSpace,
  type Space,
  updateSpace,
} from "../../dal/spaces.js";
import { createDatabaseAdapter } from "../../infra/index.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireAuth, requireSuperAdmin } from "./authz.js";

/**
 * The subject a space-access check runs as.
 *
 * A non-user principal (agent token, service token) has no membership rows, and
 * the nil UUID is guaranteed to own nothing and be a member of nothing — so it
 * resolves exactly the OPEN spaces and never a personal one. Using a real
 * sentinel rather than a `null` branch keeps one code path: there is no version
 * of this that accidentally skips the filter for a headless caller.
 *
 * It is also the same nil UUID the server lane's own JWT carries, which is the
 * reason this check cannot live in RLS in the first place.
 */
const NIL_USER_ID = "00000000-0000-0000-0000-000000000000";

const logger = createLogger({ name: "spaces-routes" });

/** `x-engenty-task-id` must be a task UUID; anything else is ignored. */

const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function accessSubject(auth: {
  principalType: string;
  userId: string | null;
}): string {
  return auth.principalType === "user" && auth.userId
    ? auth.userId
    : NIL_USER_ID;
}

/** The slice of a Hono context these handlers use (authz.ts keeps its own copy). */
interface RouteContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    param: (name: string) => string;
  };
}

/** The slice of the plugin registry this file reads. */
interface SpacesRoutesRegistry {
  plugins: Array<{
    category?: string | undefined;
    /** Accounts this module needs, by connector capability (B3/B3b). */
    connections?: Array<{
      bindOperation?: string;
      capability: SpaceConnectionCapability;
      required?: boolean;
    }>;
    description?: string | undefined;
    enabled?: boolean;
    id: string;
    kind?: string;
    /** Manifest `mountOperation` — runs once per space mount, see `runModuleMountOperations`. */
    mountOperation?: string;
    name?: string | undefined;
    placement?: string;
    /** Manifest `requires` — `module.<id>` entries become mount dependencies. */
    requires?: string[];
    rootDir?: string;
    ui?: unknown;
  }>;
}

/** Nested `modules/<parent>/providers/<child>` plugins are not space apps. */
function isNestedProviderPlugin(rootDir: string | undefined): boolean {
  return Boolean(rootDir?.split(/[/\\]/).includes("providers"));
}

const mountBodySchema = z.object({
  agent_access: z.enum(["none", "read", "write"]).optional(),
  is_required: z.boolean().optional(),
  record_scope: z.enum(["space", "all"]).optional(),
  /** Agent mounts only: the agent this one reports to. Null clears. */
  reports_to: z.string().min(1).max(256).nullable().optional(),
  resource_key: z.string().min(1).max(256),
  resource_type: z.enum(SPACE_RESOURCE_TYPES),
});

const setupMountSchema = z.object({
  agent_access: z.enum(["none", "read", "write"]).optional(),
  record_scope: z.enum(["space", "all"]).optional(),
  resource_key: z.string().min(1).max(256),
  resource_type: z.enum(SPACE_RESOURCE_TYPES),
});

/**
 * The additive body: what to ADD, never the whole picture
 * (PLAN-connections-ux.md B2). Same mount shape as the dialog posts, so one
 * vocabulary describes a space's setup wherever it is written from.
 */
const setupAddBodySchema = z.object({
  mounts: z.array(setupMountSchema).min(1).max(100),
});

const createSpaceBodySchema = z.object({
  color: z.string().max(64).nullable().optional(),
  // Emoji/initials stay tiny; uploaded tiles are a compressed JPEG data URL.
  icon: z.string().max(24_000).nullable().optional(),
  key: z.string().min(1).max(63),
  // Optional so the Phase 3 shape (bare create, mounts posted after) still
  // works; when present it goes through the same reconciliation as an edit.
  mounts: z.array(setupMountSchema).max(400).optional(),
  name: z.string().min(1).max(200),
  visibility: z.enum(["open", "private"]).optional(),
});

const spaceSetupBodySchema = z.object({
  agent_approval_mode: z
    .enum(["manual", "auto", "pass-all"])
    .nullable()
    .optional(),
  color: z.string().max(64).nullable().optional(),
  computer_network_tier: z.enum(["none", "egress"]).nullable().optional(),
  /** Replaces the Space computer's extra egress hosts (the whole list). */
  computer_egress_hosts: z
    .array(
      z.string().refine((host) => parseComputerEgressHost(host) !== null, {
        message: "space_egress_host_invalid",
      })
    )
    .max(COMPUTER_EGRESS_HOSTS_MAX)
    .optional(),
  /** One line about what this space is for; shown on its home. */
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(24_000).nullable().optional(),
  /**
   * Re-key the space. Breaks its `/s/<key>/…` links, so the setup dialog never
   * sends it — the initial-setup wizard does, keying the default space off the
   * team's name while it is still the placeholder `company`.
   */
  key: z.string().min(1).max(63).optional(),
  mounts: z.array(setupMountSchema).max(400),
  name: z.string().min(1).max(200).optional(),
  visibility: z.enum(["open", "private"]).optional(),
});

const spaceMemberBodySchema = z.object({
  role: z.enum(["member", "owner"]).optional(),
});

/**
 * Note that an admin reached into a space nobody else can see.
 *
 * Written on the same tenant-locked handle as the change itself, so a claim that
 * succeeds and an audit row that does not are the same transaction's problem —
 * an unaudited claim is the one outcome this feature must not have.
 */
async function recordAuditEvent(
  client: SupabaseClient,
  event: {
    action: string;
    actorUserId: string;
    targetId: string;
    tenantId: string;
  }
): Promise<void> {
  const { error } = await client
    .schema("core")
    .from("audit_events")
    .insert({
      actor_id: event.actorUserId,
      detail: { space_id: event.targetId },
      source_component: "spaces-routes",
      source_kind: "core",
      tenant_id: event.tenantId,
      type: event.action,
    } as never);
  if (error) {
    throw error;
  }
}

function toDesiredMounts(
  mounts: z.infer<typeof setupMountSchema>[]
): DesiredSpaceMount[] {
  return mounts.map((mount) => ({
    resourceKey: mount.resource_key,
    resourceType: mount.resource_type,
    ...(mount.agent_access ? { agentAccess: mount.agent_access } : {}),
    ...(mount.record_scope ? { recordScope: mount.record_scope } : {}),
  }));
}

function readBearer(c: RouteContext): string | undefined {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return;
  }
  return header.slice(7).trim() || undefined;
}

/** One module's first-use setup for a space, as `mounted[]` in a setup answer. */
export interface SpaceMountSetupResult {
  error?: string;
  module_id: string;
  /** What the module says it still lacks (`ai_gateway`, …). */
  needs: string[];
  ready: boolean;
}

/**
 * The person who made a shared space is in it.
 *
 * Nothing else writes a member row on create: an open space needs none to be
 * enterable, so its roster — what the People section, the room picker and the
 * composer's `@` list read — would start empty in a space somebody is actively
 * working in. `owner` because they made it; the row also survives the space
 * later going private, which is the case where the creator would otherwise be
 * locked out of their own space.
 *
 * A personal space never reaches here (it is created by a database trigger, and
 * `core.forbid_personal_space_member` refuses member rows on one). A failed
 * write is logged rather than fatal — the space exists and is usable while it
 * is open, and losing the create over a roster row would be worse.
 */
async function addCreatorMemberRow(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  auth: { principalType: string; userId: string | null }
): Promise<void> {
  if (auth.principalType !== "user" || !auth.userId) {
    return;
  }
  try {
    await addSpaceMember(client, tenantId, spaceId, auth.userId, "owner");
  } catch (error) {
    logger.warn("Space create: creator member row failed", {
      error: error instanceof Error ? error.message : String(error),
      space_id: spaceId,
    });
  }
}

export function registerSpacesRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  /**
   * Tenant-locked handle (`engenty_server`, NOBYPASSRLS). Preferred over the
   * service client so the tenant wall is the database's problem here too; the
   * fallback keeps dev bootstraps without a JWT secret working.
   */
  getTenantDb?: ((auth: { tenantId: string }) => SupabaseClient) | null;
  /**
   * Invoke another module's operation in-process AS THIS CALLER
   * (PLAN-connections-ux.md C1). Injected rather than imported so this file
   * keeps no opinion about the operation pipeline, and so the tests can build
   * the routes without one.
   *
   * Two things run through it: a module's `bindOperation` for an account it
   * can now use, and a module's `mountOperation` for a fresh mount. Each write
   * belongs to the module that owns the table, so placing something in a
   * space cannot become a way around who may change it.
   */
  callOperation?: (input: {
    auth: unknown;
    input: unknown;
    operationId: string;
  }) => Promise<unknown>;
  registry?: SpacesRoutesRegistry;
}) {
  const { app, config } = params;

  /**
   * `tenantAdmin` covers superadmins and tenant-membership admins. A failed
   * lookup means "not admin" rather than 5xx — the route then returns 403,
   * which is the safe answer for a grant-issuing endpoint.
   */
  async function requireTenantAdmin(c: RouteContext) {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult;
    }
    const { auth } = authResult;
    if (auth.isSuperAdmin) {
      return { auth };
    }
    const bearer = readBearer(c);
    let isAdmin = false;
    if (bearer) {
      try {
        isAdmin = await createCoreUsersDal(config).isAuthUserAdmin(bearer);
      } catch {
        isAdmin = false;
      }
    }
    if (!isAdmin) {
      return {
        error: jsonApiError(c, 403, {
          message:
            "Only a tenant admin may create spaces or change their mounts — mounting issues capability grants.",
        }),
      };
    }
    return { auth };
  }

  /**
   * Resolve `:spaceId` (an id or a key) for the caller, or fail the request.
   *
   * The one seam every space-scoped server path goes through. It exists because
   * RLS cannot do this job here: the tenant-locked handle authenticates as the
   * server, whose JWT subject is the nil UUID, so the database sees a tenant and
   * never a user (PLAN-spaces.md Phase P2).
   *
   * **A space the caller may not enter is 404, never 403.** 403 would confirm the
   * space exists; personal spaces are named after people, so that alone leaks who
   * works here and that they have something at that key. "Not found" is the same
   * answer a made-up key gets, which is the point.
   *
   * A non-user principal (agent, service token) has no membership to check. It
   * gets open spaces only — never somebody's personal one — so a headless caller
   * enumerating spaces cannot become a way around this.
   */
  async function requireSpaceAccess(
    c: RouteContext,
    tenantId: string,
    auth: { principalType: string; userId: string | null },
    idOrKey: string
  ): Promise<{ error: Response } | { space: Space }> {
    const space = await findAccessibleSpace(
      db(tenantId),
      tenantId,
      accessSubject(auth),
      idOrKey
    );
    return space
      ? { space }
      : { error: jsonApiError(c, 404, { message: "Space not found" }) };
  }

  /**
   * Headless task lane: the space a dispatched run may see is the one its TASK
   * lives in (PLAN-spaces.md C3a — the core half of `resolveRunSpaceById`).
   *
   * A task run rides the AI service token, whose subject is the nil UUID, so
   * `requireSpaceAccess` resolves open spaces only and every routine standing
   * in a PRIVATE space came back `unresolved` — the run then refused all
   * module work in the very space its task belongs to. There is no client
   * claim to distrust here: apps/ai reads the space off the task row
   * server-side and forwards the task id as `x-engenty-task-id`.
   *
   * The header is honoured only for a NON-USER principal, and it does not name
   * a space — it names a task, and the task's own `space_id` (looked up here,
   * tenant-scoped) must be the space being requested. A forged id therefore
   * unlocks nothing beyond what that task already legitimizes, and a user
   * token can never widen itself with it. Returns null (→ the caller keeps its
   * 404) whenever the path does not apply.
   */
  async function findTaskBoundSpace(
    c: RouteContext,
    tenantId: string,
    auth: { principalType: string; userId: string | null },
    idOrKey: string
  ): Promise<Space | null> {
    if (auth.principalType === "user") {
      return null;
    }
    const taskId = c.req.header("x-engenty-task-id")?.trim();
    if (!(taskId && TASK_ID_PATTERN.test(taskId))) {
      return null;
    }
    const client = db(tenantId);
    const taskSpaceId = await findSpaceIdForRecord(client, {
      moduleId: "tasks",
      recordId: taskId,
      tenantId,
    });
    if (!taskSpaceId) {
      return null;
    }
    const space = await getSpaceById(client, tenantId, taskSpaceId);
    if (!space) {
      return null;
    }
    const requested = idOrKey.trim();
    return space.id === requested ||
      space.key.toLowerCase() === requested.toLowerCase()
      ? space
      : null;
  }

  /**
   * The same exemption for a ROUTINE fire, which has no task to name.
   *
   * A routine's runs used to ride a standing task, so `findTaskBoundSpace`
   * above covered them for free. Now a fire produces a Run and nothing else,
   * and without this a routine in a PRIVATE space resolves `unresolved` and
   * refuses every module tool in the very space it belongs to — the run
   * "succeeds" having read nothing, which reads as success and is not.
   *
   * The safety argument is unchanged: honoured only for a NON-USER principal,
   * the header names a routine rather than a space, and the routine's own
   * `space_id` (looked up here, tenant-scoped) must be the space requested. A
   * forged id unlocks nothing beyond what that routine already legitimizes.
   */
  async function findRoutineBoundSpace(
    c: RouteContext,
    tenantId: string,
    auth: { principalType: string; userId: string | null },
    idOrKey: string
  ): Promise<Space | null> {
    if (auth.principalType === "user") {
      return null;
    }
    const routineId = c.req.header("x-engenty-routine-id")?.trim();
    if (!(routineId && TASK_ID_PATTERN.test(routineId))) {
      return null;
    }
    const client = db(tenantId);
    const { data, error } = await client
      .schema("ai")
      .from("routines")
      .select("space_id")
      .eq("id", routineId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const routineSpaceId = error
      ? null
      : (data as { space_id: string | null } | null)?.space_id;
    if (!routineSpaceId) {
      return null;
    }
    const space = await getSpaceById(client, tenantId, routineSpaceId);
    if (!space) {
      return null;
    }
    const requested = idOrKey.trim();
    return space.id === requested ||
      space.key.toLowerCase() === requested.toLowerCase()
      ? space
      : null;
  }

  /**
   * The gate for editing an EXISTING space's setup: its own owner, or a tenant
   * admin.
   *
   * Adding the owner is not a loosening of the admin rule, it is the admin rule
   * applied to a case it did not anticipate. Setup is admin-only because mounting
   * issues capability grants, so a member could otherwise hand an agent write
   * access to everyone's data. Inside a personal space that argument has no
   * subject: the space's entire contents belong to the one person doing the
   * mounting, and they may already read all of it.
   *
   * Without this, personal spaces would be permanently unconfigurable — admins
   * cannot see them (they are private and admins get no bypass), so the admin-only
   * rule alone leaves nobody at all able to edit one.
   */
  async function requireSpaceSetupAccess(
    c: RouteContext,
    tenantId: string,
    auth: { principalType: string; userId: string | null },
    idOrKey: string
  ): Promise<{ error: Response } | { space: Space }> {
    const access = await requireSpaceAccess(c, tenantId, auth, idOrKey);
    if ("error" in access) {
      return access;
    }
    if (access.space.ownerUserId && access.space.ownerUserId === auth.userId) {
      return access;
    }
    const adminResult = await requireTenantAdmin(c);
    return "error" in adminResult ? { error: adminResult.error } : access;
  }

  function db(tenantId: string) {
    if (params.getTenantDb) {
      return params.getTenantDb({ tenantId });
    }
    const client = createDatabaseAdapter(config);
    if (!client) {
      throw new Error("spaces_routes_requires_database");
    }
    return client;
  }

  /**
   * Modules offered as a choice when creating or editing a space.
   *
   * Filters beyond "installed and enabled":
   *  - **no UI bundle, not an app.** Connector providers
   *    (`connections-google`, `connections-slack`, …) and sync workers ship no
   *    UI; they are reachable through the CONNECTION kind, and listing them as
   *    apps would offer the same thing twice under two names.
   *  - **category `platform`, not an app.** Platform plugins are infrastructure
   *    for the install, not something a space contains.
   *  - **placement `settings`, not a choice.** Supporting modules (PDF
   *    Templates, Commercial Settings, Company Profile, Team, Team HR,
   *    Browser Bridge, Remote) exist because other modules need them, or
   *    they are infrastructure. Their UI lives in Settings. They stay
   *    mountable (validation is against every installed plugin) so an existing
   *    space that already has one can still save.
   *  - **nested `providers/`, not a choice.** Connector and bridge plugins
   *    under `modules/<parent>/providers/<child>` (Slack Bridge, Connections
   *    — External, Local Files, …) belong to the parent module. Listing them
   *    as apps would offer the same capability twice.
   *
   * `placement` is otherwise NOT a mountability gate. A `space` or `global`
   * module is routinely offered (contacts is one address book per tenant,
   * mounted per space). Filtering this list down to `placement === "space"`
   * would silently hide those.
   *
   * Baseline modules (Copilot, Plan, Files, Memory, Connections) stay in this
   * catalog so review and settings can name them; the picker hides locked rows.
   */
  /**
   * Module mount dependencies, from the installed manifests. Read per
   * request, not cached: the registry reloads plugins in place.
   */
  function moduleRequires(): ModuleMountRequires {
    return moduleMountRequiresFromPlugins(params.registry?.plugins ?? []);
  }

  function mountableModules() {
    const requires = moduleRequires();
    return (params.registry?.plugins ?? [])
      .filter((plugin) => (plugin.kind ?? "module") === "module")
      .filter((plugin) => plugin.enabled !== false)
      .filter((plugin) => plugin.ui != null)
      .filter((plugin) => plugin.category !== "platform")
      .filter((plugin) => plugin.placement !== "settings")
      .filter((plugin) => !isNestedProviderPlugin(plugin.rootDir))
      .map((plugin) => ({
        category: plugin.category ?? null,
        description: plugin.description ?? null,
        id: plugin.id,
        name: plugin.name ?? plugin.id,
        // The wizard ticks these along with the module (and refuses to drop
        // them while it stays), so the server's refusal is one it never sees.
        requires: [...(requires.get(plugin.id) ?? [])],
      }));
  }

  /**
   * Reject a module mount whose id is not an installed plugin.
   *
   * Validated against EVERY installed plugin, not against `mountableModules()`:
   * that list is a display heuristic, and validating against it would make a
   * space with a module the heuristic now hides unsaveable — the edit dialog
   * would post back what it was given and get a 400 for it.
   *
   * Only modules: agents and skills live in the AI service's registries, which
   * core cannot see from here, so those keys are taken on trust (an unknown one
   * mounts a resource that simply never resolves — visible, not dangerous).
   */
  function unknownModuleKeys(mounts: DesiredSpaceMount[]): string[] {
    const known = new Set(
      (params.registry?.plugins ?? []).map((plugin) => plugin.id)
    );
    if (known.size === 0) {
      // No registry wired (tests, bootstraps) — validating against an empty set
      // would reject everything, including the baseline.
      return [];
    }
    return mounts
      .filter((mount) => mount.resourceType === "module")
      .map((mount) => mount.resourceKey)
      .filter((key) => !known.has(key));
  }

  /**
   * Agent keys the AI registry does not know, or `[]` when it cannot say.
   *
   * The registry lives in the AI service; the caller's own bearer is
   * forwarded, and any failure to reach or read it DEGRADES TO ACCEPT — a
   * mount validated best-effort beats a setup dialog that breaks whenever
   * apps/ai restarts. An unknown key that slips through mounts a resource
   * that never resolves: visible, not dangerous.
   */
  async function unknownAgentKeys(
    authorization: string | undefined,
    mounts: DesiredSpaceMount[]
  ): Promise<string[]> {
    const agentKeys = mounts
      .filter((mount) => mount.resourceType === "agent")
      .map((mount) => mount.resourceKey);
    if (agentKeys.length === 0 || !authorization) {
      return [];
    }
    const aiBaseUrl = (
      (config.aiBaseUrl as string) ||
      process.env.ENGENTY_AI_BASE_URL ||
      process.env.VITE_ENGENTY_AI_BASE_URL ||
      ""
    ).replace(/\/$/, "");
    if (!aiBaseUrl) {
      return [];
    }
    try {
      const response = await fetch(`${aiBaseUrl}/ai/registry/agents`, {
        headers: { accept: "application/json", authorization },
      });
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as {
        agents?: Array<{ id?: string }>;
      };
      const known = new Set(
        (data.agents ?? [])
          .map((agent) => agent.id)
          .filter((id): id is string => Boolean(id))
      );
      if (known.size === 0) {
        return [];
      }
      return agentKeys.filter((key) => !known.has(key));
    } catch {
      return [];
    }
  }

  /** Manifest-declared account needs, by module id. */
  function connectionNeedsByModule(): Map<
    string,
    Array<{
      bindOperation?: string;
      capability: SpaceConnectionCapability;
      required?: boolean;
    }>
  > {
    return new Map(
      (params.registry?.plugins ?? [])
        .filter((plugin) => plugin.connections?.length)
        .map((plugin) => [plugin.id, plugin.connections ?? []])
    );
  }

  /**
   * What each account in this space CAN BE to a module — `stream` for a
   * mailbox, `files`/`storage` for a drive.
   *
   * Answered from the connector CATALOG, because `stream` has no operations of
   * its own and cannot be inferred from anything a connection row carries.
   * `null` means "could not check", which callers must not read as "nothing is
   * here".
   */
  async function readSpaceAccountCapabilities(input: {
    auth: unknown;
    surface: { connections: string[] };
  }): Promise<Map<
    string,
    Partial<Record<SpaceConnectionCapability, boolean>>
  > | null> {
    if (!params.callOperation) {
      return null;
    }
    let catalog: unknown;
    try {
      catalog = await params.callOperation({
        auth: input.auth,
        input: {},
        operationId: "connections_catalog",
      });
    } catch {
      return null;
    }
    const connectors = (
      catalog as {
        connectors?: Array<{
          capabilities?: Partial<Record<SpaceConnectionCapability, boolean>>;
          connections?: Array<{ id: string }>;
        }>;
      } | null
    )?.connectors;
    if (!connectors) {
      return null;
    }
    const inSpace = new Set(input.surface.connections);
    const byConnection = new Map<
      string,
      Partial<Record<SpaceConnectionCapability, boolean>>
    >();
    for (const connector of connectors) {
      for (const connection of connector.connections ?? []) {
        if (inSpace.has(connection.id)) {
          byConnection.set(connection.id, connector.capabilities ?? {});
        }
      }
    }
    return byConnection;
  }

  /**
   * Apps in this space that declare they need an account, with nothing here
   * that provides it (PLAN-connections-ux.md B3).
   *
   * Never a refusal: mounting the app before its account is the normal order,
   * and the caller needs to hear what is still missing in the same answer
   * rather than discovering it as an empty page later. OPTIONAL needs are not
   * reported — an app that works without an account must not look broken.
   */
  function resolveNeedsConnect(input: {
    added: readonly DesiredSpaceMount[];
    capabilities: Awaited<ReturnType<typeof readSpaceAccountCapabilities>>;
  }):
    | Array<{ capability: SpaceConnectionCapability; module_id: string }>
    | undefined {
    const moduleIds = addedModuleIds(input.added);
    if (moduleIds.length === 0) {
      return;
    }
    const needsByModule = connectionNeedsByModule();
    if (moduleIds.every((moduleId) => !needsByModule.has(moduleId))) {
      return [];
    }
    if (!input.capabilities) {
      // "We could not check" and "nothing is missing" must not read the same.
      return;
    }
    // The wire shape says `module_id`, like every other id this API answers.
    return unsatisfiedConnectionNeeds({
      moduleIds,
      mountedCapabilities: [...input.capabilities.values()],
      needsByModule,
    }).map((need) => ({
      capability: need.capability,
      module_id: need.moduleId,
    }));
  }

  function addedModuleIds(added: readonly DesiredSpaceMount[]): string[] {
    return added
      .filter((mount) => mount.resourceType === "module")
      .map((mount) => mount.resourceKey);
  }

  /**
   * Make each app in this space actually USE the accounts here
   * (PLAN-connections-ux.md B3b).
   *
   * Mounting a mailbox and adding Inbox leaves two rows and no mail. The
   * module's own binding — a sync state row, a file source — is the step that
   * turns availability into something that works, and it belongs to the module:
   * core calls the operation the manifest names, in-process as this caller, so
   * the module's own capability check and audit trail still apply.
   *
   * Only apps added by THIS call are bound. Re-binding every app to every
   * account on each edit would make a rename re-pull mailboxes. An account
   * connected later into a space that already has the app is bound by the
   * connections module when the account is created there.
   *
   * An app that declares a `mountOperation` binds the space's accounts inside
   * that operation — running the pair binding as well would pull every mailbox
   * twice.
   *
   * A failing bind never fails the setup: the mounts are correct and the caller
   * is told which app could not finish, which is the more useful answer than
   * undoing a placement someone asked for.
   */
  async function bindModuleAccounts(input: {
    added: readonly DesiredSpaceMount[];
    auth: unknown;
    capabilities: Awaited<ReturnType<typeof readSpaceAccountCapabilities>>;
    spaceId: string;
    surface: { connections: string[]; modules: Array<{ moduleId: string }> };
  }): Promise<
    Array<{ connection_id: string; error?: string; module_id: string }>
  > {
    const bound: Array<{
      connection_id: string;
      error?: string;
      module_id: string;
    }> = [];
    if (!(params.callOperation && input.capabilities)) {
      return bound;
    }
    const needsByModule = connectionNeedsByModule();
    const addedModules = new Set(addedModuleIds(input.added));
    const mountOperationById = new Map(
      (params.registry?.plugins ?? []).map((plugin) => [
        plugin.id,
        plugin.mountOperation,
      ])
    );
    for (const module of input.surface.modules) {
      if (
        !addedModules.has(module.moduleId) ||
        mountOperationById.get(module.moduleId)
      ) {
        continue;
      }
      for (const need of needsByModule.get(module.moduleId) ?? []) {
        if (!need.bindOperation) {
          continue;
        }
        for (const [connectionId, capabilities] of input.capabilities) {
          if (capabilities[need.capability] !== true) {
            continue;
          }
          try {
            await params.callOperation({
              auth: input.auth,
              // The space rides along because a binding is per space for some
              // modules (a drive's folder in THIS space's Files) and tenant-wide
              // for others (a mailbox's sync state). A module that does not need
              // it ignores it.
              input: { connection_id: connectionId, space_id: input.spaceId },
              operationId: need.bindOperation,
            });
            bound.push({
              connection_id: connectionId,
              module_id: module.moduleId,
            });
          } catch (error) {
            bound.push({
              connection_id: connectionId,
              error:
                error instanceof Error
                  ? error.message
                  : `${need.bindOperation} failed`,
              module_id: module.moduleId,
            });
          }
        }
      }
    }
    return bound;
  }

  /**
   * Make each newly mounted app USABLE in this space — the module's own
   * `mountOperation` (the space's knowledge base row, for one), run once per
   * mount by EVERY path that mounts: the create wizard, the setup dialog and
   * the `space_setup` tool all land here, so a module's first-use setup is
   * written once and cannot be skipped by coming in through another door.
   *
   * Only the mounts named in `moduleIds` run — the ones this call added or
   * changed, or re-added to retry. Reconciling an unchanged set runs nothing.
   *
   * A failing operation never fails the setup: the mount stands and the answer
   * says which app is not ready, which is what a person can act on. `needs`
   * is what the module says it still lacks (`ai_gateway`, …), for the same
   * reason.
   */
  async function runModuleMountOperations(input: {
    auth: unknown;
    moduleIds: readonly string[];
    spaceId: string;
  }): Promise<SpaceMountSetupResult[]> {
    const results: SpaceMountSetupResult[] = [];
    if (!params.callOperation) {
      return results;
    }
    const byId = new Map(
      (params.registry?.plugins ?? []).map((plugin) => [plugin.id, plugin])
    );
    for (const moduleId of new Set(input.moduleIds)) {
      const operationId = byId.get(moduleId)?.mountOperation;
      if (!operationId) {
        continue;
      }
      try {
        const answer = (await params.callOperation({
          auth: input.auth,
          input: { space_id: input.spaceId },
          operationId,
        })) as { needs?: unknown; ready?: unknown } | null | undefined;
        const needs = Array.isArray(answer?.needs)
          ? answer.needs.filter(
              (need): need is string => typeof need === "string"
            )
          : [];
        results.push({
          module_id: moduleId,
          needs,
          ready: answer?.ready !== false && needs.length === 0,
        });
      } catch (error) {
        results.push({
          error:
            error instanceof Error ? error.message : `${operationId} failed`,
          module_id: moduleId,
          needs: [],
          ready: false,
        });
      }
    }
    return results;
  }

  function setupFailure(c: RouteContext, error: unknown) {
    if (error instanceof SpaceAgentLimitError) {
      return jsonApiError(c, 400, { code: error.name, message: error.message });
    }
    if (error instanceof SpaceSetupError) {
      return jsonApiError(c, 400, {
        code: error.name,
        message:
          error.name === "space_setup_missing_required"
            ? `A space cannot exist without its baseline mounts: ${error.message}`
            : error.name === "space_setup_missing_dependency"
              ? `A mounted module needs another one in the same space: ${error.message}`
              : `These mounts are required and cannot be removed: ${error.message}`,
      });
    }
    return jsonApiError(c, 400, {
      message: error instanceof Error ? error.message : "space_setup_failed",
    });
  }

  /**
   * Every space mounting a module — the trigger fan-out's question
   * (PLAN-mounted-engentys T5.2: a `scope: "space"` declaration reconciles
   * one binding row per space here). Service-lane only: the scheduler asks
   * with the service credential, and the answer includes PRIVATE spaces —
   * exactly the ones a routine must keep running in — so a plain member must
   * not use this as a space-discovery side channel.
   */
  app.get("/api/spaces/mounting/:moduleId", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    if (authResult.auth.principalType === "user") {
      return jsonApiError(c, 403, { message: "Service credential required" });
    }
    const moduleId = c.req.param("moduleId");
    const { data, error } = await db(tenantId)
      .schema("core")
      .from("space_mount")
      .select("space_id")
      .eq("tenant_id", tenantId)
      .eq("resource_type", "module")
      .eq("resource_key", moduleId);
    if (error) {
      return jsonApiError(c, 500, { message: error.message });
    }
    const spaceIds = [
      ...new Set(
        ((data ?? []) as Array<{ space_id: string }>).map((row) => row.space_id)
      ),
    ];
    return jsonApiSuccess(c, { space_ids: spaceIds });
  });

  app.get("/api/spaces", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    // Membership-filtered for EVERYONE, superadmins included: the rail is where
    // you work, not an admin console, and a platform superadmin has no business
    // seeing every colleague's personal space just by opening the app. The
    // unfiltered reader (`listAllSpacesUnscoped`) is for the superadmin console,
    // where looking is the explicit purpose.
    //
    // `include_deleted=1` is the admin exception: pending-deletion spaces are
    // hidden from the rail, but the settings list needs them so an admin can
    // restore before the sweep.
    const includeDeleted =
      c.req.query("include_deleted") === "1" ||
      c.req.query("include_deleted") === "true";
    const live = await listAccessibleSpaces(
      db(tenantId),
      tenantId,
      accessSubject(authResult.auth)
    );
    if (!includeDeleted) {
      return jsonApiSuccess(c, live);
    }
    const admin = await requireTenantAdmin(c);
    if ("error" in admin) {
      return admin.error;
    }
    const pending = await listMarkedDeletedSpaces(db(tenantId), tenantId);
    const byId = new Map(live.map((space) => [space.id, space]));
    for (const space of pending) {
      byId.set(space.id, space);
    }
    return jsonApiSuccess(c, [...byId.values()]);
  });

  /**
   * What the setup dialog needs before a space exists: which mounts are locked,
   * which starting points there are, and which modules may be mounted at all.
   *
   * Readable by any member — it is a catalog, not tenant data, and the dialog is
   * admin-gated on its write, not on its render.
   */
  app.get("/api/spaces/setup-catalog", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    return jsonApiSuccess(c, {
      baseline: SPACE_BASELINE_MOUNTS,
      modules: mountableModules(),
      templates: SPACE_TEMPLATES.map((template) => ({
        description: template.description,
        featuredMountKeys: template.featuredMountKeys,
        id: template.id,
        // Expanded here so the dialog never has to remember that the baseline
        // is implied — what it receives is exactly what it would post back.
        mounts: spaceTemplateMounts(template),
        name: template.name,
      })),
    });
  });

  /**
   * The shared spaces one person belongs to — for their Team profile.
   *
   * Registered BEFORE the `/api/spaces/:spaceId/…` routes: first match wins, so
   * lower down `memberships` would be read as a space id and this would 404.
   * (`setup-catalog` and `resolve-record` sit above for the same reason.)
   *
   * Scoped to the CALLER's accessible spaces, not the subject's. A profile page
   * that listed every room someone is in would tell the reader which private
   * spaces exist and who is in them — the one thing Phase P is for. Personal
   * spaces cannot appear at all: they have no member rows.
   */
  app.get("/api/spaces/memberships", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const subject = c.req.query("user_id")?.trim();
    if (!subject) {
      return jsonApiError(c, 400, { message: "user_id is required" });
    }
    return jsonApiSuccess(
      c,
      await listSpacesForUser(
        db(tenantId),
        tenantId,
        subject,
        accessSubject(authResult.auth)
      )
    );
  });

  /**
   * Where a legacy `/mdl/<module>/<record>` deep link should land.
   *
   * The UI cannot answer this: it would need every module's tables. Returning
   * `source` matters as much as the key — `"record"` means the record really is
   * in that space, `"default"` means nothing was found and the caller is being
   * sent somewhere reasonable rather than nowhere. A UI that treats those the
   * same will happily "relocate" a record it never located.
   */
  app.get("/api/spaces/resolve-record", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const moduleId = c.req.query("module")?.trim() ?? "";
    const recordId = c.req.query("recordId")?.trim() ?? "";
    const client = db(tenantId);

    const spaceId =
      moduleId && recordId && hasSpaceRecordSource(moduleId)
        ? await findSpaceIdForRecord(client, { moduleId, recordId, tenantId })
        : null;

    // The record lookup runs unscoped — it searches module tables by id and knows
    // nothing about membership — so the ACCESS check happens here, on the space it
    // landed in. Without it this endpoint is a lookup oracle: feed it record ids
    // and it reports which ones live in a private space, and under what key.
    //
    // A hit the caller may not enter is 404, not a fallback to the default space:
    // "here is Company instead" would still confirm the record exists somewhere.
    const space = spaceId
      ? await findAccessibleSpace(
          client,
          tenantId,
          accessSubject(authResult.auth),
          spaceId
        )
      : await getDefaultSpace(client, tenantId);

    if (!space) {
      return jsonApiError(c, 404, { message: "No space for this tenant" });
    }
    return jsonApiSuccess(c, {
      key: space.key,
      source: spaceId ? "record" : "default",
      spaceId: space.id,
    });
  });

  app.post("/api/spaces", async (c) => {
    const authResult = await requireTenantAdmin(c);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const parsed = createSpaceBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid space" });
    }
    const { mounts, ...spaceInput } = parsed.data;
    const desired = mounts ? toDesiredMounts(mounts) : null;
    if (desired) {
      const unknown = unknownModuleKeys(desired);
      if (unknown.length > 0) {
        return jsonApiError(c, 400, {
          message: `Not an installed module: ${unknown.join(", ")}`,
        });
      }
      // Before the insert, not after: a rejected create must leave nothing
      // behind, and these checks need no database to run.
      try {
        assertSpaceSetupBaseline(desired);
        assertSpaceSetupDependencies(desired, moduleRequires());
      } catch (error) {
        return setupFailure(c, error);
      }
    }
    const client = db(tenantId);
    const existing = await getSpaceByKey(client, tenantId, spaceInput.key);
    if (existing) {
      return jsonApiError(c, 409, { message: "Space key already in use" });
    }
    let space: Awaited<ReturnType<typeof createSpace>>;
    try {
      space = await createSpace(client, { ...spaceInput, tenantId });
    } catch (error) {
      return jsonApiError(c, 400, {
        message: error instanceof Error ? error.message : "space_create_failed",
      });
    }
    await addCreatorMemberRow(client, tenantId, space.id, authResult.auth);
    if (!desired) {
      return jsonApiSuccess(c, space, { status: 201 });
    }
    try {
      const { plan, surface } = await applySpaceSetup(
        client,
        tenantId,
        space.id,
        desired,
        {
          requires: moduleRequires(),
        }
      );
      const mounted = await runModuleMountOperations({
        auth: authResult.auth,
        moduleIds: addedModuleIds(plan.upsert),
        spaceId: space.id,
      });
      return jsonApiSuccess(c, { mounted, space, surface }, { status: 201 });
    } catch (error) {
      // The baseline was checked before the insert, so reaching here means the
      // write itself failed. The space row survives with its trigger-seeded
      // baseline — a space that is emptier than asked for, and editable.
      return setupFailure(c, error);
    }
  });

  /**
   * The edit half of the same dialog: rename the space and reconcile its whole
   * mount set in one call. Deliberately the same body shape as create.
   */
  app.put("/api/spaces/:spaceId/setup", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const parsed = spaceSetupBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid space setup" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    const client = db(tenantId);
    const spaceId = access.space.id;
    const desired = toDesiredMounts(parsed.data.mounts);
    const unknown = unknownModuleKeys(desired);
    if (unknown.length > 0) {
      return jsonApiError(c, 400, {
        message: `Not an installed module: ${unknown.join(", ")}`,
      });
    }
    try {
      const { plan, surface } = await applySpaceSetup(
        client,
        tenantId,
        spaceId,
        desired,
        {
          requires: moduleRequires(),
        }
      );
      const mounted = await runModuleMountOperations({
        auth: authResult.auth,
        moduleIds: addedModuleIds(plan.upsert),
        spaceId,
      });
      const updated = await updateSpace(client, tenantId, spaceId, {
        ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
        ...(parsed.data.key === undefined ? {} : { key: parsed.data.key }),
        ...(parsed.data.description === undefined
          ? {}
          : { description: parsed.data.description }),
        ...(parsed.data.icon === undefined ? {} : { icon: parsed.data.icon }),
        ...(parsed.data.color === undefined
          ? {}
          : { color: parsed.data.color }),
        ...(parsed.data.agent_approval_mode === undefined
          ? {}
          : { agentApprovalMode: parsed.data.agent_approval_mode }),
        ...(parsed.data.computer_network_tier === undefined
          ? {}
          : { computerNetworkTier: parsed.data.computer_network_tier }),
        ...(parsed.data.computer_egress_hosts === undefined
          ? {}
          : { computerEgressHosts: parsed.data.computer_egress_hosts }),
        // A personal space cannot be opened; the database refuses it
        // (`spaces_personal_is_private_check`) rather than this route silently
        // dropping the field, so a client that sends it gets an error and not a
        // false success.
        ...(parsed.data.visibility === undefined
          ? {}
          : { visibility: parsed.data.visibility }),
      });
      return jsonApiSuccess(c, {
        // Apps whose own first-use setup ran because this call mounted or
        // changed them; one with `ready: false` is placed but not usable yet.
        mounted,
        // `removed` is echoed so the UI can say what unmounting did — it hides
        // records, it never deletes them, and that sentence needs a subject.
        removed: plan.remove,
        space: updated,
        surface,
      });
    } catch (error) {
      return setupFailure(c, error);
    }
  });

  /**
   * ADD to a space's setup (PLAN-connections-ux.md B2/B3).
   *
   * The dialog's `PUT /setup` posts a complete desired set, which is right when
   * the caller knows the whole picture and wrong for everyone else: a chat turn
   * that only knows "add Inbox" would drop every mount it did not resend. This route merges instead, and is what the Space page, the
   * `space_setup` tool and the setup skill all post to.
   *
   * Besides applying the mounts, added apps are bound to the accounts this
   * space owns, and apps that still have no account to work with are named in
   * the answer, so the caller can offer the connect instead of shipping an
   * empty page. Accounts are not mounted: a connection belongs to the space it
   * was connected in (PLAN-space-owned-connections.md).
   */
  app.post("/api/spaces/:spaceId/setup/add", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const parsed = setupAddBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid space setup" });
    }
    const added = toDesiredMounts(parsed.data.mounts);
    const unknown = unknownModuleKeys(added);
    if (unknown.length > 0) {
      return jsonApiError(c, 400, {
        message: `Not an installed module: ${unknown.join(", ")}`,
      });
    }
    const unknownAgents = await unknownAgentKeys(
      c.req.header("authorization"),
      added
    );
    if (unknownAgents.length > 0) {
      return jsonApiError(c, 400, {
        message: `Not a registered agent: ${unknownAgents.join(", ")}`,
      });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    const client = db(tenantId);
    const spaceId = access.space.id;
    try {
      const existing = await listSpaceMounts(client, tenantId, spaceId);
      const { surface } = await applySpaceSetup(
        client,
        tenantId,
        spaceId,
        mergeDesiredMounts({ added, existing }),
        { requires: moduleRequires() }
      );
      // One catalog read serves both answers: what is still missing, and which
      // app/account pairs this call has to bind.
      const capabilities = await readSpaceAccountCapabilities({
        auth: authResult.auth,
        surface,
      });
      const needsConnect = resolveNeedsConnect({ added, capabilities });
      const bound = await bindModuleAccounts({
        added,
        auth: authResult.auth,
        capabilities,
        spaceId,
        surface,
      });
      // Every module this call named, not only the new ones: re-adding a
      // module is how a setup that could not finish is retried.
      const mounted = await runModuleMountOperations({
        auth: authResult.auth,
        moduleIds: addedModuleIds(added),
        spaceId,
      });
      return jsonApiSuccess(c, {
        added: added.map((mount) => ({
          agent_access: mount.agentAccess ?? null,
          resource_key: mount.resourceKey,
          resource_type: mount.resourceType,
        })),
        // Apps that now actually USE an account here — the sync state row, the
        // file source. An entry with an `error` is a placement that stands with
        // a binding that did not finish.
        bound,
        // Apps that are here but have nothing to work with yet. Never a
        // refusal: mounting the app before its account is the normal order.
        ...(needsConnect ? { needs_connect: needsConnect } : {}),
        // Apps whose own first-use setup ran — the knowledge base row, for
        // one. `ready: false` with `needs` or `error` is a placement that
        // stands with a setup that did not finish; re-adding retries it.
        mounted,
        space: access.space,
        surface,
      });
    } catch (error) {
      return setupFailure(c, error);
    }
  });

  app.get("/api/spaces/:spaceId/mounts", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    return jsonApiSuccess(
      c,
      await listSpaceMounts(db(tenantId), tenantId, access.space.id)
    );
  });

  /**
   * Everything available in a space, across all four resource kinds, plus the
   * capability ids the mounts imply and the counts the setup dialog renders.
   * One endpoint over one function so the numbers on screen cannot drift from
   * what an agent actually gets.
   */
  app.get("/api/spaces/:spaceId/surface", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    // The task-bound path applies to the SURFACE only — it is what a headless
    // run needs to know its own space, and it deliberately does not open the
    // members/mounts/setup routes to a service principal.
    let space: Space;
    if ("error" in access) {
      const bound =
        (await findTaskBoundSpace(
          c,
          tenantId,
          authResult.auth,
          c.req.param("spaceId")
        )) ??
        (await findRoutineBoundSpace(
          c,
          tenantId,
          authResult.auth,
          c.req.param("spaceId")
        ));
      if (!bound) {
        return access.error;
      }
      space = bound;
    } else {
      space = access.space;
    }
    // The tier rides the surface because that is the one call a headless run
    // already makes to learn its own space, and the sandbox is built before
    // any route with the space row in hand is reachable. It is a space
    // property, not a mount, so it is spread here rather than folded into the
    // pure `surfaceFromMounts` projection.
    // The Space's browser consent rides the surface for the same reason: a
    // headless run learns whether it may drive the Space's browser unattended
    // from the one call it already makes.
    const browserGrant = await getSpaceBrowserGrant(
      db(tenantId),
      tenantId,
      space.id
    );
    return jsonApiSuccess(c, {
      ...(await resolveSpaceResourceSurface(db(tenantId), tenantId, space.id)),
      browserGrant: browserGrant
        ? {
            autostart: browserGrant.autostart,
            unattended: browserGrant.unattended,
          }
        : null,
      computerEgressHosts: space.computerEgressHosts,
      computerNetworkTier: space.computerNetworkTier,
    });
  });

  app.put("/api/spaces/:spaceId/mounts", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    const spaceId = access.space.id;
    const parsed = mountBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid mount" });
    }
    const body = parsed.data;
    // Same check the setup path runs. It matters more here now that a mount can
    // be written from chat (`space_setup`): a typo'd module id would otherwise
    // save a row that never resolves, and the space would look like it carries
    // an app it does not have.
    const unknown = unknownModuleKeys([
      { resourceKey: body.resource_key, resourceType: body.resource_type },
    ]);
    if (unknown.length > 0) {
      return jsonApiError(c, 400, {
        message: `Not an installed module: ${unknown.join(", ")}`,
      });
    }
    const unknownAgents = await unknownAgentKeys(
      c.req.header("authorization"),
      [{ resourceKey: body.resource_key, resourceType: body.resource_type }]
    );
    if (unknownAgents.length > 0) {
      return jsonApiError(c, 400, {
        message: `Not a registered agent: ${unknownAgents.join(", ")}`,
      });
    }
    try {
      const mount = await upsertSpaceMount(db(tenantId), tenantId, spaceId, {
        resourceKey: body.resource_key,
        resourceType: body.resource_type,
        ...(body.agent_access ? { agentAccess: body.agent_access } : {}),
        ...(body.record_scope ? { recordScope: body.record_scope } : {}),
        ...(body.is_required === undefined
          ? {}
          : { isRequired: body.is_required }),
        ...(body.reports_to === undefined
          ? {}
          : { reportsTo: body.reports_to }),
      });
      return jsonApiSuccess(c, mount);
    } catch (error) {
      return jsonApiError(c, 400, {
        message: error instanceof Error ? error.message : "mount_failed",
      });
    }
  });

  app.delete(
    "/api/spaces/:spaceId/mounts/:resourceType/:resourceKey",
    async (c) => {
      const authResult = await requireAuth(c, config);
      if ("error" in authResult) {
        return authResult.error;
      }
      const tenantId = authResult.auth.tenantId;
      if (!tenantId) {
        return jsonApiError(c, 403, { message: "No tenant" });
      }
      const resourceType = c.req.param("resourceType");
      const parsedType = z.enum(SPACE_RESOURCE_TYPES).safeParse(resourceType);
      if (!parsedType.success) {
        return jsonApiError(c, 400, { message: "Unknown resource type" });
      }
      const access = await requireSpaceSetupAccess(
        c,
        tenantId,
        authResult.auth,
        c.req.param("spaceId")
      );
      if ("error" in access) {
        return access.error;
      }
      const spaceId = access.space.id;
      const resourceKey = c.req.param("resourceKey");
      const client = db(tenantId);
      const mounts = await listSpaceMounts(client, tenantId, spaceId);
      const target = mounts.find(
        (mount) =>
          mount.resourceType === parsedType.data &&
          mount.resourceKey === resourceKey
      );
      if (target?.isRequired) {
        return jsonApiError(c, 400, {
          code: "space_setup_required_mount_removal",
          message:
            "This mount is part of every space's baseline and cannot be removed.",
        });
      }
      if (parsedType.data === "module") {
        const dependents = moduleMountDependents(
          resourceKey,
          mounts,
          moduleRequires()
        );
        if (dependents.length > 0) {
          return jsonApiError(c, 400, {
            code: "space_setup_missing_dependency",
            message: `${dependents.join(", ")} requires ${resourceKey} in this space; remove those first.`,
          });
        }
      }
      // A module's agents derive from the module mount — there is no agent
      // row to remove, and "removing" one only means unmounting the module.
      if (parsedType.data === "agent") {
        for (const [
          moduleId,
          agentIds,
        ] of moduleAgentIdsFromSeeds().entries()) {
          if (!agentIds.includes(resourceKey)) {
            continue;
          }
          const moduleMounted = mounts.some(
            (mount) =>
              mount.resourceType === "module" && mount.resourceKey === moduleId
          );
          if (moduleMounted) {
            return jsonApiError(c, 400, {
              code: "agent_derived_from_module",
              details: { module_id: moduleId },
              message: `${resourceKey} comes with the ${moduleId} app. Remove the app to remove its agents.`,
            });
          }
        }
      }
      // Removing a specialist is a CASCADE, done server-side in one call
      // (PLAN-mounted-engentys T5.3): its triggers in this Space are
      // disabled, its open tasks reassigned (`?reassign_to=<agent>`, absent =
      // unassigned), then the mount goes. The browser used to stitch these
      // three calls itself; a dropped tab mid-cascade left routines waking
      // for an agent that was no longer there.
      if (parsedType.data === "agent") {
        const authorization = c.req.header("authorization");
        const reassignTo = c.req.query("reassign_to")?.trim() || null;
        const origin = new URL(c.req.url).origin;
        const aiBaseUrl = (
          (config.aiBaseUrl as string) ||
          process.env.ENGENTY_AI_BASE_URL ||
          process.env.VITE_ENGENTY_AI_BASE_URL ||
          origin
        ).replace(/\/$/, "");
        const headers: Record<string, string> = {
          accept: "application/json",
          "content-type": "application/json",
          ...(authorization ? { authorization } : {}),
        };
        // Best-effort halves: a failure here must not leave the mount in
        // place — the unmount is the user's decision; the leftovers are
        // caught by the scheduler's owner sweep.
        try {
          const routinesResponse = await fetch(
            `${aiBaseUrl}/ai/v1/routines?agent_id=${encodeURIComponent(resourceKey)}&space_id=${encodeURIComponent(spaceId)}`,
            { headers }
          );
          if (routinesResponse.ok) {
            const body = (await routinesResponse.json()) as {
              routines?: Array<{ enabled?: boolean; id: string }>;
            };
            await Promise.allSettled(
              (body.routines ?? [])
                .filter((routine) => routine.enabled)
                .map((routine) =>
                  fetch(`${aiBaseUrl}/ai/v1/routines/${routine.id}`, {
                    body: JSON.stringify({ enabled: false }),
                    headers,
                    method: "PATCH",
                  })
                )
            );
          }
        } catch {
          // AI service unreachable — the owner sweep disables them later.
        }
        try {
          const search = new URLSearchParams({
            assignee_kind: "agent",
            pageSize: "200",
            primary_assignee_agent_type_key: resourceKey,
            space_id: spaceId,
          });
          const tasksResponse = await fetch(
            `${origin}/api/tasks?${search.toString()}`,
            { headers }
          );
          if (tasksResponse.ok) {
            const body = (await tasksResponse.json()) as {
              data?: Array<{ id: string }>;
            };
            await Promise.allSettled(
              (body.data ?? []).map((task) =>
                fetch(`${origin}/api/tasks/${encodeURIComponent(task.id)}`, {
                  body: JSON.stringify(
                    reassignTo
                      ? {
                          primary_assignee_agent_type_key: reassignTo,
                          primary_assignee_kind: "agent",
                        }
                      : {
                          primary_assignee_agent_type_key: null,
                          primary_assignee_kind: "none",
                        }
                  ),
                  headers,
                  method: "PATCH",
                })
              )
            );
          }
        } catch {
          // Tasks unreachable — they stay assigned and visible, not lost.
        }
      }
      await removeSpaceMount(
        client,
        tenantId,
        spaceId,
        parsedType.data,
        resourceKey
      );
      // Unmounting HIDES records; it never deletes them.
      return jsonApiSuccess(c, { removed: true });
    }
  );

  app.put("/api/spaces/:spaceId/skill-packs/:category", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    try {
      return jsonApiSuccess(
        c,
        await mountLibrarySkillPack(
          db(tenantId),
          tenantId,
          access.space.id,
          c.req.param("category")
        )
      );
    } catch (error) {
      if (error instanceof UnknownSkillPackError) {
        return jsonApiError(c, 404, {
          code: "unknown_skill_pack",
          message: error.message,
        });
      }
      return jsonApiError(c, 400, {
        message: error instanceof Error ? error.message : "skill_pack_failed",
      });
    }
  });

  app.delete("/api/spaces/:spaceId/skill-packs/:category", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    try {
      return jsonApiSuccess(
        c,
        await unmountLibrarySkillPack(
          db(tenantId),
          tenantId,
          access.space.id,
          c.req.param("category")
        )
      );
    } catch (error) {
      if (error instanceof UnknownSkillPackError) {
        return jsonApiError(c, 404, {
          code: "unknown_skill_pack",
          message: error.message,
        });
      }
      return jsonApiError(c, 400, {
        message: error instanceof Error ? error.message : "skill_pack_failed",
      });
    }
  });

  /**
   * Who is in this space.
   *
   * Gated on being able to ENTER the space, not on being an admin: the members
   * list is "who else is here", which anyone here may reasonably ask. The browser
   * cannot read it directly — `space_member_select_own` restricts PostgREST to
   * your own rows — so this endpoint is the only way to it, which is why the
   * check has to be real.
   */
  app.get("/api/spaces/:spaceId/members", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    return jsonApiSuccess(
      c,
      await listSpaceMembers(db(tenantId), tenantId, access.space.id)
    );
  });

  /**
   * Invite someone into a space — including a personal one.
   *
   * This is how a private space is shared: by naming a person, never by opening
   * it to the tenant (`spaces_personal_is_private_check` forbids the latter for
   * personal spaces outright). Same gate as setup, for the same reason — inside
   * your own space you are the only one whose data is at stake.
   */
  app.put("/api/spaces/:spaceId/members/:userId", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    const parsed = spaceMemberBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid member" });
    }
    try {
      return jsonApiSuccess(
        c,
        await addSpaceMember(
          db(tenantId),
          tenantId,
          access.space.id,
          c.req.param("userId"),
          parsed.data.role ?? "member"
        )
      );
    } catch (error) {
      return jsonApiError(c, 400, {
        message: error instanceof Error ? error.message : "member_add_failed",
      });
    }
  });

  app.delete("/api/spaces/:spaceId/members/:userId", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const access = await requireSpaceSetupAccess(
      c,
      tenantId,
      authResult.auth,
      c.req.param("spaceId")
    );
    if ("error" in access) {
      return access.error;
    }
    try {
      await removeSpaceMember(
        db(tenantId),
        tenantId,
        access.space.id,
        c.req.param("userId")
      );
      return jsonApiSuccess(c, { removed: true });
    } catch (error) {
      // core.protect_space_owner_member() refuses to un-member the owner of a
      // personal space. Surfacing the database's refusal rather than pre-checking
      // it keeps one rule in one place.
      return jsonApiError(c, 400, {
        message:
          error instanceof Error ? error.message : "member_remove_failed",
      });
    }
  });

  /**
   * Claim a personal space whose owner has left the tenant.
   *
   * The `root` escape hatch, and deliberately shaped like one: superadmin only,
   * it refuses any space that still has an owner, and it writes an audit event
   * before returning. An orphaned space is otherwise unreachable by design —
   * someone leaving must not publish their notes to the company — so the way in
   * is an action with a name on it, not a quiet clause in a policy.
   */
  app.post("/api/spaces/:spaceId/claim", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { auth } = authResult;
    const tenantId = auth.tenantId;
    if (!(tenantId && auth.userId)) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const spaceId = c.req.param("spaceId");
    try {
      const space = await claimOrphanedSpace(
        db(tenantId),
        tenantId,
        spaceId,
        auth.userId
      );
      await recordAuditEvent(db(tenantId), {
        action: "space.claim_orphaned",
        actorUserId: auth.userId,
        targetId: space.id,
        tenantId,
      });
      return jsonApiSuccess(c, space);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "space_claim_failed";
      return jsonApiError(c, message === "space_not_orphaned" ? 409 : 400, {
        code: message,
        message:
          message === "space_not_orphaned"
            ? "This space still has an owner. Only an orphaned space can be claimed."
            : message,
      });
    }
  });

  /**
   * Mark a space for deletion. It disappears immediately; the background sweep
   * hard-deletes it and its data after the grace period. Tenant admin only.
   */
  app.delete("/api/spaces/:spaceId", async (c) => {
    const admin = await requireTenantAdmin(c);
    if ("error" in admin) {
      return admin.error;
    }
    const tenantId = admin.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({ confirm_name: z.string().min(1).max(200) })
      .safeParse(body);
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Type the space name to confirm deletion.",
      });
    }
    const idOrKey = c.req.param("spaceId");
    const space = TASK_ID_PATTERN.test(idOrKey)
      ? await getSpaceById(db(tenantId), tenantId, idOrKey, {
          includeDeleted: true,
        })
      : await getSpaceByKey(db(tenantId), tenantId, idOrKey, {
          includeDeleted: true,
        });
    if (!space) {
      return jsonApiError(c, 404, { message: "Space not found" });
    }
    if (parsed.data.confirm_name.trim() !== space.name.trim()) {
      return jsonApiError(c, 400, {
        message: "Type the space name to confirm deletion.",
      });
    }
    try {
      const marked = await markSpaceDeleted(db(tenantId), tenantId, space.id);
      if (admin.auth.userId) {
        await recordAuditEvent(db(tenantId), {
          action: "space.marked_deleted",
          actorUserId: admin.auth.userId,
          targetId: space.id,
          tenantId,
        });
      }
      return jsonApiSuccess(c, marked);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "space_delete_failed";
      if (message === "space_is_default") {
        return jsonApiError(c, 403, {
          code: message,
          message: "The company space cannot be deleted.",
        });
      }
      if (message === "space_is_personal") {
        return jsonApiError(c, 403, {
          code: message,
          message: "A personal space cannot be deleted.",
        });
      }
      return jsonApiError(c, 400, { code: message, message });
    }
  });

  /** Undo a mark while the grace period is still open. Tenant admin only. */
  app.post("/api/spaces/:spaceId/restore", async (c) => {
    const admin = await requireTenantAdmin(c);
    if ("error" in admin) {
      return admin.error;
    }
    const tenantId = admin.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 403, { message: "No tenant" });
    }
    const idOrKey = c.req.param("spaceId");
    const space = TASK_ID_PATTERN.test(idOrKey)
      ? await getSpaceById(db(tenantId), tenantId, idOrKey, {
          includeDeleted: true,
        })
      : await getSpaceByKey(db(tenantId), tenantId, idOrKey, {
          includeDeleted: true,
        });
    if (!space) {
      return jsonApiError(c, 404, { message: "Space not found" });
    }
    const restored = await restoreSpace(db(tenantId), tenantId, space.id);
    if (admin.auth.userId) {
      await recordAuditEvent(db(tenantId), {
        action: "space.restored",
        actorUserId: admin.auth.userId,
        targetId: space.id,
        tenantId,
      });
    }
    return jsonApiSuccess(c, restored);
  });
}
