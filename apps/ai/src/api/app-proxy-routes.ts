import { createLogger } from "@engenty/telemetry";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { AI_BASE_PATH } from "../config/constants.js";
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

interface AppDetail {
  active_version: {
    manifest: {
      actions?: { id: string; requiresApproval?: boolean; risk: string }[];
      engenty?: { operations?: string[] };
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

function coreClient(userAccessToken: string): EngentyCoreClient {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    throw new Error("ENGENTY_CORE_BASE_URL is not configured");
  }
  return new EngentyCoreClient({ coreBaseUrl, userAccessToken });
}

/** Everything the proxy needs about the app it is brokering for. */
interface ResolvedApp {
  actions: { id: string; requiresApproval?: boolean; risk: string }[];
  allowedOperations: string[];
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
}

export function registerAppProxyRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: AppProxyOptions
): void {
  const capabilities = opts.capabilities ?? appCapabilities;

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
        userAccessToken: string;
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
        userAccessToken: grant.userAccessToken,
        userId: grant.userId,
      };
    }

    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return { ok: false, response: scope.response };
    }
    if (!scope.scope.userAccessToken) {
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
      userAccessToken: scope.scope.userAccessToken,
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
    const token = scope.scope.userAccessToken;
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
    const client = coreClient(caller.userAccessToken);

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

          const result = await client.invokeTool(operationId, call.data.input);
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
            userAccessToken: caller.userAccessToken,
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
              }
            );
            return c.json({ ok: true, result });
          } finally {
            // One handle per invocation: it stops meaning anything the moment
            // the action returns, rather than lingering for its full TTL.
            capabilities.revoke(capability);
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
        // Gateway verdicts pass through unchanged — approval requirements,
        // authz denials and validation errors are the caller's to see, and
        // nothing here may widen what the user can do.
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
