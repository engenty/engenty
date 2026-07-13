import type { ConnectionsRepo } from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import {
  allowedOriginsSchema,
  BROWSER_BRIDGE_ERROR,
  CLAIM_POLL_MS,
  CLAIM_WAIT_MS,
  LIVENESS_WINDOW_MS,
  normalizeAllowedOrigin,
} from "../protocol.js";
import type { BrowserBridgeRepo, InstallationRow } from "../repo.js";

const CONNECTOR_ID = "browser";

const linkBody = z.object({
  allowed_origins: allowedOriginsSchema.default([]),
  device_label: z.string().min(1).max(120),
});

const heartbeatBody = z.object({
  installation_id: z.string().uuid(),
  window_state: z.unknown().nullish(),
});

const claimBody = z.object({
  installation_id: z.string().uuid(),
  /** Long-poll hold; capped at CLAIM_WAIT_MS. 0 = single immediate check. */
  wait_ms: z.number().int().min(0).max(CLAIM_WAIT_MS).nullish(),
});

const respondBody = z.object({
  error: z.string().max(2000).nullish(),
  error_code: z.string().max(120).nullish(),
  installation_id: z.string().uuid(),
  ok: z.boolean(),
  request_id: z.string().uuid(),
  response: z.unknown().nullish(),
});

const sessionThreadBody = z.object({
  installation_id: z.string().uuid(),
  thread_id: z.string().max(200).nullable(),
});

const disconnectBody = z.object({
  installation_id: z.string().uuid(),
});

const allowlistBody = z.object({
  allowed_origins: allowedOriginsSchema,
  installation_id: z.string().uuid(),
});

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOrigins(origins: string[]): string[] {
  const normalized = origins
    .map(normalizeAllowedOrigin)
    .filter((o): o is string => o !== null);
  return [...new Set(normalized)];
}

/**
 * Authenticated bridge + management routes for the browser-bridge connector.
 * The extension talks ONLY to these (never PostgREST): it is linked by the
 * web app, heartbeats liveness, claims pending browser commands over a held
 * long-poll, and posts their results back.
 */
export function registerBrowserBridgeRoutes(
  server: PluginServerApi,
  deps: {
    connectionsRepo: ConnectionsRepo;
    repo: BrowserBridgeRepo;
    /** Test override for the claim long-poll cadence. */
    claimPollMs?: number;
  }
): void {
  const { connectionsRepo, repo } = deps;
  const claimPollMs = deps.claimPollMs ?? CLAIM_POLL_MS;

  async function requireOwnedInstallation(
    installationId: string,
    principalId: string
  ): Promise<InstallationRow | null> {
    const installation = await repo.getInstallation(installationId);
    if (!installation || installation.user_id !== principalId) {
      return null;
    }
    return installation;
  }

  // Link a new extension installation: mint the installation id, the
  // browser-auth-kind connection, and the active bridge session in one shot.
  // Called by the WEB APP (which holds the Supabase session); the result plus
  // an access token is handed to the extension via the external-message
  // handshake.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/link",
    summary: "Link a browser extension installation as a connection",
    request: { body: linkBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof linkBody>;
      const installationId = crypto.randomUUID();
      const idTag = installationId.slice(0, 8);
      const connection = await connectionsRepo.upsertConnectionWithTokens({
        accessToken: "",
        authKind: "browser",
        connectorId: CONNECTOR_ID,
        expiresAt: null,
        externalAccount: `${body.device_label} · ${idTag}`,
        grantedScopes: [],
        ownerUserId: ctx.auth.principalId,
        refreshToken: null,
        sharing: "personal",
        tenantId: ctx.auth.tenantId,
      });
      await repo.insertInstallation({
        allowedOrigins: normalizeOrigins(body.allowed_origins),
        connectionId: connection.id,
        deviceLabel: body.device_label,
        installationId,
        tenantId: ctx.auth.tenantId,
        userId: ctx.auth.principalId,
      });
      const session = await repo.createSession({
        installationId,
        tenantId: ctx.auth.tenantId,
        userId: ctx.auth.principalId,
      });
      ctx.recordAuditEvent?.({
        detail: { connection_id: connection.id, connector: CONNECTOR_ID },
        type: "connection.connected",
      });
      return hono.json({
        connection_id: connection.id,
        installation_id: installationId,
        session_id: session.id,
      });
    },
  });

  // Liveness heartbeat + managed-window state mirror.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/heartbeat",
    summary: "Heartbeat an extension installation's liveness",
    request: { body: heartbeatBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof heartbeatBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      await repo.touchInstallation(body.installation_id);
      if (body.window_state !== undefined && body.window_state !== null) {
        await repo.setSessionWindowState({
          installationId: body.installation_id,
          windowState: body.window_state,
        });
      }
      return hono.json({ ok: true });
    },
  });

  // Held long-poll claim: return pending commands (flipped to `claimed`) as
  // soon as any exist, else empty after the wait budget. The held request also
  // acts as an implicit heartbeat.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/claim",
    summary: "Claim pending browser commands for an extension installation",
    request: { body: claimBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof claimBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      await repo.touchInstallation(body.installation_id);
      const waitMs = Math.min(body.wait_ms ?? CLAIM_WAIT_MS, CLAIM_WAIT_MS);
      const deadline = Date.now() + waitMs;
      for (;;) {
        const rows = await repo.claimPendingRequests(body.installation_id);
        if (rows.length > 0) {
          return hono.json({
            requests: rows.map((r) => ({
              action: r.action,
              connection_id: r.connection_id,
              id: r.id,
              input: r.input,
            })),
          });
        }
        if (Date.now() >= deadline) {
          return hono.json({ requests: [] });
        }
        await sleep(claimPollMs);
      }
    },
  });

  // Post a fulfilled command's result (or error) back to the awaiting server.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/respond",
    summary: "Return a browser command result from the extension",
    request: { body: respondBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof respondBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      const request = await repo.getRequest(body.request_id);
      if (!request || request.installation_id !== body.installation_id) {
        return hono.json({ error: "unknown request" }, 404);
      }
      await repo.completeRequest({
        errorCode: body.error_code ?? null,
        errorText: body.error ?? null,
        id: body.request_id,
        ok: body.ok,
        response: body.response ?? null,
      });
      // A closed managed window or lost host permission takes the connection
      // into error state until the user reopens/re-grants from the panel.
      const fatal =
        body.error_code === BROWSER_BRIDGE_ERROR.permissionLost ||
        body.error_code === BROWSER_BRIDGE_ERROR.windowClosed;
      if (!body.ok && fatal) {
        await connectionsRepo.setConnectionStatus({
          connectionId: request.connection_id,
          errorMessage:
            body.error_code === BROWSER_BRIDGE_ERROR.windowClosed
              ? "The managed browser window was closed; reopen it from the extension panel."
              : "The extension lost access to the site; re-grant it from the extension panel.",
          status: "error",
          tenantId: ctx.auth.tenantId,
        });
      }
      return hono.json({ ok: true });
    },
  });

  // Bind/unbind the active bridge session to an agent session thread.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/session/thread",
    summary: "Set or clear the agent thread linked to a bridge session",
    request: { body: sessionThreadBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof sessionThreadBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      await repo.setSessionThread({
        installationId: body.installation_id,
        threadId: body.thread_id,
      });
      return hono.json({ ok: true });
    },
  });

  // End the bridge: close the session and revoke the connection.
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/disconnect",
    summary: "Disconnect a browser extension installation",
    request: { body: disconnectBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof disconnectBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      await repo.endSession(body.installation_id);
      if (installation.connection_id) {
        await connectionsRepo.setConnectionStatus({
          connectionId: installation.connection_id,
          errorMessage: null,
          status: "revoked",
          tenantId: ctx.auth.tenantId,
        });
      }
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: installation.connection_id,
          connector: CONNECTOR_ID,
        },
        type: "connection.disconnected",
      });
      return hono.json({ ok: true });
    },
  });

  // Update the origin allowlist (settings page).
  server.registerHttpRoute({
    method: "post",
    path: "/api/browser-bridge/allowlist",
    summary: "Update the navigation origin allowlist for an installation",
    request: { body: allowlistBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof allowlistBody>;
      const installation = await requireOwnedInstallation(
        body.installation_id,
        ctx.auth.principalId
      );
      if (!installation) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      const normalized = normalizeOrigins(body.allowed_origins);
      await repo.setAllowedOrigins({
        allowedOrigins: normalized,
        installationId: body.installation_id,
      });
      return hono.json({ allowed_origins: normalized, ok: true });
    },
  });

  // Status for both the side panel and the engenty UI: the caller's latest
  // installation (or an explicit one via ?installation_id=...) plus its
  // active session and liveness.
  server.registerHttpRoute({
    method: "get",
    path: "/api/browser-bridge/session",
    summary: "Bridge status for the current user",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const query = (ctx.query ?? {}) as { installation_id?: string };
      const installation = query.installation_id
        ? await requireOwnedInstallation(
            query.installation_id,
            ctx.auth.principalId
          )
        : await repo.getLatestInstallationForUser({
            tenantId: ctx.auth.tenantId,
            userId: ctx.auth.principalId,
          });
      if (!installation) {
        return hono.json({ installation: null, online: false, session: null });
      }
      const session = await repo.getActiveSession(installation.installation_id);
      const lastSeen = new Date(installation.last_seen_at).getTime();
      return hono.json({
        installation: {
          allowed_origins: installation.allowed_origins,
          connection_id: installation.connection_id,
          device_label: installation.device_label,
          installation_id: installation.installation_id,
          last_seen_at: installation.last_seen_at,
        },
        online: Date.now() - lastSeen <= LIVENESS_WINDOW_MS,
        session: session
          ? {
              id: session.id,
              status: session.status,
              thread_id: session.thread_id,
              window_state: session.window_state,
            }
          : null,
      });
    },
  });
}
