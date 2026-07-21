// Convenience for consumers that read a small, fixed set of configurable keys
// (e.g. AI provider keys, bot tokens, ingest keys). Builds a resolver from a
// supabase client + a terse spec list, and exposes a per-key/per-tenant lookup
// with the standard tenant → platform → env → default precedence.

import {
  createPlatformSettingsRepoSupabase,
  type SettingsLogger,
} from "./dal.js";
import { createSettingsResolver, type SettingsResolver } from "./resolver.js";
import type { SettingConfigurable, SettingSpec } from "./types.js";

/** Terse spec: `[key, scope, secret?]`. Defaults to non-secret string. */
export type ConsumerSettingSpec =
  | {
      key: string;
      configurable: SettingConfigurable;
      secret?: boolean;
      defaultValue?: string;
    }
  | [key: string, configurable: SettingConfigurable, secret?: boolean];

function normalize(spec: ConsumerSettingSpec): SettingSpec {
  if (Array.isArray(spec)) {
    const [key, configurable, secret] = spec;
    return {
      key,
      configurable,
      secret: secret ?? false,
      type: secret ? "secret" : "string",
    };
  }
  return {
    key: spec.key,
    configurable: spec.configurable,
    secret: spec.secret ?? false,
    type: spec.secret ? "secret" : "string",
    defaultValue: spec.defaultValue,
  };
}

export interface ConsumerSettings {
  /** Effective value for one key at an optional tenant scope (undefined = unset). */
  get(key: string, tenantId?: string | null): Promise<string | undefined>;
  resolver: SettingsResolver;
}

export function createConsumerSettings(params: {
  supabase: unknown;
  specs: ConsumerSettingSpec[];
  logger?: SettingsLogger;
  ttlMs?: number;
}): ConsumerSettings {
  const repo = createPlatformSettingsRepoSupabase(params.supabase, {
    logger: params.logger,
  });
  const resolver = createSettingsResolver({
    repo,
    specs: params.specs.map(normalize),
    ttlMs: params.ttlMs,
  });
  return {
    resolver,
    get: (key, tenantId) => resolver.resolveSetting(key, { tenantId }),
  };
}
