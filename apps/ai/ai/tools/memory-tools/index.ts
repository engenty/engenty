// First-class durable-memory tools (modules/memory). Thin wrappers over the
// memory module's gateway ops so agents get memory without the
// discover→execute meta-tool detour. The ops are deliberately low-risk and
// approval-free (slug upsert, soft-delete only), so they also work from
// headless reflection runs where approvalPolicy is "deny".
//
// Compressed memory discipline lives in the tool descriptions (always in
// context); the full policy is the "## Memory" instructions layer appended in
// buildAgentInstructions for agents that carry these tools.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getCurrentEngentyToolsClient } from "../engenty-tools/lib/client.js";
import { coreErrorToToolResult } from "../engenty-tools/lib/errors.js";
import { getEngentyToolsRunContext } from "../engenty-tools/lib/run-context.js";

export const MEMORY_SAVE_TOOL_ID = "memory_save";
export const MEMORY_SEARCH_TOOL_ID = "memory_record_search";
export const MEMORY_ARCHIVE_TOOL_ID = "memory_record_archive";

const scopeKind = z.enum(["user", "project", "entity", "org"]);
const memoryKind = z.enum([
  "fact",
  "preference",
  "lesson",
  "decision",
  "guideline",
]);

interface MemoryRecordLike {
  body_md?: string;
  confidence?: string;
  id?: string;
  kind?: string;
  scope_kind?: string;
  scope_ref?: string | null;
  slug?: string;
  source_kind?: string;
  status?: string;
  title?: string;
  updated_at?: string;
}

function compactRecord(record: MemoryRecordLike) {
  return {
    id: record.id ?? "",
    slug: record.slug ?? "",
    title: record.title ?? "",
    body_md: record.body_md ?? "",
    kind: record.kind ?? "fact",
    scope_kind: record.scope_kind ?? "",
    scope_ref: record.scope_ref ?? null,
    confidence: record.confidence ?? "medium",
    status: record.status ?? "active",
    source_kind: record.source_kind ?? "agent",
    updated_at: record.updated_at ?? "",
  };
}

export const memorySaveTool = createTool({
  id: MEMORY_SAVE_TOOL_ID,
  description:
    "Save a durable memory: a fact, preference, lesson, or decision worth " +
    "remembering beyond this conversation. Choose the narrowest scope that " +
    "fits: user (about this person), project (this goal), entity (a specific " +
    "contact/object, ref like 'contacts.person:<id>'), org (whole company — " +
    "will await human approval). Search the scope first and re-save the same " +
    "slug to update instead of duplicating. Usually the right call is to " +
    "save NOTHING — only what a colleague would write in their notebook.",
  inputSchema: z.object({
    scope_kind: scopeKind,
    scope_ref: z
      .string()
      .optional()
      .describe(
        "user id / project id / '<type>:<id>' entity ref; omit for org"
      ),
    slug: z
      .string()
      .regex(/^[a-z0-9-]{3,60}$/)
      .describe("stable kebab-case key; re-saving the same slug updates it"),
    title: z.string().max(120).describe("the fact, stated as a headline"),
    body_md: z.string().max(4000).describe("markdown body, ~10 lines max"),
    kind: memoryKind.default("fact"),
    confidence: z.enum(["low", "medium", "high"]).default("medium"),
    source_kind: z
      .enum(["agent", "reflection"])
      .default("agent")
      .describe("use 'reflection' only from a post-task reflection step"),
    supersedes: z
      .string()
      .optional()
      .describe(
        "when consolidating near-duplicates: the id of the record this merged record replaces (archive that record afterwards)"
      ),
  }),
  execute: async (input) => {
    const client = getCurrentEngentyToolsClient();
    if (!client.ok) {
      return client;
    }
    try {
      const ctx = getEngentyToolsRunContext();
      const agentTypeKey = ctx.agentTypeKey ?? ctx.agentId;
      const data = (await client.client.invokeTool("memory_record_upsert", {
        ...input,
        ...(agentTypeKey ? { agent_type_key: agentTypeKey } : {}),
      })) as MemoryRecordLike;
      const record = compactRecord(data);
      return {
        ok: true as const,
        id: record.id,
        slug: record.slug,
        status: record.status,
        ...(record.status === "proposed"
          ? {
              note: "Org-scoped memory saved as a proposal — it becomes active once a human approves it.",
            }
          : {}),
      };
    } catch (err) {
      return coreErrorToToolResult(err);
    }
  },
});

export const memorySearchTool = createTool({
  id: MEMORY_SEARCH_TOOL_ID,
  description:
    "Search durable memories (facts, preferences, lessons, decisions) before " +
    "answering anything about a person's preferences, history, or past " +
    "decisions, and before starting work on a project or a specific " +
    "contact/object. Filter by scope to keep recall tight.",
  inputSchema: z.object({
    query: z.string().min(1),
    scope_kind: scopeKind.optional(),
    scope_ref: z
      .string()
      .optional()
      .describe(
        "narrow to one user/project/entity, e.g. 'contacts.person:<id>'"
      ),
    kind: memoryKind.optional(),
    limit: z.number().int().min(1).max(25).default(8),
  }),
  execute: async (input) => {
    const client = getCurrentEngentyToolsClient();
    if (!client.ok) {
      return client;
    }
    try {
      const { query, limit, scope_kind, scope_ref, kind } = input;
      const filters: Record<string, string> = {};
      if (scope_kind) {
        filters.scope_kind = scope_kind;
      }
      if (scope_ref) {
        filters.scope_ref = scope_ref;
      }
      if (kind) {
        filters.kind = kind;
      }
      const data = (await client.client.invokeTool("memory_record_search", {
        query,
        limit,
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
      })) as {
        results?: { item?: { record?: MemoryRecordLike }; score?: number }[];
        total?: number;
      };
      const results = (data.results ?? [])
        .map((entry) => {
          const record = entry.item?.record;
          if (!record) {
            return null;
          }
          return { ...compactRecord(record), score: entry.score ?? 0 };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return {
        ok: true as const,
        results,
        total: data.total ?? results.length,
      };
    } catch (err) {
      return coreErrorToToolResult(err);
    }
  },
});

export const memoryArchiveTool = createTool({
  id: MEMORY_ARCHIVE_TOOL_ID,
  description:
    "Archive a memory record that is wrong or no longer true (soft delete — " +
    "it drops out of recall). Use when the user says a memory is outdated, " +
    "or you directly observe it no longer holds. Never archive human-authored " +
    "records, org guidelines, or pending proposals — flag those to a human.",
  inputSchema: z.object({
    id: z.string().min(1).describe("record id from memory_record_search"),
  }),
  execute: async (input) => {
    const client = getCurrentEngentyToolsClient();
    if (!client.ok) {
      return client;
    }
    try {
      const data = (await client.client.invokeTool("memory_record_archive", {
        id: input.id,
      })) as MemoryRecordLike;
      return {
        ok: true as const,
        id: data.id ?? input.id,
        status: data.status ?? "archived",
      };
    } catch (err) {
      return coreErrorToToolResult(err);
    }
  },
});

export function createMemoryTools() {
  return {
    [MEMORY_SAVE_TOOL_ID]: memorySaveTool,
    [MEMORY_SEARCH_TOOL_ID]: memorySearchTool,
    [MEMORY_ARCHIVE_TOOL_ID]: memoryArchiveTool,
  };
}
