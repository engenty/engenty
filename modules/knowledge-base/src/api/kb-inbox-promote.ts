/**
 * Promote an inbox item to a KB article or FAQ with provenance rows.
 */

import type { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";
import type { inboxPromoteSchema } from "../schema/inbox.js";
import type {
  Article,
  ArticleUpdateInput,
  Faq,
  InboxItem,
} from "../schema/types.js";

export function slugFromTitle(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return s.length > 0 ? s : "article";
}

export type InboxPromoteBody = z.infer<typeof inboxPromoteSchema>;

export async function executeInboxPromote(
  repos: KbRepoFactory,
  params: {
    actorPrincipalId: string;
    body: InboxPromoteBody;
    inboxItem: InboxItem;
  }
): Promise<{ article?: Article; faq?: Faq; inbox: InboxItem }> {
  const { actorPrincipalId, body, inboxItem } = params;
  const actor = { principalId: actorPrincipalId };
  const now = new Date().toISOString();
  const md =
    body.content_markdown ?? inboxItem.raw_markdown ?? inboxItem.raw_text ?? "";

  if (body.target === "article") {
    let article: Article;
    if (body.article_id) {
      const articlePatch: ArticleUpdateInput = {};
      if (body.title !== undefined) {
        articlePatch.title = body.title;
      }
      if (md.length > 0) {
        articlePatch.content_markdown = md;
      }
      if (body.parent_article_id !== undefined) {
        articlePatch.parent_article_id = body.parent_article_id;
      }
      if (body.status !== undefined) {
        articlePatch.status = body.status;
      }
      const updated = await repos.articles.update(
        body.article_id,
        articlePatch,
        body.tag_ids,
        actor
      );
      if (!updated) {
        throw new Error("Article not found");
      }
      article = updated;
    } else {
      const title = body.title ?? inboxItem.title;
      article = await repos.articles.create(
        {
          kb_id: inboxItem.kb_id,
          title,
          slug: slugFromTitle(title),
          status: body.status ?? "draft",
          parent_article_id: body.parent_article_id ?? null,
          content_json: null,
          content_markdown: md || null,
          summary: null,
          questions_answered: [],
          original_document_url: inboxItem.source_url,
          original_document_name: null,
          sort_order: 0,
        },
        body.tag_ids,
        actor
      );
    }

    await repos.source_references.create({
      article_id: article.id,
      faq_id: null,
      inbox_item_id: inboxItem.id,
      excerpt: null,
      locator: null,
      source_url: inboxItem.source_url,
      original_storage_path: inboxItem.original_storage_path,
    });

    const inbox = await repos.inbox.update(inboxItem.id, {
      status: "promoted",
      promoted_article_id: article.id,
      promoted_faq_id: null,
      processed_at: now,
    });
    if (!inbox) {
      throw new Error("Inbox update failed");
    }

    await repos.activity_log.append({
      kb_id: inboxItem.kb_id,
      event_type: "inbox.promote",
      payload: {
        inbox_id: inboxItem.id,
        article_id: article.id,
        target: "article",
      },
      actor_id: actorPrincipalId,
    });

    // Article create/update emits `knowledge-base.article.{verb}`; the SDK
    // declarative re-index binding refreshes the embedding chunks.
    return { article, inbox };
  }

  /* FAQ target */
  const question = body.question ?? body.title ?? inboxItem.title;
  if (!question.trim()) {
    throw new Error("FAQ question is required");
  }

  let faq: Faq;
  if (body.faq_id) {
    const updated = await repos.faqs.update(
      body.faq_id,
      {
        question,
        answer_markdown: md || null,
        status: body.status ?? "draft",
      },
      body.tag_ids,
      actorPrincipalId ? { principalId: actorPrincipalId } : null
    );
    if (!updated) {
      throw new Error("FAQ not found");
    }
    faq = updated;
  } else {
    faq = await repos.faqs.create(
      {
        kb_id: inboxItem.kb_id,
        question,
        answer_json: null,
        answer_markdown: md || null,
        sort_order: 0,
        status: body.status ?? "draft",
      },
      body.tag_ids,
      actorPrincipalId ? { principalId: actorPrincipalId } : null
    );
  }

  await repos.source_references.create({
    article_id: null,
    faq_id: faq.id,
    inbox_item_id: inboxItem.id,
    excerpt: null,
    locator: null,
    source_url: inboxItem.source_url,
    original_storage_path: inboxItem.original_storage_path,
  });

  const inbox = await repos.inbox.update(inboxItem.id, {
    status: "promoted",
    promoted_faq_id: faq.id,
    promoted_article_id: null,
    processed_at: now,
  });
  if (!inbox) {
    throw new Error("Inbox update failed");
  }

  await repos.activity_log.append({
    kb_id: inboxItem.kb_id,
    event_type: "inbox.promote",
    payload: {
      inbox_id: inboxItem.id,
      faq_id: faq.id,
      target: "faq",
    },
    actor_id: actorPrincipalId,
  });

  return { faq, inbox };
}
