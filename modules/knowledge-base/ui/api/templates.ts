/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import { isApiSuccess } from "@engenty/api-contracts";
import type { KbArticleTemplate } from "../../src/schema/types.js";

const API = "/api/kb";

function normalizeKbTemplateResponse(body: unknown): KbArticleTemplate {
  if (isApiSuccess(body)) {
    return body.data as KbArticleTemplate;
  }
  if (body && typeof body === "object" && "data" in body) {
    const nested = (body as { data: unknown }).data;
    if (nested && typeof nested === "object") {
      return nested as KbArticleTemplate;
    }
  }
  return body as KbArticleTemplate;
}

/* ── Templates ── */

export async function listKbTemplates(
  kbId: string,
  signal?: AbortSignal
): Promise<KbArticleTemplate[]> {
  return requestApiJson<KbArticleTemplate[]>(
    `${API}/templates?kb_id=${encodeURIComponent(kbId)}`,
    { method: "GET", signal }
  );
}

export async function getKbTemplate(
  id: string,
  signal?: AbortSignal
): Promise<KbArticleTemplate> {
  const templateId = id.trim();
  if (!templateId) {
    throw new Error("Template id is required");
  }
  const body = await requestApiJson<unknown>(
    `${API}/templates/${encodeURIComponent(templateId)}`,
    { method: "GET", signal }
  );
  return normalizeKbTemplateResponse(body);
}

export async function createKbTemplate(
  input: Pick<
    KbArticleTemplate,
    | "content_json"
    | "content_markdown"
    | "description"
    | "kb_id"
    | "name"
    | "property_definitions"
  >
): Promise<KbArticleTemplate> {
  const kbId = input.kb_id?.trim();
  if (!kbId) {
    throw new Error("Knowledge base id is required");
  }
  const body = await requestApiJson<unknown>(`${API}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, kb_id: kbId }),
  });
  const template = normalizeKbTemplateResponse(body);
  if (!template.id?.trim()) {
    throw new Error("Template create response did not include an id");
  }
  return template;
}

export async function updateKbTemplate(
  id: string,
  input: Partial<
    Pick<
      KbArticleTemplate,
      | "content_json"
      | "content_markdown"
      | "description"
      | "name"
      | "property_definitions"
    >
  >
): Promise<KbArticleTemplate> {
  const templateId = id.trim();
  if (!templateId) {
    throw new Error("Template id is required");
  }
  return requestApiJson<KbArticleTemplate>(
    `${API}/templates/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteKbTemplate(id: string): Promise<void> {
  const templateId = id.trim();
  if (!templateId) {
    throw new Error("Template id is required");
  }
  await requestApiJson(`${API}/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
  });
}
