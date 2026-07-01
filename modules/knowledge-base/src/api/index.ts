/**
 * Knowledge Base — HTTP API route registration.
 *
 * Uses PluginHttpRouteContext from plugin-sdk (not Hono context).
 */

import type { PluginAuthContext, PluginEventsApi } from "@engenty/plugin-sdk";
import { registerKbAiGatewayMethods } from "../../ai/tools/kb-ai-gateway-methods.js";
import type { KbRepoFactoryFn } from "../dal/contracts.js";
import type { KbArticlesSearchProvider } from "../dal/kb-articles-search-index-provider.js";
import type { KbServerApi } from "./kb-api-shared.js";
import { registerKbArticleRoutes } from "./kb-articles-routes.js";
import { registerKbAttachmentAndFaqRoutes } from "./kb-attachments-faqs-routes.js";
import { registerKbChatRoute } from "./kb-chat.js";
import { registerKbCoverMediaRoutes } from "./kb-cover-media-routes.js";
import { registerKbDocumentConversionRoutes } from "./kb-document-conversion-routes.js";
import { registerKbInboxRoutes } from "./kb-inbox-routes.js";
import { registerKbKnowledgeBaseRoutes } from "./kb-knowledge-bases-routes.js";
import { registerKbSearchRoutes } from "./kb-search-routes.js";
import { registerKbSettingsRoutes } from "./kb-settings-routes.js";
import { registerKbSourceApi } from "./kb-sources.js";
import { registerKbTaxonomyRoutes } from "./kb-taxonomy-routes.js";

export type { KbServerApi } from "./kb-api-shared.js";

export function registerKbApi(
  api: KbServerApi,
  events: PluginEventsApi,
  repoFactory: KbRepoFactoryFn,
  searchProvider: KbArticlesSearchProvider
) {
  const getRepo = (auth?: PluginAuthContext) => {
    if (!auth) {
      throw new Error("Auth required");
    }
    return repoFactory(auth.tenantId, auth.scopeId);
  };

  registerKbChatRoute(api, repoFactory, searchProvider);
  registerKbSourceApi(api, getRepo, repoFactory);
  registerKbKnowledgeBaseRoutes(api, getRepo);
  registerKbTaxonomyRoutes(api, getRepo);
  registerKbArticleRoutes(api, getRepo);
  registerKbAttachmentAndFaqRoutes(api, getRepo);
  registerKbInboxRoutes(api, events, getRepo);
  registerKbSettingsRoutes(api, getRepo);
  registerKbDocumentConversionRoutes(api, getRepo);
  registerKbCoverMediaRoutes(api, getRepo);
  registerKbSearchRoutes(api, searchProvider);
  registerKbAiGatewayMethods(api, getRepo, events);
}
