// The conversation chat executor — the single live chat substrate. Drives a run on
// Mastra's Harness `Session`: construct a `Harness` over our assembled agent + our
// memory adapter + a single default mode, bind it to the Engenty thread, and bridge
// the Harness's high-level events to the run-event-bus via `HarnessAgUiConverter`.
//
// Covers text + tools + real cancel + usage + runtime-context, native sub-agent
// cards, frontend-tool HITL (suspend/park/resume), decision/feedback artifacts, and
// the execute-boundary tool-approval gate. Events arrive as
// agent_start → message_* → usage_update → agent_end; recall flows through
// EngentySessionMemoryStorage.
import type { AGUIEvent, RunAgentInput } from "@engenty/ag-ui-bridge";
import { type AiUsageStore, recordAiUsage } from "@engenty/ai-core";
import { Harness } from "@mastra/core/harness";
import type { Workspace } from "@mastra/core/workspace";
import { gateway } from "ai";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import { createNativeFrontendTools } from "../../../ai/frontend-tools/native-frontend-tool.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
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
import type {
  AgentUiProducerContext,
  AiSessionScope,
} from "../sessions/types.js";
import { createDelegationTools } from "./delegate-tool.js";
import {
  emitArtifactInterrupt,
  emitFrontendToolInterrupt,
} from "./emit-interrupt.js";
import { HarnessAgUiConverter } from "./harness-agui-bridge.js";
import { parkHarnessRun } from "./harness-park.js";
import { persistSubAgentProgress } from "./persist-sub-agent-progress.js";

/** A frontend tool that suspended the run, captured for the post-run interrupt. */
interface SuspendedFrontendTool {
  args: unknown;
  runId: string;
  toolCallId: string;
  toolName: string;
}

const HARNESS_SESSION_NOTE =
  "You are running on the new Mastra Harness `Session` (the target chat substrate), as documented at https://mastra.ai/docs/harness/overview.";

/** Map a Mastra Harness `TokenUsage` to the `recordAiUsage` usage shape. */
function usageFromHarness(usage: unknown): {
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

  let harness: Harness | null = null;
  // Set when a frontend tool suspends and we park the Harness for resume — guards
  // the finally from destroying the parked instance.
  let parkedForResume = false;
  try {
    const { memory } = createEngentySessionMemoryRuntime({
      agentId: input.agentId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    });
    const mergedDefinitions = mergeFrontendToolDefinitions(
      input.agentUi?.frontend_tools,
      { includeServerTools: !input.agentId.startsWith("chatbot.") }
    );
    const frontendTools = createNativeFrontendTools(mergedDefinitions);
    // Built early so the delegation tools' onProgress can fold lines onto the
    // sub-agent card (recordSubAgentProgress) and tag live progress events.
    const converter = new HarnessAgUiConverter();
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
      ...(useChildRunDelegation ? { skipSubAgents: true } : {}),
      ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });

    // The same runtime-context system message the control plane injects, set as
    // the Harness's per-run instructions (the Harness is constructed per run).
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
    const instructions = [HARNESS_SESSION_NOTE, runtimeInstructions]
      .filter(Boolean)
      .join("\n\n");

    harness = new Harness({
      // The agent goes at the TOP LEVEL (config.agent), NOT on the mode (mode.agent
      // is deprecated). The Harness only combines its instructions
      // (runtime-context) with the agent's own when `config.agent` is set
      // (buildAgentMessageStreamOptions) — on the mode the runtime-context is
      // silently dropped (the "missing context" bug).
      agent,
      id: `engenty-hs-${input.threadId}`,
      instructions,
      memory,
      modes: [{ default: true, id: "default", name: "Default" }] as never,
      resolveModel: (modelId: string) => gateway(modelId) as never,
      resourceId: input.scope.userId,
    } as never);
    await harness.init();
    await harness.switchThread({ threadId: input.threadId });
    // Phase 3.2c — turn the Harness's NATIVE tool-approval gate fully OFF (yolo).
    // It keys on the Mastra tool NAME, but Engenty rides ONE generic tool
    // (`engenty_tool_execute`), so a per-name gate is structurally too coarse — it
    // can't tell a read from a destructive write, and (CONFIRMED live: tool stuck at
    // state="call") it parks every tool on `tool_approval_required` → the run hangs.
    // A permissionRules/category-allow attempt did NOT reliably auto-allow in
    // practice, so we use the proven kill-switch. This is NOT the old blanket bypass:
    // Engenty's REAL approval gate now lives at the execution boundary inside
    // `engenty_tool_execute` (lib/tool-approval.ts) — it reads the resolved tool
    // CONTRACT (requiresApproval; core authoritative, 202 backstop) and returns an
    // Approve/Deny artifact. Disabling the redundant, too-coarse native gate is a
    // deliberate architecture choice; frontend-tool + sandbox HITL use the suspend
    // path, not this gate.
    await harness.setState({ yolo: true } as never);

    let runError: string | null = null;
    // A frontend tool that suspends (browser-executed HITL): the Harness emits
    // `tool_suspended` + parks the run in session.suspensions. Capture it (with the
    // current run id, for reattach) and handle the interrupt after sendMessage idles.
    let suspended: SuspendedFrontendTool | null = null;
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
    const unsub = harness.subscribe((event) => {
      const typed = event as {
        args?: unknown;
        error?: { message?: string };
        result?: unknown;
        toolCallId?: string;
        toolName?: string;
        type?: string;
      };
      if (typed.type === "error") {
        runError = typed.error?.message ?? "Harness run error";
      }
      if (typed.type === "tool_suspended") {
        suspended = {
          args: typed.args,
          runId: harness?.session.getCurrentRunId() ?? "",
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
        harness?.abort();
        signalInterrupt();
        return;
      }
      for (const agui of converter.convert(event as never)) {
        emit(agui);
      }
    });

    // Route cancel → real Harness abort.
    if (abort.abortSignal.aborted) {
      harness.abort();
    } else {
      abort.abortSignal.addEventListener("abort", () => harness?.abort(), {
        once: true,
      });
    }

    // `sendMessage` resolves on a NORMAL finish, but a frontend-tool SUSPEND leaves
    // it pending forever (the suspended run's stream never terminates). Race it
    // against the interrupt signal so a suspend/artifact is handled immediately. On
    // suspend, sendMessage stays pending against the parked Harness — the resume
    // continues it; we drop our await (errors are caught so it never rejects loudly).
    // Run the send (and thus every tool execution it drives) inside the
    // engenty-tools run context so the execute-boundary approval gate sees the
    // user's grants (and the run identity). ALS propagates to the async tool calls.
    const toolsRunContext = {
      ...getEngentyToolsRunContext(),
      approvalGrants: input.approvalGrants ?? [],
      runId: input.runId,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      ...(input.scope.userAccessToken
        ? { userAccessToken: input.scope.userAccessToken }
        : {}),
    };
    const sendDone = engentyToolsRunAls
      .run(toolsRunContext, () =>
        harness!.sendMessage({ content: input.prompt })
      )
      .catch((error: unknown) => {
        if (!runError) {
          runError =
            error instanceof Error ? error.message : "Harness run error";
        }
      });
    await Promise.race([sendDone, interruptSignal]);
    unsub();

    // Frontend-tool HITL: a suspend surfaced. Emit the same AG-UI interrupt the
    // control plane does (persist the open interrupt keyed by the suspended run id
    // + RUN_FINISHED outcome) and PARK the Harness so the resume POST reattaches.
    const sus = suspended as SuspendedFrontendTool | null;
    if (sus && !abort.abortSignal.aborted) {
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
        parkHarnessRun(sus.runId, harness, input.threadId, mergedDefinitions);
        parkedForResume = true;
        return { runId: input.runId };
      }
    }

    // A decision/feedback artifact surfaced (run already aborted). Persist the open
    // interrupt + emit the RUN_FINISHED outcome so the chat shows the picker/form.
    // Resume re-runs via the route's artifact branch (no parked Harness).
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
      return { runId: input.runId };
    }

    for (const agui of converter.finish()) {
      emit(agui);
    }
    // Fold any native sub-agent progress lines onto the persisted delegation
    // part (Mastra memory drops them) so the sub-agent card Log + drill-in
    // survive reload — same as the control plane. No-op until a native Harness
    // subagent runs (Engenty's CLI stays Agent-level for its sandbox).
    await persistSubAgentProgress({
      progressByToolCallId: converter.getSubAgentProgressLines(),
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
    });

    if (runError && !abort.abortSignal.aborted) {
      emit({ message: runError, type: "RUN_ERROR" });
      return { runId: input.runId };
    }

    if (!abort.abortSignal.aborted) {
      await recordHarnessUsage({
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[conversation ${input.runId}] failed:`, error);
    emit({ message, type: "RUN_ERROR" });
  } finally {
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
    // Release the per-run Harness — UNLESS it's parked for a frontend-tool resume
    // (the resume reattaches to it; the park's TTL owns its disposal).
    if (!parkedForResume) {
      await harness?.destroy().catch(() => {
        // best-effort cleanup
      });
    }
  }
  return { runId: input.runId };
}

async function recordHarnessUsage(input: {
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
  const usage = usageFromHarness(input.usage);
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
