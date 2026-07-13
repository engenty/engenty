export {
  DEFAULT_ENTITLEMENT_PACKAGES,
  findEntitlementPackage,
} from "./catalog.js";
export {
  checkSeatLimit,
  FREE_AI_USAGE_POLICY,
  FREE_APP_LIMITS,
  FREE_ENTITLEMENTS,
  isModuleLicensed,
  resolveEntitlements,
  type SeatCheckResult,
} from "./resolver.js";
export {
  aiUsagePolicySchema,
  appLimitsSchema,
  entitlementOverrideSchema,
  entitlementPackageSchema,
  parseEntitlementOverride,
} from "./schema.js";
export type {
  EntitlementAiUsagePolicy,
  EntitlementAppLimits,
  EntitlementEnforcementMode,
  EntitlementOverride,
  EntitlementPackage,
  ResolvedEntitlements,
} from "./types.js";
