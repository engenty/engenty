import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getResolvedAppearance,
  getResolvedAppearanceWithoutTenant,
  type ResolvedAppearance,
} from "../resolved-appearance.js";
import {
  getTenantIdForAuthUser,
  resolveAuthUser,
  type SupabaseAuthVerificationConfig,
} from "./auth.js";
import { getTenantById, getUserById } from "./crud.js";
import { listTenantsForUser } from "./memberships.js";

export interface WorkspaceContext {
  canSwitchTenant: boolean;
  currentTenant: { id: string; slug: string; name: string } | null;
  currentUser: {
    display_name: string | null;
    email: string | null;
    id: string;
    initials: string | null;
    role: "admin" | "member" | null;
  };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onboarded: boolean;
  resolvedAppearance: ResolvedAppearance;
  /** BCP-47 language tags for KB translate targets; tenant setting `i18n.supported_locales` (comma-separated). */
  tenantRole: "admin" | "member" | null;
  tenantSupportedLocales: string[];
  tenants: Array<{ id: string; slug: string; name: string }>;
  userId: string;
}

function resolveAuthDisplayName(authUser: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string | null {
  const metadata = authUser.user_metadata ?? {};
  const displayName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.display_name === "string"
        ? metadata.display_name
        : null;
  const trimmed = displayName?.trim();
  return trimmed || null;
}

async function loadTenantSupportedLocales(
  client: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  try {
    const tenantRepo = createTenantSettingsRepoSupabase(
      client as never,
      tenantId,
      "default"
    );
    const row = await tenantRepo.get("i18n.supported_locales");
    if (row && row.type === "string" && typeof row.value === "string") {
      const parts = row.value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (parts.length > 0) {
        return [...new Set(parts)];
      }
    }
  } catch {
    /* tenant_settings unavailable */
  }
  return ["en", "de"];
}

export async function getWorkspaceContext(
  client: SupabaseClient,
  accessToken: string,
  authConfig: SupabaseAuthVerificationConfig
): Promise<WorkspaceContext> {
  const authUser = await resolveAuthUser(client, accessToken, authConfig);
  const tenantId = await getTenantIdForAuthUser(
    client,
    accessToken,
    authConfig
  );
  if (!tenantId) {
    const resolvedAppearance = await getResolvedAppearanceWithoutTenant(
      client,
      authUser.id
    );
    return {
      onboarded: false,
      userId: authUser.id,
      currentUser: {
        id: authUser.id,
        email: authUser.email ?? null,
        display_name: resolveAuthDisplayName(authUser),
        initials: null,
        role: null,
      },
      isSuperAdmin: false,
      isTenantAdmin: false,
      currentTenant: null,
      tenants: [],
      canSwitchTenant: false,
      resolvedAppearance,
      tenantRole: null,
      tenantSupportedLocales: [],
    };
  }
  const tenant = await getTenantById(client, tenantId);
  const row = await getUserById(client, authUser.id, tenantId);
  const isSuperAdmin =
    row?.is_super_admin === true ||
    authUser.app_metadata?.is_super_admin === true;
  const tenants = isSuperAdmin
    ? ((
        await client
          .schema("core")
          .from("tenants")
          .select("id, slug, name")
          .order("name", { ascending: true })
      ).data ?? [])
    : await listTenantsForUser(client, authUser.id);
  const [resolvedAppearance, tenantSupportedLocales] = await Promise.all([
    getResolvedAppearance(client, tenantId, authUser.id),
    loadTenantSupportedLocales(client, tenantId),
  ]);
  return {
    onboarded: true,
    userId: authUser.id,
    currentUser: {
      id: authUser.id,
      email: row?.email ?? authUser.email ?? null,
      display_name: row?.display_name ?? resolveAuthDisplayName(authUser),
      initials: row?.initials ?? null,
      role: row?.role ?? null,
    },
    isSuperAdmin,
    isTenantAdmin: isSuperAdmin || row?.role === "admin",
    currentTenant: tenant,
    tenants,
    canSwitchTenant: tenants.length > 1,
    resolvedAppearance,
    tenantRole: row?.role ?? null,
    tenantSupportedLocales,
  };
}
