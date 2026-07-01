import { kbSourceIngestConfigSchema } from "../schema/sources.js";
import type {
  KbSource,
  KbSourceItem,
  KbSourceItemLink,
  KbSourceItemMedia,
  KbSourceItemSection,
  KbSourceRun,
} from "../schema/types.js";

function objectOrEmpty(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function parseIngestConfig(raw: unknown): KbSource["ingest_config"] {
  const parsed = kbSourceIngestConfigSchema.safeParse(
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  );
  return parsed.success ? parsed.data : kbSourceIngestConfigSchema.parse({});
}

export function rowToSource(row: Record<string, unknown>): KbSource {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    adapter_id: row.adapter_id as KbSource["adapter_id"],
    name: String(row.name),
    settings: objectOrEmpty(row.settings),
    ingest_config: parseIngestConfig(row.ingest_config),
    schedule: objectOrEmpty(row.schedule) as KbSource["schedule"],
    enabled: Boolean(row.enabled),
    status: row.status as KbSource["status"],
    missing_item_strategy:
      row.missing_item_strategy as KbSource["missing_item_strategy"],
    webhook_token_hash: row.webhook_token_hash
      ? String(row.webhook_token_hash)
      : null,
    last_run_at: row.last_run_at ? String(row.last_run_at) : null,
    last_run_status: row.last_run_status
      ? (row.last_run_status as KbSource["last_run_status"])
      : null,
    last_error: row.last_error ? String(row.last_error) : null,
    next_run_at: row.next_run_at ? String(row.next_run_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function rowToSourceItem(row: Record<string, unknown>): KbSourceItem {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    source_id: String(row.source_id),
    adapter_item_key: String(row.adapter_item_key),
    title: row.title ? String(row.title) : null,
    source_url: row.source_url ? String(row.source_url) : null,
    locator: row.locator ? String(row.locator) : null,
    metadata: objectOrEmpty(row.metadata),
    content_hash: row.content_hash ? String(row.content_hash) : null,
    status: row.status as KbSourceItem["status"],
    inbox_item_id: row.inbox_item_id ? String(row.inbox_item_id) : null,
    first_seen_at: String(row.first_seen_at),
    last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
    missing_since: row.missing_since ? String(row.missing_since) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function rowToSourceRun(row: Record<string, unknown>): KbSourceRun {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    source_id: String(row.source_id),
    trigger: row.trigger as KbSourceRun["trigger"],
    status: row.status as KbSourceRun["status"],
    created_items: Number(row.created_items ?? 0),
    updated_items: Number(row.updated_items ?? 0),
    skipped_items: Number(row.skipped_items ?? 0),
    error:
      row.error === null || row.error === undefined ? null : String(row.error),
    metadata: objectOrEmpty(row.metadata),
    started_at: String(row.started_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

export function rowToSourceItemSection(
  row: Record<string, unknown>
): KbSourceItemSection {
  return {
    id: String(row.id),
    source_item_id: String(row.source_item_id),
    kind: row.kind as KbSourceItemSection["kind"],
    title: row.title ? String(row.title) : null,
    locator: row.locator ? String(row.locator) : null,
    position: Number(row.position ?? 0),
    content: String(row.content ?? ""),
    metadata: objectOrEmpty(row.metadata),
    created_at: String(row.created_at),
  };
}

export function rowToSourceItemMedia(
  row: Record<string, unknown>
): KbSourceItemMedia {
  return {
    id: String(row.id),
    source_item_id: String(row.source_item_id),
    source_url: String(row.source_url),
    storage_object_key: row.storage_object_key
      ? String(row.storage_object_key)
      : null,
    media_type: row.media_type as KbSourceItemMedia["media_type"],
    content_type: row.content_type ? String(row.content_type) : null,
    title: row.title ? String(row.title) : null,
    description: row.description ? String(row.description) : null,
    alt_text: row.alt_text ? String(row.alt_text) : null,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
    content_hash: row.content_hash ? String(row.content_hash) : null,
    position: Number(row.position ?? 0),
    metadata: objectOrEmpty(row.metadata),
    download_status:
      row.download_status as KbSourceItemMedia["download_status"],
    created_at: String(row.created_at),
  };
}

export function rowToSourceItemLink(
  row: Record<string, unknown>
): KbSourceItemLink {
  return {
    id: String(row.id),
    source_item_id: String(row.source_item_id),
    href: String(row.href),
    normalized_href: String(row.normalized_href),
    link_type: row.link_type as KbSourceItemLink["link_type"],
    text: row.text ? String(row.text) : null,
    title: row.title ? String(row.title) : null,
    rel: row.rel ? String(row.rel) : null,
    position: Number(row.position ?? 0),
    metadata: objectOrEmpty(row.metadata),
    created_at: String(row.created_at),
  };
}
