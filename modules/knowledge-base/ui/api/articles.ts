/**
 * Knowledge Base — UI API client.
 */

import {
  getApiBaseUrl,
  getCurrentAccessToken,
  requestApiJson,
} from "@engenty/api-client";
import type {
  Article,
  ArticleComment,
  Attachment,
  KbVersionDetail,
  KbVersionSummary,
  PaginatedResponse,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Articles ── */

export interface ArticlesQuery {
  category_id?: string;
  kb_id: string;
  page?: number;
  page_size?: number;
  parent_article_id?: string;
  search?: string;
  search_fts?: boolean;
  sort_by?: string;
  sort_order?: string;
  status?: string;
  template_property_filters?: Record<string, string | number | null>;
  top_level_only?: boolean;
}

export interface KbArticleSuggestHit {
  headline: string;
  id: string;
  kb_id: string;
  rank: number;
  title: string;
}

export async function listArticles(
  query: ArticlesQuery,
  signal?: AbortSignal
): Promise<PaginatedResponse<Article>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) {
      if (k === "template_property_filters" && typeof v === "object") {
        for (const [propKey, propValue] of Object.entries(
          v as Record<string, string | number | null>
        )) {
          if (propValue !== undefined) {
            params.set(`property.${propKey}`, String(propValue ?? ""));
          }
        }
        continue;
      }
      params.set(k, String(v));
    }
  }
  return requestApiJson<PaginatedResponse<Article>>(
    `${API}/articles?${params}`,
    { method: "GET", signal }
  );
}

export async function getArticle(
  id: string,
  signal?: AbortSignal
): Promise<
  Article & { attachments?: Attachment[]; source_references?: unknown[] }
> {
  return requestApiJson<
    Article & { attachments?: Attachment[]; source_references?: unknown[] }
  >(`${API}/articles/${id}`, { method: "GET", signal });
}

export async function listArticleVersions(
  articleId: string,
  signal?: AbortSignal
): Promise<KbVersionSummary[]> {
  return requestApiJson<KbVersionSummary[]>(
    `${API}/articles/${articleId}/versions`,
    { method: "GET", signal }
  );
}

export async function getArticleVersion(
  articleId: string,
  version: number,
  signal?: AbortSignal
): Promise<KbVersionDetail> {
  return requestApiJson<KbVersionDetail>(
    `${API}/articles/${articleId}/versions/${version}`,
    { method: "GET", signal }
  );
}

export async function createArticle(
  input: Record<string, unknown>
): Promise<Article> {
  return requestApiJson<Article>(`${API}/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateArticle(
  id: string,
  input: Record<string, unknown>
): Promise<Article> {
  return requestApiJson<Article>(`${API}/articles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function refreshArticleMetadata(id: string): Promise<Article> {
  return requestApiJson<Article>(`${API}/articles/${id}/refresh-metadata`, {
    method: "POST",
  });
}

export async function listArticleComments(
  articleId: string,
  signal?: AbortSignal
): Promise<ArticleComment[]> {
  return requestApiJson<ArticleComment[]>(
    `${API}/articles/${articleId}/comments`,
    { method: "GET", signal }
  );
}

export async function fetchArticleCommentCounts(
  articleIds: string[],
  signal?: AbortSignal
): Promise<Record<string, number>> {
  const ids = [...new Set(articleIds.filter(Boolean))];
  if (ids.length === 0) {
    return {};
  }
  const params = new URLSearchParams({ ids: ids.join(",") });
  return requestApiJson<Record<string, number>>(
    `${API}/articles/comment-counts?${params}`,
    { method: "GET", signal }
  );
}

export async function createArticleComment(
  articleId: string,
  content: string
): Promise<ArticleComment> {
  return requestApiJson<ArticleComment>(
    `${API}/articles/${articleId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
}

export async function updateArticleComment(
  commentId: string,
  content: string
): Promise<ArticleComment> {
  return requestApiJson<ArticleComment>(
    `${API}/article-comments/${commentId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
}

export async function deleteArticleComment(commentId: string): Promise<void> {
  await requestApiJson<void>(`${API}/article-comments/${commentId}`, {
    method: "DELETE",
  });
}

export async function generateArticleSummary(input: {
  title: string;
  content_markdown: string;
}): Promise<{ summary: string }> {
  return requestApiJson<{ summary: string }>(
    `${API}/articles/generate-summary`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteArticle(id: string): Promise<void> {
  await requestApiJson(`${API}/articles/${id}`, { method: "DELETE" });
}

/**
 * Downloads article PDF from {@link GET /api/kb/articles/:id/export.pdf}.
 * Requires `GOTENBERG_URL` on the API host.
 */
export async function downloadArticlePdf(
  articleId: string,
  filename: string,
  signal?: AbortSignal
): Promise<void> {
  const token = (await getCurrentAccessToken())?.trim() ?? "";
  const path = `${API}/articles/${encodeURIComponent(articleId)}/export.pdf`;
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    signal,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (ct.includes("json")) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (body?.message) {
        message = body.message;
      } else if (body?.error) {
        message = body.error;
      }
    } else {
      const text = await res.text().catch(() => "");
      if (text) {
        message = text.slice(0, 400);
      }
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
