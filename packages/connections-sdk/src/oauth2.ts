import type { ConnectorDefinition, ConnectorOAuth2Config } from "./types.js";

export interface OAuth2Tokens {
  accessToken: string;
  expiresAt: Date | null;
  grantedScopes: string[];
  refreshToken: string | null;
}

export interface OAuth2Env {
  clientId: string;
  clientSecret: string;
}

export function resolveOAuth2Env(config: ConnectorOAuth2Config): OAuth2Env {
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!(clientId && clientSecret)) {
    throw new Error(
      `OAuth client credentials missing: set ${config.clientIdEnv} and ${config.clientSecretEnv}`
    );
  }
  return { clientId, clientSecret };
}

export function buildAuthorizationUrl(params: {
  connector: ConnectorDefinition;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  if (params.connector.auth.kind !== "oauth2") {
    throw new Error("buildAuthorizationUrl requires an oauth2 connector");
  }
  const { oauth2 } = params.connector.auth;
  const env = resolveOAuth2Env(oauth2);
  const url = new URL(oauth2.authUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    params.scopes.join(oauth2.scopeSeparator ?? " ")
  );
  url.searchParams.set("state", params.state);
  for (const [key, value] of Object.entries(oauth2.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  /** Slack v2 nests user tokens under authed_user. */
  authed_user?: { access_token?: string; scope?: string };
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

function parseTokenResponse(
  data: TokenResponse,
  separator: string
): OAuth2Tokens {
  const nested = data.authed_user?.access_token ? data.authed_user : null;
  const accessToken = nested?.access_token ?? data.access_token;
  if (!accessToken) {
    throw new Error(
      `Token endpoint returned no access token${
        data.error ? `: ${data.error} ${data.error_description ?? ""}` : ""
      }`.trim()
    );
  }
  const scopeRaw = nested?.scope ?? data.scope ?? "";
  return {
    accessToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    grantedScopes: scopeRaw
      .split(separator === "," ? "," : /[\s,]+/u)
      .map((s) => s.trim())
      .filter(Boolean),
    refreshToken: data.refresh_token ?? null,
  };
}

async function postTokenEndpoint(
  config: ConnectorOAuth2Config,
  body: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<OAuth2Tokens> {
  const env = resolveOAuth2Env(config);
  const response = await fetchImpl(config.tokenUrl, {
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      ...body,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const data = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(
      `Token endpoint failed (${response.status}): ${
        data.error ?? "unknown"
      } ${data.error_description ?? ""}`.trim()
    );
  }
  return parseTokenResponse(data, config.scopeSeparator ?? " ");
}

export function exchangeAuthorizationCode(params: {
  code: string;
  config: ConnectorOAuth2Config;
  fetchImpl?: typeof fetch;
  redirectUri: string;
}): Promise<OAuth2Tokens> {
  return postTokenEndpoint(
    params.config,
    {
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    },
    params.fetchImpl ?? fetch
  );
}

export function refreshAccessToken(params: {
  config: ConnectorOAuth2Config;
  fetchImpl?: typeof fetch;
  refreshToken: string;
}): Promise<OAuth2Tokens> {
  return postTokenEndpoint(
    params.config,
    {
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    },
    params.fetchImpl ?? fetch
  );
}
