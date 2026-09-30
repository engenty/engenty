import { registerCatalogSection } from "@engenty/connections/ui/extensions";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { ImportedConnectorsCatalogSection } from "./pages/imported-connectors-section.js";
import {
  LegacyConnectorsRedirect,
  SETUP_ROOT_PATH,
  SetupIndexRedirect,
} from "./setup-redirects.js";

/**
 * The imported connectors' table on Setup → Connections (tenant admin).
 * Search and paste-URL import live in the plugin marketplace.
 */
export default function plugin(engenty: EngentyPluginContext) {
  registerCatalogSection(ImportedConnectorsCatalogSection);

  engenty.UI.registerRoute({
    id: "setup_index",
    path: SETUP_ROOT_PATH,
    component: SetupIndexRedirect,
    order: 905,
    requiresAdmin: true,
  });

  engenty.UI.registerRoute({
    id: "external_connectors_import",
    path: `${SETUP_ROOT_PATH}/connectors`,
    component: LegacyConnectorsRedirect,
    order: 906,
    requiresAdmin: true,
  });
}
