import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import type { Processor } from "@mastra/core/processors";
import {
  getMemoryEntryStore,
  getWorkingMemoryStore,
  type MemoryEntryStore,
  type WorkingMemoryStore,
} from "../../dal/memory/index.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import type { TurnContext } from "../conversation/turn-context.js";
import { AiSessionError } from "../errors.js";
import {
  createRecallChaptersTool,
  RECALL_CHAPTERS_TOOL_ID,
  riverTimeZone,
} from "../river/index.js";
import type { AlterEgo } from "../rooms/alter-ego.js";
import {
  createEmptyReplyCompletion,
  withRunTimeouts,
} from "../sessions/run-guards.js";
import { createSpeakerTurnProcessor } from "../sessions/speaker-turn-processor.js";
import { scopeAttributionUserId } from "../sessions/types.js";
import { createEngentySupervisorDelegationConfig } from "../supervisor/delegation.js";
import { type AgentTasksTools, createAgentTasks } from "./agent-tasks.js";
import {
  createEngentySessionMastraMemory,
  sharedObservationsEnabled,
} from "./concrete-memory.js";
import {
  createEngentySessionMemoryStorage,
  type EngentySessionMemoryScope,
} from "./engenty-session-memory-storage.js";
import { createMemoryProcessor } from "./memory-block.js";
import {
  type MemoryPlace,
  memoryKeysForRun,
  unaskedWriteKeys,
} from "./memory-scopes.js";
import { createMemoryTools, type MemoryTools } from "./memory-tools.js";
import { createSharedObservationalMemoryProcessor } from "./shared-observational-memory.js";
import {
  createWorkingMemoryExtractor,
  createWorkingMemoryTool,
  type WorkingMemoryTools,
} from "./working-memory.js";

export interface EngentyMemoryIdentityInput {
  scope: EngentySessionMemoryScope;
  /**
   * Shared specialist rooms and task-bound rooms key the Mastra resource on
   * the Space (`spaceId`) so every chat with that agent in the Space shares
   * it. `threadId` is only the fallback when the thread has no Space.
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
  /** The person this agent writes for in a room (rooms/alter-ego.ts). */
  alterEgo?: AlterEgo | null;
  /** Who and where, for memory entries (memory-scopes.ts). */
  memory: {
    agentScope?: "personal" | "shared" | null;
    place: MemoryPlace;
    /**
     * Nobody but the person speaking reads this thread — not a room, not a
     * shared Space thread, not a messenger channel. Opens the `user` scope.
     */
    privateLine: boolean;
  };
  /** The entries store; the env-configured one when omitted. */
  memoryEntries?: MemoryEntryStore | null;
  /**
   * Configured fast-text model id. Observational memory and thread titles use
   * the AI Gateway with this id (or the platform fast-text default).
   */
  observationalModelId?: string | null;
  /**
   * Persist this run's sendMessage as a visible user row. False for artifact
   * resume (tool-approval / decision nudge). Default true.
   */
  persistCurrentUserTurn?: boolean;
  sharedObservations?: "personal" | "space" | "disabled";
  store: ThreadStore;
  /**
   * Give the agent `recall_chapters` over this thread: the conversations
   * that go on without end — the river, a desk line, a DM (ai/river). Off
   * on a run, a pair or a room thread, which have no chapters.
   */
  threadChapters?: boolean;
  /** Where this run's user turn was said — stamped on its row (turn-context.ts). */
  turnContext?: TurnContext | null;
  // Durable attachment parts for the current user turn, appended to the user
  // message on persist (Mastra saves the turn text-only). See the storage.
  userAttachmentParts?: readonly unknown[];
  // Client-assigned id of the current user turn — the persisted row adopts it
  // so DB snapshots and the run stream agree on the message id. See the storage.
  userMessageId?: string | null;
  /** The working-memory store; the env-configured one when omitted. */
  workingMemory?: WorkingMemoryStore | null;
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
    ...(input.turnContext ? { turnContext: input.turnContext } : {}),
    ...(input.alterEgo ? { alterEgo: input.alterEgo } : {}),
  });
  const identity = {
    agentId: input.agentId,
    sharedObservations: input.sharedObservations ?? "disabled",
    spaceId: input.spaceId,
    tenantId: input.scope.tenantId,
    userId: input.scope.userId,
  };
  const sharedProcessor = sharedObservationsEnabled()
    ? createSharedObservationalMemoryProcessor({
        identity,
        ...(input.observationalModelId
          ? { modelId: input.observationalModelId }
          : {}),
        storage,
        threadId: input.threadId,
      })
    : null;
  // Memory entries: every scope this run may see, one block, one pair of
  // tools. Independent of the OM switch — facts kept on purpose are not an
  // observer feature.
  const memoryEntries =
    input.memoryEntries === undefined
      ? getMemoryEntryStore()
      : input.memoryEntries;
  const speakerUserId = scopeAttributionUserId(input.scope);
  const memoryKeys = memoryKeysForRun({
    agentId: input.agentId,
    agentScope: input.memory.agentScope,
    place: input.memory.place,
    privateSpeakerUserId: input.memory.privateLine ? speakerUserId : null,
    tenantId: input.scope.tenantId,
    userId: speakerUserId,
  });
  const workingMemory =
    input.workingMemory === undefined
      ? getWorkingMemoryStore()
      : input.workingMemory;
  const memoryProcessor =
    memoryEntries && Object.keys(memoryKeys).length > 0
      ? createMemoryProcessor({
          keys: memoryKeys,
          store: memoryEntries,
          tenantId: input.scope.tenantId,
          working: workingMemory,
        })
      : null;
  const workingMemoryTools = workingMemory
    ? createWorkingMemoryTool({
        keys: memoryKeys,
        store: workingMemory,
        tenantId: input.scope.tenantId,
        userId: speakerUserId,
      })
    : null;
  const workingMemoryExtractor = workingMemory
    ? createWorkingMemoryExtractor({
        keys: unaskedWriteKeys(memoryKeys, {
          agentScope: input.memory.agentScope,
          privateLine: input.memory.privateLine,
        }),
        store: workingMemory,
        tenantId: input.scope.tenantId,
        userId: speakerUserId,
      })
    : null;
  const agentMemoryTools = memoryEntries
    ? createMemoryTools({
        keys: memoryKeys,
        store: memoryEntries,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: speakerUserId,
      })
    : null;
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
    ...(memoryProcessor ? [memoryProcessor] : []),
    ...(agentTasks ? [agentTasks.processor] : []),
  ];
  const memoryTools: Partial<
    MemoryTools & WorkingMemoryTools & AgentTasksTools
  > & {
    [RECALL_CHAPTERS_TOOL_ID]?: ReturnType<typeof createRecallChaptersTool>;
  } = {
    ...(agentMemoryTools ?? {}),
    ...(workingMemoryTools ?? {}),
    ...(agentTasks?.tools ?? {}),
    ...(input.threadChapters
      ? {
          [RECALL_CHAPTERS_TOOL_ID]: createRecallChaptersTool({
            store: input.store,
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
            timeZone: riverTimeZone(),
          }),
        }
      : {}),
  };
  return {
    memory: createEngentySessionMastraMemory({
      ...(workingMemoryExtractor
        ? { extractors: [workingMemoryExtractor] }
        : {}),
      storage,
      ...(input.observationalModelId
        ? { modelId: input.observationalModelId }
        : {}),
    }),
    memoryProcessors: processors,
    /** `memory_note` / `memory_forget` / `working_memory_set` bound to this run's memory keys, `todo_edit` to its TASKS.md row; empty without them. */
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
  // The non-streaming `generate` lane gets the same run guards the stream
  // intercept folds in for the AG-UI lanes: a time budget on the model calls
  // and one push-back on a silent finish.
  const modelSettings = withRunTimeouts(undefined);
  return {
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    delegation: createEngentySupervisorDelegationConfig(),
    isTaskComplete: createEmptyReplyCompletion(),
    maxSteps: input.maxSteps,
    ...(modelSettings
      ? {
          modelSettings:
            modelSettings as AgentExecutionOptionsBase<unknown>["modelSettings"],
        }
      : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...createEngentyMemoryInvocationOptions(input),
  };
}
