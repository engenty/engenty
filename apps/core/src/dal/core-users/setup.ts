import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityAdminService } from "../../../identity/identity-admin-service.js";
import { ensureDefaultTenant } from "../tenants.js";
import {
  resolveAuthUser,
  type SupabaseAuthVerificationConfig,
} from "./auth.js";
import { getUserById } from "./crud.js";
import { upsertTenantMembership } from "./memberships.js";
import type { CoreUser, TenantRole } from "./types.js";

export async function getSetupStatus(client: SupabaseClient): Promise<{
  initialSetupRequired: boolean;
  usersCount: number;
}> {
  const count = await client
    .schema("core")
    .from("users")
    .select("id", { head: true, count: "exact" });
  if (count.error) {
    throw count.error;
  }
  const usersCount = count.count ?? 0;
  return { initialSetupRequired: usersCount === 0, usersCount };
}

export async function ensureCurrentAuthUser(
  client: SupabaseClient,
  accessToken: string,
  identityAdmin: IdentityAdminService,
  authConfig: SupabaseAuthVerificationConfig
): Promise<{ user: CoreUser; created: boolean }> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);

  const existing = await client
    .schema("core")
    .from("users")
    .select("tenant_id")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!existing.error && existing.data?.tenant_id) {
    const user = await getUserById(
      client,
      authUser.id,
      existing.data.tenant_id as string
    );
    if (user) {
      return { user, created: false };
    }
  }

  const tenantId = await ensureDefaultTenant(client);
  const count = await client
    .schema("core")
    .from("users")
    .select("id", { head: true, count: "exact" });
  if (count.error) {
    throw count.error;
  }
  const isFirstUser = (count.count ?? 0) === 0;
  const role: TenantRole = isFirstUser ? "admin" : "member";
  const displayName =
    typeof authUser.user_metadata?.full_name === "string"
      ? authUser.user_metadata.full_name
      : (authUser.email?.split("@")[0] ?? null);

  const upsert = await client
    .schema("core")
    .from("users")
    .upsert(
      {
        id: authUser.id,
        tenant_id: tenantId,
        email: authUser.email ?? "",
        display_name: displayName,
        role,
        is_super_admin: isFirstUser,
      },
      { onConflict: "id" }
    );
  if (upsert.error) {
    throw upsert.error;
  }
  await upsertTenantMembership(client, { userId: authUser.id, tenantId, role });
  if (isFirstUser) {
    await identityAdmin.updateUser(authUser.id, {
      app_metadata: {
        ...(authUser.app_metadata as Record<string, unknown>),
        is_super_admin: true,
      },
    });
  }

  const user = await getUserById(client, authUser.id, tenantId);
  if (!user) {
    throw new Error("Failed to ensure current core user.");
  }
  return { user, created: true };
}

export async function initializeAdminForAuthUser(
  client: SupabaseClient,
  accessToken: string,
  identityAdmin: IdentityAdminService,
  authConfig: SupabaseAuthVerificationConfig
): Promise<{ user: CoreUser }> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const tenantId = await ensureDefaultTenant(client);
  const displayName =
    typeof authUser.user_metadata?.full_name === "string"
      ? authUser.user_metadata.full_name
      : (authUser.email?.split("@")[0] ?? null);
  const upsert = await client
    .schema("core")
    .from("users")
    .upsert(
      {
        id: authUser.id,
        tenant_id: tenantId,
        email: authUser.email ?? "",
        display_name: displayName,
        role: "admin",
        is_super_admin: true,
      },
      { onConflict: "id" }
    );
  if (upsert.error) {
    throw upsert.error;
  }
  await upsertTenantMembership(client, {
    userId: authUser.id,
    tenantId,
    role: "admin",
  });
  await identityAdmin.updateUser(authUser.id, {
    app_metadata: {
      ...(authUser.app_metadata as Record<string, unknown>),
      is_super_admin: true,
    },
  });
  const user = await getUserById(client, authUser.id, tenantId);
  if (!user) {
    throw new Error("Failed to initialize admin user.");
  }
  return { user };
}

export async function createInitialAdmin(
  client: SupabaseClient,
  input: { email: string; password: string; display_name: string },
  identityAdmin: IdentityAdminService
): Promise<{ user: CoreUser }> {
  const tenantId = await ensureDefaultTenant(client);
  const { id } = await identityAdmin.createUser({
    email: input.email,
    password: input.password,
    display_name: input.display_name,
    user_metadata: { full_name: input.display_name },
    app_metadata: { is_super_admin: true },
  });
  const insert = await client.schema("core").from("users").insert({
    id,
    tenant_id: tenantId,
    email: input.email,
    display_name: input.display_name,
    role: "admin",
    is_super_admin: true,
  });
  if (insert.error) {
    throw insert.error;
  }
  await upsertTenantMembership(client, {
    userId: id,
    tenantId,
    role: "admin",
  });
  const user = await getUserById(client, id, tenantId);
  if (!user) {
    throw new Error("Failed to create core user.");
  }
  return { user };
}
