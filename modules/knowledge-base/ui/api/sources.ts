/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import type {
  KbCover,
  KbSource,
  KbSourceAdapterId,
  KbSourceItem,
  KbSourceItemLink,
  KbSourceItemMedia,
  KbSourceItemSection,
  KbSourceItemStatus,
  KbSourceRun,
  KbSourceStatus,
  KbTemplateBindingMode,
  KbTemplateContentMode,
  PaginatedResponse,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Dynamic Sources ── */

export interface KbSourceAdapterDescriptor {
  id: KbSourceAdapterId;
  index_mode: "none" | "review" | "single";
  label: string;
  missing_item_strategies: string[];
  schedule_default_minutes: number | null;
  settings_fields: Array<{
    control_only?: boolean;
    default_value?: string | number | boolean;
    description?: string;
    key: string;
    label: string;
    options?: Array<{ label: string; value: string }>;
    required?: boolean;
    row_layout?: "stack" | "inline_end";
    type: "text" | "url" | "number" | "boolean" | "select" | "textarea";
  }>;
}

export interface KbSourcesListQuery {
  kb_id: string;
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status?: string;
}

function toSearchParams(query: object): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
}

export async function listSourceAdapters(
  signal?: AbortSignal
): Promise<KbSourceAdapterDescriptor[]> {
  return requestApiJson<KbSourceAdapterDescriptor[]>(`${API}/source-adapters`, {
    method: "GET",
    signal,
  });
}

export async function listKbSources(
  query: KbSourcesListQuery,
  signal?: AbortSignal
): Promise<PaginatedResponse<KbSource>> {
  const params = toSearchParams(query);
  return requestApiJson<PaginatedResponse<KbSource>>(
    `${API}/sources?${params}`,
    {
      method: "GET",
      signal,
    }
  );
}

export async function createKbSource(input: {
  adapter_id: KbSourceAdapterId;
  enabled?: boolean;
  ignored_item_keys?: string[];
  initial_index_entries?: KbSourceIndexEntry[];
  kb_id: string;
  missing_item_strategy?: string;
  name: string;
  schedule?: Record<string, unknown>;
  settings: Record<string, unknown>;
  status?: KbSourceStatus;
}): Promise<{ data: KbSource }> {
  return requestApiJson<{ data: KbSource }>(`${API}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getKbSource(
  id: string,
  signal?: AbortSignal
): Promise<{ data: KbSource; runs: KbSourceRun[] }> {
  return requestApiJson<{ data: KbSource; runs: KbSourceRun[] }>(
    `${API}/sources/${id}`,
    { method: "GET", signal }
  );
}

export async function getKbSourceItem(
  itemId: string,
  signal?: AbortSignal
): Promise<{
  item: KbSourceItem;
  links: KbSourceItemLink[];
  media: KbSourceItemMedia[];
  sections: KbSourceItemSection[];
  source: KbSource;
}> {
  return requestApiJson<{
    item: KbSourceItem;
    links: KbSourceItemLink[];
    media: KbSourceItemMedia[];
    sections: KbSourceItemSection[];
    source: KbSource;
  }>(`${API}/source-items/${encodeURIComponent(itemId)}`, {
    method: "GET",
    signal,
  });
}

export interface KbFileUploadInfo {
  filename: string;
  key: string;
  size_bytes: number;
}

interface KbSignedUploadResponse {
  bucket: string;
  headers: Record<string, string>;
  key: string;
  url: string;
}

async function requestKbSignedUploadUrl(input: {
  contentType: string;
  key: string;
}): Promise<KbSignedUploadResponse> {
  return requestApiJson<KbSignedUploadResponse>(
    "/api/file-storage/files/signed-upload-url",
    {
      method: "POST",
      body: JSON.stringify({ content_type: input.contentType, key: input.key }),
    }
  );
}

async function putKbSignedUpload(
  signed: KbSignedUploadResponse,
  file: Blob,
  contentType: string
): Promise<void> {
  const headers = new Headers(signed.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  const response = await fetch(signed.url, {
    body: file,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `signed_upload_failed_${response.status}`);
  }
}

/** Largest single KB file accepted by the signed-upload PUT. Mirrors `files-ui`. */
export const KB_FILE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export interface UploadKbVaultFileOptions {
  /** Knowledge base slug (or id when slug is unavailable). Becomes the third path segment. */
  kbSlug: string;
  /** Optional sub-folder under the KB root, e.g. `covers`. */
  subPath?: string;
  /** Engenty tenant id used to build the storage key prefix. */
  tenantId: string;
}

/** Build the canonical KB storage key: `tenants/<tid>/knowledge-base/<slug>/[<sub>/]<ts>_<safeName>`. */
export function buildKbVaultFileKey(input: {
  filename: string;
  kbSlug: string;
  subPath?: string;
  tenantId: string;
  /** Override the timestamp segment in tests; defaults to `Date.now()`. */
  timestamp?: number;
}): string {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamped = `${input.timestamp ?? Date.now()}_${safeName}`;
  const slug = input.kbSlug.trim();
  if (!slug) {
    throw new Error("kb_slug_required");
  }
  const sub = input.subPath?.replace(/^\/+|\/+$/g, "");
  const tail = sub ? `${sub}/${stamped}` : stamped;
  return `tenants/${input.tenantId}/knowledge-base/${slug}/${tail}`;
}

function resolveKbUploadContentType(file: File, safeName: string): string {
  const rawType = file.type?.trim() ?? "";
  if (
    !rawType ||
    rawType === "application/octet-stream" ||
    rawType === "application/x-download"
  ) {
    return guessFileStorageMimeFromFilename(safeName);
  }
  return rawType;
}

/**
 * Browser-direct KB upload: requests a signed URL from core, PUTs the bytes,
 * and returns the canonical tenant-scoped key. Replaces the legacy multipart POST.
 */
export async function uploadKbVaultFile(
  file: File,
  opts: UploadKbVaultFileOptions
): Promise<KbFileUploadInfo> {
  if (!opts.tenantId) {
    throw new Error("upload_tenant_required");
  }
  if (!opts.kbSlug?.trim()) {
    throw new Error("kb_slug_required");
  }
  if (file.size > KB_FILE_UPLOAD_MAX_BYTES) {
    throw new Error("upload_too_large");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = resolveKbUploadContentType(file, safeName);
  const key = buildKbVaultFileKey({
    filename: file.name,
    kbSlug: opts.kbSlug,
    subPath: opts.subPath,
    tenantId: opts.tenantId,
  });

  const signed = await requestKbSignedUploadUrl({ contentType, key });
  await putKbSignedUpload(signed, file, contentType);

  return {
    filename: file.name,
    key: signed.key,
    size_bytes: file.size,
  };
}

export interface KbUnsplashCoverPhoto {
  id: string;
  links: { html: string };
  urls: { regular: string; small: string; thumb: string };
  user: { links: { html: string }; name: string };
}

export async function searchKbCoverUnsplash(
  q: string,
  opts?: { page?: number; signal?: AbortSignal }
): Promise<{ photos: KbUnsplashCoverPhoto[] }> {
  const params = new URLSearchParams({ q: q.trim() });
  if (opts?.page != null) {
    params.set("page", String(opts.page));
  }
  return requestApiJson<{ photos: KbUnsplashCoverPhoto[] }>(
    `${API}/cover/unsplash/search?${params}`,
    { method: "GET", signal: opts?.signal }
  );
}

export async function importKbCoverUnsplash(
  kbId: string,
  photoId: string
): Promise<{ key: string; cover: KbCover }> {
  return requestApiJson<{ key: string; cover: KbCover }>(
    `${API}/cover/unsplash/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kb_id: kbId, photo_id: photoId }),
    }
  );
}

export async function generateKbCoverAi(input: {
  kb_id: string;
  mode: "generate" | "edit";
  prompt: string;
  reference_object_key?: string;
}): Promise<{ key: string; cover: KbCover }> {
  return requestApiJson<{ key: string; cover: KbCover }>(`${API}/cover/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kb_id: input.kb_id,
      prompt: input.prompt,
      mode: input.mode,
      reference_object_key: input.reference_object_key,
    }),
  });
}

export async function updateKbSource(
  id: string,
  input: Record<string, unknown>
): Promise<KbSource> {
  return requestApiJson<KbSource>(`${API}/sources/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteKbSource(id: string): Promise<void> {
  await requestApiJson(`${API}/sources/${id}`, { method: "DELETE" });
}

export interface RunKbSourceNowOptions {
  background?: boolean;
  force?: boolean;
  retrieve_images?: boolean;
  selected_item_keys?: string[];
  trigger?: "manual" | "schedule" | "webhook";
}

export async function runKbSourceNow(
  id: string,
  opts?: RunKbSourceNowOptions
): Promise<{
  run: KbSourceRun;
  source: KbSource;
}> {
  return requestApiJson<{ run: KbSourceRun; source: KbSource }>(
    `${API}/sources/${id}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force: opts?.force ?? false,
        background: opts?.background ?? false,
        retrieve_images: opts?.retrieve_images ?? false,
        selected_item_keys: opts?.selected_item_keys,
        trigger: opts?.trigger ?? "manual",
      }),
    }
  );
}

export async function stopKbSourceRun(
  sourceId: string,
  runId: string
): Promise<{
  run: KbSourceRun;
  source: KbSource;
}> {
  return requestApiJson<{ run: KbSourceRun; source: KbSource }>(
    `${API}/sources/${sourceId}/runs/${runId}/stop`,
    { method: "POST" }
  );
}

export interface KbSourceIndexEntry {
  item_key: string;
  locator?: string | null;
  metadata?: Record<string, unknown>;
  source_url: string;
  title?: string | null;
}

export async function listKbSourceIndex(
  sourceId: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<{ entries: KbSourceIndexEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.limit != null) {
    params.set("limit", String(opts.limit));
  }
  return requestApiJson<{ entries: KbSourceIndexEntry[]; total: number }>(
    `${API}/sources/${sourceId}/index${params.toString() ? `?${params}` : ""}`,
    { method: "GET", signal: opts?.signal }
  );
}

export async function previewKbSourceIndex(input: {
  adapter_id: KbSourceAdapterId;
  name?: string;
  settings: Record<string, unknown>;
}): Promise<{
  entries: KbSourceIndexEntry[];
  index_mode: KbSourceAdapterDescriptor["index_mode"];
  total: number;
}> {
  return requestApiJson<{
    entries: KbSourceIndexEntry[];
    index_mode: KbSourceAdapterDescriptor["index_mode"];
    total: number;
  }>(`${API}/source-adapters/${input.adapter_id}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      settings: input.settings,
    }),
  });
}

export type KbSourceIngestStrategy = "articles" | "summary" | "agentic";

export interface IngestKbSourceOptions {
  category_id?: string | null;
  content_mode?: KbTemplateContentMode;
  instructions?: string;
  item_ids?: string[];
  parent_article_id?: string;
  strategy: KbSourceIngestStrategy;
  template_id?: string | null;
  template_mode?: KbTemplateBindingMode;
}

export interface IngestKbSourceResult {
  article_ids: string[];
  /** True when the agentic run was fired in the background — ingested_items/article_ids are not yet final. */
  async_run?: boolean;
  ingested_items: number;
  strategy: KbSourceIngestStrategy;
  task_id?: string;
}

export async function ingestKbSource(
  sourceId: string,
  options: IngestKbSourceOptions
): Promise<IngestKbSourceResult> {
  return requestApiJson<IngestKbSourceResult>(
    `${API}/sources/${sourceId}/ingest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    }
  );
}

export async function clearKbSourceRuns(id: string): Promise<void> {
  await requestApiJson<{ ok: true }>(`${API}/sources/${id}/runs`, {
    method: "DELETE",
  });
}

export async function rotateKbSourceWebhookToken(
  id: string
): Promise<{ data: KbSource; webhook_token: string }> {
  return requestApiJson<{ data: KbSource; webhook_token: string }>(
    `${API}/sources/${id}/rotate-webhook-token`,
    { method: "POST" }
  );
}

export async function listKbSourceItems(
  sourceId: string,
  query: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
  },
  signal?: AbortSignal
): Promise<PaginatedResponse<KbSourceItem>> {
  const params = toSearchParams(query);
  return requestApiJson<PaginatedResponse<KbSourceItem>>(
    `${API}/sources/${sourceId}/items?${params}`,
    { method: "GET", signal }
  );
}

export async function updateKbSourceItemStatus(
  sourceId: string,
  itemId: string,
  status: KbSourceItemStatus
): Promise<KbSourceItem> {
  return requestApiJson<KbSourceItem>(
    `${API}/sources/${sourceId}/items/${itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
}

export async function deleteKbSourceItem(
  sourceId: string,
  itemId: string
): Promise<{ ok: boolean }> {
  return requestApiJson<{ ok: boolean }>(
    `${API}/sources/${sourceId}/items/${itemId}`,
    { method: "DELETE" }
  );
}
