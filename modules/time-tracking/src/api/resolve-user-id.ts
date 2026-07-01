import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { createTimeTrackingRepoSupabase } from "../dal/supabase.js";

type Repo = ReturnType<typeof createTimeTrackingRepoSupabase>;

export async function resolveTimeTrackingUserId(
  repo: Repo,
  auth: PluginAuthContext | undefined,
  requestedUserId: string | undefined
): Promise<{ userId: string; isAdmin: boolean } | { error: Response }> {
  const principalId = auth?.principalId ?? "";
  if (!principalId) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  const isAdmin = await repo.isPrincipalTenantAdmin(principalId);
  const userId = requestedUserId ?? principalId;
  if (userId !== principalId && !isAdmin) {
    return {
      error: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  return { userId, isAdmin };
}
