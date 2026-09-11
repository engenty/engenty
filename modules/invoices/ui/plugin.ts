import { DockInvoicesIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { registerInvoicesPdfTemplateUiProvider } from "../src/pdf-templates/provider.js";
import { SpaceDataInvoiceTab } from "./components/space-data-invoice-tab.js";
import { SpaceDataInvoicesFolderTab } from "./components/space-data-invoices-folder-tab.js";
import { SpaceDataInvoicesRootTab } from "./components/space-data-invoices-root-tab.js";
import { invoicesLiveBinding } from "./invoices-live-binding.js";
import {
  InvoiceDetailPage,
  InvoiceEditPage,
  InvoicesListPage,
  InvoicesSettingsPage,
} from "./pages/index.js";
import { setInvoicesPluginsApi } from "./plugins.js";
import { registerInvoicesObjectWidget } from "./register-object-widget.js";

/**
 * The space Data pane's slot for an invoice bundle.
 *
 * Keyed by NODE TYPE, not by node kind: `bundle` is a shape many modules
 * produce, so only the namespaced type tells an invoice from an offer. The
 * suffix is this module's node type id from `src/space-data/adapter.ts`, kept
 * as a literal on both sides so apps/ui takes no dependency on this module.
 */
const SPACE_DATA_INVOICE_SURFACE = "spaces.data.node:invoices.invoice";

/**
 * The same slot for the FOLDERS — one lifecycle state, and the root above them.
 *
 * `…folder:<type>` rather than `…node:<type>`: a folder is listed and a node is
 * read, so the host has two different things to hand a renderer. The suffixes
 * are `INVOICES_STATUS_NODE_TYPE` and `INVOICES_ROOT_NODE_TYPE` from
 * `src/space-data/adapter.ts`. Deliberately NOT the offers types: an offer's
 * stages are a pipeline you push through, an invoice's are Festschreibung.
 */
const SPACE_DATA_INVOICES_FOLDER_SURFACE = "spaces.data.folder:invoices.status";
const SPACE_DATA_INVOICES_ROOT_SURFACE = "spaces.data.folder:invoices.root";

export default function plugin(engenty: EngentyPluginContext) {
  setInvoicesPluginsApi(engenty.plugins);
  registerInvoicesPdfTemplateUiProvider();
  registerInvoicesObjectWidget();

  engenty.UI.registerTab({
    id: "invoices-space-data-invoice",
    surface: SPACE_DATA_INVOICE_SURFACE,
    component: SpaceDataInvoiceTab,
    label: "Invoice",
    labelKey: "invoices:spaceData.tab",
    icon: DockInvoicesIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "invoices-space-data-folder",
    surface: SPACE_DATA_INVOICES_FOLDER_SURFACE,
    component: SpaceDataInvoicesFolderTab,
    label: "Invoices",
    labelKey: "invoices:spaceData.folder.tab",
    icon: DockInvoicesIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "invoices-space-data-root",
    surface: SPACE_DATA_INVOICES_ROOT_SURFACE,
    component: SpaceDataInvoicesRootTab,
    label: "Invoices",
    labelKey: "invoices:spaceData.folder.tab",
    icon: DockInvoicesIcon,
    order: 100,
  });

  engenty.i18n.registerNamespace({
    pluginId: "invoices",
    namespace: "invoices",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerLiveBinding(invoicesLiveBinding);

  engenty.UI.registerRoute({
    id: "invoices_module_list",
    path: "/mdl/invoices",
    component: InvoicesListPage,
    order: 100,
  });

  engenty.UI.registerRoute({
    id: "invoices_module_settings",
    path: "/mdl/invoices/settings",
    component: InvoicesSettingsPage,
    order: 110,
  });

  engenty.UI.registerRoute({
    id: "invoices_module_detail",
    path: "/mdl/invoices/:id",
    component: InvoiceDetailPage,
    order: 120,
  });

  engenty.UI.registerRoute({
    id: "invoices_module_draft",
    path: "/mdl/invoices/:id/draft",
    component: InvoiceEditPage,
    order: 121,
  });

  engenty.UI.registerAdminMenuItem({
    id: "invoices_module_menu",
    section: "modules",
    label: "Invoices",
    labelKey: "invoices:menu",
    to: "/mdl/invoices",
    icon: DockInvoicesIcon,
    // Within commercial category (matches settings order)
    order: 20,
  });

  engenty.UI.registerSettingsItem({
    id: "invoices_settings_menu",
    label: "Invoices",
    labelKey: "invoices:menu",
    to: "/mdl/invoices/settings",
    icon: DockInvoicesIcon,
    // Within commercial category
    order: 20,
  });
}
