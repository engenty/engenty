import { createHash, randomBytes } from "node:crypto";
import type { ConnectorDefinition, ConnectorOAuth2Config } from "./types.js";

export interface OAuth2Tokens {
  accessToken: string;
  expiresAt: Date | null;
  grantedScopes: string[];
  refreshToken: string | null;
}

export interface OAuth2Env {
  clientId: string;
  /** Empty for public clients (DCR `token_endpoint_auth_method: none`). */
  clientSecret: string;
}

export interface OAuth2Pkce {
  codeChallenge: string;
  codeChallengeMethod: "S256";
  codeVerifier: string;
}

/**
 * Resolves a client-credential env key to its effective value. Lets a caller
 * inject a tenant/platform-aware settings lookup (@engenty/platform-settings)
 * without this package depending on it; falls back to process.env when the
 * resolver returns nothing or is absent.
 */
export type ClientEnvResolver = (key: string) => Promise<string | undefined>;

async function readClientEnv(
  key: string | undefined,
  resolveEnv?: ClientEnvResolver
): Promise<string | undefined> {
  if (!key) {
    return;
  }
  const resolved = await resolveEnv?.(key);
  return resolved ?? process.env[key];
}

/** RFC 7636 S256 PKCE pair for public (and confidential) authorization-code clients. */
export function createOAuth2Pkce(): OAuth2Pkce {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return {
    codeChallenge,
    codeChallengeMethod: "S256",
    codeVerifier,
  };
}

export async function resolveOAuth2Env(
  config: ConnectorOAuth2Config,
  resolveEnv?: ClientEnvResolver
): Promise<OAuth2Env> {
  const clientId = await readClientEnv(config.clientIdEnv, resolveEnv);
  const clientSecret = await readClientEnv(config.clientSecretEnv, resolveEnv);
  if (!(clientId && clientSecret)) {
    throw new Error(
      `OAuth client credentials missing: set ${config.clientIdEnv ?? "<clientIdEnv>"} and ${config.clientSecretEnv ?? "<clientSecretEnv>"}`
    );
  }
  return { clientId, clientSecret };
}

/**
 * Resolve the OAuth client for a connector. Precedence: a DB-backed
 * `resolveClientCredentials` (imported connectors) wins; otherwise the injected
 * `resolveEnv` (tenant → platform settings) with a process.env fallback.
 */
export async function resolveOAuth2Credentials(
  config: ConnectorOAuth2Config,
  resolveEnv?: ClientEnvResolver
): Promise<OAuth2Env> {
  if (config.resolveClientCredentials) {
    const creds = await config.resolveClientCredentials();
    if (!creds.clientId?.trim()) {
      throw new Error("OAuth client credentials missing: no client_id");
    }
    return {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret ?? "",
    };
  }
  return resolveOAuth2Env(config, resolveEnv);
}

/**
 * True when the connector's OAuth client can start a connect flow. Env-backed
 * connectors still need both id and secret; imported / DCR clients only need a
 * client id (public clients omit the secret). Never throws.
 */
export async function hasOAuth2ClientCredentials(
  config: ConnectorOAuth2Config,
  resolveEnv?: ClientEnvResolver
): Promise<boolean> {
  if (config.resolveClientCredentials) {
    try {
      const creds = await config.resolveClientCredentials();
      return Boolean(creds.clientId?.trim());
    } catch {
      return false;
    }
  }
  const clientId = await readClientEnv(config.clientIdEnv, resolveEnv);
  const clientSecret = await readClientEnv(config.clientSecretEnv, resolveEnv);
  return Boolean(clientId && clientSecret);
}

export async function buildAuthorizationUrl(params: {
  connector: ConnectorDefinition;
  pkce?: Pick<OAuth2Pkce, "codeChallenge" | "codeChallengeMethod">;
  redirectUri: string;
  scopes: string[];
  state: string;
  resolveEnv?: ClientEnvResolver;
}): Promise<string> {
  if (params.connector.auth.kind !== "oauth2") {
    throw new Error("buildAuthorizationUrl requires an oauth2 connector");
  }
  const { oauth2 } = params.connector.auth;
  const env = await resolveOAuth2Credentials(oauth2, params.resolveEnv);
  const url = new URL(oauth2.authUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    params.scopes.join(oauth2.scopeSeparator ?? " ")
  );
  url.searchParams.set("state", params.state);
  if (params.pkce) {
    url.searchParams.set("code_challenge", params.pkce.codeChallenge);
    url.searchParams.set(
      "code_challenge_method",
      params.pkce.codeChallengeMethod
    );
  }
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
  fetchImpl: typeof fetch,
  resolveEnv?: ClientEnvResolver
): Promise<OAuth2Tokens> {
  const env = await resolveOAuth2Credentials(config, resolveEnv);
  const form: Record<string, string> = {
    client_id: env.clientId,
    ...body,
  };
  // Public clients omit client_secret; sending an empty value breaks some AS.
  if (env.clientSecret) {
    form.client_secret = env.clientSecret;
  }
  const response = await fetchImpl(config.tokenUrl, {
    body: new URLSearchParams(form),
    // Some providers (GitHub) default the token response to form-encoding and
    // only return JSON when the request opts in via `Accept: application/json`;
    // `tokenRequestHeaders` lets a connector add that header (parseTokenResponse
    // always reads JSON). Connector-supplied headers cannot override content-type.
    headers: {
      ...config.tokenRequestHeaders,
      "content-type": "application/x-www-form-urlencoded",
    },
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
  codeVerifier?: string;
  config: ConnectorOAuth2Config;
  fetchImpl?: typeof fetch;
  redirectUri: string;
  resolveEnv?: ClientEnvResolver;
}): Promise<OAuth2Tokens> {
  const body: Record<string, string> = {
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  };
  if (params.codeVerifier) {
    body.code_verifier = params.codeVerifier;
  }
  return postTokenEndpoint(
    params.config,
    body,
    params.fetchImpl ?? fetch,
    params.resolveEnv
  );
}

export function refreshAccessToken(params: {
  config: ConnectorOAuth2Config;
  fetchImpl?: typeof fetch;
  refreshToken: string;
  resolveEnv?: ClientEnvResolver;
}): Promise<OAuth2Tokens> {
  return postTokenEndpoint(
    params.config,
    {
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    },
    params.fetchImpl ?? fetch,
    params.resolveEnv
  );
}
