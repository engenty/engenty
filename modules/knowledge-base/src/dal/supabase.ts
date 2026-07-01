/**
 * Knowledge Base — Supabase DAL implementation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createArticleCommentRepo } from "./article-comments.js";
import { createArticleRepo } from "./articles.js";
import { createAttachmentRepo } from "./attachments.js";
import { createCategoryRepo } from "./categories.js";
import type {
  EmitArticleEvent,
  EmitCategoryEvent,
  EmitKbEvent,
  KbRepoFactory,
} from "./contracts.js";
import { createFaqRepo } from "./faqs.js";
import {
  createInboxRepo,
  createKbActivityLogRepo,
  createSourceReferenceRepo,
} from "./inbox.js";
import { createKbVersionRepo } from "./kb-versions.js";
import { createKbRepo } from "./knowledge-bases.js";
import { createKbSettingsRepo } from "./settings.js";
import { createKbSourceRepo } from "./sources.js";
import { createTagRepo } from "./tags.js";
import { createKbTemplateRepo } from "./templates.js";

export interface CreateKbRepoFactoryOptions {
  emitArticleEvent?: EmitArticleEvent;
  emitCategoryEvent?: EmitCategoryEvent;
  emitKbEvent?: EmitKbEvent;
}

export function createKbRepoFactory(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  options: CreateKbRepoFactoryOptions = {}
): KbRepoFactory {
  const supabase = adapter as SupabaseClient;
  const versions = createKbVersionRepo(supabase, tenantId, scopeId);

  return {
    activity_log: createKbActivityLogRepo(supabase, tenantId, scopeId),
    article_comments: createArticleCommentRepo(supabase, tenantId, scopeId),
    categories: createCategoryRepo(supabase, tenantId, scopeId, {
      emitCategoryEvent: options.emitCategoryEvent,
    }),
    kb: createKbRepo(supabase, tenantId, scopeId, {
      emitKbEvent: options.emitKbEvent,
    }),
    settings: createKbSettingsRepo(supabase, tenantId, scopeId),
    tags: createTagRepo(supabase, tenantId, scopeId),
    templates: createKbTemplateRepo(supabase, tenantId, scopeId),
    articles: createArticleRepo(supabase, tenantId, scopeId, versions, {
      emitArticleEvent: options.emitArticleEvent,
    }),
    attachments: createAttachmentRepo(supabase, tenantId, scopeId),
    faqs: createFaqRepo(supabase, tenantId, scopeId, versions),
    inbox: createInboxRepo(supabase, tenantId, scopeId),
    sources: createKbSourceRepo(supabase, tenantId, scopeId),
    source_references: createSourceReferenceRepo(supabase, tenantId, scopeId),
    versions,
  };
}
