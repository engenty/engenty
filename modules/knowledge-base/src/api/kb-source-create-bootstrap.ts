import type { KbRepoFactory } from "../dal/contracts.js";
import type { KbSource } from "../schema/types.js";

/**
 * After creating a `manual` KB source, add one inbox row + one source item for promote/fetch.
 */
export async function bootstrapManualSourceWithInbox(
  repos: KbRepoFactory,
  source: KbSource,
  settings: { body_markdown?: string; title?: string },
  actorPrincipalId: string | null
): Promise<void> {
  const title = settings.title?.trim() || source.name.trim() || "Manual entry";
  const md = settings.body_markdown?.trim() || "";
  const inbox = await repos.inbox.create(
    {
      kb_id: source.kb_id,
      metadata: {
        kb_manual_source: true,
        kb_source_id: source.id,
      },
      original_storage_path: null,
      raw_markdown: md.length > 0 ? md : null,
      raw_text: null,
      source_type: "paste",
      source_url: null,
      title,
    },
    actorPrincipalId
  );
  const now = new Date().toISOString();
  await repos.sources.upsertSourceItem({
    adapter_item_key: "manual:primary",
    content_hash: null,
    inbox_item_id: inbox.id,
    kb_id: source.kb_id,
    last_seen_at: now,
    locator: null,
    metadata: { kb_manual_source: true },
    missing_since: null,
    source_id: source.id,
    source_url: null,
    status: "active",
    title,
  });
}

/**
 * After creating a `file_upload` KB source, add inbox + item pointing at the vault object.
 */
export async function bootstrapFileUploadSourceWithInbox(
  repos: KbRepoFactory,
  source: KbSource,
  settings: { original_filename?: string; storage_object_key?: string },
  actorPrincipalId: string | null
): Promise<void> {
  const key = settings.storage_object_key?.trim();
  if (!key) {
    throw new Error("storage_object_key is required for file_upload sources");
  }
  const title =
    settings.original_filename?.trim() || source.name.trim() || "File upload";
  const inbox = await repos.inbox.create(
    {
      kb_id: source.kb_id,
      metadata: {
        kb_file_upload_source: true,
        kb_source_id: source.id,
        storage_object_key: key,
      },
      original_storage_path: key,
      raw_markdown: null,
      raw_text: null,
      source_type: "file",
      source_url: null,
      title,
    },
    actorPrincipalId
  );
  const now = new Date().toISOString();
  await repos.sources.upsertSourceItem({
    adapter_item_key: "file:primary",
    content_hash: null,
    inbox_item_id: inbox.id,
    kb_id: source.kb_id,
    last_seen_at: now,
    locator: null,
    metadata: { storage_object_key: key },
    missing_since: null,
    source_id: source.id,
    source_url: null,
    status: "active",
    title,
  });
}
