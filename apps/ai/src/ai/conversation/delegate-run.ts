// Phase 3 — child-run delegation engine. Runs a delegated agent (e.g. the CLI
// specialist) as its OWN Conversation run: a fresh controller/session over the
// delegated agent, bound to the child's own thread + workspace + sandbox, driven to
// completion, with its final text returned to the caller (the `delegate` tool) and
// tool/step activity streamed out via `onProgress`.
//
// This is the single delegation mechanism (Decision ②): a delegation is a child RUN,
// not Mastra's in-process subagent tool. The child runs as a LEAF — no nested
// frontend tools, no further sub-agents, no HITL suspend — it executes its brief and
// returns. Its own thread is the per-delegation drill-in target and its own sandbox
// makes parallel delegations safe.
//
// The session construction shares the parent executor's hard-won recipe (top-level
// `config.agent`, `yolo` to disable the redundant native gate, memory adapter) — see
// createConversationSession for the rationale behind each.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import {
  type FieldSuggestion,
  fieldSuggestionsToolOutputToCreatedValue,
} from "@engenty/ai-core";
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
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore } from "../../dal/agent-sessions/agent-run-store.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { createEngentySessionMemoryRuntime } from "../memory/invocation-options.js";
import {
  type AiRegistry,
  assembleDynamicAgent,
  type MastraToolDefinition,
  type RuntimeModelConfig,
} from "../registry/index.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { markRunDone, markRunLive } from "../sessions/run-event-bus.js";
import { createSessionRunTracker } from "../sessions/run-tracking.js";
import { type AiSessionScope, scopeAccessToken } from "../sessions/types.js";
import {
  type ConversationController,
  createConversationSession,
} from "./controller-session.js";
import { SessionAgUiConverter } from "./session-agui-bridge.js";

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
  brief: string;
  childAgentId: string;
  // Identity for the child run — the caller generates these so it can correlate the
  // child thread (drill-in) and tag progress events to the parent's sub-agent card.
  childRunId: string;
  childThreadId: string;
  // Per-run tools merged into the leaf agent (task-job workspace file tools).
  extraTools?: Record<string, MastraToolDefinition>;
  /** Singleton Mastra — same wiring as the root conversation executor. */
  mastra?: Mastra;
  modelConfig?: RuntimeModelConfig | null;
  // When set, publish + persist this run's AG-UI events keyed by `childRunId` so
  // the run streams live AND replays on reattach (GET /v1/runs/:id/stream). Used
  // by Actions so the ActionButton shows live progress. Absent for in-chat
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
  // Called with human-readable lines as the child works (tool starts, etc.). The
  // `delegate` tool forwards these to the parent run's sub-agent progress card.
  onProgress?: (line: string) => void;
  registry: AiRegistry;
  // The child's sandbox provider — torn down (syncOut) before we return so the
  // child's writes reach durable storage before the parent continues.
  sandboxProvider?: EngentySandboxProvider;
  scope: AiSessionScope;
  store: AgentSessionStore;
  /**
   * Task this delegated run executes (headless task jobs). Threaded into the
   * tools context and forwarded to core as x-engenty-task-id so the approval
   * gate can spend task-scoped grants and stamp the task on requests it files.
   */
  taskId?: string | null;
  /** Trigger/routine behind the task — forwarded so routine-scoped grants
   * open core's gate for this run. */
  triggerId?: string | null;
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
  /** Field updates the agent proposed for approval (proposeUpdates artifact). */
  suggestions?: FieldSuggestion[];
  /** True when the run was suspended for approval (observe.suspendForApproval). */
  suspendedForApproval?: boolean;
}

/**
 * Recognize an app_build tool result that published a preview artifact. The
 * shape is the tool's own contract (appBuildResultSchema): app_id +
 * artifact_id + a status that means "a version exists to look at".
 */
function appBuildArtifactIdOf(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as {
    app_id?: unknown;
    artifact_id?: unknown;
    status?: unknown;
  };
  if (
    typeof record.app_id === "string" &&
    typeof record.artifact_id === "string" &&
    (record.status === "built" || record.status === "published")
  ) {
    return record.artifact_id;
  }
  return null;
}

/** Extract the plain text of a session assistant message.
 * Supports MastraDBMessage (`content.parts`) and legacy content[] text blocks. */
function assistantTextOf(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
          ? (block as { text: string }).text
          : ""
      )
      .join("");
  }
  if (content && typeof content === "object") {
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      return "";
    }
    return parts
      .map((block) =>
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
          ? (block as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

/**
 * Run a delegated agent to completion as its own child Conversation run. Returns the
 * child's final assistant text. Never throws — failures are returned as `error` so
 * the calling tool can surface them to the parent model.
 */
export async function runDelegatedConversation(
  input: RunDelegatedConversationInput
): Promise<DelegatedConversationResult> {
  const result: DelegatedConversationResult = {
    childRunId: input.childRunId,
    childThreadId: input.childThreadId,
    finalText: "",
  };
  let controller: ConversationController | null = null;
  // A session `error` event (e.g. a model/gateway 402 like "quota exceeded") does
  // NOT make sendMessage throw — the stream just ends. Capture it so the run is
  // reported as FAILED instead of silently "completed with no output".
  let streamError: string | null = null;
  // Observe mode (Actions): stream + persist AG-UI events keyed by childRunId.
  const observe = input.observe;
  const converter = observe ? new SessionAgUiConverter() : null;
  const tracker = observe
    ? createSessionRunTracker({
        agentId: input.childAgentId,
        createdByUserId: input.scope.userId,
        runId: input.childRunId,
        runStore: observe.runStore,
        threadId: input.childThreadId,
        tenantId: observe.tenantId,
      })
    : null;
  if (observe && tracker) {
    markRunLive(input.childRunId);
    void tracker.append({
      runId: input.childRunId,
      threadId: input.childThreadId,
      type: "RUN_STARTED",
    } as AGUIEvent);
  }
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
    const childToolsContext = {
      ...getEngentyToolsRunContext(),
      ...(childCoreAgentId ? { agentId: childCoreAgentId } : {}),
      agentTypeKey: input.childAgentId,
      // Durable task/routine grants for the "request" pre-gate; empty for
      // in-chat delegation (grants there live on the parent's session).
      approvalGrants: input.approvalGrants ?? [],
      // Leaf run — no interactive channel: a gated operation is denied with a
      // clear result instead of suspending (which would deadlock the parent).
      // Task jobs override to "defer" (core decides) or "request" (report a
      // needs-input request the workflow surfaces + re-dispatches).
      approvalPolicy: input.approvalPolicy ?? ("deny" as const),
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
      ...(input.triggerId ? { triggerId: input.triggerId } : {}),
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      ...(scopeAccessToken(input.scope)
        ? { accessToken: scopeAccessToken(input.scope) }
        : {}),
    };
    // Belt-and-suspenders: also carry the token on the Mastra requestContext (the
    // `mastra__authToken` key the server sets from the HTTP Authorization header),
    // for tools that DO forward the execution context.
    const requestContext = new RequestContext();
    if (scopeAccessToken(input.scope)) {
      requestContext.set(MASTRA_AUTH_TOKEN_KEY, scopeAccessToken(input.scope));
    }

    // Construct AND drive the session inside the engenty-tools ALS scope. A HEADLESS
    // run (dispatched Task Job — no incoming HTTP request, no ambient context) has no
    // other source of the bearer; the session captures the async context as it sets
    // up its tool pipeline, so the whole lifecycle must run within `.run()` for the
    // child's tools to see the token. (The interactive path runs inside the server's
    // ambient request context, which masked this.)
    result.finalText = await engentyToolsRunAls.run(
      childToolsContext,
      async () => {
        const { memory } = createEngentySessionMemoryRuntime({
          agentId: input.childAgentId,
          scope: input.scope,
          store: input.store,
          threadId: input.childThreadId,
        });
        // Leaf agent: no extra frontend tools, no nested sub-agents.
        const agent = await assembleDynamicAgent(
          input.registry,
          input.childAgentId,
          {
            ...(input.allowedToolIds
              ? { allowedToolIds: input.allowedToolIds }
              : {}),
            ...(input.extraTools ? { extraTools: input.extraTools } : {}),
            ...(input.mastra ? { mastra: input.mastra } : {}),
            ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
            ...(input.workspace ? { workspace: input.workspace } : {}),
          }
        );

        const created = await createConversationSession({
          agent,
          id: `engenty-sub-${input.childThreadId}`,
          memory,
          threadId: input.childThreadId,
          userId: input.scope.userId,
          ...(input.workspace ? { workspace: input.workspace } : {}),
        });
        controller = created.controller;
        const session = created.session;

        let finalText = "";
        const unsub = session.subscribe((event) => {
          const typed = event as {
            error?: { message?: string };
            message?: { role?: string };
            result?: unknown;
            toolName?: string;
            type?: string;
          };
          if (typed.type === "error") {
            streamError = typed.error?.message ?? "agent stream error";
          }
          // Capture a proposeUpdates field-suggestions artifact (HITL): its tool
          // result carries the proposal the approval gate suspends on.
          if (typed.type === "tool_end") {
            const created = fieldSuggestionsToolOutputToCreatedValue(
              typed.result
            );
            if (created) {
              result.suggestions = created.suggestions;
              result.artifactId = created.artifact_id;
            }
            const appArtifactId = appBuildArtifactIdOf(typed.result);
            if (appArtifactId) {
              result.appArtifactId = appArtifactId;
            }
          }
          if (
            (typed.type === "message_update" || typed.type === "message_end") &&
            typed.message?.role === "assistant"
          ) {
            const text = assistantTextOf(typed.message);
            if (text) {
              finalText = text;
            }
          }
          if (
            typed.type === "tool_start" &&
            typeof typed.toolName === "string"
          ) {
            input.onProgress?.(`Running ${typed.toolName}`);
          }
          if (converter && tracker) {
            for (const agui of converter.convert(event as never)) {
              void tracker.append(agui);
            }
          }
        });

        if (input.abortSignal?.aborted) {
          session.abort();
        } else {
          input.abortSignal?.addEventListener("abort", () => session.abort(), {
            once: true,
          });
        }

        await session.sendMessage({ content: input.brief, requestContext });
        unsub();
        if (converter && tracker) {
          for (const agui of converter.finish()) {
            void tracker.append(agui);
          }
        }
        return finalText;
      }
    );
    // A captured stream error (no throw) is still a failure — surface it.
    if (streamError && !result.error) {
      result.error = streamError;
    }
    if (tracker) {
      if (result.error) {
        await tracker.append({
          message: result.error,
          type: "RUN_ERROR",
        } as AGUIEvent);
        await tracker.complete({
          errorMessage: result.error,
          status: "failed",
        });
      } else if (
        observe?.suspendForApproval &&
        result.suggestions &&
        result.suggestions.length > 0
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
              // best-effort — the gate step also sets the action_request state
            });
        }
        await tracker.append({
          message: "run_suspended",
          type: "RUN_ERROR",
        } as AGUIEvent);
      } else {
        await tracker.append({
          runId: input.childRunId,
          threadId: input.childThreadId,
          type: "RUN_FINISHED",
        } as AGUIEvent);
        await tracker.complete({ status: "completed" });
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
        type: "RUN_ERROR",
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
    // `controller` is assigned inside the ALS closure above, which TS's flow
    // analysis can't see — cast back to the real type for cleanup.
    await (controller as ConversationController | null)?.destroy().catch(() => {
      // best-effort cleanup
    });
    if (observe) {
      markRunDone(input.childRunId);
    }
  }
  return result;
}
