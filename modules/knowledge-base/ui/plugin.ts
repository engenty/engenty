import { DockKnowledgeBaseIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { kbCopilotContribution } from "./copilot-contribution.js";
import { kbLiveBinding } from "./kb-live-binding.js";
import { KB_ARTICLES_LIST_PATH, kbArticlePath } from "./kb-paths.js";
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

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(kbLiveBinding);

  // Contribute the KB article-href resolver so the copilot can deep-link to
  // articles without the app source-importing this module.
  engenty.UI.registerCopilotArticleHrefResolver({ resolve: kbArticlePath });

  engenty.i18n.registerNamespace({
    pluginId: "knowledge-base",
    namespace: "kb",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  /* ── Routes ── */
  /* Scoped paths first (lower `order` → earlier in router). Static segments before :id. */

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_new_edit",
    path: "/mdl/knowledge-base/:kbSlug/faqs/new/edit",
    component: FaqEditPage,
    order: 250,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_edit",
    path: "/mdl/knowledge-base/:kbSlug/faqs/:id/edit",
    component: FaqEditPage,
    order: 251,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faq_detail",
    path: "/mdl/knowledge-base/:kbSlug/faqs/:id",
    component: FaqDetailPage,
    order: 252,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_faqs_list",
    path: "/mdl/knowledge-base/:kbSlug/faqs",
    component: FaqListPage,
    order: 253,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_favorites",
    path: "/mdl/knowledge-base/:kbSlug/favorites",
    component: KbFavoritesListPage,
    order: 232,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_graph",
    path: "/mdl/knowledge-base/:kbSlug/graph",
    component: KbGraphPage,
    order: 234,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_settings",
    path: "/mdl/knowledge-base/:kbSlug/settings",
    component: KbScopedSettingsPage,
    order: 235,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_templates_index",
    path: "/mdl/knowledge-base/:kbSlug/templates",
    component: KbTemplatesIndexRedirect,
    order: 235,
  });

  // Single editor route: `:templateId` is `"new"` for create, otherwise edit.
  engenty.UI.registerRoute({
    id: "kb_scoped_templates_detail",
    path: "/mdl/knowledge-base/:kbSlug/templates/:templateId",
    component: KbTemplateDetailPage,
    order: 236,
  });

  engenty.UI.registerRoute({
    id: "kb.scoped.source-items.detail",
    path: "/mdl/knowledge-base/:kbSlug/source-items/:itemId",
    component: SourceItemDetailPage,
    order: 228,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_setup",
    path: "/mdl/knowledge-base/:kbSlug/sources/:sourceId/setup",
    component: SourceSetupWizardPage,
    order: 232,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_edit",
    path: "/mdl/knowledge-base/:kbSlug/sources/:sourceId/edit",
    component: SourceEditPage,
    order: 233,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_detail",
    path: "/mdl/knowledge-base/:kbSlug/sources/:sourceId",
    component: SourceDetailPage,
    order: 234,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_sources_list",
    path: "/mdl/knowledge-base/:kbSlug/sources",
    component: SourcesListPage,
    order: 236,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_inbox_detail",
    path: "/mdl/knowledge-base/:kbSlug/inbox/:id",
    component: InboxDetailPage,
    order: 246,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_inbox_list",
    path: "/mdl/knowledge-base/:kbSlug/inbox",
    component: InboxListPage,
    order: 247,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_category_edit",
    path: "/mdl/knowledge-base/:kbSlug/c/:catSlug/edit",
    component: CategoryEditPage,
    order: 229,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_category_detail",
    path: "/mdl/knowledge-base/:kbSlug/c/:catSlug",
    component: CategoryDetailPage,
    order: 230,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_articles_list",
    path: "/mdl/knowledge-base/:kbSlug/articles",
    component: ArticlesListPage,
    order: 254,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_articles_browse",
    path: "/mdl/knowledge-base/:kbSlug/browse",
    component: ArticlesListPage,
    order: 255,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_new_edit",
    path: "/mdl/knowledge-base/:kbSlug/new/edit",
    component: ArticleEditPage,
    order: 256,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_edit",
    path: "/mdl/knowledge-base/:kbSlug/:id/edit",
    component: ArticleEditPage,
    order: 257,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub_edit",
    path: "/mdl/knowledge-base/:kbSlug/edit",
    component: KbHubEditPage,
    order: 244,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub_chat",
    path: "/mdl/knowledge-base/:kbSlug/chat",
    component: KbHubChatPage,
    order: 245,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_article_detail",
    path: "/mdl/knowledge-base/:kbSlug/:id",
    component: ArticleDetailPage,
    order: 258,
  });

  engenty.UI.registerRoute({
    id: "kb_scoped_hub",
    path: "/mdl/knowledge-base/:kbSlug",
    component: KbHubPage,
    order: 259,
  });

  engenty.UI.registerRoute({
    id: "kb_articles_list",
    path: KB_ARTICLES_LIST_PATH,
    component: ArticlesListPage,
    order: 297,
  });

  engenty.UI.registerRoute({
    id: "kb_articles_browse",
    path: "/mdl/knowledge-base/browse",
    component: ArticlesListPage,
    order: 298,
  });

  engenty.UI.registerRoute({
    id: "kb_hub",
    path: "/mdl/knowledge-base",
    component: KbHubPage,
    order: 299,
  });

  engenty.UI.registerRoute({
    id: "kb_articles_detail",
    path: "/mdl/knowledge-base/:id",
    component: ArticleDetailPage,
    order: 301,
  });

  engenty.UI.registerRoute({
    id: "kb_articles_edit",
    path: "/mdl/knowledge-base/:id/edit",
    component: ArticleEditPage,
    order: 302,
  });

  engenty.UI.registerRoute({
    id: "kb_favorites",
    path: "/mdl/knowledge-base/favorites",
    component: KbFavoritesListPage,
    order: 309,
  });

  engenty.UI.registerRoute({
    id: "kb_faqs_list",
    path: "/mdl/knowledge-base/faqs",
    component: FaqListPage,
    order: 310,
  });

  engenty.UI.registerRoute({
    id: "kb_faqs_detail",
    path: "/mdl/knowledge-base/faqs/:id",
    component: FaqDetailPage,
    order: 311,
  });

  engenty.UI.registerRoute({
    id: "kb_faqs_edit",
    path: "/mdl/knowledge-base/faqs/:id/edit",
    component: FaqEditPage,
    order: 312,
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
          `^/mdl/knowledge-base/[^/]+/faqs/(?<id>${UUID_PATTERN})(?:/edit)?$`,
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
        /^\/mdl\/knowledge-base\/[^/]+\/inbox\/(?<id>[^/]+)$/i
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
      const match = pathname.match(
        new RegExp(
          `^/mdl/knowledge-base/[^/]+/(?<id>${UUID_PATTERN})(?:/edit)?$`,
          "i"
        )
      );
      return match?.groups ?? null;
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
