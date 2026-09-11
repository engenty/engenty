import type { UiPluginCatalogEntry } from "./catalog";

const closedCatalogModules = import.meta.glob<{
  uiPluginCatalog: UiPluginCatalogEntry[];
}>("./pro/generated-catalog.ts", { eager: true });

/** Closed UI plugins — present only in a pro checkout after generate:plugins. */
export function loadClosedUiPluginCatalog(): UiPluginCatalogEntry[] {
  const loaded = Object.values(closedCatalogModules)[0];
  return loaded?.uiPluginCatalog ?? [];
}
