import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import type { Processor } from "@mastra/core/processors";
import type { ThreadStore } from "../../dal/threads/index.js";
import { AiSessionError } from "../errors.js";
import { createSpeakerTurnProcessor } from "../sessions/speaker-turn-processor.js";
import { scopeAttributionUserId } from "../sessions/types.js";
import { createEngentySupervisorDelegationConfig } from "../supervisor/delegation.js";
import { type AgentMemoryTools, createAgentMemory } from "./agent-memory.js";
import { type AgentTasksTools, createAgentTasks } from "./agent-tasks.js";
import {
  createEngentySessionMastraMemory,
  observationalMemoryEnabled,
} from "./concrete-memory.js";
import {
  createEngentySessionMemoryStorage,
  type EngentySessionMemoryScope,
} from "./engenty-session-memory-storage.js";
import { createSharedObservationalMemoryProcessor } from "./shared-observational-memory.js";

export interface EngentyMemoryIdentityInput {
  scope: EngentySessionMemoryScope;
  /**
   * Shared specialist rooms and task-bound rooms key Mastra working memory on the
   * Space (`spaceId`) so every chat with that agent in the Space shares one
   * profile. `threadId` is only the fallback when the thread has no Space.
   * Copilot stays per-user.
   */
  sharedRoom?: boolean;
  /** Space this chat belongs to — Mastra `resourceId` for shared rooms. */
  spaceId?: string | null;
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
  /** The agent's display name, stamped on the rows it writes so the other
   *  members of a room read its turns under a name. */
  agentName?: string;
  /**
   * Configured routing-tier model id. Observational memory uses the AI
   * Gateway with this id (or the platform routing default).
   */
  observationalModelId?: string | null;
  /**
   * Persist this run's sendMessage as a visible user row. False for artifact
   * resume (tool-approval / decision nudge). Default true.
   */
  persistCurrentUserTurn?: boolean;
  sharedObservations?: "personal" | "space" | "disabled";
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
  input: Pick<EngentyMemoryIdentityInput, "scope"> &
    Partial<
      Pick<EngentyMemoryIdentityInput, "sharedRoom" | "spaceId" | "threadId">
    >
) {
  if (input.sharedRoom) {
    const spaceId = input.spaceId?.trim();
    if (spaceId) {
      return spaceId;
    }
    if (input.threadId) {
      return input.threadId;
    }
  }
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
    ...(input.agentName ? { agentName: input.agentName } : {}),
    scope: input.scope,
    // The run's own thread + its room kind: `getThreadById` must answer with
    // the SAME resourceId `createEngentyMastraResourceId` computes for this
    // run, or Mastra's thread-ownership assert rejects every shared-room run
    // whose thread row carries a `created_by_user_id`.
    sharedRoom: input.sharedRoom === true,
    store: input.store,
    threadId: input.threadId,
    ...(input.spaceId?.trim() ? { spaceId: input.spaceId.trim() } : {}),
    ...(input.userAttachmentParts && input.userAttachmentParts.length > 0
      ? { userAttachmentParts: input.userAttachmentParts }
      : {}),
    ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
    ...(input.persistCurrentUserTurn === false
      ? { persistCurrentUserTurn: false }
      : {}),
  });
  const identity = {
    agentId: input.agentId,
    sharedObservations: input.sharedObservations ?? "disabled",
    spaceId: input.spaceId,
    tenantId: input.scope.tenantId,
    userId: input.scope.userId,
  };
  const sharedProcessor = observationalMemoryEnabled()
    ? createSharedObservationalMemoryProcessor({
        identity,
        ...(input.observationalModelId
          ? { modelId: input.observationalModelId }
          : {}),
        storage,
        threadId: input.threadId,
      })
    : null;
  // MEMORY.md rides the same audience as the shared observations: the agent's
  // notes for this Space (or this user, for a personal agent). Independent of
  // the OM switch — notes the agent chose to keep are not an observer feature.
  const agentMemory = createAgentMemory({ identity, store: storage });
  // TASKS.md — the agent's own open items, on the same row (metadata). The
  // copilot has no shared-OM audience and keeps its pad on its profile row.
  const agentTasks = createAgentTasks({ identity, store: storage });
  const speakerProcessor = input.sharedRoom
    ? createSpeakerTurnProcessor({
        currentUserId: scopeAttributionUserId(input.scope),
        ...(input.spaceId?.trim() ? { spaceId: input.spaceId.trim() } : {}),
      })
    : null;
  const processors: Processor[] = [
    ...(speakerProcessor ? [speakerProcessor] : []),
    ...(sharedProcessor ? [sharedProcessor] : []),
    ...(agentMemory ? [agentMemory.processor] : []),
    ...(agentTasks ? [agentTasks.processor] : []),
  ];
  const memoryTools: Partial<AgentMemoryTools & AgentTasksTools> = {
    ...(agentMemory?.tools ?? {}),
    ...(agentTasks?.tools ?? {}),
  };
  return {
    memory: createEngentySessionMastraMemory({
      storage,
      ...(input.observationalModelId
        ? { modelId: input.observationalModelId }
        : {}),
    }),
    memoryProcessors: processors,
    /** `memory_note` / `memory_forget` / `todo_edit`, bound to this run's MEMORY.md + TASKS.md row; empty without one. */
    memoryTools,
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
