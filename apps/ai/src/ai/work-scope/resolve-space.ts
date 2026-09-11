// The space a run's work belongs to (PLAN-spaces.md).
//
// apps/ai needs it to build storage prefixes: every work tier below Global is
// rooted at `tenants/<t>/spaces/<s>/…`, so a resolver without a space cannot
// name a task's bytes at all.
//
// This is the tenant's default (Company) space, and since Phase 6 it is only
// the FALLBACK: work containers carry their own `space_id` (`not null` on
// tasks and projects), and resolveWorkVisibility prefers the container
// row — most specific first — using this value only when no row proves a space.
// That is why callers take a `spaceId` rather than calling in here themselves.
// What still lands here legitimately: a run with no work container at all.
import { resolveDefaultSpaceId } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { getTenantDbFactoryFromEnv } from "../../infra/tenant-db.js";

const logger = createLogger({ name: "apps/ai/work-scope/space" });

/**
 * The tenant's default space, or `null` when it cannot be resolved.
 *
 * Fail-soft on purpose: a run that cannot name its space should degrade to the
 * tiers it can prove (the caller drops space-rooted prefixes) rather than throw
 * halfway through assembling an agent. A missing space is logged because it
 * means the tenant bootstrap trigger did not fire — a broken install, not a
 * routine condition.
 */
export async function resolveTenantDefaultSpaceId(
  tenantId: string
): Promise<string | null> {
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    // Say it out loud. An unconfigured lane silently returning null turns into
    // "the space tier just isn't there" at every call site, which reads as a
    // resolver bug rather than missing env.
    logger.warn(
      "tenant db lane unconfigured — no space can be resolved; set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET (or ENGENTY_SECURITY_JWT_SECRET)",
      { tenant_id: tenantId }
    );
    return null;
  }
  try {
    return await resolveDefaultSpaceId(
      factory.getTenantDb({ tenantId }) as never,
      tenantId
    );
  } catch (error) {
    logger.warn("default space unresolved — space-rooted prefixes skipped", {
      message: error instanceof Error ? error.message : String(error),
      tenant_id: tenantId,
    });
    return null;
  }
}
