import {
  coerceRowValues,
  mergeRowValues,
  TableColumnValueError,
} from "@engenty/ai-core";
import { capabilityCovers } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { APP_RELEASE_SUBJECT } from "../ai/jobs/app-release-announce.js";
import { scopeAccessToken } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  createDataTableStoreFromEnv,
  type DataTableStore,
} from "../dal/data-tables/index.js";
import { resolveNotifications } from "../notifications/inbox.js";
import {
  type AppCapabilityRegistry,
  appCapabilities,
} from "./app-capabilities.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

/**
 * The capability wall for engenty Apps.
 *
 * Everything an App can reach passes through this one route, in three
 * directions, none of which shares a credential with another:
 *
 *  (a) frontend → app backend   — the browser's own JWT authenticates here;
 *                                 the proxy calls the app host server-to-server
 *                                 and the browser never learns its address.
 *  (b) frontend or agent → engenty — the requested operation is intersected
 *                                 with the App's manifest allow-list, then
 *                                 invoked with the CALLER's own token. An
 *                                 undeclared operation is 403. This is what
 *                                 "the app connects using the user's auth"
 *                                 means concretely: the user's identity, the
 *                                 app's declared subset, enforced server-side,
 *                                 never delegated.
 *  (c) app backend → engenty    — an opaque capability handle (see
 *                                 app-capabilities.ts), never a token.
 *
 * Note what this deliberately does NOT inherit from /ai/mcp-apps/call: that
 * route validates at server-URL granularity, so a widget may call any tool on
 * any server registered to the tenant. Here the unit of authorization is the
 * individual operation id.
 */

const logger = createLogger({ name: "apps/ai/app-proxy" });

/**
 * Marks every engenty-reaching call made on an App's behalf, so core can tell
 * "a user is typing" from "an App is running" — the two are indistinguishable
 * from the token alone, since (b) above deliberately uses the caller's own.
 *
 * It matters for connector actions with an `ask` policy: core's connections
 * gate stands aside for user principals because the AI pre-gate owns that
 * approval card in chat. There is no chat here, so before this marker an App
 * declaring `gmail_send_message` simply sent the mail — while the
 * engenty-bridge skill promised its author a `pending_approval` result
 * (CON-01). Marked, the same call records a durable approval request and
 * answers 202, which this route already maps to that promised result.
 */
const APP_CALL_ORIGIN = "app" as const;

/** Bridge tool names an App may call. Anything else is rejected outright. */
const BRIDGE_TOOLS = new Set([
  "app_action",
  "config_delete",
  "config_get",
  "config_list",
  "config_set",
  "data_delete",
  "data_get",
  "data_list",
  "data_set",
  "engenty_call",
  "table_read",
  "table_write",
]);

/**
 * Config tools an App may call. Reads resolve the caller's own value over the
 * tenant-wide default; writes always land at the caller's own level. An App
 * therefore cannot set a default for everyone — that is an admin action, and
 * it goes through `app_config_set` with an explicit user_id instead.
 */
const CONFIG_TOOLS: Record<string, string> = {
  config_delete: "app_config_delete",
  config_get: "app_config_get",
  config_list: "app_config_list",
  config_set: "app_config_set",
};

const callBodySchema = z.object({
  arguments: z.record(z.string(), z.unknown()).default({}),
  name: z.string().min(1).max(128),
  session_id: z.string().min(1).max(200),
});

const engentyCallArgsSchema = z.object({
  input: z.unknown().optional(),
  operation_id: z.string().min(1).max(128),
});

const appActionArgsSchema = z.object({
  action: z.string().min(1).max(64),
  input: z.unknown().optional(),
});

const dataArgsSchema = z.object({
  key: z.string().min(1).max(200).optional(),
  prefix: z.string().max(200).optional(),
  value: z.unknown().optional(),
});

// Space tables ride the same store the table_read / table_write tools use;
// the shapes match so what an agent writes an App reads without translation.
const tableReadArgsSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  table_id: z.string().uuid(),
});

const rowValuesSchema = z.record(z.string(), z.unknown());

const tableWriteArgsSchema = z.object({
  delete: z.array(z.string().uuid()).max(200).optional(),
  insert: z.array(rowValuesSchema).max(200).optional(),
  table_id: z.string().uuid(),
  update: z
    .array(z.object({ row_id: z.string().uuid(), values: rowValuesSchema }))
    .max(200)
    .optional(),
});

const reviewDecisionBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(1000).optional(),
  version: z.number().int().positive(),
});

interface AppDetail {
  active_version: {
    manifest: {
      actions?: { id: string; requiresApproval?: boolean; risk: string }[];
      engenty?: { operations?: string[]; tables?: string[] };
      storage?: { config?: boolean; data?: boolean };
    };
    version: number;
  } | null;
  id: string;
  status: string;
}

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function coreClient(accessToken: string): EngentyCoreClient {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    throw new Error("ENGENTY_CORE_BASE_URL is not configured");
  }
  return new EngentyCoreClient({ coreBaseUrl, accessToken });
}

/** Everything the proxy needs about the app it is brokering for. */
interface ResolvedApp {
  actions: { id: string; requiresApproval?: boolean; risk: string }[];
  allowedOperations: string[];
  /** Space table ids the manifest declares — the bridge reaches no other. */
  allowedTables: string[];
  storage: { config: boolean; data: boolean };
  version: number;
}

async function loadApp(
  client: EngentyCoreClient,
  appId: string
): Promise<ResolvedApp | null> {
  const detail = await client.invokeTool<{ id: string }, AppDetail>("app_get", {
    id: appId,
  });
  if (!detail?.active_version || detail.status !== "active") {
    return null;
  }
  return {
    actions: detail.active_version.manifest.actions ?? [],
    allowedOperations: detail.active_version.manifest.engenty?.operations ?? [],
    allowedTables: detail.active_version.manifest.engenty?.tables ?? [],
    storage: {
      config: detail.active_version.manifest.storage?.config === true,
      data: detail.active_version.manifest.storage?.data === true,
    },
    version: detail.active_version.version,
  };
}

export interface AppProxyOptions {
  capabilities?: AppCapabilityRegistry;
  scopeResolver: AiScopeResolver;
  /** Space table store; resolved from the environment when not injected. */
  tables?: DataTableStore | null;
}

export function registerAppProxyRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: AppProxyOptions
): void {
  const capabilities = opts.capabilities ?? appCapabilities;
  let tableStore: DataTableStore | null = opts.tables ?? null;
  const tables = (): DataTableStore => {
    tableStore ??= createDataTableStoreFromEnv();
    if (!tableStore) {
      throw new Error(
        "app proxy: table store unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    return tableStore;
  };

  /**
   * Caller identity. Either the viewing user's own JWT (browser) or a
   * capability handle (app backend). A handle carries the token of the user it
   * was minted for, so downstream authz is identical either way — the handle
   * narrows, it never widens.
   */
  async function resolveCaller(c: Context): Promise<
    | {
        allowedOperations: readonly string[] | null;
        fromCapability: boolean;
        ok: true;
        tenantId: string;
        accessToken: string;
        userId: string;
      }
    | { ok: false; response: Response }
  > {
    const presented = c.req.header("x-engenty-capability");
    if (presented) {
      const grant = capabilities.resolve(presented);
      if (!grant) {
        return {
          ok: false,
          response: c.json({ error: "apps.capabilityInvalid" }, 401),
        };
      }
      const appId = c.req.param("appId");
      if (grant.appId !== appId) {
        // A handle minted for one app must be worthless against another.
        return {
          ok: false,
          response: c.json({ error: "apps.capabilityWrongApp" }, 403),
        };
      }
      return {
        allowedOperations: grant.allowedOperations,
        fromCapability: true,
        ok: true,
        tenantId: grant.tenantId,
        accessToken: grant.accessToken,
        userId: grant.userId,
      };
    }

    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return { ok: false, response: scope.response };
    }
    const callerToken = scopeAccessToken(scope.scope);
    if (!callerToken) {
      return {
        ok: false,
        response: c.json({ error: "apps.unauthorized" }, 401),
      };
    }
    return {
      allowedOperations: null,
      fromCapability: false,
      ok: true,
      tenantId: scope.scope.tenantId,
      accessToken: callerToken,
      userId: scope.scope.userId,
    };
  }

  /**
   * The App's frontend document, for the artifact frame to inline. Served
   * through apps/ai rather than fetched from core directly so the browser
   * needs exactly one origin and one auth header for everything App-related.
   */
  app.get(`${AI_BASE_PATH}/apps/:appId/frontend`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const token = scopeAccessToken(scope.scope);
    if (!token) {
      return c.json({ error: "apps.unauthorized" }, 401);
    }
    const appId = c.req.param("appId");
    const requested = c.req.query("version");
    try {
      const client = coreClient(token);
      const path = `/api/apps/${encodeURIComponent(appId)}/frontend${
        requested ? `?version=${encodeURIComponent(requested)}` : ""
      }`;
      const payload = await client.request<{
        app_id: string;
        html: string;
        manifest: unknown;
        version: number;
      }>(path, { method: "GET" });
      return c.json(payload);
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        const status =
          err.status === 401 || err.status === 403 || err.status === 404
            ? err.status
            : 502;
        return c.json({ error: "apps.frontendUnavailable" }, status);
      }
      return handleRouteError(
        c,
        "app frontend fetch failed",
        "apps.frontendUnavailable",
        err
      );
    }
  });

  /**
   * The review surface for a proposed version: what the App asks for, and
   * whether the viewer may decide. "The manifest is the thing a person reads
   * before saying yes" — this is where they read it. Browser-only (a
   * capability handle has no business reviewing releases).
   */
  app.get(`${AI_BASE_PATH}/apps/:appId/review`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const token = scopeAccessToken(scope.scope);
    if (!token) {
      return c.json({ error: "apps.unauthorized" }, 401);
    }
    const appId = c.req.param("appId");
    const requested = c.req.query("version");
    const requestedVersion = requested ? Number(requested) : undefined;
    try {
      const client = coreClient(token);
      const [{ versions }, grants] = await Promise.all([
        client.invokeTool<
          { id: string },
          {
            versions: {
              manifest: {
                actions?: {
                  id: string;
                  requiresApproval?: boolean;
                  risk: string;
                }[];
                egress?: { connect?: string[] };
                engenty?: { operations?: string[]; tables?: string[] };
                storage?: { config?: boolean; data?: boolean };
              };
              sha: string;
              status: string;
              version: number;
            }[];
          }
        >("app_versions_list", { id: appId }),
        client.request<{ capabilities: string[] }>(
          `/api/tenants/${encodeURIComponent(scope.scope.tenantId)}/effective-grants/user/${encodeURIComponent(scope.scope.userId)}`
        ),
      ]);
      // The pinned version when the artifact names one, else the newest
      // proposed — the thing awaiting a decision.
      const subject =
        requestedVersion === undefined
          ? versions.find((v) => v.status === "proposed")
          : versions.find((v) => v.version === requestedVersion);
      // The decision right is checked with the SAME matcher core enforces
      // with (capabilityCovers) — display-only here; core re-checks on POST.
      const canApprove = capabilityCovers(
        grants.capabilities ?? [],
        "apps.approve"
      );
      if (!subject) {
        return c.json({ can_approve: canApprove, review: null });
      }
      // An operation id alone does not say what is being approved:
      // `gmail_send_message` and `contacts_list` look alike in a list. Name
      // the module (or connector) each id belongs to, from its contract.
      const operations = await Promise.all(
        (subject.manifest.engenty?.operations ?? []).map(async (id) => {
          try {
            const contract = await client.describeTool(id);
            return {
              id,
              module: contract.moduleId ?? null,
              summary: contract.summary ?? null,
            };
          } catch {
            return { id, module: null, summary: null };
          }
        })
      );
      // A table id says nothing about what is in it. The person deciding is
      // being asked about "Reisekosten 2026", not about
      // `01a0862f-731f-…` — name every table the manifest declares.
      const declaredTables = subject.manifest.engenty?.tables ?? [];
      const namedTables = await Promise.all(
        declaredTables.map(async (id) => {
          try {
            const table = await tables().getTable({
              tableId: id,
              tenantId: scope.scope.tenantId,
            });
            return { id, title: table?.title ?? null };
          } catch {
            return { id, title: null };
          }
        })
      );
      return c.json({
        can_approve: canApprove,
        review: {
          actions: subject.manifest.actions ?? [],
          egress: subject.manifest.egress?.connect ?? [],
          operations,
          sha: subject.sha,
          status: subject.status,
          storage: subject.manifest.storage ?? {},
          tables: namedTables,
          version: subject.version,
        },
      });
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        const status =
          err.status === 401 || err.status === 403 || err.status === 404
            ? err.status
            : 502;
        return c.json({ error: "apps.reviewUnavailable" }, status);
      }
      return handleRouteError(
        c,
        "app review fetch failed",
        "apps.reviewUnavailable",
        err
      );
    }
  });

  /**
   * The decision itself. Pure forwarding: core enforces `apps.approve` on
   * `app_release_approve` / `app_release_reject`, so this route adds no
   * authority — it exists so the artifact pane keeps its one-origin,
   * one-auth-header contract.
   */
  app.post(`${AI_BASE_PATH}/apps/:appId/review`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const token = scopeAccessToken(scope.scope);
    if (!token) {
      return c.json({ error: "apps.unauthorized" }, 401);
    }
    const appId = c.req.param("appId");
    const parsed = reviewDecisionBodySchema.safeParse(await readJsonBody(c));
    if (!parsed.success) {
      return c.json({ error: "apps.invalidArguments" }, 400);
    }
    try {
      const client = coreClient(token);
      const result = await client.invokeTool(
        parsed.data.decision === "approve"
          ? "app_release_approve"
          : "app_release_reject",
        {
          app_id: appId,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          version: parsed.data.version,
        }
      );
      // Decided: the open row about this version, wherever it was raised, is
      // no longer a question.
      await resolveNotifications({
        outcome: parsed.data.decision === "approve" ? "resumed" : "abandoned",
        subjectId: `${appId}:${parsed.data.version}`,
        subjectType: APP_RELEASE_SUBJECT,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ ok: true, result });
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        // Core's verdict passes through — a 403 here IS the answer for a
        // caller without apps.approve.
        const status =
          err.status === 401 ||
          err.status === 403 ||
          err.status === 404 ||
          err.status === 409 ||
          err.status === 422
            ? err.status
            : 502;
        return c.json(
          { code: err.code, error: "apps.reviewFailed", message: err.message },
          status
        );
      }
      return handleRouteError(
        c,
        "app review decision failed",
        "apps.reviewFailed",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/apps/:appId/call`, async (c) => {
    const caller = await resolveCaller(c);
    if (!caller.ok) {
      return caller.response;
    }
    const parsed = callBodySchema.safeParse(await readJsonBody(c));
    if (!parsed.success) {
      return c.json({ error: "apps.invalidBody" }, 400);
    }
    const { arguments: args, name, session_id: sessionId } = parsed.data;
    if (!BRIDGE_TOOLS.has(name)) {
      return c.json({ error: "apps.unknownBridgeTool", name }, 400);
    }

    const appId = c.req.param("appId");
    const client = coreClient(caller.accessToken);

    let resolved: ResolvedApp | null;
    try {
      resolved = await loadApp(client, appId);
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        return c.json(
          { error: "apps.appUnavailable" },
          err.status === 404 ? 404 : 502
        );
      }
      return handleRouteError(
        c,
        "app lookup failed",
        "apps.appUnavailable",
        err
      );
    }
    if (!resolved) {
      return c.json({ error: "apps.appNotActive" }, 404);
    }

    try {
      switch (name) {
        case "engenty_call": {
          const call = engentyCallArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          const operationId = call.data.operation_id;

          // The manifest allow-list is the whole point. An operation the App
          // never declared does not exist for it, no matter who is calling.
          if (!resolved.allowedOperations.includes(operationId)) {
            logger.warn("app called an undeclared operation", {
              appId,
              operationId,
              tenantId: caller.tenantId,
            });
            return c.json(
              { error: "apps.operationNotDeclared", operation_id: operationId },
              403
            );
          }
          // A capability handle narrows further: it can never reach past the
          // subset it was minted with.
          if (
            caller.allowedOperations &&
            !caller.allowedOperations.includes(operationId)
          ) {
            return c.json(
              {
                error: "apps.operationNotInCapability",
                operation_id: operationId,
              },
              403
            );
          }

          const result = await client.invokeTool(operationId, call.data.input, {
            origin: APP_CALL_ORIGIN,
          });
          return c.json({ ok: true, result });
        }

        case "app_action": {
          const call = appActionArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          const action = resolved.actions.find(
            (candidate) => candidate.id === call.data.action
          );
          if (!action) {
            return c.json(
              { error: "apps.actionNotDeclared", action: call.data.action },
              403
            );
          }

          // Mint a fresh handle for THIS invocation so the backend can call
          // back into engenty as this user, bounded by the manifest and by a
          // few minutes. It is scoped to one app and one session.
          const capability = capabilities.mint({
            allowedOperations: resolved.allowedOperations,
            appId,
            sessionId,
            tenantId: caller.tenantId,
            accessToken: caller.accessToken,
            userId: caller.userId,
          });

          const privileged =
            action.risk === "high" || action.requiresApproval === true;
          try {
            const result = await client.invokeTool(
              // A privileged action rides the approval-gated operation, so a
              // headless run pauses into the durable approval flow instead of
              // slipping past it.
              privileged ? "app_call_privileged" : "app_call",
              {
                action: call.data.action,
                app_id: appId,
                capability,
                input: call.data.input,
                session_id: sessionId,
              },
              { origin: APP_CALL_ORIGIN }
            );
            return c.json({ ok: true, result });
          } finally {
            // One handle per invocation: it stops meaning anything the moment
            // the action returns, rather than lingering for its full TTL.
            capabilities.revoke(capability);
          }
        }

        case "table_read": {
          const call = tableReadArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          // Same rule as operations: a table the manifest never named does
          // not exist for the App, whoever is viewing it.
          if (!resolved.allowedTables.includes(call.data.table_id)) {
            return c.json(
              { error: "apps.tableNotDeclared", table_id: call.data.table_id },
              403
            );
          }
          const table = await tables().getTable({
            tableId: call.data.table_id,
            tenantId: caller.tenantId,
          });
          if (!table) {
            return c.json(
              { error: "apps.tableNotFound", table_id: call.data.table_id },
              404
            );
          }
          const rows = await tables().listRows({
            ...(call.data.limit === undefined
              ? {}
              : { limit: call.data.limit }),
            ...(call.data.offset === undefined
              ? {}
              : { offset: call.data.offset }),
            tableId: table.id,
            tenantId: caller.tenantId,
          });
          return c.json({
            ok: true,
            result: {
              columns: table.columns,
              rows: rows.map((row) => ({ cells: row.cells, id: row.id })),
              table_id: table.id,
              title: table.title,
            },
          });
        }

        case "table_write": {
          const call = tableWriteArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          if (!resolved.allowedTables.includes(call.data.table_id)) {
            return c.json(
              { error: "apps.tableNotDeclared", table_id: call.data.table_id },
              403
            );
          }
          const table = await tables().getTable({
            tableId: call.data.table_id,
            tenantId: caller.tenantId,
          });
          if (!table) {
            return c.json(
              { error: "apps.tableNotFound", table_id: call.data.table_id },
              404
            );
          }
          // Rows only. The column definition is the agent's (table_write
          // tool) or a person's (Data tab); an App fills the table it was
          // given.
          try {
            const inserted = call.data.insert?.length
              ? (
                  await tables().insertRows({
                    rows: call.data.insert.map((values) =>
                      coerceRowValues(table.columns, values)
                    ),
                    tableId: table.id,
                    tenantId: caller.tenantId,
                  })
                ).map((row) => row.id)
              : [];
            const updated: string[] = [];
            for (const patch of call.data.update ?? []) {
              const existing = await tables().getRow({
                rowId: patch.row_id,
                tableId: table.id,
                tenantId: caller.tenantId,
              });
              if (!existing) {
                return c.json(
                  { error: "apps.rowNotFound", row_id: patch.row_id },
                  404
                );
              }
              const saved = await tables().updateRow({
                cells: mergeRowValues(
                  table.columns,
                  existing.cells,
                  patch.values
                ),
                rowId: patch.row_id,
                tableId: table.id,
                tenantId: caller.tenantId,
              });
              updated.push(saved.id);
            }
            const deleted = call.data.delete?.length
              ? await tables().deleteRows({
                  rowIds: call.data.delete,
                  tableId: table.id,
                  tenantId: caller.tenantId,
                })
              : 0;
            return c.json({
              ok: true,
              result: { deleted, inserted, table_id: table.id, updated },
            });
          } catch (error) {
            if (error instanceof TableColumnValueError) {
              return c.json(
                {
                  error: "apps.invalidRowValues",
                  message: `${error.columnId}: ${error.message}`,
                },
                400
              );
            }
            throw error;
          }
        }

        case "config_delete":
        case "config_get":
        case "config_list":
        case "config_set": {
          // A manifest flag that nothing checks is not a declaration, it is
          // decoration. Same rule the operations allow-list follows: what the
          // App did not declare does not exist for it.
          if (!resolved.storage.config) {
            return c.json(
              { error: "apps.storageNotDeclared", store: "config" },
              403
            );
          }
          const call = dataArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          // user_id comes from the authenticated caller, never from the App —
          // the same rule session_id follows below. An App cannot read or
          // write another user's config by asking for it, and because it can
          // only ever name its own level it cannot overwrite the tenant-wide
          // default either.
          const result = await client.invokeTool(CONFIG_TOOLS[name], {
            app_id: appId,
            key: call.data.key,
            prefix: call.data.prefix,
            user_id: caller.userId,
            value: call.data.value,
          });
          return c.json({ ok: true, result });
        }

        default: {
          if (!resolved.storage.data) {
            return c.json(
              { error: "apps.storageNotDeclared", store: "data" },
              403
            );
          }
          const call = dataArgsSchema.safeParse(args);
          if (!call.success) {
            return c.json({ error: "apps.invalidArguments" }, 400);
          }
          const operationId = {
            data_delete: "app_data_delete",
            data_get: "app_data_get",
            data_list: "app_data_list",
            data_set: "app_data_set",
          }[name];
          if (!operationId) {
            return c.json({ error: "apps.unknownBridgeTool", name }, 400);
          }
          // The App's own store. Session-scoped by the proxy, not by the
          // guest: an App cannot read another session's working data by
          // asking for it.
          const result = await client.invokeTool(operationId, {
            app_id: appId,
            key: call.data.key,
            prefix: call.data.prefix,
            session_id: sessionId,
            value: call.data.value,
          });
          return c.json({ ok: true, result });
        }
      }
    } catch (err) {
      if (err instanceof EngentyCoreHttpError) {
        // An approval-gated operation is the product working, not a failure:
        // core answers 202 approval_required (a durable approval request now
        // exists), and the guest-facing contract — documented in the
        // engenty-bridge skill — is a RESULT with status "pending_approval".
        // Returned as 2xx so the frame's call() resolves instead of throwing.
        if (err.code === "approval_required") {
          const details = err.details as {
            approvalRequestId?: string;
            expiresAt?: string;
          } | null;
          return c.json(
            {
              ok: true,
              result: {
                ...(details?.approvalRequestId
                  ? { approval_request_id: details.approvalRequestId }
                  : {}),
                ...(details?.expiresAt
                  ? { expires_at: details.expiresAt }
                  : {}),
                status: "pending_approval",
              },
            },
            202
          );
        }
        // Gateway verdicts pass through unchanged — authz denials and
        // validation errors are the caller's to see, and nothing here may
        // widen what the user can do.
        const status =
          err.status === 401 ||
          err.status === 402 ||
          err.status === 403 ||
          err.status === 404 ||
          err.status === 409 ||
          err.status === 422
            ? err.status
            : 502;
        return c.json(
          { code: err.code, error: "apps.callFailed", message: err.message },
          status
        );
      }
      return handleRouteError(c, "app call failed", "apps.callFailed", err);
    }
  });
}
