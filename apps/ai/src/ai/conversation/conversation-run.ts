// The conversation chat executor — the single live chat substrate. Drives a run on
// a Mastra `Session` (created by a per-run `AgentController`) over our assembled
// agent + our memory adapter + a single default mode, bound to the Engenty thread,
// and bridges the session's high-level events to the run-event-bus via
// `SessionAgUiConverter`.
//
// Covers text + tools + real cancel + usage + runtime-context, native sub-agent
// cards, frontend-tool HITL (suspend/park/resume), decision/feedback artifacts, and
// the execute-boundary tool-approval gate. Events arrive as
// agent_start → message_* → usage_update → agent_end; recall flows through
// EngentySessionMemoryStorage.
import type { AGUIEvent, RunAgentInput } from "@engenty/ag-ui-bridge";
import { type AiUsageStore, recordAiUsage } from "@engenty/ai-core";
import type { Workspace } from "@mastra/core/workspace";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import { createNativeFrontendTools } from "../../../ai/frontend-tools/native-frontend-tool.js";
import { isToolApprovalSuspendPayload } from "../../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import type { AgentSessionStatus } from "../../dal/agent-sessions/types.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { createEngentySessionMemoryRuntime } from "../memory/invocation-options.js";
import {
  type AiRegistry,
  assembleDynamicAgent,
  type RuntimeModelConfig,
} from "../registry/index.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { registerActiveRunAbortController } from "../sessions/run-abort-registry.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import { buildSessionRuntimeInstructions } from "../sessions/runtime-instructions.js";
import {
  isDecisionArtifactPayload,
  isFeedbackArtifactPayload,
} from "../sessions/transcript.js";
import {
  type AgentUiProducerContext,
  type AiSessionScope,
  scopeAccessToken,
} from "../sessions/types.js";
import {
  type ConversationController,
  createConversationSession,
} from "./controller-session.js";
import { createDelegationTools } from "./delegate-tool.js";
import {
  emitArtifactInterrupt,
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "./emit-interrupt.js";
import { persistSubAgentProgress } from "./persist-sub-agent-progress.js";
import { SessionAgUiConverter } from "./session-agui-bridge.js";
import { parkSessionRun } from "./session-park.js";
import { patchThreadStatus } from "./thread-status.js";

/** A tool that suspended the run, captured for the post-run interrupt. */
interface SuspendedTool {
  args: unknown;
  runId: string;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

const MASTRA_SESSION_NOTE =
  "You are running on the Mastra `Session` chat substrate (AgentController), the target chat runtime.";

/** Map a Mastra `TokenUsage` to the `recordAiUsage` usage shape. */
function usageFromSession(usage: unknown): {
  cached?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
} | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const u = usage as {
    cachedInputTokens?: unknown;
    completionTokens?: unknown;
    promptTokens?: unknown;
    reasoningTokens?: unknown;
  };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    cached: num(u.cachedInputTokens),
    input: num(u.promptTokens),
    output: num(u.completionTokens),
    reasoning: num(u.reasoningTokens),
  };
}

export interface StartConversationRunInput {
  agentId: string;
  agentUi?: AgentUiProducerContext | null;
  // Operation ids the user already approved for this chat (Phase 3.2c). Threaded
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
  modelConfig?: RuntimeModelConfig | null;
  modelId?: string | null;
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
  // The run's sandbox providers — torn down when the run ends so the sandbox
  // syncOut persists the staged /shared + /home dirs to file storage. Without
  // this the CLI sub-agent's writes never reach durable storage.
  sandboxProvider?: EngentySandboxProvider;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: AgentSessionStore;
  threadId: string;
  usageStore?: AiUsageStore | null;
  workspace?: Workspace;
}

/**
 * Start a `runtime_mode=harness_session` run. Fire-and-forget from the POST-runs
 * route branch; events flow to the SSE attach via the run-event-bus, unchanged.
 */
export async function startConversationRun(
  input: StartConversationRunInput
): Promise<{ runId: string }> {
  markRunLive(input.runId);
  const abort = registerActiveRunAbortController(input.runId);
  let seq = 0;
  const emit = (event: AGUIEvent) =>
    publishRunEvent(input.runId, { event, seq: seq++ });
  emit({ runId: input.runId, threadId: input.threadId, type: "RUN_STARTED" });

  let controller: ConversationController | null = null;
  // Set when a frontend tool suspends and we park the session for resume — guards
  // the finally from destroying the parked controller.
  let parkedForResume = false;
  // Terminal thread status written in `finally` so session-list dots stay in sync.
  let threadStatus: AgentSessionStatus = "completed";
  await patchThreadStatus({ ...input, status: "running" });
  try {
    const { memory } = createEngentySessionMemoryRuntime({
      agentId: input.agentId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
      ...(input.attachmentParts && input.attachmentParts.length > 0
        ? { userAttachmentParts: input.attachmentParts }
        : {}),
    });
    const mergedDefinitions = mergeFrontendToolDefinitions(
      input.agentUi?.frontend_tools,
      { includeServerTools: !input.agentId.startsWith("chatbot.") }
    );
    const frontendTools = createNativeFrontendTools(mergedDefinitions);
    // Built early so the delegation tools' onProgress can fold lines onto the
    // sub-agent card (recordSubAgentProgress) and tag live progress events.
    const converter = new SessionAgUiConverter();
    // Phase 3 — child-run delegation: expose one `agent-<alias>` tool per declared
    // sub-agent that spawns it as its own child run, and skip the in-process Mastra
    // subagent mechanism so there is a single delegation path.
    const resolveChildWorkspace = input.resolveChildWorkspace;
    let delegationTools: Record<string, object> = {};
    if (resolveChildWorkspace) {
      const rootConfig = await input.registry.getAgentConfig(input.agentId);
      if (rootConfig?.subAgents?.length) {
        delegationTools = createDelegationTools(rootConfig.subAgents, {
          onProgress: (toolCallId, line) => {
            converter.recordSubAgentProgress(toolCallId, line);
            emit({
              name: "engenty.sub_agent.progress",
              type: "CUSTOM",
              value: {
                line,
                messageId: converter.currentMessageId || toolCallId,
                toolCallId,
              },
            } as AGUIEvent);
          },
          parentThreadId: input.threadId,
          registry: input.registry,
          resolveChildWorkspace,
          scope: input.scope,
          store: input.store,
          ...(abort.abortSignal ? { abortSignal: abort.abortSignal } : {}),
          ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
        });
      }
    }
    const useChildRunDelegation = Object.keys(delegationTools).length > 0;
    const extraTools = { ...frontendTools, ...delegationTools };
    // Assemble WITHOUT memory — the Harness provides memory to its mode agents.
    const agent = await assembleDynamicAgent(input.registry, input.agentId, {
      extraTools,
      // Function agents render over this thread's agent_state snapshot
      // (PLAN-agent-hooks D5); data configs ignore the context.
      resolveContext: {
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      },
      ...(useChildRunDelegation ? { skipSubAgents: true } : {}),
      ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });

    // The same runtime-context system message the control plane injects, set as
    // the controller's per-run instructions (the controller is constructed per run).
    const runtimeInstructions = (
      await buildSessionRuntimeInstructions({
        agentId: input.agentId,
        agentUi: input.agentUi,
        routeContext: input.routeContext ?? null,
        runContext: input.runContext,
        scope: input.scope,
        threadId: input.threadId,
      })
    ).trim();
    const instructions = [MASTRA_SESSION_NOTE, runtimeInstructions]
      .filter(Boolean)
      .join("\n\n");

    // Construction recipe (top-level agent, thread binding, yolo rationale):
    // see createConversationSession.
    const created = await createConversationSession({
      agent,
      id: `engenty-hs-${input.threadId}`,
      instructions,
      memory,
      threadId: input.threadId,
      userId: input.scope.userId,
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });
    controller = created.controller;
    const session = created.session;

    let runError: string | null = null;
    // A suspending tool (browser-executed frontend tool, or the execute tool's
    // approval gate): the session emits `tool_suspended` + parks the run in
    // session.suspensions. Capture it (with the current run id, for reattach)
    // and handle the interrupt after sendMessage idles.
    let suspended: SuspendedTool | null = null;
    // A decision/feedback artifact arrives as a tool RESULT (not a suspend): the
    // requestDecision/requestFeedback tool returns the artifact and the agent would
    // talk past it. Capture it, ABORT the run (so it stops), and emit the interactive
    // interrupt instead of a plain result — same as the control plane.
    let artifact: { result: unknown; toolCallId: string } | null = null;
    // A suspended run's processStream does NOT terminate, so `sendMessage` never
    // resolves on a frontend-tool suspend (or a decision/feedback artifact, which
    // aborts). Resolve this signal from the listener the instant we see one, and
    // race it against sendMessage so we emit the interrupt immediately instead of
    // hanging forever waiting for sendMessage.
    let signalInterrupt: () => void = () => {
      // replaced below
    };
    const interruptSignal = new Promise<void>((resolve) => {
      signalInterrupt = resolve;
    });
    const unsub = session.subscribe((event) => {
      const typed = event as {
        args?: unknown;
        error?: { message?: string };
        result?: unknown;
        suspendPayload?: unknown;
        toolCallId?: string;
        toolName?: string;
        type?: string;
      };
      if (typed.type === "error") {
        runError = typed.error?.message ?? "Session run error";
      }
      if (typed.type === "tool_suspended") {
        suspended = {
          args: typed.args,
          runId: session.getCurrentRunId() ?? "",
          suspendPayload: typed.suspendPayload,
          toolCallId: typed.toolCallId ?? "",
          toolName: typed.toolName ?? "",
        };
        signalInterrupt();
      }
      if (
        typed.type === "tool_end" &&
        !artifact &&
        (isDecisionArtifactPayload(typed.result) ||
          isFeedbackArtifactPayload(typed.result))
      ) {
        artifact = {
          result: typed.result,
          toolCallId: typed.toolCallId ?? "",
        };
        // Stop the run so the model doesn't continue past the interrupt; skip
        // converting this tool_end to a plain TOOL_CALL_RESULT.
        session.abort();
        signalInterrupt();
        return;
      }
      for (const agui of converter.convert(event as never)) {
        emit(agui);
      }
    });

    // Route cancel → real session abort.
    if (abort.abortSignal.aborted) {
      session.abort();
    } else {
      abort.abortSignal.addEventListener("abort", () => session.abort(), {
        once: true,
      });
    }

    // `sendMessage` resolves on a NORMAL finish, but a frontend-tool SUSPEND leaves
    // it pending forever (the suspended run's stream never terminates). Race it
    // against the interrupt signal so a suspend/artifact is handled immediately. On
    // suspend, sendMessage stays pending against the parked session — the resume
    // continues it; we drop our await (errors are caught so it never rejects loudly).
    // Run the send (and thus every tool execution it drives) inside the
    // engenty-tools run context so the execute-boundary approval gate sees the
    // user's grants (and the run identity). ALS propagates to the async tool calls.
    // Agent identity for core: policies (e.g. the secrets reveal gate) must see
    // the AGENT as principal, not the user whose bearer token it runs under.
    // Goal = the conversation thread; approval grants persist against it.
    const coreAgentId = await resolveCoreAgentId(
      input.scope.tenantId,
      input.agentId
    );
    const toolsRunContext = {
      ...getEngentyToolsRunContext(),
      ...(coreAgentId ? { agentId: coreAgentId } : {}),
      approvalGrants: input.approvalGrants ?? [],
      // Interactive chat: a gated operation returns a decision ARTIFACT (the
      // Approve/Deny card) instead of suspending the Mastra run. The artifact
      // rides the existing decision-interrupt pipeline: the run loop detects it
      // (isDecisionArtifactPayload), aborts, and emits the interrupt; the resume
      // RE-RUNS the turn with the persisted grant so the tool executes. We do NOT
      // use Mastra's native suspend here on purpose — two approval-gated calls in
      // one step would both suspend, and Mastra 1.52 cannot resume the first when
      // a second suspension shares the step (see
      // [[mastra-1-52-parallel-approval-regression]]). The artifact path keeps
      // parallel tool calls AND is immune to that bug. Frontend/sandbox HITL tools
      // still suspend via their own execute (a different mechanism, unaffected).
      approvalPolicy: "artifact" as const,
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
    };
    const sendDone = engentyToolsRunAls
      .run(toolsRunContext, () =>
        session.sendMessage({
          content: input.prompt,
          ...(input.attachments && input.attachments.length > 0
            ? { files: [...input.attachments] }
            : {}),
        })
      )
      .catch((error: unknown) => {
        if (!runError) {
          runError =
            error instanceof Error ? error.message : "Session run error";
        }
      });
    await Promise.race([sendDone, interruptSignal]);
    unsub();

    // A suspend surfaced — tool-approval (native HITL from the execute tool's
    // gate) or frontend tool. Either way: persist the open interrupt keyed by
    // the suspended run id, emit the RUN_FINISHED interrupt outcome, and PARK
    // the session so the resume POST reattaches and continues the SAME run.
    const sus = suspended as SuspendedTool | null;
    if (sus && !abort.abortSignal.aborted) {
      if (isToolApprovalSuspendPayload(sus.suspendPayload)) {
        await emitToolApprovalInterrupt({
          busRunId: input.runId,
          emit,
          payload: sus.suspendPayload,
          resumeRunId: sus.runId,
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
          toolCallId: sus.toolCallId,
        });
        parkSessionRun(sus.runId, {
          controller,
          mergedDefinitions,
          session,
          threadId: input.threadId,
        });
        parkedForResume = true;
        threadStatus = "waiting";
        return { runId: input.runId };
      }
      const handled = await emitFrontendToolInterrupt({
        busRunId: input.runId,
        resumeRunId: sus.runId,
        emit,
        mergedDefinitions,
        payload: {
          args: sus.args,
          toolCallId: sus.toolCallId,
          toolName: sus.toolName,
        },
        scope: input.scope,
        sessionMetadata: input.sessionMetadata ?? {},
        store: input.store,
        threadId: input.threadId,
      });
      if (handled) {
        parkSessionRun(sus.runId, {
          controller,
          mergedDefinitions,
          session,
          threadId: input.threadId,
        });
        parkedForResume = true;
        threadStatus = "waiting";
        return { runId: input.runId };
      }
    }

    // A decision/feedback artifact surfaced (run already aborted). Persist the open
    // interrupt + emit the RUN_FINISHED outcome so the chat shows the picker/form.
    // Resume re-runs via the route's artifact branch (no parked session).
    const art = artifact as { result: unknown; toolCallId: string } | null;
    if (art) {
      await emitArtifactInterrupt({
        busRunId: input.runId,
        emit,
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

    for (const agui of converter.finish()) {
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
      emit({ message: runError, type: "RUN_ERROR" });
      threadStatus = "failed";
      return { runId: input.runId };
    }

    if (!abort.abortSignal.aborted) {
      await recordSessionUsage({
        agentId: input.agentId,
        modelId: input.modelId ?? null,
        runId: input.runId,
        scope: input.scope,
        threadId: input.threadId,
        usage: converter.lastUsage,
        usageStore: input.usageStore,
      });
    }
    emit({
      runId: input.runId,
      threadId: input.threadId,
      type: "RUN_FINISHED",
    });
    threadStatus = "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[conversation ${input.runId}] failed:`, error);
    emit({ message, type: "RUN_ERROR" });
    threadStatus = "failed";
  } finally {
    await patchThreadStatus({ ...input, status: threadStatus });
    abort.cleanup();
    markRunDone(input.runId);
    // Tear down the run's root sandbox — destroy() runs syncOut, persisting staged
    // /shared + /home to file storage. Delegated child runs own + tear down their
    // own sandboxes (runDelegatedConversation), so this only covers the root.
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
    // Release the per-run controller — UNLESS it's parked for a frontend-tool
    // resume (the resume reattaches to it; the park's TTL owns its disposal).
    if (!parkedForResume) {
      await controller?.destroy().catch(() => {
        // best-effort cleanup
      });
    }
  }
  return { runId: input.runId };
}

async function recordSessionUsage(input: {
  agentId: string;
  modelId: string | null;
  runId: string;
  scope: AiSessionScope;
  threadId: string;
  usage: unknown;
  usageStore: AiUsageStore | null | undefined;
}): Promise<void> {
  if (!input.usageStore) {
    return;
  }
  const usage = usageFromSession(input.usage);
  if (!usage) {
    return;
  }
  try {
    await recordAiUsage({
      agent_id: input.agentId,
      feature: "copilot",
      model_id: input.modelId ?? "unknown",
      run_id: input.runId,
      store: input.usageStore,
      tenant_id: input.scope.tenantId,
      thread_id: input.threadId,
      usage,
      user_id: input.scope.userId,
    });
  } catch (error) {
    console.error(`[conversation ${input.runId}] usage failed:`, error);
  }
}
