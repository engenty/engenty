import type {
  ChatCommandDefinition,
  ModuleActionCapability,
  RoutineDefinition,
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

export interface EngentyWorkspaceContext {
  canSwitchTenant?: boolean;
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
  // Serializable ACTION.md / ROUTINE.md definitions declared by the module
  // (shape: @engenty/ai-core ModuleActionCapability / RoutineDefinition).
  actions?: ModuleActionCapability[];
  agentConfigs?: Array<{
    description?: string;
    id: string;
    instructions: string;
    model: string;
    name: string;
    skillIds?: string[];
    source?: "builtin" | "module" | "database";
    toolIds?: string[];
  }>;
  // Serializable COMMAND.md chat slash commands declared by the module.
  chatCommands?: ChatCommandDefinition[];
  moduleId: string;
  routines?: RoutineDefinition[];
  skills?: Record<string, string>;
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
  requestTimeoutMs?: number;
  userAccessToken: string;
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

  constructor(options: EngentyCoreClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.coreBaseUrl = normalizeCoreBaseUrl(options.coreBaseUrl);
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
    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, init);
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
          Authorization: `Bearer ${normalizeBearerToken(this.options.userAccessToken)}`,
          ...(this.options.agentId
            ? { "x-engenty-agent-id": this.options.agentId }
            : {}),
          ...(this.options.goalId
            ? { "x-engenty-goal-id": this.options.goalId }
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

  resolveAgentSystemPromptFromUiState(
    agentId: string,
    uiState: Record<string, unknown>
  ) {
    return this.request<{ system_prompt: string }>(
      "/api/tools/agent-system-prompt",
      {
        body: JSON.stringify({ agent_id: agentId, ui_state: uiState }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
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

  async getWorkspaceContext(): Promise<EngentyWorkspaceContext> {
    const token = this.options.userAccessToken;
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

  invokeTool<TInput, TResult>(toolId: string, input: TInput) {
    return this.request<TResult>(
      `/api/tools/${encodeURIComponent(toolId)}/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  env: Pick<NodeJS.ProcessEnv, "ENGENTY_CORE_BASE_URL"> = process.env
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
  env: Pick<NodeJS.ProcessEnv, "ENGENTY_CORE_HTTP_TIMEOUT_MS"> = process.env
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
