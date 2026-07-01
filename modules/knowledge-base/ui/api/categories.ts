/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type {
  KbCategory,
  KbCategoryPageSettings,
  KbCategoryViewType,
  KbCommentsModeBinding,
  KbCover,
  KbTemplateBindingMode,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Categories ── */

// Folder layer above articles. Every KB has a seeded `general` row that the
// API resolves automatically when an article is created without an explicit
// category_id.
export async function listCategories(
  kbId: string,
  signal?: AbortSignal
): Promise<KbCategory[]> {
  return requestApiJson<KbCategory[]>(
    `${API}/categories?kb_id=${encodeURIComponent(kbId)}`,
    { method: "GET", signal }
  );
}

export async function createCategory(input: {
  description?: string | null;
  kb_id: string;
  name: string;
  parent_id?: string | null;
  slug: string;
  sort_order?: number;
  view_type?: KbCategoryViewType;
  comments_mode?: KbCommentsModeBinding;
  template_mode?: KbTemplateBindingMode;
  template_id?: string | null;
  page_settings?: KbCategoryPageSettings;
}): Promise<KbCategory> {
  return requestApiJson<KbCategory>(`${API}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface UpdateCategoryInput {
  comments_mode?: KbCategory["comments_mode"];
  cover?: KbCover | null;
  description?: string | null;
  intro_json?: Record<string, unknown> | null;
  intro_markdown?: string | null;
  name?: string;
  outro_json?: Record<string, unknown> | null;
  outro_markdown?: string | null;
  page_settings?: KbCategoryPageSettings;
  parent_id?: string | null;
  slug?: string;
  sort_order?: number;
  template_id?: string | null;
  template_mode?: KbTemplateBindingMode;
  view_type?: KbCategoryViewType;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<KbCategory> {
  return requestApiJson<KbCategory>(`${API}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getCategory(
  id: string,
  signal?: AbortSignal
): Promise<KbCategory> {
  return requestApiJson<KbCategory>(`${API}/categories/${id}`, {
    method: "GET",
    signal,
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await requestApiJson(`${API}/categories/${id}`, { method: "DELETE" });
}
