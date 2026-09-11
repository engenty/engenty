// The timezone the workspace works in, for the things that read a clock.
//
// A container boots on UTC. An agent that reads its own clock — `date` in the
// shell, `new Date()` in Code Mode — therefore answers in UTC, and anything
// derived from it ("good evening", "due today", "this morning's mail") is off
// by the offset. The tenant setting is the only place that knows better, so it
// rides into the sandbox as `TZ`.
//
// Read fresh on every sandbox create, not cached: the only caller is starting a
// container, which costs seconds, so a settings round trip is free next to it —
// and a cache here would need an invalidation hook in apps/core, where the
// setting is actually written. Changing the zone takes effect on the next
// machine either way.
import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { getTenantDbFactoryFromEnv } from "../infra/tenant-db.js";

const logger = createLogger({ name: "apps/ai/tenant-timezone" });

/** What a container does with no `TZ` — stated, so the fallback is not a guess. */
export const DEFAULT_SANDBOX_TIMEZONE = "UTC";

/**
 * The tenant's IANA zone, or null to inherit UTC.
 *
 * Never throws: a settings read that fails must not stop a sandbox from
 * starting. It logs and falls back, because a container on UTC is a working
 * container with a wrong clock, and no container is no work at all.
 */
export async function resolveTenantTimezone(
  tenantId: string
): Promise<string | null> {
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return null;
  }
  try {
    const repo = createTenantSettingsRepoSupabase(
      factory.getTenantDb({ tenantId }),
      tenantId,
      "default"
    );
    const row = await repo.get(TENANT_AI_CONFIG_KEY);
    return parseTenantAiSettings(row?.value).timezone ?? null;
  } catch (err) {
    logger.warn("tenant timezone lookup failed; sandbox stays on UTC", {
      err,
      tenantId,
    });
    return null;
  }
}

/** The `TZ` env a sandbox should run with, or `{}` when it inherits UTC. */
export async function sandboxTimezoneEnv(
  tenantId: string
): Promise<Record<string, string>> {
  const zone = await resolveTenantTimezone(tenantId);
  return zone ? { TZ: zone } : {};
}
