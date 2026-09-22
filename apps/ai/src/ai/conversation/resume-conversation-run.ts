// Resume a run that suspended on a tool — a browser-executed frontend tool, or
// the execute tool's approval gate.
//
// ONE lane: Mastra wrote the suspension to workflow snapshot storage, which
// survives a restart, a TTL and a second process, so there is nothing to hold in
// memory and nothing to lose. `listSuspendedRuns` confirms the run is really
// there, then the resume is handed to `@ag-ui/mastra`, which calls
// `agent.resumeStream` itself and emits AG-UI directly. See `resumeFromSnapshot`.
// If that finds no snapshot the run is genuinely unrecoverable (RUN_ERROR).
//
// The cost of resuming from a snapshot rather than a live object is that the
// agent must be REASSEMBLED each time — tools, memory and workspace included.
// Everything below that looks like re-derivation is paying that price; each spot
// says what breaks when it is skipped.
import {
  type AGUIEvent,
  EventType,
  type FrontendToolDefinition,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import type { AiEffort, AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type { Workspace } from "@mastra/core/workspace";
import {
  type FrontendToolGrant,
  resolveFrontendToolsForAgent,
} from "../../../ai/frontend-tools/catalog.js";
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
  withEnvCoreBaseUrl,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore, ThreadStore } from "../../dal/threads/index.js";
import type { AgentSessionStatus } from "../../dal/threads/types.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { resolveRunBrowser } from "../browser/run-browser.js";
import {
  createUserBrowserTools,
  startUserBrowserOnResume,
} from "../browser/user-browser-tools.js";
import {
  createEngentyMastraResourceId,
  createEngentySessionMemoryRuntime,
} from "../memory/invocation-options.js";
import { resolveSharedObservationsScope } from "../memory/shared-observational-memory.js";
import {
  type AiRegistry,
  type AssembleDynamicAgentOptions,
  assembleDynamicAgent,
  type RuntimeModelConfig,
} from "../registry/index.js";
import { frontendToolGrantForRun } from "../sessions/frontend-tool-grant.js";
import {
  enrichToolsSpaceForAgentRun,
  type RunSpaceResolution,
  resolvedRunSpace,
  resolveRunSpaceForThread,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import {
  requireStoredThreadAccess,
  sharedMastraRoomFromThread,
} from "../sessions/thread-access.js";
import { workspaceApprovalSuspendPayload } from "../workspace/workspace-tool-guards.js";
import { resumeViaMastraAgent } from "./agui-resume-driver.js";
import { AgUiTurnAccumulator } from "./agui-turn-accumulator.js";
import {
  emitTrajectoryHeader,
  listKnownToolNames,
  recallTrajectoryMessagePointers,
} from "./emit-trajectory-header.js";
import { persistSubAgentProgress } from "./persist-sub-agent-progress.js";
import { persistTurnTranscript } from "./persist-turn-transcript.js";
import { createRootDelegationTools } from "./root-delegation-tools.js";
import { type RunUsage, recordSessionUsage } from "./run-usage.js";

/** The instruction-override slice of the assembler's options. */
type AssembleInstructionExtras = NonNullable<
  AssembleDynamicAgentOptions["instructionExtras"]
>;

import { resolveThreadInterruptNotifications } from "../../notifications/thread-interrupts.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../sessions/connection-approval-grants.js";
import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "../sessions/interrupts.js";
import { resolveAgentMaxSteps } from "../sessions/max-steps.js";
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
import { isMastraToolApprovalSuspend } from "./mastra-stream-intercept.js";

import { claimResumeInFlight, releaseResumeInFlight } from "./resume-claims.js";
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
  // lane needs them: a reassembled agent starts with no toolset, and without
  // these the continuation cannot see (or call) a browser tool — the model then
  // reports the tool as unavailable mid-conversation.
  agentUi?: { frontend_tools?: FrontendToolDefinition[] } | null;
  /**
   * The tier `modelConfig` was resolved from, carried forward so a continuation
   * that suspends AGAIN persists it onto the next interrupt — otherwise the
   * tier survives exactly one resume and the third run of a turn drifts.
   */
  effort?: AiEffort | null;
  // Required to reassemble the agent. A caller that omits them cannot resume at
  // all, so the run reports as unrecoverable.
  mastra?: Mastra;
  /**
   * The tenant/override-aware model pick for this thread. A reassembled agent
   * otherwise falls back to the agent config's default, so the second half of a
   * turn would answer on a different model than the first.
   */
  modelConfig?: RuntimeModelConfig | null;
  /** Attribution model id for this turn's usage row. */
  modelId?: string | null;
  // The new run id the client attached to for this resume POST.
  newRunId: string;
  registry?: AiRegistry;
  /** Rebuild the same child-run tools a fresh start receives. */
  resolveChildWorkspace?: (input: {
    agentId: string;
    runId: string;
    threadId: string;
  }) => Promise<
    | { sandboxProvider?: EngentySandboxProvider; workspace?: Workspace }
    | undefined
  >;
  // The just-resolved interrupt's toolCallId (the suspended tool).
  resolvedToolCallId: string;
  /**
   * Resolve the run's workspace + sandbox for the reassembled agent. Same class
   * of gap as `agentUi.frontend_tools` above: a brand-new agent carries no
   * Workspace, so `ctx.workspace.sandbox` is undefined and Code Mode / file /
   * skill tools silently drop out of the continuation.
   *
   * Deliberately LAZY. Resolving eagerly builds a second sandbox provider and
   * runs its `syncIn` over a staging dir another one may already hold.
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
 * What the post-run pass needs from the accumulator that drove this resume.
 * Kept as a narrow interface rather than the class: the teardown reads four
 * facts and should not be able to reach for anything else.
 */
interface ResumeConverter {
  getSubAgentProgressLines(): ReadonlyMap<string, string[]>;
  getTranscriptParts(): readonly unknown[];
  recordSubAgentProgress(toolCallId: string, line: string): void;
  /** Every model call summed — what the resume is billed on. NORMALIZED. */
  readonly runUsage: RunUsage | null;
  /** The LAST call's input — context-window occupancy. NORMALIZED. */
  readonly windowUsage: RunUsage | null;
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
async function toolsSpaceForResume(
  input: ResumeConversationRunInput,
  spaceResolution: RunSpaceResolution
) {
  const agentId = input.agentId;
  const config = agentId
    ? await input.registry?.getAgentConfig?.(agentId)
    : undefined;
  return enrichToolsSpaceForAgentRun({
    agentId: agentId ?? "",
    preferredConnectorIds: config?.connectorIds ?? [],
    scope: input.scope,
    space: toolsSpaceFromResolution(spaceResolution),
  });
}

async function buildResumeToolsRunContext(input: ResumeConversationRunInput) {
  const coreAgentId = await resolveCoreAgentId(
    input.scope.tenantId,
    input.agentId
  );
  // The continuation runs in the same space the turn started in — resolved
  // from the thread, not from wherever the browser has navigated since
  // (PLAN-spaces.md Phase C3a).
  const spaceResolution = await resolveRunSpaceForThread({
    runId: input.newRunId,
    scope: input.scope,
    store: input.store,
    threadId: input.threadId,
  });
  const toolsSpace = await toolsSpaceForResume(input, spaceResolution);
  return withEnvCoreBaseUrl({
    ...getEngentyToolsRunContext(),
    ...(coreAgentId ? { agentId: coreAgentId } : {}),
    agentTypeKey: input.agentId,
    space: toolsSpace,
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
  });
}

/**
 * Clear the answered open interrupt from thread metadata (best effort) and
 * close its notification for everyone — the answer came from whoever got
 * there first.
 */
async function clearOpenInterrupt(
  input: ResumeConversationRunInput
): Promise<void> {
  const open = readAgUiOpenInterrupt(input.sessionMetadata ?? {});
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
  await resolveThreadInterruptNotifications({
    interruptId: open?.interrupt_id,
    outcome: "resumed",
    tenantId: input.scope.tenantId,
  });
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
  input: ResumeConversationRunInput,
  spaceResolution: RunSpaceResolution,
  frontendToolGrant: FrontendToolGrant | null
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
        frontendToolGrant,
        routeContext: (input.routeContext ?? null) as never,
        runContext: input.runContext as never,
        scope: input.scope,
        spaceResolution,
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
  /** The LAST model call's input tokens — context-window occupancy. */
  windowInputTokens?: number | null;
}

/**
 * Continue a suspended run from Mastra's workflow snapshot storage.
 *
 * `resumed: false` when the caller gave us no registry/mastra to assemble with,
 * or storage holds no suspended snapshot for this run; the caller then reports
 * the run as unrecoverable.
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
  // Re-merged below once the row and the Space are known: an Engenty that
  // held the page tools when the run parked has to hold them again on the
  // continuation, or the very tool that suspended is gone when it resumes.
  let mergedDefinitions = resolveFrontendToolsForAgent({
    agentId: input.agentId,
    clientTools: input.agentUi?.frontend_tools,
  });
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
  // Everything the START lane feeds the agent beyond its base config; a
  // reassembled agent has none of it. Best-effort: a degraded continuation beats
  // a stranded interrupt.
  try {
    const spaceResolution = await resolveRunSpaceForThread({
      runId: input.newRunId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    });
    const runSpace = resolvedRunSpace(spaceResolution);
    const agentConfig = await input.registry.getAgentConfig?.(input.agentId);
    const toolsSpace = await toolsSpaceForResume(input, spaceResolution);
    const frontendToolGrant = frontendToolGrantForRun({
      agentId: input.agentId,
      config: agentConfig,
      spaceResolution,
    });
    mergedDefinitions = resolveFrontendToolsForAgent({
      agentId: input.agentId,
      clientTools: input.agentUi?.frontend_tools,
      grant: frontendToolGrant,
    });
    const { instructionExtras, runtimeContextInstructions } =
      await resolveResumeInstructionExtras(
        input,
        spaceResolution,
        frontendToolGrant
      );
    const resumeThread =
      typeof input.store.getThread === "function"
        ? await input.store.getThread({
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
          })
        : null;
    const sharedRoom = sharedMastraRoomFromThread({
      agentId: input.agentId,
      agentScope: agentConfig?.agentScope,
      thread: resumeThread,
    });
    const memoryRuntime = createEngentySessionMemoryRuntime({
      agentId: input.agentId,
      ...(agentConfig?.name ? { agentName: agentConfig.name } : {}),
      observationalModelId: input.modelConfig?.memoryModelId,
      scope: input.scope,
      sharedObservations: agentConfig
        ? resolveSharedObservationsScope(agentConfig)
        : "disabled",
      sharedRoom,
      spaceId: runSpace?.spaceId ?? resumeThread?.space_id,
      store: input.store,
      threadId: input.threadId,
    });
    const converter = new AgUiTurnAccumulator();
    const rootDelegation = input.resolveChildWorkspace
      ? createRootDelegationTools({
          onProgress: (toolCallId, line, origin) => {
            converter.recordSubAgentProgress(toolCallId, line);
            emit({
              name: "engenty.sub_agent.progress",
              type: EventType.CUSTOM,
              value: {
                line,
                messageId: toolCallId,
                toolCallId,
                // Who is working, and under which tool. The bridge holds a
                // server tool's TOOL_CALL_* back until the call returns, so
                // these are all the transcript has to draw a row from while a
                // colleague works.
                ...(origin ?? {}),
              },
            } as AGUIEvent);
          },
          parentRunId: input.newRunId,
          parentThreadId: input.threadId,
          registry: input.registry,
          resolveChildWorkspace: input.resolveChildWorkspace,
          rootAgentId: input.agentId,
          rootConfig: agentConfig,
          ...(input.runStore ? { runStore: input.runStore } : {}),
          scope: input.scope,
          spaceResolution,
          store: input.store,
          ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
        })
      : { extraTools: {}, skipNativeSubAgents: false };
    // An "Allow" on the browser_start card creates the browser first, so the
    // toolset below is the full browser_* set, not the ask-tool again.
    const runBrowser = await resolveRunBrowser({
      scope: input.scope,
      source: spaceResolution,
    });
    await startUserBrowserOnResume(
      { browser: runBrowser, tenantId: input.scope.tenantId },
      input.resumeData
    );
    const browserTools = await createUserBrowserTools({
      browser: runBrowser,
      emit: (name, value) =>
        emit({ name, type: EventType.CUSTOM, value } as AGUIEvent),
      headless: false,
      tenantId: input.scope.tenantId,
      textModelId: input.modelConfig?.gradedModelIds?.low ?? null,
    });
    const extraTools = {
      ...createNativeFrontendTools(mergedDefinitions),
      ...rootDelegation.extraTools,
      ...memoryRuntime.memoryTools,
      ...browserTools,
    };
    const agent = await assembleDynamicAgent(input.registry, input.agentId, {
      space: toolsSpace,
      ...(instructionExtras ? { instructionExtras } : {}),
      ...(runtimeContextInstructions ? { runtimeContextInstructions } : {}),
      memoryProcessors: memoryRuntime.memoryProcessors,
      mastra: input.mastra,
      ...(sharedRoom ? { sharedRoom: true } : {}),
      ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
      // The Memory INSTANCE must sit on the agent. `agent.stream()` takes no
      // memory argument, and an agent without one neither recalls the thread nor
      // PERSISTS what the continuation produces — Mastra logs "No memory is
      // configured but resourceId and threadId were passed in args" and writes
      // zero `ai.mastra_messages` rows, so the answer vanishes on reload.
      memory: memoryRuntime.memory,
      // Frontend tools are declared on the AGENT, not passed as
      // `resumeStream({clientTools})`: `@ag-ui/mastra` forwards no clientTools on
      // its resume branch. Without them the resumed turn answers "that tool isn't
      // available" — the run continues, but the conversation visibly degrades.
      ...(Object.keys(extraTools).length > 0 ? { extraTools } : {}),
      resolveContext: {
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      },
      ...(resolved?.workspace ? { workspace: resolved.workspace } : {}),
      ...(rootDelegation.skipNativeSubAgents ? { skipSubAgents: true } : {}),
    });
    const resourceId = createEngentyMastraResourceId({
      scope: input.scope,
      sharedRoom,
      spaceId: runSpace?.spaceId ?? resumeThread?.space_id,
      threadId: input.threadId,
    });
    await emitTrajectoryHeader({
      agent,
      emit,
      modelId: input.modelId,
      recalledMessages: await recallTrajectoryMessagePointers({
        memory: memoryRuntime.memory,
        resourceId,
        threadId: input.threadId,
      }),
      runtimeInstructions: runtimeContextInstructions ?? "",
      toolNames: await listKnownToolNames(agent, extraTools),
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
    onConverterReady(converter);
    // A SECOND tool suspending inside the continuation is the normal shape here:
    // this lane runs under `approvalPolicy: "suspend"`, so any gated tool the
    // model reaches for parks the run again. Left unhandled the resume looked
    // like a run that finished with nothing to say, and the caller cleared the
    // open interrupt on a run that was in fact waiting for input.
    let suspendedAgain: SuspendedAgain | undefined;
    let streamError: Error | undefined;
    let windowInputTokens: number | null = null;
    await engentyToolsRunAls.run(toolsRunContext, async () => {
      const outcome = await resumeViaMastraAgent({
        accumulator: converter,
        agent,
        agentId: input.agentId ?? "",
        emit,
        // Without this the continuation halts at Mastra's own default
        // (5 steps) — the same mid-chain silent stop the start lane had.
        maxSteps: resolveAgentMaxSteps(agentConfig?.limits?.max_steps),
        newRunId: input.newRunId,
        resourceId,
        resumeData: input.resumeData,
        suspendedRunId: input.suspendedRunId ?? "",
        threadId: input.threadId,
        toolCallId: input.resolvedToolCallId ?? "",
      });
      if (outcome.suspendedAgain) {
        suspendedAgain = outcome.suspendedAgain;
      }
      if (outcome.streamError) {
        streamError = new Error(outcome.streamError);
      }
      windowInputTokens = outcome.windowInputTokens ?? null;
    });
    // An in-band failure must not be reported as a completed run: the caller
    // would write a success into history and CLEAR the open interrupt, deleting
    // the only pointer back to a turn that never produced an answer. The parked
    // lane gets this from the session's `error` event; here it is the error
    // chunk plus the finishReason.
    if (streamError) {
      throw streamError;
    }
    // No `finish()`: the accumulator is a sink, and `@ag-ui/mastra` closes its own
    // text messages — the converter's flush existed because IT opened them.
    //
    // A tool the model invented DURING the continuation dangles: no result
    // chunk ever arrives, so the card spins forever and the persisted part stays
    // at `state:"call"`. A tool that SUSPENDED is not
    // dangling — the converter tracks those separately, because the user is
    // going to answer it.
    for (const event of converter.closeUnresolvedToolCalls()) {
      emit(event);
    }
    return {
      mergedDefinitions,
      resumed: true,
      windowInputTokens,
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
 * Turn a re-suspend into the next AG-UI interrupt.
 *
 * Mastra resumed the run in place, so it kept its id and the next answer
 * re-enters this same lane with `resumeRunId` unchanged.
 *
 * Returns false when the payload names no interrupt we can render; the caller
 * then finishes the run rather than leaving the thread waiting on nothing.
 */
/** The registry when the caller brought one with `getAgentConfig`. */
function registryOf(input: ResumeConversationRunInput) {
  return typeof input.registry?.getAgentConfig === "function"
    ? input.registry
    : null;
}

async function emitSnapshotSuspendInterrupt(args: {
  emit: (event: AGUIEvent) => void;
  input: ResumeConversationRunInput;
  mergedDefinitions: readonly FrontendToolDefinition[];
  suspendedAgain: SuspendedAgain;
}): Promise<boolean> {
  const { emit, input, suspendedAgain } = args;
  const registry = registryOf(input);
  const common = {
    busRunId: input.newRunId,
    ...(input.effort ? { effort: input.effort } : {}),
    emit,
    ...(registry
      ? {
          getAgentConfig: (agentId: string) => registry.getAgentConfig(agentId),
        }
      : {}),
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
  if (isMastraToolApprovalSuspend(suspendedAgain.suspendPayload)) {
    // A second gated workspace call in the same turn: the same card as the
    // first, keyed on this call's own grant.
    await emitToolApprovalInterrupt({
      ...common,
      payload: workspaceApprovalSuspendPayload(
        suspendedAgain.suspendPayload.requireToolApproval
      ),
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
  const registry = input.registry;
  await requireStoredThreadAccess({
    action: "write",
    agentId: input.agentId ?? "unknown",
    ...(typeof registry?.getAgentConfig === "function"
      ? {
          getAgentConfig: (agentId: string) => registry.getAgentConfig(agentId),
        }
      : {}),
    scope: input.scope,
    store: input.store,
    threadId: input.threadId,
  });
  markRunLive(input.newRunId);
  // Durable tracking for the continuation (see startConversationRun): the
  // tracker publishes to the bus AND persists ai.agent_run(_event) so a reload
  // or second window can discover and replay this resume run.
  const tracker = input.runStore
    ? createSessionRunTracker({
        agentId: input.agentId ?? "unknown",
        createdByUserId: input.scope.userId,
        // Without this every resume row lands with a NULL model_id, which is
        // what hid a resume answering on a different model than the run that
        // asked. The value is already resolved — it reaches billing below.
        modelId: input.modelId ?? null,
        runId: input.newRunId,
        runStore: input.runStore,
        threadId: input.threadId,
        tenantId: input.scope.tenantId,
        // A resume continues the conversation that was interrupted — the same
        // person, the same turn, picked up after their decision.
        trigger: "message",
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

  // The continuation ended on a SECOND native suspend. Mastra flushes the
  // assistant turn when a run parks, so the post-run pass must not write it a
  // second time — see the `finally` below.
  let parkedAgain = false;
  // Set when THIS call claimed the in-flight marker, so the `finally` releases
  // only its own claim.
  let claimedResume = false;
  // Whichever lane ran; the post-run pass in `finally` reads it.
  let converterRef: ResumeConverter | undefined;
  let windowInputTokens: number | null = null;
  // Stamped onto the durable run row. Without it a failed resume stored
  // `error_message = NULL` — the one place you look after the fact was blank.
  let failureMessage: string | null = null;
  let threadStatus: AgentSessionStatus = "completed";
  await patchThreadStatus({ ...input, status: "running" });
  try {
    // Two answers for one approval must not run at once: they would both
    // resolve the same suspension AND both tear down the one session-scoped
    // sandbox, and both are invisible to the thread-load reconciler, which
    // reads this marker as proof an interrupt is still live.
    if (input.suspendedRunId) {
      if (!claimResumeInFlight(input.suspendedRunId)) {
        throw new Error(
          `A resume for run ${input.suspendedRunId} is already in progress; this duplicate answer was ignored.`
        );
      }
      claimedResume = true;
    }
    // Snapshot storage survives a restart, a TTL and a second process, so this
    // is the only path a resume needs.
    const snapshot = await resumeFromSnapshot(input, emit, (converter) => {
      converterRef = converter;
    });
    windowInputTokens = snapshot.windowInputTokens ?? null;
    if (snapshot.resumed) {
      // Close the suspended tool step in PERSISTED history. Resuming leaves the
      // original row at `state:"call"`, so without this the tool renders as
      // still spinning on the next thread load even though the run completed.
      await resolveToolCallResultInHistory({
        result: input.resumeData,
        scope: input.scope,
        store: input.store,
        threadId: input.threadId,
        toolCallId: input.resolvedToolCallId,
      });
      // A SECOND tool suspended in the continuation — surface it as the next
      // interrupt instead of finishing. Mastra resumed under the SAME run id and
      // wrote the new suspension back to snapshot storage, so the next answer
      // comes straight back down this lane with `resumeRunId` unchanged.
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
        // Fail loudly instead and leave the interrupt alone: the snapshot is
        // still there, so a later resume — with the right tool declared — can
        // still continue it.
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
      `Run ${input.suspendedRunId || "(missing)"} has no resumable snapshot; the suspended tool cannot be continued.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    threadStatus = parkedAgain ? "waiting" : "failed";
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
        // Bill the whole resume, not its last step.
        usage: converterRef.runUsage,
        usageStore: input.usageStore,
      });
    }
    // Only the resume that CLAIMED the marker may release it — a duplicate that
    // was turned away must not clear it out from under the live resume.
    //
    // Nothing else to release: the snapshot outlives this process, so a failed
    // resume leaves the suspension exactly where it was and the user can retry.
    if (claimedResume && input.suspendedRunId) {
      releaseResumeInFlight(input.suspendedRunId);
    }
    await patchThreadStatus({ ...input, status: threadStatus });
    if (tracker) {
      const usage = converterRef?.runUsage ?? null;
      const lastStep = converterRef?.windowUsage ?? null;
      await tracker
        .complete({
          completionTokens: usage?.output ?? null,
          contextPromptTokens: windowInputTokens ?? lastStep?.input ?? null,
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
