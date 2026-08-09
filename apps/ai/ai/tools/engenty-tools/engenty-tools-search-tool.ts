import { createTool } from "@mastra/core/tools";
import type { EngentyToolContract } from "../../../src/ai/core-http-client.js";
import {
  type ApiCatalogSearchStore,
  CORE_API_CATALOG_PROVIDER_ID,
  createApiCatalogSearchStore,
} from "../../../src/dal/api-catalog/api-catalog-search-store.js";
import { getAiSearchIndexRegistry } from "../../../src/runtime/ai-search-runtime.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import type { ToolRequestContextCarrier } from "./lib/run-context.js";
import {
  type SearchEngentyToolInput,
  searchInputSchema,
} from "./schema/schemas.js";

export const ENGENTY_TOOLS_SEARCH_TOOL_ID = "engenty_tools_search";

export const engentyToolsSearchTool = createTool({
  id: ENGENTY_TOOLS_SEARCH_TOOL_ID,
  description:
    'Search or list Engenty tools available from core. This is API/tool discovery only; it does not fetch app data or app records. Use this before choosing how to read or change Engenty data. If the correct moduleId is unknown, call engenty_tools_modules first. For user content queries, search by moduleId only when the module is known, then call engenty_tool_execute with the returned data tool and pass the user query there. Search with kind "tool" first and omit method unless you explicitly need HTTP routes. Matches include the input schema so you can execute the tool directly; the output shape comes back with the actual result. Prefer ONE narrow search over several broad ones — each result is added to the conversation permanently.',
  inputSchema: searchInputSchema,
  execute: async (input, context) => searchEngentyTools(input, context),
});

export function createEngentyToolsSearchTool() {
  return engentyToolsSearchTool;
}

// Resolves the `core_api_catalog` provider through the in-process registry
// so the tool runs against the same `SearchIndexProvider` contract that
// powers the unified search-index surface. Falls back to a fresh proxy
// store if the registry is missing (test harnesses, ad-hoc CLI usage).
export function resolveApiCatalogProvider(opts?: {
  override?: ApiCatalogSearchStore;
}): ApiCatalogSearchStore {
  if (opts?.override) {
    return opts.override;
  }
  const registry = getAiSearchIndexRegistry();
  const provider = registry?.get(CORE_API_CATALOG_PROVIDER_ID);
  if (provider) {
    return provider as ApiCatalogSearchStore;
  }
  return createApiCatalogSearchStore();
}

export interface SearchEngentyToolsOverrides {
  apiCatalog?: ApiCatalogSearchStore;
}

// `apiCatalog` is optional, so a bare `"apiCatalog" in x` check does not narrow
// the union — TypeScript keeps the overrides branch alive on both sides. A
// predicate makes the discriminant explicit.
function isSearchOverrides(
  value: ToolRequestContextCarrier | SearchEngentyToolsOverrides
): value is SearchEngentyToolsOverrides {
  return "apiCatalog" in value;
}

export async function searchEngentyTools(
  input: SearchEngentyToolInput,
  contextOrOverrides?: ToolRequestContextCarrier | SearchEngentyToolsOverrides
) {
  const overrides =
    contextOrOverrides && isSearchOverrides(contextOrOverrides)
      ? contextOrOverrides
      : undefined;
  const executionContext =
    contextOrOverrides && !isSearchOverrides(contextOrOverrides)
      ? contextOrOverrides
      : undefined;
  // Preserve the legacy `{ ok: false, code: "unauthorized" | "service_unavailable" }`
  // envelope: when the caller did not supply an `apiCatalog` override, run
  // the existing client probe so missing bearer / missing ENGENTY_CORE_BASE_URL
  // return early with the same shape as before. The provider itself also
  // throws `EngentyCoreHttpError` for these cases, so the override path
  // gets uniform behavior through `coreErrorToToolResult`.
  if (!overrides) {
    const probe = getCurrentEngentyToolsClient(executionContext);
    if (!probe.ok) {
      return probe;
    }
  }
  const provider = resolveApiCatalogProvider({
    override: overrides?.apiCatalog,
  });
  try {
    const parsed = searchInputSchema.parse(input);
    const matched = await provider.search({
      filters: {
        kind: parsed.kind,
        ...(parsed.moduleId ? { module_id: parsed.moduleId } : {}),
        ...(parsed.readOnlyOnly ? { read_only_only: true } : {}),
      },
      limit: parsed.limit,
      ...(parsed.query ? { query: parsed.query } : {}),
    });

    let usedFallback = false;
    let entries: EngentyToolContract[] = matched.results.map((r) => r.item);
    // Module-fallback parity: when the user supplied both `moduleId` and
    // `query`, and the query came back empty, list the module's tools so
    // the LLM still sees options instead of a dead end.
    if (entries.length === 0 && parsed.moduleId && parsed.query) {
      const fallback = await provider.search({
        filters: {
          kind: parsed.kind,
          module_id: parsed.moduleId,
          ...(parsed.readOnlyOnly ? { read_only_only: true } : {}),
        },
        limit: parsed.limit,
      });
      entries = fallback.results.map((r) => r.item);
      usedFallback = entries.length > 0;
    }

    const fitted = fitMatchesToBudget(
      entries.map((entry) => projectContract(entry))
    );
    return {
      ok: true,
      catalog_only: true,
      matches: fitted.matches,
      message: usedFallback
        ? "No tool contract matched that query text. Returning available module tools instead; this was only catalog discovery, not an app data search."
        : fitted.compacted > 0
          ? `Catalog discovery completed. These matches are tool contracts, not app data results. ${fitted.compacted} lower-ranked match(es) list only their parameter names to keep this result small — narrow the query if you need their full schema.`
          : "Catalog discovery completed. These matches are tool contracts, not app data results.",
      next:
        entries.length > 0
          ? "Use engenty_tool_execute with the selected id to fetch or change app data."
          : "No tool contracts matched. This does not prove app data is missing; broaden catalog discovery or check whether the module registered operations.",
    };
  } catch (err) {
    return coreErrorToToolResult(err);
  }
}

/**
 * Byte budget for the projected matches. A discovery result is a means to an
 * end — it exists so the agent can pick a tool and call it. Emitting the full
 * contracts blew past 20 KB for a single search, and several of those in one
 * thread pushed the prompt to ~56k tokens of mostly JSON Schema, at which point
 * the model stopped calling tools at all and just narrated. Overflow degrades to
 * a compact signature rather than being dropped, and the result says so.
 */
const MATCHES_BYTE_BUDGET = 8000;

function projectContract(contract: EngentyToolContract) {
  // `outputSchema` is deliberately NOT included: it is not needed to CALL a
  // tool, and the agent receives the real output when it does. It was roughly
  // half the payload.
  const id = contract.toolId ?? contract.operationId ?? contract.methodName;
  return {
    name: id,
    description: contract.description ?? contract.summary ?? "",
    inputSchema: contract.inputSchema?.jsonSchema ?? {},
  };
}

type ProjectedMatch = ReturnType<typeof projectContract>;

/** Property names + required list — enough to know the call shape, ~20x smaller. */
function compactSignature(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return {};
  }
  const record = schema as Record<string, unknown>;
  const properties =
    record.properties && typeof record.properties === "object"
      ? Object.keys(record.properties as Record<string, unknown>)
      : [];
  const required = Array.isArray(record.required)
    ? record.required.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  return {
    ...(properties.length > 0 ? { properties } : {}),
    ...(required.length > 0 ? { required } : {}),
    schema_omitted: "Call the tool to see the full contract.",
  };
}

/**
 * Keep full input schemas while they fit the budget; compact the rest. Ordering
 * is preserved and relevance-ranked by core, so the matches the agent is most
 * likely to want keep their detail.
 */
export function fitMatchesToBudget(
  matches: readonly ProjectedMatch[],
  budget = MATCHES_BYTE_BUDGET
): { matches: ProjectedMatch[]; compacted: number } {
  const out: ProjectedMatch[] = [];
  let used = 0;
  let compacted = 0;
  for (const match of matches) {
    const full = JSON.stringify(match).length;
    if (used + full <= budget) {
      out.push(match);
      used += full;
      continue;
    }
    const slim = {
      ...match,
      inputSchema: compactSignature(match.inputSchema),
    };
    out.push(slim);
    used += JSON.stringify(slim).length;
    compacted += 1;
  }
  return { compacted, matches: out };
}
