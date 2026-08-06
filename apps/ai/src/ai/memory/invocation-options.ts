import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import type { ThreadStore } from "../../dal/threads/index.js";
import { AiSessionError } from "../errors.js";
import { createEngentySupervisorDelegationConfig } from "../supervisor/delegation.js";
import { createEngentySessionMastraMemory } from "./concrete-memory.js";
import {
  createEngentySessionMemoryStorage,
  type EngentySessionMemoryScope,
} from "./engenty-session-memory-storage.js";

export interface EngentyMemoryIdentityInput {
  scope: EngentySessionMemoryScope;
  threadId: string;
}

export interface EngentyMemoryInvocationInput
  extends EngentyMemoryIdentityInput {
  memoryOptions?: NonNullable<
    AgentExecutionOptionsBase<unknown>["memory"]
  >["options"];
}

export interface EngentySessionMemoryRuntimeInput
  extends EngentyMemoryInvocationInput {
  agentId: string;
  store: ThreadStore;
  // Durable attachment parts for the current user turn, appended to the user
  // message on persist (Mastra saves the turn text-only). See the storage.
  userAttachmentParts?: readonly unknown[];
  // Client-assigned id of the current user turn — the persisted row adopts it
  // so DB snapshots and the run stream agree on the message id. See the storage.
  userMessageId?: string | null;
}

export interface EngentyNativeMemoryAgent {
  getMemory?: () =>
    | MastraMemory
    | Promise<MastraMemory | undefined>
    | undefined;
  hasOwnMemory?: () => boolean;
  id?: string;
}

export function createEngentyMastraThreadId(
  input: Pick<EngentyMemoryIdentityInput, "threadId">
) {
  return input.threadId;
}

export function createEngentyMastraResourceId(
  input: Pick<EngentyMemoryIdentityInput, "scope">
) {
  return input.scope.userId;
}

export function createEngentyMemoryInvocationOptions(
  input: EngentyMemoryInvocationInput
): Pick<AgentExecutionOptionsBase<unknown>, "memory"> {
  const options = input.memoryOptions;
  return {
    memory: {
      thread: createEngentyMastraThreadId(input),
      resource: createEngentyMastraResourceId(input),
      ...(options ? { options } : {}),
    },
  };
}

export function createEngentySessionMemoryRuntime(
  input: EngentySessionMemoryRuntimeInput
) {
  const storage = createEngentySessionMemoryStorage({
    agentId: input.agentId,
    scope: input.scope,
    store: input.store,
    ...(input.userAttachmentParts && input.userAttachmentParts.length > 0
      ? { userAttachmentParts: input.userAttachmentParts }
      : {}),
    ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
  });
  return {
    memory: createEngentySessionMastraMemory({ storage }),
    storage,
    invocationOptions: createEngentyMemoryInvocationOptions(input),
  };
}

export async function assertEngentyNativeMastraMemoryConfigured(
  agent: EngentyNativeMemoryAgent,
  details: Record<string, unknown> = {}
): Promise<MastraMemory> {
  if (
    agent.hasOwnMemory?.() !== true ||
    typeof agent.getMemory !== "function"
  ) {
    throw new AiSessionError(
      "agent_threads.nativeMemoryUnavailable",
      "Native Mastra memory requires an agent configured with a concrete memory instance",
      details
    );
  }
  const memory = await agent.getMemory();
  if (!memory) {
    throw new AiSessionError(
      "agent_threads.nativeMemoryUnavailable",
      "Native Mastra memory requires an agent configured with a concrete memory instance",
      details
    );
  }
  return memory;
}

export function createEngentyAgentExecutionOptions(
  input: EngentyMemoryInvocationInput & {
    abortSignal?: AbortSignal;
    maxSteps: number;
    runId?: string | null;
  }
): AgentExecutionOptionsBase<unknown> {
  return {
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    delegation: createEngentySupervisorDelegationConfig(),
    maxSteps: input.maxSteps,
    ...(input.runId ? { runId: input.runId } : {}),
    ...createEngentyMemoryInvocationOptions(input),
  };
}
