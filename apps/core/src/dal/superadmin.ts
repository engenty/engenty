import { createClient } from "@supabase/supabase-js";
import { createSupabaseIdentityAdminAdapter } from "../identity/supabase-identity-admin-adapter.js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export type TenantRole = "admin" | "member";

export interface CoreTenant {
  created_at: string;
  id: string;
  name: string;
  slug: string;
  tenant_connection_mode: "shared_instance" | "dedicated_instance";
  updated_at: string;
}

export interface SuperadminUser {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  is_super_admin: boolean;
  role: TenantRole;
  tenant_id: string;
  updated_at: string;
}

export type TenantMember = SuperadminUser & {
  tenant_role: TenantRole;
};

export interface AutomationRuleRow {
  created_at: string;
  effect_id: string;
  effect_input_json: Record<string, unknown> | null;
  effect_type: "action" | "agent";
  enabled: boolean;
  filter_json: Record<string, unknown>;
  hook_id: string;
  id: string;
  tenant_id: string;
  updated_at: string;
}

export interface AutomationRuleCreateInput {
  effect_id: string;
  effect_input_json?: Record<string, unknown> | null;
  effect_type: "action" | "agent";
  enabled?: boolean;
  filter_json?: Record<string, unknown>;
  hook_id: string;
}

export interface AutomationRulePatchInput {
  effect_id?: string;
  effect_input_json?: Record<string, unknown> | null;
  effect_type?: "action" | "agent";
  enabled?: boolean;
  filter_json?: Record<string, unknown>;
  hook_id?: string;
}

export interface UserTenantMembership {
  role: TenantRole;
  tenant_id: string;
  tenant_name: string;
}

export interface SuperadminDal {
  assignUserToTenant: (input: {
    userId: string;
    tenantId: string;
    role: TenantRole;
  }) => Promise<void>;
  createAutomationRule: (
    tenantId: string,
    input: AutomationRuleCreateInput
  ) => Promise<AutomationRuleRow>;
  createTenant: (input: {
    slug: string;
    name: string;
    tenant_connection_mode?: CoreTenant["tenant_connection_mode"];
  }) => Promise<CoreTenant>;
  createUser: (input: {
    email: string;
    password?: string;
    display_name?: string;
    tenant_id: string;
    role?: TenantRole;
    is_super_admin?: boolean;
  }) => Promise<SuperadminUser>;
  deleteAutomationRule: (tenantId: string, ruleId: string) => Promise<void>;
  getAuthUserIdentities: (
    userId: string
  ) => Promise<{ provider: string; identity_data?: Record<string, unknown> }[]>;
  getTenant: (id: string) => Promise<CoreTenant | null>;
  getUser: (id: string) => Promise<SuperadminUser | null>;
  getUserTenantMemberships: (userId: string) => Promise<UserTenantMembership[]>;
  listAutomationRules: (
    tenantId: string,
    opts?: { hookId?: string }
  ) => Promise<AutomationRuleRow[]>;
  listTenantMembers: (tenantId: string) => Promise<TenantMember[]>;
  listTenants: () => Promise<CoreTenant[]>;
  listUsers: () => Promise<SuperadminUser[]>;
  patchAutomationRule: (
    tenantId: string,
    ruleId: string,
    patch: AutomationRulePatchInput
  ) => Promise<AutomationRuleRow>;
  removeUserFromTenant: (input: {
    userId: string;
    tenantId: string;
  }) => Promise<void>;
  switchCurrentUserTenant: (input: {
    userId: string;
    tenantId: string;
  }) => Promise<void>;
  updateTenant: (
    id: string,
    patch: Partial<Pick<CoreTenant, "slug" | "name" | "tenant_connection_mode">>
  ) => Promise<CoreTenant>;
  updateTenantMemberRole: (input: {
    userId: string;
    tenantId: string;
    role: TenantRole;
  }) => Promise<void>;
  updateUser: (
    id: string,
    input: {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: TenantRole;
      is_super_admin?: boolean;
    }
  ) => Promise<SuperadminUser | null>;
  updateUserPassword: (id: string, newPassword: string) => Promise<void>;
}

function toTenantRole(value: unknown): TenantRole {
  return value === "admin" ? "admin" : "member";
}

export function createSuperadminDal(
  config: Record<string, unknown>
): SuperadminDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const identityAdmin = createSupabaseIdentityAdminAdapter(client);

  async function listTenants() {
    const rows = await client
      .schema("core")
      .from("tenants")
      .select("id, slug, name, tenant_connection_mode, created_at, updated_at")
      .order("name", { ascending: true });
    if (rows.error) {
      throw rows.error;
    }
    return (rows.data ?? []) as CoreTenant[];
  }

  async function getTenant(id: string) {
    const row = await client
      .schema("core")
      .from("tenants")
      .select("id, slug, name, tenant_connection_mode, created_at, updated_at")
      .eq("id", id)
      .single();
    if (row.error || !row.data) {
      return null;
    }
    return row.data as CoreTenant;
  }

  async function createTenant(input: {
    slug: string;
    name: string;
    tenant_connection_mode?: CoreTenant["tenant_connection_mode"];
  }) {
    const created = await client
      .schema("core")
      .from("tenants")
      .insert({
        slug: input.slug.trim(),
        name: input.name.trim(),
        tenant_connection_mode:
          input.tenant_connection_mode ?? "shared_instance",
      })
      .select("id, slug, name, tenant_connection_mode, created_at, updated_at")
      .single();
    if (created.error) {
      throw created.error;
    }
    return created.data as CoreTenant;
  }

  async function updateTenant(
    id: string,
    patch: Partial<Pick<CoreTenant, "slug" | "name" | "tenant_connection_mode">>
  ) {
    const updated = await client
      .schema("core")
      .from("tenants")
      .update({
        ...(patch.slug === undefined ? {} : { slug: patch.slug.trim() }),
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.tenant_connection_mode === undefined
          ? {}
          : { tenant_connection_mode: patch.tenant_connection_mode }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, slug, name, tenant_connection_mode, created_at, updated_at")
      .single();
    if (updated.error) {
      throw updated.error;
    }
    return updated.data as CoreTenant;
  }

  async function listUsers() {
    const rows = await client
      .schema("core")
      .from("users")
      .select(
        "id, email, display_name, tenant_id, role, is_super_admin, created_at, updated_at"
      )
      .order("created_at", { ascending: false });
    if (rows.error) {
      throw rows.error;
    }
    return (rows.data ?? []).map((row) => ({
      ...row,
      role: toTenantRole(row.role),
      is_super_admin: row.is_super_admin === true,
    })) as SuperadminUser[];
  }

  async function getUser(id: string) {
    const row = await client
      .schema("core")
      .from("users")
      .select(
        "id, email, display_name, tenant_id, role, is_super_admin, created_at, updated_at"
      )
      .eq("id", id)
      .single();
    if (row.error || !row.data) {
      return null;
    }
    const data = row.data as Record<string, unknown>;
    return {
      ...data,
      role: toTenantRole(data.role),
      is_super_admin: data.is_super_admin === true,
    } as SuperadminUser;
  }

  async function createUser(input: {
    email: string;
    password?: string;
    display_name?: string;
    tenant_id: string;
    role?: TenantRole;
    is_super_admin?: boolean;
  }) {
    const { id } = await identityAdmin.createUser({
      email: input.email,
      password: input.password || crypto.randomUUID(),
      display_name: input.display_name,
      user_metadata: { full_name: input.display_name },
    });

    const insert = await client
      .schema("core")
      .from("users")
      .insert({
        id,
        tenant_id: input.tenant_id,
        email: input.email,
        display_name: input.display_name ?? null,
        role: input.role ?? "member",
        is_super_admin: input.is_super_admin ?? false,
      });
    if (insert.error) {
      throw insert.error;
    }

    await assignUserToTenant({
      userId: id,
      tenantId: input.tenant_id,
      role: input.role ?? "member",
    });

    const user = await getUser(id);
    if (!user) {
      throw new Error("Failed to load created user");
    }
    return user;
  }

  async function updateUser(
    id: string,
    input: {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: TenantRole;
      is_super_admin?: boolean;
    }
  ) {
    if (input.email || input.password || input.display_name !== undefined) {
      await identityAdmin.updateUser(id, {
        email: input.email,
        password: input.password,
        display_name: input.display_name,
      });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.email !== undefined) {
      patch.email = input.email;
    }
    if (input.display_name !== undefined) {
      patch.display_name = input.display_name;
    }
    if (input.role !== undefined) {
      patch.role = input.role;
    }
    if (input.is_super_admin !== undefined) {
      patch.is_super_admin = input.is_super_admin;
    }
    if (input.tenant_id !== undefined) {
      patch.tenant_id = input.tenant_id;
    }

    if (Object.keys(patch).length > 1) {
      const updated = await client
        .schema("core")
        .from("users")
        .update(patch)
        .eq("id", id);
      if (updated.error) {
        throw updated.error;
      }
    }

    if (input.tenant_id && input.role) {
      await assignUserToTenant({
        userId: id,
        tenantId: input.tenant_id,
        role: input.role,
      });
    }

    return getUser(id);
  }

  async function updateUserPassword(id: string, newPassword: string) {
    await identityAdmin.updateUserPassword(id, newPassword);
  }

  async function getAuthUserIdentities(
    userId: string
  ): Promise<{ provider: string; identity_data?: Record<string, unknown> }[]> {
    return identityAdmin.listUserIdentities(userId);
  }

  async function getUserTenantMemberships(userId: string) {
    const memberships = await client
      .schema("core")
      .from("user_tenant_roles")
      .select("tenant_id, role")
      .eq("user_id", userId);
    if (memberships.error || !memberships.data?.length) {
      return [];
    }

    const tenantIds = [
      ...new Set((memberships.data ?? []).map((m) => m.tenant_id as string)),
    ];
    const tenants = await client
      .schema("core")
      .from("tenants")
      .select("id, name")
      .in("id", tenantIds);
    if (tenants.error) {
      return [];
    }

    const byId = new Map(
      (tenants.data ?? []).map((t) => [t.id as string, t.name as string])
    );
    return (memberships.data ?? []).map((m) => ({
      tenant_id: m.tenant_id as string,
      tenant_name: byId.get(m.tenant_id as string) ?? "",
      role: toTenantRole(m.role),
    }));
  }

  async function listTenantMembers(tenantId: string) {
    const memberships = await client
      .schema("core")
      .from("user_tenant_roles")
      .select("user_id, tenant_id, role")
      .eq("tenant_id", tenantId);
    if (memberships.error) {
      throw memberships.error;
    }

    const ids = (memberships.data ?? []).map(
      (entry) => entry.user_id as string
    );
    if (ids.length === 0) {
      return [];
    }

    const users = await client
      .schema("core")
      .from("users")
      .select(
        "id, email, display_name, tenant_id, role, is_super_admin, created_at, updated_at"
      )
      .in("id", ids);
    if (users.error) {
      throw users.error;
    }
    const byId = new Map(
      (users.data ?? []).map((row) => [row.id as string, row])
    );

    return (memberships.data ?? [])
      .map((membership) => {
        const user = byId.get(membership.user_id as string);
        if (!user) {
          return null;
        }
        return {
          ...user,
          role: toTenantRole(user.role),
          is_super_admin: user.is_super_admin === true,
          tenant_role: toTenantRole(membership.role),
        } as TenantMember;
      })
      .filter((entry): entry is TenantMember => entry !== null);
  }

  async function assignUserToTenant(input: {
    userId: string;
    tenantId: string;
    role: TenantRole;
  }) {
    const upsertMembership = await client
      .schema("core")
      .from("user_tenant_roles")
      .upsert(
        {
          user_id: input.userId,
          tenant_id: input.tenantId,
          role: input.role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,tenant_id" }
      );
    if (upsertMembership.error) {
      throw upsertMembership.error;
    }
  }

  async function updateTenantMemberRole(input: {
    userId: string;
    tenantId: string;
    role: TenantRole;
  }) {
    const updated = await client
      .schema("core")
      .from("user_tenant_roles")
      .update({ role: input.role, updated_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId);
    if (updated.error) {
      throw updated.error;
    }
  }

  async function removeUserFromTenant(input: {
    userId: string;
    tenantId: string;
  }) {
    const removed = await client
      .schema("core")
      .from("user_tenant_roles")
      .delete()
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId);
    if (removed.error) {
      throw removed.error;
    }
  }

  async function switchCurrentUserTenant(input: {
    userId: string;
    tenantId: string;
  }) {
    const updated = await client
      .schema("core")
      .from("users")
      .update({
        tenant_id: input.tenantId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.userId);
    if (updated.error) {
      throw updated.error;
    }
  }

  function mapAutomationRule(row: Record<string, unknown>): AutomationRuleRow {
    const filter = row.filter_json;
    const effectInput = row.effect_input_json;
    return {
      id: String(row.id),
      tenant_id: String(row.tenant_id),
      enabled: Boolean(row.enabled),
      hook_id: String(row.hook_id),
      filter_json:
        filter && typeof filter === "object"
          ? (filter as Record<string, unknown>)
          : {},
      effect_type: row.effect_type === "agent" ? "agent" : "action",
      effect_id: String(row.effect_id),
      effect_input_json:
        effectInput && typeof effectInput === "object"
          ? (effectInput as Record<string, unknown>)
          : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  async function listAutomationRules(
    tenantId: string,
    opts?: { hookId?: string }
  ) {
    let q = client
      .schema("core")
      .from("engenty_automation_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (opts?.hookId) {
      q = q.eq("hook_id", opts.hookId);
    }
    const res = await q;
    if (res.error) {
      throw res.error;
    }
    return (res.data ?? []).map((row) =>
      mapAutomationRule(row as Record<string, unknown>)
    );
  }

  async function createAutomationRule(
    tenantId: string,
    input: AutomationRuleCreateInput
  ) {
    const now = new Date().toISOString();
    const inserted = await client
      .schema("core")
      .from("engenty_automation_rules")
      .insert({
        tenant_id: tenantId,
        hook_id: input.hook_id.trim(),
        enabled: input.enabled ?? true,
        filter_json: input.filter_json ?? {},
        effect_type: input.effect_type,
        effect_id: input.effect_id.trim(),
        effect_input_json: input.effect_input_json ?? null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (inserted.error) {
      throw inserted.error;
    }
    return mapAutomationRule(inserted.data as Record<string, unknown>);
  }

  async function patchAutomationRule(
    tenantId: string,
    ruleId: string,
    patch: AutomationRulePatchInput
  ) {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { updated_at: now };
    if (patch.enabled !== undefined) {
      row.enabled = patch.enabled;
    }
    if (patch.hook_id !== undefined) {
      row.hook_id = patch.hook_id.trim();
    }
    if (patch.filter_json !== undefined) {
      row.filter_json = patch.filter_json;
    }
    if (patch.effect_type !== undefined) {
      row.effect_type = patch.effect_type;
    }
    if (patch.effect_id !== undefined) {
      row.effect_id = patch.effect_id.trim();
    }
    if (patch.effect_input_json !== undefined) {
      row.effect_input_json = patch.effect_input_json;
    }
    const updated = await client
      .schema("core")
      .from("engenty_automation_rules")
      .update(row)
      .eq("id", ruleId)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (updated.error) {
      throw updated.error;
    }
    return mapAutomationRule(updated.data as Record<string, unknown>);
  }

  async function deleteAutomationRule(tenantId: string, ruleId: string) {
    const removed = await client
      .schema("core")
      .from("engenty_automation_rules")
      .delete()
      .eq("id", ruleId)
      .eq("tenant_id", tenantId);
    if (removed.error) {
      throw removed.error;
    }
  }

  return {
    listTenants,
    getTenant,
    createTenant,
    updateTenant,
    listUsers,
    getUser,
    createUser,
    updateUser,
    updateUserPassword,
    getAuthUserIdentities,
    getUserTenantMemberships,
    listTenantMembers,
    assignUserToTenant,
    updateTenantMemberRole,
    removeUserFromTenant,
    switchCurrentUserTenant,
    listAutomationRules,
    createAutomationRule,
    patchAutomationRule,
    deleteAutomationRule,
  };
}
