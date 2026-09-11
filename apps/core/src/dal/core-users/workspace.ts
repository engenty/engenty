import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capabilitiesForUser } from "../../security/user-capabilities.js";
import {
  getResolvedAppearance,
  getResolvedAppearanceWithoutTenant,
  type ResolvedAppearance,
} from "../resolved-appearance.js";
import { getDefaultSpace } from "../spaces.js";
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
  /**
   * The principal's capability bundle, in the ids `capabilityCovers` matches.
   *
   * This endpoint is apps/ai's only authorization feed (AUTH-06) — it already
   * hands out {@link isSuperAdmin}/{@link isTenantAdmin} for gating, so it
   * carries the finer truth rather than making apps/ai re-derive policy from
   * two booleans. For users this is the BASE role bundle from
   * `capabilitiesForUser` — DB role assignments are NOT layered on (a consumer
   * needing assignment granularity must go through the grants service). For a
   * service principal it is the token's own clamped claims.
   *
   * Note it cannot distinguish superadmin from tenant admin: `tenant.admin`
   * holds `*`, which covers `core.superadmin` for the matcher. Superadmin-only
   * surfaces must keep gating on {@link isSuperAdmin}.
   */
  capabilities: string[];
  /**
   * The space the caller is working in — the steady container above Project
   * (PLAN-spaces.md). Until the rail can switch spaces this is the tenant's
   * default (Company) space; modules read it to build space-rooted storage
   * prefixes (`tenants/<t>/spaces/<s>/…`).
   */
  currentSpace: { id: string; key: string; name: string } | null;
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
      // No tenant yet — no role, therefore no capabilities. Stated through the
      // canonical mapping rather than a literal `[]` so it stays true if the
      // no-membership bundle ever stops being empty.
      capabilities: capabilitiesForUser({
        isSuperAdmin: false,
        tenantRole: null,
      }),
      currentUser: {
        id: authUser.id,
        email: authUser.email ?? null,
        display_name: resolveAuthDisplayName(authUser),
        initials: null,
        role: null,
      },
      isSuperAdmin: false,
      isTenantAdmin: false,
      currentSpace: null,
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
  const [resolvedAppearance, tenantSupportedLocales, planLabel, defaultSpace] =
    await Promise.all([
      getResolvedAppearance(client, tenantId, authUser.id),
      loadTenantSupportedLocales(client, tenantId),
      resolveTenantPlanLabel(client, tenantId),
      getDefaultSpace(client, tenantId).catch(() => null),
    ]);
  return {
    onboarded: true,
    userId: authUser.id,
    capabilities: capabilitiesForUser({
      isSuperAdmin,
      tenantRole: row?.role ?? null,
    }),
    currentUser: {
      id: authUser.id,
      email: row?.email ?? authUser.email ?? null,
      display_name: row?.display_name ?? resolveAuthDisplayName(authUser),
      initials: row?.initials ?? null,
      role: row?.role ?? null,
    },
    isSuperAdmin,
    isTenantAdmin: isSuperAdmin || row?.role === "admin",
    currentSpace: defaultSpace
      ? { id: defaultSpace.id, key: defaultSpace.key, name: defaultSpace.name }
      : null,
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
  params: { capabilities: string[]; principalId: string; tenantId: string }
): Promise<WorkspaceContext> {
  const [
    tenant,
    resolvedAppearance,
    tenantSupportedLocales,
    planLabel,
    defaultSpace,
  ] = await Promise.all([
    getTenantById(client, params.tenantId),
    getResolvedAppearance(client, params.tenantId, params.principalId),
    loadTenantSupportedLocales(client, params.tenantId),
    resolveTenantPlanLabel(client, params.tenantId),
    getDefaultSpace(client, params.tenantId).catch(() => null),
  ]);
  return {
    // The credential's own claims — a service principal has no membership and
    // therefore no role bundle to derive from. Never widen these into a role.
    capabilities: params.capabilities,
    canSwitchTenant: false,
    currentSpace: defaultSpace
      ? { id: defaultSpace.id, key: defaultSpace.key, name: defaultSpace.name }
      : null,
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
