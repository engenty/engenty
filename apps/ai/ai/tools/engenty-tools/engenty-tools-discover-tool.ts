import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { generateText } from "ai";
import { catalogDiscoveryResult } from "./lib/catalog-result.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { normalizeToolContract } from "./lib/format.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import { isToolVisibleInSpace } from "./lib/space-gate.js";
import {
  type DiscoverEngentyToolInput,
  type DiscoverEngentyToolOptions,
  discoverInputSchema,
} from "./schema/schemas.js";
import type { NormalizedEngentyToolEntry } from "./schema/types.js";

export const ENGENTY_TOOLS_DISCOVER_TOOL_ID = "engenty_tools_discover";

const MAX_AVAILABLE_TOOL_LINES = 160;

export const engentyToolsDiscoverTool = createTool({
  id: ENGENTY_TOOLS_DISCOVER_TOOL_ID,
  description:
    "Semantically discover the best Engenty tool ids for a user request. This is catalog discovery only; it does not fetch app data. Prefer this when keyword search is too broad or the useful tool name is unclear.",
  inputSchema: discoverInputSchema,
  execute: async (input, context) => discoverEngentyTools(input, context),
});

export function createEngentyToolsDiscoverTool() {
  return engentyToolsDiscoverTool;
}

export async function discoverEngentyTools(
  input: DiscoverEngentyToolInput,
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  try {
    const parsed = discoverInputSchema.parse(input);
    const space = getEngentyToolsRunContext().space;
    const entries = (await client.client.listToolContracts())
      .map(normalizeToolContract)
      .filter((entry) =>
        isToolVisibleInSpace(
          {
            operationId: entry.id,
            ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
          },
          space
        )
      )
      .filter((entry) => matchesDiscoveryFilters(entry, parsed));
    const selectedIds = await selectToolIds(parsed, entries);
    const selected = selectedIds
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is NormalizedEngentyToolEntry => Boolean(entry))
      .slice(0, parsed.limit);
    const fallbackSelected =
      selected.length > 0
        ? []
        : rankToolsLexically(parsed.request, entries).slice(0, parsed.limit);
    const matches = selected.length > 0 ? selected : fallbackSelected;

    return catalogDiscoveryResult(space, {
      matches: matches.map((entry) => ({
        name: entry.id,
        description: entry.description ?? entry.summary ?? "",
        inputSchema: entry.input.jsonSchema ?? {},
        outputSchema: entry.output.jsonSchema ?? {},
      })),
    });
  } catch (err) {
    return coreErrorToToolResult(err);
  }
}

function matchesDiscoveryFilters(
  entry: NormalizedEngentyToolEntry,
  input: DiscoverEngentyToolOptions
) {
  if (input.moduleId && entry.moduleId !== input.moduleId) {
    return false;
  }
  if (input.readOnlyOnly && !entry.execution.readOnly) {
    return false;
  }
  return true;
}

async function selectToolIds(
  input: DiscoverEngentyToolOptions,
  entries: NormalizedEngentyToolEntry[]
): Promise<string[]> {
  if (entries.length === 0 || !readAiGatewayApiKeyFromEnv()) {
    return [];
  }
  try {
    const { text } = await generateText({
      model: resolveChatModelId({ purpose: "routing" }),
      prompt: buildDiscoveryPrompt(input.request, entries),
      maxOutputTokens: 96,
    });
    return parseToolIds(text, entries);
  } catch {
    return [];
  }
}

function buildDiscoveryPrompt(
  request: string,
  entries: NormalizedEngentyToolEntry[]
) {
  return [
    "Return a comma-separated list of tool IDs for the given request.",
    "ONLY return the list. Do not explain.",
    "",
    "<EXAMPLE_OUTPUT>kb.list, kb.search</EXAMPLE_OUTPUT>",
    "",
    `<REQUEST>${request}</REQUEST>`,
    "",
    '<AVAILABLE-TOOLS format="yaml">',
    formatAvailableToolsYaml(entries),
    "</AVAILABLE-TOOLS>",
  ].join("\n");
}

function formatAvailableToolsYaml(entries: NormalizedEngentyToolEntry[]) {
  const groups = new Map<string, NormalizedEngentyToolEntry[]>();
  for (const entry of entries.slice(0, MAX_AVAILABLE_TOOL_LINES)) {
    const moduleId = entry.moduleId ?? "core";
    groups.set(moduleId, [...(groups.get(moduleId) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([moduleId, moduleEntries]) =>
      [
        `${escapeYamlLine(moduleId)}:`,
        ...moduleEntries.map(
          (entry) =>
            `  - ${escapeYamlLine(entry.id)}: ${escapeYamlLine(toolText(entry))}`
        ),
      ].join("\n")
    )
    .join("\n");
}

function parseToolIds(text: string, entries: NormalizedEngentyToolEntry[]) {
  const validIds = new Set(entries.map((entry) => entry.id));
  const seen = new Set<string>();
  const cleaned = text
    .replaceAll("`", "")
    .replace(/<[^>]+>/g, " ")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const item of cleaned) {
    const id = item.split(/\s+/)[0]?.trim();
    if (id && validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function rankToolsLexically(
  request: string,
  entries: NormalizedEngentyToolEntry[]
) {
  const requestText = request.toLowerCase();
  const requestTokens = tokenize(request);
  return entries
    .map((entry) => ({
      entry,
      score: scoreTool(entry, requestText, requestTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .map((item) => item.entry);
}

function scoreTool(
  entry: NormalizedEngentyToolEntry,
  requestText: string,
  requestTokens: Set<string>
) {
  const id = entry.id.toLowerCase();
  const summary = entry.summary?.toLowerCase() ?? "";
  const description = entry.description?.toLowerCase() ?? "";
  const moduleId = entry.moduleId?.toLowerCase() ?? "";
  let score = 0;
  if (requestText.includes(id)) {
    score += 100;
  }
  for (const token of requestTokens) {
    if (id.includes(token)) {
      score += 16;
    }
    if (summary.includes(token)) {
      score += 10;
    }
    if (description.includes(token)) {
      score += 6;
    }
    if (moduleId.includes(token)) {
      score += 4;
    }
  }
  if (entry.execution.readOnly) {
    score += 2;
  }
  return score;
}

function toolText(entry: NormalizedEngentyToolEntry) {
  return [entry.title, entry.summary, entry.description]
    .filter(Boolean)
    .join(" - ");
}

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}.:-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function escapeYamlLine(value: string) {
  return value.replace(/\s+/g, " ").replaceAll("\n", " ").trim();
}
