// biome-ignore lint/performance/noBarrelFile: Public KB sidebar entrypoint for module consumers
export {
  ArticleForestRows,
  type KbSidebarArticleDropTarget,
  type KbSidebarArticleManualReorderDrag,
  KbSidebarListArticleRow,
} from "./article-tree/article-tree-rows.js";
export { KbSidebarArticleTreeDefaultsFields } from "./article-tree/kb-sidebar-article-tree-defaults-fields.js";
export { KbModuleSidebar } from "./kb-module-sidebar.js";
export { KbSidebar } from "./kb-sidebar.js";
export {
  kbSidebarNavStorageKey,
  useKbSidebarArticleTreePrefs,
} from "./lib/tree-prefs.js";
