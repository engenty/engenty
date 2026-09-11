import { randomBytes } from "node:crypto";
import type { DocumentSourceIndexEntry } from "@engenty/document-sources";
import {
  assertSourceAdapterRunReady,
  computeDocumentSourceNextRunAt,
  defaultDocumentSourceAdapterRegistry,
  hashDocumentSourceWebhookToken,
} from "@engenty/document-sources";
import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KbRepoFactory, KbRepoFactoryFn } from "../dal/contracts.js";
import { SCHEMA } from "../dal/shared.js";
import type { KbSource, KbSourceSchedule } from "../schema/sources.js";
import {
  kbSourceAnalyzeBodySchema,
  kbSourceCreateSchema,
  kbSourceIndexPreviewSchema,
  kbSourceIngestBodySchema,
  kbSourceIngestConfigSchema,
  kbSourceItemListQuerySchema,
  kbSourceItemUpdateSchema,
  kbSourceListQuerySchema,
  kbSourceRunBodySchema,
  kbSourceSuggestTemplateBodySchema,
  kbSourceUpdateSchema,
} from "../schema/zod.js";
import { analyzeKbSource } from "../sources/source-analyze.js";
import {
  type RunKbSourceResult,
  runKbSource,
} from "../sources/source-runner.js";
import { suggestKbSourceTemplate } from "../sources/source-template-suggest.js";
import {
  badRequest,
  created,
  jsonError,
  notFound,
  qp,
} from "./kb-api-shared.js";
import {
  bootstrapFileUploadSourceWithInbox,
  bootstrapManualSourceWithInbox,
} from "./kb-source-create-bootstrap.js";
import {
  runArmedKbSourceIngestions,
  runKbSourceIngestRequest,
} from "./kb-source-ingest-service.js";

type GetRepo = (auth?: PluginAuthContext) => KbRepoFactory;

interface WebhookLookupAdapter {
  schema(schema: string): {
    from(table: string): {
      select(columns: string): {
        eq(
          column: string,
          value: string
        ): {
          maybeSingle(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export function isLikelyValidIanaTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cron `next_run_at` uses an IANA zone. The UI does not collect it; the API
 * resolves from plugin config, then env, then UTC.
 *
 * - `pluginConfig.document_source_schedule_timezone` (string)
 * - `ENGENTY_KB_SOURCE_SCHEDULE_TZ` or `TZ` (process env)
 */
export function resolveKbSourceScheduleTimezone(
  ctx: Pick<PluginHttpRouteContext, "pluginConfig">
): string {
  const fromConfig = ctx.pluginConfig?.document_source_schedule_timezone;
  if (typeof fromConfig === "string") {
    const z = fromConfig.trim();
    if (z && isLikelyValidIanaTimeZone(z)) {
      return z;
    }
  }
  const fromEnv = (
    process.env.ENGENTY_KB_SOURCE_SCHEDULE_TZ ||
    process.env.TZ ||
    ""
  ).trim();
  if (fromEnv && isLikelyValidIanaTimeZone(fromEnv)) {
    return fromEnv;
  }
  return "UTC";
}

function withResolvedKbSourceScheduleTimezone<
  T extends { schedule?: KbSourceSchedule },
>(body: T, ctx: PluginHttpRouteContext): T {
  if (!body.schedule) {
    return body;
  }
  const tz = resolveKbSourceScheduleTimezone(ctx);
  return {
    ...body,
    schedule: { ...body.schedule, timezone: tz },
  };
}

function parseListQuery(sp: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of [
    "kb_id",
    "page",
    "page_size",
    "search",
    "sort_by",
    "sort_order",
    "status",
  ]) {
    const value = sp.get(key);
    if (!value) {
      continue;
    }
    raw[key] = ["page", "page_size"].includes(key)
      ? Number.parseInt(value, 10)
      : value;
  }
  return raw;
}

function generateWebhookToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Persist the index entries a create request carried (with any keys the user
 * ignored in the preview). Exported so the gateway `kb_source_create`
 * operation seeds items exactly like the HTTP route does.
 */
export async function persistInitialIndexedItems(
  repos: ReturnType<GetRepo>,
  source: KbSource,
  entries: DocumentSourceIndexEntry[],
  ignoredItemKeys: string[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const ignored = new Set(ignoredItemKeys);
  for (const entry of entries) {
    await repos.sources.upsertSourceItem({
      adapter_item_key: entry.item_key,
      content_hash: null,
      inbox_item_id: null,
      kb_id: source.kb_id,
      last_seen_at: null,
      locator: entry.locator ?? null,
      metadata: entry.metadata ?? {},
      missing_since: null,
      source_id: source.id,
      source_url: entry.source_url,
      status: ignored.has(entry.item_key) ? "ignored" : "active",
      title: entry.title ?? null,
    });
  }
}

// Service-role read by design: an inbound source webhook is anonymous until
// the token hash identifies the source row — and with it the tenant. Same
// shape as a login lookup. The run itself resolves tenant-locked repos from
// the row's own tenant_id/scope_id.
async function findSourceByWebhookToken(
  serviceDb: unknown,
  token: string
): Promise<Record<string, unknown> | null> {
  const adapter = serviceDb as WebhookLookupAdapter;
  const tokenHash = hashDocumentSourceWebhookToken(token);
  const { data, error } = await adapter
    .schema(SCHEMA)
    .from("kb_sources")
    .select("*")
    .eq("webhook_token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve source webhook: ${error.message}`);
  }
  return data;
}

export function registerKbSourceApi(
  api: Pick<
    PluginServerApi,
    | "callGatewayMethod"
    | "getStorageService"
    | "hasOperation"
    | "registerHttpRoute"
  >,
  getRepo: GetRepo,
  repoFactory: KbRepoFactoryFn,
  /** Service client for the tenant-RESOLUTION read only — see
   * `findSourceByWebhookToken`. Every other route runs on the tenant-locked
   * repos supplied by `getRepo`/`repoFactory`. */
  serviceDb: SupabaseClient
) {
  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/source-adapters",
    handler: async () => defaultDocumentSourceAdapterRegistry.listDescriptors(),
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/source-adapters/:adapterId/index",
    handler: async (ctx) => {
      const adapterId = (ctx.params as { adapterId: string }).adapterId;
      const body = kbSourceIndexPreviewSchema.parse({
        ...(await ctx.request.json().catch(() => ({}))),
        adapter_id: adapterId,
      });
      const adapter = defaultDocumentSourceAdapterRegistry.get(body.adapter_id);
      const settings = adapter.settingsSchema.parse(body.settings);
      const index = await adapter.createIndex({
        adapter_id: body.adapter_id,
        id: "preview",
        missing_item_strategy: "ignore",
        name: body.name,
        schedule: {
          cron_expression: null,
          enabled: false,
          interval_minutes: null,
          kind: "interval",
          timezone: "UTC",
        },
        settings,
      });
      return {
        entries: index.entries,
        index_mode: adapter.descriptor.index_mode,
        total: index.total,
      };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/sources",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourceListQuerySchema.parse(parseListQuery(qp(ctx)));
      return repos.sources.listPaginated(params);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const parsedBody = withResolvedKbSourceScheduleTimezone(
        kbSourceCreateSchema.parse(await ctx.request.json().catch(() => ({}))),
        ctx
      );
      const { ignored_item_keys, initial_index_entries, ...body } = parsedBody;
      const adapter = defaultDocumentSourceAdapterRegistry.get(body.adapter_id);
      const settings = adapter.settingsSchema.parse(body.settings);
      try {
        assertSourceAdapterRunReady(body.adapter_id, settings);
      } catch (error) {
        return badRequest(
          error instanceof Error ? error.message : "Invalid source settings"
        );
      }
      const source = await repos.sources.create(
        {
          ...body,
          next_run_at: body.next_run_at ?? computeDocumentSourceNextRunAt(body),
          settings,
        },
        ctx.auth?.principalId ?? null
      );
      try {
        await persistInitialIndexedItems(
          repos,
          source,
          initial_index_entries,
          ignored_item_keys
        );
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
              body_markdown?: string;
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
      return created({ data: refreshed ?? source });
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/sources/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const source = await repos.sources.getById(
        (ctx.params as { id: string }).id
      );
      if (!source) {
        return notFound("Source not found");
      }
      const runs = await repos.sources.listRecentRuns(source.id, 10);
      return { data: source, runs };
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/kb/sources/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const existing = await repos.sources.getById(params.id);
      if (!existing) {
        return notFound("Source not found");
      }
      const body = withResolvedKbSourceScheduleTimezone(
        kbSourceUpdateSchema.parse(await ctx.request.json().catch(() => ({}))),
        ctx
      );
      const settings =
        body.settings === undefined
          ? undefined
          : defaultDocumentSourceAdapterRegistry
              .get(existing.adapter_id)
              .settingsSchema.parse(body.settings);
      const nextSettings = settings ?? existing.settings;
      try {
        assertSourceAdapterRunReady(existing.adapter_id, nextSettings);
      } catch (error) {
        return badRequest(
          error instanceof Error ? error.message : "Invalid source settings"
        );
      }
      const ingest_config =
        body.ingest_config === undefined
          ? undefined
          : kbSourceIngestConfigSchema.parse({
              ...existing.ingest_config,
              ...body.ingest_config,
            });
      const source = await repos.sources.update(params.id, {
        ...body,
        ingest_config,
        next_run_at:
          body.next_run_at === undefined
            ? body.schedule || body.enabled !== undefined
              ? computeDocumentSourceNextRunAt({
                  ...existing,
                  ...body,
                })
              : undefined
            : body.next_run_at,
        settings,
      });
      if (!source) {
        return notFound("Source not found");
      }
      return source;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/sources/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      await repos.sources.delete((ctx.params as { id: string }).id);
      return null;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources/:id/run",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = kbSourceRunBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      try {
        return await runKbSource(repos, params.id, {
          actorPrincipalId: ctx.auth?.principalId ?? null,
          force: body.force,
          background: body.background,
          limit: body.limit,
          onSyncComplete: async () => {
            await runArmedKbSourceIngestions({
              auth: ctx.auth,
              gateway: api,
              repos,
              sourceId: params.id,
            });
          },
          retrieve_images: body.retrieve_images,
          selected_item_keys: body.selected_item_keys,
          storageService: api.getStorageService?.("files") ?? null,
          trigger: body.trigger,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run source";
        if (message === "Source not found") {
          return notFound(message);
        }
        if (message.includes("FIRECRAWL_API_KEY")) {
          return badRequest(message);
        }
        return jsonError(503, "run_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/sources/:id/runs",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const source = await repos.sources.getById(params.id);
      if (!source) {
        return notFound("Source not found");
      }
      await repos.sources.deleteRunsForSource(params.id);
      return { ok: true as const };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources/:id/runs/:runId/stop",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string; runId: string };
      const source = await repos.sources.getById(params.id);
      if (!source) {
        return notFound("Source not found");
      }
      const run = await repos.sources.getRunById(params.runId);
      if (!run || run.source_id !== source.id) {
        return notFound("Source run not found");
      }
      if (run.status !== "running") {
        return { run, source };
      }
      const stoppedRun = await repos.sources.updateRun(run.id, {
        completed_at: new Date().toISOString(),
        error: "Stopped by user",
        metadata: {
          ...run.metadata,
          stopped_by: ctx.auth?.principalId ?? null,
          stopped_reason: "user_requested",
        },
        status: "skipped",
      });
      const updatedSource =
        (await repos.sources.update(source.id, {
          last_error: null,
          last_run_at: new Date().toISOString(),
          last_run_status: "skipped",
          next_run_at: computeDocumentSourceNextRunAt(source),
          status: "active",
        })) ?? source;
      return { run: stoppedRun ?? run, source: updatedSource };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources/run-due",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const sources = await repos.sources.listDue(new Date().toISOString(), 25);
      const results: RunKbSourceResult[] = [];
      for (const source of sources) {
        results.push(
          await runKbSource(repos, source.id, {
            actorPrincipalId: ctx.auth?.principalId ?? null,
            onSyncComplete: async () => {
              await runArmedKbSourceIngestions({
                auth: ctx.auth,
                gateway: api,
                repos,
                sourceId: source.id,
              });
            },
            storageService: api.getStorageService?.("files") ?? null,
            trigger: "schedule",
          })
        );
      }
      return { data: results };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources/:id/rotate-webhook-token",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const token = generateWebhookToken();
      const source = await repos.sources.update(
        (ctx.params as { id: string }).id,
        {
          webhook_token_hash: hashDocumentSourceWebhookToken(token),
        }
      );
      if (!source) {
        return notFound("Source not found");
      }
      return { data: source, webhook_token: token };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/sources/:id/items",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const source = await repos.sources.getById(params.id);
      if (!source) {
        return notFound("Source not found");
      }
      const raw = parseListQuery(qp(ctx));
      const itemParams = kbSourceItemListQuerySchema.parse(raw);
      return repos.sources.listItemsPaginated(params.id, itemParams);
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/kb/sources/:sourceId/items/:itemId",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { itemId: string; sourceId: string };
      const body = kbSourceItemUpdateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const item = await repos.sources.getSourceItemById(params.itemId);
      if (!item || item.source_id !== params.sourceId) {
        return notFound("Source item not found");
      }
      const updated = await repos.sources.updateSourceItem(params.itemId, body);
      return updated ?? notFound("Source item not found");
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/sources/:sourceId/items/:itemId",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { itemId: string; sourceId: string };
      const item = await repos.sources.getSourceItemById(params.itemId);
      if (!item || item.source_id !== params.sourceId) {
        return notFound("Source item not found");
      }
      // Hard-delete the linked inbox content too, unless it was already
      // promoted to an article/FAQ (we keep promoted content intact).
      if (item.inbox_item_id) {
        const inbox = await repos.inbox.getById(item.inbox_item_id);
        if (inbox && inbox.status !== "promoted") {
          await repos.inbox.delete(inbox.id);
        }
      }
      await repos.sources.deleteSourceItem(params.itemId);
      return { ok: true };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/source-items/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const id = (ctx.params as { id: string }).id;
      const item = await repos.sources.getSourceItemById(id);
      if (!item) {
        return notFound("Source item not found");
      }
      const source = await repos.sources.getById(item.source_id);
      if (!source) {
        return notFound("Source not found");
      }
      const [sections, media, links] = await Promise.all([
        repos.sources.listSourceItemSections(item.id),
        repos.sources.listSourceItemMedia(item.id),
        repos.sources.listSourceItemLinks(item.id),
      ]);
      return { item, links, media, sections, source };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/sources/:id/index",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const source = await repos.sources.getById(
        (ctx.params as { id: string }).id
      );
      if (!source) {
        return notFound("Source not found");
      }
      const adapter = defaultDocumentSourceAdapterRegistry.get(
        source.adapter_id
      );
      const sp = qp(ctx);
      const limitRaw = sp.get("limit");
      const limit = limitRaw
        ? Math.min(Number.parseInt(limitRaw, 10), 500)
        : 200;
      const index = await adapter.createIndex(source);
      const entries = index.entries.slice(0, limit);
      return { entries, total: index.total };
    },
  });

  api.registerHttpRoute({
    method: "post",
    // Read-only: reads synced items and proposes a structure. Writes nothing,
    // so it needs no approval gate — unlike /ingest below.
    path: "/api/kb/sources/:id/analyze",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = kbSourceAnalyzeBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      try {
        return await analyzeKbSource(repos, params.id, {
          hint: body.hint,
          sample_size: body.sample_size,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to analyze source";
        if (message === "Source not found") {
          return notFound(message);
        }
        return jsonError(503, "analyze_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    // Read-only, same as /analyze: proposes a template, creates nothing. The
    // user creates the template from the proposal through the templates API.
    path: "/api/kb/sources/:id/suggest-template",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = kbSourceSuggestTemplateBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      try {
        return await suggestKbSourceTemplate(repos, params.id, {
          hint: body.hint,
          sample_size: body.sample_size,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to suggest template";
        if (message === "Source not found") {
          return notFound(message);
        }
        return jsonError(503, "suggest_template_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/sources/:id/ingest",
    // Agentic ingest spawns a tasks_create (itself approval-gated) through the
    // in-process gateway caller, so this edge must carry the gate the nested
    // call would otherwise demand.
    operation: {
      moduleId: "knowledge-base",
      requiredCapabilities: ["module.knowledge-base.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = kbSourceIngestBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const outcome = await runKbSourceIngestRequest({
        auth: ctx.auth,
        body,
        gateway: api,
        repos,
        sourceId: params.id,
      });
      if (outcome.status === "not_found") {
        return notFound("Source not found");
      }
      if (outcome.status === "failed") {
        return jsonError(503, "ingest_failed", outcome.message);
      }
      return outcome.result;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/source-webhooks/:token",
    handler: async (ctx) => {
      const params = ctx.params as { token: string };
      const sourceRow = await findSourceByWebhookToken(serviceDb, params.token);
      if (!sourceRow) {
        return jsonError(401, "invalid_source_webhook_token", "Invalid token");
      }
      // Tenant-locked from here on: repoFactory resolves getTenantDb from the
      // row's own tenant.
      const repos = repoFactory(
        String(sourceRow.tenant_id),
        String(sourceRow.scope_id)
      );
      return runKbSource(repos, String(sourceRow.id), {
        onSyncComplete: async () => {
          await runArmedKbSourceIngestions({
            // Webhook runs are tenant-locked and have no user principal; the
            // armed modes still apply, they just run unattributed.
            auth: undefined,
            gateway: api,
            repos,
            sourceId: String(sourceRow.id),
          });
        },
        storageService: api.getStorageService?.("files") ?? null,
        trigger: "webhook",
      });
    },
  });
}
