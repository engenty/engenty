import { Agent } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import { MastraCompositeStore, type MemoryStorage } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";

import { AiSessionError } from "../errors.js";
import type { EngentyNativeMemoryAgent } from "./invocation-options.js";

const ENGENTY_MEMORY_STORE_ID = "engenty-session-memory";

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
