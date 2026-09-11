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
import { SpaceDataContactTab } from "./components/space-data-contact-tab.js";
import { SpaceDataContactsFolderTab } from "./components/space-data-contacts-folder-tab.js";
import { SpaceDataContactsRootTab } from "./components/space-data-contacts-root-tab.js";
import { contactsLiveBinding } from "./contacts-live-binding.js";
import { CONTACTS_SETTINGS_PATH } from "./contacts-paths.js";
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
import { registerContactsObjectWidget } from "./register-object-widget.js";
import { registerContactsToolCallUi } from "./register-tool-call-ui.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The space Data pane's slot for a contact record.
 *
 * Keyed by NODE TYPE, not by node kind: every data adapter produces `record`
 * nodes, so `spaces.data.record` would have contacts rendering offers. The
 * suffix is this module's own node type id from
 * `src/space-data/adapter.ts` — kept as a literal on both sides, the same way
 * `contacts.detail` is, so apps/ui takes no dependency on this module.
 */
const SPACE_DATA_CONTACT_SURFACE = "spaces.data.node:contacts.contact";

/**
 * The same slot for a taxonomy FOLDER — `People`, `Organisations`.
 *
 * `…folder:<type>` rather than `…node:<type>`: a folder is listed and a node is
 * read, so the host has two different things to hand a renderer. The suffix is
 * `CONTACTS_FOLDER_NODE_TYPE` from `src/space-data/adapter.ts`.
 */
const SPACE_DATA_CONTACTS_FOLDER_SURFACE = "spaces.data.folder:contacts.folder";

/** The `Contacts` root — the address book's index, not two words and a CSV. */
const SPACE_DATA_CONTACTS_ROOT_SURFACE = "spaces.data.folder:contacts.root";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(contactsLiveBinding);
  registerContactsToolCallUi();
  registerContactsObjectWidget();

  engenty.UI.registerTab({
    id: "contacts-space-data-contact",
    surface: SPACE_DATA_CONTACT_SURFACE,
    component: SpaceDataContactTab,
    label: "Contact",
    labelKey: "contacts:spaceData.tab",
    icon: DockContactsIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "contacts-space-data-folder",
    surface: SPACE_DATA_CONTACTS_FOLDER_SURFACE,
    component: SpaceDataContactsFolderTab,
    label: "Contacts",
    labelKey: "contacts:spaceData.folder.tab",
    icon: DockContactsIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "contacts-space-data-root",
    surface: SPACE_DATA_CONTACTS_ROOT_SURFACE,
    component: SpaceDataContactsRootTab,
    label: "Contacts",
    labelKey: "contacts:spaceData.folder.tab",
    icon: DockContactsIcon,
    order: 100,
  });
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

  // Module settings live under /settings/* like every other module's settings
  // page — that is what puts the settings nav in the secondary column instead of
  // the contacts role rail.
  engenty.UI.registerRoute({
    id: "contacts_module_settings",
    path: CONTACTS_SETTINGS_PATH,
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
    // Within work category (matches settings order)
    order: 10,
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
    to: CONTACTS_SETTINGS_PATH,
    icon: DockContactsIcon,
    // Within work category
    order: 10,
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
