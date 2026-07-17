import { DockInvoicesIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { registerInvoicesPdfTemplateUiProvider } from "../src/pdf-templates/provider.js";
import { invoicesLiveBinding } from "./invoices-live-binding.js";
import {
  InvoiceDetailPage,
  InvoiceEditPage,
  InvoicesListPage,
  InvoicesSettingsPage,
} from "./pages/index.js";
import { setInvoicesPluginsApi } from "./plugins.js";
import { registerInvoicesObjectWidget } from "./register-object-widget.js";

export default function plugin(engenty: EngentyPluginContext) {
  setInvoicesPluginsApi(engenty.plugins);
  registerInvoicesPdfTemplateUiProvider();
  registerInvoicesObjectWidget();

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
    order: 100,
  });

  engenty.UI.registerSettingsItem({
    id: "invoices_settings_menu",
    label: "Invoices",
    labelKey: "invoices:menu",
    to: "/mdl/invoices/settings",
    icon: DockInvoicesIcon,
    order: 100,
  });
}
