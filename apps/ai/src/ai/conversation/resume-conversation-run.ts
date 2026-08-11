// Resume a run that suspended on a tool (Phase 3.2) — a browser-executed
// frontend tool or the execute tool's approval gate.
//
// Two lanes, in order:
//   1. PARKED (fast path) — reattach to the session startConversationRun kept
//      alive in-process and call `session.respondToToolSuspension({ resumeData,
//      toolCallId })`, which drives `agent.resumeStream` internally and streams
//      the continuation through the session's subscribe listener.
//   2. SNAPSHOT (crash recovery) — if the park is gone (server restart, TTL
//      expiry), continue from Mastra's workflow snapshot storage instead:
//      `listSuspendedRuns` to confirm the run is really there, then
//      `resumeStreamUntilIdle(resumeData, { runId })`, converted to AG-UI by
//      DurableAgUiConverter. See resumeFromSnapshot below.
// Only when BOTH fail is the run genuinely unrecoverable (RUN_ERROR).
//
// These are complementary, not duplicated: the park keeps the live objects (and
// their richer event stream) for the common same-process case; the snapshot lane
// exists precisely for the case the park cannot cover.
import {
  type AGUIEvent,
  EventType,
  type FrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import type { AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type { Workspace } from "@mastra/core/workspace";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import {
  createNativeFrontendTools,
  type FrontendToolResumeData,
} from "../../../ai/frontend-tools/native-frontend-tool.js";
import {
  isToolApprovalSuspendPayload,
  type ToolApprovalResumeData,
} from "../../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore, ThreadStore } from "../../dal/threads/index.js";
import type { AgentSessionStatus } from "../../dal/threads/types.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { DurableAgUiConverter } from "../durable/durable-agui-bridge.js";
import { createEngentySessionMemoryRuntime } from "../memory/invocation-options.js";
import {
  type AiRegistry,
  type AssembleDynamicAgentOptions,
  assembleDynamicAgent,
  type RuntimeModelConfig,
} from "../registry/index.js";
import { persistSubAgentProgress } from "./persist-sub-agent-progress.js";
import { persistTurnTranscript } from "./persist-turn-transcript.js";
import { recordSessionUsage, usageFromSession } from "./run-usage.js";

/** The instruction-override slice of the assembler's options. */
type AssembleInstructionExtras = NonNullable<
  AssembleDynamicAgentOptions["instructionExtras"]
>;

import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../sessions/connection-approval-grants.js";
import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "../sessions/interrupts.js";
import { readMastraStreamFailure } from "../sessions/mastra-stream-failure.js";
import { resolveToolCallResultInHistory } from "../sessions/resolve-tool-call-history.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import { createSessionRunTracker } from "../sessions/run-tracking.js";
import { readToolApprovalGrants } from "../sessions/tool-approval-grants.js";
import { isDecisionArtifactPayload } from "../sessions/transcript.js";
import { type AiSessionScope, scopeAccessToken } from "../sessions/types.js";
import {
  emitArtifactInterrupt,
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "./emit-interrupt.js";
import { SessionAgUiConverter } from "./session-agui-bridge.js";

import {
  claimResumeInFlight,
  disposeParkedSessionRun,
  finishParkedResume,
  parkSessionRun,
  takeParkedSessionRun,
} from "./session-park.js";
import { patchThreadStatus } from "./thread-status.js";

/** A second tool that suspended within the resumed continuation. */
interface SuspendedAgain {
  args: unknown;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

export interface ResumeConversationRunInput {
  // Text agent key of the session's agent (e.g. "engenty.copilot") so the
  // continuation forwards the same agent identity as the original run.
  agentId?: string;
  // The client's declared frontend tools for this resume. Only the SNAPSHOT
  // lane needs them: the parked lane's live Session still holds the toolset the
  // original run was started with, but a re-assembled agent has none — and
  // without them the continuation cannot see (or call) a browser tool, so the
  // model reports the tool as unavailable mid-conversation.
  agentUi?: { frontend_tools?: FrontendToolDefinition[] } | null;
  // Both optional and only used by the SNAPSHOT fallback below (when the park
  // is gone). The parked path needs neither — the live Session already holds an
  // assembled agent — so a caller that omits them simply loses crash recovery.
  mastra?: Mastra;
  /**
   * SNAPSHOT lane only: the tenant/override-aware model pick for this thread.
   * A re-assembled agent otherwise falls back to the agent config's default,
   * so the second half of one turn could answer on a different model than the
   * first. The parked lane's Session already holds the resolved model.
   */
  modelConfig?: RuntimeModelConfig | null;
  /** Attribution model id for this turn's usage row. */
  modelId?: string | null;
  // The new run id the client attached to for this resume POST.
  newRunId: string;
  registry?: AiRegistry;
  // The just-resolved interrupt's toolCallId (the suspended tool).
  resolvedToolCallId: string;
  /**
   * SNAPSHOT lane only: resolve the run's workspace + sandbox for the
   * re-assembled agent. Same class of gap as `agentUi.frontend_tools` above —
   * the parked lane's Session still carries the original Workspace (and the
   * sandbox instance attached to it), but a brand-new agent has none, so
   * `ctx.workspace.sandbox` is undefined and Code Mode / file / skill tools
   * silently drop out of a post-restart continuation.
   *
   * Deliberately LAZY: the parked lane must never call it. Resolving eagerly
   * would build a second sandbox provider and run its `syncIn` over the staging
   * dir the live one is already using.
   */
  resolveWorkspace?: () => Promise<
    | {
        sandboxProvider?: EngentySandboxProvider;
        workspace?: Workspace;
      }
    | undefined
  >;
  // The browser's frontend-tool result, or the user's approval decision.
  resumeData: FrontendToolResumeData | ToolApprovalResumeData;
  /**
   * SNAPSHOT lane only: the thread's persisted route context, which is where
   * the user's UI language lives. Without it a post-restart continuation
   * answers in English to a German user — the most visible symptom of the
   * re-assembled agent losing the start lane's runtime instructions.
   */
  routeContext?: unknown;
  /** SNAPSHOT lane only: this request's chat context entries (see agentUi). */
  runContext?: unknown;
  // Durable run tracking for the continuation run (see StartConversationRunInput).
  runStore?: AgentRunStore | null;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: ThreadStore;
  // The suspended session run id (from the open interrupt's `run_id`).
  suspendedRunId: string;
  threadId: string;
  /**
   * Metering sink. A gated turn does its cheap half before the approval and its
   * expensive half after — only the first half was ever billed, because neither
   * resume lane recorded usage at all.
   */
  usageStore?: AiUsageStore | null;
}

/**
 * What the post-run pass needs from whichever converter drove this resume.
 * `SessionAgUiConverter` (parked) and `DurableAgUiConverter` (snapshot) both
 * satisfy it — the point of this type is that the teardown does not care which.
 */
interface ResumeConverter {
  getSubAgentProgressLines(): ReadonlyMap<string, string[]>;
  getTranscriptParts(): readonly unknown[];
  /** The LAST step's usage — context-window occupancy. */
  readonly lastUsage: unknown;
  /** Every step summed — what the resume is billed on. */
  readonly totalUsage: unknown;
}

/**
 * The engenty-tools run context both resume lanes drive the continuation inside,
 * mirroring the start executor: without it, a SECOND gated tool call in the
 * continuation (e.g. the model retrying after an error) would see no
 * approvalPolicy and be denied instead of suspending again. Grants persisted for
 * this chat (incl. a just-granted "approve once"/"always") are threaded through
 * so re-approved operations skip the gate.
 *
 * Same agent identity + goal as the original run: the re-executed gated tool
 * must hit core as the agent so a just-persisted goal grant matches.
 */
async function buildResumeToolsRunContext(input: ResumeConversationRunInput) {
  const coreAgentId = await resolveCoreAgentId(
    input.scope.tenantId,
    input.agentId
  );
  return {
    ...getEngentyToolsRunContext(),
    ...(coreAgentId ? { agentId: coreAgentId } : {}),
    approvalGrants: mergeApprovalGrants(
      readToolApprovalGrants(input.sessionMetadata ?? {}),
      await loadConnectionApprovalGrants({
        accessToken: scopeAccessToken(input.scope),
      })
    ),
    approvalPolicy: "suspend" as const,
    // The continuation parks and resumes exactly like the start run, so a
    // follow-up `requestDecision` may suspend too. Without this it would fall
    // back to returning an artifact mid-conversation — two mechanisms in one
    // thread, and the artifact would never be surfaced as a card.
    canSuspendForInteraction: true,
    goalId: input.threadId,
    // Thread-scoped tools (e.g. artifacts) read the active thread from here.
    orchestratorThreadId: input.threadId,
    runId: input.newRunId,
    tenantId: input.scope.tenantId,
    userFacingThreadId: input.threadId,
    userId: input.scope.userId,
    ...(scopeAccessToken(input.scope)
      ? { accessToken: scopeAccessToken(input.scope) }
      : {}),
  };
}

/** Clear the resolved open interrupt from thread metadata (best effort). */
async function clearOpenInterrupt(
  input: ResumeConversationRunInput
): Promise<void> {
  try {
    await input.store.mergeThreadMetadataForUser({
      removeKeys: [AG_UI_OPEN_INTERRUPT_METADATA_KEY],
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
  } catch (error) {
    console.error(
      `[conversation-resume ${input.newRunId}] failed to clear interrupt:`,
      error
    );
  }
}

/**
 * Read Mastra's `tool-call-suspended` chunk. Its payload is
 * `{ toolCallId, toolName, suspendPayload, args, resumeSchema }` — the snapshot
 * lane's equivalent of the parked lane's `tool_suspended` session event.
 */
function readSuspendedToolChunk(chunk: unknown): SuspendedAgain | undefined {
  const typed = chunk as
    | { payload?: Record<string, unknown>; type?: string }
    | undefined;
  if (typed?.type !== "tool-call-suspended") {
    return;
  }
  const payload = typed.payload ?? {};
  const toolCallId =
    typeof payload.toolCallId === "string" ? payload.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  return {
    args: payload.args,
    suspendPayload: payload.suspendPayload,
    toolCallId,
    toolName: typeof payload.toolName === "string" ? payload.toolName : "",
  };
}

/**
 * Read Mastra's in-band `error` chunk. `DurableAgUiConverter` has no case for
 * it, so without this the continuation's failure reached neither the client nor
 * the run row and the run reported success.
 */
function readErrorChunk(chunk: unknown): Error | undefined {
  const typed = chunk as
    | { payload?: Record<string, unknown>; type?: string }
    | undefined;
  if (typed?.type !== "error") {
    return;
  }
  const raw = typed.payload?.error ?? typed.payload;
  if (raw instanceof Error) {
    return raw;
  }
  const message =
    typeof raw === "string"
      ? raw
      : typeof (raw as { message?: unknown })?.message === "string"
        ? (raw as { message: string }).message
        : "Agent run error";
  return new Error(message);
}

/** Name a re-suspended tool for an error message. */
function suspendedAgainLabel(suspended: SuspendedAgain): string {
  return suspended.toolName
    ? `${suspended.toolName} (${suspended.toolCallId})`
    : `tool call ${suspended.toolCallId}`;
}

/**
 * Rebuild the instruction layers the START lane gives its agent: the persisted
 * soul / skills / agents overrides, plus the per-run runtime instructions the
 * controller carries there. A re-assembled agent has neither, so a post-restart
 * continuation dropped the tenant's persona AND the user's language mid-turn.
 *
 * Two seams, not one: the persisted overrides ride `appendBodies` into the base
 * prompt, while the runtime context is returned separately because it must NOT
 * enter the system prompt — it is the volatile half, and the START lane now
 * feeds it through an input processor so the cache prefix survives a navigation
 * (see runtime-context-processor.ts).
 *
 * Best-effort by design: instructions are a quality degradation, while throwing
 * here would strand a recoverable interrupt.
 */
async function resolveResumeInstructionExtras(
  input: ResumeConversationRunInput
): Promise<{
  instructionExtras?: AssembleInstructionExtras;
  runtimeContextInstructions?: string;
}> {
  if (!input.agentId) {
    return {};
  }
  try {
    const [
      { resolveAgentInstructionExtras },
      { buildSessionRuntimeInstructions },
    ] = await Promise.all([
      import("../instructions/resolve-agent-instruction-extras.js"),
      import("../sessions/runtime-instructions.js"),
    ]);
    const extras = await resolveAgentInstructionExtras({
      agentId: input.agentId,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
    });
    const runtime = (
      await buildSessionRuntimeInstructions({
        agentId: input.agentId,
        // `AgentUiProducerContext.frontend_tools` is required; this input's is
        // optional (a client may declare none), so normalize rather than cast.
        agentUi: input.agentUi
          ? {
              ...input.agentUi,
              frontend_tools: input.agentUi.frontend_tools ?? [],
            }
          : null,
        routeContext: (input.routeContext ?? null) as never,
        runContext: input.runContext as never,
        scope: input.scope,
        threadId: input.threadId,
      })
    ).trim();
    return {
      ...(extras ? { instructionExtras: extras } : {}),
      ...(runtime ? { runtimeContextInstructions: runtime } : {}),
    };
  } catch (error) {
    console.error(
      `[conversation-resume ${input.newRunId}] instruction extras failed:`,
      error
    );
    return {};
  }
}

/**
 * What a snapshot resume did, so the caller can finish or re-interrupt. The
 * converter is NOT here on purpose — it reaches the caller through
 * `onConverterReady`, which also fires on the paths that throw.
 */
interface SnapshotResumeResult {
  /** The browser tools declared for this resume — needed to name a re-suspend. */
  mergedDefinitions: readonly FrontendToolDefinition[];
  /** True once the stored snapshot was found and the continuation ran. */
  resumed: boolean;
  /** A SECOND tool suspended inside the continuation (see the caller). */
  suspendedAgain?: SuspendedAgain;
}

/**
 * Crash-recovery lane: continue a suspended run straight from Mastra's workflow
 * snapshot storage when the in-process park is gone. Complements the park
 * (which stays the fast path for same-process resumes) — it does not replace it.
 *
 * `resumed: false` when the caller gave us no registry/mastra to assemble with,
 * or storage has no suspended snapshot for this run; the caller then reports the
 * unrecoverable error as before.
 */
async function resumeFromSnapshot(
  input: ResumeConversationRunInput,
  emit: (event: AGUIEvent) => void,
  // Handed over the moment it exists, NOT via the return value: a continuation
  // that dies mid-stream throws out of here, and a converter the caller only
  // learns about on a clean return leaves the post-run pass with nothing —
  // dropping the half-answer, the sub-agent log and the token count for exactly
  // the failure the pass exists to salvage.
  onConverterReady: (converter: ResumeConverter) => void
): Promise<SnapshotResumeResult> {
  // Merged up front (not just for the stream) so the caller can resolve a
  // re-suspended frontend tool to its declaration even on an early bail.
  const mergedDefinitions = mergeFrontendToolDefinitions(
    input.agentUi?.frontend_tools,
    { includeServerTools: !input.agentId?.startsWith("chatbot.") }
  );
  if (
    !(input.registry && input.mastra && input.suspendedRunId && input.agentId)
  ) {
    return { mergedDefinitions, resumed: false };
  }
  // A FRESH workspace, never a recycled one. The sandbox container is keyed by
  // lifecycle scope (`engenty-session-<threadId>`), so a new instance reconnects
  // to the same container by label — which is what makes rebuilding it cheap and
  // safe. Reusing a torn-down instance would not work at all: Mastra latches
  // `status = "destroyed"` and `ensureRunning()` then throws
  // SandboxNotReadyError without ever reaching Docker.
  //
  // Never fail the resume over this: continuing without the sandbox is a
  // degraded turn, while throwing here would strand a recoverable interrupt.
  let resolved:
    | { sandboxProvider?: EngentySandboxProvider; workspace?: Workspace }
    | undefined;
  try {
    resolved = await input.resolveWorkspace?.();
  } catch (error) {
    console.error(
      `[conversation-resume ${input.newRunId}] snapshot workspace resolution failed:`,
      error
    );
  }
  // Nothing is parked on this lane, so this run owns the sandbox outright:
  // whatever it resolved must be torn down before returning, on EVERY exit
  // (including the no-snapshot bail below) or the container leaks and the
  // provider's syncOut never persists staged /shared + /home.
  // Everything the START lane feeds the agent beyond its base config. A
  // re-assembled agent has none of it, and the parked lane never notices
  // because its live Session still holds the originals. Best-effort: a
  // degraded continuation beats a stranded interrupt.
  const { instructionExtras, runtimeContextInstructions } =
    await resolveResumeInstructionExtras(input);
  try {
    const agent = await assembleDynamicAgent(input.registry, input.agentId, {
      ...(instructionExtras ? { instructionExtras } : {}),
      ...(runtimeContextInstructions ? { runtimeContextInstructions } : {}),
      mastra: input.mastra,
      ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
      // The parked lane's agent gets memory from its AgentController
      // (`agent.__setMemory`); a re-assembled one has none, and an agent with no
      // MastraMemory instance neither recalls the thread nor PERSISTS what the
      // continuation produces — Mastra logs "No memory is configured but
      // resourceId and threadId were passed in args" and writes zero
      // `ai.mastra_messages` rows, so a post-restart answer vanished on reload.
      memory: createEngentySessionMemoryRuntime({
        agentId: input.agentId,
        scope: input.scope,
        store: input.store,
        threadId: input.threadId,
      }).memory,
      resolveContext: {
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      },
      ...(resolved?.workspace ? { workspace: resolved.workspace } : {}),
    });
    // Storage is the authority here: without a suspended snapshot there is
    // nothing to continue, and the resume would fail less legibly.
    //
    // Same question the thread-load reconciler asks via `hasResumableSnapshot`;
    // it is inlined here rather than shared because this path already holds the
    // assembled agent and sharing would assemble a second one.
    const { runs } = await agent.listSuspendedRuns({
      threadId: input.threadId,
    });
    if (!runs.some((run) => run.runId === input.suspendedRunId)) {
      return { mergedDefinitions, resumed: false };
    }

    const toolsRunContext = await buildResumeToolsRunContext(input);
    const converter = new DurableAgUiConverter();
    onConverterReady(converter);
    // Re-declare the browser's tools for the continuation. `startConversationRun`
    // does the same merge; here it must be redone because the assembled agent is
    // brand new. Without it the resumed turn answers "that tool isn't available"
    // — the run continues, but the conversation visibly degrades.
    const frontendTools = createNativeFrontendTools(mergedDefinitions);
    // A SECOND tool suspending inside the continuation is the normal shape here:
    // this lane runs under `approvalPolicy: "suspend"`, so any gated tool the
    // model reaches for parks the run again. Mastra signals it with a
    // `tool-call-suspended` chunk and then ENDS the stream — no `tool-call`
    // chunk, no text. Left unhandled the resume looked like a run that finished
    // with nothing to say, and the caller cleared the open interrupt on a run
    // that was in fact waiting for input.
    let suspendedAgain: SuspendedAgain | undefined;
    let streamError: Error | undefined;
    await engentyToolsRunAls.run(toolsRunContext, async () => {
      // `untilIdle` keeps the outer stream open across continuations a background
      // task may trigger. (`resumeStreamUntilIdle` is the deprecated spelling.)
      const stream = await agent.resumeStream(input.resumeData, {
        ...(Object.keys(frontendTools).length > 0
          ? { clientTools: frontendTools }
          : {}),
        memory: {
          resource: input.scope.userId,
          thread: input.threadId,
        },
        runId: input.suspendedRunId,
        untilIdle: true,
        ...(input.resolvedToolCallId
          ? { toolCallId: input.resolvedToolCallId }
          : {}),
      });
      for await (const chunk of stream.fullStream) {
        const suspend = readSuspendedToolChunk(chunk);
        if (suspend) {
          suspendedAgain = suspend;
        }
        const failure = readErrorChunk(chunk);
        if (failure && !streamError) {
          streamError = failure;
        }
        for (const event of converter.convert(chunk as never)) {
          emit(event);
        }
      }
      // Mastra can also END a stream with `finishReason: "error"` and never
      // throw (gateway context_length_exceeded is the common one), which reads
      // as a clean finish from the chunk loop alone.
      const finishFailure = await readMastraStreamFailure(stream);
      if (finishFailure && !streamError) {
        streamError = finishFailure;
      }
    });
    // An in-band failure must not be reported as a completed run: the caller
    // would write a success into history and CLEAR the open interrupt, deleting
    // the only pointer back to a turn that never produced an answer. The parked
    // lane gets this from the session's `error` event; here it is the error
    // chunk plus the finishReason.
    if (streamError) {
      throw streamError;
    }
    for (const event of converter.finish()) {
      emit(event);
    }
    // A tool the model invented DURING the continuation dangles exactly as on
    // the parked lane: no result chunk, so the card spins forever and the
    // persisted part stays at `state:"call"`. A tool that SUSPENDED is not
    // dangling — the converter tracks those separately, because the user is
    // going to answer it.
    for (const event of converter.closeUnresolvedToolCalls()) {
      emit(event);
    }
    return {
      mergedDefinitions,
      resumed: true,
      ...(suspendedAgain ? { suspendedAgain } : {}),
    };
  } finally {
    await resolved?.sandboxProvider?.destroy().catch((error: unknown) => {
      console.error(
        `[conversation-resume ${input.newRunId}] snapshot sandbox teardown failed:`,
        error
      );
    });
  }
}

/**
 * Turn a re-suspend on the SNAPSHOT lane into the next AG-UI interrupt. Same
 * three-way split the parked lane does after `respondToToolSuspension`, against
 * the same helpers — only the resume target differs: the parked lane points the
 * next answer at the live session's new run id, while here the run kept its id
 * (Mastra resumed it in place), so the next answer re-enters this lane.
 *
 * Returns false when the payload names no interrupt we can render; the caller
 * then finishes the run rather than leaving the thread waiting on nothing.
 */
async function emitSnapshotSuspendInterrupt(args: {
  emit: (event: AGUIEvent) => void;
  input: ResumeConversationRunInput;
  mergedDefinitions: readonly FrontendToolDefinition[];
  suspendedAgain: SuspendedAgain;
}): Promise<boolean> {
  const { emit, input, suspendedAgain } = args;
  const common = {
    busRunId: input.newRunId,
    emit,
    resumeRunId: input.suspendedRunId,
    scope: input.scope,
    sessionMetadata: input.sessionMetadata ?? {},
    store: input.store,
    threadId: input.threadId,
  };
  if (isToolApprovalSuspendPayload(suspendedAgain.suspendPayload)) {
    await emitToolApprovalInterrupt({
      ...common,
      payload: suspendedAgain.suspendPayload,
      toolCallId: suspendedAgain.toolCallId,
    });
    return true;
  }
  if (isDecisionArtifactPayload(suspendedAgain.suspendPayload)) {
    return await emitArtifactInterrupt({
      ...common,
      result: suspendedAgain.suspendPayload,
      toolCallId: suspendedAgain.toolCallId,
    });
  }
  return await emitFrontendToolInterrupt({
    ...common,
    mergedDefinitions: args.mergedDefinitions,
    payload: {
      args: suspendedAgain.args,
      toolCallId: suspendedAgain.toolCallId,
      toolName: suspendedAgain.toolName,
    },
  });
}

export async function resumeConversationRun(
  input: ResumeConversationRunInput
): Promise<{ runId: string }> {
  markRunLive(input.newRunId);
  // Durable tracking for the continuation (see startConversationRun): the
  // tracker publishes to the bus AND persists ai.agent_run(_event) so a reload
  // or second window can discover and replay this resume run.
  const tracker = input.runStore
    ? createSessionRunTracker({
        agentId: input.agentId ?? "unknown",
        createdByUserId: input.scope.userId,
        runId: input.newRunId,
        runStore: input.runStore,
        threadId: input.threadId,
        tenantId: input.scope.tenantId,
      })
    : null;
  let seq = 0;
  const emit = tracker
    ? (event: AGUIEvent) => {
        void tracker.append(event);
      }
    : (event: AGUIEvent) =>
        publishRunEvent(input.newRunId, { event, seq: seq++ });
  emit({
    runId: input.newRunId,
    threadId: input.threadId,
    type: EventType.RUN_STARTED,
  });

  const parked = input.suspendedRunId
    ? takeParkedSessionRun(input.suspendedRunId)
    : undefined;
  let reParked = false;
  // The continuation ended on a SECOND native suspend (either lane). Mastra
  // flushes the assistant turn when a run parks, so the post-run pass must not
  // write it a second time — see the `finally` below.
  let parkedAgain = false;
  // Set when THIS call claimed the in-flight marker for the snapshot lane, so
  // the `finally` releases only its own claim (the parked lane's claim is made
  // and owned by `takeParkedSessionRun`).
  let claimedResume = false;
  // Whichever lane ran; the post-run pass in `finally` reads it.
  let converterRef: ResumeConverter | undefined;
  // Stamped onto the durable run row. Without it a failed resume stored
  // `error_message = NULL` — the one place you look after the fact was blank.
  let failureMessage: string | null = null;
  let threadStatus: AgentSessionStatus = "completed";
  await patchThreadStatus({ ...input, status: "running" });
  try {
    if (!parked) {
      // Distinguish a duplicate answer racing the live resume (recoverable —
      // the in-flight resume will re-park or finish) from a lost park (server
      // restart / TTL expiry — the suspended state is genuinely gone).
      //
      // Claiming rather than merely asking is what makes this lane exclusive:
      // `takeParkedSessionRun` claims implicitly, but on the snapshot lane it
      // returns nothing, so two answers used to run the SAME run concurrently —
      // both resolving and then destroying the one session-scoped sandbox, and
      // both invisible to the thread-load reconciler, which reads this marker
      // as proof an interrupt is still live.
      if (input.suspendedRunId) {
        if (!claimResumeInFlight(input.suspendedRunId)) {
          throw new Error(
            `A resume for run ${input.suspendedRunId} is already in progress; this duplicate answer was ignored.`
          );
        }
        claimedResume = true;
      }
      // The park is gone (server restart / TTL expiry) — but Mastra also wrote
      // the suspension to workflow snapshot storage, which survives both. Try
      // to continue the run from there before giving up. Verified end-to-end
      // across two processes on 1.55.0 (see PLAN-mastra-durable-chat Phase 2).
      const snapshot = await resumeFromSnapshot(input, emit, (converter) => {
        converterRef = converter;
      });
      if (snapshot.resumed) {
        // Close the suspended tool step in PERSISTED history. The parked lane
        // gets this from the live Session's memory write; a snapshot resume
        // leaves the original row at `state:"call"`, so on the next thread load
        // the tool renders as still spinning even though the run completed.
        await resolveToolCallResultInHistory({
          result: input.resumeData,
          scope: input.scope,
          store: input.store,
          threadId: input.threadId,
          toolCallId: input.resolvedToolCallId,
        });
        // A SECOND tool suspended in the continuation — surface it as the next
        // interrupt instead of finishing. There is no live session to re-park
        // here: Mastra resumed under the SAME run id and wrote the new
        // suspension back to snapshot storage, so the next answer comes straight
        // back down this lane with `resumeRunId` unchanged.
        if (snapshot.suspendedAgain) {
          const handled = await emitSnapshotSuspendInterrupt({
            emit,
            input,
            mergedDefinitions: snapshot.mergedDefinitions,
            suspendedAgain: snapshot.suspendedAgain,
          });
          if (handled) {
            parkedAgain = true;
            threadStatus = "waiting";
            return { runId: input.newRunId };
          }
          // Nothing could render it (e.g. a frontend tool this POST did not
          // declare), yet Mastra still holds the suspension. Falling through to
          // RUN_FINISHED would report success AND clear the open interrupt —
          // deleting the only pointer back to a run that is genuinely waiting.
          // Fail loudly instead and leave the interrupt alone; the parked lane's
          // `finally` rescues this case via `suspensions.hasPending()`, which
          // this lane has no live session to ask.
          throw new Error(
            `The recovered run suspended again on ${suspendedAgainLabel(snapshot.suspendedAgain)}, which this resume cannot surface as an interrupt.`
          );
        }
        await clearOpenInterrupt(input);
        emit({
          runId: input.newRunId,
          threadId: input.threadId,
          type: EventType.RUN_FINISHED,
        });
        threadStatus = "completed";
        return { runId: input.newRunId };
      }
      throw new Error(
        `Session run ${input.suspendedRunId || "(missing)"} is no longer in memory and has no resumable snapshot; cannot resume the suspended tool (the server may have restarted).`
      );
    }
    // The tool call must actually be parked in the session. Responding to a
    // toolCallId Mastra does not know is a SILENT no-op (respondToToolSuspension
    // resolves without resuming anything) — the old code then cleared the open
    // interrupt and reported RUN_FINISHED while the run stayed suspended
    // forever. Surface it as an error and KEEP the park so the real interrupt
    // stays resumable.
    if (
      !parked.session.suspensions.has({ toolCallId: input.resolvedToolCallId })
    ) {
      parkSessionRun(input.suspendedRunId, {
        controller: parked.controller,
        mergedDefinitions: parked.mergedDefinitions,
        session: parked.session,
        threadId: parked.threadId,
        ...(parked.sandboxProvider
          ? { sandboxProvider: parked.sandboxProvider }
          : {}),
      });
      reParked = true;
      throw new Error(
        `Tool call ${input.resolvedToolCallId || "(missing)"} is not suspended on run ${input.suspendedRunId}; it may already have been resumed.`
      );
    }
    const converter = new SessionAgUiConverter();
    converterRef = converter;
    let runError: string | null = null;
    let suspendedAgain: SuspendedAgain | null = null;
    // A second suspend in the continuation leaves respondToToolSuspension pending
    // forever — race it against this signal (same as the start executor).
    let signalSuspendAgain: () => void = () => {
      // replaced below
    };
    const suspendAgainSignal = new Promise<void>((resolve) => {
      signalSuspendAgain = resolve;
    });
    const unsub = parked.session.subscribe((event) => {
      const typed = event as {
        args?: unknown;
        error?: { message?: string };
        toolCallId?: string;
        toolName?: string;
        type?: string;
      };
      if (typed.type === "error") {
        runError = typed.error?.message ?? "Session run error";
      }
      if (typed.type === "tool_suspended") {
        suspendedAgain = {
          args: typed.args,
          suspendPayload: (typed as { suspendPayload?: unknown })
            .suspendPayload,
          toolCallId: typed.toolCallId ?? "",
          toolName: typed.toolName ?? "",
        };
        signalSuspendAgain();
      }
      for (const agui of converter.convert(event as never)) {
        emit(agui);
      }
    });

    const toolsRunContext = await buildResumeToolsRunContext(input);
    const resumeDone = engentyToolsRunAls
      .run(toolsRunContext, () =>
        parked.session.respondToToolSuspension({
          resumeData: input.resumeData,
          toolCallId: input.resolvedToolCallId,
        })
      )
      .catch((error: unknown) => {
        if (!runError) {
          runError =
            error instanceof Error ? error.message : "Session run error";
        }
      });
    await Promise.race([resumeDone, suspendAgainSignal]);
    unsub();

    // A SECOND tool suspended in the continuation (another approval gate or a
    // frontend tool) — re-emit the interrupt and re-park the SAME session for
    // the next resume.
    const again = suspendedAgain as SuspendedAgain | null;
    if (again) {
      const reRunId = parked.session.getCurrentRunId() ?? "";
      let handled = false;
      if (isToolApprovalSuspendPayload(again.suspendPayload)) {
        await emitToolApprovalInterrupt({
          busRunId: input.newRunId,
          emit,
          payload: again.suspendPayload,
          resumeRunId: reRunId,
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
          toolCallId: again.toolCallId,
        });
        handled = true;
      } else if (isDecisionArtifactPayload(again.suspendPayload)) {
        // Another `requestDecision` in the continuation — emit its card against
        // the SAME re-parked session so the next answer resumes in place too.
        handled = await emitArtifactInterrupt({
          busRunId: input.newRunId,
          emit,
          result: again.suspendPayload,
          resumeRunId: reRunId,
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
          toolCallId: again.toolCallId,
        });
      } else {
        handled = await emitFrontendToolInterrupt({
          busRunId: input.newRunId,
          resumeRunId: reRunId,
          emit,
          mergedDefinitions: parked.mergedDefinitions,
          payload: {
            args: again.args,
            toolCallId: again.toolCallId,
            toolName: again.toolName,
          },
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
        });
      }
      if (handled) {
        parkSessionRun(reRunId, {
          controller: parked.controller,
          mergedDefinitions: parked.mergedDefinitions,
          session: parked.session,
          threadId: input.threadId,
          ...(parked.sandboxProvider
            ? { sandboxProvider: parked.sandboxProvider }
            : {}),
        });
        parkedAgain = true;
        reParked = true;
        threadStatus = "waiting";
        return { runId: input.newRunId };
      }
    }

    for (const agui of converter.finish()) {
      emit(agui);
    }
    // A tool the model invented DURING the continuation dangles exactly as it
    // does on a fresh turn (no dispatch → no `tool_end` → a card that spins
    // forever). Answer it here too. No tool-name list is passed on purpose:
    // this lane can only see the parked frontend tools, and a partial list
    // would report real server tools as nonexistent. The next fresh turn's
    // history repair, which does have the full list, writes the precise
    // correction the model reads.
    for (const agui of converter.closeUnresolvedToolCalls()) {
      emit(agui);
    }
    if (runError) {
      emit({ message: runError, type: EventType.RUN_ERROR });
      threadStatus = "failed";
      failureMessage = runError;
      return { runId: input.newRunId };
    }
    // The interrupt is resolved — clear it from session metadata.
    await clearOpenInterrupt(input);
    emit({
      runId: input.newRunId,
      threadId: input.threadId,
      type: EventType.RUN_FINISHED,
    });
    threadStatus = "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    threadStatus = reParked ? "waiting" : "failed";
    failureMessage = message;
    console.error(`[conversation-resume ${input.newRunId}] failed:`, error);
    emit({ message, type: EventType.RUN_ERROR });
  } finally {
    // The post-run pass the START executor has always done and neither resume
    // lane did. It belongs in `finally` because the cases that need it most are
    // the ones that never reach end-of-generation — a mid-stream failure or a
    // cancelled continuation — where without this the whole continuation is lost
    // and the next turn re-asks the question the user already answered.
    if (converterRef) {
      // Fold the sub-agent Log back onto the persisted delegation part; Mastra
      // memory drops app-level `progressLines`, so the card is empty on reload.
      await persistSubAgentProgress({
        progressByToolCallId: converterRef.getSubAgentProgressLines(),
        scope: input.scope,
        store: input.store,
        threadId: input.threadId,
      });
      // No `prompt`: a resume carries no new user turn — the user's message was
      // persisted by the run that suspended. `parkedAgain` counts as flushed:
      // Mastra writes the assistant turn when the run parks, and writing it
      // again here would persist the same tool call twice under two message ids.
      await persistTurnTranscript({
        memoryFlushedAssistant: threadStatus === "completed" || parkedAgain,
        prompt: "",
        runId: input.newRunId,
        scope: input.scope,
        store: input.store,
        threadId: input.threadId,
        transcriptParts: converterRef.getTranscriptParts(),
      });
      await recordSessionUsage({
        agentId: input.agentId ?? "unknown",
        modelId: input.modelId ?? null,
        runId: input.newRunId,
        scope: input.scope,
        threadId: input.threadId,
        // Per-step `usage_update` again: bill the whole resume, not its last step.
        usage: converterRef.totalUsage,
        usageStore: input.usageStore,
      });
    }
    // Only the resume that CLAIMED the marker may release it — a duplicate
    // that was turned away must not clear it out from under the live resume.
    // The parked lane's claim is made inside `takeParkedSessionRun`; the
    // snapshot lane's is `claimedResume`.
    if ((parked || claimedResume) && input.suspendedRunId) {
      finishParkedResume(input.suspendedRunId);
    }
    if (!reParked) {
      // An errored resume must not destroy a session that still holds parked
      // suspensions — that would strand the open interrupt forever (spinners
      // never resolve, no way to approve). Re-park so the user can retry;
      // the park TTL owns the eventual cleanup.
      if (parked?.session.suspensions.hasPending()) {
        parkSessionRun(input.suspendedRunId, {
          controller: parked.controller,
          mergedDefinitions: parked.mergedDefinitions,
          session: parked.session,
          threadId: parked.threadId,
          ...(parked.sandboxProvider
            ? { sandboxProvider: parked.sandboxProvider }
            : {}),
        });
        threadStatus = "waiting";
      } else if (parked) {
        // The run is finally over — release the controller AND the sandbox whose
        // teardown the park took ownership of when the run suspended.
        await disposeParkedSessionRun(parked);
      }
    }
    await patchThreadStatus({ ...input, status: threadStatus });
    if (tracker) {
      const usage = usageFromSession(converterRef?.totalUsage);
      const lastStep = usageFromSession(converterRef?.lastUsage);
      await tracker
        .complete({
          completionTokens: usage?.output ?? null,
          contextPromptTokens: lastStep?.input ?? null,
          promptTokens: usage?.input ?? null,
          status:
            threadStatus === "waiting"
              ? "requires_action"
              : threadStatus === "failed"
                ? "failed"
                : "completed",
          ...(threadStatus === "failed" && failureMessage
            ? {
                errorCode: "run_error",
                errorMessage: failureMessage.slice(0, 2000),
              }
            : {}),
        })
        .catch((error) => {
          console.error(
            `[conversation-resume ${input.newRunId}] run tracking finish failed:`,
            error
          );
        });
    }
    markRunDone(input.newRunId);
  }
  return { runId: input.newRunId };
}
