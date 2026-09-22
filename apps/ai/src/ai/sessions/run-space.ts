/**
 * The space a run happens in, and what that space contains
 * (PLAN-spaces.md Phase C3a).
 *
 * C2 gave a thread a `space_id`; this is where that column stops being a label
 * and starts selecting what the run can reach. Two things have to be true
 * before it may do that, and they are the whole reason this lives in one place
 * rather than being read inline at each consumer:
 *
 * **1. The space must be one the caller can actually enter.** `space_id` is
 * client-supplied on chat (the UI writes it from the URL). The surface
 * endpoint is already gated by `requireSpaceAccess`, so asking it for the
 * mounts IS asking whether the caller may have them, and a claim they cannot
 * back returns 404 instead of a mount list.
 *
 * **2. A claimed Space that cannot be resolved must fail closed.** No claim
 * is intentional tenant-global. A valid claim carries the already-fetched
 * surface. A claimed but inaccessible, deleted, or unavailable Space is
 * `unresolved`: module/connector/delegation/`/data` work refuses with
 * `space_context_unresolved`. It must never degrade to tenant-global access.
 *
 * Headless task runs resolve from the task row (server-side), not a client
 * claim. Private spaces 404 for a service principal with no membership; that
 * is `unresolved`, not permission to run tenant-wide. The fetch forwards the
 * task id and, when known, the task's acting user so core can authorize the
 * already-validated task Space — never a client-supplied substitute.
 */
import { createLogger } from "@engenty/telemetry";
import {
  type GlobalConnectorGate,
  isUnresolvedSpaceGate,
  type SpaceGateContext,
  type SpaceGateSurface,
  type UnresolvedSpaceGate,
} from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  type EngentySpaceSurface,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { spaceIdFromRouteContext } from "./session-identity.js";
import {
  type AiSessionScope,
  scopeAccessToken,
  scopeAttributionUserId,
} from "./types.js";

const logger = createLogger({ name: "apps/ai/run-space" });

/**
 * Short-lived surface cache, keyed by the CALLER as well as the space.
 *
 * Every chat turn resolves the run's space, and without this each one costs a
 * core round trip before the model sees a token. Keyed by user because the
 * lookup doubles as the access check — sharing an entry across users would let
 * one caller's successful access answer another's. Headless fetches that name
 * an acting user are keyed on that id too, so a service principal cannot reuse
 * another owner's successful private-space load.
 *
 * Deliberately short. A mount removed mid-conversation stays honoured by this
 * pre-gate for up to the TTL; core re-checks every invoke and refuses it there,
 * so the window costs a stale *message*, never a stale permission.
 */
const SURFACE_CACHE_TTL_MS = 30_000;
const surfaceCache = new Map<
  string,
  { expiresAt: number; surface: EngentySpaceSurface }
>();

/**
 * Connector tool prefixes, resolved once per tenant (PLAN-spaces.md Phase C3b).
 *
 * A connector's mount is keyed by its ID (`google-gmail`) but its operations
 * are named after its TOOL PREFIX (`gmail_search_threads`), and the two differ
 * for most connectors. The catalog is the only thing that knows the mapping,
 * so the gate needs it before it can tell "this op belongs to an unmounted
 * connector" from "this op belongs to no connector at all".
 *
 * Cached per tenant, not per user: which connectors EXIST is tenant
 * configuration, and the mapping carries no information about who may use one.
 */
const CONNECTOR_PREFIX_CACHE_TTL_MS = 5 * 60_000;
const connectorPrefixCache = new Map<
  string,
  { expiresAt: number; prefixesById: Map<string, string> }
>();

interface ConnectorCatalogEntry {
  id?: string;
  tool_prefix?: string;
}

async function resolveConnectorPrefixes(
  client: EngentyCoreClient,
  tenantId: string
): Promise<Map<string, string>> {
  const cached = connectorPrefixCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.prefixesById;
  }
  const prefixesById = new Map<string, string>();
  try {
    const result = await client.invokeTool<
      Record<string, never>,
      { connectors?: ConnectorCatalogEntry[] }
    >("connections_catalog", {});
    for (const connector of result.connectors ?? []) {
      if (connector.id && connector.tool_prefix) {
        prefixesById.set(connector.id, connector.tool_prefix);
      }
    }
  } catch {
    // No connections module, or the catalog is unreachable. An empty map means
    // the gate treats nothing as a connector operation, which is the same
    // behaviour as before Phase C — the module gate still applies.
  }
  connectorPrefixCache.set(tenantId, {
    expiresAt: Date.now() + CONNECTOR_PREFIX_CACHE_TTL_MS,
    prefixesById,
  });
  return prefixesById;
}

export interface RunSpace {
  /** Engentys mounted here — the only ones a run may delegate to (C3b). */
  agentIds: ReadonlySet<string>;
  /** Tool prefixes of EVERY connector, so the gate can recognise one. */
  allConnectorPrefixes: ReadonlySet<string>;
  /**
   * The person whose browser this run may drive, with their unattended and
   * autostart consents (PLAN-user-browser.md §2.2, D3). The chat user, or the
   * human a headless lane acts for; null when there is nobody — then there is
   * no browser and no `browser_*` tools.
   */
  browser: { autostart: boolean; unattended: boolean; userId: string } | null;
  /** Tool prefixes of the connectors this space mounts. */
  connectorPrefixes: ReadonlySet<string>;
  /** Modules mounted with `agent_access` above `none`. */
  moduleIds: ReadonlySet<string>;
  /**
   * The ACCOUNTS this space mounts (connection ids), for the finer refusal
   * (PLAN-spaces.md Phase CN.3).
   *
   * The prefix set above answers "may this space use Gmail at all"; this one
   * answers "which mailbox", and only the code that has resolved a call to a
   * connection can ask it. Empty when the space mounts no accounts — which,
   * paired with an empty prefix set, refuses every connector operation.
   */
  mountedConnectionIds: ReadonlySet<string>;
  /** Modules the space's engentys may read but not write. */
  readOnlyModuleIds: ReadonlySet<string>;
  spaceId: string;
  /**
   * The raw surface, including `skills`.
   *
   * **Skills are deliberately NOT narrowed here, and `surface.skills` has no
   * reader yet.** C3b specced "skills catalog filtered to mounted skills", but
   * a run reaches skills two ways: the module hint (a rendered prompt block)
   * and Mastra's `skill` / `skill_search` workspace tools, which discover by
   * PATH — the copilot points them at `/tenant-skills`, tenant-wide. A path
   * list cannot express "these four skill names", so the second way cannot be
   * filtered without giving each space its own skills prefix (Phase 6b, a
   * storage change with a migration behind it).
   *
   * Filtering only the hint would leave `skill_search` returning everything
   * one call later: the same "looks like enforcement, enforces nothing" trap
   * that made C3a move its check off the agent's tool list. So this stays
   * unenforced and honest rather than half-done and reassuring.
   */
  surface: EngentySpaceSurface;
  /** Hired engenties with no `reports_to` here — see `withTopLevelHireTools`. */
  topLevelAgentIds: ReadonlySet<string>;
}

export type RunSpaceResolution =
  | { kind: "global" }
  | { kind: "resolved"; space: RunSpace }
  | {
      claimed_space_id: string;
      kind: "unresolved";
      reason: UnresolvedSpaceGate["reason"];
    };

/** The resolved surface, or undefined when the run is global or unresolved. */
export function resolvedRunSpace(
  resolution: RunSpaceResolution
): RunSpace | undefined {
  return resolution.kind === "resolved" ? resolution.space : undefined;
}

/** Tool/ALS space context: resolved surface, unresolved refusal, or null (global). */
export function toolsSpaceFromResolution(
  resolution: RunSpaceResolution
): SpaceGateContext | null {
  if (resolution.kind === "unresolved") {
    return {
      claimed_space_id: resolution.claimed_space_id,
      kind: "unresolved",
      reason: resolution.reason,
    };
  }
  if (resolution.kind !== "resolved") {
    return null;
  }
  const space = resolution.space;
  const surface: SpaceGateSurface = {
    agentIds: space.agentIds,
    allConnectorPrefixes: space.allConnectorPrefixes,
    browser: space.browser,
    connectorPrefixes: space.connectorPrefixes,
    moduleIds: space.moduleIds,
    readOnlyModuleIds: space.readOnlyModuleIds,
    spaceId: space.spaceId,
    topLevelAgentIds: space.topLevelAgentIds,
  };
  return surface;
}

function prefixesForConnectorIds(
  ids: Iterable<string>,
  prefixesById: ReadonlyMap<string, string>
): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const prefix = prefixesById.get(id);
    if (prefix) {
      out.add(prefix);
    }
  }
  return out;
}

/**
 * Union space plugins, all-spaces accounts, and this agent's grants; then
 * apply an optional preferred connector-id list. Pure so tests can drive it
 * without a core round trip.
 */
export function applyAgentConnectorReach(params: {
  allConnectorPrefixes: ReadonlySet<string>;
  allSpacesPrefixes: ReadonlySet<string>;
  grantPrefixes: ReadonlySet<string>;
  preferredPrefixes: ReadonlySet<string>;
  space: SpaceGateContext | null;
}): SpaceGateContext | null {
  const space = params.space;
  if (isUnresolvedSpaceGate(space)) {
    return space;
  }
  const surface: SpaceGateSurface | null =
    space != null && !("kind" in space) ? space : null;
  const enabled = new Set(params.allSpacesPrefixes);
  if (surface) {
    for (const prefix of surface.connectorPrefixes) {
      enabled.add(prefix);
    }
  }
  const allowed =
    params.preferredPrefixes.size === 0
      ? new Set([...enabled, ...params.grantPrefixes])
      : new Set([
          ...[...enabled].filter((prefix) =>
            params.preferredPrefixes.has(prefix)
          ),
          ...params.grantPrefixes,
        ]);
  if (surface) {
    return { ...surface, connectorPrefixes: allowed };
  }
  const global: GlobalConnectorGate = {
    allConnectorPrefixes: params.allConnectorPrefixes,
    connectorPrefixes: allowed,
    kind: "global",
  };
  return global;
}

/**
 * Restrict connector tools for this agent: grants ∪ space mounts ∪ all-spaces,
 * intersected with a non-empty preferred plugin list. `{kind:"global"}` is
 * this surface — never a silent fallback to Company or the personal space.
 */
export async function enrichToolsSpaceForAgentRun(params: {
  agentId: string;
  preferredConnectorIds?: readonly string[];
  scope: AiSessionScope;
  space: SpaceGateContext | null;
}): Promise<SpaceGateContext | null> {
  if (isUnresolvedSpaceGate(params.space)) {
    return params.space;
  }
  const accessToken = scopeAccessToken(params.scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    return applyAgentConnectorReach({
      allConnectorPrefixes: params.space?.allConnectorPrefixes ?? new Set(),
      allSpacesPrefixes: new Set(),
      grantPrefixes: new Set(),
      preferredPrefixes: new Set(),
      space: params.space,
    });
  }
  const client = new EngentyCoreClient({ accessToken, coreBaseUrl });
  const prefixesById = await resolveConnectorPrefixes(
    client,
    params.scope.tenantId
  );
  const [grantsResult, catalogResult] = await Promise.all([
    client
      .invokeTool<
        { agent_id: string },
        { grants?: Array<{ connector_id?: string | null }> }
      >("connections_agent_grants_list", { agent_id: params.agentId })
      .catch(() => ({ grants: [] as Array<{ connector_id?: string | null }> })),
    client
      .invokeTool<
        Record<string, never>,
        {
          connectors?: Array<{
            connections?: Array<{ all_spaces?: boolean }>;
            id?: string;
          }>;
        }
      >("connections_catalog", {})
      .catch(() => ({ connectors: [] })),
  ]);
  const grantPrefixes = prefixesForConnectorIds(
    (grantsResult.grants ?? [])
      .map((grant) => grant.connector_id)
      .filter((id): id is string => Boolean(id)),
    prefixesById
  );
  const allSpacesIds: string[] = [];
  for (const connector of catalogResult.connectors ?? []) {
    if (
      connector.id &&
      connector.connections?.some((connection) => connection.all_spaces)
    ) {
      allSpacesIds.push(connector.id);
    }
  }
  return applyAgentConnectorReach({
    allConnectorPrefixes: new Set(prefixesById.values()),
    allSpacesPrefixes: prefixesForConnectorIds(allSpacesIds, prefixesById),
    grantPrefixes,
    preferredPrefixes: prefixesForConnectorIds(
      params.preferredConnectorIds ?? [],
      prefixesById
    ),
    space: params.space,
  });
}

/**
 * The human a headless task run acts for, when the task row names one.
 *
 * Owner, then creator, then human assignee — never an agent key. Used only to
 * authorize a server-resolved task Space, never as a space id.
 */
export function actingUserIdFromTask(task: {
  created_by_user_id?: unknown;
  owner_user_id?: unknown;
  primary_assignee_user_id?: unknown;
}): string | undefined {
  for (const value of [
    task.owner_user_id,
    task.created_by_user_id,
    task.primary_assignee_user_id,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return;
}

/**
 * Drop every cached surface for one space, whoever it was cached for.
 *
 * Called after a mount changes from inside a run (`space_setup`): the next
 * turn assembles its tool surface from this cache, and a 30s stale entry would
 * make the copilot tell the user the app it just mounted is still not here.
 */
export function invalidateRunSpaceSurface(spaceId: string): void {
  const suffix = `:${spaceId}`;
  for (const key of surfaceCache.keys()) {
    if (key.endsWith(suffix)) {
      surfaceCache.delete(key);
    }
  }
}

/** Test seam: drop cached surfaces and connector prefixes. */
export function resetRunSpaceCachesForTests(): void {
  surfaceCache.clear();
  connectorPrefixCache.clear();
}

/**
 * The space id a run should use, before validation.
 *
 * The THREAD's column wins over the route context. Both normally agree — the
 * UI writes one from the other — but the thread's is the durable fact, and a
 * resumed run (an approval landing hours later, a re-dispatch) may carry a
 * route context from whatever page the browser is on now.
 */
export function candidateRunSpaceId(thread: {
  route_context?: Record<string, unknown> | null;
  space_id?: string | null;
}): string | null {
  const fromThread = thread.space_id?.trim();
  if (fromThread) {
    return fromThread;
  }
  return spaceIdFromRouteContext(thread.route_context ?? undefined);
}

function unresolvedFromError(
  err: unknown,
  claimedSpaceId: string
): Extract<RunSpaceResolution, { kind: "unresolved" }> {
  let reason: UnresolvedSpaceGate["reason"] = "unavailable";
  if (err instanceof EngentyCoreHttpError) {
    if (err.status === 403) {
      reason = "forbidden";
    } else if (err.status === 404) {
      reason = "not_found";
    }
  }
  return {
    claimed_space_id: claimedSpaceId,
    kind: "unresolved",
    reason,
  };
}

function warnUnresolved(
  input: {
    runId?: string;
    scope: AiSessionScope;
    taskId?: string;
    threadId?: string;
  },
  claimedSpaceId: string,
  reason: UnresolvedSpaceGate["reason"],
  err?: unknown
): void {
  logger.warn("space_surface_unresolved", {
    ...(err ? { err } : {}),
    reason,
    run_id: input.runId ?? null,
    space_id: claimedSpaceId,
    task_id: input.taskId ?? null,
    tenant_id: input.scope.tenantId,
    thread_id: input.threadId ?? null,
  });
}

function runSpaceFromSurface(
  spaceId: string,
  surface: EngentySpaceSurface,
  prefixesById: Map<string, string>,
  actingUserId: string | null
): RunSpace {
  const moduleIds = new Set<string>();
  const readOnlyModuleIds = new Set<string>();
  for (const mount of surface.modules) {
    if (mount.agentAccess === "none") {
      // Mounted for its PAGES, explicitly closed to this space's engentys.
      // Phase 3 pins that `none` yields nothing; leaving it out of both sets is
      // what makes the execute gate refuse it.
      continue;
    }
    moduleIds.add(mount.moduleId);
    if (mount.agentAccess === "read") {
      readOnlyModuleIds.add(mount.moduleId);
    }
  }

  const connectorPrefixes = new Set<string>();
  for (const connectorId of surface.connectors ?? []) {
    const prefix = prefixesById.get(connectorId);
    if (prefix) {
      connectorPrefixes.add(prefix);
    }
  }

  return {
    agentIds: new Set(surface.agents),
    allConnectorPrefixes: new Set(prefixesById.values()),
    browser: actingUserId
      ? {
          autostart: surface.browserGrant?.autostart === true,
          unattended: surface.browserGrant?.unattended === true,
          userId: actingUserId,
        }
      : null,
    connectorPrefixes,
    mountedConnectionIds: new Set(surface.connections),
    moduleIds,
    readOnlyModuleIds,
    spaceId,
    surface,
    topLevelAgentIds: new Set(surface.topLevelAgents ?? []),
  };
}

async function fetchSpaceSurface(
  client: EngentyCoreClient,
  spaceId: string,
  actingUserId?: string
): Promise<EngentySpaceSurface> {
  return client.request<EngentySpaceSurface>(
    `/api/spaces/${encodeURIComponent(spaceId)}/surface`,
    actingUserId
      ? { headers: { "x-engenty-acting-for-user-id": actingUserId } }
      : {}
  );
}

/**
 * Resolve and VALIDATE the run's space, then fetch what it contains.
 *
 * - no Space claim → `global` (intentional tenant-wide behaviour)
 * - core confirms the caller may enter → `resolved` with the surface
 * - claimed but inaccessible, deleted, or unreachable → `unresolved`
 */
export async function resolveRunSpace(input: {
  /** Human the headless lane acts for — task owner/creator, never a space id. */
  actingUserId?: string;
  /**
   * The routine a fire belongs to. Like `taskId`, it names the job rather than
   * a space: core resolves the Space from the routine row, so this unlocks a
   * private Space's surface only for the routine that already belongs to it.
   */
  routineId?: string;
  runId?: string;
  scope: AiSessionScope;
  /** Headless runs identify themselves by task, not thread — see the warn below. */
  taskId?: string;
  thread: {
    route_context?: Record<string, unknown> | null;
    space_id?: string | null;
  };
  threadId?: string;
}): Promise<RunSpaceResolution> {
  const spaceId = candidateRunSpaceId(input.thread);
  if (!spaceId) {
    return { kind: "global" };
  }
  const accessToken = scopeAccessToken(input.scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    warnUnresolved(input, spaceId, "unavailable");
    return {
      claimed_space_id: spaceId,
      kind: "unresolved",
      reason: "unavailable",
    };
  }
  const client = new EngentyCoreClient({
    accessToken,
    coreBaseUrl,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.routineId ? { routineId: input.routineId } : {}),
    spaceId,
  });

  // The surface endpoint is itself gated by `requireSpaceAccess`, so a caller
  // outside the space gets an error rather than its mount list. That is the
  // validation — asking core twice (list, then surface) would be two chances
  // for the two answers to disagree. Headless private spaces additionally
  // forward the task id (already on the client) and the task's acting user so
  // core can authorize a server-resolved task Space without treating a 404 as
  // tenant-wide reach.
  const cacheKey = `${input.scope.tenantId}:${input.scope.userId}:${input.actingUserId ?? ""}:${input.taskId ?? ""}:${input.routineId ?? ""}:${spaceId}`;
  const cached = surfaceCache.get(cacheKey);
  const now = Date.now();
  let surface: EngentySpaceSurface;
  try {
    if (cached && cached.expiresAt > now) {
      surface = cached.surface;
    } else {
      surface = await fetchSpaceSurface(client, spaceId, input.actingUserId);
      surfaceCache.set(cacheKey, {
        expiresAt: now + SURFACE_CACHE_TTL_MS,
        surface,
      });
    }
  } catch (err) {
    const unresolved = unresolvedFromError(err, spaceId);
    warnUnresolved(input, spaceId, unresolved.reason, err);
    return unresolved;
  }

  const prefixesById = await resolveConnectorPrefixes(
    client,
    input.scope.tenantId
  );
  return {
    kind: "resolved",
    space: runSpaceFromSurface(
      spaceId,
      surface,
      prefixesById,
      // The human this run acts for: named by the headless lane, else the
      // token's user. A service principal names nobody by itself.
      input.actingUserId ?? scopeAttributionUserId(input.scope)
    ),
  };
}

/**
 * The caller's OWN personal space, or null when they have none.
 *
 * The fallback for a PERSONAL-scope agent whose thread carries no space claim
 * (PLAN-space-chats.md S4b). A thread predating Phase C2's backfill, or one
 * minted in the window before the shell's space list resolved, arrives with
 * `space_id` null — and `{kind:"global"}` for the copilot is not an intentional
 * tenant-wide mode, it is a hole: the run would then read the TENANT DEFAULT
 * space, which is the shared Company space, and reach every module mounted
 * there on behalf of a chat nobody placed anywhere.
 *
 * The personal space is the right answer and not an invention — it is the same
 * rule Phase C2 backfilled those very threads with, and the same one the shell
 * applies outside `/s/…` (`resolveCopilotSpaceId`).
 *
 * `listSpaces` is membership-filtered by core, so the only owned space it can
 * return is the caller's own.
 */
export async function resolvePersonalSpaceId(
  scope: AiSessionScope
): Promise<string | null> {
  const accessToken = scopeAccessToken(scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    return null;
  }
  try {
    const spaces = await new EngentyCoreClient({
      accessToken,
      coreBaseUrl,
    }).listSpaces();
    return (
      spaces.find((space) => space.ownerUserId === scope.userId)?.id ?? null
    );
  } catch (error) {
    logger.warn("personal space unresolved for a space-less personal chat", {
      message: error instanceof Error ? error.message : String(error),
      tenant_id: scope.tenantId,
    });
    return null;
  }
}

/**
 * The surface for a space that was already resolved SERVER-SIDE — the headless
 * task lane (PLAN-spaces.md C3a/C3b).
 *
 * The difference from {@link resolveRunSpace} is where the id came from, and it
 * matters. A chat's space is client-supplied, so fetching the surface doubles
 * as the access check. A task's space comes from `resolveWorkVisibility`
 * reading the task row — there is no client claim to check, and the run's
 * principal is the AI service, which holds no membership in anything.
 *
 * A private-space 404 is therefore `unresolved`, never tenant-global. Pass the
 * task id (always) and the task's acting user (when the row names one) so core
 * can authorize that already-validated Space. Do not substitute a
 * client-supplied space id.
 */
export async function resolveRunSpaceById(input: {
  actingUserId?: string;
  /** Unlocks a private Space's surface for the routine that owns it. */
  routineId?: string;
  runId?: string;
  scope: AiSessionScope;
  spaceId: string;
  taskId?: string;
}): Promise<RunSpaceResolution> {
  return resolveRunSpace({
    scope: input.scope,
    thread: { space_id: input.spaceId },
    ...(input.actingUserId ? { actingUserId: input.actingUserId } : {}),
    ...(input.routineId ? { routineId: input.routineId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
  });
}

/**
 * {@link resolveRunSpace} for a caller that holds a thread id rather than the
 * row — the streaming chat lane and its resume.
 *
 * A failed thread load is `global`: there is no Space claim to honour, and the
 * run is about to fail for the missing thread anyway. It must not fail HERE,
 * where the message would be about spaces instead of about the thread.
 */
export async function resolveRunSpaceForThread(input: {
  /**
   * The RUN's route context, when the caller has one fresher than the
   * thread's. A thread with no space of its own — the copilot's river — is
   * placed by where the person is standing for this turn, and only there.
   * A thread's own `space_id` still wins: a desk cannot be walked elsewhere.
   */
  routeContext?: Record<string, unknown> | null;
  runId?: string;
  scope: AiSessionScope;
  store: {
    getThread: (params: { tenantId: string; threadId: string }) => Promise<{
      route_context?: Record<string, unknown> | null;
      space_id?: string | null;
    } | null>;
  };
  threadId: string;
}): Promise<RunSpaceResolution> {
  let thread: {
    route_context?: Record<string, unknown> | null;
    space_id?: string | null;
  } | null;
  try {
    thread = await input.store.getThread({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
  } catch {
    return { kind: "global" };
  }
  if (!thread) {
    return { kind: "global" };
  }
  return resolveRunSpace({
    scope: input.scope,
    thread: {
      route_context: input.routeContext ?? thread.route_context,
      space_id: thread.space_id,
    },
    threadId: input.threadId,
    ...(input.runId ? { runId: input.runId } : {}),
  });
}
