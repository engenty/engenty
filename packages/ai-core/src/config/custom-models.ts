/**
 * The composer's Custom list: models a person may pin for a thread instead of
 * Normal or Extra. Platform-wide — the superadmin switches it on and keeps the
 * list in the binding console, and it ships in `default-models.json` next to
 * the role bindings. Browser-safe.
 */

import { formatModelRef, modelIdOfRef, parseModelRef } from "./model-ref.js";

export interface CustomModelsConfig {
  /** Off = the composer offers Normal and Extra only; pins are refused. */
  enabled: boolean;
  /** Model refs in the order the composer lists them. */
  models: string[];
}

export const DEFAULT_CUSTOM_MODELS_CONFIG: CustomModelsConfig = {
  enabled: false,
  models: [],
};

function refKey(ref: string): string {
  const parsed = parseModelRef(ref);
  return formatModelRef({
    gateway: parsed.gateway,
    modelId: parsed.modelId.toLowerCase(),
  });
}

/**
 * A stored or imported config; anything unreadable is the default. Refs
 * without a `provider/model` id are dropped, duplicates keep their first place.
 */
export function parseCustomModelsConfig(raw: unknown): CustomModelsConfig {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_CUSTOM_MODELS_CONFIG;
  }
  const record = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const models: string[] = [];
  for (const value of Array.isArray(record.models) ? record.models : []) {
    const ref = typeof value === "string" ? value.trim() : "";
    if (!(ref && modelIdOfRef(ref).includes("/"))) {
      continue;
    }
    const key = refKey(ref);
    if (!seen.has(key)) {
      seen.add(key);
      models.push(ref);
    }
  }
  return { enabled: record.enabled === true, models };
}

/**
 * Whether a session pin names a model the Custom list offers. Gateway and
 * model both count: the same weights on another gateway are billed and
 * governed as a different row. A switched-off list offers nothing.
 */
export function isCustomModelOffered(
  modelRef: string,
  config: CustomModelsConfig
): boolean {
  if (!config.enabled) {
    return false;
  }
  const key = refKey(modelRef);
  return config.models.some((offered) => refKey(offered) === key);
}
