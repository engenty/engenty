/**
 * General web search tool for specialists. Use for complementary public facts
 * (official website, contact details, roles, etc.). Import from @engenty/ai-core.
 */
import { openai } from "@ai-sdk/openai";
import { generateText, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { DEFAULT_AI_CHAT_MODEL_ID } from "../../../src/config/chat-model-id.js";

export const webSearchTool = openai.tools.webSearch() as Tool;

export const WEB_SEARCH_TOOL_ID = "web_search" as const;

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Focused web search query for public, current, or first-party evidence."
    ),
  searchContextSize: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Amount of web context to ask the provider to gather."),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export interface WebSearchSource {
  title?: string;
  type?: string;
  url: string;
}

export interface WebSearchResult {
  ok: true;
  query: string;
  sources: WebSearchSource[];
  text: string;
}

interface BuildMastraWebSearchToolOptions {
  model?: string;
  search?: (input: WebSearchInput) => Promise<WebSearchResult>;
}

export interface WebSearchToolDefinition {
  description: string;
  execute: (input: WebSearchInput) => Promise<WebSearchResult>;
  id: typeof WEB_SEARCH_TOOL_ID;
  inputSchema: typeof webSearchInputSchema;
}

const webSearchToolDescription =
  "Search the public web for current or first-party evidence. Use this for official websites, imprint/contact pages, registry pages, public profiles, and other public facts that are not available in Engenty data.";

function normalizeWebSearchSources(sources: unknown): WebSearchSource[] {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources.flatMap((source) => {
    if (!source || typeof source !== "object") {
      return [];
    }
    const record = source as Record<string, unknown>;
    if (typeof record.url !== "string" || record.url.trim().length === 0) {
      return [];
    }
    return [
      {
        ...(typeof record.title === "string" ? { title: record.title } : {}),
        ...(typeof record.type === "string" ? { type: record.type } : {}),
        url: record.url,
      },
    ];
  });
}

export async function runWebSearch(
  input: WebSearchInput,
  options: BuildMastraWebSearchToolOptions = {}
): Promise<WebSearchResult> {
  const parsed = webSearchInputSchema.parse(input);

  if (options.search) {
    return options.search(parsed);
  }

  const result = await generateText({
    model: options.model ?? DEFAULT_AI_CHAT_MODEL_ID,
    prompt: `Search the public web for: ${parsed.query}

Return a concise evidence summary and preserve source URLs.`,
    toolChoice: { toolName: WEB_SEARCH_TOOL_ID, type: "tool" },
    tools: {
      [WEB_SEARCH_TOOL_ID]: openai.tools.webSearch({
        ...(parsed.searchContextSize
          ? { searchContextSize: parsed.searchContextSize }
          : {}),
      }),
    } as ToolSet,
  });

  return {
    ok: true,
    query: parsed.query,
    sources: normalizeWebSearchSources(result.sources),
    text: result.text,
  };
}

export function buildMastraWebSearchTool<TTool>(
  createTool: (definition: WebSearchToolDefinition) => TTool,
  options: BuildMastraWebSearchToolOptions = {}
): TTool {
  return createTool({
    description: webSearchToolDescription,
    execute: (input) => runWebSearch(input, options),
    id: WEB_SEARCH_TOOL_ID,
    inputSchema: webSearchInputSchema,
  });
}
