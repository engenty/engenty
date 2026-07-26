import {
  DEFAULT_ENTITLEMENT_PACKAGES,
  type EntitlementOverride,
  type EntitlementPackage,
  type ResolvedEntitlements,
  resolveEntitlements,
} from "@engenty/entitlements";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-config.js";

/**
 * Data access for commercial-package entitlements. `core.packages` is a synced
 * mirror of the authored catalog; tenants reference one package plus an optional
 * sparse override. The resolver composes them into resolved entitlements that
 * the enforcement points consume.
 */
export interface PackagesDal {
  /**
   * Write the tenant's resolved AI usage policy into `ai.tenant_usage_policy`
   * (the existing usage engine reads only that persisted row). Call after a
   * package/override change so enforcement follows the entitlement.
   */
  applyAiUsagePolicy: (tenantId: string) => Promise<void>;
  clearTenantOverride: (tenantId: string) => Promise<void>;
  /** Manage-console payload: assignment + override + resolved in one call. */
  getManageData: (tenantId: string) => Promise<{
    packageId: string | null;
    override: EntitlementOverride | null;
    resolved: ResolvedEntitlements;
  }>;
  getPackage: (id: string) => Promise<EntitlementPackage | null>;
  /** Resolve package + override for a tenant. */
  getResolvedEntitlements: (tenantId: string) => Promise<ResolvedEntitlements>;
  getTenantOverride: (tenantId: string) => Promise<EntitlementOverride | null>;
  getTenantPackageId: (tenantId: string) => Promise<string | null>;
  /** The synced catalog (from `core.packages`). */
  listPackages: () => Promise<EntitlementPackage[]>;
  /**
   * Re-materialize `ai.tenant_usage_policy` for every tenant holding `packageId`.
   *
   * The boot catalog sync only touches `core.packages`. A tenant's policy row is
   * written once, when its package or override changes — so editing a package's
   * limits or allow-list afterwards never reached the tenants on it, and they
   * stayed on a stale row indefinitely. This is the explicit roll-out.
   */
  reapplyPackagePolicies: (packageId: string) => Promise<{
    failures: { message: string; tenantId: string }[];
    reapplied: number;
  }>;
  /** Force-reset every authored entry to its catalog value. */
  restoreDefaults: (
    catalog?: readonly EntitlementPackage[]
  ) => Promise<{ restored: number }>;
  setTenantOverride: (
    tenantId: string,
    override: EntitlementOverride
  ) => Promise<void>;
  setTenantPackage: (
    tenantId: string,
    packageId: string | null
  ) => Promise<void>;
  /** Upsert authored entries whose version is newer than (or missing from) the DB. */
  syncCatalog: (
    catalog?: readonly EntitlementPackage[]
  ) => Promise<{ upserted: number }>;
}

interface PackageRow {
  ai_usage_policy: EntitlementPackage["aiUsagePolicy"];
  app_limits: EntitlementPackage["appLimits"];
  feature_flags: Record<string, boolean>;
  id: string;
  label: string;
  modules: string[] | null;
  pricing: EntitlementPackage["pricing"] | null;
  version: number;
}

function rowToPackage(row: PackageRow): EntitlementPackage {
  return {
    id: row.id,
    version: row.version,
    label: row.label,
    modules: row.modules ?? null,
    featureFlags: row.feature_flags ?? {},
    aiUsagePolicy: row.ai_usage_policy,
    appLimits: row.app_limits,
    ...(row.pricing ? { pricing: row.pricing } : {}),
  };
}

function packageToRow(pkg: EntitlementPackage): PackageRow & {
  updated_at: string;
} {
  return {
    id: pkg.id,
    version: pkg.version,
    label: pkg.label,
    modules: pkg.modules,
    feature_flags: pkg.featureFlags,
    ai_usage_policy: pkg.aiUsagePolicy,
    app_limits: pkg.appLimits,
    pricing: pkg.pricing ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Map resolved entitlements to an `ai.tenant_usage_policy` upsert row. The
 * package id supersedes the record's free-text `tier`. Pure so the mapping is
 * testable without a database.
 */
export function toTenantUsagePolicyRow(
  tenantId: string,
  resolved: ResolvedEntitlements
): Record<string, unknown> {
  const p = resolved.aiUsagePolicy;
  return {
    tenant_id: tenantId,
    tier: resolved.packageId ?? "free",
    period_mode: p.period_mode,
    period_unit: p.period_unit,
    included_cost_micros: p.included_cost_micros,
    hard_limit_cost_micros: p.hard_limit_cost_micros,
    soft_limit_cost_micros: p.soft_limit_cost_micros,
    allowed_models: p.allowed_models,
    allowed_providers: p.allowed_providers,
    allowed_efforts: p.allowed_efforts,
    enforcement_mode: p.enforcement_mode,
    currency: p.currency,
    // A policy materialized from an assigned plan is centrally governed: the AI
    // plane's tenant-facing PATCH route rejects edits (409), so the plan is the
    // single source of truth. A tenant with no package (free/un-packaged) stays
    // self-service, so removing a plan reverts control to the tenant admin.
    managed_by: resolved.packageId ? "entitlement" : "tenant",
    updated_at: new Date().toISOString(),
  };
}

/**
 * The authored entries that need seeding: those absent from `core.packages`.
 *
 * The authored catalog is a SEED, not the source of truth. `core.packages` is
 * edited in the manage console, so a version bump must never overwrite what an
 * operator configured there — the old behavior (upsert whenever the authored
 * version was newer) silently reverted live plan settings on the next boot, and
 * gave no hint it had happened. Use `restoreDefaults` for the deliberate
 * "put it back the way the repo says" action.
 *
 * Pure so the sync policy is testable without a database.
 */
export function selectSeedablePackages(
  existing: ReadonlyMap<string, number>,
  catalog: readonly EntitlementPackage[]
): EntitlementPackage[] {
  return catalog.filter((pkg) => !existing.has(pkg.id));
}

export function createPackagesDal(
  config: Record<string, unknown>
): PackagesDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const packages = () => client.schema("core").from("packages");
  const tenants = () => client.schema("core").from("tenants");
  const overrides = () =>
    client.schema("core").from("tenant_entitlement_overrides");
  const usagePolicy = () => client.schema("ai").from("tenant_usage_policy");

  async function listPackages(): Promise<EntitlementPackage[]> {
    const { data, error } = await packages().select("*").order("id");
    if (error) {
      throw new Error(`Failed to load packages: ${error.message}`);
    }
    return ((data ?? []) as PackageRow[]).map(rowToPackage);
  }

  async function getPackage(id: string): Promise<EntitlementPackage | null> {
    const { data, error } = await packages()
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load package ${id}: ${error.message}`);
    }
    return data ? rowToPackage(data as PackageRow) : null;
  }

  async function syncCatalog(
    catalog: readonly EntitlementPackage[] = DEFAULT_ENTITLEMENT_PACKAGES
  ): Promise<{ upserted: number }> {
    const { data, error } = await packages().select("id, version");
    if (error) {
      throw new Error(`Failed to read package versions: ${error.message}`);
    }
    const existing = new Map(
      ((data ?? []) as Array<{ id: string; version: number }>).map((r) => [
        r.id,
        r.version,
      ])
    );
    const seedable = selectSeedablePackages(existing, catalog);
    if (seedable.length === 0) {
      return { upserted: 0 };
    }
    const { error: upsertError } = await packages().upsert(
      seedable.map(packageToRow),
      { onConflict: "id" }
    );
    if (upsertError) {
      throw new Error(`Failed to sync packages: ${upsertError.message}`);
    }
    return { upserted: seedable.length };
  }

  async function restoreDefaults(
    catalog: readonly EntitlementPackage[] = DEFAULT_ENTITLEMENT_PACKAGES
  ): Promise<{ restored: number }> {
    const { error } = await packages().upsert(catalog.map(packageToRow), {
      onConflict: "id",
    });
    if (error) {
      throw new Error(`Failed to restore package defaults: ${error.message}`);
    }
    return { restored: catalog.length };
  }

  async function getTenantPackageId(tenantId: string): Promise<string | null> {
    const { data, error } = await tenants()
      .select("package_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to read tenant package: ${error.message}`);
    }
    return (data as { package_id: string | null } | null)?.package_id ?? null;
  }

  async function reapplyPackagePolicies(packageId: string): Promise<{
    failures: { message: string; tenantId: string }[];
    reapplied: number;
  }> {
    const { data, error } = await tenants()
      .select("id")
      .eq("package_id", packageId);
    if (error) {
      throw new Error(
        `Failed to list tenants for package ${packageId}: ${error.message}`
      );
    }
    const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
    const failures: { message: string; tenantId: string }[] = [];
    let reapplied = 0;
    // Sequential on purpose: this is an admin-triggered roll-out over a handful
    // of tenants, and one bad row must not abort the rest.
    for (const tenantId of ids) {
      try {
        await applyAiUsagePolicy(tenantId);
        reapplied += 1;
      } catch (err) {
        failures.push({
          message: err instanceof Error ? err.message : String(err),
          tenantId,
        });
      }
    }
    return { failures, reapplied };
  }

  async function setTenantPackage(
    tenantId: string,
    packageId: string | null
  ): Promise<void> {
    const { error } = await tenants()
      .update({ package_id: packageId })
      .eq("id", tenantId);
    if (error) {
      throw new Error(`Failed to set tenant package: ${error.message}`);
    }
  }

  async function getTenantOverride(
    tenantId: string
  ): Promise<EntitlementOverride | null> {
    const { data, error } = await overrides()
      .select("override")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to read tenant override: ${error.message}`);
    }
    return (data as { override: EntitlementOverride } | null)?.override ?? null;
  }

  async function setTenantOverride(
    tenantId: string,
    override: EntitlementOverride
  ): Promise<void> {
    const { error } = await overrides().upsert(
      {
        tenant_id: tenantId,
        override,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );
    if (error) {
      throw new Error(`Failed to set tenant override: ${error.message}`);
    }
  }

  async function clearTenantOverride(tenantId: string): Promise<void> {
    const { error } = await overrides().delete().eq("tenant_id", tenantId);
    if (error) {
      throw new Error(`Failed to clear tenant override: ${error.message}`);
    }
  }

  async function getResolvedEntitlements(
    tenantId: string
  ): Promise<ResolvedEntitlements> {
    const packageId = await getTenantPackageId(tenantId);
    const pkg = packageId ? await getPackage(packageId) : null;
    const override = await getTenantOverride(tenantId);
    return resolveEntitlements(pkg, override);
  }

  async function applyAiUsagePolicy(tenantId: string): Promise<void> {
    const resolved = await getResolvedEntitlements(tenantId);
    const { error } = await usagePolicy().upsert(
      toTenantUsagePolicyRow(tenantId, resolved),
      { onConflict: "tenant_id" }
    );
    if (error) {
      throw new Error(`Failed to apply AI usage policy: ${error.message}`);
    }
  }

  async function getManageData(tenantId: string): Promise<{
    packageId: string | null;
    override: EntitlementOverride | null;
    resolved: ResolvedEntitlements;
  }> {
    const packageId = await getTenantPackageId(tenantId);
    const pkg = packageId ? await getPackage(packageId) : null;
    const override = await getTenantOverride(tenantId);
    return {
      packageId,
      override,
      resolved: resolveEntitlements(pkg, override),
    };
  }

  return {
    listPackages,
    getPackage,
    syncCatalog,
    restoreDefaults,
    getTenantPackageId,
    setTenantPackage,
    getTenantOverride,
    setTenantOverride,
    clearTenantOverride,
    getResolvedEntitlements,
    applyAiUsagePolicy,
    reapplyPackagePolicies,
    getManageData,
  };
}
