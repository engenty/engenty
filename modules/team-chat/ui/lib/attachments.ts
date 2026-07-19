import { getSupabaseAuthClient } from "@engenty/auth-ui";

/** Tenant id from the session JWT's `tenant_id` claim (no extra round-trip). */
export async function currentTenantId(): Promise<string | null> {
  const { data } = await getSupabaseAuthClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return null;
  }
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "")
    ) as { tenant_id?: string };
    return payload.tenant_id ?? null;
  } catch {
    return null;
  }
}

export function isImageMime(mimeType: string | undefined | null): boolean {
  return (mimeType ?? "").startsWith("image/");
}
