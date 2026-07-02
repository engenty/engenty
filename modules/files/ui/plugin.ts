import { DockVaultIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { ProjectFilesTab } from "./components/project-files-tab.js";
import { FilesDetailPage } from "./pages/files-detail.js";
import { FilesListPage } from "./pages/files-list.js";

/** Host surface key from `@engenty/projects` — kept as a literal to avoid a
 * hard workspace dependency on the projects module (this tab only appears
 * when both modules happen to be installed). */
const PROJECTS_DETAIL_SURFACE = "projects.detail";

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

  // Only appears when the projects module is also installed — see
  // `PROJECTS_DETAIL_SURFACE` in @engenty/projects' use-project-tabs.ts.
  engenty.UI.registerTab({
    id: "files",
    surface: PROJECTS_DETAIL_SURFACE,
    component: ProjectFilesTab,
    label: "Files",
    labelKey: "files:projectFilesTab",
    icon: DockVaultIcon,
    order: 300,
  });
}
