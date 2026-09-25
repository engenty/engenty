// The conversation chat executor — the single live chat substrate. Drives a run
// on `@ag-ui/mastra` (`runInteractiveViaMastraAgent`) over our assembled agent +
// our memory adapter, bound to the Engenty thread, and publishes the AG-UI events
// to the run-event-bus.
//
// Covers text + tools + real cancel + usage + runtime-context, native sub-agent
// cards, frontend-tool HITL (native suspend/resume), decision/feedback artifacts,
// and the execute-boundary tool-approval gate. Recall flows through
// EngentySessionMemoryStorage.
import {
  type AGUIEvent,
  ENGENTY_EFFORT_RESOLVED_EVENT,
  EventType,
  type RunAgentInput,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import type { AiEffort, AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import {
  MASTRA_AUTH_TOKEN_KEY,
  RequestContext,
} from "@mastra/core/request-context";
import type { Workspace } from "@mastra/core/workspace";
import { resolveFrontendToolsForAgent } from "../../../ai/frontend-tools/catalog.js";
import { createNativeFrontendTools } from "../../../ai/frontend-tools/native-frontend-tool.js";
import { isToolApprovalSuspendPayload } from "../../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
  withEnvCoreBaseUrl,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore, ThreadStore } from "../../dal/threads/index.js";
import type { AgentSessionStatus } from "../../dal/threads/types.js";
import { isRoomThread, threadKind } from "../../dal/threads/types.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { resolveRunBrowser } from "../browser/run-browser.js";
import {
  createUserBrowserTools,
  releaseUserBrowserForRun,
} from "../browser/user-browser-tools.js";
import {
  createEngentyMastraResourceId,
  createEngentySessionMemoryRuntime,
} from "../memory/invocation-options.js";
import { resolveSharedObservationsScope } from "../memory/shared-observational-memory.js";
import {
  type AiRegistry,
  assembleDynamicAgent,
  type RuntimeModelConfig,
} from "../registry/index.js";
import { resolveAlterEgo } from "../rooms/alter-ego.js";
import { noteHumanTurnInRoom } from "../rooms/deliver.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { registerActiveThreadRun } from "../sessions/active-thread-runs.js";
import {
  emitExecutionLaneRunStarted,
  executionSpaceId,
} from "../sessions/execution-lane.js";
import { frontendToolGrantForRun } from "../sessions/frontend-tool-grant.js";
import { agentRunErrorCode } from "../sessions/mastra-stream-failure.js";
import { resolveAgentMaxSteps } from "../sessions/max-steps.js";
import { registerActiveRunAbortController } from "../sessions/run-abort-registry.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import {
  enrichToolsSpaceForAgentRun,
  resolvedRunSpace,
  resolveRunSpaceForThread,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import { createSessionRunTracker } from "../sessions/run-tracking.js";
import {
  buildSessionRuntimeInstructions,
  resolveUiLanguage,
} from "../sessions/runtime-instructions.js";
import {
  requireStoredThreadAccess,
  sharedMastraRoomFromThread,
} from "../sessions/thread-access.js";
import {
  isDecisionArtifactPayload,
  isFeedbackArtifactPayload,
} from "../sessions/transcript.js";
import {
  type AgentUiProducerContext,
  type AiSessionScope,
  scopeAccessToken,
} from "../sessions/types.js";
import { setTraceContext } from "../trace-context.js";
import { workspaceApprovalSuspendPayload } from "../workspace/workspace-tool-guards.js";
import { runInteractiveViaMastraAgent } from "./agui-start-driver.js";
import { AgUiTurnAccumulator } from "./agui-turn-accumulator.js";
import {
  emitArtifactInterrupt,
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "./emit-interrupt.js";
import {
  emitTrajectoryHeader,
  listKnownToolNames,
  recallTrajectoryMessagePointers,
} from "./emit-trajectory-header.js";
import { isMastraToolApprovalSuspend } from "./mastra-stream-intercept.js";
import { persistSubAgentProgress } from "./persist-sub-agent-progress.js";
import { persistTurnTranscript } from "./persist-turn-transcript.js";
import { repairDanglingToolCallsInHistory } from "./repair-dangling-tool-calls.js";
import { createRootDelegationTools } from "./root-delegation-tools.js";
import {
  persistRunFailureNotice,
  runFailureNoticeText,
} from "./run-failure-notice.js";
import { recordSessionUsage } from "./run-usage.js";
import { patchThreadStatus } from "./thread-status.js";
import { turnContextFromRouteContext } from "./turn-context.js";

/** The thread kinds cut into chapters (api/thread-chapter-routes.ts). */
const CHAPTERED_THREAD_KINDS = new Set(["desk", "dm"]);

/** A tool that suspended the run, captured for the post-run interrupt. */
interface SuspendedTool {
  args: unknown;
  runId: string;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

// Goes into the run's system prompt, so it must describe the runtime the model
// is ACTUALLY on: the agent's own durable stream, driven by `MastraAgent` and
// resumed from Mastra's snapshot. Keep it in step with the code.
const MASTRA_RUNTIME_NOTE =
  "You are running on Mastra's durable agent stream, driven through AG-UI, the target chat runtime.";

export interface StartConversationRunInput {
  agentId: string;
  agentUi?: AgentUiProducerContext | null;
  // Operation ids the user already approved for this chat. Threaded
  // into the engenty-tools run context so the execute-boundary gate skips them.
  approvalGrants?: readonly string[];
  // Durable AG-UI `image`/`document` parts for the user turn (with their
  // `engenty_attachment` metadata). Mastra persists the turn as text-only, so
  // these are appended to the durable user message by the memory storage so
  // attachments survive a thread reload. Separate from `attachments` (base64
  // for the model): these carry only the storage key + signed URL.
  attachmentParts?: readonly unknown[];
  // Photo/file attachments on the user turn, already resolved to base64 by the
  // run route. Forwarded to the model as multimodal input (`session.sendMessage`
  // `files`); non-model MIME types are filtered out before they reach here.
  attachments?: ReadonlyArray<{
    data: string;
    filename?: string;
    mediaType: string;
  }>;
  /**
   * Auto sized this turn — emit `engenty.effort.resolved` so the composer can
   * toast and briefly flash the resolved tier. Omitted for explicit picks.
   */
  autoEffortResolved?: {
    effort: AiEffort;
    modelId?: string | null;
    reason?: string;
    source?: string;
  } | null;
  /** The run's "Your computer" prompt section, from its workspace. */
  computeInstructions?: string;
  /**
   * The tier this run's model was resolved from, however it was chosen — the
   * user's explicit pick or the auto sizing. Distinct from
   * `autoEffortResolved`, which is only set when Auto did the choosing and
   * exists to drive the composer toast.
   *
   * Persisted onto the open interrupt when the run suspends, so the resume
   * lands on the same model. See AgUiOpenInterruptMetadata.effort.
   */
  effort?: AiEffort | null;
  /**
   * Singleton Mastra instance (Postgres workflow storage when configured).
   * Must be attached to the assembled agent so frontend-tool suspend snapshots
   * persist where `resumeStream()` can reload them — without it the agent falls
   * back to an ephemeral in-memory Mastra and HITL resume can miss the snapshot.
   */
  mastra?: Mastra;
  modelConfig?: RuntimeModelConfig | null;
  modelId?: string | null;
  /**
   * Persist sendMessage as a visible user row / stream echo. False when the
   * prompt is a synthetic artifact-resume nudge (tool approval / decision).
   */
  persistCurrentUserTurn?: boolean;
  prompt: string;
  registry: AiRegistry;
  // Resolve a delegated agent's own workspace + sandbox for a child run (Phase 3
  // child-run delegation). When provided, the executor exposes `agent-<alias>`
  // delegation tools and skips the in-process Mastra subagent mechanism.
  resolveChildWorkspace?: (input: {
    agentId: string;
    runId: string;
    threadId: string;
  }) => Promise<
    | { sandboxProvider?: EngentySandboxProvider; workspace?: Workspace }
    | undefined
  >;
  routeContext?: Record<string, unknown> | null;
  runContext?: RunAgentInput["context"];
  runId: string;
  // Durable run tracking (ai.agent_run + ai.agent_run_event). Without it the
  // run executes fine but is INVISIBLE to reload-recovery and other windows:
  // no run row to discover, no event log to replay.
  runStore?: AgentRunStore | null;
  // The run's sandbox providers — torn down when the run ends so the sandbox
  // syncOut persists the staged /space + /home dirs to file storage. Without
  // this the CLI sub-agent's writes never reach durable storage.
  sandboxProvider?: EngentySandboxProvider;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: ThreadStore;
  threadId: string;
  usageStore?: AiUsageStore | null;
  // Client-assigned id of this turn's user message. Emitted into the run event
  // stream so other attached windows can render the user bubble live — the
  // durable message row only lands at the end-of-turn coalescer flush.
  userMessageId?: string | null;
  workspace?: Workspace;
}

/**
 * Start a `runtime_mode=harness_session` run. Fire-and-forget from the POST-runs
 * route branch; events flow to the SSE attach via the run-event-bus, unchanged.
 */
export async function startConversationRun(
  input: StartConversationRunInput
): Promise<{ runId: string }> {
  await requireStoredThreadAccess({
    action: "write",
    agentId: input.agentId,
    ...(typeof input.registry?.getAgentConfig === "function"
      ? {
          getAgentConfig: (agentId: string) =>
            input.registry.getAgentConfig(agentId),
        }
      : {}),
    scope: input.scope,
    store: input.store,
    threadId: input.threadId,
  });
  // Lookups keyed only by ids start together once access is proven; each
  // is awaited where it was before, so a failure still lands where it did.
  // A rejection is held until that await, never reported as unhandled.
  const settleLater = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch(() => undefined);
    return promise;
  };
  const rootConfigPromise = settleLater(
    Promise.resolve(input.registry.getAgentConfig?.(input.agentId))
  );
  const threadRowPromise = settleLater(
    Promise.resolve(
      typeof input.store.getThread === "function"
        ? input.store.getThread({
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
          })
        : null
    )
  );
  const instructionExtrasPromise = settleLater(
    import("../instructions/resolve-agent-instruction-extras.js").then(
      ({ resolveAgentInstructionExtras }) =>
        resolveAgentInstructionExtras({
          agentId: input.agentId,
          tenantId: input.scope.tenantId,
          userId: input.scope.userId,
        })
    )
  );
  const coreAgentIdPromise = settleLater(
    resolveCoreAgentId(input.scope.tenantId, input.agentId)
  );
  const [, spaceResolution] = await Promise.all([
    // A person spoke: whatever agents did in this room since, the budget
    // restarts and a pause lifts (rooms/room-turns.ts).
    noteHumanTurnInRoom({
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    }),
    resolveRunSpaceForThread({
      routeContext: input.routeContext,
      runId: input.runId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    }),
  ]);
  const runSpace = resolvedRunSpace(spaceResolution);
  markRunLive(input.runId);
  const abort = registerActiveRunAbortController(input.runId);
  // With a run store, the tracker owns publishing: `append` forwards to the
  // in-process bus with the SAME seq it persists to ai.agent_run_event, so a
  // reload (or another window) can list the run and replay `?since=`.
  const tracker = input.runStore
    ? createSessionRunTracker({
        agentId: input.agentId,
        createdByUserId: input.scope.userId,
        // The tier the next Auto turn weighs a change against.
        ...(input.effort ? { metadata: { effort: input.effort } } : {}),
        modelId: input.modelId ?? null,
        runId: input.runId,
        runStore: input.runStore,
        threadId: input.threadId,
        tenantId: input.scope.tenantId,
        // The interactive lane: a person is at the keyboard.
        trigger: "message",
      })
    : null;
  let seq = 0;
  const emit = tracker
    ? (event: AGUIEvent) => {
        void tracker.append(event);
      }
    : (event: AGUIEvent) => publishRunEvent(input.runId, { event, seq: seq++ });
  emitExecutionLaneRunStarted(
    {
      agentId: input.agentId,
      runId: input.runId,
      source: { kind: "live" },
      spaceId: executionSpaceId(spaceResolution),
      threadId: input.threadId,
    },
    { emit }
  );
  // Auto-sized turns: tell the composer which tier (and model) won so it can
  // toast + briefly flash the effort control. Explicit picks stay silent.
  if (input.autoEffortResolved?.effort) {
    emit({
      name: ENGENTY_EFFORT_RESOLVED_EVENT,
      type: EventType.CUSTOM,
      value: {
        effort: input.autoEffortResolved.effort,
        model_id: input.autoEffortResolved.modelId ?? input.modelId ?? null,
        ...(input.autoEffortResolved.reason
          ? { reason: input.autoEffortResolved.reason }
          : {}),
        ...(input.autoEffortResolved.source
          ? { source: input.autoEffortResolved.source }
          : {}),
      },
    } as AGUIEvent);
  }
  // The user turn, for OTHER attached clients (reload, second window), as the
  // protocol-native role:"user" text message (AG-UI TEXT_MESSAGE_START carries
  // a role union).
  //
  // This is emitted so the durable log stays complete for late attachers
  // replaying `?since=`. It is NOT safe to deliver to the client that supplied
  // the message: that client already holds this id, and TEXT_MESSAGE_START
  // means "begin a new message", so a spec-compliant client appends and doubles
  // the user's text. The originating SSE stream filters it out — see
  // `isOwnUserTurnEcho` in api/thread-run-routes.ts. Artifact resume nudges skip
  // this — they are not a user utterance.
  if (
    input.persistCurrentUserTurn !== false &&
    input.userMessageId &&
    input.prompt
  ) {
    emit({
      messageId: input.userMessageId,
      role: "user",
      type: EventType.TEXT_MESSAGE_START,
    } as AGUIEvent);
    emit({
      delta: input.prompt,
      messageId: input.userMessageId,
      type: EventType.TEXT_MESSAGE_CONTENT,
    } as AGUIEvent);
    emit({
      messageId: input.userMessageId,
      type: EventType.TEXT_MESSAGE_END,
    } as AGUIEvent);
  }

  // The converter is built inside the try; the finally reads its usage for the
  // durable run row.
  let converterRef: AgUiTurnAccumulator | null = null;
  let windowInputTokens: number | null = null;
  // Set when the turn ended on a suspension the user will answer. The transcript
  // pass reads it: Mastra flushes the assistant turn when a run parks, so writing
  // ours too would DUPLICATE it — memory's row and ours carry the same tool call
  // under different message ids, the chat renders two cards, and only memory's is
  // ever resolved, leaving ours spinning forever.
  let suspendedForResume = false;
  // Terminal thread status written in `finally` so session-list dots stay in sync.
  let threadStatus: AgentSessionStatus = "completed";
  // Why the run failed, stamped onto the durable run row in `finally`. Without
  // it a failed run stores status alone: an upstream provider failure (rate
  // limit, content-policy block, timeout) left `error_message` NULL, so the one
  // place you look after the fact could not tell you what happened.
  let failureMessage: string | null = null;
  // Set for a run that ended in SILENCE (finishReason "length"/"content-filter",
  // no assistant text): the wording persisted as a visible assistant message in
  // `finally`. Doubles as the "memory already flushed this turn" marker — those
  // finishes reach end-of-generation, so re-writing our transcript would render
  // every tool card twice.
  let failureNotice: string | null = null;
  await patchThreadStatus({ ...input, status: "running" });
  try {
    // Built early so the delegation tools' onProgress can fold lines onto the
    // sub-agent card (recordSubAgentProgress) and tag live progress events.
    const converter = new AgUiTurnAccumulator();
    converterRef = converter;
    // What this thread's space mounts, validated against the caller's access
    // (PLAN-spaces.md Phase C3a). Resolved here rather than passed in because
    // BOTH chat lanes — this one and the resume — have to agree, and a value
    // threaded from two routes is a value that eventually diverges.
    const rootConfig = await rootConfigPromise;
    const toolsSpacePromise = settleLater(
      enrichToolsSpaceForAgentRun({
        agentId: input.agentId,
        preferredConnectorIds: rootConfig?.connectorIds ?? [],
        scope: input.scope,
        space: toolsSpaceFromResolution(spaceResolution),
      })
    );
    // The page-driving grant reads the row and the Space position, so it comes
    // after both are known; the executor and the prompt share this one value.
    const frontendToolGrant = frontendToolGrantForRun({
      agentId: input.agentId,
      config: rootConfig,
      spaceResolution,
    });
    const mergedDefinitions = resolveFrontendToolsForAgent({
      agentId: input.agentId,
      clientTools: input.agentUi?.frontend_tools,
      grant: frontendToolGrant,
    });
    const frontendTools = createNativeFrontendTools(mergedDefinitions);
    // Per-run runtime context (route, selection, workspace, modules). Built
    // BEFORE assembly because it rides an input processor now: folded into the
    // instructions it sat at the head of the provider's cache prefix, so every
    // navigation re-billed the whole prompt. See runtime-context-processor.ts.
    const runtimeInstructionsPromise = settleLater(
      buildSessionRuntimeInstructions({
        agentId: input.agentId,
        agentUi: input.agentUi,
        ...(input.computeInstructions
          ? { computeInstructions: input.computeInstructions }
          : {}),
        frontendToolGrant,
        routeContext: input.routeContext ?? null,
        runContext: input.runContext,
        scope: input.scope,
        // The already-resolved surface, so the prompt names the same Space
        // the tool gate enforces — including unresolved, which must not
        // degrade to a route-context uuid.
        spaceResolution,
        threadId: input.threadId,
      }).then((text) => text.trim())
    );
    const threadRow = await threadRowPromise;
    const sharedRoom = sharedMastraRoomFromThread({
      agentId: input.agentId,
      agentScope: rootConfig?.agentScope,
      thread: threadRow,
    });
    // In a room, a personal-scope agent speaks for its person (rooms/alter-ego.ts).
    const alterEgo =
      rootConfig?.agentScope === "personal" &&
      threadRow &&
      isRoomThread(threadRow.route_context)
        ? await resolveAlterEgo({
            agentId: input.agentId,
            store: input.store,
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
          })
        : null;
    const { memory, memoryProcessors, memoryTools } =
      createEngentySessionMemoryRuntime({
        agentId: input.agentId,
        alterEgo,
        ...(rootConfig?.name ? { agentName: rootConfig.name } : {}),
        observationalModelId: input.modelConfig?.fastTextModelId,
        scope: input.scope,
        sharedObservations: rootConfig
          ? resolveSharedObservationsScope(rootConfig)
          : "disabled",
        sharedRoom,
        spaceId: runSpace?.spaceId ?? threadRow?.space_id,
        store: input.store,
        threadId: input.threadId,
        // The RUN's context, not the thread's stored one: the river is one
        // thread walked through many spaces, and the chapter a turn belongs to
        // is where the person stood when they sent it.
        turnContext: turnContextFromRouteContext(input.routeContext),
        // A conversation that goes on without end has chapters to read.
        threadChapters:
          threadRow != null &&
          CHAPTERED_THREAD_KINDS.has(threadKind(threadRow)),
        ...(input.attachmentParts && input.attachmentParts.length > 0
          ? { userAttachmentParts: input.attachmentParts }
          : {}),
        ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
        ...(input.persistCurrentUserTurn === false
          ? { persistCurrentUserTurn: false }
          : {}),
      });
    const resolveChildWorkspace = input.resolveChildWorkspace;
    const rootDelegation = resolveChildWorkspace
      ? createRootDelegationTools({
          onProgress: (toolCallId, line, origin) => {
            converter.recordSubAgentProgress(toolCallId, line);
            emit({
              name: "engenty.sub_agent.progress",
              type: EventType.CUSTOM,
              value: {
                line,
                messageId: converter.currentMessageId || toolCallId,
                toolCallId,
                // Who is working, and under which tool. The bridge holds a
                // server tool's TOOL_CALL_* back until the call returns, so
                // these are all the transcript has to draw a row from while a
                // colleague works.
                ...(origin ?? {}),
              },
            } as AGUIEvent);
          },
          parentRunId: input.runId,
          parentThreadId: input.threadId,
          registry: input.registry,
          resolveChildWorkspace,
          rootAgentId: input.agentId,
          rootConfig,
          ...(input.runStore ? { runStore: input.runStore } : {}),
          scope: input.scope,
          spaceResolution,
          store: input.store,
          ...(abort.abortSignal ? { abortSignal: abort.abortSignal } : {}),
          ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
        })
      : { extraTools: {}, skipNativeSubAgents: false };
    // This agent's window in the Space's browser (D11). Audit rides the
    // run-event lane as agent steps only.
    const runBrowser = resolveRunBrowser({
      agentId: input.agentId,
      source: spaceResolution,
    });
    const [browserTools, toolsSpace, instructionExtras, runtimeInstructions] =
      await Promise.all([
        createUserBrowserTools({
          browser: runBrowser,
          emit: (name, value) =>
            emit({ name, type: EventType.CUSTOM, value } as AGUIEvent),
          headless: false,
          tenantId: input.scope.tenantId,
          textModelId: input.modelConfig?.gradedModelIds?.low ?? null,
          classifierModelId: input.modelConfig?.classifierModelId ?? null,
        }),
        toolsSpacePromise,
        instructionExtrasPromise,
        runtimeInstructionsPromise,
      ]);
    const extraTools = {
      ...frontendTools,
      ...rootDelegation.extraTools,
      ...memoryTools,
      ...browserTools,
    };
    const agent = await assembleDynamicAgent(input.registry, input.agentId, {
      extraTools,
      space: toolsSpace,
      // The Memory INSTANCE has to live ON the agent — `agent.stream()` takes no
      // memory argument. Without it the memory processors (observational memory) throw
      // "computeStateSignal requires Mastra memory with an active resourceId and
      // threadId" — the instance is missing, not the ids — and Mastra recalls no
      // history and persists nothing.
      memory,
      instructionExtras,
      memoryProcessors,
      ...(sharedRoom ? { sharedRoom: true } : {}),
      ...(runtimeInstructions
        ? { runtimeContextInstructions: runtimeInstructions }
        : {}),
      // Same mastra singleton as session-service: suspend snapshots land in the
      // shared workflows store so parked frontend-tool resumes can reload them.
      ...(input.mastra ? { mastra: input.mastra } : {}),
      // Function agents render over this thread's agent_state snapshot
      // (PLAN-agent-hooks D5); data configs ignore the context.
      resolveContext: {
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      },
      ...(rootDelegation.skipNativeSubAgents ? { skipSubAgents: true } : {}),
      ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });

    // Every tool name this run can actually dispatch. `listTools()` excludes
    // browser tools by contract, so union it with the ones we inject ourselves.
    // Used to tell a hallucinated tool name apart from a real tool that merely
    // failed — and to name valid alternatives in the correction.
    const knownToolNames = await listKnownToolNames(agent, extraTools);
    const resourceId = createEngentyMastraResourceId({
      scope: input.scope,
      sharedRoom,
      spaceId: runSpace?.spaceId ?? threadRow?.space_id,
      threadId: input.threadId,
    });
    const trajectoryHeader = settleLater(
      recallTrajectoryMessagePointers({
        memory,
        resourceId,
        threadId: input.threadId,
      }).then((recalledMessages) =>
        emitTrajectoryHeader({
          agent,
          emit,
          extraSystemNote: MASTRA_RUNTIME_NOTE,
          modelId: input.modelId,
          recalledMessages,
          runtimeInstructions,
          toolNames: knownToolNames,
          userMessage: input.prompt,
        })
      )
    );

    // Answer tool calls left dangling by EARLIER turns (a hallucinated tool name
    // is persisted at state:"call" and never resolves on its own). Doing it here
    // — before the session reads history — is what puts the correction in front
    // of the model. The open interrupt's own call is deliberately left alone:
    // it is waiting on the user, not broken.
    const openInterruptToolCallId =
      readAgUiOpenInterrupt(input.sessionMetadata)?.tool_call_id ?? "";
    const repairedPromise = repairDanglingToolCallsInHistory({
      knownToolNames,
      scope: input.scope,
      ...(openInterruptToolCallId
        ? { skipToolCallIds: [openInterruptToolCallId] }
        : {}),
      store: input.store,
      threadId: input.threadId,
    });
    const [repaired] = await Promise.all([repairedPromise, trajectoryHeader]);
    if (repaired.length > 0) {
      console.warn(
        `[conversation ${input.runId}] answered ${repaired.length} dangling tool call(s): ${repaired
          .map((call) => call.toolName)
          .join(", ")}`
      );
    }

    // Controller instructions carry the STABLE note only. The volatile runtime
    // context went to the agent's input processor above — anything here is
    // merged into the run's system prompt, i.e. the cache prefix.
    const instructions = MASTRA_RUNTIME_NOTE;

    // Agent identity for core: policies (e.g. the secrets reveal gate) must see
    // the AGENT as principal, not the user whose bearer token it runs under.
    // Goal = the conversation thread; approval grants persist against it.
    const coreAgentId = await coreAgentIdPromise;
    const toolsRunContext = withEnvCoreBaseUrl({
      ...getEngentyToolsRunContext(),
      ...(coreAgentId ? { agentId: coreAgentId } : {}),
      // The registry key of the agent answering — self-scoped tools
      // (`agent_self_revise`, `routines_list`, `skill_propose`'s proposer)
      // read it; without it a specialist on its own desk could not name
      // itself. The AG-UI session lane and child runs already set it.
      agentTypeKey: input.agentId,
      approvalGrants: input.approvalGrants ?? [],
      space: toolsSpace,
      // Interactive chat: a gated operation SUSPENDS the run natively
      // (context.agent.suspend in lib/execute-approval.ts) and resumes from
      // Mastra's snapshot — the same mechanism the resume lane uses, so one
      // thread runs ONE approval mechanism instead of two.
      //
      // An artifact card is a tool result, and @ag-ui/mastra cannot map a tool
      // result to a canonical AG-UI interrupt. A native suspension it can.
      approvalPolicy: "suspend" as const,
      // This run parks on a suspend and a human answer resumes it, so
      // `requestDecision` may suspend natively instead of returning an artifact
      // the executor has to abort on. Headless/child runs leave this unset and
      // keep the artifact behaviour (nothing there could answer a suspend).
      canSuspendForInteraction: true,
      goalId: input.threadId,
      // Thread-scoped tools (e.g. artifacts) read the active thread from here.
      orchestratorThreadId: input.threadId,
      runId: input.runId,
      userFacingThreadId: input.threadId,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      ...(scopeAccessToken(input.scope)
        ? { accessToken: scopeAccessToken(input.scope) }
        : {}),
    });

    // Belt-and-suspenders alongside the ALS: the token also rides the Mastra
    // requestContext (the `mastra__authToken` key the server sets from the HTTP
    // Authorization header), for tools that forward the execution context.
    const requestContext = new RequestContext();
    if (scopeAccessToken(input.scope)) {
      requestContext.set(MASTRA_AUTH_TOKEN_KEY, scopeAccessToken(input.scope));
    }
    // Identity for the run's trace — see trace-context.ts.
    setTraceContext(requestContext, {
      agentId: input.agentId,
      lane: "interactive",
      runId: input.runId,
      spaceId: executionSpaceId(spaceResolution),
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });

    // Drive the turn. Every tool execution it triggers runs inside the
    // engenty-tools run context so the execute-boundary approval gate sees the
    // user's grants (and the run identity); ALS propagates to the async calls.
    // Lend the driving agent to the steer seam while the turn runs: a message
    // arriving for this thread meanwhile goes into this loop, not behind it.
    const releaseActiveRun = registerActiveThreadRun(input.threadId, {
      agent,
      resourceId,
      runId: input.runId,
    });
    let turn: Awaited<ReturnType<typeof runInteractiveViaMastraAgent>>;
    try {
      turn = await engentyToolsRunAls.run(toolsRunContext, () =>
        runInteractiveViaMastraAgent({
          accumulator: converter,
          agent,
          agentId: input.agentId,
          emit,
          // Without this the loop halts at Mastra's own default (5 steps) —
          // a survey-heavy first turn ended mid tool-chain with no reply.
          maxSteps: resolveAgentMaxSteps(rootConfig?.limits?.max_steps),
          // `requestFeedback` returns its artifact as a tool RESULT rather than
          // suspending (`requestDecision` suspends — see
          // native-request-decision.ts), and the model would answer straight past
          // it. Recognising it stops the run from inside the stream.
          isStopOnResult: (result: unknown) =>
            isDecisionArtifactPayload(result) ||
            isFeedbackArtifactPayload(result),
          prompt: input.prompt,
          requestContext,
          resourceId,
          runId: input.runId,
          threadId: input.threadId,
          ...(abort.abortSignal ? { abortSignal: abort.abortSignal } : {}),
          ...(input.attachments && input.attachments.length > 0
            ? { attachments: [...input.attachments] }
            : {}),
        })
      );
    } finally {
      releaseActiveRun();
      // The agent's seat goes with the run (§2.3); a suspended run's owner
      // may be taking over right now, and must not find the seat held.
      releaseUserBrowserForRun(
        { browser: runBrowser, tenantId: input.scope.tenantId },
        input.runId
      );
    }
    windowInputTokens = turn.windowInputTokens ?? null;
    const runError = turn.runError;

    // A suspend surfaced — the execute tool's approval gate, `requestDecision`,
    // or a browser-executed frontend tool. Persist the open interrupt keyed by
    // the SUSPENDED run id and emit the RUN_FINISHED interrupt outcome. Nothing
    // is parked in memory: the answer resumes from Mastra's snapshot.
    const sus = turn.suspended;
    if (sus && !abort.abortSignal.aborted) {
      const common = {
        busRunId: input.runId,
        ...(input.effort ? { effort: input.effort } : {}),
        emit,
        ...(typeof input.registry?.getAgentConfig === "function"
          ? {
              getAgentConfig: (agentId: string) =>
                input.registry.getAgentConfig(agentId),
            }
          : {}),
        resumeRunId: sus.mastraRunId,
        scope: input.scope,
        sessionMetadata: input.sessionMetadata ?? {},
        store: input.store,
        threadId: input.threadId,
        toolCallId: sus.toolCallId,
      };
      let handled = true;
      if (isToolApprovalSuspendPayload(sus.suspendPayload)) {
        await emitToolApprovalInterrupt({
          ...common,
          payload: sus.suspendPayload,
        });
      } else if (isMastraToolApprovalSuspend(sus.suspendPayload)) {
        // A workspace tool's `requireApproval` gate. Mastra states the pause as
        // a tool name and args; the card is the same one every gated call gets,
        // and approving writes the grant keyed on this call.
        await emitToolApprovalInterrupt({
          ...common,
          payload: workspaceApprovalSuspendPayload(
            sus.suspendPayload.requireToolApproval
          ),
        });
      } else if (isDecisionArtifactPayload(sus.suspendPayload)) {
        // `requestDecision` suspends natively, so its card arrives as a SUSPEND
        // payload rather than a tool result.
        await emitArtifactInterrupt({ ...common, result: sus.suspendPayload });
      } else {
        handled = await emitFrontendToolInterrupt({
          ...common,
          mergedDefinitions,
          payload: {
            args: sus.args,
            toolCallId: sus.toolCallId,
            toolName: sus.toolName,
          },
        });
      }
      if (handled) {
        suspendedForResume = true;
        threadStatus = "waiting";
        return { runId: input.runId };
      }
    }

    // A `requestFeedback` artifact surfaced and STOPPED the run. Persist the open
    // interrupt + emit the RUN_FINISHED outcome so the chat shows the form. Resume
    // re-runs via the route's artifact branch — there is no snapshot to continue,
    // because the tool returned rather than suspending.
    const art = turn.artifact;
    if (art) {
      await emitArtifactInterrupt({
        busRunId: input.runId,
        ...(input.effort ? { effort: input.effort } : {}),
        emit,
        ...(typeof input.registry?.getAgentConfig === "function"
          ? {
              getAgentConfig: (agentId: string) =>
                input.registry.getAgentConfig(agentId),
            }
          : {}),
        result: art.result,
        scope: input.scope,
        sessionMetadata: input.sessionMetadata ?? {},
        store: input.store,
        threadId: input.threadId,
        toolCallId: art.toolCallId,
      });
      threadStatus = "waiting";
      return { runId: input.runId };
    }

    // No `finish()`: the accumulator is a sink, and the driver closes its own text
    // messages on every exit path.
    //
    // The run reached its end with tool calls still open — a call the model
    // invented never dispatched, so no `tool_end` ever arrived. Without a
    // result the card spins forever in the live window. Emit the same error
    // payload the history repair writes, so this window and the next reload
    // agree. (Suspends/parks returned above; nothing legitimately pending
    // reaches here.)
    for (const agui of converter.closeUnresolvedToolCalls({ knownToolNames })) {
      emit(agui);
    }
    // Fold any native sub-agent progress lines onto the persisted delegation
    // part (Mastra memory drops them) so the sub-agent card Log + drill-in
    // survive reload — same as the control plane. No-op until a native Mastra
    // subagent runs (Engenty's CLI stays Agent-level for its sandbox).
    await persistSubAgentProgress({
      progressByToolCallId: converter.getSubAgentProgressLines(),
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    });

    if (runError && !abort.abortSignal.aborted) {
      // A silent stop (the window ran out / the provider filtered the reply,
      // and no text was written) gets a visible assistant bubble ON the wire —
      // the RUN_ERROR banner alone is session state and dies with the tab.
      // The durable copy is written in `finally`, under the same message id.
      failureNotice = runFailureNoticeText(
        runError,
        resolveUiLanguage(input.routeContext)
      );
      if (failureNotice) {
        const noticeId = `${input.runId}-notice`;
        emit({
          messageId: noticeId,
          role: "assistant",
          type: EventType.TEXT_MESSAGE_START,
        } as AGUIEvent);
        emit({
          delta: failureNotice,
          messageId: noticeId,
          type: EventType.TEXT_MESSAGE_CONTENT,
        } as AGUIEvent);
        emit({
          messageId: noticeId,
          type: EventType.TEXT_MESSAGE_END,
        } as AGUIEvent);
      }
      emit({ message: runError, type: EventType.RUN_ERROR });
      threadStatus = "failed";
      failureMessage = runError;
      return { runId: input.runId };
    }

    if (!abort.abortSignal.aborted) {
      await recordSessionUsage({
        agentId: input.agentId,
        modelId: input.modelId ?? null,
        runId: input.runId,
        scope: input.scope,
        threadId: input.threadId,
        // The RUN's tokens, not the last step's: `usage_update` fires per step,
        // so metering `lastUsage` billed a multi-step turn as a single call.
        usage: converter.runUsage,
        usageStore: input.usageStore,
      });
    }
    emit({
      runId: input.runId,
      threadId: input.threadId,
      type: EventType.RUN_FINISHED,
    });
    threadStatus = "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[conversation ${input.runId}] failed:`, error);
    emit({ message, type: EventType.RUN_ERROR });
    threadStatus = "failed";
    failureMessage = message;
  } finally {
    // Shared teardown: persist this turn on EVERY exit path. Memory flushes at
    // end-of-generation and when a run suspends natively; on the paths it misses
    // (an artifact that aborts the run, a mid-stream failure, a cancel) nothing
    // else writes the turn, so the thread would be left with no messages at all
    // and the next turn would re-ask a question the user already answered.
    //
    // `suspendedForResume` is exactly the natively-suspended set, and writing there
    // too would DUPLICATE the turn rather than rescue it: memory's row and ours
    // carry the same tool call under different message ids and different part
    // shapes, so the chat renders two cards — and only memory's is ever resolved
    // by `resolveToolCallResultInHistory`, leaving ours spinning forever.
    await persistTurnTranscript({
      context: turnContextFromRouteContext(input.routeContext),
      // `failureNotice` marks the "length"/"content-filter" finishes: those DO
      // reach end-of-generation, so memory flushed the turn even though the run
      // is recorded as failed — writing ours would duplicate every tool card.
      memoryFlushedAssistant:
        threadStatus === "completed" ||
        suspendedForResume ||
        failureNotice !== null,
      prompt: input.prompt,
      runId: input.runId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
      transcriptParts: converterRef?.getTranscriptParts() ?? [],
      ...(input.attachmentParts
        ? { attachmentParts: input.attachmentParts }
        : {}),
      ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
      ...(input.persistCurrentUserTurn === false
        ? { persistCurrentUserTurn: false }
        : {}),
    });
    if (failureNotice) {
      // The durable copy of the silent-stop bubble emitted above — without it a
      // reload reads the turn as "no response" again.
      await persistRunFailureNotice({
        runId: input.runId,
        scope: input.scope,
        store: input.store,
        text: failureNotice,
        threadId: input.threadId,
      });
    }
    await patchThreadStatus({ ...input, status: threadStatus });
    if (tracker) {
      // Close the durable run row so recovery/other windows see a settled run.
      // "waiting" (parked suspend or decision/feedback artifact) maps to
      // requires_action: the turn ended awaiting human input — recovery must
      // NOT treat it as in-flight (the interrupt card re-renders from thread
      // metadata, not from an attached stream).
      const usage = converterRef?.runUsage ?? null;
      // Window occupancy is the LAST step's prompt; the row's prompt_tokens
      // stays the run total so billing and the run feed keep their meaning.
      const lastStep = converterRef?.windowUsage ?? null;
      await tracker
        .complete({
          contextPromptTokens: windowInputTokens ?? lastStep?.input ?? null,
          status:
            threadStatus === "waiting"
              ? "requires_action"
              : threadStatus === "failed"
                ? "failed"
                : abort.abortSignal.aborted
                  ? "cancelled"
                  : "completed",
          completionTokens: usage?.output ?? null,
          promptTokens: usage?.input ?? null,
          ...(threadStatus === "failed" && failureMessage
            ? {
                // Named codes for the silent finishes ("context_window_exceeded",
                // "content_filtered") so the runs UI can say WHY, not just that.
                errorCode: agentRunErrorCode(failureMessage),
                errorMessage: failureMessage.slice(0, 2000),
              }
            : {}),
        })
        .catch((error) => {
          console.error(
            `[conversation ${input.runId}] run tracking finish failed:`,
            error
          );
        });
    }
    abort.cleanup();
    markRunDone(input.runId);
    // Tear down the run's root sandbox — destroy() runs syncOut, persisting staged
    // /space + /home to file storage. Delegated child runs own + tear down their
    // own sandboxes (runDelegatedConversation), so this only covers the root.
    //
    // A SUSPENDED run is torn down here too. Nothing reattaches to a live
    // Workspace: a resume rebuilds it and reconnects to the same container by its
    // `engenty-session-<threadId>` label, so keeping the instance alive would
    // leak a container and skip the syncOut that persists staged /space + /home.
    // Do not "optimize" this by holding it open — Mastra latches
    // `status = "destroyed"` permanently, so a reattached-then-destroyed
    // Workspace throws SandboxNotReadyError with no container ever created.
    await destroyRunSandboxes({
      keepParentSandboxAlive: false,
      subAgentSandboxProviders: [],
      ...(input.sandboxProvider
        ? { sandboxProvider: input.sandboxProvider }
        : {}),
    }).catch((error) => {
      console.error(
        `[conversation ${input.runId}] sandbox teardown failed:`,
        error
      );
    });
  }
  return { runId: input.runId };
}
