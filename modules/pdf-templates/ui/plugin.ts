import { PdfTemplatesSettingsPage } from "@engenty/pdf-templates";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { FileText } from "lucide-react";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "pdf-templates",
    namespace: "pdf-templates",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "pdf_templates_settings",
    path: "/settings/pdf-templates",
    component: PdfTemplatesSettingsPage,
    order: 215,
  });

  engenty.UI.registerSettingsItem({
    id: "pdf_templates_settings_menu",
    label: "PDF Templates",
    labelKey: "pdf-templates:menu",
    to: "/settings/pdf-templates",
    icon: FileText,
    order: 215,
  });
}
