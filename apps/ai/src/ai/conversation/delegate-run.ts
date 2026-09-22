// Child-run delegation engine. Runs a delegated agent (e.g. the CLI
// specialist) as its OWN run, bound to the child's own thread + workspace + sandbox,
// driven to completion, with its final text returned to the caller (the `delegate`
// tool) and tool/step activity streamed out via `onProgress`.
//
// This is the single delegation mechanism (Decision ②): a delegation is a child RUN,
// not Mastra's in-process subagent tool. The child runs as a LEAF — no nested
// frontend tools, no further sub-agents, no HITL suspend — it executes its brief and
// returns. Its own thread is the per-delegation drill-in target and its own sandbox
// makes parallel delegations safe.
//
// The run is driven by `@ag-ui/mastra` (delegate-run-agui-driver), which emits
// AG-UI events directly, so no converter sits in this path.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import type { FieldSuggestion } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import {
  MASTRA_AUTH_TOKEN_KEY,
  RequestContext,
} from "@mastra/core/request-context";
import type { Workspace } from "@mastra/core/workspace";
import {
  type EngentyToolsRunContext,
  engentyToolsRunAls,
  getEngentyToolsRunContext,
  withEnvCoreBaseUrl,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  isGlobalConnectorGate,
  isUnresolvedSpaceGate,
} from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { MESSAGE_AGENT_TOOL_ID } from "../../../ai/tools/message-agent-tool.js";
import type { AgentRunStore } from "../../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import { isRoomThread } from "../../dal/threads/types.js";
import { notifyRunSuspended } from "../../notifications/run-notifications.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import {
  type RunBrowserSource,
  resolveRunBrowser,
} from "../browser/run-browser.js";
import { createUserBrowserTools } from "../browser/user-browser-tools.js";
import { resolveHeartbeatInstructions } from "../instructions/heartbeat-layer.js";
import { buildHeadlessWorkspace } from "../jobs/headless-workspace.js";
import type { ApprovedResumeCall } from "../jobs/task-job-schema.js";
import {
  createEngentyMastraResourceId,
  createEngentySessionMemoryRuntime,
} from "../memory/invocation-options.js";
import { resolveSharedObservationsScope } from "../memory/shared-observational-memory.js";
import {
  type AiRegistry,
  assembleDynamicAgent,
  type MastraToolDefinition,
  type RuntimeModelConfig,
  resolveAgentModelId,
} from "../registry/index.js";
import { resolveAlterEgo } from "../rooms/alter-ego.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { getServiceAccessToken } from "../service-credential.js";
import { registerActiveThreadRun } from "../sessions/active-thread-runs.js";
import {
  emitExecutionLaneRunStarted,
  executionSpaceId,
} from "../sessions/execution-lane.js";
import { resolveAgentMaxSteps } from "../sessions/max-steps.js";
import { markRunDone, markRunLive } from "../sessions/run-event-bus.js";
import { createSessionRunTracker } from "../sessions/run-tracking.js";
import { sharedMastraRoomFromThread } from "../sessions/thread-access.js";
import {
  type AiSessionScope,
  scopeAccessToken,
  scopeAttributionUserId,
} from "../sessions/types.js";
import { setTraceContext } from "../trace-context.js";
import {
  describeWorkspaceToolCall,
  workspaceToolGrantId,
} from "../workspace/workspace-tool-guards.js";
import { inheritChildSpace } from "./child-space.js";
import { runHeadlessViaMastraAgent } from "./delegate-run-agui-driver.js";
import {
  emitTrajectoryHeader,
  listKnownToolNames,
  recallTrajectoryMessagePointers,
} from "./emit-trajectory-header.js";
import { getHeadlessSnapshotMastra } from "./headless-snapshot-mastra.js";
import { replayApprovedCalls } from "./replay-approved-calls.js";
import { usageFromAgUiTokens } from "./run-usage.js";

export interface RunDelegatedConversationInput {
  abortSignal?: AbortSignal;
  // Restrict the delegated agent to this tool allow list (Action guardrail).
  allowedToolIds?: string[];
  // Pre-approved operation ids for this run (task ∪ once ∪ routine grants).
  // Consulted by the "request" pre-gate so a pre-approved op runs without
  // asking again.
  approvalGrants?: readonly string[];
  // Gated-operation behavior for this leaf run. Default "deny" (in-chat
  // delegation: suspending would deadlock the waiting parent). Task jobs pass
  // "defer" (core decides) or "request" (pre-gate against durable grants, then
  // report a needs-input request the workflow surfaces + re-dispatches).
  approvalPolicy?: "deny" | "defer" | "request";
  /**
   * Calls approved while a previous run of this task was parked, to be
   * executed EXACTLY ONCE before the model turn (inside this run's ALS, so
   * attribution/space/pre-gate apply normally). Their results are appended to
   * the brief so the resumed model continues from them instead of re-issuing
   * the calls. Single-use is upstream: these ride the background task's
   * suspend payload, which Mastra clears when a resume claims the task.
   */
  approvedResumeCalls?: readonly ApprovedResumeCall[];
  brief: string;
  childAgentId: string;
  // Identity for the child run — the caller generates these so it can correlate the
  // child thread (drill-in) and tag progress events to the parent's sub-agent card.
  childRunId: string;
  childThreadId: string;
  /**
   * How many delegation hops deep THIS run is. 0 = the run's own specialist
   * (a routine or task run's agent node); a chat root's children arrive as 1.
   * Below the budget the run gets a real `message_agent`; at it, the stub —
   * so a consulted colleague can answer but not recurse.
   */
  delegationDepth?: number;
  /**
   * Prompt sections appended after the agent's own instructions — the run's
   * compute description, and anything else only this run knows about itself.
   */
  extraInstructionBodies?: readonly string[];
  // Per-run tools merged into the leaf agent (task-job workspace file tools).
  extraTools?: Record<string, MastraToolDefinition>;
  /** Singleton Mastra — same wiring as the root conversation executor. */
  mastra?: Mastra;
  modelConfig?: RuntimeModelConfig | null;
  // When set, publish + persist this run's AG-UI events keyed by `childRunId` so
  // the run streams live AND replays on reattach (GET /v1/runs/:id/stream). Used
  // by workflows so the WorkflowButton shows live progress. Absent for in-chat
  // delegation (which streams onto the parent run's sub-agent card instead).
  observe?: {
    runStore: AgentRunStore | null;
    tenantId: string;
    // Action HITL: when the delegated agent proposes field updates (a
    // proposeUpdates artifact), suspend the run — mark it `requires_action` and
    // close the live stream with a `run_suspended` sentinel — instead of
    // completing. The action-job approval gate resumes + finalizes it. When the
    // agent proposes nothing, the run completes normally.
    suspendForApproval?: boolean;
  };
  // "request" policy: called when a gated operation is missing from
  // `approvalGrants`. The task job collects these to record needs-input.
  onApprovalRequired?: EngentyToolsRunContext["onApprovalRequired"];
  /**
   * Called once the child's session exists and is about to be driven, with a
   * way to push more input INTO the running loop. Return a cleanup; it runs
   * when the turn ends, whether it finished, failed or was aborted.
   *
   * Exists so a headless task run can accept a comment mid-flight instead of
   * making the person wait for it to finish and dispatching again. The
   * conversation layer owns the mechanism (a second `sendMessage`, which the
   * agentic loop drains as a signal); the caller only decides who may reach it.
   */
  onLiveSession?: (input: {
    deliver: (content: string) => Promise<void>;
  }) => (() => void) | undefined;
  // Called with human-readable lines as the child works (tool starts, etc.). The
  // `delegate` tool forwards these to the parent run's sub-agent progress card.
  onProgress?: (line: string) => void;
  /**
   * The parent conversation that spawned this child, when known. Written onto
   * `ai.agent_run.metadata` so the platform observer can indent the child
   * under that turn. Optional: task/graph roots have no parent.
   */
  parentRunId?: string | null;
  parentThreadId?: string | null;
  parentToolCallId?: string | null;
  /**
   * False when the brief is a wake line and not a message: a room turn's
   * prompt says "X posted; answer" while the post itself is already the last
   * row of the room. Persisting the prompt too would put a second, synthetic
   * user turn into every member's history. Default true.
   */
  persistCurrentUserTurn?: boolean;
  registry: AiRegistry;
  /**
   * The routine whose fire started this run. Forwarded so routine-scoped
   * grants open core's gate for it, and it is what marks the run as one
   * nobody asked for (HEARTBEAT.md is composed only then).
   */
  routineId?: string | null;
  // The child's sandbox provider — torn down (syncOut) before we return so the
  // child's writes reach durable storage before the parent continues.
  sandboxProvider?: EngentySandboxProvider;
  scope: AiSessionScope;
  /**
   * The space this run happens in, already resolved (PLAN-spaces.md C3a/C3b).
   *
   * Passed IN rather than resolved here because the two callers know it two
   * different ways: an in-chat delegation inherits the parent's (via the ALS
   * spread below), while a headless task job derives it from the TASK — which
   * is a server-side lookup, not a claim, so there is nothing for this layer to
   * validate and it must not invent a second answer.
   */
  space?: EngentyToolsRunContext["space"];
  store: ThreadStore;
  /**
   * Task this delegated run executes (headless task jobs). Threaded into the
   * tools context and forwarded to core as x-engenty-task-id so the approval
   * gate can spend task-scoped grants and stamp the task on requests it files.
   */
  taskId?: string | null;
  workspace?: Workspace;
}

export interface DelegatedConversationResult {
  /**
   * Artifact id of an App the child built (app_build), when it published one.
   * Distinct from `artifactId` (the proposeUpdates proposal) so neither flow
   * can shadow the other. The delegate tool surfaces it so the parent
   * transcript renders the built App inline instead of burying it behind the
   * child-thread drill-in.
   */
  appArtifactId?: string;
  /** Artifact id of the proposeUpdates proposal, when the agent proposed one. */
  artifactId?: string;
  childRunId: string;
  childThreadId: string;
  error?: string;
  finalText: string;
  /**
   * Artifacts the child wrote or presented (artifact_write / show_artifact),
   * in order. The delegate tool hands them to the parent transcript so the
   * person finds the deliverable where they read, not only in the child's
   * own thread.
   */
  producedArtifactIds?: string[];
  /** Field updates the agent proposed for approval (proposeUpdates artifact). */
  suggestions?: FieldSuggestion[];
  /** True when the run was suspended for approval (observe.suspendForApproval). */
  suspendedForApproval?: boolean;
}

/**
 * Run a delegated agent to completion as its own child Conversation run. Returns the
 * child's final assistant text. Never throws — failures are returned as `error` so
 * the calling tool can surface them to the parent model.
 */
function parentRunMetadata(input: {
  childRunId: string;
  childThreadId: string;
  parentRunId?: string | null;
  parentThreadId?: string | null;
  parentToolCallId?: string | null;
}): Record<string, unknown> | undefined {
  const als = getEngentyToolsRunContext();
  const alsRunId = als.runId ?? null;
  const parentRunId =
    input.parentRunId ??
    (alsRunId && alsRunId !== input.childRunId ? alsRunId : null);
  const alsThread = als.userFacingThreadId ?? als.orchestratorThreadId ?? null;
  const parentThreadId =
    input.parentThreadId ??
    (alsThread && alsThread !== input.childThreadId ? alsThread : null);
  const parentToolCallId = input.parentToolCallId ?? null;
  if (!(parentRunId || parentThreadId || parentToolCallId)) {
    return;
  }
  return {
    ...(parentRunId ? { parent_run_id: parentRunId } : {}),
    ...(parentThreadId ? { parent_thread_id: parentThreadId } : {}),
    ...(parentToolCallId ? { parent_tool_call_id: parentToolCallId } : {}),
  };
}

export async function runDelegatedConversation(
  input: RunDelegatedConversationInput
): Promise<DelegatedConversationResult> {
  const result: DelegatedConversationResult = {
    childRunId: input.childRunId,
    childThreadId: input.childThreadId,
    finalText: "",
  };
  // A model/gateway error (e.g. a 402 "quota exceeded") does NOT throw — the stream
  // just ends, carrying RUN_ERROR. Capture it so the run is reported as FAILED
  // instead of silently "completed with no output".
  let streamError: string | null = null;
  /**
   * Workspace tools that suspended waiting for a human (P1.6b).
   *
   * Kept because a suspension is NOT a failure and must not be reported as one:
   * a run that stopped because it asked permission has to park exactly like a
   * gated module operation, or the task would be marked failed and the human's
   * approval would have nothing left to resume.
   */
  const workspaceSuspensions = new Set<string>();
  // Observe mode (Actions): stream + persist AG-UI events keyed by childRunId.
  const observe = input.observe;
  /** `RUN_FINISHED.usage` — one TokenUsage entry per model call in this run. */
  let agUiUsage: unknown = null;
  let windowInputTokens: number | null = null;
  const childConfig = await input.registry.getAgentConfig?.(input.childAgentId);
  // The caller's config carries the tier chosen for the CALLER's run. The
  // colleague was not part of that choice: its own default tier applies, and
  // only where it has none does it inherit the caller's model.
  const childModelConfig = input.modelConfig
    ? { ...input.modelConfig, effortPinned: false }
    : undefined;
  const modelId = childConfig
    ? resolveAgentModelId(childConfig, childModelConfig)
    : (childModelConfig?.chatModelId ?? null);
  const parentMetadata = parentRunMetadata(input);
  const tracker = observe
    ? createSessionRunTracker({
        agentId: input.childAgentId,
        // `created_by_user_id` is a core.users FK, and a headless lane runs as
        // the AI SERVICE principal — whose id is a service_credential id, not a
        // user's. Writing it raw made the child run's insert fail the FK, which
        // failed the whole graph: a flow with an agent node could not run from
        // a task at all. Unattended runs simply have no human creator.
        createdByUserId: scopeAttributionUserId(input.scope),
        ...(parentMetadata ? { metadata: parentMetadata } : {}),
        modelId,
        runId: input.childRunId,
        runStore: observe.runStore,
        threadId: input.childThreadId,
        tenantId: observe.tenantId,
        // Started by another agent (a graph node or message_agent), never by a
        // person typing into this thread.
        trigger: "direct",
      })
    : null;
  if (observe && tracker) {
    markRunLive(input.childRunId);
  }
  emitExecutionLaneRunStarted(
    {
      agentId: input.childAgentId,
      runId: input.childRunId,
      source: {
        agentId: input.childAgentId,
        kind: "delegated",
        taskId: input.taskId,
      },
      spaceId: executionSpaceId(input.space),
      taskId: input.taskId,
      threadId: input.childThreadId,
    },
    // No `emit`: `MastraAgent` frames the run itself. Letting the caller frame it
    // too wrote RUN_STARTED/RUN_FINISHED TWICE into ai.agent_run_event — which a
    // spec-compliant AG-UI client rejects outright and which replays as a run that
    // starts twice. The lane log above still runs.
    {}
  );
  try {
    // The child run's engenty-tools context — carries the end-user bearer token,
    // tenant/user identity, and a distinct run id. Core-backed tools (incl. module
    // agent tools, which resolve their bearer ONLY from this ALS — they do not
    // forward the Mastra execution context) read it via `getEngentyToolsRunContext`.
    // The child acts under ITS OWN agent identity; the goal (conversation the
    // human approves in) is inherited from the parent's context via the spread
    // below, so goal-scoped grants cover delegated sub-agents too.
    const childCoreAgentId = await resolveCoreAgentId(
      input.scope.tenantId,
      input.childAgentId
    );
    const childToolsContext = withEnvCoreBaseUrl({
      ...getEngentyToolsRunContext(),
      ...(childCoreAgentId ? { agentId: childCoreAgentId } : {}),
      agentTypeKey: input.childAgentId,
      // Durable task/routine grants for the "request" pre-gate (headless task
      // jobs pass them explicitly). In-chat delegation inherits the PARENT
      // run's grants instead: an operation the user already approved for this
      // conversation ("Approve always" / bulk pre-approval) must not re-gate
      // just because a sub-agent executes it — the child still has no way to
      // ASK (policy "deny"), so without the pass-down every granted write dies
      // in the leaf.
      approvalGrants:
        input.approvalGrants ??
        getEngentyToolsRunContext().approvalGrants ??
        [],
      // Leaf run — no interactive channel: a gated operation is denied with a
      // clear result instead of suspending (which would deadlock the parent).
      // Task jobs override to "defer" (core decides) or "request" (report a
      // needs-input request the workflow surfaces + re-dispatches).
      approvalPolicy: input.approvalPolicy ?? ("deny" as const),
      // Exactly-once for identical writes across this whole delegated run.
      // Fresh per run, and shared by the approved-call replay below and the
      // model turn (both execute inside this ALS): a replayed call registers
      // its invocation key, so a model that re-issues it anyway — the second
      // half of the 2026-08-22 kb_source_create duplicate — gets the first
      // result back instead of a second record.
      executedWriteCalls: new Map<string, unknown>(),
      // A child cannot broaden the validated parent/task Space. Explicit
      // `input.space` is intersected with the parent ALS; a headless job has
      // no parent and hands its own down.
      space: inheritChildSpace({
        parent: getEngentyToolsRunContext().space,
        requested: input.space,
      }),
      ...(input.onApprovalRequired
        ? { onApprovalRequired: input.onApprovalRequired }
        : {}),
      // The child's own thread for thread-scoped tools; `userFacingThreadId`
      // (the thread the human watches) rides through the spread above, so
      // anything the user must see — e.g. app_build's preview artifact —
      // publishes to the parent conversation, not this drill-in thread.
      orchestratorThreadId: input.childThreadId,
      runId: input.childRunId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.routineId ? { routineId: input.routineId } : {}),
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      ...(scopeAccessToken(input.scope)
        ? { accessToken: scopeAccessToken(input.scope) }
        : {}),
    });
    // Belt-and-suspenders: also carry the token on the Mastra requestContext (the
    // `mastra__authToken` key the server sets from the HTTP Authorization header),
    // for tools that DO forward the execution context.
    const requestContext = new RequestContext();
    if (scopeAccessToken(input.scope)) {
      requestContext.set(MASTRA_AUTH_TOKEN_KEY, scopeAccessToken(input.scope));
    }
    // Identity for the run's trace — see trace-context.ts.
    setTraceContext(requestContext, {
      agentId: input.childAgentId,
      lane: "delegate",
      runId: input.childRunId,
      spaceId: executionSpaceId(childToolsContext.space),
      tenantId: input.scope.tenantId,
      threadId: input.childThreadId,
      userId: input.scope.userId,
    });
    // Service tokens live 15 minutes and a long run outlives them: the ENG-34
    // KB run (28 min) hit 401 on every module tool once its dispatch-time
    // token expired, while a fresh probe run worked instantly. A service
    // credential CAN re-mint (getServiceAccessToken re-exchanges the durable
    // secret per tenant), so give the run's core clients the retry-once seam
    // and write the fresh token back so later tool calls start on it.
    // Interactive user tokens have no mint path — for them this stays absent
    // and a 401 surfaces unchanged.
    if (input.scope.credential?.kind === "service") {
      childToolsContext.refreshAccessToken = async () => {
        const fresh = await getServiceAccessToken({
          tenantId: input.scope.tenantId,
        });
        if (fresh) {
          childToolsContext.accessToken = fresh;
          requestContext.set(MASTRA_AUTH_TOKEN_KEY, fresh);
        }
        return fresh;
      };
    }

    // Assemble AND drive the agent inside the engenty-tools ALS scope. A HEADLESS
    // run (dispatched Task Job — no incoming HTTP request, no ambient context) has no
    // other source of the bearer; the run captures the async context as it sets up
    // its tool pipeline, so the whole lifecycle must run within `.run()` for the
    // child's tools to see the token. (The interactive path runs inside the server's
    // ambient request context, which masked this.)
    result.finalText = await engentyToolsRunAls.run(
      childToolsContext,
      async () => {
        // Replay-once of calls approved while this task was parked — BEFORE
        // the model turn, so the resumed model sees the results in its brief
        // instead of re-issuing the calls. Runs inside the ALS on purpose:
        // the execute tool reads bearer/agent/space/grants from there, so the
        // replay is gated and attributed exactly like a model-made call.
        const approvedReplay = await replayApprovedCalls(
          input.approvedResumeCalls
        );
        for (const done of approvedReplay.replayed) {
          input.onProgress?.(`Ran approved ${done.operationId}`);
        }
        const briefContent = approvedReplay.briefSection
          ? `${input.brief}\n\n${approvedReplay.briefSection}`
          : input.brief;
        const childThread = await input.store.getThread({
          tenantId: input.scope.tenantId,
          threadId: input.childThreadId,
        });
        const childSharedRoom = sharedMastraRoomFromThread({
          agentId: input.childAgentId,
          agentScope: childConfig?.agentScope,
          thread: childThread,
        });
        const childAlterEgo =
          childConfig?.agentScope === "personal" &&
          childThread &&
          isRoomThread(childThread.route_context)
            ? await resolveAlterEgo({
                agentId: input.childAgentId,
                store: input.store,
                tenantId: input.scope.tenantId,
                threadId: input.childThreadId,
              })
            : null;
        const { memory, memoryProcessors, memoryTools } =
          createEngentySessionMemoryRuntime({
            agentId: input.childAgentId,
            alterEgo: childAlterEgo,
            ...(childConfig?.name ? { agentName: childConfig.name } : {}),
            observationalModelId: input.modelConfig?.memoryModelId,
            scope: input.scope,
            sharedObservations: childConfig
              ? resolveSharedObservationsScope(childConfig)
              : "disabled",
            sharedRoom: childSharedRoom,
            spaceId: childThread?.space_id,
            store: input.store,
            threadId: input.childThreadId,
            ...(input.persistCurrentUserTurn === false
              ? { persistCurrentUserTurn: false }
              : {}),
          });
        // A run a routine started is one nobody asked for, which is the single
        // situation HEARTBEAT.md describes — so it is composed here and
        // nowhere else.
        const heartbeatBody = input.routineId
          ? await resolveHeartbeatInstructions({
              agentId: input.childAgentId,
              tenantId: input.scope.tenantId,
              userId: input.scope.userId,
            })
          : null;
        // One consultation hop, budgeted — not a flat leaf rule. Below the
        // depth budget the run gets a REAL message_agent (a routine run may
        // ask a colleague); at the budget it keeps the registry stub, whose
        // answer says to return the result instead. The colleague runs
        // headless: its workspace comes from its own declaration, and its
        // sandbox lease counts against the same space quota as this run's.
        const depth = input.delegationDepth ?? 0;
        // Imported lazily, NOT at module top: message-agent-tool imports
        // delegate-tool, which imports this module — a static import here
        // closes that cycle, and a cyclic graph is exactly what makes a test's
        // vi.mock of delegate-tool load the real thing through importOriginal.
        // By the time a run executes, every module is initialized and the
        // cycle is harmless.
        const { createMessageAgentTool, resolveMessageAgentDepthLimit } =
          await import("./message-agent-tool.js");
        const canMessage = depth < resolveMessageAgentDepthLimit();
        const spaceSurface =
          input.space && !isUnresolvedSpaceGate(input.space)
            ? input.space
            : null;
        const messageTools: Record<string, MastraToolDefinition> = canMessage
          ? {
              [MESSAGE_AGENT_TOOL_ID]: createMessageAgentTool({
                delegationDepth: depth + 1,
                modelConfig: input.modelConfig ?? null,
                mountedAgentIds: spaceSurface?.agentIds ?? new Set<string>(),
                onProgress: (_toolCallId, line) => input.onProgress?.(line),
                parentAgentId: input.childAgentId,
                parentRunId: input.childRunId,
                parentThreadId: input.childThreadId,
                registry: input.registry,
                resolveChildWorkspace: (child) =>
                  buildHeadlessWorkspace({
                    agentId: child.agentId,
                    registry: input.registry,
                    runId: child.runId,
                    scope: input.scope,
                    threadId: child.threadId,
                    ...(spaceSurface?.spaceId
                      ? { spaceId: spaceSurface.spaceId }
                      : {}),
                  }).then((ws) => ws ?? undefined),
                runStore: input.observe?.runStore ?? null,
                scope: input.scope,
                store: input.store,
              }),
            }
          : {};
        // Callers that own a Mastra pass it; the rest get the snapshot store,
        // without which a tool call that pauses can never be answered — the
        // resume reports "could not find a suspended run for runId".
        const runMastra = input.mastra ?? getHeadlessSnapshotMastra();
        // The acting user's browser (D11): the run's space names whom the run
        // acts for; outside any space the scope's own person does; a service
        // principal is "headless" for the unattended gate.
        const browserSpace = childToolsContext.space;
        const browserSource: RunBrowserSource = isUnresolvedSpaceGate(
          browserSpace
        )
          ? { kind: "unresolved" }
          : browserSpace && !isGlobalConnectorGate(browserSpace)
            ? { kind: "resolved", space: browserSpace }
            : { kind: "global" };
        const browserTools = await createUserBrowserTools({
          browser: await resolveRunBrowser({
            scope: input.scope,
            source: browserSource,
          }),
          ...(tracker
            ? {
                emit: (name: string, value: Record<string, unknown>) => {
                  void tracker.append({
                    name,
                    type: EventType.CUSTOM,
                    value,
                  } as never);
                },
              }
            : {}),
          headless: scopeAttributionUserId(input.scope) === null,
          tenantId: input.scope.tenantId,
          textModelId: childModelConfig?.gradedModelIds?.low ?? null,
        });
        const agent = await assembleDynamicAgent(
          input.registry,
          input.childAgentId,
          {
            ...(input.allowedToolIds
              ? { allowedToolIds: input.allowedToolIds }
              : {}),
            blockedToolIds: canMessage ? [] : [MESSAGE_AGENT_TOOL_ID],
            ...(heartbeatBody || input.extraInstructionBodies?.length
              ? {
                  instructionExtras: {
                    ...(heartbeatBody ? { heartbeatBody } : {}),
                    ...(input.extraInstructionBodies?.length
                      ? { appendBodies: [...input.extraInstructionBodies] }
                      : {}),
                  },
                }
              : {}),
            ...(Object.keys(messageTools).length > 0 ||
            Object.keys(memoryTools).length > 0 ||
            Object.keys(browserTools).length > 0 ||
            input.extraTools
              ? {
                  extraTools: {
                    ...(input.extraTools ?? {}),
                    ...memoryTools,
                    ...messageTools,
                    ...browserTools,
                  } as Record<string, MastraToolDefinition>,
                }
              : {}),
            ...(runMastra ? { mastra: runMastra } : {}),
            memoryProcessors,
            // `agent.stream()` has no controller to supply memory, so the Memory
            // INSTANCE has to live on the agent. Without it the memory processors
            // (observational memory) throw "computeStateSignal requires Mastra
            // memory with an active resourceId and threadId" — the instance is
            // missing, not the ids.
            memory,
            ...(childSharedRoom ? { sharedRoom: true } : {}),
            ...(childModelConfig ? { modelConfig: childModelConfig } : {}),
            ...(input.workspace ? { workspace: input.workspace } : {}),
            skipSubAgents: true,
          }
        );

        const resourceId = createEngentyMastraResourceId({
          scope: input.scope,
          sharedRoom: childSharedRoom,
          spaceId: childThread?.space_id,
          threadId: input.childThreadId,
        });
        if (tracker) {
          await emitTrajectoryHeader({
            agent,
            emit: (event) => {
              void tracker.append(event);
            },
            modelId,
            recalledMessages: await recallTrajectoryMessagePointers({
              memory,
              resourceId,
              threadId: input.childThreadId,
            }),
            runtimeInstructions: heartbeatBody
              ? "Headless heartbeat / delegated child run."
              : "",
            toolNames: await listKnownToolNames(agent, input.extraTools ?? {}),
          });
        }

        // Runs INSIDE the engentyToolsRunAls scope opened above — that is what
        // `requireApproval` reads to decide a workspace gate, so stepping outside
        // it would silently un-gate destructive calls.
        const releaseActiveRun = registerActiveThreadRun(input.childThreadId, {
          agent,
          resourceId,
          runId: input.childRunId,
        });
        let outcome: Awaited<ReturnType<typeof runHeadlessViaMastraAgent>>;
        try {
          outcome = await runHeadlessViaMastraAgent({
            agent,
            agentId: input.childAgentId,
            content: briefContent,
            // Only `request` has somewhere to put the question: it records the
            // ask, ends gracefully, and the run is re-dispatched once a human
            // approves. Under `deny`/`defer` the workspace gate's pause would
            // wait for an answer that can never arrive, so the run declines it
            // itself and keeps going.
            declineApprovals: (input.approvalPolicy ?? "deny") !== "request",
            describeCall: describeWorkspaceToolCall,
            grantIdOf: workspaceToolGrantId,
            maxSteps: resolveAgentMaxSteps(childConfig?.limits?.max_steps),
            requestContext,
            resourceId,
            runId: input.childRunId,
            sinks: {
              ...(input.onApprovalRequired
                ? { onApprovalRequired: input.onApprovalRequired }
                : {}),
              ...(input.onProgress ? { onProgress: input.onProgress } : {}),
            },
            threadId: input.childThreadId,
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            ...(input.onLiveSession
              ? { onLiveSession: input.onLiveSession }
              : {}),
            ...(tracker
              ? {
                  onAgUiEvent: (event: Record<string, unknown>) => {
                    void tracker.append(event as never);
                  },
                }
              : {}),
          });
        } finally {
          releaseActiveRun();
        }
        // Fold into the locals everything after this block — error handling, HITL
        // suspension, tracker completion — reads.
        if (outcome.streamError) {
          streamError ??= outcome.streamError;
        }
        for (const grantId of outcome.workspaceSuspensions) {
          workspaceSuspensions.add(grantId);
        }
        if (outcome.suggestions) {
          result.suggestions = outcome.suggestions;
        }
        if (outcome.artifactId) {
          result.artifactId = outcome.artifactId;
        }
        if (outcome.appArtifactId) {
          result.appArtifactId = outcome.appArtifactId;
        }
        if (outcome.producedArtifactIds.length > 0) {
          result.producedArtifactIds = [...outcome.producedArtifactIds];
        }
        agUiUsage = outcome.usage;
        windowInputTokens = outcome.windowInputTokens;
        return outcome.finalText;
      }
    );
    // A captured stream error (no throw) is still a failure — surface it.
    if (streamError && !result.error) {
      result.error = streamError;
    }
    // Two numbers, same accounting as the interactive lane: billed totals from
    // `RUN_FINISHED.usage`, plus the LAST model call's input as window
    // occupancy read off the Mastra stream's own steps. The bridge attaches
    // usage as ONE aggregated entry, so its "last entry" is the run total —
    // every `direct` run row used to carry the sum as its window. The entry
    // fallback stays for a stream that exposed no steps.
    const runUsage = usageFromAgUiTokens(agUiUsage);
    const lastStepUsage = usageFromAgUiTokens(agUiUsage, { lastOnly: true });
    const usageFields = {
      completionTokens: runUsage?.output ?? null,
      contextPromptTokens: windowInputTokens ?? lastStepUsage?.input ?? null,
      promptTokens: runUsage?.input ?? null,
    };
    if (tracker) {
      if (result.error) {
        await tracker.append({
          message: result.error,
          type: EventType.RUN_ERROR,
        } as AGUIEvent);
        await tracker.complete({
          ...usageFields,
          errorMessage: result.error,
          status: "failed",
        });
      } else if (
        observe?.suspendForApproval &&
        ((result.suggestions && result.suggestions.length > 0) ||
          workspaceSuspensions.size > 0)
      ) {
        // HITL: the agent proposed updates — suspend instead of complete. Mark
        // the run `requires_action` (non-terminal, no finished_at) and close the
        // live stream with a `run_suspended` sentinel so attached clients settle
        // to the approval UI. The action-job gate resumes + finalizes the run;
        // we deliberately do NOT tracker.complete() (no finishRun, no
        // RUN_FINISHED). `markRunDone` runs in the finally below.
        result.suspendedForApproval = true;
        if (observe.runStore) {
          await observe.runStore
            .setRunStatus({
              runId: input.childRunId,
              status: "requires_action",
              tenantId: observe.tenantId,
            })
            .catch(() => {
              // best-effort — the gate step also sets the workflow_run state
            });
        }
        await tracker.append({
          message: "run_suspended",
          type: EventType.RUN_ERROR,
        } as AGUIEvent);
        await notifyRunSuspended({
          actorAgentId: input.childAgentId,
          actorLabel: childConfig?.name ?? null,
          ask: {
            kind: "agent_run_suspended",
            title: `${childConfig?.name ?? input.childAgentId} proposed changes that need a review`,
          },
          // The person behind the parent run gets the push; the space gets the row.
          initiatorUserId: input.scope.userId ?? null,
          metadata: {
            agent_id: input.childAgentId,
            thread_id: input.childThreadId,
          },
          runId: input.childRunId,
          source: "agents",
          spaceId: executionSpaceId(input.space),
          subject: { id: input.childRunId, type: "run" },
          tenantId: observe.tenantId,
        });
      } else {
        // No RUN_FINISHED here — the driver already emitted it. `complete()`
        // still runs: it writes the run ROW, which the driver does not.
        await tracker.complete({ ...usageFields, status: "completed" });
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(
      `[delegate ${input.childRunId}] delegated run failed:`,
      error
    );
    if (tracker) {
      await tracker.append({
        message: result.error,
        type: EventType.RUN_ERROR,
      } as AGUIEvent);
      await tracker.complete({
        errorMessage: result.error,
        status: "failed",
      });
    }
  } finally {
    await destroyRunSandboxes({
      keepParentSandboxAlive: false,
      subAgentSandboxProviders: [],
      ...(input.sandboxProvider
        ? { sandboxProvider: input.sandboxProvider }
        : {}),
    }).catch(() => {
      // best-effort — child sandbox teardown failure shouldn't crash the parent
    });
    if (observe) {
      markRunDone(input.childRunId);
    }
  }
  return result;
}
