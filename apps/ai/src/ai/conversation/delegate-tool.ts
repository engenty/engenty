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
import { createTool } from "@mastra/core/tools";
import type { Workspace } from "@mastra/core/workspace";
import { z } from "zod";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import type {
  AgentConfig,
  AiRegistry,
  RuntimeModelConfig,
} from "../registry/index.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import type { AiSessionScope } from "../sessions/types.js";
import { runDelegatedConversation } from "./delegate-run.js";

export interface DelegationToolDeps {
  abortSignal?: AbortSignal;
  modelConfig?: RuntimeModelConfig | null;
  // Emit a progress line onto the parent's sub-agent card, keyed by this tool call.
  onProgress: (toolCallId: string, line: string) => void;
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
  scope: AiSessionScope;
  store: AgentSessionStore;
}

const delegateInputSchema = z.object({
  brief: z
    .string()
    .min(1)
    .describe(
      "A self-contained instruction for the specialist: what to do, with all context it needs (it does not see this conversation)."
    ),
});

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
      execute: async (input, ctx) => {
        const brief = (input as { brief: string }).brief;
        const toolCallId =
          (ctx as { agent?: { toolCallId?: string } })?.agent?.toolCallId ?? "";
        const childRunId = crypto.randomUUID();
        const childThreadId = crypto.randomUUID();
        // Workspace/sandbox key off the PARENT thread so the child shares the
        // tenant `/shared` (its outputs land where the parent sees them) and reuses
        // the session-lifecycle sandbox — the child thread is only its transcript.
        const ws = await deps.resolveChildWorkspace({
          agentId: subAgent.id,
          runId: childRunId,
          threadId: deps.parentThreadId,
        });
        const result = await runDelegatedConversation({
          brief,
          childAgentId: subAgent.id,
          childRunId,
          childThreadId,
          registry: deps.registry,
          scope: deps.scope,
          store: deps.store,
          ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
          ...(deps.modelConfig ? { modelConfig: deps.modelConfig } : {}),
          ...(ws?.workspace ? { workspace: ws.workspace } : {}),
          ...(ws?.sandboxProvider
            ? { sandboxProvider: ws.sandboxProvider }
            : {}),
          onProgress: (line) => deps.onProgress(toolCallId, line),
        });
        if (result.error) {
          return { agent: alias, error: result.error, ok: false } as never;
        }
        return {
          agent: alias,
          // An App the child built renders inline on the parent's sub-agent
          // card — the user sees the deliverable in the chat, not only in the
          // artifact pane or behind the child-thread drill-in.
          ...(result.appArtifactId
            ? { app_artifact_id: result.appArtifactId }
            : {}),
          child_thread_id: childThreadId,
          ok: true,
          result: result.finalText,
        } as never;
      },
    });
  }
  return tools;
}
