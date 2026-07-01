/**
 * Promote one inbox capture to multiple KB articles in one request (articles only).
 */

import type { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";
import type { inboxPromoteBatchBodySchema } from "../schema/inbox.js";
import type {
  Article,
  ArticleUpdateInput,
  InboxItem,
} from "../schema/types.js";
import { slugFromTitle } from "./kb-inbox-promote.js";

export type InboxPromoteBatchBody = z.infer<typeof inboxPromoteBatchBodySchema>;

interface CompletedStep {
  articleId: string;
  created: boolean;
}

async function rollbackPromoteBatch(
  repos: KbRepoFactory,
  inboxItemId: string,
  completed: CompletedStep[]
): Promise<void> {
  for (const c of [...completed].reverse()) {
    try {
      await repos.source_references.deleteByInboxAndArticle(
        inboxItemId,
        c.articleId
      );
    } catch {
      /* best-effort */
    }
    if (c.created) {
      try {
        await repos.articles.delete(c.articleId);
      } catch {
        /* best-effort */
      }
    }
  }
}

function inboxMarkdownFallback(
  stepMd: string | null | undefined,
  inboxItem: InboxItem
): string {
  const s = stepMd?.trim() ?? "";
  if (s.length > 0) {
    return s;
  }
  return inboxItem.raw_markdown ?? inboxItem.raw_text ?? "";
}

export async function executeInboxPromoteBatch(
  repos: KbRepoFactory,
  params: {
    actorPrincipalId: string;
    body: InboxPromoteBatchBody;
    inboxItem: InboxItem;
  }
): Promise<{
  articles: Article[];
  inbox: InboxItem;
  primary_article_id: string;
}> {
  const { actorPrincipalId, body, inboxItem } = params;
  const actor = { principalId: actorPrincipalId };
  const now = new Date().toISOString();
  const { primary_index, steps } = body;

  const stepArticleIds: string[] = [];
  const completed: CompletedStep[] = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      let parentArticleId: string | null = null;

      if (step.parent_step_index !== undefined) {
        const prior = stepArticleIds[step.parent_step_index];
        if (!prior) {
          throw new Error("Invalid parent_step_index");
        }
        parentArticleId = prior;
      } else if (
        step.parent_article_id != null &&
        step.parent_article_id !== ""
      ) {
        const p = await repos.articles.getById(step.parent_article_id);
        if (!p || p.kb_id !== inboxItem.kb_id) {
          throw new Error("Parent article not found");
        }
        parentArticleId = step.parent_article_id;
      }

      const md = inboxMarkdownFallback(step.content_markdown, inboxItem);

      let article: Article;
      if (step.update_article_id) {
        const existing = await repos.articles.getById(step.update_article_id);
        if (!existing || existing.kb_id !== inboxItem.kb_id) {
          throw new Error("Article not found");
        }
        const articlePatch: ArticleUpdateInput = {
          title: step.title,
        };
        if (md.length > 0) {
          articlePatch.content_markdown = md;
        }
        if (
          step.parent_step_index !== undefined ||
          (step.parent_article_id != null && step.parent_article_id !== "")
        ) {
          articlePatch.parent_article_id = parentArticleId;
        }
        if (step.status !== undefined) {
          articlePatch.status = step.status;
        }
        const updated = await repos.articles.update(
          step.update_article_id,
          articlePatch,
          step.tag_ids,
          actor
        );
        if (!updated) {
          throw new Error("Article update failed");
        }
        article = updated;
      } else {
        article = await repos.articles.create(
          {
            kb_id: inboxItem.kb_id,
            title: step.title,
            slug: slugFromTitle(step.title),
            status: step.status ?? "draft",
            parent_article_id: parentArticleId,
            content_json: null,
            content_markdown: md || null,
            summary: null,
            questions_answered: [],
            original_document_url: inboxItem.source_url,
            original_document_name: null,
            sort_order: 0,
          },
          step.tag_ids,
          actor
        );
      }

      stepArticleIds[i] = article.id;

      await repos.source_references.create({
        article_id: article.id,
        faq_id: null,
        inbox_item_id: inboxItem.id,
        excerpt: null,
        locator: null,
        source_url: inboxItem.source_url,
        original_storage_path: inboxItem.original_storage_path,
      });

      completed.push({
        articleId: article.id,
        created: !step.update_article_id,
      });

      // Article create/update emits `knowledge-base.article.{verb}`; the
      // SDK declarative re-index binding refreshes the embedding chunks.
    }

    const primaryArticleId = stepArticleIds[primary_index];
    if (!primaryArticleId) {
      throw new Error("primary_index invalid");
    }

    const inbox = await repos.inbox.update(inboxItem.id, {
      status: "promoted",
      promoted_article_id: primaryArticleId,
      promoted_faq_id: null,
      processed_at: now,
    });
    if (!inbox) {
      throw new Error("Inbox update failed");
    }

    const articles: Article[] = [];
    for (const id of stepArticleIds) {
      const a = await repos.articles.getById(id);
      if (a) {
        articles.push(a);
      }
    }

    await repos.activity_log.append({
      kb_id: inboxItem.kb_id,
      event_type: "inbox.promote_batch",
      payload: {
        inbox_id: inboxItem.id,
        article_ids: stepArticleIds,
        primary_article_id: primaryArticleId,
      },
      actor_id: actorPrincipalId,
    });

    return {
      articles,
      inbox,
      primary_article_id: primaryArticleId,
    };
  } catch (e) {
    await rollbackPromoteBatch(repos, inboxItem.id, completed);
    throw e;
  }
}
