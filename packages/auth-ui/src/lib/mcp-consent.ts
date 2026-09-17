import { getApiBaseUrl, getCurrentAccessToken } from "./api-client";
import { fetchMcpOAuthPendingClient } from "./mcp-oauth-pending-client";
import { getSupabaseAuthClient } from "./supabase-auth-client";

export type McpRiskLevel = "low" | "medium" | "high" | "critical";

export interface AuthorizationDetails {
  authorization_id: string;
  client: { id: string; name: string; uri?: string };
  redirect_uri: string;
  scope: string;
  user: { email?: string; id: string };
}

export interface SpaceOption {
  id: string;
  name: string;
}

export interface McpConsentData {
  details: AuthorizationDetails;
  spaces: SpaceOption[];
  token: string;
}

export function redirectHost(value: string | null | undefined): string {
  if (!value) {
    return "unknown host";
  }
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function mcpLoginHref(
  authorizationId: string,
  clientName?: string | null
): string {
  const consentPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const params = new URLSearchParams({
    flow: "mcp",
    redirect: consentPath,
  });
  const name = clientName?.trim();
  if (name) {
    params.set("continue", name);
  }
  return `/auth/login?${params.toString()}`;
}

export async function pendingMcpLoginHref(
  authorizationId: string
): Promise<string> {
  const pending = await fetchMcpOAuthPendingClient(authorizationId);
  return mcpLoginHref(authorizationId, pending?.clientName);
}

export async function loadMcpConsent(
  authorizationId: string
): Promise<McpConsentData | { loginTo: string }> {
  const token = await getCurrentAccessToken();
  if (!token) {
    return { loginTo: await pendingMcpLoginHref(authorizationId) };
  }
  const { data, error } =
    await getSupabaseAuthClient().auth.oauth.getAuthorizationDetails(
      authorizationId
    );
  if (error) {
    throw new Error(error.message || "authorization_load_failed");
  }
  if (!(data && "authorization_id" in data)) {
    if (data && "redirect_url" in data && data.redirect_url) {
      window.location.assign(data.redirect_url);
      return new Promise<never>(() => undefined);
    }
    throw new Error("invalid_authorization_request");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/spaces`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  const body = response.ok
    ? ((await response.json()) as {
        data?: Array<{ id?: string; name?: string }>;
      })
    : {};
  const spaces = (body.data ?? [])
    .filter((row): row is { id: string; name: string } =>
      Boolean(row.id && row.name)
    )
    .map((row) => ({ id: row.id, name: row.name }));

  return {
    details: data as AuthorizationDetails,
    spaces,
    token,
  };
}

export async function approveMcpConsent(input: {
  authorizationId: string;
  clientId: string;
  maxRiskLevel: McpRiskLevel;
  spaceIds: string[];
  token: string;
}): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}/api/mcp/grants`, {
    body: JSON.stringify({
      clientId: input.clientId,
      maxRiskLevel: input.maxRiskLevel,
      spaceIds: input.spaceIds,
    }),
    headers: {
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`mcp_grant_failed:${response.status}`);
  }
  const { data, error } =
    await getSupabaseAuthClient().auth.oauth.approveAuthorization(
      input.authorizationId,
      { skipBrowserRedirect: true }
    );
  if (error || !data?.redirect_url) {
    throw new Error(error?.message || "authorization_approval_failed");
  }
  return data.redirect_url;
}

export async function denyMcpConsent(authorizationId: string): Promise<string> {
  const { data, error } =
    await getSupabaseAuthClient().auth.oauth.denyAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );
  if (error) {
    throw new Error(error.message || "authorization_denial_failed");
  }
  return data?.redirect_url || "/";
}
