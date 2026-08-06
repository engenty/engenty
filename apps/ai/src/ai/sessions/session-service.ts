import type { Message, RunAgentInput } from "@engenty/ag-ui-bridge";
import { mergeActiveArtifactMetadata } from "@engenty/ag-ui-bridge";
import type { AiEffort } from "@engenty/ai-core";
import {
  type AgentWorkspaceConfig,
  agUiMessageText,
  checkUsageLimits,
  formatUsageLimitError,
  normalizeAgUiMessageForPersistence,
  recordAiUsage,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Workspace } from "@mastra/core/workspace";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import { createNativeFrontendTools } from "../../../ai/frontend-tools/native-frontend-tool.js";
import { engentyToolsRunAls } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { ThreadMessageRow, ThreadRow } from "../../dal/threads/index.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { createDefaultAiRegistry } from "../agents.js";
import { AiSessionError } from "../errors.js";
import { filterAgentUiFrontendToolsForScope } from "../frontend-tool-gating/filter-agent-ui-for-scope.js";
import {
  assertEngentyNativeMastraMemoryConfigured,
  createEngentyAgentExecutionOptions,
  createEngentySessionMemoryRuntime,
} from "../memory/index.js";
import {
  assembleDynamicAgent,
  type RuntimeModelConfig,
  resolveAgentModelId,
} from "../registry/index.js";
import { destroySessionLifecycleSandbox } from "../sandbox/destroy-session-sandbox.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { resolveWorkVisibility } from "../work-scope/resolve-work-visibility.js";
import { mergeDeclaredWorkspaceMounts } from "../workspace/sandbox-mounts.js";
import {
  buildEngentyMountSpecs,
  expandWorkspaceMounts,
} from "../workspace/workspace-presets.js";
import { buildAgentWorkspaceForRun } from "./agent-workspace-hook.js";
import { resolveAgentMaxSteps } from "./max-steps.js";
import {
  buildNativeMastraModelInput,
  findCurrentUserTurn,
} from "./native-mastra-input.js";
import { reconcileOrphanedInterrupt } from "./reconcile-orphaned-interrupt.js";
import {
  createSessionRunTracker,
  ensureAgentRunStarted,
  readUsageTokenCounts,
} from "./run-tracking.js";
import { buildSessionRuntimeInstructions } from "./runtime-instructions.js";
import { resolveRuntimeModelConfig } from "./runtime-model-config.js";
import {
  buildRouteContext,
  resolveRequestedSessionId,
} from "./session-identity.js";
import {
  createScopeModuleOperationInvoker,
  extractTaskRouteFields,
  prepareTaskWorkspaceForRun,
  resolveTaskBinding,
} from "./task-workspace-hook.js";
import type {
  AgentUiProducerContext,
  AiSessionScope,
  AppendAiThreadMessageInput,
  CreateAiThreadInput,
  DeleteAiThreadsInput,
  ListAiThreadMessagesInput,
  ListAiThreadsInput,
  ThreadServiceOptions,
  UpdateAiThreadInput,
} from "./types.js";
import { scopeAccessToken } from "./types.js";
import { usageFromOutput } from "./usage.js";

// Session harness: Mastra Memory is the sole writer for user/assistant transcript
// rows; this layer owns interrupts metadata, run tracking, usage, and AG-UI SSE.
// MESSAGES_SNAPSHOT projects DB rows via buildAgUiMessagesFromSessionMessages.
// Mastra processors can `abort()` to short-circuit a run; streaming still emits
// wire events (text deltas, tool results) without duplicate DB writes.
export const GUARDRAIL_BLOCKED_REPLY_TEXT =
  "Sorry, that message can't be processed.";
const GUARDRAIL_TRIPPED_ERROR_CODE = "agent_threads.guardrailTripped";
const guardrailLogger = createLogger({ name: "apps/ai/guardrails/harness" });
// Failed tool calls surface to the model as errored `tool-result` chunks (Mastra
// sets `isError`), so they never hit a thrown-error path. Log them here so tool
// failures (e.g. a 414 from chat-thread-search) are visible in server logs.
const toolLogger = createLogger({ name: "apps/ai/tools/harness" });
const workspaceLogger = createLogger({ name: "apps/ai/workspace/harness" });

// Normalize an errored tool-result payload (string | Error | object) into a
// short message for structured logs without dumping the whole result blob.
function stringifyToolError(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result instanceof Error) {
    return result.message;
  }
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === "string") {
      return message;
    }
    try {
      return JSON.stringify(result);
    } catch {
      return "Unserializable tool error";
    }
  }
  return String(result);
}

export function resolveSubmittedUserMessage(messages: Message[] | undefined): {
  message: Message;
  normalized: NonNullable<
    ReturnType<typeof normalizeAgUiMessageForPersistence>
  >;
} {
  const normalized = (messages ?? [])
    .map((message) => ({
      message,
      normalized: normalizeAgUiMessageForPersistence(message),
    }))
    .filter((entry) => entry.normalized !== null);
  if (
    normalized.length !== 1 ||
    normalized[0]?.normalized?.role !== "user" ||
    !agUiMessageText(normalized[0].message)
  ) {
    throw new AiSessionError(
      "agent_threads.invalidSubmittedMessages",
      "Session runs accept exactly one current user message",
      { submitted_message_count: messages?.length ?? 0 }
    );
  }
  return {
    message: normalized[0].message,
    normalized: normalized[0].normalized,
  };
}

function findLastAssistantMessageRow(
  rows: readonly ThreadMessageRow[]
): ThreadMessageRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === "assistant") {
      return row;
    }
  }
  return null;
}

export function createThreadService(opts: ThreadServiceOptions) {
  function getRequiredStore() {
    const store = opts.getStore();
    if (!store) {
      throw new AiSessionError("agent_threads.unconfiguredDatabase");
    }
    return store;
  }

  async function getRequiredSession(params: {
    scope: AiSessionScope;
    threadId: string;
  }) {
    const store = getRequiredStore();
    const session = await store.getThread({
      tenantId: params.scope.tenantId,
      threadId: params.threadId,
    });
    if (!session) {
      throw new AiSessionError("agent_threads.notFound");
    }
    return { session, store };
  }

  async function resolveAgentForSessionMemory(input: {
    agentUi?: AgentUiProducerContext | null;
    authorization?: string | null;
    modelIdOverride?: string | null;
    runId?: string | null;
    scope: AiSessionScope;
    threadId: string;
    skipTaskCheckout?: boolean;
  }) {
    const { session, store } = await getRequiredSession(input);
    const registry =
      opts.createRegistry?.(input.scope) ??
      opts.registry ??
      createDefaultAiRegistry();
    // Fetch the agent config first: its declarative `workspace` block drives
    // whether (and how) a Mastra Workspace is attached for this run.
    const rootConfig = await registry.getAgentConfig(session.agent_id);
    let taskWorkspace: Workspace | undefined;
    let sandboxProvider: EngentySandboxProvider | undefined;
    const subAgentSandboxProviders: EngentySandboxProvider[] = [];
    const subAgentWorkspacesMap = new Map<string, Workspace>();
    if (input.runId) {
      await ensureAgentRunStarted(opts.getRunStore?.() ?? null, {
        id: input.runId,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        agentId: session.agent_id,
        modelId: null,
        createdByUserId: input.scope.userId,
      });
      const workspaceResult = await resolveWorkspaceForRun({
        agentId: session.agent_id,
        runId: input.runId,
        scope: input.scope,
        session,
        threadId: input.threadId,
        skipCheckout: input.skipTaskCheckout === true,
        workspaceConfig: rootConfig?.workspace,
      });
      taskWorkspace = workspaceResult?.workspace;
      sandboxProvider = workspaceResult?.sandboxProvider;

      // Build dedicated workspaces for sub-agents that declare workspace.enabled.
      // Each sub-agent gets its own workspace keyed by id/alias; session-lifecycle
      // sandboxes use the PARENT threadId so CLI agent reuses the same sandbox
      // path across multiple delegations within the same conversation.
      if (rootConfig?.subAgents?.length) {
        for (const subAgentRef of rootConfig.subAgents) {
          const subConfig = await registry.getAgentConfig(subAgentRef.id);
          if (!subConfig?.workspace?.enabled) {
            continue;
          }
          const subWorkspaceResult = await resolveWorkspaceForRun({
            agentId: subConfig.id,
            runId: input.runId,
            scope: input.scope,
            session,
            // Use parent threadId so session-lifecycle sandbox path is stable
            // across multiple delegations within the same parent conversation.
            threadId: input.threadId,
            skipCheckout: true,
            workspaceConfig: subConfig.workspace,
          });
          if (subWorkspaceResult) {
            subAgentWorkspacesMap.set(
              subAgentRef.id,
              subWorkspaceResult.workspace
            );
            if (subAgentRef.alias) {
              subAgentWorkspacesMap.set(
                subAgentRef.alias,
                subWorkspaceResult.workspace
              );
            }
            if (subWorkspaceResult.sandboxProvider) {
              subAgentSandboxProviders.push(subWorkspaceResult.sandboxProvider);
            }
          }
        }
      }
    }
    const subAgentWorkspaces =
      subAgentWorkspacesMap.size > 0 ? subAgentWorkspacesMap : undefined;
    const modelConfig = await resolveRuntimeModelConfig(
      opts,
      input.scope,
      input.modelIdOverride
    );
    const modelId = rootConfig
      ? resolveAgentModelId(rootConfig, modelConfig)
      : modelConfig.chatModelId;
    // AG-UI frontend tools: scope-gate, merge with server tools, then register as
    // NATIVE Mastra tools the LLM calls by name (they suspend the run; the browser
    // executes and resumes). Gating runs once here and `mergedDefinitions` is
    // returned for instruction-building reuse.
    const gatedAgentUi = await filterAgentUiFrontendToolsForScope({
      agentUi: input.agentUi,
      tenantId: input.scope.tenantId,
      accessToken:
        scopeAccessToken(input.scope) ??
        input.authorization?.replace(/^Bearer\s+/i, "").trim(),
    });
    const isChatbotAgent = session.agent_id?.startsWith("chatbot.") ?? false;
    const mergedDefinitions = mergeFrontendToolDefinitions(
      gatedAgentUi?.frontend_tools,
      { includeServerTools: !isChatbotAgent }
    );
    const nativeFrontendTools = createNativeFrontendTools(mergedDefinitions);
    const assembleOptions = {
      extraTools: nativeFrontendTools,
      mastra: opts.mastra,
      modelConfig,
      // Root-only resolve context (PLAN-agent-hooks D5): lets a function
      // agent render over this thread's persisted `agent_state` instead of
      // its bare/default face, so `useThreadState` setters (e.g. a
      // useMachine transition tool) have a durable store to write through.
      resolveContext: {
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      },
      ...(taskWorkspace ? { workspace: taskWorkspace } : {}),
      ...(subAgentWorkspaces ? { subAgentWorkspaces } : {}),
    };
    const { resolveAgentInstructionExtras } = await import(
      "../instructions/resolve-agent-instruction-extras.js"
    );
    const instructionExtras = await resolveAgentInstructionExtras({
      agentId: session.agent_id,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
    });
    const memoryRuntime = createEngentySessionMemoryRuntime({
      agentId: session.agent_id,
      scope: input.scope,
      threadId: input.threadId,
      store,
    });
    const agent = await (opts.assembleDynamicAgent ?? assembleDynamicAgent)(
      registry,
      session.agent_id,
      {
        ...assembleOptions,
        instructionExtras,
        memory: memoryRuntime.memory,
      }
    );
    await assertEngentyNativeMastraMemoryConfigured(agent, {
      agent_id: session.agent_id,
      thread_id: input.threadId,
    });
    return {
      agent,
      agentConfig: rootConfig,
      mergedDefinitions,
      modelId,
      rootConfig,
      sandboxProvider,
      subAgentSandboxProviders,
      session,
      store,
    };
  }

  // Declaration-driven workspace resolution. The agent's `AgentConfig.workspace`
  // expands into a tenant-scoped mount table; mounts whose binding entity is
  // absent (e.g. `/task` with no task) are dropped. Task checkout side-effects
  // (run FK, session patch) still run here; the generic hook assembles the
  // Mastra Workspace from the resolved mounts. No workspace declaration → no
  // workspace (memory-only run).
  async function resolveWorkspaceForRun(input: {
    agentId: string;
    runId: string;
    scope: AiSessionScope;
    session: Awaited<ReturnType<typeof getRequiredSession>>["session"];
    threadId: string;
    skipCheckout: boolean;
    workspaceConfig?: AgentWorkspaceConfig;
  }): Promise<
    | {
        sandboxProvider?: EngentySandboxProvider;
        workspace: Workspace;
      }
    | undefined
  > {
    const workspaceConfig = input.workspaceConfig;
    if (!workspaceConfig || workspaceConfig.enabled === false) {
      return;
    }

    const declaredMounts = mergeDeclaredWorkspaceMounts(
      workspaceConfig,
      expandWorkspaceMounts(workspaceConfig)
    );
    const wantsTask = declaredMounts.some(
      (mount) => mount.requireBinding === true && mount.source === "checkout"
    );

    // Resolve the task binding (and run checkout) only when a task mount is
    // declared and the session is task-bound — this drives the `/task` prefix.
    let taskIdentifier: string | undefined;
    let boundTaskId: string | undefined;
    if (wantsTask) {
      const { taskId } = extractTaskRouteFields(input.session.route_context);
      const binding = resolveTaskBinding({
        routeContext: input.session.route_context,
        workspaceKey: input.session.workspace_key,
      });
      boundTaskId = binding?.taskId ?? taskId;
      if (binding || taskId) {
        if (input.skipCheckout) {
          taskIdentifier = binding?.identifier;
        } else {
          const prep = await prepareTaskWorkspaceForRun({
            agentId: input.agentId,
            invokeOperation: createScopeModuleOperationInvoker(input.scope),
            routeContext: input.session.route_context,
            runId: input.runId,
            scope: input.scope,
            threadId: input.threadId,
            updateSession: async (patch) => {
              await getRequiredStore().updateThreadForUser({
                routeContext: patch.routeContext,
                threadId: input.threadId,
                tenantId: input.scope.tenantId,
                userId: input.scope.userId,
                workspaceKey: patch.workspaceKey,
              });
            },
            workspaceKey: input.session.workspace_key,
          });
          taskIdentifier = prep.binding?.identifier;
          boundTaskId = prep.binding?.taskId ?? boundTaskId;
        }
      }
    }

    // Containment chain (goal → project) above the bound task, from the ONE
    // containment resolver (work-scope/). Resolved only when the mount table
    // declares a containment mount AND a task actually bound — an unlinked
    // chat run simply has no `/goal` / `/project` (requireBinding drop).
    let goalId: string | undefined;
    let projectId: string | undefined;
    const wantsContainment = declaredMounts.some(
      (mount) => mount.source === "goal" || mount.source === "project"
    );
    if (wantsContainment && (boundTaskId || taskIdentifier)) {
      const visibility = await resolveWorkVisibility(
        {
          invoke: createScopeModuleOperationInvoker(input.scope),
          tenantId: input.scope.tenantId,
        },
        { taskId: boundTaskId, taskIdentifier }
      );
      goalId = visibility.chain.find((node) => node.tier === "goal")?.id;
      projectId = visibility.chain.find((node) => node.tier === "project")?.id;
    }

    const mountSpecs = buildEngentyMountSpecs(declaredMounts, {
      agentId: input.agentId,
      runId: input.runId,
      sandboxLifecycle: workspaceConfig.sandbox?.lifecycle ?? "run",
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
      ...(taskIdentifier ? { taskIdentifier } : {}),
      ...(goalId ? { goalId } : {}),
      ...(projectId ? { projectId } : {}),
    });
    // An agent declared a workspace but nothing in its mount table resolved —
    // every mount needed a binding that isn't there (a `/task` mount on a
    // session with no task, an unsupported scope). The run proceeds without a
    // workspace, which is correct but silently removes the file/skill tools the
    // agent's instructions may assume, so say it once rather than leaving the
    // caller to infer it from missing tools.
    if (mountSpecs.length === 0) {
      workspaceLogger.info("workspace_skipped_no_resolved_mounts", {
        agent_id: input.agentId,
        declared_mount_paths: declaredMounts.map((mount) => mount.path),
        run_id: input.runId,
        tenant_id: input.scope.tenantId,
      });
      return;
    }

    return buildAgentWorkspaceForRun({
      agentId: input.agentId,
      mounts: mountSpecs,
      runId: input.runId,
      scope: input.scope,
      threadId: input.threadId,
      workspaceConfig,
      ...(taskIdentifier ? { taskIdentifier } : {}),
    });
  }

  return {
    // Resolve ONE agent's workspace + sandbox for a run — used by child-run
    // delegation (Phase 3) to give a delegated agent (e.g. the CLI specialist) its
    // own sandbox on demand, keyed by the child run's own threadId so each
    // delegation is isolated. Returns undefined when the agent has no workspace.
    async resolveAgentWorkspaceForRun(input: {
      agentId: string;
      runId: string;
      scope: AiSessionScope;
      session: ThreadRow;
      threadId: string;
    }): Promise<
      | { sandboxProvider?: EngentySandboxProvider; workspace: Workspace }
      | undefined
    > {
      const registry =
        opts.createRegistry?.(input.scope) ??
        opts.registry ??
        createDefaultAiRegistry();
      const config = await registry.getAgentConfig(input.agentId);
      if (!config?.workspace?.enabled) {
        return;
      }
      return resolveWorkspaceForRun({
        agentId: input.agentId,
        runId: input.runId,
        scope: input.scope,
        session: input.session,
        skipCheckout: true,
        threadId: input.threadId,
        workspaceConfig: config.workspace,
      });
    },
    // Resolve the root agent's workspace and per-sub-agent sandbox workspaces for
    // a run, reusing the same `resolveWorkspaceForRun` the harness uses internally.
    // Exposed so the durable run path can give sub-agents (e.g. the CLI agent)
    // their sandbox without re-implementing the resolver. `skipCheckout` because
    // the durable path doesn't drive task checkout.
    async resolveRunWorkspaces(input: {
      runId: string;
      scope: AiSessionScope;
      session: ThreadRow;
      threadId: string;
    }): Promise<{
      // The run's root sandbox provider — the caller MUST `destroyRunSandboxes` it
      // when the run ends (destroy() runs syncOut, persisting staged /shared +
      // /home to file storage). Sub-agents are NOT pre-resolved: child-run
      // delegation (Phase 3) resolves each delegated agent's own workspace on
      // demand via `resolveAgentWorkspaceForRun` and owns its teardown.
      sandboxProvider?: EngentySandboxProvider;
      workspace?: Workspace;
    }> {
      const registry =
        opts.createRegistry?.(input.scope) ??
        opts.registry ??
        createDefaultAiRegistry();
      const rootConfig = await registry.getAgentConfig(input.session.agent_id);
      const rootResult = await resolveWorkspaceForRun({
        agentId: input.session.agent_id,
        runId: input.runId,
        scope: input.scope,
        session: input.session,
        threadId: input.threadId,
        skipCheckout: true,
        workspaceConfig: rootConfig?.workspace,
      });
      return {
        ...(rootResult?.sandboxProvider
          ? { sandboxProvider: rootResult.sandboxProvider }
          : {}),
        ...(rootResult?.workspace ? { workspace: rootResult.workspace } : {}),
      };
    },

    // Resolve the tenant/override-aware model config + the attribution model id for
    // a run, the same way the harness does internally. Lets the durable +
    // conversation executor honors the tenant's model pick (and record accurate
    // usage) instead of defaulting to the agent config's model. Additive — like
    // resolveRunWorkspaces above.
    async resolveRunModelConfig(input: {
      agentId: string;
      effort?: AiEffort | null;
      modelIdOverride?: string | null;
      scope: AiSessionScope;
    }): Promise<{
      agentBudgetCostMicros: number | null;
      modelConfig: RuntimeModelConfig;
      modelId: string;
    }> {
      const modelConfig = await resolveRuntimeModelConfig(
        opts,
        input.scope,
        input.modelIdOverride,
        input.effort
      );
      const registry =
        opts.createRegistry?.(input.scope) ??
        opts.registry ??
        createDefaultAiRegistry();
      const rootConfig = await registry.getAgentConfig(input.agentId);
      const modelId = rootConfig
        ? resolveAgentModelId(rootConfig, modelConfig)
        : modelConfig.chatModelId;
      return {
        agentBudgetCostMicros:
          rootConfig?.limits?.budget?.maxCostMicrosPerPeriod ?? null,
        modelConfig,
        modelId,
      };
    },

    async appendMessage(input: AppendAiThreadMessageInput) {
      const { store } = await getRequiredSession(input);
      const authorUserId =
        input.role === "user"
          ? (input.authorUserId ?? input.scope.userId)
          : (input.authorUserId ?? null);
      return store.appendMessage({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        role: input.role,
        parts: input.parts,
        authorUserId,
      });
    },

    async createThread(input: CreateAiThreadInput) {
      const store = getRequiredStore();
      const id = resolveRequestedSessionId(input);
      if (input.threadId && !id) {
        throw new AiSessionError("agent_threads.notFound");
      }
      const existing = id
        ? await store.getThread({
            tenantId: input.scope.tenantId,
            threadId: id,
          })
        : null;
      const threadId = id ?? crypto.randomUUID();
      const { thread } = await store.upsertThread({
        id: threadId,
        tenantId: input.scope.tenantId,
        agentId: input.agentId,
        createdByUserId: input.scope.userId,
        routeContext: buildRouteContext({
          routeContext: {
            ...(existing?.route_context ?? {}),
            ...(input.routeContext ?? {}),
          },
          sessionKey: input.sessionKey,
          threadId,
        }),
        status: input.status ?? existing?.status ?? "idle",
        summary: input.summary ?? existing?.summary ?? null,
        title: input.title ?? existing?.title ?? null,
        workspaceKey: input.workspaceKey ?? existing?.workspace_key ?? null,
      });
      return { thread };
    },

    async getThread(input: { scope: AiSessionScope; threadId: string }) {
      const store = getRequiredStore();
      let { session } = await getRequiredSession(input);
      if (session.created_by_user_id !== input.scope.userId) {
        throw new AiSessionError("agent_threads.notFound");
      }
      // Reconcile zombie rows: session can stay "running" after a crashed run or
      // orphaned docker teardown while agent_run is already terminal.
      if (session.status === "running") {
        const runStore = opts.getRunStore?.() ?? null;
        if (runStore) {
          const runs = await runStore.listRunsForThread({
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
            limit: 10,
          });
          const hasInFlightRun = runs.some((run) => run.status === "running");
          if (!hasInFlightRun) {
            await destroySessionLifecycleSandbox(input.threadId).catch(
              () => undefined
            );
            const updated = await store.updateThreadForUser({
              status: "completed",
              tenantId: input.scope.tenantId,
              threadId: input.threadId,
              userId: input.scope.userId,
            });
            if (updated.thread) {
              session = updated.thread;
            }
          }
        }
      }
      // Heal a wedged approval/tool interrupt: an open interrupt whose parked
      // session is gone (restart, TTL, or a resume error) can never be resumed
      // and would keep the card + tool spinner stuck. Clearing it returns the
      // thread to a usable state.
      //
      // The probe is what keeps this from eating RECOVERABLE interrupts: after a
      // restart the park is necessarily gone, but Mastra may still hold the
      // suspended snapshot, and the resume POST can continue from it. Without
      // the probe this healed away exactly the state the snapshot lane needs.
      const healedMetadata = await reconcileOrphanedInterrupt({
        metadata: session.metadata ?? {},
        probe: () => ({
          agentId: session.agent_id,
          assembleAgent: opts.assembleDynamicAgent ?? assembleDynamicAgent,
          mastra: opts.mastra,
          registry:
            opts.createRegistry?.(input.scope) ??
            opts.registry ??
            createDefaultAiRegistry(),
          tenantId: input.scope.tenantId,
          threadId: input.threadId,
          userId: input.scope.userId,
        }),
        scope: input.scope,
        store,
        threadId: input.threadId,
        userId: input.scope.userId,
      });
      if (healedMetadata) {
        session = { ...session, metadata: healedMetadata };
      }
      return { thread: session };
    },

    async updateThread(input: UpdateAiThreadInput) {
      const { session } = await getRequiredSession(input);
      if (session.created_by_user_id !== input.scope.userId) {
        throw new AiSessionError("agent_threads.notFound");
      }
      const routeContext =
        input.routeContext === undefined
          ? undefined
          : buildRouteContext({
              routeContext: {
                ...session.route_context,
                ...input.routeContext,
              },
              threadId: input.threadId,
            });
      // `metadata` (full replace) and `activeArtifactId` (single-key merge)
      // are composable: start from an explicit metadata override if given,
      // else the current row, then fold the artifact key on top so this call
      // never clobbers unrelated keys (HITL interrupt/grants included).
      const metadataWithActiveArtifact =
        input.activeArtifactId === undefined
          ? input.metadata
          : mergeActiveArtifactMetadata(input.metadata ?? session.metadata, {
              artifactId: input.activeArtifactId,
              shownAt: new Date().toISOString(),
            });
      const updated = await getRequiredStore().updateThreadForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        threadId: input.threadId,
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        ...(metadataWithActiveArtifact === undefined
          ? {}
          : { metadata: metadataWithActiveArtifact }),
        ...(routeContext === undefined ? {} : { routeContext }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.workspaceKey === undefined
          ? {}
          : { workspaceKey: input.workspaceKey }),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
      });
      if (!updated.thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      return { thread: updated.thread };
    },

    async deleteThread(input: { scope: AiSessionScope; threadId: string }) {
      const store = getRequiredStore();
      await destroySessionLifecycleSandbox(input.threadId).catch(
        () => undefined
      );
      return store.deleteThreadForUser({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      });
    },

    async deleteThreads(input: DeleteAiThreadsInput) {
      const store = getRequiredStore();
      const { threads } = await this.listThreads({
        scope: input.scope,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
      });
      await Promise.all(
        threads.map((thread) =>
          destroySessionLifecycleSandbox(thread.id).catch(() => undefined)
        )
      );
      return store.deleteThreadsForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
      });
    },

    async assertNativeMemoryAvailable(input: {
      scope: AiSessionScope;
      threadId: string;
    }) {
      await resolveAgentForSessionMemory(input);
    },

    async generate(input: {
      // Both are read below and passed through to
      // buildSessionRuntimeInstructions; they were missing from this signature
      // while callers (thread-run-routes) were already sending them.
      agentUi?: AgentUiProducerContext | null;
      authorization?: string | null;
      modelIdOverride?: string | null;
      runContext?: RunAgentInput["context"];
      runId?: string | null;
      scope: AiSessionScope;
      threadId: string;
    }) {
      const runId = input.runId ?? crypto.randomUUID();
      const {
        agent,
        agentConfig,
        modelId,
        rootConfig,
        sandboxProvider,
        subAgentSandboxProviders,
        session,
        store,
      } = await resolveAgentForSessionMemory({
        ...input,
        runId,
      });
      // Per-agent iteration cap overrides the global default (clamped to the
      // hard ceiling in the resolver).
      const agentMaxSteps = resolveAgentMaxSteps(rootConfig?.limits?.max_steps);
      const usageStore = opts.getUsageStore();
      const preflight = await checkUsageLimits({
        tenant_id: input.scope.tenantId,
        user_id: input.scope.userId,
        agent_id: session.agent_id,
        agent_budget_cost_micros:
          rootConfig?.limits?.budget?.maxCostMicrosPerPeriod ?? null,
        model_id: modelId,
        feature: "copilot",
        store: usageStore,
      });
      if (!preflight.allowed) {
        throw new AiSessionError(
          "agent_threads.usageLimitExceeded",
          "Usage limit exceeded",
          { ...formatUsageLimitError(preflight) }
        );
      }
      const rows = await store.listMessagesOrdered({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      const runtimeContextInstructions = await buildSessionRuntimeInstructions({
        agentId: session.agent_id,
        agentUi: input.agentUi,
        routeContext: session.route_context,
        runContext: input.runContext,
        scope: input.scope,
        threadId: input.threadId,
      });
      const modelMessages = buildNativeMastraModelInput({
        currentUserTurn: findCurrentUserTurn(rows),
        runtimeContextInstructions,
        threadId: input.threadId,
      });
      const runStore = opts.getRunStore?.() ?? null;
      const runTracker = runStore
        ? createSessionRunTracker({
            agentId: session.agent_id,
            createdByUserId: input.scope.userId,
            modelId,
            runId,
            runStore,
            threadId: input.threadId,
            tenantId: input.scope.tenantId,
          })
        : null;
      const invocationOptions = createEngentyAgentExecutionOptions({
        maxSteps: agentMaxSteps,
        runId,
        scope: input.scope,
        threadId: input.threadId,
      });
      try {
        // Forward agent identity so core policies see the agent, not the user.
        const coreAgentId = await resolveCoreAgentId(
          input.scope.tenantId,
          session.agent_id
        );
        const output = await engentyToolsRunAls.run(
          {
            ...(coreAgentId ? { agentId: coreAgentId } : {}),
            agentTypeKey: session.agent_id,
            goalId: input.threadId,
            orchestratorThreadId: input.threadId,
            runId,
            tenantId: input.scope.tenantId,
            accessToken: scopeAccessToken(input.scope),
            userFacingThreadId: input.threadId,
            userId: input.scope.userId,
          },
          () => agent.generate(modelMessages as never, invocationOptions)
        );
        // Mastra surfaces guardrail aborts via `output.tripwire`. Substitute a
        // generic safety message before persisting so the reason never leaks.
        const tripwire = (output as { tripwire?: { processorId?: string } })
          .tripwire;
        if (tripwire) {
          guardrailLogger.warn("Guardrail tripwire (generate)", {
            tenant_id: input.scope.tenantId,
            thread_id: input.threadId,
            run_id: runId,
            agent_id: session.agent_id,
            processor_id: tripwire.processorId ?? "unknown-processor",
          });
        }
        const text = tripwire ? GUARDRAIL_BLOCKED_REPLY_TEXT : output.text;
        const usage = await usageFromOutput(output);
        if (usage) {
          await recordAiUsage({
            tenant_id: input.scope.tenantId,
            user_id: input.scope.userId,
            thread_id: input.threadId,
            run_id: runId,
            agent_id: session.agent_id,
            feature: "copilot",
            model_id: modelId,
            usage,
            store: usageStore,
          });
        }
        const finalRows = await store.listMessagesOrdered({
          tenantId: input.scope.tenantId,
          threadId: input.threadId,
        });
        const message =
          findLastAssistantMessageRow(finalRows) ??
          ({
            author_user_id: null,
            created_at: new Date().toISOString(),
            id: crypto.randomUUID(),
            parts: [{ type: "text", text }],
            role: "assistant",
            tenant_id: input.scope.tenantId,
            thread_id: input.threadId,
          } satisfies ThreadMessageRow);
        await runTracker?.complete({
          status: "completed",
          ...readUsageTokenCounts(
            usage
              ? {
                  inputTokens: usage.input ?? undefined,
                  outputTokens: usage.output ?? undefined,
                }
              : null
          ),
          ...(tripwire
            ? {
                errorCode: GUARDRAIL_TRIPPED_ERROR_CODE,
                errorMessage: tripwire.processorId ?? "unknown-processor",
              }
            : {}),
        });
        return { message, text };
      } catch (err) {
        await runTracker?.complete({
          status: "failed",
          errorCode:
            err instanceof AiSessionError
              ? err.code
              : "agent_threads.runFailed",
          errorMessage:
            err instanceof Error ? err.message : "agent_threads.runFailed",
        });
        throw err;
      } finally {
        await destroyRunSandboxes({
          keepParentSandboxAlive: false,
          sandboxProvider,
          subAgentSandboxProviders,
        });
      }
    },

    async listMessages(input: ListAiThreadMessagesInput) {
      // Ownership check, not just tenancy. `getRequiredSession` filters on
      // tenant + thread, which leaves any authenticated member of the tenant
      // able to read a colleague's transcript from the thread id alone. Every
      // sibling here (getThread, updateThread, deleteThread, listThreads)
      // already scopes to the owner; this one did not. RLS would have caught it,
      // but the AI service connects with the service-role key and bypasses it,
      // so these filters are the whole boundary.
      const { session, store } = await getRequiredSession(input);
      if (session.created_by_user_id !== input.scope.userId) {
        throw new AiSessionError("agent_threads.notFound");
      }
      const messages = await store.listMessagesOrdered({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        limit: input.limit,
      });
      return { messages };
    },

    async listThreads(input: ListAiThreadsInput) {
      const store = getRequiredStore();
      const threads = await store.listThreadsForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
        ...(input.includeArchived ? { includeArchived: true } : {}),
        limit: input.limit,
      });
      return { threads };
    },
  };
}

export type ThreadService = ReturnType<typeof createThreadService>;
