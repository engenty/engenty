// Phase 3 — the delegation tools. For each of the parent agent's declared sub-agents
// we expose one Mastra tool named `agent-<alias>` (the SAME naming the prior
// Agent-level subagent path used, so the existing AG-UI converter renders it as a
// sub-agent card with progress + drill-in — no converter change needed). Calling it
// spawns a child Conversation run (`runDelegatedConversation`) on its own thread +
// workspace + sandbox, streams the child's tool activity to the parent's sub-agent
// card via `onProgress`, and returns the child's final text to the parent model.
//
// This replaces Mastra's in-process `Agent.agents` subagent mechanism (Decision ②:
// one delegation mechanism = child runs).
import { createLogger } from "@engenty/telemetry";
import { createTool } from "@mastra/core/tools";
import type { Workspace } from "@mastra/core/workspace";
import { z } from "zod";
import {
  gateRequiresApproval,
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "../../../ai/tools/engenty-tools/lib/execute-approval.js";
import { invocationKey } from "../../../ai/tools/engenty-tools/lib/invocation-dedupe.js";
import {
  type EngentyToolsRunContext,
  getEngentyToolsRunContext,
  type ToolRequestContextCarrier,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { ToolRiskLevel } from "../../../ai/tools/engenty-tools/lib/tool-approval.js";
import type { AgentRunStore } from "../../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import type {
  AgentConfig,
  AiRegistry,
  RuntimeModelConfig,
} from "../registry/index.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import type { AiSessionScope } from "../sessions/types.js";
import { inheritChildSpace } from "./child-space.js";
import { runDelegatedConversation } from "./delegate-run.js";

const logger = createLogger({ name: "delegate-tool" });

export interface DelegationToolDeps {
  abortSignal?: AbortSignal;
  /**
   * Exactly-once for an identical brief to the same specialist within one
   * run: invocation key → the first delivery's result. The lane that owns the
   * run seeds it (createRootDelegationTools); a repeat is refused with that
   * result attached. Absent = no dedupe.
   */
  completedDelegations?: Map<string, Record<string, unknown>>;
  /**
   * How many delegation hops deep the children built from these deps run.
   * A chat root's children are depth 1; a consulted colleague's would be 2.
   * The budget check lives in delegate-run, against
   * ENGENTY_AGENT_MESSAGE_DEPTH (default 1).
   */
  delegationDepth?: number;
  modelConfig?: RuntimeModelConfig | null;
  // Emit a progress line onto the parent's sub-agent card, keyed by this tool call.
  onProgress: (
    toolCallId: string,
    line: string,
    /**
     * Who is working and under which tool call. The bridge buffers a server
     * tool's TOOL_CALL_* events until the call returns, so while a colleague
     * works there is no row for these lines to land on — the transcript can
     * draw one from this.
     */
    origin?: { agentId: string; toolName: string }
  ) => void;
  /**
   * The PARENT run id — stamped onto the child's `ai.agent_run.metadata` so
   * the platform observer can indent the child under that turn. Falls back to
   * ALS `runId` when omitted.
   */
  parentRunId?: string | null;
  // The PARENT run's thread — the child's workspace + sandbox key off this (so the
  // child shares the tenant `/shared` and reuses the session-lifecycle sandbox
  // across delegations, exactly like the prior Agent-level sub-agent). The child's
  // own transcript runs on a separate child thread (for per-delegation drill-in).
  parentThreadId: string;
  registry: AiRegistry;
  // Resolve the delegated agent's own workspace + sandbox for the child run.
  resolveChildWorkspace: (input: {
    agentId: string;
    runId: string;
    threadId: string;
  }) => Promise<
    | { sandboxProvider?: EngentySandboxProvider; workspace?: Workspace }
    | undefined
  >;
  /**
   * Persist the child run when present (in-chat observer). Absent on lanes
   * that already pass `observe` through `runDelegatedConversation`.
   */
  runStore?: AgentRunStore | null;
  scope: AiSessionScope;
  store: ThreadStore;
}

const delegateInputSchema = z.object({
  brief: z
    .string()
    .min(1)
    .describe(
      "A self-contained instruction for the specialist: what to do, with all context it needs (it does not see this conversation)."
    ),
});

interface DelegatedRunStart {
  agentId: string;
  alias: string;
  /**
   * How the child clears a gated operation. "request" records each miss via
   * `onApprovalRequired` and ends the child gracefully; the caller then asks
   * the human on the PARENT run. Absent: the leaf denies (no channel).
   */
  approvalPolicy?: "deny" | "request";
  brief: string;
  /** The thread the child's transcript lands on. */
  childThreadId: string;
  onApprovalRequired?: EngentyToolsRunContext["onApprovalRequired"];
  toolCallId: string;
  /** The delegating tool as the transcript names it (`message_agent`, `agent-…`). */
  toolName: string;
  /** Which thread the child's workspace and sandbox key off. */
  workspaceThreadId: string;
}

/**
 * Start one child run of a specialist, awaited by `runDelegatedSpecialist`,
 * which hands the reply back to the parent model. A hand-off that should
 * run on without the parent is not a child run at all — it is a message in a
 * room (`rooms/deliver.ts`).
 */
async function startDelegatedRun(
  deps: DelegationToolDeps,
  input: DelegatedRunStart & { childRunId: string }
) {
  const parentSpace = getEngentyToolsRunContext().space;
  const space = inheritChildSpace({ parent: parentSpace });
  const ws = await deps.resolveChildWorkspace({
    agentId: input.agentId,
    runId: input.childRunId,
    threadId: input.workspaceThreadId,
  });
  return await runDelegatedConversation({
    ...(input.approvalPolicy ? { approvalPolicy: input.approvalPolicy } : {}),
    ...(input.onApprovalRequired
      ? { onApprovalRequired: input.onApprovalRequired }
      : {}),
    brief: input.brief,
    childAgentId: input.agentId,
    childRunId: input.childRunId,
    childThreadId: input.childThreadId,
    delegationDepth: deps.delegationDepth ?? 1,
    parentRunId: deps.parentRunId ?? getEngentyToolsRunContext().runId ?? null,
    parentThreadId: deps.parentThreadId,
    parentToolCallId: input.toolCallId || null,
    registry: deps.registry,
    scope: deps.scope,
    space,
    store: deps.store,
    ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
    ...(deps.modelConfig ? { modelConfig: deps.modelConfig } : {}),
    ...(ws?.workspace ? { workspace: ws.workspace } : {}),
    ...(ws?.sandboxProvider ? { sandboxProvider: ws.sandboxProvider } : {}),
    ...(deps.runStore
      ? {
          observe: {
            runStore: deps.runStore,
            tenantId: deps.scope.tenantId,
          },
        }
      : {}),
    onProgress: (line) =>
      deps.onProgress(input.toolCallId, line, {
        agentId: input.agentId,
        toolName: input.toolName,
      }),
  });
}

const RISK_ORDER: Record<ToolRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** One gated operation the child could not run, as its gate reported it. */
interface PendingChildApproval {
  operationId: string;
  riskLevel: ToolRiskLevel;
  title?: string;
}

/**
 * Run a specialist to completion for the parent model, and ask the human on
 * the parent run when the child hits the approval gate.
 *
 * The child is a leaf: it cannot suspend (the waiting parent would deadlock).
 * So when the PARENT can park — an interactive chat turn — the child runs
 * under "request": every gated miss is collected instead of denied, the child
 * ends with `approval_pending` results, and THIS tool then suspends the parent
 * with one bulk card naming every operation. Approving persists the grants on
 * the chat; Mastra re-executes this tool with the decision, and the child is
 * dispatched again, inheriting those grants through the run context. Without
 * this the leaf's denial was final: Brain handed Knowledge Base setup to the
 * manager, every `kb_create` died with "approval … not available in this
 * run", and nobody was ever asked (2026-09-05).
 *
 * Headless parents (routine fires, task jobs) have no one to ask, so the child
 * keeps the leaf contract there.
 */
export async function runDelegatedSpecialist(
  deps: DelegationToolDeps,
  input: {
    agentId: string;
    alias: string;
    brief: string;
    /**
     * An existing thread to answer in — an agent pair's room. Omitted, the
     * answer gets a throwaway thread of its own.
     */
    childThreadId?: string;
    /** The delegating tool's own execution context — the parent's HITL seam. */
    context?: ToolRequestContextCarrier<ToolApprovalSuspendPayload>;
    toolCallId: string;
    /** The delegating tool as the transcript names it. */
    toolName: string;
  }
): Promise<Record<string, unknown>> {
  // Re-executed after the bulk card: the human decided. A denial ends here —
  // dispatching the child again would only make it ask again.
  const resume = toolApprovalResumeSchema.safeParse(
    input.context?.agent?.resumeData
  );
  const resumedApproval = resume.success ? resume.data : null;
  if (resumedApproval && !resumedApproval.approved) {
    return {
      agent: input.alias,
      error: "approval_denied",
      message: `The user denied ${input.alias} the write access it asked for. Do not retry; report what was left undone.`,
      ok: false,
    };
  }
  // A colleague briefed twice with the same words in one run did the work
  // twice: after the bulk card was approved, the resumed tool delivered the
  // brief and the model then issued the identical call again, and the grant
  // let a second article through (2026-09-05). The resumed execution is the
  // FIRST delivery — its earlier attempt ended at the gate and registered
  // nothing — so only a repeat after a completed delivery is refused.
  const delegationKey = invocationKey(`delegate:${input.agentId}`, {
    brief: input.brief,
  });
  const previous = deps.completedDelegations?.get(delegationKey);
  if (previous && !resumedApproval) {
    return {
      ...previous,
      duplicate_of_previous_call: true,
      message: `${input.alias} already received this exact brief in this turn; its reply is attached. Do not send it again — continue from that reply.`,
    };
  }
  const canAskHuman =
    getEngentyToolsRunContext().canSuspendForInteraction === true &&
    typeof input.context?.agent?.suspend === "function";
  const pending = new Map<string, PendingChildApproval>();
  const childRunId = crypto.randomUUID();
  const childThreadId = input.childThreadId ?? crypto.randomUUID();
  const parentSpace = getEngentyToolsRunContext().space;
  const space = inheritChildSpace({ parent: parentSpace });
  const spaceId =
    space && "spaceId" in space && typeof space.spaceId === "string"
      ? space.spaceId
      : undefined;
  const createThread = input.childThreadId
    ? Promise.resolve()
    : deps.store.createThread({
        agentId: input.agentId,
        createdByUserId: deps.scope.userId,
        id: childThreadId,
        // Read-only on the desk: the thread is the colleague's answer to a brief,
        // not a chat a person joins.
        routeContext: { delegated: true },
        tenantId: deps.scope.tenantId,
        title: `Delegated — ${input.alias}`,
        ...(spaceId ? { spaceId } : {}),
      });
  await createThread.catch(() => {
    // Memory may create the thread on first message; Space is still
    // enforced via ALS even if this stamp fails.
  });
  // Workspace/sandbox key off the PARENT thread so the child shares the
  // tenant `/shared` (its outputs land where the parent sees them) and reuses
  // the session-lifecycle sandbox — the child thread is only its transcript.
  const result = await startDelegatedRun(deps, {
    ...input,
    // The grants the human just gave ride the parent run context into the
    // child; the brief says so, or the model re-asks for what it already has.
    brief: resumedApproval?.approved
      ? `${input.brief}\n\nThe person watching approved the write operations you asked for — they are granted for this run. Carry them out now and report the result.`
      : input.brief,
    childRunId,
    childThreadId,
    workspaceThreadId: deps.parentThreadId,
    ...(canAskHuman
      ? {
          approvalPolicy: "request" as const,
          onApprovalRequired: (info: PendingChildApproval) => {
            pending.set(info.operationId, info);
          },
        }
      : {}),
  });
  if (result.error) {
    return { agent: input.alias, error: result.error, ok: false };
  }
  if (pending.size > 0) {
    const ops = [...pending.values()];
    const ids = ops.map((op) => op.operationId);
    if (resumedApproval?.approved) {
      // Asked once, granted, and still gated: core's own policy (the agent's
      // role, a connection) refuses independently of the chat grant. Say so
      // rather than raise the same card again.
      return {
        agent: input.alias,
        child_run_id: childRunId,
        child_thread_id: childThreadId,
        error: "approval_required",
        message: `${input.alias} still cannot run ${ids.join(", ")} after your approval — a policy outside this chat gates it. Report this; do not retry.`,
        ok: false,
        result: result.finalText,
      };
    }
    const riskLevel = ops.reduce<ToolRiskLevel>(
      (acc, op) =>
        RISK_ORDER[op.riskLevel] > RISK_ORDER[acc] ? op.riskLevel : acc,
      "low"
    );
    // Under the parent's "suspend" policy this parks the run and never
    // returns; the widening covers the artifact/deny shapes on other lanes.
    return (await gateRequiresApproval({
      body: `${input.alias} needs your approval to run: ${ops
        .map((op) => op.title?.trim() || op.operationId)
        .join(", ")}.`,
      context: input.context,
      operationId: ids[0]!,
      operationIds: ids,
      requiresApproval: true,
      riskLevel,
      title: `${input.alias} write access`,
    })) as unknown as Record<string, unknown>;
  }
  const delivered = {
    agent: input.alias,
    // An App the child built renders inline on the parent's sub-agent
    // card — the user sees the deliverable in the chat, not only in the
    // artifact pane or behind the child-thread drill-in.
    ...(result.appArtifactId ? { app_artifact_id: result.appArtifactId } : {}),
    child_run_id: childRunId,
    child_thread_id: childThreadId,
    ok: true,
    result: result.finalText,
  };
  deps.completedDelegations?.set(delegationKey, delivered);
  return delivered;
}

/**
 * Build one `agent-<alias>` delegation tool per sub-agent declared on the parent
 * config. Returns a Record keyed by tool name (ready to merge into extraTools).
 */
export function createDelegationTools(
  subAgents: AgentConfig["subAgents"],
  deps: DelegationToolDeps
): Record<string, ReturnType<typeof createTool>> {
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  for (const subAgent of subAgents ?? []) {
    const alias = subAgent.alias ?? subAgent.id;
    const toolName = `agent-${alias}`;
    tools[toolName] = createTool({
      id: toolName,
      description: `Delegate a self-contained task to the ${alias} specialist. It runs in its own workspace and returns a result.`,
      inputSchema: delegateInputSchema,
      // The parent's HITL seam: a gated child operation parks THIS call.
      suspendSchema: toolApprovalSuspendSchema,
      resumeSchema: toolApprovalResumeSchema,
      execute: async (input, ctx) => {
        const brief = (input as { brief: string }).brief;
        const toolCallId =
          (ctx as { agent?: { toolCallId?: string } })?.agent?.toolCallId ?? "";
        return (await runDelegatedSpecialist(deps, {
          agentId: subAgent.id,
          alias,
          brief,
          context: ctx as ToolRequestContextCarrier<ToolApprovalSuspendPayload>,
          toolCallId,
          toolName,
        })) as never;
      },
    });
  }
  return tools;
}
