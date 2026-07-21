import type { PlatformSettingsRepo } from "./dal.js";
import type { SettingSource, SettingSpec, SettingValueOut } from "./types.js";

export interface ResolvedSetting {
  source: SettingSource;
  value: string | undefined;
}

export interface SettingsResolver {
  getSpec(key: string): SettingSpec | undefined;
  /** Drop cache for one key (all tenants) or everything. Call after any write. */
  invalidate(key?: string): void;
  /** The configurable specs this resolver knows about. */
  listSpecs(): SettingSpec[];
  /** The resolved value as a string (env-compatible), or undefined when unset. */
  resolveSetting(
    key: string,
    opts?: { tenantId?: string | null }
  ): Promise<string | undefined>;
  /** Value plus which layer supplied it. */
  resolveSettingMeta(
    key: string,
    opts?: { tenantId?: string | null }
  ): Promise<ResolvedSetting>;
}

/** Coerce a typed DB value to the string form consumers expect from env. */
function toStringValue(value: SettingValueOut): string | undefined {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    return value === "" ? undefined : value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

interface CacheEntry {
  expiresAt: number;
  resolved: ResolvedSetting;
}

export function createSettingsResolver(params: {
  repo: PlatformSettingsRepo;
  specs: SettingSpec[];
  env?: Record<string, string | undefined>;
  ttlMs?: number;
  now?: () => number;
}): SettingsResolver {
  const env = params.env ?? process.env;
  const ttlMs = params.ttlMs ?? 60_000;
  const now = params.now ?? Date.now;
  const specMap = new Map(params.specs.map((s) => [s.key, s]));
  const cache = new Map<string, CacheEntry>();

  function cacheKey(key: string, tenantId: string | null): string {
    return `${tenantId ?? "-"}::${key}`;
  }

  function envValue(key: string): string | undefined {
    const raw = env[key];
    if (raw == null || raw.trim() === "") {
      return;
    }
    return raw;
  }

  async function resolveUncached(
    key: string,
    tenantId: string | null
  ): Promise<ResolvedSetting> {
    const spec = specMap.get(key);

    if (spec?.configurable === "tenant" && tenantId) {
      const override = await params.repo.getTenantOverride(tenantId, key);
      const value = override ? toStringValue(override.value) : undefined;
      if (value !== undefined) {
        return { value, source: "tenant" };
      }
    }

    const platform = await params.repo.getPlatform(key);
    const platformValue = platform ? toStringValue(platform.value) : undefined;
    if (platformValue !== undefined) {
      return { value: platformValue, source: "platform" };
    }

    const fromEnv = envValue(key);
    if (fromEnv !== undefined) {
      return { value: fromEnv, source: "env" };
    }

    if (spec?.defaultValue != null && spec.defaultValue !== "") {
      return { value: spec.defaultValue, source: "default" };
    }

    return { value: undefined, source: "unset" };
  }

  async function resolveSettingMeta(
    key: string,
    opts?: { tenantId?: string | null }
  ): Promise<ResolvedSetting> {
    const tenantId = opts?.tenantId ?? null;
    const ck = cacheKey(key, tenantId);
    const cached = cache.get(ck);
    const ts = now();
    if (cached && cached.expiresAt > ts) {
      return cached.resolved;
    }
    const resolved = await resolveUncached(key, tenantId);
    cache.set(ck, { resolved, expiresAt: ts + ttlMs });
    return resolved;
  }

  return {
    resolveSettingMeta,
    async resolveSetting(key, opts) {
      return (await resolveSettingMeta(key, opts)).value;
    },
    invalidate(key) {
      if (key === undefined) {
        cache.clear();
        return;
      }
      // A platform write changes the fallback for every tenant, so drop all
      // cache entries for this key regardless of tenant.
      const suffix = `::${key}`;
      for (const k of cache.keys()) {
        if (k.endsWith(suffix)) {
          cache.delete(k);
        }
      }
    },
    listSpecs: () => [...specMap.values()],
    getSpec: (key) => specMap.get(key),
  };
}
