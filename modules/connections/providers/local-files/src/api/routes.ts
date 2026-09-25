import type { ConnectionsRepo } from "@engenty/connections-sdk";
import { canEnterSpace } from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LOCAL_FILES_ERROR } from "../protocol.js";
import type { LocalFilesRepo } from "../repo.js";

const CONNECTOR_ID = "local-files";

const registerDirBody = z.object({
  device_label: z.string().max(120).nullish(),
  directory_name: z.string().min(1).max(200),
  installation_id: z.string().uuid(),
  /** The Space the directory's account belongs to. Checked in the handler,
   * so a missing one answers `connections.spaceRequired`. */
  space_id: z.string().uuid().nullish(),
});

const heartbeatBody = z.object({
  device_label: z.string().max(120).nullish(),
  installation_id: z.string().uuid(),
});

const claimBody = z.object({
  installation_id: z.string().uuid(),
});

const respondBody = z.object({
  error: z.string().max(2000).nullish(),
  error_code: z.string().max(120).nullish(),
  installation_id: z.string().uuid(),
  ok: z.boolean(),
  request_id: z.string().uuid(),
  response: z.unknown().nullish(),
});

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

/**
 * Authenticated bridge + management routes for the local-files connector. The
 * browser talks ONLY to these (never PostgREST): it registers granted
 * directories, heartbeats liveness, claims pending file requests, and posts
 * their results back.
 */
export function registerLocalFilesRoutes(
  server: PluginServerApi,
  deps: {
    getConnectionsRepo: (auth: { tenantId: string }) => ConnectionsRepo;
    getDb: (auth: { tenantId: string }) => SupabaseClient;
    getRepo: (auth: { tenantId: string }) => LocalFilesRepo;
  }
): void {
  // Every route below guards ctx.auth before touching a repo, so the handles
  // resolve tenant-locked per request (Phase A seam).
  const repoFor = (auth: { tenantId: string }) => deps.getRepo(auth);
  const connectionsRepoFor = (auth: { tenantId: string }) =>
    deps.getConnectionsRepo(auth);
  const dbFor = (auth: { tenantId: string }) => deps.getDb(auth);

  // Register a browser-granted directory as a connection ("account").
  server.registerHttpRoute({
    method: "post",
    path: "/api/local-files/directories",
    summary: "Register a browser-granted local directory as a connection",
    request: { body: registerDirBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof registerDirBody>;
      const spaceId = body.space_id;
      if (!spaceId) {
        return hono.json({ error: "connections.spaceRequired" }, 400);
      }
      if (
        !(await canEnterSpace(dbFor({ tenantId: ctx.auth.tenantId }), {
          capabilities: ctx.auth.capabilities,
          spaceId,
          tenantId: ctx.auth.tenantId,
          userId: ctx.auth.principalId,
        }))
      ) {
        return hono.json({ error: "space_not_found" }, 404);
      }
      const existing = await repoFor({
        tenantId: ctx.auth.tenantId,
      }).getInstallation(body.installation_id);
      if (existing && existing.user_id !== ctx.auth.principalId) {
        return hono.json(
          { error: "installation belongs to another user" },
          403
        );
      }
      await repoFor({
        tenantId: ctx.auth.tenantId,
      }).upsertInstallationHeartbeat({
        deviceLabel: body.device_label ?? null,
        installationId: body.installation_id,
        tenantId: ctx.auth.tenantId,
        userId: ctx.auth.principalId,
      });
      const idTag = body.installation_id.slice(0, 8);
      const label = body.device_label
        ? `${body.directory_name} — ${body.device_label} · ${idTag}`
        : `${body.directory_name} · ${idTag}`;
      const connection = await connectionsRepoFor({
        tenantId: ctx.auth.tenantId,
      }).upsertConnectionWithTokens({
        accessToken: "",
        authKind: "browser",
        connectedBy: ctx.auth.principalId,
        connectorId: CONNECTOR_ID,
        expiresAt: null,
        externalAccount: label,
        grantedScopes: [],
        refreshToken: null,
        spaceId,
        tenantId: ctx.auth.tenantId,
      });
      await repoFor({ tenantId: ctx.auth.tenantId }).upsertDirectory({
        connection_id: connection.id,
        directory_name: body.directory_name,
        installation_id: body.installation_id,
        tenant_id: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: connection.id,
          connector: CONNECTOR_ID,
          space_id: spaceId,
        },
        type: "connection.connected",
      });
      return hono.json({ connection_id: connection.id });
    },
  });

  // Reactivate a connection after the user re-grants a lost permission.
  server.registerHttpRoute({
    method: "post",
    path: "/api/local-files/directories/:connectionId/reactivate",
    summary: "Mark a local-files connection active after a re-grant",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const connectionId = (ctx.params as { connectionId?: string })
        ?.connectionId;
      if (!connectionId) {
        return hono.json({ error: "missing connectionId" }, 400);
      }
      const connection = await connectionsRepoFor({
        tenantId: ctx.auth.tenantId,
      }).getConnection({
        connectionId,
        tenantId: ctx.auth.tenantId,
      });
      // Re-granting happens in the browser of someone working in the
      // account's Space; anyone else gets the same answer as a missing id.
      if (
        !(
          connection &&
          (await canEnterSpace(dbFor({ tenantId: ctx.auth.tenantId }), {
            capabilities: ctx.auth.capabilities,
            spaceId: connection.space_id,
            tenantId: ctx.auth.tenantId,
            userId: ctx.auth.principalId,
          }))
        )
      ) {
        return hono.json({ error: "not found" }, 404);
      }
      await connectionsRepoFor({
        tenantId: ctx.auth.tenantId,
      }).setConnectionStatus({
        connectionId,
        errorMessage: null,
        status: "active",
        tenantId: ctx.auth.tenantId,
      });
      return hono.json({ ok: true });
    },
  });

  // Liveness heartbeat.
  server.registerHttpRoute({
    method: "post",
    path: "/api/local-files/heartbeat",
    summary: "Heartbeat a browser installation's liveness",
    operation: { riskLevel: "low", audit: "never" },
    request: { body: heartbeatBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof heartbeatBody>;
      const existing = await repoFor({
        tenantId: ctx.auth.tenantId,
      }).getInstallation(body.installation_id);
      if (existing && existing.user_id !== ctx.auth.principalId) {
        return hono.json(
          { error: "installation belongs to another user" },
          403
        );
      }
      await repoFor({
        tenantId: ctx.auth.tenantId,
      }).upsertInstallationHeartbeat({
        deviceLabel: body.device_label ?? null,
        installationId: body.installation_id,
        tenantId: ctx.auth.tenantId,
        userId: ctx.auth.principalId,
      });
      return hono.json({ ok: true });
    },
  });

  // Claim pending file requests for this installation.
  server.registerHttpRoute({
    method: "post",
    path: "/api/local-files/bridge/claim",
    summary: "Claim pending local-file requests for a browser installation",
    operation: { riskLevel: "low", audit: "never" },
    request: { body: claimBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof claimBody>;
      const installation = await repoFor({
        tenantId: ctx.auth.tenantId,
      }).getInstallation(body.installation_id);
      if (!installation || installation.user_id !== ctx.auth.principalId) {
        return hono.json({ requests: [] });
      }
      const rows = await repoFor({
        tenantId: ctx.auth.tenantId,
      }).listClaimableRequests(body.installation_id);
      return hono.json({
        requests: rows.map((r) => ({
          action: r.action,
          connection_id: r.connection_id,
          id: r.id,
          input: r.input,
        })),
      });
    },
  });

  // Post a fulfilled request's result (or error) back to the awaiting server.
  server.registerHttpRoute({
    method: "post",
    path: "/api/local-files/bridge/respond",
    summary: "Return a local-file request result from the browser",
    request: { body: respondBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const body = ctx.body as z.infer<typeof respondBody>;
      const installation = await repoFor({
        tenantId: ctx.auth.tenantId,
      }).getInstallation(body.installation_id);
      if (!installation || installation.user_id !== ctx.auth.principalId) {
        return hono.json({ error: "unknown installation" }, 403);
      }
      const request = await repoFor({ tenantId: ctx.auth.tenantId }).getRequest(
        body.request_id
      );
      if (!request || request.installation_id !== body.installation_id) {
        return hono.json({ error: "unknown request" }, 404);
      }
      await repoFor({ tenantId: ctx.auth.tenantId }).completeRequest({
        errorCode: body.error_code ?? null,
        errorText: body.error ?? null,
        id: body.request_id,
        ok: body.ok,
        response: body.response ?? null,
      });
      // A lost File System Access permission takes the whole connection offline
      // until the user re-grants it.
      if (!body.ok && body.error_code === LOCAL_FILES_ERROR.permissionLost) {
        await connectionsRepoFor({
          tenantId: ctx.auth.tenantId,
        }).setConnectionStatus({
          connectionId: request.connection_id,
          errorMessage:
            "Browser access to this folder was revoked; re-grant it.",
          status: "error",
          tenantId: ctx.auth.tenantId,
        });
      }
      return hono.json({ ok: true });
    },
  });
}
