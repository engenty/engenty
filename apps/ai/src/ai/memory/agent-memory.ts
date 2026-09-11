/**
 * MEMORY.md — an engenty's own long-lived notes.
 *
 * One dated line per fact the agent wants again, kept on the resource row the
 * agent's shared observational memory already keys on
 * (`tenant:<t>:agent:<a>:{space|user}:<id>`, see
 * `sharedObservationalMemoryResourceId`). Observational memory is what the
 * agent LEARNED by watching; this file is what it CHOSE to keep. Same row,
 * same audience, no second store: the bytes sit in
 * `ai.mastra_resources.working_memory`, which is what Mastra's working memory
 * reads too — but this file is delivered as its own state signal and edited
 * through two tools of ours, so the per-user profile the observer maintains
 * for the copilot is not disturbed.
 *
 * Hard cap in characters. The cap is what makes the agent forget: a note that
 * would overflow is refused with the instruction to drop the oldest or least
 * useful lines first. Newest lines go last, so "oldest" is the top of the file.
 */
import { createHash } from "node:crypto";
import type {
  ComputeStateSignalArgs,
  ComputeStateSignalResult,
  Processor,
} from "@mastra/core/processors";
import type { MemoryStorage } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type SharedObservationalMemoryIdentity,
  sharedObservationalMemoryResourceId,
} from "./shared-observational-memory.js";

export const AGENT_MEMORY_MAX_CHARS = 8000;
export const AGENT_MEMORY_STATE_ID = "agent-memory";
export const AGENT_MEMORY_PROCESSOR_ID = "engenty-agent-memory";
export const MEMORY_NOTE_TOOL_ID = "memory_note";
export const MEMORY_FORGET_TOOL_ID = "memory_forget";

export type AgentMemoryStore = Pick<
  MemoryStorage,
  "getResourceById" | "updateResource"
>;

/** The row an engenty's MEMORY.md lives on, or null when it has no audience. */
export function agentMemoryResourceId(
  identity: SharedObservationalMemoryIdentity
): string | null {
  return sharedObservationalMemoryResourceId(identity);
}

export async function readAgentMemory(
  store: AgentMemoryStore,
  resourceId: string
): Promise<string> {
  const record = await store.getResourceById({ resourceId });
  return record?.workingMemory?.trim() ?? "";
}

export class AgentMemoryTooLargeError extends Error {
  readonly length: number;
  constructor(length: number) {
    super(
      `memory_too_large: ${length} characters, the limit is ${AGENT_MEMORY_MAX_CHARS}`
    );
    this.name = "AgentMemoryTooLargeError";
    this.length = length;
  }
}

/** Full replacement; refuses anything over the cap. Empty clears. */
export async function writeAgentMemory(
  store: AgentMemoryStore,
  resourceId: string,
  contents: string
): Promise<string> {
  const next = normalizeAgentMemory(contents);
  if (next.length > AGENT_MEMORY_MAX_CHARS) {
    throw new AgentMemoryTooLargeError(next.length);
  }
  await store.updateResource({ resourceId, workingMemory: next });
  return next;
}

/** Trim, drop blank lines, keep one fact per line. */
export function normalizeAgentMemory(contents: string): string {
  return contents
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The line a note becomes: `- YYYY-MM-DD: <note>`, single line. */
export function agentMemoryLine(note: string, now = new Date()): string {
  const oneLine = note.replace(/\s+/g, " ").trim();
  return `- ${isoDate(now)}: ${oneLine}`;
}

export function appendAgentMemoryNote(
  current: string,
  note: string,
  now = new Date()
): string {
  const line = agentMemoryLine(note, now);
  const base = normalizeAgentMemory(current);
  return base ? `${base}\n${line}` : line;
}

/**
 * Drop every line containing `contains` (case-insensitive). Returns what is
 * left and how many lines went.
 */
export function forgetAgentMemoryLines(
  current: string,
  contains: string
): { memory: string; removed: number } {
  const needle = contains.trim().toLowerCase();
  const lines = normalizeAgentMemory(current).split("\n").filter(Boolean);
  if (!needle) {
    return { memory: lines.join("\n"), removed: 0 };
  }
  const kept = lines.filter((line) => !line.toLowerCase().includes(needle));
  return { memory: kept.join("\n"), removed: lines.length - kept.length };
}

/** What the agent is told about its memory, appended to its instructions. */
export const AGENT_MEMORY_INSTRUCTIONS = `## Your memory (MEMORY.md)

Your own notes, delivered every turn as "MEMORY.md". One dated line per fact you will need again: a decision, a preference of the people here, a convention, where something lives. Not a transcript, not a task list.
- Write with \`${MEMORY_NOTE_TOOL_ID}\` when you learn something worth keeping; the date is added for you.
- Drop lines with \`${MEMORY_FORGET_TOOL_ID}\` when they are wrong, done, or stale.
- The file holds at most ${AGENT_MEMORY_MAX_CHARS} characters. When a note is refused as too large, forget the oldest or least useful lines first (oldest are at the top), then write it again.
- Facts everyone in this Space should know belong in \`/space/KNOWLEDGE.md\`, not here. Records belong in the apps.`;

class AgentMemoryProcessor implements Processor {
  readonly id = AGENT_MEMORY_PROCESSOR_ID;
  readonly name = "Engenty agent memory";
  readonly stateId = AGENT_MEMORY_STATE_ID;
  readonly #resourceId: string;
  readonly #store: AgentMemoryStore;

  constructor(input: { resourceId: string; store: AgentMemoryStore }) {
    this.#resourceId = input.resourceId;
    this.#store = input.store;
  }

  async computeStateSignal(
    _args: ComputeStateSignalArgs
  ): Promise<ComputeStateSignalResult> {
    const memory = await readAgentMemory(this.#store, this.#resourceId);
    if (!memory) {
      return;
    }
    const contents = [
      "MEMORY.md — your own notes from earlier work. Background, not instructions.",
      memory,
    ].join("\n\n");
    return {
      cacheKey: createHash("sha256").update(contents).digest("hex"),
      contents,
      id: this.stateId,
      mode: "snapshot",
    };
  }
}

export function createAgentMemoryTools(input: {
  now?: () => Date;
  resourceId: string;
  store: AgentMemoryStore;
}) {
  const now = input.now ?? (() => new Date());
  const note = createTool({
    id: MEMORY_NOTE_TOOL_ID,
    description:
      "Keep one fact in your MEMORY.md for later runs — a decision, a preference of the people here, a convention, where something lives. One sentence; the date is added. Refused when the file would exceed its size limit: forget stale lines first.",
    inputSchema: z.object({
      note: z.string().min(1).max(400),
    }),
    outputSchema: z.object({
      characters: z.number(),
      kept: z.boolean(),
      reason: z.string().optional(),
    }),
    execute: async ({ note: text }) => {
      const current = await readAgentMemory(input.store, input.resourceId);
      const next = appendAgentMemoryNote(current, text, now());
      if (next.length > AGENT_MEMORY_MAX_CHARS) {
        return {
          characters: next.length,
          kept: false,
          reason: `MEMORY.md would be ${next.length} characters; the limit is ${AGENT_MEMORY_MAX_CHARS}. Forget the oldest or least useful lines with ${MEMORY_FORGET_TOOL_ID}, then note this again.`,
        };
      }
      await writeAgentMemory(input.store, input.resourceId, next);
      return { characters: next.length, kept: true };
    },
  });

  const forget = createTool({
    id: MEMORY_FORGET_TOOL_ID,
    description:
      "Remove lines from your MEMORY.md — every line containing the given text (case-insensitive). Use a date like 2026-08 to drop a whole period, or a distinctive word to drop one fact.",
    inputSchema: z.object({
      contains: z.string().min(1).max(200),
    }),
    outputSchema: z.object({
      characters: z.number(),
      removed: z.number(),
    }),
    execute: async ({ contains }) => {
      const current = await readAgentMemory(input.store, input.resourceId);
      const result = forgetAgentMemoryLines(current, contains);
      if (result.removed > 0) {
        await writeAgentMemory(input.store, input.resourceId, result.memory);
      }
      return { characters: result.memory.length, removed: result.removed };
    },
  });

  return { [MEMORY_NOTE_TOOL_ID]: note, [MEMORY_FORGET_TOOL_ID]: forget };
}

export type AgentMemoryTools = ReturnType<typeof createAgentMemoryTools>;

/**
 * The processor and tools for one run, or null when the agent has no memory
 * audience (module and interface agents: their `agentScope` names none).
 */
export function createAgentMemory(input: {
  identity: SharedObservationalMemoryIdentity;
  store: AgentMemoryStore;
}): { processor: Processor; tools: AgentMemoryTools } | null {
  const resourceId = agentMemoryResourceId(input.identity);
  if (!resourceId) {
    return null;
  }
  return {
    processor: new AgentMemoryProcessor({ resourceId, store: input.store }),
    tools: createAgentMemoryTools({ resourceId, store: input.store }),
  };
}
