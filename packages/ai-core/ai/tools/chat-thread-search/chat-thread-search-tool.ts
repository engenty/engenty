/**
 * Hybrid search over indexed **orchestrator chat threads** (conversation history).
 * Fetches index health at most once per orchestrator session (plus tenant/user) per process,
 * then runs search. When the index is degraded or missing, streams a small UI artifact and
 * returns notices so the model can caveat results.
 */
import { type Tool, tool } from "ai";
import { z } from "zod";
import { CHAT_THREAD_INDEX_STATUS_ARTIFACT_ID } from "../../artifacts/chat-thread-index-status.js";
import type { ToolExecutionContext } from "../context/types.js";

/** Host operation: index snapshot + health (used internally by this tool). */
export const CHAT_THREAD_INDEX_HEALTH_METHOD =
  "ai_chat_threads_index_health" as const;

export const chatThreadIndexHealthInputSchema = z.object({});

export type ChatThreadIndexHealthInput = z.infer<
  typeof chatThreadIndexHealthInputSchema
>;

/** Registered host operation id for search. */
export const CHAT_THREAD_SEARCH_METHOD = "ai_chat_threads_search" as const;
export const CHAT_THREAD_SEARCH_TOOL_ID = "chatThreadSearch" as const;

export const aiChatsSearchInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max matches to return (default 20)."),
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language query over indexed chat thread content (messages, titles, summaries)."
    ),
  strategy: z
    .enum(["hybrid", "lexical", "semantic"])
    .optional()
    .describe("Search strategy; hybrid is the default."),
});

export type AiChatsSearchInput = z.infer<typeof aiChatsSearchInputSchema>;

interface IndexHealthHostPayload {
  hint?: string;
  index?: Record<string, unknown>;
  index_health: "degraded" | "missing" | "ok";
  ok: boolean;
}

interface SearchHostPayload {
  matches: unknown[];
  total: number;
}

const indexHealthCache = new Map<string, IndexHealthHostPayload>();
const chatThreadSearchToolDescription =
  "Search the current user's indexed orchestrator chat threads (hybrid lexical + semantic). The tool checks index completeness once per chat thread and returns a short notice when the index is missing or incomplete; still returns whatever matches exist so you can answer from partial history. Not for browser or auth sessions.";

export interface ChatThreadSearchToolDefinition {
  description: string;
  execute: (input: AiChatsSearchInput) => Promise<unknown>;
  id: typeof CHAT_THREAD_SEARCH_TOOL_ID;
  inputSchema: typeof aiChatsSearchInputSchema;
}

function indexHealthCacheKey(ctx: ToolExecutionContext): string {
  return [
    ctx.tenantId ?? "",
    ctx.userId ?? "",
    ctx.orchestratorThreadId ?? "",
  ].join("|");
}

async function loadIndexHealth(
  ctx: ToolExecutionContext,
  call: NonNullable<ToolExecutionContext["callGatewayMethod"]>
): Promise<IndexHealthHostPayload> {
  const key = indexHealthCacheKey(ctx);
  const hit = indexHealthCache.get(key);
  if (hit) {
    return hit;
  }
  const raw = await call(CHAT_THREAD_INDEX_HEALTH_METHOD, {});
  const payload = raw as IndexHealthHostPayload;
  indexHealthCache.set(key, payload);
  return payload;
}

function buildIndexNotice(
  health: IndexHealthHostPayload,
  matchTotal: number
): string | undefined {
  if (health.index_health === "ok") {
    return;
  }
  if (health.index_health === "missing") {
    return (
      health.hint ??
      "The chat history index has no documents yet; search may return no matches until you rebuild it in Settings → Development → Search index."
    );
  }
  const base =
    health.hint ??
    "The chat history index is incomplete for some sessions; rebuild it in Settings → Development → Search index so newer threads appear.";
  if (matchTotal > 0) {
    return `${base} Showing ${matchTotal} match(es) from the partial index — verify against live history if recency matters.`;
  }
  return base;
}

async function runChatSessionSearchTool(
  ctx: ToolExecutionContext,
  input: unknown,
  executionOptions?: unknown
): Promise<unknown> {
  const call = ctx.callGatewayMethod;
  if (!call) {
    return { error: "Gateway not available" };
  }
  try {
    const parsed = aiChatsSearchInputSchema.parse(input ?? {});
    const health = await loadIndexHealth(ctx, call);
    const searchRaw = await call(CHAT_THREAD_SEARCH_METHOD, parsed);
    const search = searchRaw as SearchHostPayload;
    const matchTotal =
      typeof search.total === "number" && Number.isFinite(search.total)
        ? search.total
        : 0;

    const index_notice = buildIndexNotice(health, matchTotal);

    return {
      artifact_id:
        health.index_health === "ok"
          ? undefined
          : CHAT_THREAD_INDEX_STATUS_ARTIFACT_ID,
      index: health.index,
      index_health: health.index_health,
      index_notice,
      index_ok: health.ok,
      matches: search.matches,
      total: search.total,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Chat thread search failed",
    };
  }
}

export function buildChatThreadSearchTool(ctx: ToolExecutionContext): Tool {
  return tool({
    description: chatThreadSearchToolDescription,
    inputSchema: aiChatsSearchInputSchema,
    execute: (input, executionOptions) =>
      runChatSessionSearchTool(ctx, input, executionOptions),
  });
}

export function buildMastraChatThreadSearchTool<TTool>(
  createTool: (definition: ChatThreadSearchToolDefinition) => TTool,
  ctx: ToolExecutionContext
): TTool {
  return createTool({
    description: chatThreadSearchToolDescription,
    execute: (input) => runChatSessionSearchTool(ctx, input),
    id: CHAT_THREAD_SEARCH_TOOL_ID,
    inputSchema: aiChatsSearchInputSchema,
  });
}
