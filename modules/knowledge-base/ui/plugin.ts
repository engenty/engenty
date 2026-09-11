import { DockKnowledgeBaseIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { SpaceDataArticleFolderTab } from "./components/space-data-article-folder-tab.js";
import { SpaceDataArticleTab } from "./components/space-data-article-tab.js";
import { SpaceDataKbBaseTab } from "./components/space-data-kb-base-tab.js";
import { SpaceDataKbCategoryTab } from "./components/space-data-kb-category-tab.js";
import { kbCopilotContribution } from "./copilot-contribution.js";
import { kbLiveBinding } from "./kb-live-binding.js";
import { isKbScopedReservedArticleId, kbArticlePath } from "./kb-paths.js";
import { ArticleDetailPage } from "./pages/article-detail.js";
import { ArticleEditPage } from "./pages/article-edit.js";
import { ArticlesListPage } from "./pages/articles-list-page.js";
import { CategoryDetailPage } from "./pages/category-detail.js";
import { CategoryEditPage } from "./pages/category-edit-page.js";
import { FaqDetailPage } from "./pages/faq-detail.js";
import { FaqEditPage } from "./pages/faq-edit.js";
import { FaqListPage } from "./pages/faqs-list-page.js";
import { InboxDetailPage } from "./pages/inbox-detail-page.js";
import { InboxListPage } from "./pages/inbox-list-page.js";
import { KbFavoritesListPage } from "./pages/kb-favorites-list-page.js";
import { KbGraphPage } from "./pages/kb-graph-page.js";
import { KbHubPage } from "./pages/kb-hub.js";
import { KbHubChatPage } from "./pages/kb-hub-chat-page.js";
import { KbHubEditPage } from "./pages/kb-hub-edit-page.js";
import { KbScopedSettingsPage } from "./pages/kb-scoped-settings-page.js";
import { KbSettingsPage } from "./pages/kb-settings.js";
import { KbTemplateDetailPage } from "./pages/kb-template-detail-page.js";
import { KbTemplatesIndexRedirect } from "./pages/kb-templates-index-redirect.js";
import { SourceCreateWizardRedirect } from "./pages/source-create-wizard-redirect.js";
import { SourceDetailPage } from "./pages/source-detail-page.js";
import { SourceEditPage } from "./pages/source-edit-page.js";
import { SourceItemDetailPage } from "./pages/source-item-detail-page.js";
import { SourceSetupWizardPage } from "./pages/source-setup-wizard-page.js";
import { SourcesListPage } from "./pages/sources-list-page.js";
import {
  articleDetailQueryOptions,
  faqDetailQueryOptions,
  inboxDetailQueryOptions,
} from "./queries.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The space Data pane's slot for one knowledge article.
 *
 * Keyed by NODE TYPE, like every other record: an article used to arrive as a
 * `page` node through a lane of its own, and `spaces.data.page` was the slot
 * for it. Since Phase K the knowledge base is an ordinary space-data adapter,
 * so the article is a `kb.article` record and this is the same slot contacts
 * and offers use. A literal on both sides — apps/ui takes no dependency on this
 * module, and a parked module simply registers nothing, at which point the pane
 * shows the article's file.
 */
const SPACE_DATA_ARTICLE_SURFACE = "spaces.data.node:kb.article";

/**
 * The same, for an article that HAS children and is therefore a folder.
 *
 * A folder is listed and a node is read, so the host hands a renderer two
 * different things — one type id, two surfaces.
 */
const SPACE_DATA_ARTICLE_FOLDER_SURFACE = "spaces.data.folder:kb.article";

/** One library. */
const SPACE_DATA_KB_BASE_SURFACE = "spaces.data.folder:kb.base";

/** One category, the folder this whole phase started from. */
const SPACE_DATA_KB_CATEGORY_SURFACE = "spaces.data.folder:kb.category";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(kbLiveBinding);

  engenty.UI.registerTab({
    id: "kb-space-data-page",
    surface: SPACE_DATA_ARTICLE_SURFACE,
    component: SpaceDataArticleTab,
    label: "Page",
    labelKey: "kb:spaceData.tab",
    icon: DockKnowledgeBaseIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "kb-space-data-article-folder",
    surface: SPACE_DATA_ARTICLE_FOLDER_SURFACE,
    component: SpaceDataArticleFolderTab,
    label: "Page",
    labelKey: "kb:spaceData.tab",
    icon: DockKnowledgeBaseIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "kb-space-data-base",
    surface: SPACE_DATA_KB_BASE_SURFACE,
    component: SpaceDataKbBaseTab,
    label: "Knowledge base",
    labelKey: "kb:spaceData.base.tab",
    icon: DockKnowledgeBaseIcon,
    order: 100,
  });

  engenty.UI.registerTab({
    id: "kb-space-data-category",
    surface: SPACE_DATA_KB_CATEGORY_SURFACE,
    component: SpaceDataKbCategoryTab,
    label: "Category",
    labelKey: "kb:spaceData.category.tab",
    icon: DockKnowledgeBaseIcon,
    order: 100,
  });

  // Contribute the KB article-href resolver so the copilot can deep-link to
  // articles without the app source-importing this module.
  engenty.UI.registerCopilotArticleHrefResolver({
    // The slug the copilot passes is the pre-spaces KB slug; a space has one
    // knowledge base, so only the article segment is meaningful.
    resolve: (_slug, articleIdOrSlug) => kbArticlePath(articleIdOrSlug),
  });

  engenty.i18n.registerNamespace({
    pluginId: "knowledge-base",
    namespace: "kb",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  /* ── Routes ── */
  /* One knowledge base per space: no URL names a library. Static segments before :id. */

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_new_edit",
    path: "/mdl/knowledge-base/faqs/new/edit",
    component: FaqEditPage,
    order: 250,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_edit",
    path: "/mdl/knowledge-base/faqs/:id/edit",
    component: FaqEditPage,
    order: 251,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_detail",
    path: "/mdl/knowledge-base/faqs/:id",
    component: FaqDetailPage,
    order: 252,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faqs_list",
    path: "/mdl/knowledge-base/faqs",
    component: FaqListPage,
    order: 253,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_favorites",
    path: "/mdl/knowledge-base/favorites",
    component: KbFavoritesListPage,
    order: 232,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_graph",
    path: "/mdl/knowledge-base/graph",
    component: KbGraphPage,
    order: 234,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_settings",
    path: "/mdl/knowledge-base/settings",
    component: KbScopedSettingsPage,
    order: 235,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_templates_index",
    path: "/mdl/knowledge-base/templates",
    component: KbTemplatesIndexRedirect,
    order: 235,
  });

  // Single editor route: `:templateId` is `"new"` for create, otherwise edit.
  engenty.UI.registerRoute({
    id: "kb_scoped_templates_detail",
    path: "/mdl/knowledge-base/templates/:templateId",
    component: KbTemplateDetailPage,
    order: 236,
  });

  engenty.UI.registerRoute({
    id: "kb.scoped.source-items.detail",
    path: "/mdl/knowledge-base/source-items/:itemId",
    component: SourceItemDetailPage,
    order: 228,
  });

  // Ahead of `sources/:sourceId` (234) so `new` is the wizard, not a lookup
  // for a source with that id. The wizard itself is a modal on the list page;
  // this route only exists so the deep link keeps working.
  engenty.UI.registerRoute({
    id: "kb_scoped_sources_new",
    path: "/mdl/knowledge-base/sources/new",
    component: SourceCreateWizardRedirect,
    order: 231,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_setup",
    path: "/mdl/knowledge-base/sources/:sourceId/setup",
    component: SourceSetupWizardPage,
    order: 232,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_edit",
    path: "/mdl/knowledge-base/sources/:sourceId/edit",
    component: SourceEditPage,
    order: 233,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_detail",
    path: "/mdl/knowledge-base/sources/:sourceId",
    component: SourceDetailPage,
    order: 234,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_list",
    path: "/mdl/knowledge-base/sources",
    component: SourcesListPage,
    order: 236,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_inbox_detail",
    path: "/mdl/knowledge-base/inbox/:id",
    component: InboxDetailPage,
    order: 246,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_inbox_list",
    path: "/mdl/knowledge-base/inbox",
    component: InboxListPage,
    order: 247,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_category_edit",
    path: "/mdl/knowledge-base/c/:catSlug/edit",
    component: CategoryEditPage,
    order: 229,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_category_detail",
    path: "/mdl/knowledge-base/c/:catSlug",
    component: CategoryDetailPage,
    order: 230,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_articles_list",
    path: "/mdl/knowledge-base/articles",
    component: ArticlesListPage,
    order: 254,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_articles_browse",
    path: "/mdl/knowledge-base/browse",
    component: ArticlesListPage,
    order: 255,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_new_edit",
    path: "/mdl/knowledge-base/new/edit",
    component: ArticleEditPage,
    order: 256,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_edit",
    path: "/mdl/knowledge-base/:id/edit",
    component: ArticleEditPage,
    order: 257,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub_edit",
    path: "/mdl/knowledge-base/edit",
    component: KbHubEditPage,
    order: 244,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub_chat",
    path: "/mdl/knowledge-base/chat",
    component: KbHubChatPage,
    order: 245,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_detail",
    path: "/mdl/knowledge-base/:id",
    component: ArticleDetailPage,
    order: 258,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub",
    path: "/mdl/knowledge-base",
    component: KbHubPage,
    order: 259,
  });

  engenty.UI.registerRoute({
    id: "kb_settings",
    path: "/settings/knowledge-base",
    component: KbSettingsPage,
    order: 390,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "kb_scoped_faq_detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(
          `^/mdl/knowledge-base/faqs/(?<id>${UUID_PATTERN})(?:/edit)?$`,
          "i"
        )
      );
      return match?.groups ?? null;
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(faqDetailQueryOptions(id));
      }
    },
    order: 250,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "kb_scoped_inbox_detail",
    match: (pathname) => {
      const match = pathname.match(
        /^\/mdl\/knowledge-base\/inbox\/(?<id>[^/]+)$/i
      );
      if (!match?.groups?.id) {
        return null;
      }
      return { id: decodeURIComponent(match.groups.id) };
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(inboxDetailQueryOptions(id));
      }
    },
    order: 251,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "kb_scoped_article_detail",
    match: (pathname) => {
      // Articles are linked by slug wherever they have one, so a uuid-shaped
      // matcher would skip nearly every link there is. The reserved segments
      // are the list and hub routes that share this path shape.
      const match = pathname.match(
        /^\/mdl\/knowledge-base\/(?<id>[^/]+)(?:\/edit)?$/i
      );
      const id = match?.groups?.id ? decodeURIComponent(match.groups.id) : null;
      if (!id || isKbScopedReservedArticleId(id)) {
        return null;
      }
      return { id };
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(articleDetailQueryOptions(id));
      }
    },
    order: 252,
  });

  /* ── Menu ── */

  engenty.UI.registerAdminMenuItem({
    id: "kb_menu",
    section: "modules",
    label: "Knowledge Base",
    labelKey: "kb:menu.knowledge_base",
    to: "/mdl/knowledge-base",
    icon: DockKnowledgeBaseIcon,
    // Within knowledge category (matches settings order)
    order: 10,
  });

  engenty.UI.registerSettingsItem({
    id: "kb_settings_menu",
    label: "Knowledge Base",
    labelKey: "kb:menu.knowledge_base",
    to: "/settings/knowledge-base",
    icon: DockKnowledgeBaseIcon,
    // Within knowledge category
    order: 10,
  });

  engenty.UI.registerCopilotContribution(kbCopilotContribution);
}
