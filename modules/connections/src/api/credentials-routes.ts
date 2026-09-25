import {
  type ConnectionsRepo,
  getConnectorDefinition,
} from "@engenty/connections-sdk";
import { actorUserIdFromAuth, type PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import { mayEnterSpace, type ResolveSpaceAccess } from "../lib/space-access.js";
import type { ConnectionsOAuthRouteOptions } from "./oauth-routes.js";

const connectBody = z.object({
  credentials: z.record(z.string(), z.string()),
  /** The Space the account will belong to. Checked in the handler, so a
   * missing one answers `connections.spaceRequired` rather than a schema
   * error. */
  space_id: z.string().uuid().optional(),
});

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

/**
 * Connect flow for `api_key` connectors: the browser submits the credential
 * form, the connector's `verify()` validates against the provider and resolves
 * the account label, and the credentials are stored AES-256-GCM encrypted in
 * the connection's token column (never refreshed, never sent back).
 */
export function registerConnectionsCredentialsRoutes(
  server: PluginServerApi,
  /** Tenant-locked repo factory (Phase A) — the handler carries `ctx.auth`. */
  getRepo: (auth: { tenantId: string }) => ConnectionsRepo,
  /** Whether the caller may connect an account into a Space. */
  resolveSpaceAccess: ResolveSpaceAccess,
  options: ConnectionsOAuthRouteOptions = {}
): void {
  server.registerHttpRoute({
    method: "post",
    path: "/api/connections/:connectorId/connect_credentials",
    summary: "Connect an api_key connector from a submitted credential form",
    request: { body: connectBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const connectedBy = actorUserIdFromAuth(ctx.auth);
      if (!connectedBy) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const connectorId = (ctx.params as { connectorId?: string })?.connectorId;
      const connector = connectorId
        ? getConnectorDefinition(connectorId, ctx.auth.tenantId)
        : undefined;
      if (!connector) {
        return hono.json({ error: `Unknown connector: ${connectorId}` }, 404);
      }
      if (connector.auth.kind !== "api_key") {
        return hono.json(
          { error: `Connector ${connector.id} does not use credentials` },
          400
        );
      }
      const body = ctx.body as z.infer<typeof connectBody>;
      const spaceId = body.space_id;
      if (!spaceId) {
        return hono.json({ error: "connections.spaceRequired" }, 400);
      }
      if (
        !(await mayEnterSpace(
          resolveSpaceAccess,
          { ...ctx.auth, principalId: connectedBy },
          spaceId
        ))
      ) {
        return hono.json({ error: "space_not_found" }, 404);
      }
      const missing = connector.auth.apiKey.fields
        .filter((field) => field.required !== false)
        .filter((field) => !body.credentials[field.key]?.trim())
        .map((field) => field.key);
      if (missing.length > 0) {
        return hono.json(
          { error: `Missing credentials: ${missing.join(", ")}` },
          400
        );
      }
      const known = new Set(connector.auth.apiKey.fields.map((f) => f.key));
      const credentials = Object.fromEntries(
        Object.entries(body.credentials).filter(([key]) => known.has(key))
      );

      let account: { externalId?: string; label: string };
      try {
        account = await connector.auth.apiKey.verify(credentials, fetch);
      } catch (error) {
        return hono.json(
          {
            error: `Credential verification failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          400
        );
      }

      const connection = await getRepo(ctx.auth).upsertConnectionWithTokens({
        accessToken: JSON.stringify(credentials),
        authKind: "api_key",
        connectedBy,
        connectorId: connector.id,
        expiresAt: null,
        externalAccount: account.label,
        grantedScopes: [],
        refreshToken: null,
        spaceId,
        tenantId: ctx.auth.tenantId,
      });
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: connection.id,
          connector: connector.id,
          space_id: spaceId,
        },
        type: "connection.connected",
      });
      try {
        await options.onConnected?.({
          connectorId: connector.id,
          spaceId,
          tenantId: ctx.auth.tenantId,
        });
      } catch {
        // Connection stored; the event hook must not fail the response.
      }
      return hono.json({ connection_id: connection.id });
    },
  });
}
