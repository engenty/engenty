/**
 * Optional load of `@engenty/entitlements` so apps/core typechecks and builds
 * on the public snapshot, which excludes that closed package.
 *
 * Specifier is a variable so TypeScript does not resolve the module.
 */
import type {
  BillingUsage,
  EntitlementOverride,
  EntitlementPackage,
  EntitlementPackagePatch,
  ResolvedEntitlements,
} from "./entitlements-contract.js";

const SPEC: string = "@engenty/entitlements";

export interface SeatCheckResult {
  allowed: boolean;
  atLimit: boolean;
  current: number;
  limit: number | null;
}

export interface InvoiceComputation {
  currency: string;
  lines: Array<{
    amountMicros: number;
    description: string;
    kind: string;
    quantity: number;
    unitPriceMicros: number;
  }>;
  totalMicros: number;
}

export interface EntitlementsApi {
  checkSeatLimit: (
    currentUserCount: number,
    appLimits: {
      enforcement_mode: "observe" | "enforce";
      maxUsers: number | null;
    }
  ) => SeatCheckResult;
  computeInvoiceLines: (
    pkg: Pick<EntitlementPackage, "pricing">,
    usage: BillingUsage
  ) => InvoiceComputation;
  DEFAULT_ENTITLEMENT_PACKAGES: EntitlementPackage[];
  normalizeEntitlementPackage: (pkg: unknown) => EntitlementPackage;
  parseEntitlementOverride: (input: unknown) => EntitlementOverride;
  parseEntitlementPackagePatch: (input: unknown) => EntitlementPackagePatch;
  resolveEntitlements: (
    pkg: EntitlementPackage | null,
    override?: EntitlementOverride | null
  ) => ResolvedEntitlements;
}

async function importEntitlements(): Promise<EntitlementsApi | null> {
  try {
    return (await import(SPEC)) as EntitlementsApi;
  } catch {
    return null;
  }
}

export const entitlements: EntitlementsApi | null = await importEntitlements();

export function requireEntitlements(): EntitlementsApi {
  if (!entitlements) {
    throw new Error(
      "@engenty/entitlements is not installed — commercial package routes are unavailable"
    );
  }
  return entitlements;
}
