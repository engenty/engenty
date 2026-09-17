import { getSupabaseAuthClient } from "./supabase-auth-client";

export interface McpOAuthPendingClient {
  clientId: string | null;
  clientName: string | null;
  logoUri: string | null;
}

/**
 * Branding for a pending OAuth authorization — available without a session.
 * Backed by `public.mcp_oauth_pending_client` (DCR-published client_name / logo).
 */
export async function fetchMcpOAuthPendingClient(
  authorizationId: string
): Promise<McpOAuthPendingClient | null> {
  const id = authorizationId.trim();
  if (!id) {
    return null;
  }
  const { data, error } = await getSupabaseAuthClient().rpc(
    "mcp_oauth_pending_client",
    { p_authorization_id: id }
  );
  if (error) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  const clientName =
    typeof record.client_name === "string" ? record.client_name.trim() : "";
  const logoUri =
    typeof record.logo_uri === "string" ? record.logo_uri.trim() : "";
  const clientId =
    typeof record.client_id === "string" ? record.client_id.trim() : "";
  if (!(clientName || logoUri || clientId)) {
    return null;
  }
  return {
    clientId: clientId || null,
    clientName: clientName || null,
    logoUri: logoUri || null,
  };
}
