import {
  assertSourceAdapterRunReady,
  computeDocumentSourceNextRunAt,
  defaultDocumentSourceAdapterRegistry,
} from "@engenty/document-sources";
import { z } from "zod";
import {
  bootstrapFileUploadSourceWithInbox,
  bootstrapManualSourceWithInbox,
} from "../../src/api/kb-source-create-bootstrap.js";
import { runKbSourceIngestRequest } from "../../src/api/kb-source-ingest-service.js";
import {
  persistInitialIndexedItems,
  resolveKbSourceScheduleTimezone,
} from "../../src/api/kb-sources.js";
import { kbSourceIngestConfigSchema } from "../../src/schema/sources.js";
import { analyzeKbSource } from "../../src/sources/source-analyze.js";
import { runKbSource } from "../../src/sources/source-runner.js";
import {
  kbSourceAnalyzeInputSchema,
  kbSourceCreateInputSchema,
  kbSourceDeleteInputSchema,
  kbSourceIngestInputSchema,
  kbSourceItemsListInputSchema,
  kbSourceRunInputSchema,
  kbSourceRunsListInputSchema,
  kbSourcesListInputSchema,
  kbSourceUpdateInputSchema,
} from "./kb-ai-gateway-schemas.js";
import {
  KB_SPACE_OWNED_COLLECTION,
  type KbGatewayServer,
  type KbGetRepo,
  kbDestructiveOp,
  kbGatewayOp,
  kbLinksFor,
  kbSpaceOwnedRecord,
  spaceIdFromKbAuth,
} from "./kb-ai-gateway-shared.js";
import {
  kbTargetRequired,
  resolveKbIdForScopedRead,
} from "./kb-operation-target.js";

export function registerKbAiGatewaySourceMethods(
  server: KbGatewayServer,
  getRepo: KbGetRepo
): void {
  server.registerOperation({
    operationId: "kb_sources_list",
    summary: "List KB Sources",
    description:
      "List configured documentation/indexing sources (web urls, file uploads, manual integrations) for a Knowledge Base in current_space. Never fall back to the tenant default KB when a Space or current KB is known.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbSourcesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourcesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const result = await repos.sources.listPaginated({
        ...params,
        kb_id: kbId,
      });
      const links = await kbLinksFor(repos, kbId);
      return {
        ...result,
        data: result.data.map((source) => ({
          ...source,
          link: links?.source(source.id),
        })),
      };
    },
  });

  server.registerOperation({
    operationId: "kb_source_create",
    summary: "Create a KB Source integration",
    description:
      "Create a KB data source in current_space. adapter_id controls the fetch strategy — use 'url' for specific URLs, 'web_index' to crawl a site by following links, 'sitemap' for sitemap.xml feeds, 'firecrawl_url' for Firecrawl-backed scraping, 'manual' ONLY for hand-authored text (never for websites), 'file_upload' for Vault files. The settings object must match the chosen adapter (see inputSchema description).",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbSourceCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourceCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const resolved = {
        ...params,
        kb_id: kbId,
      };

      const tz = resolveKbSourceScheduleTimezone(ctx);
      const withTz = resolved.schedule
        ? {
            ...resolved,
            schedule: { ...resolved.schedule, timezone: tz },
          }
        : resolved;

      const {
        ignored_item_keys,
        initial_index_entries,
        ingest_config,
        ...body
      } = withTz;
      const adapter = defaultDocumentSourceAdapterRegistry.get(body.adapter_id);
      const settings = adapter.settingsSchema.parse(body.settings);

      assertSourceAdapterRunReady(body.adapter_id, settings);

      const source = await repos.sources.create(
        {
          ...body,
          next_run_at: body.next_run_at ?? computeDocumentSourceNextRunAt(body),
          settings,
        },
        ctx.auth?.principalId ?? null
      );

      try {
        // Same seeding as the HTTP route: without it, index entries picked in
        // a preview (and the keys the caller ignored) were silently dropped.
        await persistInitialIndexedItems(
          repos,
          source,
          initial_index_entries,
          ignored_item_keys
        );
        if (ingest_config && Object.keys(ingest_config).length > 0) {
          await repos.sources.update(source.id, {
            ingest_config: kbSourceIngestConfigSchema.parse(ingest_config),
          });
        }
        if (body.adapter_id === "manual") {
          await bootstrapManualSourceWithInbox(
            repos,
            source,
            settings as { body_markdown?: string; title?: string },
            ctx.auth?.principalId ?? null
          );
        } else if (body.adapter_id === "file_upload") {
          await bootstrapFileUploadSourceWithInbox(
            repos,
            source,
            settings as {
              original_filename?: string;
              storage_object_key?: string;
            },
            ctx.auth?.principalId ?? null
          );
        }
      } catch (error) {
        await repos.sources.delete(source.id);
        throw error;
      }

      const refreshed = await repos.sources.getById(source.id);
      const links = await kbLinksFor(repos, kbId);
      return {
        source: { ...(refreshed ?? source), link: links?.source(source.id) },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_source_update",
    summary: "Update a KB Source integration",
    description:
      "Modify crawl limits, crawl timezone, sitemap settings, or schedules.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, patch } = kbSourceUpdateInputSchema.parse(input ?? {});
      const existing = await repos.sources.getById(source_id);
      if (!existing) {
        return { error: "Source not found" };
      }

      const tz = resolveKbSourceScheduleTimezone(ctx);
      const withTz = patch.schedule
        ? {
            ...patch,
            schedule: { ...patch.schedule, timezone: tz },
          }
        : patch;

      const settings =
        withTz.settings === undefined
          ? undefined
          : defaultDocumentSourceAdapterRegistry
              .get(existing.adapter_id)
              .settingsSchema.parse(withTz.settings);

      const nextSettings = settings ?? existing.settings;
      assertSourceAdapterRunReady(existing.adapter_id, nextSettings);

      const ingest_config =
        withTz.ingest_config === undefined
          ? undefined
          : kbSourceIngestConfigSchema.parse({
              ...existing.ingest_config,
              ...withTz.ingest_config,
            });

      const updated = await repos.sources.update(source_id, {
        ...withTz,
        ingest_config,
        settings,
        next_run_at:
          withTz.next_run_at === undefined
            ? withTz.schedule || withTz.enabled !== undefined
              ? computeDocumentSourceNextRunAt({
                  ...existing,
                  ...withTz,
                })
              : undefined
            : withTz.next_run_at,
      });

      if (!updated) {
        return { error: "Source not found" };
      }
      return {
        source: {
          ...updated,
          link: (await kbLinksFor(repos, updated.kb_id))?.source(updated.id),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_source_delete",
    summary: "Delete a KB Source integration",
    description: "Remove a source and stop any scheduled crawl runs.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id } = kbSourceDeleteInputSchema.parse(input ?? {});
      await repos.sources.delete(source_id);
      return { success: true };
    },
  });

  server.registerOperation({
    operationId: "kb_source_run",
    summary: "Trigger a run on a KB Source",
    description: "Start a sync or web crawl run on a configured source.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceRunInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, options } = kbSourceRunInputSchema.parse(input ?? {});
      const runResult = await runKbSource(repos, source_id, {
        actorPrincipalId: ctx.auth?.principalId ?? null,
        force: options?.force,
        background: options?.background,
        limit: options?.limit,
        retrieve_images: options?.retrieve_images,
        selected_item_keys: options?.selected_item_keys,
        storageService: server.getStorageService?.("files") ?? null,
        trigger: options?.trigger ?? "manual",
      });
      return runResult;
    },
  });

  server.registerOperation({
    operationId: "kb_source_analyze",
    summary:
      "Extract a KB Source's concepts and propose the wiki pages for them",
    description:
      "Read-only planning step between sync and ingest: samples the source's synced items and returns { overview, concepts[], pages[], suggested_instructions }. Concepts are the ideas the material establishes — the things a reader would look up by name — and pages are derived from them, one per major concept, NOT from the source's own sections. Creates nothing. Use it when the user wants an agentic wiki but has not said how it should be structured; show the proposal and let them adjust it before passing it to kb_source_ingest as `instructions`.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceAnalyzeInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, ...body } = kbSourceAnalyzeInputSchema.parse(
        input ?? {}
      );
      try {
        return await analyzeKbSource(repos, source_id, {
          hint: body.hint,
          sample_size: body.sample_size,
        });
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Failed to analyze source",
        };
      }
    },
  });

  server.registerOperation({
    operationId: "kb_source_ingest",
    summary: "Ingest a KB Source's synced items into articles",
    description:
      "Phase 2 of the source pipeline: turn the items a source has already synced (via kb_source_run) into KB articles. `strategy` picks the grouping — 'per_entry' (one article per item), 'per_source' (one merged article), or 'agentic' (dispatch an agent that authors a structured wiki from the items following the instructions brief; returns { task_id, async_run: true }). The content switches (include_full_content, include_summary, include_questions, attach_original, split_long_articles) pick what each article contains and combine freely. Verify the synced item count with kb_source_items_list BEFORE ingesting.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceIngestInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, ...body } = kbSourceIngestInputSchema.parse(
        input ?? {}
      );
      const gateway =
        server.callGatewayMethod && server.hasOperation
          ? {
              callGatewayMethod: server.callGatewayMethod.bind(server),
              hasOperation: server.hasOperation.bind(server),
            }
          : null;
      const outcome = await runKbSourceIngestRequest({
        auth: ctx.auth,
        body,
        gateway,
        repos,
        sourceId: source_id,
      });
      if (outcome.status === "not_found") {
        return { error: "Source not found" };
      }
      if (outcome.status === "failed") {
        return { error: outcome.message };
      }
      return outcome.result;
    },
  });

  server.registerOperation({
    operationId: "kb_source_runs_list",
    summary: "List runs for a KB Source",
    description:
      "Get recent ingestion/crawl executions and their outcome statuses.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceRunsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, limit } = kbSourceRunsListInputSchema.parse(
        input ?? {}
      );
      const runs = await repos.sources.listRecentRuns(source_id, limit);
      return { runs };
    },
  });

  server.registerOperation({
    operationId: "kb_source_items_list",
    summary: "List indexed items for a KB Source",
    description:
      "List details and URL locators of index keys fetched by a source.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("source_id")),
    inputSchema: kbSourceItemsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourceItemsListInputSchema.parse(input ?? {});
      const items = await repos.sources.listItemsPaginated(params.source_id, {
        page: params.page,
        page_size: params.page_size,
        search: params.search,
        status: params.status,
      });
      return items;
    },
  });
}
