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

/** Fallback when the tenant has no commercial package (single-tenant local install). */
export const LOCAL_PLAN_LABEL = "local";

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
  /**
   * Commercial package label for the current tenant (e.g. "Team"), or
   * {@link LOCAL_PLAN_LABEL} when none is assigned.
   */
  planLabel: string;
  resolvedAppearance: ResolvedAppearance;
  /**
   * `"service"` is NOT a tenant membership role — no row in
   * `core.user_tenant_roles` ever holds it. It is the marker for a principal
   * that has no membership at all and whose authority comes entirely from the
   * capabilities in its token. Callers that branch on this must treat it as
   * "member, minus the human" — never as an admin.
   */
  tenantRole: "admin" | "member" | "service" | null;
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

/**
 * Resolve the sidebar plan label from the tenant's assigned commercial package.
 * Unassigned → {@link LOCAL_PLAN_LABEL} (typical single-tenant local install).
 */
export async function resolveTenantPlanLabel(
  client: SupabaseClient,
  tenantId: string
): Promise<string> {
  const tenantRow = await client
    .schema("core")
    .from("tenants")
    .select("package_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantRow.error) {
    return LOCAL_PLAN_LABEL;
  }
  const packageId =
    (tenantRow.data as { package_id: string | null } | null)?.package_id ??
    null;
  if (!packageId) {
    return LOCAL_PLAN_LABEL;
  }
  const pkgRow = await client
    .schema("core")
    .from("packages")
    .select("label")
    .eq("id", packageId)
    .maybeSingle();
  if (pkgRow.error || !pkgRow.data) {
    return packageId;
  }
  const label = String(
    (pkgRow.data as { label: string | null }).label ?? ""
  ).trim();
  return label || packageId;
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
      planLabel: LOCAL_PLAN_LABEL,
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
  const [resolvedAppearance, tenantSupportedLocales, planLabel] =
    await Promise.all([
      getResolvedAppearance(client, tenantId, authUser.id),
      loadTenantSupportedLocales(client, tenantId),
      resolveTenantPlanLabel(client, tenantId),
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
    planLabel,
    resolvedAppearance,
    tenantRole: row?.role ?? null,
    tenantSupportedLocales,
  };
}

/**
 * Workspace context for a service principal (PLAN-service-identity.md, CP3).
 *
 * A service credential has no row in `auth.users` and no membership, so the
 * user path above cannot answer for it — `resolveAuthUser` would reject the
 * token before anything else ran. What a headless run actually needs from this
 * endpoint is narrow: a tenant to act in, and `onboarded: true` so the AI
 * scope resolver doesn't bounce it. Everything human-shaped is deliberately
 * empty rather than faked.
 *
 * `canSwitchTenant` is false and `tenants` holds only the credential's own
 * tenant: a service credential is minted per tenant, and letting one enumerate
 * or hop tenants would re-create exactly the ambient authority this plan
 * removes.
 */
export async function getServiceWorkspaceContext(
  client: SupabaseClient,
  params: { principalId: string; tenantId: string }
): Promise<WorkspaceContext> {
  const [tenant, resolvedAppearance, tenantSupportedLocales, planLabel] =
    await Promise.all([
      getTenantById(client, params.tenantId),
      getResolvedAppearance(client, params.tenantId, params.principalId),
      loadTenantSupportedLocales(client, params.tenantId),
      resolveTenantPlanLabel(client, params.tenantId),
    ]);
  return {
    canSwitchTenant: false,
    currentTenant: tenant,
    currentUser: {
      display_name: null,
      email: null,
      id: params.principalId,
      initials: null,
      role: null,
    },
    isSuperAdmin: false,
    isTenantAdmin: false,
    onboarded: true,
    planLabel,
    resolvedAppearance,
    tenantRole: "service",
    tenantSupportedLocales,
    tenants: tenant ? [tenant] : [],
    userId: params.principalId,
  };
}
