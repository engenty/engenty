import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  EXTERNAL_IMPORT_LEGACY_PATH,
  EXTERNAL_IMPORT_PATH,
  ExternalImportPage,
  SETUP_ROOT_PATH,
} from "./pages/external-import-page.js";
import { LegacyImportRedirect, SetupIndexRedirect } from "./setup-redirects.js";

/**
 * UI for the external-connectors import console (superadmin). Lives under
 * `/setup` — install-owner / platform ops, not Agents workspace or tenant
 * Settings. Imported connectors render through the standard connections
 * console with no extra UI.
 */
export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "setup_index",
    path: SETUP_ROOT_PATH,
    component: SetupIndexRedirect,
    order: 905,
    requiresAdmin: true,
  });

  engenty.UI.registerRoute({
    id: "external_connectors_import",
    path: EXTERNAL_IMPORT_PATH,
    component: ExternalImportPage,
    order: 906,
    requiresAdmin: true,
  });

  engenty.UI.registerRoute({
    id: "external_connectors_import_legacy",
    path: EXTERNAL_IMPORT_LEGACY_PATH,
    component: LegacyImportRedirect,
    order: 912,
    requiresAdmin: true,
  });
}
