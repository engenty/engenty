// `recall_chapters`: an agent reads the chapters of the conversation it is in
// — the copilot its river, a specialist its desk line or a DM.
//
// "What did we discuss last Tuesday?" is a question about a stretch of this
// one conversation, not about the whole of memory — so it is answered from
// the chapters (compact-river.ts), by date and by space, not by a semantic
// search that would rank a Tuesday against every other day.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ThreadStore } from "../../dal/threads/index.js";
import { formatChapterRange } from "./chapter-ranges.js";

export const RECALL_CHAPTERS_TOOL_ID = "recall_chapters";

const MAX_CHAPTERS = 12;

export function createRecallChaptersTool(input: {
  store: ThreadStore;
  tenantId: string;
  threadId: string;
  timeZone: string;
}) {
  return createTool({
    id: RECALL_CHAPTERS_TOOL_ID,
    description:
      'Read the chapters of this conversation: its summaries by day, week or on request, each with the spaces it happened in and what to keep in mind. Use it for questions about a past stretch — "what did we discuss last Tuesday", "what was open in space engrd last week" — before searching memory. Filter by date range, space key or a word from the summaries.',
    inputSchema: z.object({
      contains: z
        .string()
        .trim()
        .max(120)
        .optional()
        .describe(
          "A word or phrase the chapter's title, summary or notes contain (case-insensitive)."
        ),
      from: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Only chapters ending after this instant (ISO 8601)."),
      space_key: z
        .string()
        .trim()
        .max(120)
        .optional()
        .describe("Only chapters with turns in this space (its URL key)."),
      to: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Only chapters starting before this instant (ISO 8601)."),
    }),
    outputSchema: z.object({
      chapters: z.array(
        z.object({
          id: z.string(),
          keep_in_mind: z.array(
            z.object({ space_key: z.string().nullable(), text: z.string() })
          ),
          kind: z.string(),
          range: z.string(),
          range_end: z.string(),
          range_start: z.string(),
          spaces: z.array(z.string()),
          summary: z.string(),
          title: z.string(),
        })
      ),
      total: z.number(),
    }),
    execute: async (args) => {
      const rows = await input.store.listCompactions({
        tenantId: input.tenantId,
        threadId: input.threadId,
      });
      const from = args.from ? new Date(args.from).getTime() : null;
      const to = args.to ? new Date(args.to).getTime() : null;
      const needle = args.contains?.toLowerCase() ?? "";
      const spaceKey = args.space_key?.toLowerCase() ?? "";
      const matching = rows.filter((row) => {
        if (from !== null && new Date(row.range_end).getTime() <= from) {
          return false;
        }
        if (to !== null && new Date(row.range_start).getTime() >= to) {
          return false;
        }
        if (
          spaceKey &&
          !row.spaces.some((space) => space.key?.toLowerCase() === spaceKey)
        ) {
          return false;
        }
        if (needle) {
          const haystack = [
            row.title,
            row.summary,
            ...row.keep_in_mind.map((note) => note.text),
          ]
            .join("\n")
            .toLowerCase();
          if (!haystack.includes(needle)) {
            return false;
          }
        }
        return true;
      });
      return {
        chapters: matching.slice(0, MAX_CHAPTERS).map((row) => ({
          id: row.id,
          keep_in_mind: row.keep_in_mind,
          kind: row.kind,
          range: formatChapterRange({
            end: new Date(row.range_end),
            kind: row.kind,
            start: new Date(row.range_start),
            timeZone: input.timeZone,
          }),
          range_end: row.range_end,
          range_start: row.range_start,
          spaces: row.spaces.map((space) => space.key ?? space.id),
          summary: row.summary,
          title: row.title,
        })),
        total: matching.length,
      };
    },
  });
}
