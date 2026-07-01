import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { ArticleComment } from "../schema/types.js";
import type { ArticleCommentRepo } from "./contracts.js";
import { SCHEMA } from "./shared.js";

export async function countCommentsByArticleIds(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  articleIds: string[]
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(articleIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("article_comments")
    .select("article_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("article_id", uniqueIds);
  if (error) {
    throw new Error(`Failed to count comments: ${error.message}`);
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const articleId = String((row as { article_id: string }).article_id);
    counts.set(articleId, (counts.get(articleId) ?? 0) + 1);
  }
  return counts;
}

function rowToComment(row: Record<string, unknown>): ArticleComment {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    article_id: String(row.article_id),
    content: String(row.content),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createArticleCommentRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): ArticleCommentRepo {
  const comments = () => supabase.schema(SCHEMA).from("article_comments");

  return {
    async countByArticle(articleId: string): Promise<number> {
      const { count, error } = await comments()
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("article_id", articleId);
      if (error) {
        throw new Error(`Failed to count comments: ${error.message}`);
      }
      return count ?? 0;
    },

    async countByArticleIds(
      articleIds: string[]
    ): Promise<Map<string, number>> {
      return countCommentsByArticleIds(supabase, tenantId, scopeId, articleIds);
    },

    async create(
      articleId: string,
      content: string,
      createdBy: string | null
    ): Promise<ArticleComment> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await comments()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          article_id: articleId,
          content,
          created_by: createdBy,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create comment: ${error.message}`);
      }
      return rowToComment(data as Record<string, unknown>);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await comments()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      return !error;
    },

    async getById(id: string): Promise<ArticleComment | null> {
      const { data, error } = await comments()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToComment(data as Record<string, unknown>);
    },

    async listByArticle(articleId: string): Promise<ArticleComment[]> {
      const { data, error } = await comments()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("article_id", articleId)
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to list comments: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToComment(row as Record<string, unknown>)
      );
    },

    async update(id: string, content: string): Promise<ArticleComment | null> {
      const { data, error } = await comments()
        .update({
          content,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToComment(data as Record<string, unknown>);
    },
  };
}
