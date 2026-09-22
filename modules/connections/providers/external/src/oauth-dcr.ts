import { createGuardedFetch } from "./net/guarded-fetch.js";

/**
 * RFC 7591 dynamic client registration for imported OAuth MCP servers.
 * The MCP SDK's own OAuth provider is unused — the registered client is
 * stored on the import row and the token still lands in the connections store.
 *
 * Prefer a public client (`token_endpoint_auth_method: "none"`, no secret) so
 * Figma-style MCP authorization servers accept registration; fall back to a
 * confidential `client_secret_post` client for servers that require it.
 */

const REQUEST_TIMEOUT_MS = 20_000;

const AUTH_METHODS = ["none", "client_secret_post"] as const;

export function connectionsRedirectUri(): string {
  const override = process.env.CONNECTIONS_REDIRECT_URI?.trim();
  if (override) {
    return override;
  }
  const base = process.env.ENGENTY_API_BASE_URL?.trim()?.replace(/\/$/u, "");
  if (!base) {
    throw new Error(
      "Missing ENGENTY_API_BASE_URL (run pnpm portless:env:sync)"
    );
  }
  return `${base}/api/connections/oauth/callback`;
}

function registrationErrorMessage(
  status: number,
  data: {
    error?: string;
    error_description?: string;
  },
  rawBody: string
): string {
  const fromJson =
    data.error_description?.trim() ||
    data.error?.trim() ||
    (typeof data === "object" && data && "message" in data
      ? String((data as { message?: unknown }).message ?? "").trim()
      : "");
  const fromBody = rawBody.trim().slice(0, 300);
  const detail = fromJson || fromBody || "no error body";
  return `dynamic client registration failed (${status}): ${detail}`;
}

async function postRegistration(params: {
  authMethod: (typeof AUTH_METHODS)[number];
  clientName: string;
  fetchImpl: typeof fetch;
  redirectUri: string;
  registrationEndpoint: string;
  scopes: string[];
}): Promise<Response> {
  return params.fetchImpl(params.registrationEndpoint, {
    body: JSON.stringify({
      client_name: params.clientName,
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [params.redirectUri],
      response_types: ["code"],
      scope: params.scopes.join(" "),
      token_endpoint_auth_method: params.authMethod,
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function registerDynamicClient(params: {
  clientName: string;
  fetchImpl?: typeof fetch;
  redirectUri: string;
  registrationEndpoint: string;
  scopes: string[];
}): Promise<{ clientId: string; clientSecret: string }> {
  const fetchImpl = params.fetchImpl ?? createGuardedFetch();
  const errors: string[] = [];

  for (const authMethod of AUTH_METHODS) {
    const response = await postRegistration({
      authMethod,
      clientName: params.clientName,
      fetchImpl,
      redirectUri: params.redirectUri,
      registrationEndpoint: params.registrationEndpoint,
      scopes: params.scopes,
    });
    const rawBody = await response.text();
    const data = (() => {
      try {
        return JSON.parse(rawBody) as {
          client_id?: string;
          client_secret?: string;
          error?: string;
          error_description?: string;
          message?: string;
        };
      } catch {
        return {};
      }
    })();

    if (!response.ok) {
      errors.push(registrationErrorMessage(response.status, data, rawBody));
      continue;
    }
    if (!data.client_id?.trim()) {
      errors.push(
        `dynamic client registration returned no client_id (${authMethod})`
      );
      continue;
    }
    // Public clients (`none`) omit client_secret; confidential ones return it.
    return {
      clientId: data.client_id,
      clientSecret: data.client_secret ?? "",
    };
  }

  throw new Error(errors.at(-1) ?? "dynamic client registration failed");
}
