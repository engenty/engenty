import { DockContactsIcon } from "@engenty/ui-icons";
import type {
  EngentyPluginContext,
  UiAdminMenuItemContribution,
} from "@engenty/ui-plugin-sdk";
import {
  type ContactsRoleMenuItem,
  getContactsRoleMenuConfig,
} from "./api/role-menu-settings.js";
import {
  createContact,
  getContact,
  getContactSettings,
  getContacts,
  setContactSettings,
  updateContact,
} from "./api.js";
import { ContactChooser } from "./components/contact-chooser.js";
import { ContactsShortcutsWidget } from "./components/dashboard/contacts-shortcuts-widget.js";
import { contactsLiveBinding } from "./contacts-live-binding.js";
import { contactsCopilotContribution } from "./copilot-contribution.js";
import {
  ContactDetailPage,
  ContactEditPage,
  ContactsImportPage,
  ContactsListPage,
  ContactsSettingsPage,
} from "./pages/index.js";
import { setContactsPluginsApi } from "./plugins.js";
import { contactDetailOptions } from "./queries.js";
import { registerContactsToolCallUi } from "./register-tool-call-ui.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(contactsLiveBinding);
  registerContactsToolCallUi();
  setContactsPluginsApi(engenty.plugins);
  engenty.i18n.registerNamespace({
    pluginId: "contacts",
    namespace: "contacts",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.plugins.expose({
    getContacts: async (
      params?: { search?: string; pageSize?: number },
      signal?: AbortSignal
    ) => {
      const response = await getContacts(params ?? {}, signal);
      return response.data;
    },
    getContact,
    createContact,
    updateContact,
    getContactSettings,
    setContactSettings,
    ContactChooser,
  });

  engenty.UI.registerRoute({
    id: "contacts_module_list",
    path: "/mdl/contacts",
    component: ContactsListPage,
    order: 120,
  });

  engenty.UI.registerRoute({
    id: "contacts_module_settings",
    path: "/mdl/contacts/settings",
    component: ContactsSettingsPage,
    order: 130,
  });

  engenty.UI.registerRoute({
    id: "contacts_module_import",
    path: "/mdl/contacts/import",
    component: ContactsImportPage,
    order: 130,
  });

  engenty.UI.registerRoute({
    id: "contacts_module_detail",
    path: "/mdl/contacts/:id",
    component: ContactDetailPage,
    order: 131,
  });

  engenty.UI.registerRoute({
    id: "contacts_module_edit",
    path: "/mdl/contacts/:id/edit",
    component: ContactEditPage,
    order: 132,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "contacts_detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(`^/mdl/contacts/(?<id>${UUID_PATTERN})(?:/edit)?$`, "i")
      );
      return match?.groups ?? null;
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(contactDetailOptions(id));
      }
    },
    order: 120,
  });

  engenty.UI.registerAdminMenuItem({
    id: "contacts_module_menu",
    section: "modules",
    label: "Contacts",
    labelKey: "contacts:menu.contacts",
    to: "/mdl/contacts",
    icon: DockContactsIcon,
    order: 120,
  });

  engenty.UI.registerAdminMenuItem({
    id: "contacts_module_menu_all",
    parentId: "contacts_module_menu",
    section: "modules",
    label: "All",
    labelKey: "contacts:menu.all",
    to: "/mdl/contacts",
    order: 1,
  });

  engenty.UI.on("ui.adminMenuItems", async (items) => {
    const config = await getContactsRoleMenuConfig().catch(() => null);
    const visible =
      config?.items
        .filter((i) => i.visible)
        .sort((a, b) => a.order - b.order) ?? [];
    if (visible.length === 0) {
      return items;
    }
    const CONTACTS_MENU_ID = "contacts_module_menu";
    const ROLE_LABEL_KEYS: Record<string, string> = {
      client: "contacts:menu.clients",
      partner: "contacts:menu.partners",
      supplier: "contacts:menu.suppliers",
      team: "contacts:menu.team",
    };
    const roleItemToContribution = (
      item: ContactsRoleMenuItem,
      index: number
    ): UiAdminMenuItemContribution => {
      const hasCustomPlural = Boolean(item.plural?.trim());
      const labelKey = hasCustomPlural ? undefined : ROLE_LABEL_KEYS[item.slug];
      return {
        id: `contacts.module.menu.role.${item.slug}`,
        parentId: CONTACTS_MENU_ID,
        section: "modules",
        label: item.plural?.trim() || item.title?.trim() || item.slug,
        labelKey,
        to: `/mdl/contacts?role=${item.slug}`,
        order: 2 + index,
        pluginId: "contacts",
      };
    };
    const roleItems = visible.map(roleItemToContribution);
    const withoutRoleChildren = items.filter(
      (item) =>
        !(
          item.parentId === CONTACTS_MENU_ID &&
          item.id !== "contacts_module_menu_all"
        )
    );
    return [...withoutRoleChildren, ...roleItems];
  });

  engenty.UI.registerSettingsItem({
    id: "contacts_settings_menu",
    label: "Contacts",
    labelKey: "contacts:menu.contacts",
    to: "/mdl/contacts/settings",
    icon: DockContactsIcon,
    order: 120,
  });

  engenty.UI.registerDashboardWidget({
    id: "contacts_shortcuts",
    title: "Contacts shortcuts",
    description: "Quick access to contacts and contact import.",
    category: "Contacts",
    component: ContactsShortcutsWidget,
    defaultSize: { w: 4, h: 2 },
    order: 120,
    starterPriority: 120,
    createDefaultConfig: () => ({}),
  });

  engenty.UI.registerCopilotContribution(contactsCopilotContribution);
}
