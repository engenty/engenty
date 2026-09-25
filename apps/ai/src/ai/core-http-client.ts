import type {
  AgentStarter,
  AgentWorkspaceConfig,
  ChatCommandDefinition,
  OutcomeProviderDefinition,
  RoutineDefinition,
  WorkflowDefinition,
} from "@engenty/ai-core";

export type EngentyApiEnvelope<T> =
  | { ok: true; data: T; meta?: unknown }
  | {
      ok: false;
      error: {
        code?: string;
        details?: unknown;
        message?: string;
      };
    };

export interface EngentyToolContract {
  auth?: {
    allowedPrincipalTypes?: string[];
    requiredCapabilities?: string[];
    requiredPermissions?: string[];
    requiredScopes?: string[];
    requiresApproval?: boolean;
    riskLevel?: "low" | "medium" | "high" | "critical";
  };
  description?: string;
  inputSchema?: {
    hint?: string;
    jsonSchema?: Record<string, unknown>;
    type?: string;
  };
  methodName?: string;
  moduleId?: string;
  operationId?: string;
  outputSchema?: {
    hint?: string;
    jsonSchema?: Record<string, unknown>;
    type?: string;
  };
  pluginId?: string;
  readOnly?: boolean;
  summary?: string;
  toolId?: string;
  transports?: string[];
}

/** A space as `GET /api/spaces` returns it (PLAN-spaces.md Phase 0). */
export interface EngentySpace {
  id: string;
  isDefault?: boolean;
  key: string;
  name: string;
  ownerUserId?: string | null;
}

/**
 * Everything mounted in a space, from core's ONE surface resolver
 * (PLAN-spaces.md Phase 3 / C3a).
 *
 * `agentAccess` is the part with teeth: `none` means the space's engentys get
 * NOTHING from that module even though its pages are there, and `read` means
 * they may look but not write. Core derives `capabilities` from the same mounts
 * with `deriveSpaceAgentCapabilities`, so the numbers a setup dialog shows and
 * what an agent actually gets cannot drift.
 */
export interface EngentySpaceMount {
  agentAccess: "none" | "read" | "write" | null;
  createdAt: string;
  isRequired: boolean;
  /** Agent mounts only: the agent whose room this agent's reports also reach. */
  reportsTo?: string | null;
  resourceKey: string;
  resourceType: "agent" | "module" | "plugin" | "skill";
  spaceId: string;
}

export interface EngentySpaceSurface {
  /**
   * Agent id → who it reports to here, for mounts that name one. Optional
   * for the same reason; absent means the roster carries no relationships.
   */
  agentReportsTo?: Record<string, string>;
  agents: string[];
  /**
   * The Space's consent for ITS browser (PLAN-user-browser.md D3;
   * PLAN-space-owned-connections.md): may an agent drive it while nobody
   * watches, and start it without asking. It rides the surface because that
   * is the one call a headless run already makes. Null when the Space never
   * set one. Never a widening: no grant means a headless run stops with
   * `needs_user`.
   */
  browserGrant?: { autostart?: boolean; unattended: boolean } | null;
  capabilities: string[];
  /** The Space computer's own egress hosts, beyond the proxy's shared list. */
  computerEgressHosts?: string[];
  /**
   * Network reach of this space's shared computer. Absent or null inherits the
   * host default — a core that predates the column simply omits it.
   */
  computerNetworkTier?: "none" | "egress" | null;
  /**
   * ACCOUNT ids (connection rows) this space owns, any status — every engenty
   * here uses them (PLAN-space-owned-connections.md).
   */
  connections: string[];
  /**
   * Connector ids enabled here: plugin mounts plus the connectors of the
   * space's active accounts, derived by core. Absent means the connector gate
   * finds nothing enabled, which refuses rather than widens.
   */
  connectors?: string[];
  modules: Array<{
    agentAccess: "none" | "read" | "write";
    isRequired: boolean;
    moduleId: string;
    /** Reserved and null on every row today; no assembler reads it. */
    recordScope: "space" | "all" | null;
  }>;
  skills: string[];
  spaceId: string;
  /**
   * Hired engenties with no `reports_to` here. Optional so apps/ai keeps
   * working against a core that predates the field; absent means nobody is
   * top-level, which withholds the hiring set rather than handing it out.
   */
  topLevelAgents?: string[];
}

/**
 * `GET /api/spaces/setup-catalog` — the modules a space may mount, as the setup
 * dialog lists them. `modules` is a display heuristic (connector providers,
 * platform plugins and Settings-placed modules are filtered out); core still
 * validates a mount against EVERY installed plugin, so a module missing here
 * can be mounted by id.
 */
export interface EngentySpaceSetupCatalog {
  modules: Array<{
    category: string | null;
    description: string | null;
    id: string;
    name: string;
  }>;
}

/** `POST /api/spaces/:id/setup/add` — see `postSpaceSetupAdd`. */
export interface EngentySpaceSetupAddResult {
  added: Array<{
    agent_access: "none" | "read" | "write" | null;
    resource_key: string;
    resource_type: string;
  }>;
  /**
   * Apps that now actually use an account here — the module's own binding
   * (a mailbox's sync state, a drive's file source). An entry carrying `error`
   * is a placement that stands with a binding that did not finish.
   */
  bound?: Array<{ connection_id: string; error?: string; module_id: string }>;
  /**
   * Apps whose own first-use setup ran with this call (their manifest's
   * `mountOperation` — the space's knowledge base row, for one). `ready:
   * false` with `needs` or `error` is a placement that stands with a setup
   * that did not finish; re-adding the app retries it.
   */
  mounted?: Array<{
    error?: string;
    module_id: string;
    needs: string[];
    ready: boolean;
  }>;
  /**
   * Apps mounted here that declare they need an account and have none.
   * Absent — not empty — when core could not check.
   */
  needs_connect?: Array<{ capability: string; module_id: string }>;
  surface: EngentySpaceSurface;
}

export interface EngentyWorkspaceContext {
  canSwitchTenant?: boolean;
  /**
   * Capability ids for this principal (AUTH-06). Optional here because this
   * type describes what core *may* send; the scope resolver's zod schema is
   * what turns it into the enforced contract.
   *
   * Note the 1-minute cache below: a role change takes up to that long to
   * reach a running apps/ai, exactly as the admin booleans already did.
   */
  capabilities?: string[];
  currentTenant: { id: string; name?: string; slug?: string } | null;
  currentUser?: {
    display_name?: string | null;
    email?: string | null;
    id: string;
    initials?: string | null;
    role?: "admin" | "member" | null;
  };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onboarded: boolean;
  resolvedAppearance?: {
    font?: string;
    fontSize?: string;
    language?: string;
    themeMode?: string;
  };
  tenantRole: "admin" | "member" | null;
  tenantSupportedLocales?: string[];
  tenants?: Array<{ id: string; name?: string; slug?: string }>;
  userId: string;
}

export interface EngentyPluginListItem {
  /** Catalog group from engenty.plugin.json. */
  category?: string;
  dependencies?: string[];
  description?: string;
  effectiveState?: {
    allowed?: boolean;
    globallyEnabled?: boolean;
    tenantEnabled?: boolean;
  };
  enabled?: boolean;
  globalEnabled?: boolean;
  id: string;
  kind?: string;
  loaded?: boolean;
  name?: string;
  operationsCount?: number;
  provides?: string[];
  requires?: string[];
  routesCount?: number;
  tenantEnabled?: boolean;
  tenantOverride?: boolean | null;
  ui?: unknown;
}

export interface EngentyCoreAiAgentListItem {
  agent_origin?: "registry" | "database";
  description?: string | null;
  id: string;
  instruction_keys?: string[];
  module_id?: string;
  name: string;
  skills?: string[];
  tools?: string[];
}

export interface EngentyCoreModuleCapabilitySeed {
  agentConfigs?: Array<{
    /**
     * Whose agent this is once mounted (`agent_scope` in agent.json):
     * `shared` keys rooms, observations, MEMORY.md and TASKS.md per Space,
     * `personal` per person. Absent = no audience and none of those.
     */
    agentScope?: "personal" | "shared";
    description?: string;
    id: string;
    instructions: string;
    model: string;
    /**
     * Owning module; `null` is a deliberate disclaimer (copilot/coordinator
     * ship inside a module but are platform agents). Carried so the identity
     * surfaces can name the module an agent came with.
     */
    moduleId?: string | null;
    name: string;
    skillIds?: string[];
    source?: "builtin" | "module" | "database";
    /** Empty-state composer chips declared in the module's agent.json. */
    starters?: AgentStarter[];
    toolIds?: string[];
    /**
     * The agent's workspace request (files + sandbox), straight from
     * agent.json / the module registrar. Until 2026-08-29 this was dropped
     * on the way into apps/ai, which silently stripped every module
     * specialist's declaration — the Worker compute default
     * (PLAN-agent-computers.md P1) needs the declaration to arrive.
     */
    workspace?: AgentWorkspaceConfig;
  }>;
  // Serializable COMMAND.md chat slash commands declared by the module.
  chatCommands?: ChatCommandDefinition[];
  moduleId: string;
  outcomeProviders?: OutcomeProviderDefinition[];
  routines?: RoutineDefinition[];
  skills?: Record<string, string>;
  // Module workflow / trigger declarations (shape: @engenty/ai-core
  // WorkflowDefinition / RoutineDefinition — plain JSON, carried verbatim).
  workflows?: WorkflowDefinition[];
}

export class EngentyCoreHttpError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown
  ) {
    super(message);
    this.name = "EngentyCoreHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_CORE_HTTP_TIMEOUT_MS = 60_000;

export interface EngentyCoreClientOptions {
  accessToken: string;
  /**
   * Phase 4: the agent driving these calls and the goal it is pursuing. When
   * set, forwarded to core as x-engenty-agent-id / x-engenty-goal-id so the
   * escalation policy can gate the band above the agent's grants and bind
   * approvals to the goal. Purely additive — core ignores them unless the
   * agent-escalation flag is on, and they can only add an approval requirement.
   */
  agentId?: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
  goalId?: string;
  /**
   * Re-mint the bearer after core answers 401. Service tokens live 15 minutes
   * and a long headless run outlives them; when this is set, a 401 triggers
   * one refresh, and a token different from the one that just failed is
   * retried once — the client then rides the fresh token for the rest of its
   * life. Absent (interactive user tokens, which nothing can re-mint), a 401
   * surfaces unchanged.
   */
  refreshAccessToken?: () => Promise<string | null | undefined>;
  requestTimeoutMs?: number;
  /**
   * The routine whose fire started this run, forwarded as
   * x-engenty-routine-id — the subject routine-scoped grants are spent against,
   * which is what opens a routine's standing permissions to its own runs.
   */
  routineId?: string;
  /**
   * The space this run happens in, forwarded as x-engenty-space-id (CN.3).
   *
   * Narrows which mounted ACCOUNT a connector call may resolve to. Purely
   * additive: core intersects it with what the principal may already reach, so
   * omitting it reproduces the pre-spaces behaviour exactly.
   */
  spaceId?: string;
  /**
   * Task a headless run is executing, forwarded as x-engenty-task-id — the
   * subject core's approval gate spends task-scoped grants against, and the
   * link stamped onto any approval request the gate files.
   */
  taskId?: string;
}

// Workspace context cache: key is token, value is [context, expiresAt]
const workspaceContextCache = new Map<
  string,
  [EngentyWorkspaceContext, number]
>();
const WORKSPACE_CONTEXT_TTL_MS = 60_000; // 1 minute

export class EngentyCoreClient {
  private readonly options: EngentyCoreClientOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly coreBaseUrl: string;
  /** Current bearer — starts as options.accessToken and is replaced by a
   * successful 401 refresh, so every later request rides the fresh token. */
  private accessToken: string;

  constructor(options: EngentyCoreClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.coreBaseUrl = normalizeCoreBaseUrl(options.coreBaseUrl);
    this.accessToken = options.accessToken;
  }

  async request<T>(
    path: string,
    init: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    if (!path.startsWith("/")) {
      throw new EngentyCoreHttpError(
        "Core request paths must be absolute paths, not URLs.",
        0,
        "invalid_core_path"
      );
    }

    const url = new URL(path, this.coreBaseUrl);
    let response = await this.fetchOnce(url, init);
    // 401 with a refresh seam: the bearer likely expired mid-run (service
    // tokens live 15 minutes; long headless runs outlive them). Re-mint once
    // and retry — but only with a token DIFFERENT from the one that just
    // failed, so a 401 that is not about expiry cannot loop.
    if (response.status === 401 && this.options.refreshAccessToken) {
      const failedToken = normalizeBearerToken(this.accessToken);
      const fresh = await this.options.refreshAccessToken().catch(() => null);
      if (fresh && normalizeBearerToken(fresh) !== failedToken) {
        this.accessToken = fresh;
        response = await this.fetchOnce(url, init);
      }
    }

    const body = await parseJsonBody(response);
    const envelope = body as EngentyApiEnvelope<T>;
    if (isApiErrorEnvelope(envelope)) {
      throw new EngentyCoreHttpError(
        envelope.error.message ?? `Core request failed with ${response.status}`,
        response.status,
        envelope.error.code ?? statusToErrorCode(response.status),
        envelope.error.details
      );
    }
    if (!response.ok) {
      throw new EngentyCoreHttpError(
        `Core request failed with ${response.status}`,
        response.status,
        statusToErrorCode(response.status),
        body
      );
    }
    if (isApiSuccessEnvelope(envelope)) {
      return envelope.data;
    }
    throw new EngentyCoreHttpError(
      "Core response did not match the Engenty API envelope.",
      response.status,
      "invalid_core_response",
      body
    );
  }

  /** One fetch attempt with the error mapping `request` promises callers. */
  private async fetchOnce(
    url: URL,
    init: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    }
  ): Promise<Response> {
    try {
      return await this.fetchWithTimeout(url, init);
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        throw err;
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Core request timed out"
          : err instanceof Error
            ? err.message
            : "Core request failed";
      throw new EngentyCoreHttpError(message, 0, "network_error");
    }
  }

  private async fetchWithTimeout(
    url: URL,
    init: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    }
  ) {
    const timeoutMs =
      this.options.requestTimeoutMs ?? getEngentyCoreHttpTimeoutMsFromEnv();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener("abort", abortFromUpstream, {
          once: true,
        });
      }
    }
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${normalizeBearerToken(this.accessToken)}`,
          ...(this.options.agentId
            ? { "x-engenty-agent-id": this.options.agentId }
            : {}),
          ...(this.options.goalId
            ? { "x-engenty-goal-id": this.options.goalId }
            : {}),
          ...(this.options.spaceId
            ? { "x-engenty-space-id": this.options.spaceId }
            : {}),
          ...(this.options.taskId
            ? { "x-engenty-task-id": this.options.taskId }
            : {}),
          ...(this.options.routineId
            ? { "x-engenty-routine-id": this.options.routineId }
            : {}),
          ...init.headers,
        },
      });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  }

  listToolContracts() {
    return this.request<EngentyToolContract[]>("/api/tools/contracts");
  }

  listModuleCapabilitySeeds() {
    return this.request<{ capabilities: EngentyCoreModuleCapabilitySeed[] }>(
      "/api/tools/module-capabilities"
    );
  }

  listAiAgents(moduleId?: string | null) {
    const query = moduleId ? `?moduleId=${encodeURIComponent(moduleId)}` : "";
    return this.request<{ agents: EngentyCoreAiAgentListItem[] }>(
      `/api/admin/ai/agents${query}`
    );
  }

  describeTool(toolId: string) {
    return this.request<EngentyToolContract>(
      `/api/tools/contracts/${encodeURIComponent(toolId)}`
    );
  }

  /**
   * Answer an approval request core filed when it returned 202. Exposed as its
   * own method rather than raw `request` so the tools port stays a list of
   * intentional operations.
   */
  decideApproval(
    requestId: string,
    body: { decision: "allow_once" | "allow_policy"; subject_id?: string }
  ) {
    return this.request<unknown>(
      `/api/security/approvals/${encodeURIComponent(requestId)}/decision`,
      { body: JSON.stringify(body), method: "POST" }
    );
  }

  async getWorkspaceContext(): Promise<EngentyWorkspaceContext> {
    const token = this.accessToken;
    const cached = workspaceContextCache.get(token);
    if (cached) {
      const [context, expiresAt] = cached;
      if (Date.now() < expiresAt) {
        return context;
      }
      workspaceContextCache.delete(token);
    }
    const context = await this.request<EngentyWorkspaceContext>(
      "/api/users/setup/context"
    );
    workspaceContextCache.set(token, [
      context,
      Date.now() + WORKSPACE_CONTEXT_TTL_MS,
    ]);
    return context;
  }

  listPlugins(tenantId?: string | null) {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request<EngentyPluginListItem[]>(`/api/plugins${query}`);
  }

  /**
   * The spaces this caller may enter (PLAN-spaces.md Phase P2).
   *
   * Membership-filtered by core, so naming a space from this list in a prompt
   * cannot disclose one the user is not in — which matters because personal
   * spaces are private and their key is a person's name.
   */
  listSpaces() {
    return this.request<EngentySpace[]>("/api/spaces");
  }

  /**
   * Every space mounting a module — the trigger fan-out's question
   * (`scope: "space"` reconciles one binding per space here). Service-lane
   * only on core's side; includes private spaces by design.
   */
  listSpacesMounting(moduleId: string) {
    return this.request<{ space_ids: string[] }>(
      `/api/spaces/mounting/${encodeURIComponent(moduleId)}`
    );
  }

  /**
   * What a space contains (PLAN-spaces.md Phase C3a).
   *
   * Gated by `requireSpaceAccess` on core's side, so a caller who is not in the
   * space gets an error rather than its mount list — which is why apps/ai can
   * treat a successful response as proof of access and does not re-derive one.
   */
  getSpaceSurface(spaceId: string) {
    return this.request<EngentySpaceSurface>(
      `/api/spaces/${encodeURIComponent(spaceId)}/surface`
    );
  }

  /** A Space's browser consent (members read; owners set — core decides). */
  getSpaceBrowserGrant(spaceId: string) {
    return this.request<{ autostart: boolean; unattended: boolean }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/browser-grant`
    );
  }

  /** Set one or both consents; an omitted flag keeps its value. */
  putSpaceBrowserGrant(
    spaceId: string,
    patch: { autostart?: boolean; unattended?: boolean }
  ) {
    return this.request<{ autostart: boolean; unattended: boolean }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/browser-grant`,
      { body: JSON.stringify(patch), method: "PUT" }
    );
  }

  /** The explicit mount rows of a space — where an agent's `reportsTo` lives. */
  listSpaceMounts(spaceId: string) {
    return this.request<EngentySpaceMount[]>(
      `/api/spaces/${encodeURIComponent(spaceId)}/mounts`
    );
  }

  /**
   * Mount one resource on a space (PLAN-spaces.md Phase 3). Admin or personal-
   * space owner — core refuses everyone else. Used when installing a public
   * skill into the current space from chat; `space_setup` posts to /setup/add.
   *
   * `agent_access` / `record_scope` are module-only; core rejects them on any
   * other resource type, and rejects a module mount that omits `agent_access`.
   */
  putSpaceMount(
    spaceId: string,
    input: {
      agent_access?: "none" | "read" | "write";
      record_scope?: "space" | "all";
      /** Agent mounts only: who this agent reports to. Null clears. */
      reports_to?: string | null;
      resource_key: string;
      resource_type: "agent" | "module" | "plugin" | "skill";
    }
  ) {
    return this.request<unknown>(
      `/api/spaces/${encodeURIComponent(spaceId)}/mounts`,
      {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }
    );
  }

  /**
   * ADD to a space's setup (PLAN-connections-ux.md B2). Additive: what is
   * already mounted stays, and re-adding a mount with a different
   * `agent_access` is how the level changes.
   *
   * The answer carries what the caller still has to do: `needs_connect` names
   * apps that are here with no account to work with.
   */
  postSpaceSetupAdd(
    spaceId: string,
    mounts: Array<{
      agent_access?: "none" | "read" | "write";
      resource_key: string;
      resource_type: "agent" | "module" | "plugin" | "skill";
    }>
  ) {
    return this.request<EngentySpaceSetupAddResult>(
      `/api/spaces/${encodeURIComponent(spaceId)}/setup/add`,
      {
        body: JSON.stringify({ mounts }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
  }

  /**
   * Unmount one resource. Unmounting HIDES records, it never deletes them —
   * say that wherever this is offered.
   */
  deleteSpaceMount(
    spaceId: string,
    resourceType: "agent" | "module" | "plugin" | "skill",
    resourceKey: string
  ) {
    return this.request<{ removed: boolean }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/mounts/${encodeURIComponent(
        resourceType
      )}/${encodeURIComponent(resourceKey)}`,
      { method: "DELETE" }
    );
  }

  /**
   * The modules a space MAY mount, with their display names. Readable by any
   * member — it is a catalog, not tenant data.
   */
  getSpaceSetupCatalog() {
    return this.request<EngentySpaceSetupCatalog>("/api/spaces/setup-catalog");
  }

  putSpaceSkillPack(spaceId: string, category: string) {
    return this.request<{ category: string; mounted: string[] }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/skill-packs/${encodeURIComponent(category)}`,
      { method: "PUT" }
    );
  }

  deleteSpaceSkillPack(spaceId: string, category: string) {
    return this.request<{
      category: string;
      retained: string[];
      unmounted: string[];
    }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/skill-packs/${encodeURIComponent(category)}`,
      { method: "DELETE" }
    );
  }

  /**
   * `options.origin` marks WHERE the call came from when that changes who owns
   * the approval UX. The App proxy passes "app": its calls carry the viewing
   * user's token but have no chat turn behind them, so core's connector gate
   * must not defer to a pre-gate that is not running (CON-01).
   */
  invokeTool<TInput, TResult>(
    toolId: string,
    input: TInput,
    options?: { origin?: "app"; spaceId?: string }
  ) {
    return this.request<TResult>(
      `/api/tools/${encodeURIComponent(toolId)}/invoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options?.origin
            ? { "x-engenty-call-origin": options.origin }
            : {}),
          // One call in another Space than the client's: a connector call of
          // a run whose connections live elsewhere (`callSpaceIdFor`).
          ...(options?.spaceId
            ? { "x-engenty-space-id": options.spaceId }
            : {}),
        },
        body: JSON.stringify({ input }),
      }
    );
  }
}

function normalizeBearerToken(value: string) {
  let normalized = value.trim();
  while (/^Bearer\s+/i.test(normalized)) {
    normalized = normalized.replace(/^Bearer\s+/i, "").trim();
  }
  return normalized;
}

export function getEngentyCoreBaseUrlFromEnv(
  env: Partial<Pick<NodeJS.ProcessEnv, "ENGENTY_CORE_BASE_URL">> = process.env
) {
  const value = env.ENGENTY_CORE_BASE_URL?.trim();
  if (value && value.length > 0) {
    return value;
  }
  // Local dev fallback: core runs on loopback (the dev gateway). Avoids Portless TLS in Node.
  if (process.env.NODE_ENV !== "production") {
    const port =
      Number.parseInt(process.env.ENGENTY_CORE_PORT ?? "", 10) || 8787;
    return `http://127.0.0.1:${port}`;
  }
  return;
}

export function getEngentyCoreHttpTimeoutMsFromEnv(
  env: Partial<
    Pick<NodeJS.ProcessEnv, "ENGENTY_CORE_HTTP_TIMEOUT_MS">
  > = process.env
) {
  const raw = env.ENGENTY_CORE_HTTP_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_CORE_HTTP_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CORE_HTTP_TIMEOUT_MS;
}

function normalizeCoreBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new EngentyCoreHttpError(
      "ENGENTY_CORE_BASE_URL is required for core-backed tools.",
      0,
      "missing_core_base_url"
    );
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

async function parseJsonBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EngentyCoreHttpError(
      "Core response was not valid JSON.",
      response.status,
      "invalid_core_json",
      text
    );
  }
}

function isApiSuccessEnvelope<T>(
  value: EngentyApiEnvelope<T>
): value is { ok: true; data: T; meta?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === true &&
    "data" in value
  );
}

function isApiErrorEnvelope<T>(
  value: EngentyApiEnvelope<T>
): value is Extract<EngentyApiEnvelope<T>, { ok: false }> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: unknown }).error === "object" &&
    (value as { error?: unknown }).error !== null
  );
}

function statusToErrorCode(status: number) {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 422:
      return "validation_error";
    case 503:
      return "service_unavailable";
    default:
      return status >= 500 ? "internal_error" : "request_failed";
  }
}
