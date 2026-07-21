import type { Message } from "@engenty/ag-ui-bridge";
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
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
} from "../../dal/agent-sessions/index.js";
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
  ensureAgentSessionRunStarted,
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
  AppendAiSessionMessageInput,
  CreateAiSessionInput,
  DeleteAiSessionsInput,
  ListAiSessionMessagesInput,
  ListAiSessionsInput,
  SessionServiceOptions,
  UpdateAiSessionInput,
} from "./types.js";
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
  rows: readonly AgentSessionMessageRow[]
): AgentSessionMessageRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === "assistant") {
      return row;
    }
  }
  return null;
}

export function createSessionService(opts: SessionServiceOptions) {
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
    const session = await store.getSession({
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
      await ensureAgentSessionRunStarted(opts.getRunStore?.() ?? null, {
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
      userAccessToken:
        input.scope.userAccessToken ??
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
      ...(taskWorkspace ? { workspace: taskWorkspace } : {}),
      ...(subAgentWorkspaces ? { subAgentWorkspaces } : {}),
    };
    const memoryRuntime = createEngentySessionMemoryRuntime({
      agentId: session.agent_id,
      scope: input.scope,
      threadId: input.threadId,
      store,
    });
    const agent = await (opts.assembleDynamicAgent ?? assembleDynamicAgent)(
      registry,
      session.agent_id,
      { ...assembleOptions, memory: memoryRuntime.memory }
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
    if (wantsTask) {
      const { taskId } = extractTaskRouteFields(input.session.route_context);
      const binding = resolveTaskBinding({
        routeContext: input.session.route_context,
        workspaceKey: input.session.workspace_key,
      });
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
              await getRequiredStore().updateSessionForUser({
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
        }
      }
    }

    const mountSpecs = buildEngentyMountSpecs(declaredMounts, {
      agentId: input.agentId,
      runId: input.runId,
      sandboxLifecycle: workspaceConfig.sandbox?.lifecycle ?? "run",
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
      ...(taskIdentifier ? { taskIdentifier } : {}),
    });
    if (mountSpecs.length === 0) {
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
      session: AgentSessionRow;
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
      session: AgentSessionRow;
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
      modelIdOverride?: string | null;
      scope: AiSessionScope;
    }): Promise<{ modelConfig: RuntimeModelConfig; modelId: string }> {
      const modelConfig = await resolveRuntimeModelConfig(
        opts,
        input.scope,
        input.modelIdOverride
      );
      const registry =
        opts.createRegistry?.(input.scope) ??
        opts.registry ??
        createDefaultAiRegistry();
      const rootConfig = await registry.getAgentConfig(input.agentId);
      const modelId = rootConfig
        ? resolveAgentModelId(rootConfig, modelConfig)
        : modelConfig.chatModelId;
      return { modelConfig, modelId };
    },

    async appendMessage(input: AppendAiSessionMessageInput) {
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

    async createSession(input: CreateAiSessionInput) {
      const store = getRequiredStore();
      const id = resolveRequestedSessionId(input);
      if (input.threadId && !id) {
        throw new AiSessionError("agent_threads.notFound");
      }
      const existing = id
        ? await store.getSession({
            tenantId: input.scope.tenantId,
            threadId: id,
          })
        : null;
      const threadId = id ?? crypto.randomUUID();
      return store.upsertSession({
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
    },

    async getSession(input: { scope: AiSessionScope; threadId: string }) {
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
          const runs = await runStore.listRunsForSession({
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
            limit: 10,
          });
          const hasInFlightRun = runs.some((run) => run.status === "running");
          if (!hasInFlightRun) {
            await destroySessionLifecycleSandbox(input.threadId).catch(
              () => undefined
            );
            const updated = await store.updateSessionForUser({
              status: "completed",
              tenantId: input.scope.tenantId,
              threadId: input.threadId,
              userId: input.scope.userId,
            });
            if (updated.session) {
              session = updated.session;
            }
          }
        }
      }
      // Heal a wedged approval/tool interrupt: an open interrupt whose parked
      // session is gone (restart, TTL, or a resume error) can never be resumed
      // and would keep the card + tool spinner stuck. Clearing it returns the
      // thread to a usable state.
      const healedMetadata = await reconcileOrphanedInterrupt({
        metadata: session.metadata ?? {},
        scope: input.scope,
        store,
        threadId: input.threadId,
        userId: input.scope.userId,
      });
      if (healedMetadata) {
        session = { ...session, metadata: healedMetadata };
      }
      return { session };
    },

    async updateSession(input: UpdateAiSessionInput) {
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
      const updated = await getRequiredStore().updateSessionForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        threadId: input.threadId,
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(routeContext === undefined ? {} : { routeContext }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.workspaceKey === undefined
          ? {}
          : { workspaceKey: input.workspaceKey }),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
      });
      if (!updated.session) {
        throw new AiSessionError("agent_threads.notFound");
      }
      return updated;
    },

    async deleteSession(input: { scope: AiSessionScope; threadId: string }) {
      const store = getRequiredStore();
      await destroySessionLifecycleSandbox(input.threadId).catch(
        () => undefined
      );
      return store.deleteSessionForUser({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
      });
    },

    async deleteSessions(input: DeleteAiSessionsInput) {
      const store = getRequiredStore();
      const { sessions } = await this.listSessions({
        scope: input.scope,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
      });
      await Promise.all(
        sessions.map((session) =>
          destroySessionLifecycleSandbox(session.id).catch(() => undefined)
        )
      );
      return store.deleteSessionsForUser({
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
      authorization?: string | null;
      modelIdOverride?: string | null;
      runId?: string | null;
      scope: AiSessionScope;
      threadId: string;
    }) {
      const runId = input.runId ?? crypto.randomUUID();
      const {
        agent,
        agentConfig,
        modelId,
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
      const agentMaxSteps = resolveAgentMaxSteps(agentConfig.limits?.max_steps);
      const usageStore = opts.getUsageStore();
      const preflight = await checkUsageLimits({
        tenant_id: input.scope.tenantId,
        user_id: input.scope.userId,
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
            userAccessToken: input.scope.userAccessToken,
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
          } satisfies AgentSessionMessageRow);
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

    async listMessages(input: ListAiSessionMessagesInput) {
      const { store } = await getRequiredSession(input);
      const messages = await store.listMessagesOrdered({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        limit: input.limit,
      });
      return { messages };
    },

    async listSessions(input: ListAiSessionsInput) {
      const store = getRequiredStore();
      const sessions = await store.listSessionsForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
        ...(input.includeArchived ? { includeArchived: true } : {}),
        limit: input.limit,
      });
      return { sessions };
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
