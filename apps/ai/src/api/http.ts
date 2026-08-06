import { createLogger } from "@engenty/telemetry";
import { z } from "zod";

import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { AiSessionError } from "../ai/errors.js";
import {
  type AiScopeCredential,
  type AiSessionScope,
  scopeAccessToken,
} from "../ai/sessions.js";

const logger = createLogger({ name: "apps/ai/http" });

export const uuidString = z.string().uuid();

const workspaceContextScopeSchema = z.object({
  // Core's answer for what this principal may do (AUTH-06). Defaulted rather
  // than required so a core that predates the field degrades to "no
  // capabilities" — denying the gates — instead of failing scope resolution
  // outright. Both apps ship in the same release; this is not a fallback path
  // to build on.
  capabilities: z.array(z.string()).default([]),
  currentTenant: z.object({ id: uuidString }).nullable(),
  isSuperAdmin: z.boolean().default(false),
  isTenantAdmin: z.boolean().default(false),
  onboarded: z.boolean(),
  // "service" is a principal without a membership row — see CP3 in
  // PLAN-service-identity.md. It must never widen into isTenantAdmin below.
  tenantRole: z.enum(["admin", "member", "service"]).nullable().default(null),
  userId: uuidString,
});

export type AiScopeResolution =
  | { ok: true; scope: AiSessionScope }
  | { error: string; ok: false; status: 401 | 403 | 503 };

export interface AiScopeResolverInput {
  authorization: string | undefined;
  threadId?: string;
}

export type AiScopeResolver = (
  input: AiScopeResolverInput
) => Promise<AiScopeResolution>;

export async function resolveScope(
  c: {
    json: (object: unknown, status?: number) => Response;
    req: {
      header: (n: string) => string | undefined;
      param?: (n: string) => string | undefined;
    };
  },
  resolver: AiScopeResolver
): Promise<
  { ok: true; scope: AiSessionScope } | { ok: false; response: Response }
> {
  let threadId: string | undefined;
  if (typeof c.req.param === "function") {
    try {
      threadId = c.req.param("threadId");
    } catch {
      // ignore
    }
  }
  const resolved = await resolver({
    authorization: c.req.header("authorization"),
    threadId,
  });
  if (resolved.ok) {
    return resolved;
  }
  return {
    ok: false,
    response: c.json({ error: resolved.error }, resolved.status),
  };
}

export function createCoreAiScopeResolver(
  options: { coreBaseUrl?: string; fetchImpl?: typeof fetch } = {}
): AiScopeResolver {
  return async ({ authorization }) => {
    const accessToken = parseBearerToken(authorization);
    if (!accessToken) {
      return {
        ok: false,
        error: "agent_threads.unauthorized",
        status: 401,
      };
    }

    const coreBaseUrl = options.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (!coreBaseUrl) {
      return {
        ok: false,
        error: "agent_threads.unconfiguredCore",
        status: 503,
      };
    }

    try {
      const context = await new EngentyCoreClient({
        coreBaseUrl,
        fetchImpl: options.fetchImpl,
        accessToken,
      }).getWorkspaceContext();
      const parsed = workspaceContextScopeSchema.safeParse(context);
      if (!parsed.success) {
        logger.warn("core workspace context did not match AI scope contract", {
          issues: parsed.error.issues,
        });
        return {
          ok: false,
          error: "agent_threads.invalidCoreScope",
          status: 503,
        };
      }
      if (!(parsed.data.onboarded && parsed.data.currentTenant)) {
        return {
          ok: false,
          error: "agent_threads.missingTenant",
          status: 403,
        };
      }
      return {
        ok: true,
        scope: {
          // Core just told us what this bearer is. Deriving the kind here —
          // rather than guessing at each consumer — is the whole point of the
          // credential union.
          credential: {
            kind: parsed.data.tenantRole === "service" ? "service" : "user",
            token: accessToken,
          },
          capabilities: parsed.data.capabilities,
          isSuperAdmin: parsed.data.isSuperAdmin,
          isTenantAdmin:
            parsed.data.isTenantAdmin ||
            parsed.data.isSuperAdmin ||
            parsed.data.tenantRole === "admin",
          tenantRole: parsed.data.tenantRole,
          tenantId: parsed.data.currentTenant.id,
          userId: parsed.data.userId,
        },
      };
    } catch (err) {
      if (err instanceof EngentyCoreHttpError && err.status === 401) {
        return {
          ok: false,
          error: "agent_threads.unauthorized",
          status: 401,
        };
      }
      logger.error("failed to resolve AI session scope from core", { err });
      return {
        ok: false,
        error: "agent_threads.scopeResolutionFailed",
        status: 503,
      };
    }
  };
}

export function createStaticAiScopeResolver(
  scope: AiSessionScope
): AiScopeResolver {
  return async ({ authorization }) => {
    const configured = scopeAccessToken(scope);
    const accessToken = configured ?? parseBearerToken(authorization);
    if (!accessToken) {
      return { ok: true, scope };
    }
    // A token arriving on the request is a caller's session; only a token
    // baked into the static scope keeps whatever kind it was given.
    const credential: AiScopeCredential = configured
      ? (scope.credential ?? { kind: "user", token: configured })
      : { kind: "user", token: accessToken };
    return {
      ok: true,
      scope: { ...scope, credential },
    };
  };
}

export function handleRouteError(
  c: { json: (object: unknown, status?: number) => Response },
  logMessage: string,
  fallbackError: string,
  err: unknown
) {
  if (err instanceof AiSessionError) {
    return harnessErrorResponse(c, err);
  }
  logger.error(logMessage, { err });
  return c.json({ error: fallbackError }, 500);
}

function harnessErrorResponse(
  c: { json: (object: unknown, status?: number) => Response },
  err: AiSessionError
) {
  switch (err.code) {
    case "agent_threads.notFound":
      return c.json({ error: err.code }, 404);
    case "agent_threads.unknownAgentType":
      return c.json({ error: err.code, ...err.details }, 400);
    case "agent_threads.unknownTool":
      return c.json({ error: err.code, ...err.details }, 400);
    case "agent_threads.unconfiguredDatabase":
      return c.json({ error: err.code }, 503);
    case "agent_threads.missingUserInput":
    case "agent_threads.invalidSubmittedMessages":
      return c.json({ error: err.code, ...err.details }, 400);
    case "agent_threads.invalidResume":
    case "agent_threads.interruptNotFound":
    case "agent_threads.interruptMismatch":
    case "agent_threads.interruptExpired":
      return c.json({ error: err.code, ...err.details }, 400);
    case "agent_threads.nativeMemoryUnavailable":
      return c.json({ error: err.code, ...err.details }, 409);
    case "agent_threads.usageLimitExceeded":
      return c.json({ error: err.code, ...err.details }, 429);
    case "agent_threads.taskCheckoutConflict":
      return c.json({ error: err.code, ...err.details }, 409);
    default:
      return assertNeverHarnessError(err.code);
  }
}

function assertNeverHarnessError(code: never): never {
  throw new Error(`Unhandled AI session error: ${code}`);
}

function parseBearerToken(value: string | undefined) {
  if (!value) {
    return;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || undefined;
}
