/**
 * `memory_note` / `memory_forget` — how an agent keeps and drops facts.
 *
 * The agent picks the scope; the tool only offers the scopes this run may
 * write (memory-scopes.ts), so the schema itself says what is possible here.
 * The company scope is not written here: it goes through core's
 * `company_memory_add` / `company_memory_remove`, which park on an approval
 * only a holder of `core.company_memory.manage` can decide.
 */
import {
  COMPANY_MEMORY_ADD_OPERATION_ID,
  COMPANY_MEMORY_REMOVE_OPERATION_ID,
  MEMORY_BODY_MAX_CHARS,
  MEMORY_SHORT_ID_LENGTH,
  type MemoryScope,
  memorySectionFits,
  normalizeMemoryBody,
  shortMemoryId,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { MemoryEntryStore } from "../../dal/memory/index.js";
import type { MemoryKeys } from "./memory-scopes.js";
import { WORKING_MEMORY_INSTRUCTIONS } from "./working-memory.js";

export const MEMORY_NOTE_TOOL_ID = "memory_note";
export const MEMORY_FORGET_TOOL_ID = "memory_forget";

type LocalScope = Exclude<MemoryScope, "company">;

const LOCAL_SCOPES: readonly LocalScope[] = ["user", "agent", "space"];

const SCOPE_DESCRIPTIONS: Record<LocalScope, string> = {
  agent:
    "agent — only you need it, for your work here (how they like your reports, the setup of a job you do)",
  space:
    "space — everyone in this Space should know it (who the client is, conventions, tools in use)",
  user: "user — about the person you are talking to, useful to every assistant (name, how to address them, time zone, language)",
};

/** What the agent is told about memory, appended to its instructions. */
export const AGENT_MEMORY_INSTRUCTIONS = `## Memory

Facts kept on purpose, delivered every turn as "Memory", one section per scope. One line per fact someone will need again: a decision, a preference, a convention, where something lives. Not a transcript, not a task list.
- Keep a fact with \`${MEMORY_NOTE_TOOL_ID}\`; you decide the scope: \`user\` (about the person you are talking to, for every assistant — only on a private line with them), \`agent\` (only you need it for your work here), \`space\` (everyone in this Space should know it). The tool lists the scopes open in this conversation.
- When the person says where it belongs, follow that: "just for you" is \`agent\`, "for all my assistants" is \`user\`, "for everyone here" is \`space\`.
- For something every Space should know, call \`${COMPANY_MEMORY_ADD_OPERATION_ID}\` — someone allowed to decide approves it first.
- Drop a line with \`${MEMORY_FORGET_TOOL_ID}\` and the id in its brackets when it is wrong, done or stale (\`${COMPANY_MEMORY_REMOVE_OPERATION_ID}\` for a company line).
- Each section has a size limit. When a note is refused as too large, forget the oldest or least useful lines of that section first (oldest are at the top), then note it again.
- Records belong in the apps; documents in /space or /company/files.

${WORKING_MEMORY_INSTRUCTIONS}`;

export function createMemoryTools(input: {
  keys: MemoryKeys;
  store: MemoryEntryStore;
  tenantId: string;
  threadId: string;
  /** Who said it; null for an unattended run. */
  userId: string | null;
}) {
  const scopes = LOCAL_SCOPES.filter((scope) => input.keys[scope]);
  const [first, ...rest] = scopes;
  if (!first) {
    return null;
  }

  const note = createTool({
    id: MEMORY_NOTE_TOOL_ID,
    description:
      "Keep one fact in memory for later runs. One sentence; the date is added. Refused when its section would exceed its size limit: forget stale lines of that section first.",
    inputSchema: z.object({
      note: z.string().min(1).max(MEMORY_BODY_MAX_CHARS),
      scope: z
        .enum([first, ...rest])
        .describe(
          `Who the fact is for: ${scopes.map((scope) => SCOPE_DESCRIPTIONS[scope]).join("; ")}.`
        ),
    }),
    outputSchema: z.object({
      characters: z.number(),
      id: z.string().optional(),
      kept: z.boolean(),
      reason: z.string().optional(),
    }),
    execute: async ({ note: text, scope }) => {
      const key = input.keys[scope];
      const body = normalizeMemoryBody(text);
      if (!key) {
        return {
          characters: 0,
          kept: false,
          reason: `The ${scope} scope is not open in this conversation.`,
        };
      }
      const rows = await input.store.list({ key, tenantId: input.tenantId });
      const { fits, length, limit } = memorySectionFits({ body, rows, scope });
      if (!fits) {
        return {
          characters: length,
          kept: false,
          reason: `The ${scope} section would be ${length} characters; the limit is ${limit}. Forget the oldest or least useful ${scope} lines with ${MEMORY_FORGET_TOOL_ID}, then note this again.`,
        };
      }
      const row = await input.store.insert({
        body,
        createdByUserId: input.userId,
        key,
        sourceThreadId: input.threadId,
        tenantId: input.tenantId,
      });
      return { characters: length, id: shortMemoryId(row.id), kept: true };
    },
  });

  const forget = createTool({
    id: MEMORY_FORGET_TOOL_ID,
    description: `Remove one line from memory by the id in its brackets (${MEMORY_SHORT_ID_LENGTH} characters). Company lines are removed with ${COMPANY_MEMORY_REMOVE_OPERATION_ID}.`,
    inputSchema: z.object({
      id: z.string().trim().min(MEMORY_SHORT_ID_LENGTH).max(36),
    }),
    outputSchema: z.object({
      removed: z.boolean(),
      scope: z.string().optional(),
    }),
    execute: async ({ id }) => {
      const wanted = shortMemoryId(id);
      for (const scope of scopes) {
        const key = input.keys[scope];
        if (!key) {
          continue;
        }
        const rows = await input.store.list({ key, tenantId: input.tenantId });
        const row = rows.find(
          (candidate) => shortMemoryId(candidate.id) === wanted
        );
        if (row) {
          const removed = await input.store.delete({
            id: row.id,
            key,
            tenantId: input.tenantId,
          });
          return { removed, scope };
        }
      }
      return { removed: false };
    },
  });

  return { [MEMORY_NOTE_TOOL_ID]: note, [MEMORY_FORGET_TOOL_ID]: forget };
}

export type MemoryTools = NonNullable<ReturnType<typeof createMemoryTools>>;
