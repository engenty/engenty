// Host-side wiring for `engenty.server.registerSearchIndexProvider(...)`.
//
// Translates a search-index registration into:
//   (a) a synthesized module operation that flows through the existing
//       operation catalog (auto-tool), and
//   (b) auto-subscriptions to module events that call
//       `provider.replaceDocument` / `provider.deleteDocument`
//       (declarative re-index).
//
// The composite registration receipt's `dispose()` rolls back both sides on
// plugin reload/disable. Lives in the SDK so non-core hosts (e.g. `apps/ai`)
// can register search-index providers against their own local registry
// without depending on `apps/core`.

import {
  resolveSearchStrategy,
  type SearchIndexRegistry,
  type SearchRequest,
  type SearchStrategy,
} from "@engenty/search-index";
import { z } from "zod";
import type {
  PluginOperationRisk,
  PluginRegistrationReceipt,
  PluginServerApi,
} from "./index.js";
import type {
  PluginEventPayload,
  PluginEventRegistrationReceipt,
  PluginEventsApi,
} from "./plugin-events.js";
import {
  type PluginSearchIndexRegistrationOptions,
  SEARCH_INDEX_REFRESH_FAILED_EVENT,
  type SearchIndexEventBinding,
  type SearchIndexProvider,
} from "./search-index-registration.js";
import { normalizeLegacyToolId } from "./tool-id.js";

// Avoid cyclic import for the operation type by quoting it locally.
interface MinimalServerOperation {
  description?: string;
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
  idempotent?: boolean;
  inputSchema?: unknown;
  moduleId?: string;
  operationId: string;
  outputSchema?: unknown;
  requiredCapabilities?: string[];
  requiresApproval?: boolean;
  riskLevel?: PluginOperationRisk;
  summary?: string;
}

// Operations are invoked with `(input, ctx)` where `ctx.auth` carries the
// authenticated tenant/user. The synthesized search handler reads those and
// overrides any `filters.tenant_id` / `filters.user_id` the caller passed —
// agents must never be able to query a different tenant by spoofing filters.
interface SynthesizedHandlerCtx {
  auth?: {
    scopeId?: string | null;
    tenantId?: string | null;
    userId?: string | null;
  };
}

function readSynthesizedHandlerCtx(ctx: unknown): SynthesizedHandlerCtx {
  if (!ctx || typeof ctx !== "object") {
    return {};
  }
  return ctx as SynthesizedHandlerCtx;
}

const SEARCH_STRATEGY_VALUES = ["hybrid", "lexical", "semantic"] as const;
const SEARCH_INPUT_BASE = z.object({
  filters: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  min_score: z.number().min(0).max(1).optional(),
  offset: z.number().int().min(0).optional(),
  query: z.string().optional(),
  strategy: z.enum(SEARCH_STRATEGY_VALUES).optional(),
});
const SEARCH_OUTPUT = z.object({
  results: z.array(
    z.object({
      item: z.unknown(),
      matched_fields: z.array(z.string()),
      score: z.number(),
      source_lines: z.object({ end: z.number(), start: z.number() }).optional(),
      source_offset: z
        .object({ end: z.number(), start: z.number() })
        .optional(),
      source_scores: z.record(z.string(), z.number()),
    })
  ),
  total: z.number(),
});

// Resolve the synthesized operation id. Defaults to `<module>_<entity>_search` (strict snake_case).
export function resolveSearchOperationId(
  options: PluginSearchIndexRegistrationOptions
): string {
  if (options.operationId?.trim()) {
    return normalizeLegacyToolId(options.operationId.trim());
  }
  const module = options.moduleId.trim();
  const entity = options.entityName.trim();
  if (!(module && entity)) {
    throw new Error(
      "registerSearchIndexProvider: moduleId and entityName are required"
    );
  }
  return normalizeLegacyToolId(`${module}.${entity}.search`);
}

// Build a `PluginServerOperation`-shaped object that proxies into
// `provider.search`. The caller forwards it to `server.registerOperation(...)`.
export function synthesizeSearchOperation(
  provider: SearchIndexProvider,
  options: PluginSearchIndexRegistrationOptions
): MinimalServerOperation {
  const operationId = resolveSearchOperationId(options);
  const filtersSchema = options.filtersSchema;
  const inputSchema = filtersSchema
    ? SEARCH_INPUT_BASE.extend({ filters: filtersSchema.optional() })
    : SEARCH_INPUT_BASE;
  return {
    description:
      options.operationOverrides?.description ??
      `Search ${options.entityName}s in ${options.moduleId}`,
    handler: async (rawInput, rawCtx) => {
      const parsed = inputSchema.parse(rawInput ?? {});
      const ctx = readSynthesizedHandlerCtx(rawCtx);
      const tenantId = ctx.auth?.tenantId ?? null;
      const userId = ctx.auth?.userId ?? null;
      // Drop the spoofable identity fields from caller filters, then merge in
      // only authenticated values. An LLM-driven payload is untrusted.
      const callerFilters =
        parsed.filters && typeof parsed.filters === "object"
          ? (parsed.filters as Record<string, unknown>)
          : {};
      const {
        tenant_id: _spoofTenant,
        user_id: _spoofUser,
        ...safeCallerFilters
      } = callerFilters;
      const filters: Record<string, unknown> = { ...safeCallerFilters };
      if (tenantId) {
        filters.tenant_id = tenantId;
      }
      if (userId) {
        filters.user_id = userId;
      }
      const { filters: _omit, ...rest } = parsed;
      const request: SearchRequest<unknown> = {
        ...rest,
        filters,
        // Honor explicit `strategy` (including `"lexical"`) — the provider
        // contract is "do exactly what was asked"; auto-fallback only kicks
        // in when the caller did not specify one.
        ...(parsed.strategy
          ? { strategy: parsed.strategy as SearchStrategy }
          : { strategy: resolveSearchStrategy(provider) }),
      };
      return provider.search(request as SearchRequest<Record<string, never>>);
    },
    idempotent: options.operationOverrides?.idempotent ?? true,
    inputSchema,
    moduleId: options.moduleId,
    operationId,
    outputSchema: SEARCH_OUTPUT,
    requiredCapabilities: options.operationOverrides?.requiredCapabilities,
    requiresApproval: options.operationOverrides?.requiresApproval ?? false,
    riskLevel: options.operationOverrides?.riskLevel ?? "low",
    summary:
      options.operationOverrides?.summary ??
      `Search ${options.entityName}s indexed by ${provider.id}`,
  };
}

// Subscribe each binding to `events.modules.on` and dispatch into the provider.
// Returns the per-binding receipts so the composite dispose can roll back.
export function bindSearchIndexProviderEvents(
  events: PluginEventsApi,
  provider: SearchIndexProvider,
  options: PluginSearchIndexRegistrationOptions,
  onError?: (error: {
    action: "delete" | "replace";
    docId: string;
    error: unknown;
    eventName: string;
  }) => void
): PluginEventRegistrationReceipt[] {
  if (!options.onEvents?.length) {
    return [];
  }
  const receipts: PluginEventRegistrationReceipt[] = [];
  for (const binding of options.onEvents) {
    const receipt = events.modules.on(
      binding.name,
      buildBindingHandler(provider, binding, onError),
      { tenantScoped: binding.tenantScoped ?? true }
    );
    receipts.push(receipt);
  }
  return receipts;
}

function buildBindingHandler(
  provider: SearchIndexProvider,
  binding: SearchIndexEventBinding,
  onError?: (error: {
    action: "delete" | "replace";
    docId: string;
    error: unknown;
    eventName: string;
  }) => void
) {
  return async (payload: PluginEventPayload, ctx: { tenantId?: string }) => {
    const docIds = toDocIdArray(binding.docId(payload));
    const tenantId = ctx.tenantId ?? readTenantId(payload);
    if (!tenantId) {
      return;
    }
    for (const docId of docIds) {
      try {
        if (binding.action === "delete") {
          await provider.deleteDocument({ doc_id: docId, tenant_id: tenantId });
          continue;
        }
        const document =
          (await binding.load?.(payload)) ??
          (provider.getDocumentById
            ? await provider.getDocumentById({
                doc_id: docId,
                tenant_id: tenantId,
              })
            : null);
        if (document === null || document === undefined) {
          // No document to upsert; treat as delete to keep the index consistent.
          await provider.deleteDocument({
            doc_id: docId,
            tenant_id: tenantId,
          });
          continue;
        }
        await provider.replaceDocument({ document: document as never });
      } catch (error) {
        onError?.({
          action: binding.action,
          docId,
          error,
          eventName: binding.name,
        });
      }
    }
  };
}

function toDocIdArray(raw: string | string[] | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim()).filter(Boolean);
  }
  const trimmed = raw.trim();
  return trimmed ? [trimmed] : [];
}

function readTenantId(payload: PluginEventPayload): string | undefined {
  const candidates = [
    (payload as { tenant_id?: unknown }).tenant_id,
    (payload as { tenantId?: unknown }).tenantId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      return c.trim();
    }
  }
  return;
}

// Per-host wrapper. Returns a `registerSearchIndexProvider` that the loader
// (or app entrypoint) installs onto `EngentyPluginApi.server` (or invokes
// directly with `skipAutoTool: true` when there is no plugin server, e.g. in
// `apps/ai`). Internally:
//
//   - Adds the provider to the shared `SearchIndexRegistry`.
//   - Synthesizes the search operation via `server.registerOperation`.
//   - Subscribes any `onEvents` bindings via `events.modules.on`.
//   - Composes a single receipt whose `dispose()` rolls all of those back.
export function createSearchIndexHost(input: {
  events: PluginEventsApi;
  registry: SearchIndexRegistry;
  // Optional — when omitted, callers must pass `skipAutoTool: true` because
  // the host has no operation catalog to register the synthesized op against.
  server?: PluginServerApi;
}) {
  const { events, registry, server } = input;
  return function registerSearchIndexProvider(
    provider: SearchIndexProvider,
    options: PluginSearchIndexRegistrationOptions
  ): PluginRegistrationReceipt | undefined {
    if (!provider.id?.trim()) {
      return;
    }
    if (registry.has(provider.id)) {
      return;
    }

    let opReceipt: PluginRegistrationReceipt | undefined;
    let synthesizedOperationId: string | undefined;
    if (!options.skipAutoTool) {
      if (!server) {
        throw new Error(
          "registerSearchIndexProvider: server is required when skipAutoTool is not set"
        );
      }
      const operation = synthesizeSearchOperation(provider, options);
      synthesizedOperationId = operation.operationId;
      opReceipt = server.registerOperation(
        operation as unknown as Parameters<typeof server.registerOperation>[0]
      );
    }

    registry.register(provider, {
      capabilities: options.capabilities ?? provider.capabilities ?? {},
      entityName: options.entityName,
      isSystem: options.isSystem ?? false,
      moduleId: options.moduleId,
      operationId: synthesizedOperationId,
      version: provider.version ?? "1",
    });

    const eventReceipts = bindSearchIndexProviderEvents(
      events,
      provider,
      options,
      ({ action, docId, error, eventName }) => {
        events.core
          .emit(SEARCH_INDEX_REFRESH_FAILED_EVENT as never, {
            action,
            doc_id: docId,
            error: error instanceof Error ? error.message : String(error),
            event_name: eventName,
            provider_id: provider.id,
          })
          .catch(() => {});
      }
    );

    const dispose = async () => {
      for (const r of eventReceipts) {
        try {
          await r.dispose();
        } catch {}
      }
      if (opReceipt) {
        try {
          await opReceipt.dispose();
        } catch {}
      }
      registry.unregister(provider.id);
    };

    if (!opReceipt) {
      // Synthesize a minimal receipt for skipAutoTool registrations.
      return {
        dispose,
        id: `search-index-provider:${provider.id}`,
        kind: "server.searchIndexProvider",
        pluginId: options.moduleId,
        sourceInfo: {
          generationId: undefined,
          manifestId: options.moduleId,
          manifestPath: options.moduleId,
          pluginId: options.moduleId,
          registrationKind: "server.searchIndexProvider",
          rootDir: "",
          source: "search-index-provider",
          sourceType: "module",
        },
      };
    }

    return {
      ...opReceipt,
      dispose,
      kind: "server.searchIndexProvider",
    };
  };
}
