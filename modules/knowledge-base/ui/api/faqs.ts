/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type {
  Article,
  Faq,
  KbVersionDetail,
  KbVersionSummary,
  PaginatedResponse,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── FAQs ── */

export interface FaqsQuery {
  kb_id: string;
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status?: "draft" | "published" | "archived";
}

export async function listFaqs(
  query: FaqsQuery,
  signal?: AbortSignal
): Promise<PaginatedResponse<Faq>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) {
      params.set(k, String(v));
    }
  }
  return requestApiJson<PaginatedResponse<Faq>>(`${API}/faqs?${params}`, {
    method: "GET",
    signal,
  });
}

export async function getFaq(id: string, signal?: AbortSignal): Promise<Faq> {
  return requestApiJson<Faq>(`${API}/faqs/${id}`, {
    method: "GET",
    signal,
  });
}

export async function listFaqVersions(
  faqId: string,
  signal?: AbortSignal
): Promise<KbVersionSummary[]> {
  return requestApiJson<KbVersionSummary[]>(`${API}/faqs/${faqId}/versions`, {
    method: "GET",
    signal,
  });
}

export async function restoreArticleVersion(
  articleId: string,
  version: number
): Promise<Article> {
  return requestApiJson<Article>(
    `${API}/articles/${articleId}/versions/${version}/restore`,
    { method: "POST" }
  );
}

export async function getFaqVersion(
  faqId: string,
  version: number,
  signal?: AbortSignal
): Promise<KbVersionDetail> {
  return requestApiJson<KbVersionDetail>(
    `${API}/faqs/${faqId}/versions/${version}`,
    { method: "GET", signal }
  );
}

export async function createFaq(input: Record<string, unknown>): Promise<Faq> {
  return requestApiJson<Faq>(`${API}/faqs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateFaq(
  id: string,
  input: Record<string, unknown>
): Promise<Faq> {
  return requestApiJson<Faq>(`${API}/faqs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteFaq(id: string): Promise<void> {
  await requestApiJson(`${API}/faqs/${id}`, { method: "DELETE" });
}
