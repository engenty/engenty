/**
 * Collects i18n namespace names from `namespace:key` strings (Engenty module menu / flag keys).
 */
export function collectModuleNamespacesFromI18nKeys(
  keys: Iterable<string | undefined | null>
): string[] {
  const set = new Set<string>();
  for (const raw of keys) {
    if (!raw?.includes(":")) {
      continue;
    }
    const ns = raw.split(":")[0];
    if (ns) {
      set.add(ns);
    }
  }
  return Array.from(set).sort();
}
