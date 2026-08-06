import { Agent } from "@mastra/core/agent";
import type { MastraMemory, MemoryConfig } from "@mastra/core/memory";
import { MastraCompositeStore, type MemoryStorage } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import { z } from "zod";

import { AiSessionError } from "../errors.js";
import type { EngentyNativeMemoryAgent } from "./invocation-options.js";

const ENGENTY_MEMORY_STORE_ID = "engenty-session-memory";

// The agent-maintained per-USER profile (resource-scoped working memory):
// injected into the system prompt each turn and updated by the agent via the
// auto-registered `updateWorkingMemory` tool. Deliberately small and bounded —
// schema form MERGES updates (vs free-form template replacement) and the
// settings UI renders it read-only ("what the assistant knows about you").
// Persistence: the adapter's resource methods, delegated to ai.mastra_resources
// keyed `${tenantId}:${userId}`.
//
// BOUNDARY vs the memory module (memory_save): this profile is the tiny,
// always-in-context *identity/context* snapshot only. Anything specific and
// durable a user states — "always sign off with 'lg, Matthias'", "never batch
// LinkedIn lookups" — belongs in memory_save, NOT here, so it is itemized,
// cited, recallable, and governed. Mastra builds its auto-injected working-
// memory instructions from these field descriptions, so the descriptions
// actively delegate specifics to memory_save to stop the model from parking
// durable preferences/facts in the profile where the memory UI can't see them.
export const workingMemoryProfileSchema = z.object({
  preferred_language: z
    .string()
    .max(32)
    .optional()
    .describe("Language the user prefers to be answered in"),
  role: z
    .string()
    .max(200)
    .optional()
    .describe("The user's role/job context, in their own words"),
  current_focus: z
    .string()
    .max(300)
    .optional()
    .describe("What the user is currently working on or toward"),
  preferences: z
    .array(z.string().max(200))
    .max(12)
    .optional()
    .describe(
      "At most a couple of broad, always-relevant working defaults (e.g. 'writes in German'). A specific stated preference the user asks you to remember is NOT stored here — save it with memory_save (scope user) so it is tracked and recallable."
    ),
  facts: z
    .array(z.string().max(200))
    .max(12)
    .optional()
    .describe(
      "Only ambient context that must be in every prompt. Concrete facts about people, projects, or how the user works belong in memory_save (the memory module), not here."
    ),
});

// Mastra's default title instructions, plus: answer in the USER's language.
const GENERATE_TITLE_INSTRUCTIONS = `
- generate a short title based on the first message a user begins a conversation with
- ensure it is not more than 80 characters long
- the title should be a summary of the user's message
- write the title in the same language as the user's message
- do not use quotes or colons
- the entire text you return will be used as the title`;

export interface EngentySessionMastraMemoryOptions {
  storage: MemoryStorage;
}

// Recall window for Mastra MessageList on each agent step. History beyond this
// window is not injected into the model prompt. We rely on Mastra's end-of-step
// write to EngentySessionMemoryStorage (not savePerStep) unless mid-run reload
// tests prove we need per-step persistence for suspended/resumed runs.
export function createEngentySessionMastraMemory(
  options: EngentySessionMastraMemoryOptions
): Memory {
  return new Memory({
    options: {
      lastMessages: 40,
      // Title synthesis on the thread's FIRST exchange only (compiled gate:
      // `!thread.title`); `model` omitted → the agent's own model. A failure
      // logs and returns undefined — it never breaks the run.
      // Mastra 1.55 types require `model` on the object form; runtime still
      // falls back to the agent model when it is omitted.
      generateTitle: {
        instructions: GENERATE_TITLE_INSTRUCTIONS,
      } as NonNullable<MemoryConfig["generateTitle"]>,
      workingMemory: {
        enabled: true,
        // Per-user across all their chats (Mastra resourceId = engenty userId).
        scope: "resource",
        schema: workingMemoryProfileSchema,
      },
    },
    storage: new MastraCompositeStore({
      domains: { memory: options.storage },
      id: ENGENTY_MEMORY_STORE_ID,
    }),
  });
}

export async function createEngentyNativeMastraMemoryAgent(input: {
  agent: Agent;
  memory: MastraMemory;
}): Promise<Agent> {
  const [instructions, tools] = await Promise.all([
    input.agent.getInstructions(),
    input.agent.listTools(),
  ]);

  return new Agent({
    description: input.agent.getDescription(),
    id: input.agent.id,
    instructions,
    mastra: input.agent.getMastraInstance(),
    memory: input.memory,
    model: input.agent.model as never,
    name: input.agent.name,
    tools,
  });
}

export async function bindEngentyNativeMastraMemory<
  TAgent extends EngentyNativeMemoryAgent,
>(input: {
  agent: TAgent;
  details?: Record<string, unknown>;
  memory: MastraMemory;
}): Promise<TAgent | Agent> {
  if (
    input.agent.hasOwnMemory?.() === true &&
    typeof input.agent.getMemory === "function"
  ) {
    return input.agent;
  }

  if (input.agent instanceof Agent) {
    return createEngentyNativeMastraMemoryAgent({
      agent: input.agent,
      memory: input.memory,
    });
  }

  throw new AiSessionError(
    "agent_threads.nativeMemoryUnavailable",
    "Native Mastra memory requires an agent configured with a concrete memory instance",
    input.details
  );
}
