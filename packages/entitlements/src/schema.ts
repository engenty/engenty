import { z } from "zod";
import type { EntitlementOverride, EntitlementPackage } from "./types.js";

/**
 * Zod schemas for the HTTP write boundary only (parsing override payloads from
 * the manage UI, validating authored packages before sync). The authored
 * catalog itself is plain TS — these schemas guard untrusted input, not the
 * in-repo catalog.
 */

const enforcementMode = z.enum(["observe", "enforce"]);

export const aiUsagePolicySchema = z.object({
  period_mode: z.enum(["calendar", "rolling"]),
  period_unit: z.enum(["day", "week", "month"]),
  included_cost_micros: z.number().int().nonnegative().nullable(),
  hard_limit_cost_micros: z.number().int().nonnegative().nullable(),
  soft_limit_cost_micros: z.number().int().nonnegative().nullable(),
  enforcement_mode: enforcementMode,
  currency: z.string().min(1),
  allowed_models: z.array(z.string()).nullable(),
  allowed_providers: z.array(z.string()).nullable(),
  allowed_efforts: z.array(z.enum(["low", "medium", "high"])).nullable(),
});

export const appLimitsSchema = z.object({
  maxUsers: z.number().int().nonnegative().nullable(),
  enforcement_mode: enforcementMode,
});

export const entitlementPackageSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string().min(1),
  modules: z.array(z.string()).nullable(),
  featureFlags: z.record(z.string(), z.boolean()),
  aiUsagePolicy: aiUsagePolicySchema,
  appLimits: appLimitsSchema,
}) satisfies z.ZodType<EntitlementPackage>;

/**
 * Sparse override payload. Every field optional; `.partial()` on the nested
 * policy/limits objects so a caller can send just the fields they change.
 */
export const entitlementOverrideSchema = z
  .object({
    modules: z.array(z.string()).nullable(),
    featureFlags: z.record(z.string(), z.boolean()),
    aiUsagePolicy: aiUsagePolicySchema.partial(),
    appLimits: appLimitsSchema.partial(),
  })
  .partial() satisfies z.ZodType<EntitlementOverride>;

export function parseEntitlementOverride(input: unknown): EntitlementOverride {
  return entitlementOverrideSchema.parse(input);
}
