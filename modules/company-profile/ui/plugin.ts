import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Building2 } from "lucide-react";
import { companyProfileLiveBinding } from "./company-profile-live-binding.js";
import { companyProfileCopilotContribution } from "./copilot-contribution.js";
import { CompanyProfileRootPage, CompanySettingsPage } from "./pages/index.js";
import { useCompanyProfileBrand } from "./queries.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(companyProfileLiveBinding);

  // Surface the tenant's brand (name + logo) to the app shell switcher.
  engenty.UI.registerBrandSource({ useBrand: useCompanyProfileBrand });

  engenty.i18n.registerNamespace({
    pluginId: "company-profile",
    namespace: "company-profile",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "company_profile_root",
    path: "/mdl/company-profile",
    component: CompanyProfileRootPage,
    order: 0,
  });

  engenty.UI.registerRoute({
    id: "company_profile_settings",
    path: "/mdl/company-profile/settings",
    component: CompanySettingsPage,
    order: 0,
  });

  engenty.UI.registerSettingsItem({
    id: "company_profile_settings_menu",
    label: "Company Profile",
    labelKey: "company-profile:menu",
    to: "/mdl/company-profile/settings",
    icon: Building2,
    // Within commercial category
    order: 10,
  });

  engenty.UI.registerCopilotContribution(companyProfileCopilotContribution);
}
