import {
  type AgentResolveContext,
  type AiEffort,
  agentDefaultEffort,
  isModelAllowed,
  type ModelAllowList,
  renderedToolsOf,
  resolveChatModelId,
  resolvePurposeModelId,
} from "@engenty/ai-core";
import {
  buildEngentyCopilotInstructions,
  ENGENTY_COPILOT_AGENT_ID,
} from "@engenty/engenty-copilot/ai";
import { Agent, type SubAgent, type ToolsInput } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Mastra } from "@mastra/core/mastra";
import type { MastraMemory } from "@mastra/core/memory";
import {
  type InputProcessorOrWorkflow,
  type OutputProcessorOrWorkflow,
  PrefillErrorHandler,
  type Processor,
  TokenLimiterProcessor,
  ToolCallFilter,
} from "@mastra/core/processors";
import type { Workspace } from "@mastra/core/workspace";
import {
  agentCarriesCatalogFloor,
  effectiveToolGating,
  preferredSkillIdsForRun,
  withCatalogFloor,
  withTopLevelHireTools,
} from "../../../ai/tools/agent-hire-policy.js";
import { createArtifactTools } from "../../../ai/tools/artifact-tools.js";
import {
  engentyCodeModeInstructions,
  engentyCodeModeTool,
} from "../../../ai/tools/engenty-tools/code-mode.js";
import { ENGENTY_TOOL_EXECUTE_TOOL_ID } from "../../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import {
  ENGENTY_TOOLS_PREAPPROVE_TOOL_ID,
  engentyToolsPreapproveTool,
} from "../../../ai/tools/engenty-tools/engenty-tools-preapprove-tool.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  isToolVisibleInSpace,
  isUnresolvedSpaceGate,
  type SpaceGateContext,
} from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { createShowObjectsTool } from "../../../ai/tools/show-objects-tool.js";
import { createShowUiTool } from "../../../ai/tools/show-ui-tool.js";
import { createShowWidgetTool } from "../../../ai/tools/show-widget-tool.js";
import { workspaceTransferTools } from "../../../ai/tools/workspace-move/index.js";
import { resolveMastraModel } from "../../model-gateways/resolve-language-model.js";
import { AiSessionError } from "../errors.js";
import { REPLY_STYLE_INSTRUCTIONS } from "../instructions/reply-style.js";
import { specialistInstructionsForRun } from "../instructions/specialist-instructions.js";
import { AGENT_MEMORY_INSTRUCTIONS } from "../memory/agent-memory.js";
import { AGENT_TASKS_INSTRUCTIONS } from "../memory/agent-tasks.js";
import { nativeModuleToolMeta } from "../native-module-tool-meta.js";
import { createRuntimeContextProcessor } from "../sessions/runtime-context-processor.js";
import { SHARED_ROOM_INSTRUCTIONS } from "../sessions/speaker-turn-processor.js";
import { buildGuardrailProcessors } from "./build-guardrail-processors.js";
import {
  type ContextTokensResolver,
  estimateToolBlockTokens,
  historyTokenLimit,
} from "./history-token-budget.js";
import {
  createSkillGatedToolsProcessor,
  SKILL_GATED_TOOLS_INSTRUCTIONS,
} from "./skill-gated-tools-processor.js";
import { createStreamErrorRetryProcessor } from "./stream-error-retry.js";
import type { AgentConfig, AiRegistry, MastraToolDefinition } from "./types.js";

/**
 * No LLM-callable tool of ours is background-eligible: the one background task
 * we run (`engenty.task-job`) is enqueued programmatically by the dispatch
 * path, never chosen by a model. Mastra nonetheless splices its `_background`
 * override into EVERY tool schema whenever the manager is enabled instance-wide
 * — 1.9 KB per tool, measured at 115 KB across 59 tools, 39% of a copilot
 * prompt. Opting out per agent is what `disabled` is for, and our patched core
 * makes the schema half honour it (upstream, only the system-prompt half does).
 * An agent that genuinely wants background tool calls sets its own
 * `backgroundTasks` in config and keeps the field.
 */
const BACKGROUND_TASKS_OPTED_OUT = { disabled: true } as const;

export interface AssembleDynamicAgentOptions {
  /**
   * Restrict the agent's config tools to this allow list (intersection). Used by
   * Actions, whose `allowed_tools` narrow the assigned agent to a scoped toolset
   * (the action guardrail). Absent = the agent's full toolset.
   */
  allowedToolIds?: string[];
  /** Remove tools at the final assembly boundary (delegated leaves use this
   * for root-only delegation tools such as message_agent). */
  blockedToolIds?: readonly string[];
  /**
   * Extra tools merged into the agent's toolset at assembly, keyed by name.
   * Used to register per-run AG-UI native frontend tools (which the LLM calls by
   * name and which suspend the run). They override config tools on name clash.
   */
  extraTools?: Record<string, MastraToolDefinition>;
  /**
   * Persisted instruction overrides: replace AGENTS.md / SOUL.md / SKILLS.md
   * bodies and/or append tenant/user-authored instruction files after the base
   * prompt.
   */
  instructionExtras?: {
    agentsOverrideBody?: string | null;
    appendBodies?: string[];
    /**
     * HEARTBEAT.md — only set for a run nobody asked for (trigger-fired), where
     * "you woke up on your own" is true. See instructions/heartbeat-layer.ts.
     */
    heartbeatBody?: string | null;
    skillsOverrideBody?: string | null;
    soulOverrideBody?: string | null;
  };
  mastra?: Mastra;
  memory?: MastraMemory;
  /** Memory-side processors shared between input delivery and output capture. */
  memoryProcessors?: Processor[];
  modelConfig?: RuntimeModelConfig;
  /**
   * The thread this assembly serves (PLAN-agent-hooks D5). Passed to the
   * registry for the ROOT agent only, so a function agent renders over its
   * thread-state snapshot. Sub-agents always resolve bare (delegates have no
   * thread-state channel of their own).
   */
  resolveContext?: AgentResolveContext;
  /**
   * Per-run runtime context (route, selection, workspace, module list) for the
   * ROOT agent. Injected as a tail message by an input processor rather than
   * folded into the instructions — see runtime-context-processor.ts for why the
   * system prompt is the wrong place for it.
   */
  runtimeContextInstructions?: string;
  /**
   * Shared specialist / task-bound rooms: extra instructions so the model
   * addresses people by name and does not echo speaker tags.
   */
  sharedRoom?: boolean;
  // Skip attaching `config.subAgents` as Mastra `Agent.agents` (the in-process
  // subagent mechanism). Set by the conversation executor, which instead exposes
  // `agent-<alias>` delegation tools that spawn each sub-agent as its own child
  // run (Phase 3, Decision ②: one delegation mechanism = child runs).
  skipSubAgents?: boolean;
  /**
   * The run's resolved Space, for the top-level rule and the module-tool
   * visibility filter. Lanes that assemble before entering the tools run
   * context pass it; absent, the ALS is read (child runs inherit the parent's).
   */
  space?: SpaceGateContext | null;
  // Per-sub-agent workspace overrides, keyed by sub-agent id (or alias).
  // When present, a matching entry replaces the parent's workspace for that
  // child agent so each sub-agent can have its own sandbox environment.
  subAgentWorkspaces?: Map<string, Workspace>;
  workspace?: Workspace;
}

export interface RuntimeModelConfig {
  chatModelId: string;
  /** Classifier ref: pick-one-of-N questions, guardrails included. */
  classifierModelId?: string;
  /**
   * True when the run's tier was decided by whoever resolved this config
   * (a person's pick, or Auto for their own agent). Agents assembled under a
   * pinned config keep `chatModelId`; unpinned, an agent with its own default
   * tier (`agentDefaultEffort`) is placed on that tier's model.
   */
  effortPinned?: boolean;
  /** Background text jobs without tools (observational memory, titles). */
  fastTextModelId?: string;
  /** The model behind each graded tier, clamped to the plan. */
  gradedModelIds?: Partial<Record<AiEffort, string>>;
  /**
   * The tenant's governance grants, resolved once per session alongside the
   * model ids. Carried here so per-agent pins can be checked without a policy
   * read per assembled agent. Absent/unrestricted = no filtering.
   */
  grants?: ModelAllowList | null;
  /**
   * The model's context window from the platform catalog, for the recalled-
   * history budget (history-token-budget.ts). Absent or null = unknown window,
   * fixed default budget.
   */
  resolveContextTokens?: ContextTokensResolver;
}

export async function assembleDynamicAgent(
  registry: AiRegistry,
  agentId: string,
  options: AssembleDynamicAgentOptions = {}
): Promise<Agent> {
  return assembleDynamicAgentWithAncestors(
    registry,
    agentId,
    new Set(),
    options,
    true
  );
}

async function assembleDynamicAgentWithAncestors(
  registry: AiRegistry,
  agentId: string,
  ancestors: Set<string>,
  options: AssembleDynamicAgentOptions = {},
  attachMemory = false
): Promise<Agent> {
  // Root-only resolve context: a function agent renders over the thread's
  // state snapshot; sub-agents resolve bare (base face).
  const config = await registry.getAgentConfig(
    agentId,
    attachMemory ? options.resolveContext : undefined
  );
  if (!config) {
    throw new AiSessionError("agent_threads.unknownAgentType", undefined, {
      agent_id: agentId,
    });
  }
  if (ancestors.has(config.id)) {
    throw new AiSessionError("agent_threads.unknownAgentType", undefined, {
      agent_id: config.id,
      circular_sub_agent_id: config.id,
    });
  }

  const nextAncestors = new Set(ancestors).add(config.id);
  // A specialist keeps the catalog floor whatever its row or manifest says:
  // naming narrower tools used to REPLACE it, leaving an agent with no way to
  // execute module operations at all. Approvals are the boundary, not this
  // list — and applying it here (not only at hire time) repairs rows written
  // before the rule existed. Module specialists (tasks.assist,
  // knowledge-base.manager …) are on the same footing: the Space contract
  // tells them to use `/data/Files`, artifacts and colleagues, so a manifest
  // that lists only search + execute is a floor to stand on, not a ceiling.
  // Unioned BEFORE the filters below, so an action's allow list can still
  // narrow a guardrailed node deliberately.
  // A hired engenty that reports to nobody in this space is its lead: it
  // carries the first engenty's setup and hiring set on top of the floor.
  // The lane passes the resolved Space explicitly: the chat lanes assemble
  // BEFORE they enter the tools run context, so reading the ALS here found
  // nothing and neither this rule nor the visibility filter below ran.
  const space = options.space ?? getEngentyToolsRunContext().space;
  const carriesFloor = agentCarriesCatalogFloor(config);
  const topLevel =
    config.source === "database" &&
    Boolean(
      space &&
        !isUnresolvedSpaceGate(space) &&
        !("kind" in space) &&
        space.topLevelAgentIds?.has(config.id)
    );
  const declaredToolIds = carriesFloor
    ? topLevel
      ? withTopLevelHireTools(withCatalogFloor(config.toolIds))
      : withCatalogFloor(config.toolIds)
    : config.toolIds;
  // Action guardrail: narrow the config tools to the action's allow list.
  const blockedToolIds = new Set(options.blockedToolIds ?? []);
  const toolIds = declaredToolIds.filter(
    (id) =>
      !blockedToolIds.has(id) &&
      (!options.allowedToolIds || options.allowedToolIds.includes(id))
  );
  const tools = await Promise.all(
    toolIds.map((id) => resolveTool(registry, id))
  );
  const visibleTools = space
    ? tools.filter(([, tool]) => {
        const meta = nativeModuleToolMeta(tool);
        if (!meta) {
          return true;
        }
        return isToolVisibleInSpace(
          {
            operationId: meta.operationId,
            ...(meta.moduleId ? { moduleId: meta.moduleId } : {}),
          },
          space
        );
      })
    : tools;
  // When the executor drives delegation via `agent-<alias>` child-run tools, skip
  // the in-process Mastra subagent mechanism entirely (Phase 3, Decision ②).
  const subAgents: Awaited<ReturnType<typeof resolveSubAgent>>[] =
    options.skipSubAgents
      ? []
      : await Promise.all(
          (config.subAgents ?? []).map((subAgent) =>
            resolveSubAgent(registry, subAgent, nextAncestors, options)
          )
        );

  // Native frontend tools (extraTools) only attach to the root agent, alongside
  // its config tools; they win on name clash. Built mutably so the value keeps the
  // exact type Mastra's Agent generic infers from `Object.fromEntries`.
  const agentTools = Object.fromEntries(visibleTools);
  // Function-agent inline tools (PLAN-agent-hooks D4): hook-composed closures
  // ride the RENDERED_TOOLS symbol on the config. Merge order: config tools <
  // rendered tools < extraTools (runtime frontend/delegation tools stay
  // authoritative on name clash).
  const renderedTools = renderedToolsOf(config);
  if (renderedTools) {
    Object.assign(agentTools, renderedTools);
  }
  if (attachMemory && options.extraTools) {
    Object.assign(agentTools, options.extraTools);
  }
  for (const blockedToolId of blockedToolIds) {
    delete agentTools[blockedToolId];
  }

  // Move and copy, which Mastra 1.59's workspace tool set does not have at all
  // (P1.6). Attached to every agent that HAS a workspace, because the gesture
  // they add — carrying an artefact from `/task` into `/shared` — crosses
  // mounts, and a single filesystem's `moveFile` cannot express that.
  if (options.workspace) {
    for (const [id, tool] of Object.entries(workspaceTransferTools)) {
      agentTools[id] = tool as unknown as MastraToolDefinition;
    }
  }

  // The bulk approval card travels with the catalog: an agent that can trip the
  // approval gate must also be able to ASK. Only the copilot declared
  // `engenty_tools_preapprove`, so a specialist whose sandbox program hit a
  // gated write was told to "call engenty_tools_preapprove" — a tool it did not
  // have — and asked the user in prose to grant six operations by hand
  // (knowledge-base.manager on its desk, 2026-09-05). Attached, not declared,
  // so module manifests and rows written before this get it at assembly.
  if (
    attachMemory &&
    ENGENTY_TOOL_EXECUTE_TOOL_ID in agentTools &&
    !blockedToolIds.has(ENGENTY_TOOLS_PREAPPROVE_TOOL_ID) &&
    !options.allowedToolIds
  ) {
    agentTools[ENGENTY_TOOLS_PREAPPROVE_TOOL_ID] =
      engentyToolsPreapproveTool as unknown as MastraToolDefinition;
  }

  // Presentation tools: show_objects, show_ui, show_widget, show_artifact.
  // Each returns a handle or payload the surface renders from the tool RESULT
  // (a card in the chat, a link on a channel, nothing headless) — none of them
  // suspends, so unlike frontend tools they cannot park a run that has no
  // browser to resume it. Only the copilot declared them, so a specialist on
  // its desk could not render a record list, a widget, or re-open a page.
  // Attached rather than declared so manifests and existing rows get them.
  if (attachMemory && !options.allowedToolIds) {
    const presentationTools: Record<string, unknown> = {
      show_artifact: createArtifactTools().show_artifact,
      show_objects: createShowObjectsTool(),
      show_ui: createShowUiTool(),
      show_widget: createShowWidgetTool(),
    };
    for (const [id, tool] of Object.entries(presentationTools)) {
      if (!(id in agentTools || blockedToolIds.has(id))) {
        agentTools[id] = tool as MastraToolDefinition;
      }
    }
  }

  // Code Mode (read-only): one `execute_typescript` tool for bulk/aggregation
  // tool orchestration in the workspace sandbox. Attached to root agents that
  // (a) carry the engenty catalog meta-tools and (b) run WITH a workspace —
  // the code-mode tool resolves its sandbox from `ctx.workspace.sandbox`.
  const attachCodeMode =
    attachMemory &&
    options.workspace?.sandbox != null &&
    ENGENTY_TOOL_EXECUTE_TOOL_ID in agentTools;
  if (attachCodeMode) {
    agentTools[engentyCodeModeTool.id] =
      engentyCodeModeTool as unknown as MastraToolDefinition;
  }

  // Skills are no longer inlined into the prompt. `skillIds` are now *preferred
  // skill names*: the agent loads their SKILL.md on demand via the Mastra
  // Workspace `skill`/`skill_search` tools (file-storage discovery). We only
  // surface a short hint so the model knows which skills to reach for.
  const extras = options.instructionExtras;
  let instructions = buildAgentInstructions(
    config,
    topLevel ? { ...extras, topLevel: true } : extras
  );
  if (extras?.appendBodies?.length) {
    instructions = [instructions, ...extras.appendBodies].join("\n\n");
  }
  if (attachCodeMode) {
    instructions = `${instructions}\n\n${engentyCodeModeInstructions}`;
  }
  if (options.sharedRoom) {
    instructions = `${instructions}\n\n${SHARED_ROOM_INSTRUCTIONS}`;
  }

  // Guardrail processors (prompt-injection / moderation / PII / system-prompt
  // scrubber / batch parts) — opt-in per agent via
  // `AgentConfig.guardrails.enabled`. Detection asks the classifier binding;
  // redaction runs on the fast-text model. A config without them resolves the
  // purposes' platform bindings.
  const { inputProcessors: guardrailInput, outputProcessors } =
    buildGuardrailProcessors(config.guardrails, {
      agentId: config.id,
      classifierModelId:
        options.modelConfig?.classifierModelId ??
        resolvePurposeModelId({ purpose: "classifier" }),
      textModelId:
        options.modelConfig?.fastTextModelId ??
        resolveChatModelId({ purpose: "fast_text" }),
    });
  // History hygiene, always on (before the guardrail classifiers): strip bulky
  // `engenty_tool_execute` transcripts from RECALLED history — the last two
  // tool-producing steps stay intact so the live loop keeps its results — and
  // cap recalled history at what THIS model's window leaves after the tool
  // block, the reply and the runtime tail (history-token-budget.ts).
  const modelId = resolveAgentModelId(config, options.modelConfig);
  const historyLimit = historyTokenLimit({
    contextTokens:
      (await options.modelConfig?.resolveContextTokens?.(modelId)) ?? null,
    toolTokens: estimateToolBlockTokens(agentTools),
  });
  const toolGating = effectiveToolGating(config);
  const inputProcessors: Processor[] = [
    // Lane tools ride with their lane skill (`AgentConfig.toolGating`, plus
    // the floor's own lanes for every specialist): withheld from the tool
    // block until the skill is activated, which Mastra lets us do per STEP,
    // so they arrive in the same turn. Visibility only — every tool stays
    // attached and stays gated.
    ...(toolGating ? [createSkillGatedToolsProcessor(toolGating)] : []),
    new ToolCallFilter({
      exclude: [ENGENTY_TOOL_EXECUTE_TOOL_ID],
      filterAfterToolSteps: 2,
    }),
    new TokenLimiterProcessor({ limit: historyLimit }),
    ...guardrailInput,
    ...(options.memoryProcessors ?? []),
  ];
  // LAST on purpose: the runtime context describes the request the model is
  // about to answer, so the history limiter must never be the thing that drops
  // it. Root agents only — a delegated child answers a task, not a UI state.
  if (attachMemory && options.runtimeContextInstructions?.trim()) {
    inputProcessors.push(
      createRuntimeContextProcessor(options.runtimeContextInstructions)
    );
  }

  return new Agent({
    backgroundTasks: config.backgroundTasks ?? BACKGROUND_TASKS_OPTED_OUT,
    description: config.description,
    ...(subAgents.length > 0
      ? {
          // Mastra 1.55: SubAgent id generic variance; structurally compatible at runtime.
          agents: Object.fromEntries(subAgents) as Record<
            string,
            SubAgent<string, unknown>
          >,
        }
      : {}),
    // Gateway-routed models (e.g. anthropic/*, google/*) reject a request when
    // the supervisor↔sub-agent loop leaves the conversation ending on an
    // assistant message ("does not support assistant message prefill"). Mastra's
    // first-class handler detects that API rejection and retries once with a
    // hidden `continue` reminder — the framework-native cure, applied to the
    // supervisor and every sub-agent assembled here.
    // Transient provider failures (429/5xx via the AI SDK's `isRetryable`,
    // plus a dropped socket) retry the step instead of ending the run on a
    // finishReason "error". Mastra's own `maxRetries` covers only the request
    // that never opened; this covers the stream that died after it did.
    errorProcessors: [
      new PrefillErrorHandler(),
      createStreamErrorRetryProcessor(),
    ],
    id: config.id,
    instructions,
    // Mastra 1.55: Processor[] is structurally compatible; variance requires a boundary cast.
    ...(inputProcessors.length > 0
      ? { inputProcessors: inputProcessors as InputProcessorOrWorkflow[] }
      : {}),
    ...(options.mastra ? { mastra: options.mastra } : {}),
    ...(attachMemory && options.memory ? { memory: options.memory } : {}),
    model: resolveAgentModel(config, options.modelConfig),
    name: config.name,
    ...([...outputProcessors, ...(options.memoryProcessors ?? [])].length > 0
      ? {
          outputProcessors: [
            ...outputProcessors,
            ...(options.memoryProcessors ?? []),
          ] as OutputProcessorOrWorkflow[],
        }
      : {}),
    // Name-sorted: the tool block is ~40% of the prompt and sits in the
    // provider's cache prefix, so its BYTES must be identical from turn to
    // turn. Insertion order is not — the frontend half arrives in whatever
    // order the browser registered its hooks, which varies by page.
    tools: sortToolsByName(agentTools) as ToolsInput,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
}

function sortToolsByName<T>(tools: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(tools).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

export function resolveAgentModel(
  config: AgentConfig,
  modelConfig: RuntimeModelConfig | undefined
): MastraModelConfig {
  return resolveMastraModel<MastraModelConfig>(
    resolveAgentModelId(config, modelConfig)
  );
}

export function resolveAgentModelId(
  config: AgentConfig,
  modelConfig: RuntimeModelConfig | undefined
): string {
  // Precedence flip: an explicit per-agent pin beats the tenant default
  // — but only within the tenant's grants. An ungoverned pin used to be returned
  // verbatim, which let a pinned sub-agent run a model the tenant is not
  // licensed for: sub-agents are assembled here and never reach the usage
  // preflight, so nothing downstream would have caught it. A disallowed pin now
  // falls through to the tenant default, which is itself governed.
  const override = config.modelOverride?.trim();
  if (
    override &&
    (!modelConfig?.grants || isModelAllowed(override, modelConfig.grants))
  ) {
    return override;
  }
  if (!modelConfig) {
    return config.model ?? resolveChatModelId({ purpose: "chat" });
  }
  // The agent's own default tier — when nobody pinned one for this run. This
  // is how a coding agent runs high in a hand-off or a delegation, where no
  // composer pick exists and the caller's config would otherwise carry the
  // sender's tier over.
  if (!modelConfig.effortPinned) {
    const tier = agentDefaultEffort(config);
    const tierModelId = tier ? modelConfig.gradedModelIds?.[tier] : null;
    if (
      tierModelId &&
      (!modelConfig.grants || isModelAllowed(tierModelId, modelConfig.grants))
    ) {
      return tierModelId;
    }
  }
  return modelConfig.chatModelId;
}

export function buildAgentInstructions(
  config: AgentConfig,
  extras?: {
    agentsOverrideBody?: string | null;
    heartbeatBody?: string | null;
    skillsOverrideBody?: string | null;
    soulOverrideBody?: string | null;
    /** The agent reports to nobody in the run's space — it carries the hiring set. */
    topLevel?: boolean;
  } | null
): string {
  // engenty.copilot: per-file overrides replace only that layer; SOUL / SKILLS /
  // runtime context stay from the layered builder. Other agents still treat an
  // AGENTS override as a full instructions replacement.
  let baseInstructions = config.instructions;
  if (config.id === ENGENTY_COPILOT_AGENT_ID) {
    baseInstructions = buildEngentyCopilotInstructions({
      agents: extras?.agentsOverrideBody,
      skills: extras?.skillsOverrideBody,
      soul: extras?.soulOverrideBody,
    });
  } else if (
    extras?.agentsOverrideBody &&
    extras.agentsOverrideBody.trim().length > 0
  ) {
    baseInstructions = extras.agentsOverrideBody;
  }
  const parts = [baseInstructions];
  // The copilot's SOUL layer already says it; every other agent needs telling.
  if (config.id !== ENGENTY_COPILOT_AGENT_ID) {
    parts.push(REPLY_STYLE_INSTRUCTIONS);
  }
  const preferred = preferredSkillIdsForRun(
    config,
    extras?.topLevel === true
  ).filter((name) => name.trim().length > 0);
  if (extras?.topLevel) {
    parts.push(
      "You are a coordinator of this space: people talk to you, you route the work, and you may set the space up, give yourself routines and hire teammates. Load the chief-of-staff skill before doing any of that."
    );
  }
  if (preferred.length > 0) {
    parts.push(
      `Preferred skills: ${preferred.join(", ")}. Load a skill with the skill tool when relevant.`
    );
  }
  // A gated agent must be told the gate exists, or it reads a missing tool as a
  // missing capability and says the product cannot do the thing.
  if (effectiveToolGating(config)) {
    parts.push(SKILL_GATED_TOOLS_INSTRUCTIONS);
  }
  if (agentCarriesCatalogFloor(config)) {
    // The floor's own manual: hired or module-shipped, a specialist that has
    // the catalog, Space Data and colleagues must be told how they work — and
    // a report told where the management verbs live, or a specialist asked
    // to hire, add an app or open a Task answers that it cannot be done
    // instead of handing it to its coordinator. The module decides which
    // sections a run gets.
    parts.push(
      ...specialistInstructionsForRun({ topLevel: extras?.topLevel === true })
    );
  } else if (config.agentScope) {
    // Specialists carry these inside the specialist appendix. Any other agent
    // with an audience — the personal copilot, an interface declaring
    // `agent_scope` — has the same MEMORY.md and TASKS.md bound to its run
    // and needs to be told about them.
    parts.push(AGENT_MEMORY_INSTRUCTIONS, AGENT_TASKS_INSTRUCTIONS);
  }
  // Last, and only on a run nobody asked for: how to behave having woken up on
  // its own (Phase 7 #10). Absent from every other run, where it would be false.
  const heartbeat = extras?.heartbeatBody?.trim();
  if (heartbeat) {
    parts.push(heartbeat);
  }
  return parts.join("\n\n");
}

async function resolveTool(
  registry: AiRegistry,
  id: string
): Promise<[string, MastraToolDefinition]> {
  const tool = await registry.getTool(id);
  if (!tool) {
    // Distinct from unknownAgentType: the agent resolved, but it declares a
    // tool the registry can't provide (e.g. a module-local tool that doesn't
    // cross into apps/ai). A dedicated code makes this diagnosable at a glance.
    throw new AiSessionError("agent_threads.unknownTool", undefined, {
      missing_tool_id: id,
    });
  }
  return [id, tool];
}

async function resolveSubAgent(
  registry: AiRegistry,
  subAgent: NonNullable<AgentConfig["subAgents"]>[number],
  ancestors: Set<string>,
  options: AssembleDynamicAgentOptions = {}
): Promise<[string, SubAgent<unknown, unknown>]> {
  // Each sub-agent inherits the parent options but may get its own workspace
  // when `subAgentWorkspaces` carries an override for this agent's id or alias.
  // CLI-type agents (sandbox-enabled) need a dedicated workspace so they don't
  // inherit the parent's sandbox lifecycle or mount table.
  const subAgentKey = subAgent.alias ?? subAgent.id;
  const overrideWorkspace =
    options.subAgentWorkspaces?.get(subAgent.id) ??
    options.subAgentWorkspaces?.get(subAgentKey);
  // Sub-agents get their own workspace only when harness supplies an override;
  // never inherit the parent's workspace (assistant desk ≠ staff/code_execution).
  const {
    memory: _parentMemory,
    workspace: _parentWorkspace,
    ...sharedOptions
  } = options;
  const childOptions: AssembleDynamicAgentOptions = {
    ...sharedOptions,
    ...(overrideWorkspace ? { workspace: overrideWorkspace } : {}),
  };
  const agent = await assembleDynamicAgentWithAncestors(
    registry,
    subAgent.id,
    ancestors,
    childOptions,
    false
  );
  return [subAgent.alias ?? subAgent.id, agent as unknown as SubAgent];
}
