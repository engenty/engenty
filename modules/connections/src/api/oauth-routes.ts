import { randomBytes } from "node:crypto";
import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  getConnectorDefinition,
  scopesForGroups,
} from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "connections-oauth" });

const FLOW_TTL_MS = 10 * 60 * 1000;

function apiBaseUrl(): string {
  const base = process.env.ENGENTY_API_BASE_URL?.trim();
  if (!base) {
    throw new Error(
      "Missing ENGENTY_API_BASE_URL (run pnpm portless:env:sync)"
    );
  }
  return base.replace(/\/$/, "");
}

function redirectUri(): string {
  return (
    process.env.CONNECTIONS_REDIRECT_URI ??
    `${apiBaseUrl()}/api/connections/oauth/callback`
  );
}

function uiRedirect(target: string | null): string {
  const uiBase = process.env.ENGENTY_UI_BASE_URL?.trim()?.replace(/\/$/, "");
  const fallback = `${uiBase ?? ""}/settings/connections`;
  if (!target) {
    return fallback;
  }
  // Only allow same-app relative targets to avoid an open redirect.
  return target.startsWith("/") && uiBase ? `${uiBase}${target}` : fallback;
}

export function registerConnectionsOAuthRoutes(
  api: PluginServerApi,
  repo: ConnectionsRepo
): void {
  // GET /api/connections/:connectorId/connect?sharing=personal|org&redirect_to=/settings/connections
  api.registerHttpRoute({
    method: "get",
    path: "/api/connections/:connectorId/connect",
    summary: "Start the OAuth flow for a connector; returns the authUrl",
    async handler(ctx) {
      const hono = ctx.hono as { json: (d: unknown, s?: number) => unknown };
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const connectorId = (ctx.params as { connectorId?: string })?.connectorId;
      const connector = connectorId
        ? getConnectorDefinition(connectorId)
        : undefined;
      if (!connector) {
        return hono.json({ error: `Unknown connector: ${connectorId}` }, 404);
      }
      const query = ctx.query as { redirect_to?: string; sharing?: string };
      const sharing = query?.sharing === "org" ? "org" : "personal";
      // Request the full scope union up front; the per-action policy matrix
      // governs actual use. (Per-group incremental auth = reconnect flow.)
      const scopes = scopesForGroups(
        connector,
        new Set(["read", "write", "destructive"] as const)
      );
      const nonce = randomBytes(32).toString("base64url");
      await repo.createPendingFlow({
        connector_id: connector.id,
        expires_at: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
        nonce,
        redirect_to: query?.redirect_to ?? null,
        requested_scopes: scopes,
        sharing,
        tenant_id: ctx.auth.tenantId,
        user_id: ctx.auth.principalId,
      });
      const authUrl = buildAuthorizationUrl({
        connector,
        redirectUri: redirectUri(),
        scopes,
        state: nonce,
      });
      return hono.json({ authUrl, connectorId: connector.id });
    },
  });

  // GET /api/connections/oauth/callback?code=...&state=...
  api.registerHttpRoute({
    method: "get",
    path: "/api/connections/oauth/callback",
    isPublic: true,
    responseMode: "binary",
    summary: "OAuth callback: exchanges the code and upserts the connection",
    async handler(ctx) {
      const hono = ctx.hono as {
        json: (d: unknown, s?: number) => unknown;
        redirect: (url: string) => unknown;
      };
      const query = ctx.query as {
        code?: string;
        error?: string;
        state?: string;
      };
      if (query?.error) {
        logger.warn("oauth callback returned error", { error: query.error });
        return hono.redirect(uiRedirect(null) + `?error=${query.error}`);
      }
      if (!(query?.code && query?.state)) {
        return hono.json({ error: "Missing code or state" }, 400);
      }
      const flow = await repo.consumePendingFlow(query.state);
      if (!flow) {
        return hono.json({ error: "Invalid or expired OAuth state" }, 400);
      }
      const connector = getConnectorDefinition(flow.connector_id);
      if (!connector) {
        return hono.json(
          { error: `Connector no longer available: ${flow.connector_id}` },
          400
        );
      }
      try {
        const tokens = await exchangeAuthorizationCode({
          code: query.code,
          config: connector.auth.oauth2,
          redirectUri: redirectUri(),
        });
        let externalAccount: string | null = null;
        if (connector.auth.oauth2.resolveAccount) {
          try {
            const account = await connector.auth.oauth2.resolveAccount(
              tokens.accessToken,
              fetch
            );
            externalAccount = account.label;
          } catch (error) {
            logger.warn("resolveAccount failed", {
              connector: connector.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        await repo.upsertConnectionWithTokens({
          accessToken: tokens.accessToken,
          connectorId: connector.id,
          expiresAt: tokens.expiresAt,
          externalAccount,
          grantedScopes:
            tokens.grantedScopes.length > 0
              ? tokens.grantedScopes
              : flow.requested_scopes,
          ownerUserId: flow.user_id,
          refreshToken: tokens.refreshToken,
          sharing: flow.sharing,
          tenantId: flow.tenant_id,
        });
        ctx.recordAuditEvent?.({
          detail: { connector: connector.id, sharing: flow.sharing },
          type: "connection.connected",
        });
        return hono.redirect(uiRedirect(flow.redirect_to) + "?connected=1");
      } catch (error) {
        logger.error("oauth code exchange failed", {
          connector: connector.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return hono.redirect(
          uiRedirect(flow.redirect_to) + "?error=exchange_failed"
        );
      }
    },
  });
}
