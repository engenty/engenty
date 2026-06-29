import type { FeatureFlagDefinition } from "./types.js";

const KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Validates that key is non-empty and uses valid dot-notation.
 */
export function isValidKey(key: string): boolean {
  return (
    typeof key === "string" &&
    key.trim().length > 0 &&
    KEY_PATTERN.test(key.trim())
  );
}

/**
 * Normalizes key (trim, lowercase).
 */
export function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Deduplicates definitions by key. First registration wins.
 * Returns { catalog, duplicates } where catalog is the merged list.
 */
export function dedupeDefinitions(definitions: FeatureFlagDefinition[]): {
  catalog: FeatureFlagDefinition[];
  duplicates: string[];
} {
  const seen = new Map<string, FeatureFlagDefinition>();
  const duplicates: string[] = [];

  for (const def of definitions) {
    const key = normalizeKey(def.key);
    if (!isValidKey(def.key)) {
      duplicates.push(`invalid key "${def.key}" from ${def.pluginId}`);
      continue;
    }
    if (typeof def.default !== "boolean") {
      duplicates.push(
        `non-boolean default for "${def.key}" from ${def.pluginId}`
      );
      continue;
    }
    if (seen.has(key)) {
      duplicates.push(
        `duplicate key "${def.key}" from ${def.pluginId} (first from ${seen.get(key)?.pluginId})`
      );
      continue;
    }
    seen.set(key, { ...def, key });
  }

  return {
    catalog: Array.from(seen.values()),
    duplicates,
  };
}

/**
 * Groups definitions by namespace for UI display.
 */
export function groupByNamespace(
  definitions: FeatureFlagDefinition[]
): Map<string, FeatureFlagDefinition[]> {
  const map = new Map<string, FeatureFlagDefinition[]>();
  for (const def of definitions) {
    const ns = def.namespace.trim() || "general";
    const list = map.get(ns) ?? [];
    list.push(def);
    map.set(ns, list);
  }
  return map;
}
