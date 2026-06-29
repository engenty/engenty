import type { Session } from "@supabase/supabase-js";
import { getSupabaseAuthClient } from "./supabase-auth-client";

export interface SupabaseAccessTokenClaims {
  scopes: string[];
  tenant_id?: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return atob(padded);
}

export function readSupabaseAccessTokenClaims(
  accessToken: string
): SupabaseAccessTokenClaims {
  const parts = accessToken.split(".");
  if (parts.length < 2) {
    return { scopes: [] };
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] ?? "")) as Record<
      string,
      unknown
    >;
    const tenantId =
      typeof payload.tenant_id === "string" ? payload.tenant_id : undefined;
    const scopes = Array.isArray(payload.scopes)
      ? payload.scopes.filter(
          (scope): scope is string =>
            typeof scope === "string" && scope.length > 0
        )
      : [];
    return {
      tenant_id: tenantId,
      scopes,
    };
  } catch {
    return { scopes: [] };
  }
}

export function claimsMatchWorkspaceTenant(
  claims: SupabaseAccessTokenClaims,
  tenantId: string | null | undefined
): boolean {
  if (!tenantId) {
    return false;
  }
  return claims.tenant_id === tenantId;
}

export async function refreshSupabaseAuthSession(): Promise<Session> {
  const client = getSupabaseAuthClient();
  const { data, error } = await client.auth.refreshSession();
  if (error) {
    throw error;
  }
  const session = data.session;
  if (!session?.access_token) {
    throw new Error("Supabase session refresh did not return an access token.");
  }
  return session;
}
