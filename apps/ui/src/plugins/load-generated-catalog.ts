import type { UiPluginCatalogEntry } from "./catalog";
import { uiPluginCatalog as openUiPluginCatalog } from "./generated-catalog";
import { loadClosedUiPluginCatalog } from "./load-closed-ui-catalog";

export const uiPluginCatalog: UiPluginCatalogEntry[] = [
  ...openUiPluginCatalog,
  ...loadClosedUiPluginCatalog(),
];
