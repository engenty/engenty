import type { Message, RunAgentInput } from "@engenty/ag-ui-bridge";
import {
  ACTIVE_ARTIFACT_METADATA_KEY,
  mergeActiveArtifactMetadata,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import type { AiEffort } from "@engenty/ai-core";
import {
  type AgentWorkspaceConfig,
  agUiMessageText,
  checkUsageLimits,
  formatUsageLimitError,
  modelIdOfRef,
  normalizeAgUiMessageForPersistence,
  recordAiUsage,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Workspace } from "@mastra/core/workspace";
import { resolveFrontendToolsForAgent } from "../../../ai/frontend-tools/catalog.js";
import { createNativeFrontendTools } from "../../../ai/frontend-tools/native-frontend-tool.js";
import { preferredSkillIdsForRun } from "../../../ai/tools/agent-hire-policy.js";
import {
  engentyToolsRunAls,
  withEnvCoreBaseUrl,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  type ThreadMessageRow,
  type ThreadRow,
  threadKind,
} from "../../dal/threads/index.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { createDefaultAiRegistry } from "../agents.js";
import { isResumeInFlight } from "../conversation/resume-claims.js";
import { turnContextFromRouteContext } from "../conversation/turn-context.js";
import { AiSessionError } from "../errors.js";
import { filterAgentUiFrontendToolsForScope } from "../frontend-tool-gating/filter-agent-ui-for-scope.js";
import {
  assertEngentyNativeMastraMemoryConfigured,
  createEngentyAgentExecutionOptions,
  createEngentyMastraResourceId,
  createEngentySessionMemoryRuntime,
  resolveSharedObservationsScope,
} from "../memory/index.js";
import {
  assembleDynamicAgent,
  type RuntimeModelConfig,
  resolveAgentModelId,
} from "../registry/index.js";
import { destroySessionLifecycleSandboxes } from "../sandbox/destroy-session-sandbox.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox/sandbox-run-teardown.js";
import { resolveTenantDefaultSpaceId } from "../work-scope/resolve-space.js";
import { resolveWorkVisibility } from "../work-scope/resolve-work-visibility.js";
import { mergeDeclaredWorkspaceMounts } from "../workspace/sandbox-mounts.js";
import {
  type DroppedWorkspaceMount,
  expandWorkspaceMounts,
  resolveEngentyMountSpecs,
} from "../workspace/workspace-presets.js";
import { buildAgentWorkspaceForRun } from "./agent-workspace-hook.js";
import { frontendToolGrantForRun } from "./frontend-tool-grant.js";
import { resolveAgentMaxSteps } from "./max-steps.js";
import {
  buildNativeMastraModelInput,
  findCurrentUserTurn,
} from "./native-mastra-input.js";
import {
  buildThreadPromptPreview,
  type ThreadPromptPreview,
} from "./prompt-preview.js";
import {
  clearOpenInterrupt,
  reconcileOrphanedInterrupt,
} from "./reconcile-orphaned-interrupt.js";
import {
  enrichToolsSpaceForAgentRun,
  type RunSpaceResolution,
  resolvedRunSpace,
  resolveRunSpace,
  toolsSpaceFromResolution,
} from "./run-space.js";
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
  spaceIdFromRouteContext,
} from "./session-identity.js";
import { canReadTask } from "./task-thread-access.js";
import {
  createScopeModuleOperationInvoker,
  extractTaskRouteFields,
  prepareTaskWorkspaceForRun,
  resolveTaskBinding,
} from "./task-workspace-hook.js";
import {
  canEnterSpaceDefault,
  requireThreadAccess,
  sharedMastraRoomFromThread,
} from "./thread-access.js";
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
import { contextPromptTokensFromOutput, usageFromOutput } from "./usage.js";
import { resolveUserDisplayNames } from "./user-display-names.js";

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

/**
 * What the workspace's skill filter lets this run open. Same policy as the
 * prompt hint in assembly (`preferredSkillIdsForRun`): the live-hire set for
 * every database-sourced agent, chief-of-staff on top when the space's
 * surface lists the agent as top-level.
 */
function preferredSkillNamesForRun(
  config:
    | { id?: string; skillIds?: readonly string[]; source?: string | null }
    | null
    | undefined,
  agentId: string,
  spaceResolution: RunSpaceResolution | undefined
): { preferredSkillNames?: string[] } {
  if (!config) {
    return {};
  }
  const runSpace = spaceResolution
    ? resolvedRunSpace(spaceResolution)
    : undefined;
  const names = preferredSkillIdsForRun(
    config,
    Boolean(runSpace?.topLevelAgentIds?.has(agentId))
  );
  return names.length > 0 ? { preferredSkillNames: names } : {};
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

  async function assertSessionAccess(input: {
    action: "read" | "write";
    scope: AiSessionScope;
    session: ThreadRow;
  }) {
    const registry = opts.createRegistry?.(input.scope) ?? opts.registry;
    await requireThreadAccess({
      action: input.action,
      ...(registry
        ? {
            getAgentConfig: (agentId: string) =>
              registry.getAgentConfig(agentId),
          }
        : {}),
      isParticipant: async () =>
        (
          await getRequiredStore().listUserParticipants({
            tenantId: input.scope.tenantId,
            threadId: input.session.id,
          })
        ).some((person) => person.user_id === input.scope.userId),
      scope: input.scope,
      session: {
        agent_id: input.session.agent_id,
        created_by_user_id: input.session.created_by_user_id,
        route_context: input.session.route_context ?? {},
        space_id: input.session.space_id,
        visibility: input.session.visibility ?? null,
      },
    });
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
    let droppedMounts: DroppedWorkspaceMount[] = [];
    const subAgentSandboxProviders: EngentySandboxProvider[] = [];
    const subAgentWorkspacesMap = new Map<string, Workspace>();
    // The run's space, resolved ONCE and validated against the caller's access
    // (PLAN-spaces.md Phase C3a). Everything downstream — the workspace root,
    // the tool catalog, the execute gate, the runtime prompt — reads this one
    // answer, so they cannot disagree about which space the run is in.
    const spaceResolution = await resolveRunSpace({
      scope: input.scope,
      thread: session,
      threadId: input.threadId,
      ...(input.runId ? { runId: input.runId } : {}),
    });
    // Copilot outside `/s/…` stays `{kind:"global"}`. Connector reach is the
    // agent's grants plus all-spaces accounts (see enrichToolsSpaceForAgentRun),
    // not a silent fallback to Company or the personal space.
    if (input.runId) {
      await ensureAgentRunStarted(opts.getRunStore?.() ?? null, {
        id: input.runId,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        agentId: session.agent_id,
        modelId: null,
        createdByUserId: input.scope.userId,
        trigger: "message",
      });
      const workspaceResult = await resolveWorkspaceForRun({
        agentId: session.agent_id,
        runId: input.runId,
        scope: input.scope,
        session,
        threadId: input.threadId,
        skipCheckout: input.skipTaskCheckout === true,
        workspaceConfig: rootConfig?.workspace,
        spaceResolution,
        ...preferredSkillNamesForRun(
          rootConfig,
          session.agent_id,
          spaceResolution
        ),
      });
      taskWorkspace = workspaceResult?.workspace;
      sandboxProvider = workspaceResult?.sandboxProvider;
      droppedMounts = workspaceResult?.droppedMounts ?? [];

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
            spaceResolution,
            ...preferredSkillNamesForRun(subConfig, subConfig.id, undefined),
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
    // The bare id, not the ref: this value is only ever used for accounting and
    // display — the usage preflight, the usage row, the run tracker and the
    // prompt preview — all of which key off the catalog's `model_id`. The
    // gateway half has already done its job inside `resolveAgentModel`.
    const modelId = modelIdOfRef(
      rootConfig
        ? resolveAgentModelId(rootConfig, modelConfig)
        : modelConfig.chatModelId
    );
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
    // An Engenty holds the page tools when its row says so, or by default when
    // it is the Space's coordinator — only on this browser-started run.
    const frontendToolGrant = frontendToolGrantForRun({
      agentId: session.agent_id,
      config: rootConfig,
      spaceResolution,
    });
    const mergedDefinitions = resolveFrontendToolsForAgent({
      agentId: session.agent_id,
      clientTools: gatedAgentUi?.frontend_tools,
      grant: frontendToolGrant,
    });
    const nativeFrontendTools = createNativeFrontendTools(mergedDefinitions);
    const toolsSpace = await enrichToolsSpaceForAgentRun({
      agentId: session.agent_id,
      preferredConnectorIds: rootConfig?.connectorIds ?? [],
      scope: input.scope,
      space: toolsSpaceFromResolution(spaceResolution),
    });
    const assembleOptions = {
      extraTools: nativeFrontendTools,
      mastra: opts.mastra,
      modelConfig,
      space: toolsSpace,
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
    const sharedRoom = sharedMastraRoomFromThread({
      agentId: session.agent_id,
      agentScope: rootConfig?.agentScope,
      thread: session,
    });
    const memoryRuntime = createEngentySessionMemoryRuntime({
      agentId: session.agent_id,
      ...(rootConfig?.name ? { agentName: rootConfig.name } : {}),
      observationalModelId: modelConfig.memoryModelId,
      scope: input.scope,
      sharedObservations: rootConfig
        ? resolveSharedObservationsScope(rootConfig)
        : "disabled",
      sharedRoom,
      spaceId: session.space_id,
      threadId: input.threadId,
      store,
      turnContext: turnContextFromRouteContext(session.route_context),
    });
    const agent = await (opts.assembleDynamicAgent ?? assembleDynamicAgent)(
      registry,
      session.agent_id,
      {
        ...assembleOptions,
        extraTools: {
          ...assembleOptions.extraTools,
          ...memoryRuntime.memoryTools,
        },
        instructionExtras,
        memory: memoryRuntime.memory,
        memoryProcessors: memoryRuntime.memoryProcessors,
        ...(sharedRoom ? { sharedRoom: true } : {}),
      }
    );
    await assertEngentyNativeMastraMemoryConfigured(agent, {
      agent_id: session.agent_id,
      thread_id: input.threadId,
    });
    return {
      agent,
      agentConfig: rootConfig,
      droppedMounts,
      mergedDefinitions,
      modelId,
      rootConfig,
      spaceResolution,
      sandboxProvider,
      subAgentSandboxProviders,
      session,
      store,
      toolsSpace,
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
    preferredSkillNames?: readonly string[];
    runId: string;
    scope: AiSessionScope;
    /** The run's Space resolution — unresolved must not fall back to tenant-global `/data`. */
    spaceResolution?: RunSpaceResolution;
    session: Awaited<ReturnType<typeof getRequiredSession>>["session"];
    threadId: string;
    skipCheckout: boolean;
    workspaceConfig?: AgentWorkspaceConfig;
  }): Promise<
    | {
        /** Declared mounts this run does not have, and why — for the prompt. */
        droppedMounts: DroppedWorkspaceMount[];
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

    // Containment chain (the project) above the bound task, from the ONE
    // containment resolver (work-scope/). Resolved only when the mount table
    // declares a containment mount AND a task actually bound — an unlinked
    // chat run simply has no `/project` (requireBinding drop).
    let projectId: string | undefined;
    // The space roots every work mount (PLAN-spaces.md Phase 2), so it is
    // resolved for EVERY run — not only the ones that declared a containment
    // mount. A `/task` checkout with no space would have no path at all.
    //
    // The run's OWN space first (Phase C3a): a chat opened in Marketing must
    // put its files under Marketing, not under whichever space happens to be
    // the tenant default. The default survives only as the fallback for a
    // GLOBAL run (no Space claimed). An unresolved claim must not fall back
    // — that would turn a failed Space into tenant-wide `/data`.
    const spaceResolution = input.spaceResolution ?? { kind: "global" };
    const runSpace = resolvedRunSpace(spaceResolution);
    let spaceId: string | undefined;
    if (spaceResolution.kind === "unresolved") {
      spaceId = undefined;
    } else if (runSpace) {
      spaceId = runSpace.spaceId;
    } else {
      spaceId =
        (await resolveTenantDefaultSpaceId(input.scope.tenantId)) ?? undefined;
    }
    const wantsContainment = declaredMounts.some(
      (mount) => mount.source === "project"
    );
    if (wantsContainment && (boundTaskId || taskIdentifier)) {
      const visibility = await resolveWorkVisibility(
        {
          invoke: createScopeModuleOperationInvoker(input.scope),
          spaceId: spaceId ?? null,
          tenantId: input.scope.tenantId,
        },
        { taskId: boundTaskId, taskIdentifier }
      );
      projectId = visibility.chain.find((node) => node.tier === "project")?.id;
      // The bound WORK's own space still wins — most-specific row, the same
      // rule the chain resolver follows. The chat's space says where the
      // conversation lives; the task says where the work lives, and a task
      // does not move because someone opened it from another space.
      //
      // The two disagreeing is not an error to fail on, but it is a fact worth
      // seeing: it means a chat in one space is checking out work from
      // another, which is either a legitimate cross-space hand-off or a
      // containment bug, and neither is diagnosable from silence.
      if (
        visibility.spaceId &&
        runSpace &&
        visibility.spaceId !== runSpace.spaceId
      ) {
        workspaceLogger.warn("run_space_task_space_mismatch", {
          agent_id: input.agentId,
          run_id: input.runId,
          task_id: boundTaskId ?? null,
          task_space_id: visibility.spaceId,
          tenant_id: input.scope.tenantId,
          thread_space_id: runSpace.spaceId,
        });
      }
      if (spaceResolution.kind !== "unresolved") {
        spaceId = visibility.spaceId ?? spaceId;
      }
    }

    const { specs: mountSpecs, dropped: droppedMounts } =
      resolveEngentyMountSpecs(declaredMounts, {
        agentId: input.agentId,
        runId: input.runId,
        sandboxLifecycle: workspaceConfig.sandbox?.lifecycle ?? "run",
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
        userId: input.scope.userId,
        ...(taskIdentifier ? { taskIdentifier } : {}),
        ...(projectId ? { projectId } : {}),
        ...(spaceId ? { spaceId } : {}),
      });
    // Every drop is named, one line each. A Space-rooted mount that fell away
    // (`/data`, `/space`) is the case people report as "the agent has no
    // access to files" — that one is a warning. A binding drop (`/task` on a
    // chat with no task) is the ordinary shape of a run and stays at debug.
    for (const mount of droppedMounts) {
      const fields = {
        agent_id: input.agentId,
        mount_path: mount.path,
        reason: mount.reason,
        run_id: input.runId,
        space_resolution: spaceResolution.kind,
        tenant_id: input.scope.tenantId,
      };
      if (mount.reason === "no_space") {
        workspaceLogger.warn("workspace_mount_dropped", fields);
      } else {
        workspaceLogger.debug("workspace_mount_dropped", fields);
      }
    }
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

    const built = await buildAgentWorkspaceForRun({
      agentId: input.agentId,
      mounts: mountSpecs,
      runId: input.runId,
      scope: input.scope,
      spaceResolution,
      threadId: input.threadId,
      workspaceConfig,
      ...(input.preferredSkillNames?.length
        ? { preferredSkillNames: input.preferredSkillNames }
        : {}),
      ...(taskIdentifier ? { taskIdentifier } : {}),
    });
    return { ...built, droppedMounts };
  }

  async function spaceResolutionForSessionWorkspace(input: {
    runId: string;
    scope: AiSessionScope;
    session: ThreadRow;
    spaceResolution?: RunSpaceResolution;
    threadId: string;
  }): Promise<RunSpaceResolution> {
    if (input.spaceResolution) {
      return input.spaceResolution;
    }
    // Same thread row the run already validated — never a client space_id.
    return resolveRunSpace({
      runId: input.runId,
      scope: input.scope,
      thread: input.session,
      threadId: input.threadId,
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
      /** Validated run Space — when omitted, resolved from the thread session. */
      spaceResolution?: RunSpaceResolution;
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
      const spaceResolution = await spaceResolutionForSessionWorkspace(input);
      return resolveWorkspaceForRun({
        agentId: input.agentId,
        runId: input.runId,
        scope: input.scope,
        session: input.session,
        skipCheckout: true,
        spaceResolution,
        threadId: input.threadId,
        workspaceConfig: config.workspace,
        ...preferredSkillNamesForRun(config, input.agentId, spaceResolution),
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
      /** Validated run Space — when omitted, resolved from the thread session. */
      spaceResolution?: RunSpaceResolution;
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
      const spaceResolution = await spaceResolutionForSessionWorkspace(input);
      const rootResult = await resolveWorkspaceForRun({
        agentId: input.session.agent_id,
        runId: input.runId,
        scope: input.scope,
        session: input.session,
        threadId: input.threadId,
        skipCheckout: true,
        spaceResolution,
        workspaceConfig: rootConfig?.workspace,
        ...preferredSkillNamesForRun(
          rootConfig,
          input.session.agent_id,
          spaceResolution
        ),
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
      // Bare id — see the note on the other resolution site: accounting only.
      const modelId = modelIdOfRef(
        rootConfig
          ? resolveAgentModelId(rootConfig, modelConfig)
          : modelConfig.chatModelId
      );
      return {
        agentBudgetCostMicros:
          rootConfig?.limits?.budget?.maxCostMicrosPerPeriod ?? null,
        modelConfig,
        modelId,
      };
    },

    async appendMessage(input: AppendAiThreadMessageInput) {
      const { session, store } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "write",
        scope: input.scope,
        session,
      });
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
      const mergedRouteContext = {
        ...(existing?.route_context ?? {}),
        ...(input.routeContext ?? {}),
      };
      const { thread } = await store.upsertThread({
        id: threadId,
        tenantId: input.scope.tenantId,
        agentId: input.agentId,
        createdByUserId: input.scope.userId,
        routeContext: buildRouteContext({
          routeContext: mergedRouteContext,
          sessionKey: input.sessionKey,
          threadId,
        }),
        // Explicit input wins; otherwise read the space off the route context
        // the client already sends (PLAN-spaces.md Phase C2). Reading the
        // MERGED context, not `input.routeContext`, so a re-save that omits the
        // scope keeps the space the thread was created in — combined with the
        // RPC's coalesce, an idempotent save cannot silently unspace a chat.
        spaceId: input.spaceId ?? spaceIdFromRouteContext(mergedRouteContext),
        status: input.status ?? existing?.status ?? "idle",
        summary: input.summary ?? existing?.summary ?? null,
        title: input.title ?? existing?.title ?? null,
        workspaceKey: input.workspaceKey ?? existing?.workspace_key ?? null,
        // This route carries no metadata of its own, and the RPC REPLACES the
        // column — so a re-create of an existing thread (the client owns the
        // id, and re-POSTs it on a retry or a second window) wiped everything
        // in it: Mastra's working-memory pointers, the observational cursor,
        // the HITL keys. Every sibling above already reads through `existing`
        // for exactly this reason; metadata was the one that did not.
        ...(existing?.metadata ? { metadata: existing.metadata } : {}),
      });
      return { thread };
    },

    /**
     * Where the observer has folded this thread into memory — read-only, for
     * the transcript's "remembered up to here" line. Access is the thread's.
     */
    async getMemoryObservations(input: {
      scope: AiSessionScope;
      threadId: string;
    }) {
      const store = getRequiredStore();
      const { session } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "read",
        scope: input.scope,
        session,
      });
      const memory = await store.getThreadObservationalMemory({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      if (
        !memory ||
        memory.observed_message_ids.length > 0 ||
        !memory.last_observed_at
      ) {
        return memory;
      }
      // Mastra keeps `observedMessageIds` only as a re-observation guard and
      // leaves it empty in practice; its real cursor is `lastObservedAt`.
      // Everything written up to then has been folded into observations.
      const observed = await store.listMessagesOrdered({
        before: new Date(memory.last_observed_at),
        limit: false,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      return {
        ...memory,
        observed_message_ids: observed.map((row) => row.id),
      };
    },

    async getThread(input: { scope: AiSessionScope; threadId: string }) {
      const store = getRequiredStore();
      let { session } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "read",
        scope: input.scope,
        session,
      });
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
            await destroySessionLifecycleSandboxes(input.threadId).catch(
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

    /**
     * The card's ✕: close the open interrupt without answering it. The parked
     * run stays parked and is superseded by the next user turn — the same end
     * state the orphan heal on thread load produces, reached on the user's
     * say-so instead of after a restart.
     *
     * `interruptId` pins the dismissal to the card the user saw: a stale card
     * (the run already moved on to the next approval) must not close the one
     * that is really open. A dismiss while a resume is mid-flight is refused
     * for the same reason a second answer is — both would settle one step.
     */
    async dismissInterrupt(input: {
      interruptId?: string | null;
      scope: AiSessionScope;
      threadId: string;
    }) {
      const { session, store } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "write",
        scope: input.scope,
        session,
      });
      const open = readAgUiOpenInterrupt(session.metadata ?? {});
      if (!open) {
        return { dismissed: false, thread: session };
      }
      if (
        input.interruptId &&
        input.interruptId !== open.interrupt_id &&
        input.interruptId !== open.artifact_id
      ) {
        throw new AiSessionError(
          "agent_threads.interruptMismatch",
          "The dismissed interrupt is no longer the open one; reload the pending card.",
          { open_interrupt_id: open.interrupt_id }
        );
      }
      if (open.run_id && isResumeInFlight(open.run_id)) {
        throw new AiSessionError(
          "agent_threads.resumeInProgress",
          "A resume for this interrupt is already in progress; wait for it to finish."
        );
      }
      const metadata = await clearOpenInterrupt({
        metadata: session.metadata ?? {},
        open,
        scope: input.scope,
        store,
        threadId: input.threadId,
        userId: input.scope.userId,
      });
      return {
        dismissed: metadata != null,
        thread: metadata ? { ...session, metadata } : session,
      };
    },

    async updateThread(input: UpdateAiThreadInput) {
      const { session } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "write",
        scope: input.scope,
        session,
      });
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
      // Artifact-only update: fold the key in the DATABASE, against the row as
      // it is at write time. Doing it here would mean merging onto `session`,
      // read at the top of this function — and every metadata write that
      // commits in the gap (Mastra's own metadata.mastra state-signal
      // tracking, the HITL interrupt, approval grants) would be reverted.
      // Lost update, not a merge. See migration
      // 20260807090000_ai_thread_metadata_atomic_merge.sql.
      if (
        input.activeArtifactId !== undefined &&
        input.metadata === undefined
      ) {
        const merged = await getRequiredStore().mergeThreadMetadataForUser({
          tenantId: input.scope.tenantId,
          threadId: input.threadId,
          userId: input.scope.userId,
          ...(input.activeArtifactId === null
            ? { removeKeys: [ACTIVE_ARTIFACT_METADATA_KEY] }
            : {
                patch: {
                  [ACTIVE_ARTIFACT_METADATA_KEY]: {
                    artifact_id: input.activeArtifactId,
                    shown_at: new Date().toISOString(),
                  },
                },
              }),
        });
        if (!merged.thread) {
          throw new AiSessionError("agent_threads.notFound");
        }
        // Only metadata was requested — nothing else to write.
        if (
          input.agentId === undefined &&
          routeContext === undefined &&
          input.status === undefined &&
          input.summary === undefined &&
          input.title === undefined &&
          input.workspaceKey === undefined &&
          input.archived === undefined
        ) {
          return { thread: merged.thread };
        }
      }
      // An explicit `metadata` is a deliberate full replace; the artifact key
      // rides along on top of what the caller supplied.
      const metadataWithActiveArtifact =
        input.activeArtifactId === undefined || input.metadata === undefined
          ? input.metadata
          : mergeActiveArtifactMetadata(input.metadata, {
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
      await destroySessionLifecycleSandboxes(input.threadId).catch(
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
          destroySessionLifecycleSandboxes(thread.id).catch(() => undefined)
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

    /**
     * Break down the prompt a NEXT run on this thread would send (developer
     * inspection behind `/ai/v1/threads/:id/prompt-preview`).
     *
     * Assembled WITHOUT a `runId` on purpose. A run id is what makes
     * `resolveAgentForSessionMemory` write an `ai.agent_run` row and provision
     * workspaces and sandboxes — side effects a GET that only reads sizes has no
     * business causing. The cost is that workspace-provided tools (skill search,
     * file access) are absent from the tool section, which is why that goes out
     * as a caveat instead of quietly shrinking the total.
     */
    async getThreadPromptPreview(input: {
      scope: AiSessionScope;
      threadId: string;
    }): Promise<ThreadPromptPreview> {
      const { session: accessSession } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "read",
        scope: input.scope,
        session: accessSession,
      });
      const { agent, modelId, rootConfig, session } =
        await resolveAgentForSessionMemory(input);
      const memory = await assertEngentyNativeMastraMemoryConfigured(agent, {
        agent_id: session.agent_id,
        thread_id: input.threadId,
      });
      const caveats = [
        "Reconstructed for the NEXT run on this thread — not a capture of the last one, so it will not match that run's recorded prompt tokens.",
        "Token figures are estimated from character counts; the real count is the provider's and only lands on the run row afterwards.",
        "Assembled without a run id, so no workspace is attached and workspace tools (skills, files) are missing from the tool list.",
        "Mastra adds its own working-memory block and per-step framing to the system prompt at request time; that is not included here.",
      ];
      if (rootConfig?.subAgents?.length) {
        // The `agent-*` tools ARE in the list, but they got there via Mastra's
        // own sub-agent mechanism; a real run turns that off (`skipSubAgents`)
        // and registers its own delegation tools instead. Same names, so the
        // section is not missing weight — the schemas can differ slightly.
        caveats.push(
          "Sub-agent `agent-*` delegation tools come from the static sub-agent config here; a real run registers its own equivalents, so their schemas may differ slightly."
        );
      }
      return buildThreadPromptPreview({
        agent,
        agentId: session.agent_id,
        caveats,
        memory,
        modelId,
        resourceId: createEngentyMastraResourceId({
          scope: input.scope,
          sharedRoom: sharedMastraRoomFromThread({
            agentId: session.agent_id,
            agentScope: rootConfig?.agentScope,
            thread: session,
          }),
          spaceId: session.space_id,
          threadId: input.threadId,
        }),
        threadId: input.threadId,
      });
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
      const { session: accessSession } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "write",
        scope: input.scope,
        session: accessSession,
      });
      const runId = input.runId ?? crypto.randomUUID();
      const {
        agent,
        agentConfig,
        droppedMounts,
        modelId,
        rootConfig,
        spaceResolution,
        sandboxProvider,
        subAgentSandboxProviders,
        session,
        store,
        toolsSpace,
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
        droppedMounts,
        frontendToolGrant: frontendToolGrantForRun({
          agentId: session.agent_id,
          config: rootConfig,
          spaceResolution,
        }),
        routeContext: session.route_context,
        runContext: input.runContext,
        scope: input.scope,
        spaceResolution,
        threadId: input.threadId,
        threadKind: threadKind(session),
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
            // The interactive lane: a person is at the keyboard.
            trigger: "message",
          })
        : null;
      const invocationOptions = createEngentyAgentExecutionOptions({
        maxSteps: agentMaxSteps,
        runId,
        scope: input.scope,
        sharedRoom: sharedMastraRoomFromThread({
          agentId: session.agent_id,
          agentScope: rootConfig?.agentScope,
          thread: session,
        }),
        spaceId: session.space_id,
        threadId: input.threadId,
      });
      try {
        // Forward agent identity so core policies see the agent, not the user.
        const coreAgentId = await resolveCoreAgentId(
          input.scope.tenantId,
          session.agent_id
        );
        const output = await engentyToolsRunAls.run(
          withEnvCoreBaseUrl({
            ...(coreAgentId ? { agentId: coreAgentId } : {}),
            agentTypeKey: session.agent_id,
            goalId: input.threadId,
            orchestratorThreadId: input.threadId,
            runId,
            tenantId: input.scope.tenantId,
            accessToken: scopeAccessToken(input.scope),
            userFacingThreadId: input.threadId,
            userId: input.scope.userId,
            // What this space mounts, already validated (Phase C3a). The
            // catalog tools hide what is not here and `engenty_tool_execute`
            // refuses it. Unresolved is a refusal, not absence; null is
            // intentional tenant-global.
            space: toolsSpace,
          }),
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
          contextPromptTokens: await contextPromptTokensFromOutput(output),
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
      const { session, store } = await getRequiredSession(input);
      await assertSessionAccess({
        action: "read",
        scope: input.scope,
        session,
      });
      // One row past the page tells whether an older page exists without a
      // count query; it is dropped from the oldest end before the reply.
      const rows = await store.listMessagesOrdered({
        ...(input.before
          ? { before: input.before.createdAt, beforeId: input.before.id }
          : {}),
        latest: true,
        limit: input.limit + 1,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      const hasMore = rows.length > input.limit;
      const messages = hasMore ? rows.slice(rows.length - input.limit) : rows;
      const authorIds = messages
        .map((message) => message.author_user_id)
        .filter((id): id is string => Boolean(id));
      const names = await resolveUserDisplayNames(authorIds);
      // An assistant row names the agent that wrote it (rooms have several);
      // a name the reader can show comes from the registry, once per agent.
      const agentIds = [
        ...new Set(
          messages
            .map((message) => message.metadata?.author_agent_id)
            .filter((id): id is string => typeof id === "string" && id !== "")
        ),
      ];
      const agentNames = new Map<string, string>();
      if (agentIds.length > 0) {
        const registry = opts.createRegistry?.(input.scope) ?? opts.registry;
        await Promise.all(
          agentIds.map(async (agentId) => {
            const config = await registry?.getAgentConfig(agentId);
            if (config?.name) {
              agentNames.set(agentId, config.name);
            }
          })
        );
      }
      return {
        has_more: hasMore,
        messages: messages.map((message) => {
          const agentId = message.metadata?.author_agent_id;
          return {
            ...message,
            author_name: message.author_user_id
              ? (names.get(message.author_user_id) ?? null)
              : typeof agentId === "string"
                ? (agentNames.get(agentId) ?? agentId)
                : null,
          };
        }),
      };
    },

    /**
     * The agent threads a task has been worked on, for the task page.
     *
     * Gated on the caller's right to read the TASK, not on thread ownership —
     * these threads have no owner and no participants, so every ownership check
     * in this file answers "no" for them. Same rule `listMessages` already uses
     * to let a task's watchers open a run transcript.
     */
    async listTaskThreads(input: {
      limit?: number;
      scope: AiSessionScope;
      taskId: string;
    }) {
      const store = getRequiredStore();
      if (!(await canReadTask({ scope: input.scope, taskId: input.taskId }))) {
        return { threads: [] };
      }
      const threads = await store.listHeadlessThreadsForTask({
        taskId: input.taskId,
        tenantId: input.scope.tenantId,
        ...(input.limit ? { limit: input.limit } : {}),
      });
      return { threads };
    },

    async listThreads(input: ListAiThreadsInput) {
      const store = getRequiredStore();
      const agentId = input.agentId?.trim();
      const spaceId = input.spaceId?.trim();
      if (agentId && spaceId) {
        const registry = opts.createRegistry?.(input.scope) ?? opts.registry;
        const config = await registry?.getAgentConfig(agentId);
        if (config?.agentScope === "shared") {
          if (!(await canEnterSpaceDefault(input.scope, spaceId))) {
            return { threads: [] };
          }
          const threads = await store.listThreadsForSpaceAgent({
            agentId,
            spaceId,
            tenantId: input.scope.tenantId,
            viewerUserId: input.scope.userId,
            ...(input.includeArchived ? { includeArchived: true } : {}),
            ...(input.limit ? { limit: input.limit } : {}),
          });
          return { threads };
        }
      }
      const threads = await store.listThreadsForUser({
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.hostKey ? { hostKey: input.hostKey } : {}),
        ...(input.includeArchived ? { includeArchived: true } : {}),
        ...(input.spaceId ? { spaceId: input.spaceId } : {}),
        limit: input.limit,
      });
      // A specialist's desk also shows what it did on its own. Routine fires
      // are unattended, so they belong to no user's thread list — without this
      // a routine could run every night and its desk would stay empty.
      if (!(agentId && spaceId)) {
        return { threads };
      }
      if (!(await canEnterSpaceDefault(input.scope, spaceId))) {
        return { threads };
      }
      const runThreads = await store.listRunThreadsForSpaceAgent({
        agentId,
        spaceId,
        tenantId: input.scope.tenantId,
        ...(input.limit ? { limit: input.limit } : {}),
      });
      const seen = new Set(threads.map((thread) => thread.id));
      return {
        threads: [
          ...threads,
          ...runThreads.filter((thread) => !seen.has(thread.id)),
        ].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
      };
    },
  };
}

export type ThreadService = ReturnType<typeof createThreadService>;
