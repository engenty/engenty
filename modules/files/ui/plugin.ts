import { DockVaultIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { FilesDetailPage } from "./pages/files-detail.js";
import { FilesListPage } from "./pages/files-list.js";

export default function plugin(engenty: EngentyPluginContext) {
  // Realtime-only binding; files (@engenty/files-ui) has no `*-live-binding.ts`.
  // Root mirrors files query keys; tables exposed tenant-wide via migration.
  engenty.UI.registerLiveBinding({
    id: "files",
    queryRoot: ["files"],
    postgresChanges: [
      { schema: "module_files", table: "file_entries" },
      { schema: "module_files", table: "file_folders" },
    ],
  });

  engenty.i18n.registerNamespace({
    pluginId: "files",
    namespace: "files",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "files_admin_list",
    path: "/admin/files",
    component: FilesListPage,
    order: 900,
  });

  engenty.UI.registerRoute({
    id: "files_admin_detail",
    path: "/admin/files/:key",
    component: FilesDetailPage,
    order: 901,
  });

  engenty.UI.registerAdminMenuItem({
    id: "files_admin_menu",
    section: "admin",
    label: "Files",
    labelKey: "files:menu.files",
    to: "/admin/files",
    icon: DockVaultIcon,
    order: 110,
  });
}
