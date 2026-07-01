import {
  assertSourceAdapterRunReady,
  computeDocumentSourceNextRunAt,
  type DocumentSourceAdapter,
  type DocumentSourceAdapterRegistry,
  type DocumentSourceIndexEntry,
  type DocumentSourceProbeMetadata,
  type DocumentSourceRetrievedItem,
  defaultDocumentSourceAdapterRegistry,
  hashDocumentSourceItemContent,
} from "@engenty/document-sources";
import type { StorageService } from "@engenty/plugin-sdk";
import { MDocument } from "@mastra/rag";
import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  InboxItem,
  KbSource,
  KbSourceItem,
  KbSourceMissingItemStrategy,
  KbSourceRun,
  KbSourceTrigger,
} from "../schema/types.js";
import {
  failureMetadataFromError,
  formatRunError,
  truncateRunError,
} from "./run-error-format.js";
import { mergeSitemapHtmlExtractIntoSettings } from "./sitemap-html-extract.js";
import { persistRetrievedStructure } from "./source-media-capture.js";
import {
  itemLogFromEntry,
  type KbSourceRunItemLog,
  resolveRunStatusFromItemLogs,
  summarizeRunItemLogs,
  truncateItemLogMessage,
} from "./source-run-item-log.js";

export interface RunKbSourceOptions {
  actorPrincipalId?: string | null;
  background?: boolean;
  force?: boolean;
  limit?: number;
  registry?: DocumentSourceAdapterRegistry;
  /** When provided, only index entries whose `item_key` is in this set are retrieved. */
  retrieve_images?: boolean;
  selected_item_keys?: string[];
  storageService?: StorageService | null;
  trigger?: KbSourceTrigger;
}

export interface RunKbSourceResult {
  run: KbSourceRun;
  source: KbSource;
}

async function updateRunProgress(
  repos: KbRepoFactory,
  runId: string,
  args: {
    createdItems: number;
    currentItemIndex: number;
    currentItemKey?: string | null;
    currentItemTitle?: string | null;
    itemLogs?: KbSourceRunItemLog[];
    phase: "indexing" | "retrieving";
    skippedItems: number;
    totalItems: number | null;
    updatedItems: number;
  }
): Promise<void> {
  await repos.sources.updateRun(runId, {
    created_items: args.createdItems,
    metadata: {
      current_item_index: args.currentItemIndex,
      current_item_key: args.currentItemKey ?? null,
      current_item_title: args.currentItemTitle ?? null,
      phase: args.phase,
      total_items: args.totalItems,
      ...(args.itemLogs ? { item_logs: args.itemLogs } : {}),
    },
    skipped_items: args.skippedItems,
    updated_items: args.updatedItems,
  });
}

async function getStoppedRun(
  repos: KbRepoFactory,
  runId: string
): Promise<KbSourceRun | null> {
  const current = await repos.sources.getRunById(runId);
  if (current && current.status !== "running") {
    return current;
  }
  return null;
}

async function runBoundedPhase<T>(
  phase: string,
  context: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const detail = formatRunError(error);
    const suffix = context ? ` (${context})` : "";
    // Do not attach `cause`: the message already embeds `detail`, and the runner
    // formats `cause` again — duplicate blobs (e.g. Zod issue JSON) confuse operators.
    throw new Error(`${phase}${suffix}: ${detail}`);
  }
}

function sourceItemNeverRetrieved(existing: KbSourceItem | null): boolean {
  return !existing?.content_hash;
}

function sourceItemHasStoredStructure(existing: KbSourceItem | null): boolean {
  if (!existing) {
    return false;
  }
  if (existing.inbox_item_id) {
    return true;
  }
  const sectionCount = existing.metadata.section_count;
  return typeof sectionCount === "number" && sectionCount > 0;
}

function probeMetadataToItemMetadata(
  base: Record<string, unknown>,
  metadata: DocumentSourceProbeMetadata | null
): Record<string, unknown> {
  return {
    ...base,
    probe_etag: metadata?.etag ?? null,
    probe_last_modified: metadata?.last_modified ?? null,
  };
}

async function upsertInboxForRetrievedItem(
  repos: KbRepoFactory,
  source: KbSource,
  existingItem: KbSourceItem | null,
  retrieved: DocumentSourceRetrievedItem,
  contentHash: string,
  actorPrincipalId?: string | null
): Promise<InboxItem> {
  let markdownText = retrieved.markdown;
  if (!markdownText && retrieved.raw_html) {
    const doc = MDocument.fromHTML(retrieved.raw_html);
    markdownText = doc.chunks[0]?.text ?? "";
  } else if (markdownText) {
    const doc = MDocument.fromMarkdown(markdownText);
    markdownText = doc.chunks[0]?.text ?? markdownText;
  }

  const baseMetadata = {
    ...(retrieved.metadata ?? {}),
    content_hash: contentHash,
    dynamic_source_adapter_id: source.adapter_id,
    dynamic_source_id: source.id,
    dynamic_source_item_key: retrieved.item_key,
    fetch_content_type: retrieved.content_type,
    fetch_final_url: retrieved.final_url,
    fetch_provider: retrieved.provider,
    raw_html: retrieved.raw_html ?? null,
  };

  if (existingItem?.inbox_item_id) {
    const inbox = await repos.inbox.getById(existingItem.inbox_item_id);
    if (inbox && inbox.status !== "promoted" && inbox.status !== "discarded") {
      const updated = await repos.inbox.update(inbox.id, {
        metadata: { ...inbox.metadata, ...baseMetadata },
        raw_markdown: markdownText,
        raw_text: retrieved.raw_html ?? inbox.raw_text ?? null,
        source_url: retrieved.final_url ?? retrieved.source_url,
        title: retrieved.title ?? inbox.title,
      });
      if (updated) {
        return updated;
      }
    }
  }

  return repos.inbox.create(
    {
      kb_id: source.kb_id,
      metadata: baseMetadata,
      original_storage_path: null,
      raw_markdown: markdownText,
      raw_text: retrieved.raw_html ?? null,
      source_type: "url",
      source_url: retrieved.final_url ?? retrieved.source_url,
      title: retrieved.title ?? source.name,
    },
    actorPrincipalId ?? null
  );
}

async function applyMissingStrategy(args: {
  item: KbSourceItem;
  repos: KbRepoFactory;
  strategy: KbSourceMissingItemStrategy;
}): Promise<void> {
  const { item, repos, strategy } = args;
  if (item.status === "ignored" || item.status === "deleted") {
    return;
  }
  if (strategy === "ignore") {
    return;
  }
  const missingSince = item.missing_since ?? new Date().toISOString();
  if (strategy === "mark_missing") {
    await repos.sources.upsertSourceItem({
      ...item,
      missing_since: missingSince,
      status: "missing",
    });
    return;
  }
  if (strategy === "set_draft") {
    await repos.sources.upsertSourceItem({
      ...item,
      missing_since: missingSince,
      status: "draft",
    });
    return;
  }
  await repos.sources.upsertSourceItem({
    ...item,
    missing_since: missingSince,
    status: "deleted",
  });
}

async function executeKbSourceRun(
  repos: KbRepoFactory,
  source: KbSource,
  adapter: DocumentSourceAdapter,
  run: KbSourceRun,
  options: RunKbSourceOptions = {}
): Promise<RunKbSourceResult> {
  let createdItems = 0;
  let updatedItems = 0;
  let skippedItems = 0;
  const startedAt = new Date();

  try {
    await updateRunProgress(repos, run.id, {
      createdItems,
      currentItemIndex: 0,
      phase: "indexing",
      skippedItems,
      totalItems: null,
      updatedItems,
    });
    const rawIndex = await runBoundedPhase("create_index", undefined, () =>
      adapter.createIndex(source)
    );
    const stoppedAfterIndex = await getStoppedRun(repos, run.id);
    if (stoppedAfterIndex) {
      return { run: stoppedAfterIndex, source };
    }
    const rawEntries = rawIndex.entries.slice(0, options.limit);
    const selectedKeys = options.selected_item_keys;
    const entries =
      selectedKeys === undefined
        ? rawEntries
        : rawEntries.filter((e) => selectedKeys.includes(e.item_key));
    const seenKeys = new Set(entries.map((entry) => entry.item_key));
    await updateRunProgress(repos, run.id, {
      createdItems,
      currentItemIndex: 0,
      phase: "retrieving",
      skippedItems,
      totalItems: entries.length,
      updatedItems,
    });

    let sourceForRetrieval: KbSource = source;
    if (source.adapter_id === "sitemap" && entries.length > 0) {
      const sampleUrls = entries.slice(0, 3).map((e) => e.source_url);
      const mergedSettings = await mergeSitemapHtmlExtractIntoSettings(
        source.settings as Record<string, unknown>,
        entries.length,
        sampleUrls
      );
      sourceForRetrieval = { ...source, settings: mergedSettings };
    }

    const itemLogs: KbSourceRunItemLog[] = [];

    for (const [index, entry] of entries.entries()) {
      const stoppedBeforeItem = await getStoppedRun(repos, run.id);
      if (stoppedBeforeItem) {
        return { run: stoppedBeforeItem, source };
      }
      await updateRunProgress(repos, run.id, {
        createdItems,
        currentItemIndex: index + 1,
        currentItemKey: entry.item_key,
        currentItemTitle: entry.title ?? null,
        itemLogs,
        phase: "retrieving",
        skippedItems,
        totalItems: entries.length,
        updatedItems,
      });
      const existing = await repos.sources.getSourceItemByKey(
        source.id,
        entry.item_key
      );
      if (existing?.status === "ignored") {
        itemLogs.push(itemLogFromEntry(entry, "skipped_ignored", null));
        skippedItems += 1;
        await updateRunProgress(repos, run.id, {
          createdItems,
          currentItemIndex: index + 1,
          currentItemKey: entry.item_key,
          currentItemTitle: entry.title ?? null,
          itemLogs,
          phase: "retrieving",
          skippedItems,
          totalItems: entries.length,
          updatedItems,
        });
        continue;
      }

      // Per-item errors (SSL, network, redirect failures, etc.) skip the item
      // rather than aborting the entire run.
      try {
        const probe = adapter.probeMetadata
          ? await runBoundedPhase("probe_metadata", entry.item_key, () =>
              adapter.probeMetadata!(entry)
            )
          : null;
        const shouldRetrieve =
          options.force ||
          sourceItemNeverRetrieved(existing) ||
          !adapter.needsUpdate ||
          adapter.needsUpdate({ existingItem: existing, metadata: probe });
        if (!shouldRetrieve) {
          await upsertSeenItem(repos, source, entry, existing, probe);
          itemLogs.push(
            itemLogFromEntry(entry, "skipped_unchanged", "Content unchanged")
          );
          skippedItems += 1;
          await updateRunProgress(repos, run.id, {
            createdItems,
            currentItemIndex: index + 1,
            currentItemKey: entry.item_key,
            currentItemTitle: entry.title ?? null,
            itemLogs,
            phase: "retrieving",
            skippedItems,
            totalItems: entries.length,
            updatedItems,
          });
          continue;
        }
        const retrieved = await runBoundedPhase(
          "retrieve_item",
          entry.item_key,
          () => adapter.retrieveItem(sourceForRetrieval, entry)
        );
        const contentHash = hashDocumentSourceItemContent(retrieved);
        if (
          !options.force &&
          existing?.content_hash === contentHash &&
          sourceItemHasStoredStructure(existing)
        ) {
          await upsertSeenItem(repos, source, entry, existing, probe);
          itemLogs.push(
            itemLogFromEntry(entry, "skipped_unchanged", "Content unchanged")
          );
          skippedItems += 1;
          await updateRunProgress(repos, run.id, {
            createdItems,
            currentItemIndex: index + 1,
            currentItemKey: entry.item_key,
            currentItemTitle: entry.title ?? null,
            itemLogs,
            phase: "retrieving",
            skippedItems,
            totalItems: entries.length,
            updatedItems,
          });
          continue;
        }
        const inboxItem = await upsertInboxForRetrievedItem(
          repos,
          source,
          existing,
          retrieved,
          contentHash,
          options.actorPrincipalId
        );
        const itemMetadata = probeMetadataToItemMetadata(
          retrieved.metadata ?? {},
          probe
        );
        const sourceItem = await repos.sources.upsertSourceItem({
          adapter_item_key: entry.item_key,
          content_hash: contentHash,
          inbox_item_id: inboxItem.id,
          kb_id: source.kb_id,
          last_seen_at: new Date().toISOString(),
          locator: entry.locator ?? null,
          metadata: itemMetadata,
          missing_since: null,
          source_id: source.id,
          source_url: retrieved.final_url ?? retrieved.source_url,
          status: existing?.status === "draft" ? "draft" : "active",
          title: retrieved.title ?? entry.title ?? inboxItem.title,
        });
        const counts = await persistRetrievedStructure({
          item: sourceItem,
          repos,
          retrieved,
          source,
          storageService: options.storageService,
        });
        await repos.sources.updateSourceItem(sourceItem.id, {
          metadata: {
            ...itemMetadata,
            link_count: counts.linkCount,
            media_count: counts.mediaCount,
            section_count: counts.sectionCount,
          },
        });
        if (existing?.inbox_item_id) {
          updatedItems += 1;
          itemLogs.push(itemLogFromEntry(entry, "updated", null));
        } else {
          createdItems += 1;
          itemLogs.push(itemLogFromEntry(entry, "created", null));
        }
      } catch (error) {
        const message = truncateRunError(formatRunError(error));
        itemLogs.push(
          itemLogFromEntry(
            entry,
            "failed",
            message || "Unknown retrieval error"
          )
        );
        await recordItemFailure(
          repos,
          source,
          entry,
          existing ?? null,
          message || "Unknown retrieval error"
        );
        skippedItems += 1;
      }
      await updateRunProgress(repos, run.id, {
        createdItems,
        currentItemIndex: index + 1,
        currentItemKey: entry.item_key,
        currentItemTitle: entry.title ?? null,
        itemLogs,
        phase: "retrieving",
        skippedItems,
        totalItems: entries.length,
        updatedItems,
      });
    }

    const skipMissingSweep =
      source.adapter_id === "manual" || source.adapter_id === "file_upload";
    if (!skipMissingSweep) {
      const stoppedBeforeMissingSweep = await getStoppedRun(repos, run.id);
      if (stoppedBeforeMissingSweep) {
        return { run: stoppedBeforeMissingSweep, source };
      }
      await runBoundedPhase("missing_items", undefined, () =>
        applyMissingItems(repos, source, seenKeys)
      );
    }
    const completedRun = await completeRun(repos, run.id, source, {
      createdItems,
      error: summarizeRunItemLogs(itemLogs),
      itemLogs,
      skippedItems,
      startedAt,
      status: resolveRunStatusFromItemLogs(itemLogs),
      updatedItems,
    });
    return { run: completedRun, source };
  } catch (error) {
    let message = truncateRunError(formatRunError(error)).trim();
    if (!message) {
      message = "Unknown error";
    }
    const failedRun = await completeRun(repos, run.id, source, {
      createdItems,
      error: message,
      failureMetadata: failureMetadataFromError(error),
      skippedItems,
      startedAt,
      status: "failed",
      updatedItems,
    });
    return { run: failedRun, source };
  }
}

export async function runKbSource(
  repos: KbRepoFactory,
  sourceId: string,
  options: RunKbSourceOptions = {}
): Promise<RunKbSourceResult> {
  const source = await repos.sources.getById(sourceId);
  if (!source) {
    throw new Error("Source not found");
  }
  const running = await repos.sources.getRunningRun(source.id);
  if (running) {
    return { run: running, source };
  }

  const registry = options.registry ?? defaultDocumentSourceAdapterRegistry;
  // Resolve adapter before creating the run record so an unknown adapter_id
  // throws before we insert a stale "running" row into the DB.
  const adapter = registry.get(source.adapter_id);
  try {
    assertSourceAdapterRunReady(source.adapter_id, source.settings);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Invalid source settings");
  }
  const run = await repos.sources.createRun({
    completed_at: null,
    created_items: 0,
    error: null,
    kb_id: source.kb_id,
    metadata: { phase: "indexing", total_items: null },
    skipped_items: 0,
    source_id: source.id,
    status: "running",
    trigger: options.trigger ?? "manual",
    updated_items: 0,
  });
  const updatedSource =
    (await repos.sources.update(source.id, {
      last_error: null,
      last_run_at: run.started_at,
      last_run_status: "running",
      status: "active",
    })) ?? source;

  if (options.background) {
    void executeKbSourceRun(repos, updatedSource, adapter, run, options);
    return { run, source: updatedSource };
  }

  return executeKbSourceRun(repos, updatedSource, adapter, run, options);
}

async function upsertSeenItem(
  repos: KbRepoFactory,
  source: KbSource,
  entry: DocumentSourceIndexEntry,
  existing: KbSourceItem | null,
  probe: DocumentSourceProbeMetadata | null
): Promise<void> {
  await repos.sources.upsertSourceItem({
    adapter_item_key: entry.item_key,
    content_hash: existing?.content_hash ?? null,
    inbox_item_id: existing?.inbox_item_id ?? null,
    kb_id: source.kb_id,
    last_seen_at: new Date().toISOString(),
    locator: entry.locator ?? existing?.locator ?? null,
    metadata: probeMetadataToItemMetadata(
      { ...(existing?.metadata ?? {}), ...(entry.metadata ?? {}) },
      probe
    ),
    missing_since: null,
    source_id: source.id,
    source_url: entry.source_url,
    status: existing?.status ?? "active",
    title: entry.title ?? existing?.title ?? null,
  });
}

async function recordItemFailure(
  repos: KbRepoFactory,
  source: KbSource,
  entry: DocumentSourceIndexEntry,
  existing: KbSourceItem | null,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();
  await repos.sources.upsertSourceItem({
    adapter_item_key: entry.item_key,
    content_hash: existing?.content_hash ?? null,
    inbox_item_id: existing?.inbox_item_id ?? null,
    kb_id: source.kb_id,
    last_seen_at: now,
    locator: entry.locator ?? existing?.locator ?? null,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...(entry.metadata ?? {}),
      last_retrieve_error: truncateItemLogMessage(errorMessage),
      last_retrieve_failed_at: now,
    },
    missing_since: null,
    source_id: source.id,
    source_url: entry.source_url,
    status: existing?.status ?? "active",
    title: entry.title ?? existing?.title ?? null,
  });
}

async function applyMissingItems(
  repos: KbRepoFactory,
  source: KbSource,
  seenKeys: Set<string>
): Promise<void> {
  const items = await repos.sources.listItemsPaginated(source.id, {
    page: 1,
    page_size: 200,
  });
  for (const item of items.data) {
    if (!seenKeys.has(item.adapter_item_key)) {
      await applyMissingStrategy({
        item,
        repos,
        strategy: source.missing_item_strategy,
      });
    }
  }
}

async function completeRun(
  repos: KbRepoFactory,
  runId: string,
  source: KbSource,
  args: {
    createdItems: number;
    error: string | null;
    failureMetadata?: Record<string, unknown>;
    itemLogs?: KbSourceRunItemLog[];
    skippedItems: number;
    startedAt: Date;
    status: "succeeded" | "failed";
    updatedItems: number;
  }
): Promise<KbSourceRun> {
  const completedAt = new Date();
  const run = await repos.sources.updateRun(runId, {
    completed_at: completedAt.toISOString(),
    created_items: args.createdItems,
    error: args.error,
    metadata: {
      duration_ms: completedAt.getTime() - args.startedAt.getTime(),
      ...(args.itemLogs ? { item_logs: args.itemLogs } : {}),
      ...(args.failureMetadata ?? {}),
    },
    skipped_items: args.skippedItems,
    status: args.status,
    updated_items: args.updatedItems,
  });
  await repos.sources.update(source.id, {
    last_error: args.error,
    last_run_at: completedAt.toISOString(),
    last_run_status: args.status,
    next_run_at: computeDocumentSourceNextRunAt(source, completedAt),
    status: args.status === "failed" ? "failed" : "active",
  });
  await repos.activity_log.append({
    event_type: "source.run",
    kb_id: source.kb_id,
    payload: {
      created_items: args.createdItems,
      error: args.error,
      skipped_items: args.skippedItems,
      source_id: source.id,
      status: args.status,
      updated_items: args.updatedItems,
    },
  });
  if (!run) {
    throw new Error("Source run disappeared while completing");
  }
  return run;
}
