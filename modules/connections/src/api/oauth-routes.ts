import { randomBytes } from "node:crypto";
import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  buildAuthorizationUrl,
  createOAuth2Pkce,
  exchangeAuthorizationCode,
  getConnectorDefinition,
  hasOAuth2ClientCredentials,
  mountConnectionInSpace,
  scopesForGroups,
} from "@engenty/connections-sdk";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectionsSettingsResolver } from "../lib/settings-resolver.js";

const logger = createLogger({ name: "connections-oauth" });

const FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * Pack PKCE verifier into the pending-flow `redirect_to` column so we do not
 * need a schema change. The column is server-only (never sent to the AS).
 */
const PKCE_REDIRECT_PREFIX = "engenty-pkce1:";

function packFlowRedirect(
  redirectTo: string | null,
  codeVerifier: string
): string {
  return `${PKCE_REDIRECT_PREFIX}${codeVerifier}\n${redirectTo ?? ""}`;
}

function unpackFlowRedirect(packed: string | null): {
  codeVerifier: string | null;
  redirectTo: string | null;
} {
  if (!packed?.startsWith(PKCE_REDIRECT_PREFIX)) {
    return { codeVerifier: null, redirectTo: packed };
  }
  const rest = packed.slice(PKCE_REDIRECT_PREFIX.length);
  const nl = rest.indexOf("\n");
  if (nl < 0) {
    return { codeVerifier: rest || null, redirectTo: null };
  }
  const codeVerifier = rest.slice(0, nl) || null;
  const redirectTo = rest.slice(nl + 1) || null;
  return { codeVerifier, redirectTo };
}

export interface ConnectionsConnectedEvent {
  connectorId: string;
  sharing: "personal" | "org";
  tenantId: string;
}

export interface ConnectionsOAuthRouteOptions {
  /** Fired after a connection is created/refreshed via the OAuth callback. */
  onConnected?: (event: ConnectionsConnectedEvent) => Promise<void> | void;
}

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
  repos: {
    /**
     * Tenant-locked Supabase handle, for the one write that is not a
     * connections table: auto-mounting the new account into the space the
     * connect started from (CN.4 Flow A). The repo cannot do it — mounts live
     * in `core`.
     */
    getDb: (tenantId: string) => SupabaseClient;
    /** Tenant-locked repo factory — every tenant-shaped read/write. */
    getRepo: (auth: { tenantId: string }) => ConnectionsRepo;
    /** Service-client repo for the callback's tenant-RESOLUTION read only: an
     * inbound OAuth callback is anonymous until the state nonce identifies the
     * pending flow row — and with it the tenant. Same shape as a login lookup. */
    serviceRepo: ConnectionsRepo;
  },
  settings: ConnectionsSettingsResolver,
  options: ConnectionsOAuthRouteOptions = {}
): void {
  const { getDb, getRepo, serviceRepo } = repos;
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
        ? getConnectorDefinition(connectorId, ctx.auth.tenantId)
        : undefined;
      if (!connector) {
        return hono.json({ error: `Unknown connector: ${connectorId}` }, 404);
      }
      if (connector.auth.kind !== "oauth2") {
        return hono.json(
          { error: `Connector ${connector.id} does not use OAuth` },
          400
        );
      }
      const query = ctx.query as {
        redirect_to?: string;
        sharing?: string;
        space_id?: string;
      };
      // `sharing` is unused for access; new flows stamp personal.
      const sharing = "personal" as const;
      // CN.4 Flow A — the space the user pressed "Add account" in, so the
      // callback can mount what it just connected. Carried on the flow row
      // rather than the redirect URL: the redirect is attacker-visible and the
      // flow row is not, and a mount is a grant.
      const spaceId = query?.space_id?.trim() || null;
      // Request the full scope union up front; the per-action policy matrix
      // governs actual use. (Per-group incremental auth = reconnect flow.)
      const scopes = scopesForGroups(
        connector,
        new Set(["read", "write", "destructive"] as const)
      );
      try {
        const resolveEnv = settings.clientEnv(ctx.auth.tenantId);
        if (
          !(await hasOAuth2ClientCredentials(connector.auth.oauth2, resolveEnv))
        ) {
          if (!connector.auth.oauth2.registerClient) {
            return hono.json(
              {
                error: `OAuth client credentials missing for ${connector.id}`,
              },
              400
            );
          }
          await connector.auth.oauth2.registerClient();
        }
        const nonce = randomBytes(32).toString("base64url");
        const pkce = createOAuth2Pkce();
        await getRepo(ctx.auth).createPendingFlow({
          connector_id: connector.id,
          expires_at: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
          nonce,
          redirect_to: packFlowRedirect(query?.redirect_to ?? null, pkce.codeVerifier),
          requested_scopes: scopes,
          sharing,
          space_id: spaceId,
          tenant_id: ctx.auth.tenantId,
          user_id: ctx.auth.principalId,
        });
        const authUrl = await buildAuthorizationUrl({
          connector,
          pkce,
          redirectUri: redirectUri(),
          scopes,
          state: nonce,
          resolveEnv,
        });
        return hono.json({ authUrl, connectorId: connector.id });
      } catch (error) {
        logger.error("oauth connect start failed", {
          connector: connector.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return hono.json(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          502
        );
      }
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
        // Consume the flow (when the provider echoed our state) so the user
        // returns to where the flow started — e.g. the in-chat popup
        // completion page — instead of the settings fallback. Service-lane
        // read: the caller is anonymous, the state row itself is the tenancy.
        const flow = query.state
          ? await serviceRepo.consumePendingFlow(query.state)
          : null;
        const connectorParam = flow
          ? `&connector=${encodeURIComponent(flow.connector_id)}`
          : "";
        const { redirectTo: errorRedirectTo } = unpackFlowRedirect(
          flow?.redirect_to ?? null
        );
        return hono.redirect(
          `${uiRedirect(errorRedirectTo)}?error=${encodeURIComponent(
            query.error
          )}${connectorParam}`
        );
      }
      if (!(query?.code && query?.state)) {
        return hono.json({ error: "Missing code or state" }, 400);
      }
      // Pre-tenant serviceRepo read (Phase A doctrine): the callback carries no
      // auth — the single-use state nonce resolves the pending flow row, and the
      // flow row names the tenant. Everything after runs on that tenant's handle.
      const flow = await serviceRepo.consumePendingFlow(query.state);
      if (!flow) {
        return hono.json({ error: "Invalid or expired OAuth state" }, 400);
      }
      const { codeVerifier, redirectTo: flowRedirectTo } = unpackFlowRedirect(
        flow.redirect_to
      );
      const connector = getConnectorDefinition(
        flow.connector_id,
        flow.tenant_id
      );
      if (!connector) {
        return hono.json(
          { error: `Connector no longer available: ${flow.connector_id}` },
          400
        );
      }
      if (connector.auth.kind !== "oauth2") {
        return hono.json(
          { error: `Connector ${connector.id} does not use OAuth` },
          400
        );
      }
      try {
        const tokens = await exchangeAuthorizationCode({
          code: query.code,
          codeVerifier: codeVerifier ?? undefined,
          config: connector.auth.oauth2,
          redirectUri: redirectUri(),
          resolveEnv: settings.clientEnv(flow.tenant_id),
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
        const connection = await getRepo({
          tenantId: flow.tenant_id,
        }).upsertConnectionWithTokens({
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
        // CN.4 Flow A — land back in the space with the account already
        // usable. Best-effort: the connection exists either way, and failing
        // the callback here would report a connect failure that did not happen.
        if (flow.space_id) {
          try {
            await mountConnectionInSpace(getDb(flow.tenant_id), {
              connectionId: connection.id,
              spaceId: flow.space_id,
              tenantId: flow.tenant_id,
            });
          } catch (error) {
            logger.warn("space auto-mount failed after connect", {
              connection: connection.id,
              connector: connector.id,
              error: error instanceof Error ? error.message : String(error),
              space: flow.space_id,
            });
          }
        }
        try {
          await options.onConnected?.({
            connectorId: connector.id,
            sharing: flow.sharing,
            tenantId: flow.tenant_id,
          });
        } catch (error) {
          logger.error("onConnected hook failed", {
            connector: connector.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return hono.redirect(
          `${uiRedirect(flowRedirectTo)}?connected=1&connector=${encodeURIComponent(connector.id)}`
        );
      } catch (error) {
        logger.error("oauth code exchange failed", {
          connector: connector.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return hono.redirect(
          `${uiRedirect(flowRedirectTo)}?error=exchange_failed&connector=${encodeURIComponent(connector.id)}`
        );
      }
    },
  });
}
