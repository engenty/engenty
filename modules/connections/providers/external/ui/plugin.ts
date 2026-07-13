import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  EXTERNAL_IMPORT_PATH,
  ExternalImportPage,
} from "./pages/external-import-page.js";

/**
 * UI for the external-connectors import console (superadmin). Registers the
 * import console inside the connections workspace area; imported connectors
 * themselves render through the standard connections console with no extra
 * UI — this plugin only covers import/refresh management.
 *
 * The static `/import` segment outranks the connections module's
 * `/admin/engenty/connections/:connectorId` route in React Router matching,
 * so no coordination with that module is needed.
 */
export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "external_connectors_import",
    path: EXTERNAL_IMPORT_PATH,
    component: ExternalImportPage,
    order: 912,
    // /admin/* defaults to tenant-admin-only in the shell; the page itself
    // additionally gates on superadmin (and the API enforces it with 403s).
  });
}
