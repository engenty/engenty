import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApproverRoleResolver } from "../../api/routes/auth/device-flow-routes.js";

/** Role of a user inside one tenant, from core.user_tenant_roles. */
export function createSupabaseApproverRoleResolver(
  client: SupabaseClient
): ApproverRoleResolver {
  return async ({ tenantId, userId }) => {
    const { data } = await client
      .schema("core")
      .from("user_tenant_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) {
      // Fallback: primary-tenant users live in core.users (role column).
      const { data: userRow } = await client
        .schema("core")
        .from("users")
        .select("role, tenant_id")
        .eq("id", userId)
        .maybeSingle();
      if (userRow && String(userRow.tenant_id) === tenantId) {
        return {
          isMember: true,
          tenantRole: userRow.role === "admin" ? "admin" : "member",
        };
      }
      return { isMember: false, tenantRole: null };
    }
    return {
      isMember: true,
      tenantRole: data.role === "admin" ? "admin" : "member",
    };
  };
}

/** Deny-all resolver for memory-store mode without Supabase (tests inject fakes). */
export const denyAllApproverRoleResolver: ApproverRoleResolver = () =>
  Promise.resolve({ isMember: false, tenantRole: null });
