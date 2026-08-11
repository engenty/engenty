import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import {
  createApprovalService,
  listGoalGrantCapabilities,
  revokeApprovalGrantsForSubject,
} from "@engenty/approvals-sdk";
import {
  ENGENTY_DESKTOP_APP_ORIGIN,
  isEngentyDevelopmentEnvironment,
} from "@engenty/environment";
import { envBoolean, envNumber, envString } from "@engenty/environment/env";
import { serve } from "@hono/node-server";
import { extendZodWithOpenApi, OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cors } from "hono/cors";
import { z as zod } from "zod";
import {
  createTenantPluginOverridesDal,
  type TenantPluginOverridesDal,
} from "../dal/tenant-plugin-overrides.js";
import { createDatabaseAdapter } from "../infra/index.js";
import { checkSupabaseReachable } from "../lib/supabase-startup-check.js";
import {
  createApiLoggerFromRequestLogger,
  createBootApiLogger,
  createHonoRequestLogger,
  initEvlog,
  parseError,
  type RequestLogger,
} from "../observability/evlog.js";
import {
  createDevPluginReloadEventHub,
  type DevPluginReloadEventHub,
} from "../plugins/dev-reload-events.js";
import {
  type DevPluginReloadWatcher,
  startDevPluginReloadWatcher,
} from "../plugins/dev-reload-watcher.js";
import { resolveModulesDir, resolvePackagesDir } from "../plugins/discovery.js";
import { type LoadPluginsParams, loadPlugins } from "../plugins/loader.js";
import { createGatedQueueHandlers } from "../plugins/queue-handler-gating.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { reloadBackendPlugin } from "../plugins/reload-executor.js";
import { createAgentEscalationPolicy } from "../security/agent-escalation-policy.js";
import {
  createPersistentAuditLog,
  type SecurityAuditLogAdapter,
} from "../security/audit-adapter.js";
import { createSupabaseAuthProvider } from "../security/auth-provider.js";
import {
  createGrantsService,
  type GrantsService,
} from "../security/grants-service.js";
import { registerAuthzRoutes } from "./routes/authz-routes.js";

/** Service-role client for core's own tables (goal grants, approval store). */
function createCoreServiceClient(config: Record<string, unknown>) {
  const client = createDatabaseAdapter(config);
  if (!client) {
    throw new Error("Missing Supabase service configuration.");
  }
  return client;
}

import {
  createSupabaseApproverRoleResolver,
  denyAllApproverRoleResolver,
} from "../security/auth-stores/approver-role.js";
import {
  type AuthStores,
  createAuthStores,
} from "../security/auth-stores/index.js";
import { createSupabaseClientFromConfig } from "../security/auth-stores/supabase.js";
import { revokeTokenId } from "../security/token-revocation.js";
import { buildApiCatalog } from "./api-catalog.js";
import { registerCoreApiCatalogProvider } from "./api-catalog-registration.js";
import {
  createDevGatewayHooks,
  shouldRegisterDevGateway,
} from "./dev-gateway.js";
import { registerOpenApiEndpoints } from "./openapi.js";
import {
  createProdGatewayHooks,
  readProdGatewayConfig,
  shouldRegisterProdGateway,
} from "./prod-gateway.js";
import { registerCoreMethods } from "./register-methods.js";
import { registerAiAgentSystemPromptRoutes } from "./routes/ai-agent-system-prompt-routes.js";
import { registerAiModuleCapabilityRoutes } from "./routes/ai-module-capability-routes.js";
import { buildJsonErrorBody } from "./routes/api-response.js";
import { registerActorTokenRoutes } from "./routes/auth/actor-token-routes.js";
import { registerAgentAuthDiscoveryRoutes } from "./routes/auth/agent-auth-discovery.js";
import { registerAuthRoutes } from "./routes/auth/auth-routes.js";
import { registerDevLoginRoutes } from "./routes/auth/dev-login-routes.js";
import { registerDeviceFlowRoutes } from "./routes/auth/device-flow-routes.js";
import { registerImpersonateRoutes } from "./routes/auth/impersonate-routes.js";
import { registerBillingRoutes } from "./routes/billing-routes.js";
import { registerCoreAiRemovedRoutes } from "./routes/core-ai-removed-routes.js";
import { registerDashboardRoutes } from "./routes/dashboard/index.js";
import { registerDesktopBootstrapRoutes } from "./routes/desktop-bootstrap-routes.js";
import { registerEntitlementsRoutes } from "./routes/entitlements-routes.js";
import { registerEvlogIngestRoutes } from "./routes/evlog-ingest-routes.js";
import { registerFeatureFlagsRoutes } from "./routes/feature-flags-routes.js";
import { registerFileStorageRoutes } from "./routes/file-storage-routes.js";
import { registerGatewayRoutes } from "./routes/gateway-routes.js";
import { registerLogInspectorRoutes } from "./routes/log-inspector-routes.js";
import { registerPlatformSettingsRoutes } from "./routes/platform-settings-routes.js";
import {
  registerApprovalRoutes,
  registerModuleOperationRoutes,
} from "./routes/plugins/module-operation-routes.js";
import { registerPluginAdminRoutes } from "./routes/plugins/plugin-admin-routes.js";
import { registerPluginDevReloadEventsRoutes } from "./routes/plugins/plugin-dev-reload-events-routes.js";
import { registerPluginHttpRoutes } from "./routes/plugins/plugin-http-routes.js";
import { registerQueueRoutes } from "./routes/queue-routes.js";
import { registerSatellitesRoutes } from "./routes/satellites-routes.js";
import { registerSearchIndexRoutes } from "./routes/search-index-routes.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import { registerSuperadminRoutes } from "./routes/superadmin-routes.js";
import { registerTestDataRoutes } from "./routes/test-data-routes.js";
import type { ApiLogger } from "./routes/types.js";
import { registerUserManagementRoutes } from "./routes/user-management-routes.js";
import { registerWorkspaceSearchRoutes } from "./routes/workspace-search-routes.js";

extendZodWithOpenApi(zod);

const defaultLogger: ApiLogger = createBootApiLogger();

export interface CreateApiAppParams {
  /**
   * Override the approval store (tests back it with an in-memory double).
   * The default talks to core's tables, so a caller without a reachable
   * Supabase must inject one or every gated operation fails at the store.
   */
  approvalService?: ReturnType<typeof createApprovalService>;
  /** Inject audit log (e.g. noop for tests when Supabase not available). */
  auditLog?: SecurityAuditLogAdapter;
  /** Override auth stores (tests use memory stores). */
  authStores?: AuthStores;
  config?: Record<string, unknown>;
  dataDir: string;
  devPluginReloadEvents?: DevPluginReloadEventHub;
  /**
   * Override the grants resolver (tests use a static double). The default
   * reads core.role_assignments; the always-on agent escalation policy calls
   * it on every agent-driven op, so unit tests without a live Supabase must
   * inject one or those invokes 500 on the store.
   */
  grantsService?: GrantsService;
  logger?: ApiLogger;
  registry: PluginRegistry;
  resolvePath: (p: string) => string;
  tenantPluginOverrides?: TenantPluginOverridesDal;
}

export function createApiApp(params: CreateApiAppParams) {
  initEvlog();
  const logger = params.logger ?? defaultLogger;
  const config = params.config ?? {};
  const app = new OpenAPIHono();
  const devPluginReloadEvents =
    params.devPluginReloadEvents ?? createDevPluginReloadEventHub();
  registerCoreMethods(params.registry, config, {
    getApiCatalog: async (input, auth) =>
      buildApiCatalog({
        input,
        openApiDocument: app.getOpenAPIDocument({
          openapi: "3.0.0",
          info: {
            title: "Engenty API",
            version: "0.0.1",
            description:
              "Core API with plugin-registered routes and gateway methods.",
          },
        }) as Parameters<typeof buildApiCatalog>[0]["openApiDocument"],
        registry: params.registry,
        tenantId: auth?.tenantId,
        tenantPluginOverrides: auth?.tenantId
          ? await tenantPluginOverrides.getOverrides(auth.tenantId)
          : {},
      }),
  });
  // Comma-separated allowlist; the Tauri desktop shell's origin is always
  // allowed on top of it (bearer-token auth, so origin checks add nothing).
  const corsOrigin = envString(config, "corsOrigin", "CORS_ORIGIN", "*");
  const corsAllowedOrigins = corsOrigin
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  app.use(
    "*",
    cors({
      origin: corsAllowedOrigins.includes("*")
        ? "*"
        : (origin) =>
            corsAllowedOrigins.includes(origin) ||
            origin === ENGENTY_DESKTOP_APP_ORIGIN
              ? origin
              : null,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["authorization", "content-type"],
    })
  );

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    const path = new URL(c.req.url).pathname;
    const requestLogger = createHonoRequestLogger({
      method: c.req.method,
      path,
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
    });
    const ua = c.req.header("user-agent");
    if (ua) {
      requestLogger.set({ userAgent: ua });
    }
    const cl = c.req.header("content-length");
    if (cl) {
      requestLogger.set({ requestSize: Number.parseInt(cl, 10) });
    }
    c.set("evlog", requestLogger);
    let status = 500;
    try {
      const res = (await next()) as Response | undefined;
      status = res?.status ?? 500;
      return res;
    } catch (err) {
      // Non-Error throws (e.g. PostgrestError-like objects) stringify as
      // "[object Object]" via String() — serialize them readably instead.
      requestLogger.error(
        err instanceof Error
          ? err
          : new Error(
              typeof err === "object" && err !== null
                ? JSON.stringify(err)
                : String(err)
            )
      );
      throw err;
    } finally {
      if (!path.startsWith("/api/logs/")) {
        requestLogger.emit({ status, duration: Date.now() - startedAt });
      }
    }
  });

  const getLogger = (c: {
    get: (k: "evlog") => RequestLogger | undefined | unknown;
  }): ApiLogger => {
    const reqLog = c.get("evlog") as RequestLogger | undefined;
    return reqLog
      ? createApiLoggerFromRequestLogger(reqLog)
      : createBootApiLogger();
  };

  // Phase A seam: tenant-scoped approval/grant work runs on tenant-locked
  // handles (registry.getTenantDb, engenty_server lane); the service client
  // survives for the null-tenant lanes inside the approval service (superadmin
  // queue, id-only get) and as the no-lane fallback in dev bootstraps without
  // a JWT secret. An injected service (tests) brings its own store, so there
  // is no client to share and no reaper to wire.
  const getTenantDb = params.registry.getTenantDb
    ? (auth: { tenantId: string }) =>
        params.registry.getTenantDb?.(auth) as SupabaseClient
    : null;
  const approvals = params.approvalService
    ? { client: null, service: params.approvalService }
    : (() => {
        const client = createCoreServiceClient(config);
        const dbFor = (tenantId: string | null) =>
          tenantId && getTenantDb ? getTenantDb({ tenantId }) : client;
        return { client, service: createApprovalService(dbFor) };
      })();
  const approvalService = approvals.service;
  const grantsService =
    params.grantsService ??
    createGrantsService(config, {
      getRegistry: () => params.registry.roleProfiles,
      ...(getTenantDb ? { getDb: getTenantDb } : {}),
    });
  const authProvider = createSupabaseAuthProvider(config, {
    grants: grantsService,
  });

  // Agent escalation-to-approval policy (goal-scoped): an agent-driven op whose
  // required capabilities fall outside the agent's role grants ∪ its goal grants
  // escalates to approval instead of running.
  //
  // Registered UNCONDITIONALLY. This was behind ENGENTY_AGENT_ESCALATION, which
  // only the two compose files ever set — so any other way of running the images
  // silently had no agent gating at all, and the flag's own history is the
  // argument against it: written as opt-in "until apps/ai forwards agent/goal
  // ids", never switched on, and the 2026-08-03 audit (AUTH-03) found the policy
  // that `policy.ts` names as THE gate for agent runs registered in no
  // deployment at all. A gate whose absent-default is fail-open, silently, is
  // not a gate. To let a specific agent do more, widen its role grants — that is
  // scoped, auditable, and per-tenant; disabling the control globally is not.
  //
  // When tests inject grantsService they are offline: skip the service-role
  // client and treat goal grants as empty (unit tests do not exercise that path).
  const escalationClient = params.grantsService
    ? null
    : createCoreServiceClient(config);
  const escalationPolicy = createAgentEscalationPolicy({
    resolveAgentCapabilities: (agentId, tenantId) =>
      grantsService
        .resolveGrants({ kind: "agent", id: agentId }, tenantId)
        .then((g) => g.capabilities),
    listGoalGrantCapabilities: async (tenantId, goalId, agentId) => {
      const client = getTenantDb?.({ tenantId }) ?? escalationClient;
      if (!client) {
        return [];
      }
      return listGoalGrantCapabilities(client, {
        tenantId,
        goalId,
        agentId,
      });
    },
  });
  if (!params.registry.profilePolicies) {
    params.registry.profilePolicies = [];
  }
  params.registry.profilePolicies.push({
    pluginId: "core",
    policy: escalationPolicy,
    source: "core",
    pluginConfig: {},
  });
  const tenantPluginOverrides =
    params.tenantPluginOverrides ?? createTenantPluginOverridesDal(config);
  const securityAuditLog =
    params.auditLog ??
    createPersistentAuditLog({
      config: params.config ?? {},
      dataDir: params.dataDir,
    });
  // The in-process gate (module → module operation calls through the plugin
  // runtime API) evaluates the same policy as the HTTP transports; it needs
  // the same two services, which only exist here. Before this call it runs
  // without them: grants cannot open the gate, decisions are not audited.
  params.registry.setPolicyDeps?.({
    approvalService,
    auditLog: securityAuditLog,
  });
  app.onError((err, c) => {
    const reqLog = c.get("evlog");
    if (reqLog) {
      reqLog.error(err instanceof Error ? err : new Error(String(err)));
    } else {
      logger.error(
        `API error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const parsed = parseError(err);
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(
      buildJsonErrorBody((parsed.status as 500) || 500, {
        message: parsed.message,
        details: {
          ...(isDev && parsed.why && { why: parsed.why }),
          ...(isDev && parsed.fix && { fix: parsed.fix }),
        },
      }),
      (parsed.status as 500) || 500
    );
  });

  registerEvlogIngestRoutes({ app });
  registerOpenApiEndpoints(app);
  // Register before plugin admin routes: `GET /api/plugins/:id` would otherwise
  // capture `dev-reload-events` and require Bearer auth. EventSource cannot send
  // Authorization headers, so the SSE stream would always 401.
  registerPluginDevReloadEventsRoutes({
    app,
    config,
    hub: devPluginReloadEvents,
  });
  registerPluginAdminRoutes({
    auditLog: securityAuditLog,
    app,
    registry: params.registry,
    dataDir: params.dataDir,
    config,
    logger,
    resolvePath: params.resolvePath,
    tenantPluginOverrides,
  });
  registerFeatureFlagsRoutes({
    app,
    registry: params.registry,
    config,
  });
  registerEntitlementsRoutes({ app, config });
  registerSatellitesRoutes({ app, config });
  registerBillingRoutes({ app, config });
  const authStores = params.authStores ?? createAuthStores(config);
  // Revocation survives restarts: persisted revoked api-token ids re-enter the
  // in-memory revocation set used by verifyAccessToken.
  void authStores.apiTokens
    .listRevokedIds()
    .then((revoked) => {
      for (const entry of revoked) {
        revokeTokenId(entry.id, entry.expiresAt);
      }
    })
    .catch(() => undefined);
  const authStoresClient = params.authStores
    ? null
    : createSupabaseClientFromConfig(config);
  registerAuthRoutes({
    app,
    config,
    auditLog: securityAuditLog,
    ...(approvals.client
      ? {
          revokeSessionApprovalGrants: (tenantId: string, sessionId: string) =>
            revokeApprovalGrantsForSubject(
              getTenantDb?.({ tenantId }) ?? approvals.client,
              {
                scope: "session",
                subjectId: sessionId,
                tenantId,
              }
            ),
        }
      : {}),
    stores: authStores,
    ...(authStoresClient
      ? {
          tenantExists: async (tenantId: string) => {
            const { data } = await authStoresClient
              .schema("core")
              .from("tenants")
              .select("id")
              .eq("id", tenantId)
              .maybeSingle();
            return Boolean(data);
          },
        }
      : {}),
  });
  // Delegated actor tokens (engenty-remote): the AI service mints short-lived
  // user-scoped tokens so remote-channel turns act as the mapped user.
  registerActorTokenRoutes({
    app,
    auditLog: securityAuditLog,
    authProvider,
    config,
    grants: grantsService,
  });
  // Browser “Login as” for platform superadmins — mints a real Supabase
  // session for the target user (distinct from short-lived actor tokens).
  registerImpersonateRoutes({
    app,
    auditLog: securityAuditLog,
    authProvider,
    config,
  });
  registerAgentAuthDiscoveryRoutes({ app });
  registerDeviceFlowRoutes({
    app,
    auditLog: securityAuditLog,
    config,
    resolveApproverRole: authStoresClient
      ? createSupabaseApproverRoleResolver(authStoresClient)
      : denyAllApproverRoleResolver,
    stores: authStores,
  });
  registerDevLoginRoutes({ app, config });
  registerUserManagementRoutes({
    app,
    auditLog: securityAuditLog,
    config,
  });
  registerSuperadminRoutes({
    app,
    config,
    auditLog: securityAuditLog,
    approvalService,
  });
  registerAuthzRoutes({
    app,
    config,
    registry: params.registry,
    grants: grantsService,
    auditLog: securityAuditLog,
  });

  registerPluginHttpRoutes({
    app,
    registry: params.registry,
    config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    getLogger,
    authProvider,
    approvalService,
    auditLog: securityAuditLog,
    tenantPluginOverrides,
  });

  registerGatewayRoutes({
    app,
    registry: params.registry,
    config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    getLogger,
    authProvider,
    approvalService,
    auditLog: securityAuditLog,
    tenantPluginOverrides,
  });

  registerModuleOperationRoutes({
    app,
    registry: params.registry,
    config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    authProvider,
    approvalService,
    auditLog: securityAuditLog,
    tenantPluginOverrides,
  });
  registerAiModuleCapabilityRoutes(app, config);
  registerAiAgentSystemPromptRoutes(app, config);
  registerApprovalRoutes({
    app,
    config,
    authProvider,
    approvalService,
    auditLog: securityAuditLog,
  });

  registerTestDataRoutes({
    app,
    approvalService,
    auditLog: securityAuditLog,
    config,
    dataDir: params.dataDir,
    getLogger,
    registry: params.registry,
    resolvePath: params.resolvePath,
  });

  registerDashboardRoutes({
    app,
    config,
    dataDir: params.dataDir,
    registry: params.registry,
    resolvePath: params.resolvePath,
  });
  registerCoreAiRemovedRoutes(app);
  // Boot-time registration of `core_api_catalog` so the unified search-index
  // surface and any in-process catalog consumer see a real provider, not
  // dead code. Must run before `registerSearchIndexRoutes` so the registry
  // is populated when the operator UI first lists providers.
  registerCoreApiCatalogProvider({
    app,
    registry: params.registry,
    resolveTenantPluginOverrides: async (tenantId) =>
      tenantId ? await tenantPluginOverrides.getOverrides(tenantId) : {},
  });
  registerSearchIndexRoutes({
    app,
    config,
    resolveRegistry: () => params.registry.searchIndexRegistry,
  });
  registerWorkspaceSearchRoutes({
    app,
    config,
    registry: params.registry,
  });
  registerSettingsRoutes({ app, config });
  registerPlatformSettingsRoutes({ app, config });
  registerLogInspectorRoutes({ app, config });
  registerFileStorageRoutes({ app, config });
  registerQueueRoutes({ app, config, registry: params.registry });
  registerDesktopBootstrapRoutes({ app, config });

  return app;
}

export interface StartApiServerParams {
  config?: Record<string, unknown>;
  dataDir?: string;
  host?: string;
  logger?: ApiLogger;
  modulesDir?: string;
  packagesDir?: string;
  port?: number;
}

const EADDRINUSE_RETRY_DELAY_MS = 2000;
const EADDRINUSE_MAX_RETRIES = 3;

export function shouldStartDevPluginReloadWatcher(
  config: Record<string, unknown> = {}
): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (
    !envBoolean(
      config,
      "devPluginReloadWatcherEnabled",
      "ENGENTY_DEV_PLUGIN_RELOAD_WATCHER",
      true
    )
  ) {
    return false;
  }
  return isEngentyDevelopmentEnvironment();
}

export function resolveDevPluginReloadWatcherRoots(
  registry: PluginRegistry
): string[] {
  return Array.from(
    new Set(
      registry.plugins
        .filter((plugin) => plugin.loaded)
        .filter(
          (plugin) =>
            plugin.sourceType === "module" || plugin.sourceType === "package"
        )
        .map((plugin) => path.resolve(plugin.rootDir))
    )
  ).sort();
}

/** How long the lane probe may take before we treat it as a failure. */
const SERVER_LANE_PREFLIGHT_TIMEOUT_MS = 10_000;

/**
 * Verifies at boot that PostgREST actually accepts a minted engenty_server
 * token, before the port opens.
 *
 * Why this exists as a boot gate rather than a runtime surprise: if the
 * signing secret does not match the stack's, or the lane migration was never
 * applied, then EVERY tenant-scoped query fails — but nothing else notices.
 * The process starts, health checks pass, and the DB guards stay green because
 * they talk to psql rather than PostgREST. The failure only shows up as broken
 * features. (This function was written with the boot check in mind and then
 * never called, which is exactly how that gap survived.)
 *
 * Policy, deliberately asymmetric:
 *  - lane not configured → nothing to check; the loader already warns.
 *  - configured but not verifying, in production → refuse to start. A silent
 *    boot here means a totally broken deployment, and crash-looping is far
 *    easier to diagnose than "the app is up but nothing loads".
 *  - configured but not verifying, outside production → log loudly and
 *    continue, so a half-set-up worktree stays workable.
 */
async function runServerLanePreflight(
  registry: { assertServerLanePreflight?: () => Promise<void> },
  logger: { error: (msg: string) => void; info: (msg: string) => void }
): Promise<void> {
  const preflight = registry.assertServerLanePreflight;
  if (!preflight) {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      preflight(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `no response within ${SERVER_LANE_PREFLIGHT_TIMEOUT_MS}ms`
              )
            ),
          SERVER_LANE_PREFLIGHT_TIMEOUT_MS
        );
      }),
    ]);
    logger.info("Server-lane preflight OK (engenty_server tokens accepted).");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Refusing to start: server-lane preflight failed. Every tenant-scoped query would fail. ${detail}`
      );
    }
    logger.error(
      `Server-lane preflight FAILED — tenant-scoped queries will not work: ${detail}`
    );
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function startApiServer(
  params: StartApiServerParams = {},
  attempt = 0
): Promise<{
  app: ReturnType<typeof createApiApp>;
  devReloadWatcher?: DevPluginReloadWatcher;
  server: ReturnType<typeof createServer>;
  registry: ReturnType<typeof loadPlugins>;
}> {
  initEvlog();
  const dataDir = params.dataDir ?? path.resolve(process.cwd(), "data");
  const resolvePath = (p: string) => path.resolve(dataDir, p);
  const logger = params.logger ?? defaultLogger;
  const effectiveConfig = {
    ...(params.config ?? {}),
  };

  const supabaseUrl = envString(
    effectiveConfig,
    "supabaseUrl",
    "SUPABASE_URL",
    ""
  ).trim();
  const supabaseServiceRoleKey = envString(
    effectiveConfig,
    "supabaseServiceRoleKey",
    "SUPABASE_SERVICE_ROLE_KEY",
    ""
  ).trim();
  // Reachability gates hydration: CI (and misconfigured deploys) often set
  // SUPABASE_URL without a live instance. Hydrating every platform key against
  // a dead host fans out N PostgREST calls with no client timeout and can stall
  // boot past the test budget (90s). Only talk to the DB when the startup check
  // succeeded.
  let supabaseReachable = false;
  if (supabaseUrl && supabaseServiceRoleKey) {
    const reach = await checkSupabaseReachable(
      supabaseUrl,
      supabaseServiceRoleKey
    );
    if (reach.ok) {
      supabaseReachable = true;
    } else {
      logger.warn(
        `Supabase is not reachable at ${supabaseUrl}. ${reach.message ?? "Unknown error"}. If using local dev, start Docker and run: pnpm supabase:start`
      );
    }
  }

  // Hydrate PLATFORM-scoped settings from core.platform_settings into
  // process.env before loading plugins, so modules that read provider/ingest
  // keys synchronously pick up any Setup-UI override. Platform scope only; a
  // change made in the UI takes effect on the next restart.
  if (supabaseReachable) {
    const settingsDb = createSupabaseClientFromConfig(effectiveConfig);
    if (settingsDb) {
      try {
        const [
          { hydratePlatformSettingsIntoEnv },
          { getConfigurableSettings },
        ] = await Promise.all([
          import("@engenty/platform-settings"),
          import("../lib/configurable-settings.js"),
        ]);
        const platformKeys = getConfigurableSettings()
          .filter((s) => s.configurable === "platform")
          .map((s) => s.key);
        const hydrated = await hydratePlatformSettingsIntoEnv({
          supabase: settingsDb,
          keys: platformKeys,
          logger: (msg, err) => logger.warn(`${msg} ${err ?? ""}`),
        });
        if (hydrated.length > 0) {
          logger.info(
            `Hydrated platform settings from DB: ${hydrated.join(", ")}`
          );
        }
      } catch (err) {
        logger.warn(`platform settings hydration failed (non-fatal): ${err}`);
      }
    }
  }

  const tenantPluginOverrides = createTenantPluginOverridesDal(effectiveConfig);
  const loadParams: LoadPluginsParams = {
    modulesDir: params.modulesDir ?? resolveModulesDir(),
    packagesDir: params.packagesDir ?? resolvePackagesDir(),
    dataDir,
    config: effectiveConfig,
    logger,
    tenantPluginOverrides,
  };
  const registry = loadPlugins(loadParams);
  await runServerLanePreflight(registry, logger);

  const devPluginReloadEvents = createDevPluginReloadEventHub();
  const app = createApiApp({
    registry,
    config: effectiveConfig,
    dataDir,
    devPluginReloadEvents,
    resolvePath,
    logger,
    tenantPluginOverrides,
  });
  // Dedicated env var (not bare PORT) so core and ai never collide on a shared
  // PORT. Mirrors `ports.core` in the repo-root ports.config.mjs.
  const port = params.port ?? envNumber({}, "port", "ENGENTY_CORE_PORT", 8787);
  const host = params.host ?? envString({}, "host", "HOST", "127.0.0.1");
  const devGateway = shouldRegisterDevGateway()
    ? createDevGatewayHooks(logger)
    : undefined;
  const prodGateway =
    !devGateway && shouldRegisterProdGateway()
      ? createProdGatewayHooks(readProdGatewayConfig(), logger)
      : undefined;
  const gateway = devGateway ?? prodGateway;

  return new Promise((resolve, reject) => {
    let devReloadWatcher: DevPluginReloadWatcher | undefined;
    serve({
      fetch: app.fetch,
      port,
      hostname: host,
      createServer: ((
        opts: Record<string, unknown>,
        requestListener: (
          req: import("node:http").IncomingMessage,
          res: import("node:http").ServerResponse
        ) => void
      ) => {
        const listener = gateway
          ? (
              req: import("node:http").IncomingMessage,
              res: import("node:http").ServerResponse
            ) => {
              gateway.maybeHandleRequest(req, res, requestListener);
            }
          : requestListener;
        const s = createServer(
          opts as import("node:http").ServerOptions,
          listener
        );
        if (gateway) {
          s.on("upgrade", (req, socket, head) => {
            gateway.maybeHandleUpgrade(req, socket, head);
          });
        }
        let stopQueueWorker: (() => void) | undefined;
        s.once("close", () => {
          devReloadWatcher?.close();
          devReloadWatcher = undefined;
          stopQueueWorker?.();
          stopQueueWorker = undefined;
        });
        s.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && attempt < EADDRINUSE_MAX_RETRIES) {
            logger.warn(
              `Port ${port} in use (tsx watch restart?), retrying in ${EADDRINUSE_RETRY_DELAY_MS}ms (${attempt + 1}/${EADDRINUSE_MAX_RETRIES})...`
            );
            s.close();
            setTimeout(() => {
              startApiServer(params, attempt + 1)
                .then(resolve)
                .catch(reject);
            }, EADDRINUSE_RETRY_DELAY_MS);
          } else {
            reject(err);
          }
        });
        s.once("listening", async () => {
          gateway?.logEnabled();
          logger.info(`API server listening on http://${host}:${port}`);

          // Sync the authored entitlements catalog into core.packages
          // (version-based upsert, non-fatal). Mirrors the AI model-pricing
          // seed at boot so operators see the shipped packages immediately.
          if (supabaseUrl && supabaseServiceRoleKey) {
            try {
              const { createPackagesDal } = await import("../dal/packages.js");
              const { upserted } =
                await createPackagesDal(effectiveConfig).syncCatalog();
              if (upserted > 0) {
                logger.info(
                  `Entitlement packages synced (${upserted} upserted)`
                );
              }
            } catch (err) {
              logger.info(
                `Entitlement package sync skipped (${err instanceof Error ? err.message : "unavailable"})`
              );
            }
          }

          // Start queue worker if plugins registered any queue handlers
          if (registry.queueHandlers.size > 0) {
            try {
              const { createQueueService, startQueueWorker } = await import(
                "@engenty/queue"
              );
              const { createDatabaseAdapter } = await import(
                "../infra/index.js"
              );
              const adapter = createDatabaseAdapter(effectiveConfig);
              if (adapter) {
                const queueService = createQueueService(adapter);
                const queueHandlers = createGatedQueueHandlers({
                  registry,
                  resolveTenantPluginOverrides: (tenantId) =>
                    tenantPluginOverrides.getOverrides(tenantId),
                });
                stopQueueWorker = startQueueWorker({
                  queue: queueService,
                  handlers: queueHandlers,
                  pollIntervalMs: 2000,
                });
                logger.info(
                  `Queue worker started with ${registry.queueHandlers.size} handler(s): ${[...registry.queueHandlers.keys()].join(", ")}`
                );
              }
            } catch (err) {
              logger.info(
                `Queue worker not started (${err instanceof Error ? err.message : "unavailable"})`
              );
            }
          }

          if (shouldStartDevPluginReloadWatcher(effectiveConfig)) {
            const modulesDir = loadParams.modulesDir ?? resolveModulesDir();
            const packagesDir = loadParams.packagesDir ?? resolvePackagesDir();
            if (fs.existsSync(modulesDir) || fs.existsSync(packagesDir)) {
              devReloadWatcher = startDevPluginReloadWatcher({
                registry,
                modulesDir,
                packagesDir,
                onDiagnostic: (diagnostic) => {
                  if (!registry.diagnostics.includes(diagnostic)) {
                    registry.diagnostics.push(diagnostic);
                  }
                },
                onReloadResult: (result) => {
                  devPluginReloadEvents.publishReloadResult(result);
                },
                onPollingFallback: () => {
                  logger.info(
                    "Dev plugin reload watcher using polling fallback (native fs.watch unavailable under current open-file limits)."
                  );
                },
                onWatchError: (error, target) => {
                  const code =
                    "code" in error && typeof error.code === "string"
                      ? error.code
                      : undefined;
                  if (code === "EMFILE") {
                    return;
                  }
                  logger.warn(
                    `Dev plugin reload watcher disabled for ${target.root} (${code ?? error.message}). Restart the API after backend edits or set ENGENTY_DEV_PLUGIN_RELOAD_WATCHER=false.`
                  );
                },
                reloadPlugin: (pluginId) =>
                  reloadBackendPlugin({
                    config: effectiveConfig,
                    dataDir,
                    logger,
                    pluginId,
                    registry,
                    resolvePath,
                    resolveTenantPluginOverrides: (tenantId) =>
                      tenantPluginOverrides.getOverrides(tenantId),
                  }),
              });
            }
          }

          resolve({ app, devReloadWatcher, server: s, registry });
        });
        return s;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
  });
}
