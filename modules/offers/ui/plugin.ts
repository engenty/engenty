import { DockOffersIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { registerOffersPdfTemplateUiProvider } from "../src/pdf-templates/provider.js";
import {
  createOffer,
  getOffer,
  getOfferSettings,
  getOffers,
  getOfferTemplates,
  setDefaultOfferTemplate,
  setOfferSettings,
  updateOffer,
} from "./api.js";
import { ContactOffersTab } from "./components/contact-offers-tab.js";
import { createOfferFromLead } from "./lib/create-offer-from-lead.js";
import { offersLiveBinding } from "./offers-live-binding.js";
import {
  OfferDetailPage,
  OfferEditPage,
  OffersListPage,
  OffersSettingsPage,
} from "./pages/index.js";
import { setOffersPluginsApi } from "./plugins.js";
import { offerDetailOptions } from "./queries.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(offersLiveBinding);
  setOffersPluginsApi(engenty.plugins);
  registerOffersPdfTemplateUiProvider();

  engenty.i18n.registerNamespace({
    pluginId: "offers",
    namespace: "offers",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  // Fills the "Angebote" slot on the contact detail page. Kept as a literal
  // to avoid a static dep — the host constant is CONTACTS_DETAIL_SURFACE in
  // @engenty/contacts' use-contact-tabs.ts.
  engenty.UI.registerTab({
    id: "offers",
    surface: "contacts.detail",
    component: ContactOffersTab,
    labelKey: "offers:contactTab",
    order: 200,
  });

  engenty.plugins.expose({
    getOffers: async (signal?: AbortSignal) => {
      const response = await getOffers({}, signal);
      return response.data;
    },
    getOffer,
    createOffer,
    createOfferFromLead,
    updateOffer,
    getOfferTemplates,
    setDefaultOfferTemplate,
    getOfferSettings,
    setOfferSettings,
  });

  engenty.UI.registerRoute({
    id: "offers_module_list",
    path: "/mdl/offers",
    component: OffersListPage,
    order: 118,
  });

  engenty.UI.registerRoute({
    id: "offers_module_settings",
    path: "/mdl/offers/settings",
    component: OffersSettingsPage,
    order: 119,
  });

  engenty.UI.registerRoute({
    id: "offers_module_detail",
    path: "/mdl/offers/:id",
    component: OfferDetailPage,
    order: 120,
  });

  engenty.UI.registerRoute({
    id: "offers_module_draft",
    path: "/mdl/offers/:id/draft",
    component: OfferEditPage,
    order: 121,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "offers_detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(`^/mdl/offers/(?<id>${UUID_PATTERN})(?:/draft)?$`, "i")
      );
      return match?.groups ?? null;
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(offerDetailOptions(id));
      }
    },
    order: 118,
  });

  engenty.UI.registerAdminMenuItem({
    id: "offers_module_menu",
    section: "modules",
    label: "Offers",
    labelKey: "offers:menu.offers",
    to: "/mdl/offers",
    icon: DockOffersIcon,
    order: 118,
  });

  // The former Drafts/Ready/Accepted quick links moved into the sidebar
  // panel's status filter (OffersSidebarPanel — projects-style secondary nav).

  engenty.UI.registerSettingsItem({
    id: "offers_settings_menu",
    label: "Offers",
    labelKey: "offers:menu.offers",
    to: "/mdl/offers/settings",
    order: 118,
  });
}
