import {
  type AgentResolveContext,
  isModelAllowed,
  type ModelAllowList,
  renderedToolsOf,
} from "@engenty/ai-core";
import {
  buildEngentyCopilotInstructions,
  ENGENTY_COPILOT_AGENT_ID,
} from "@engenty/engenty-copilot/ai";
import { Agent, type SubAgent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Mastra } from "@mastra/core/mastra";
import type { MastraMemory } from "@mastra/core/memory";
import {
  PrefillErrorHandler,
  type Processor,
  TokenLimiterProcessor,
  ToolCallFilter,
} from "@mastra/core/processors";
import type { Workspace } from "@mastra/core/workspace";
import { gateway, wrapLanguageModel } from "ai";
import {
  engentyCodeModeInstructions,
  engentyCodeModeTool,
} from "../../../ai/tools/engenty-tools/code-mode.js";
import { ENGENTY_TOOL_EXECUTE_TOOL_ID } from "../../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import { AiSessionError } from "../errors.js";
import {
  MEMORY_INSTRUCTIONS,
  MEMORY_SAVE_TOOL_ID,
} from "../instructions/memory-instructions.js";
import { buildGuardrailProcessors } from "./build-guardrail-processors.js";
import { gatewayFileDataMiddleware } from "./gateway-file-data-middleware.js";
import type { AgentConfig, AiRegistry, MastraToolDefinition } from "./types.js";

export interface AssembleDynamicAgentOptions {
  /**
   * Restrict the agent's config tools to this allow list (intersection). Used by
   * Actions, whose `allowed_tools` narrow the assigned agent to a scoped toolset
   * (the action guardrail). Absent = the agent's full toolset.
   */
  allowedToolIds?: string[];
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
    skillsOverrideBody?: string | null;
    soulOverrideBody?: string | null;
  };
  mastra?: Mastra;
  memory?: MastraMemory;
  modelConfig?: RuntimeModelConfig;
  /**
   * The thread this assembly serves (PLAN-agent-hooks D5). Passed to the
   * registry for the ROOT agent only, so a function agent renders over its
   * thread-state snapshot. Sub-agents always resolve bare (delegates have no
   * thread-state channel of their own).
   */
  resolveContext?: AgentResolveContext;
  // Skip attaching `config.subAgents` as Mastra `Agent.agents` (the in-process
  // subagent mechanism). Set by the conversation executor, which instead exposes
  // `agent-<alias>` delegation tools that spawn each sub-agent as its own child
  // run (Phase 3, Decision ②: one delegation mechanism = child runs).
  skipSubAgents?: boolean;
  // Per-sub-agent workspace overrides, keyed by sub-agent id (or alias).
  // When present, a matching entry replaces the parent's workspace for that
  // child agent so each sub-agent can have its own sandbox environment.
  subAgentWorkspaces?: Map<string, Workspace>;
  workspace?: Workspace;
}

export interface RuntimeModelConfig {
  chatModelId: string;
  /**
   * The tenant's governance grants, resolved once per session alongside the
   * model ids. Carried here so per-agent pins can be checked without a policy
   * read per assembled agent. Absent/unrestricted = no filtering.
   */
  grants?: ModelAllowList | null;
  // Planning & coding tier; falls back to chat when unset.
  planningCodingModelId?: string;
  // Research / retrieval tier; falls back to chat when unset.
  researchModelId?: string;
  routingModelId: string;
  // Mastra guardrail processors classify with this model id; the harness
  // resolves it from tenant `ai.config.safeguard_model_id` (defaulted).
  safeguardModelId?: string;
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
  // Action guardrail: narrow the config tools to the action's allow list.
  const toolIds = options.allowedToolIds
    ? config.toolIds.filter((id) => options.allowedToolIds?.includes(id))
    : config.toolIds;
  const tools = await Promise.all(
    toolIds.map((id) => resolveTool(registry, id))
  );
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
  const agentTools = Object.fromEntries(tools);
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
  let instructions = buildAgentInstructions(config, extras);
  if (extras?.appendBodies?.length) {
    instructions = [instructions, ...extras.appendBodies].join("\n\n");
  }
  if (attachCodeMode) {
    instructions = `${instructions}\n\n${engentyCodeModeInstructions}`;
  }

  // Mastra guardrail processors (prompt-injection / moderation / PII /
  // system-prompt scrubber / batch parts) — opt-in per agent via
  // `AgentConfig.guardrails.enabled`. Safeguard model shared across detectors.
  const { inputProcessors: guardrailInput, outputProcessors } =
    buildGuardrailProcessors(config.guardrails, {
      agentId: config.id,
      safeguardModelId:
        options.modelConfig?.safeguardModelId ?? "openai/gpt-oss-safeguard-20b",
    });
  // History hygiene, always on (before the guardrail classifiers): strip bulky
  // `engenty_tool_execute` transcripts from RECALLED history — the last two
  // tool-producing steps stay intact so the live loop keeps its results — and
  // hard-cap recalled history so a long thread cannot blow the prompt budget.
  const inputProcessors: Processor[] = [
    new ToolCallFilter({
      exclude: [ENGENTY_TOOL_EXECUTE_TOOL_ID],
      filterAfterToolSteps: 2,
    }),
    new TokenLimiterProcessor({ limit: 100_000 }),
    ...guardrailInput,
  ];

  return new Agent({
    ...(config.backgroundTasks
      ? { backgroundTasks: config.backgroundTasks }
      : {}),
    description: config.description,
    ...(subAgents.length > 0 ? { agents: Object.fromEntries(subAgents) } : {}),
    // Gateway-routed models (e.g. anthropic/*, google/*) reject a request when
    // the supervisor↔sub-agent loop leaves the conversation ending on an
    // assistant message ("does not support assistant message prefill"). Mastra's
    // first-class handler detects that API rejection and retries once with a
    // hidden `continue` reminder — the framework-native cure, applied to the
    // supervisor and every sub-agent assembled here.
    errorProcessors: [new PrefillErrorHandler()],
    id: config.id,
    instructions,
    ...(inputProcessors.length > 0 ? { inputProcessors } : {}),
    ...(options.mastra ? { mastra: options.mastra } : {}),
    ...(attachMemory && options.memory ? { memory: options.memory } : {}),
    model: resolveAgentModel(config, options.modelConfig),
    name: config.name,
    ...(outputProcessors.length > 0 ? { outputProcessors } : {}),
    tools: agentTools,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
}

export function resolveAgentModel(
  config: AgentConfig,
  modelConfig: RuntimeModelConfig | undefined
): MastraModelConfig {
  const modelId = resolveAgentModelId(config, modelConfig);
  return isGatewayModelId(modelId)
    ? // File-part data must be bytes on the Gateway wire — see the middleware.
      (wrapLanguageModel({
        middleware: gatewayFileDataMiddleware,
        model: gateway(modelId),
      }) as unknown as MastraModelConfig)
    : modelId;
}

export function resolveAgentModelId(
  config: AgentConfig,
  modelConfig: RuntimeModelConfig | undefined
): string {
  // Precedence flip: an explicit per-agent pin beats the tenant/purpose default
  // — but only within the tenant's grants. An ungoverned pin used to be returned
  // verbatim, which let a pinned sub-agent run a model the tenant is not
  // licensed for: sub-agents are assembled here and never reach the usage
  // preflight, so nothing downstream would have caught it. A disallowed pin now
  // falls through to purpose inheritance, which is itself governed.
  const override = config.modelOverride?.trim();
  if (
    override &&
    (!modelConfig?.grants || isModelAllowed(override, modelConfig.grants))
  ) {
    return override;
  }
  if (!modelConfig) {
    return config.model;
  }
  // Inherit by purpose — explicit `purpose` wins, else structural default
  // (supervisors route, leaves chat), preserving pre-Phase-4 behavior.
  const purpose =
    config.purpose ?? (isRoutingAgent(config) ? "routing" : "chat");
  return modelForPurpose(modelConfig, purpose);
}

function modelForPurpose(
  modelConfig: RuntimeModelConfig,
  purpose: NonNullable<AgentConfig["purpose"]>
): string {
  switch (purpose) {
    case "routing":
      return modelConfig.routingModelId;
    case "research":
      return modelConfig.researchModelId ?? modelConfig.chatModelId;
    case "planning_coding":
      return modelConfig.planningCodingModelId ?? modelConfig.chatModelId;
    case "safeguard":
      return modelConfig.safeguardModelId ?? modelConfig.chatModelId;
    default:
      return modelConfig.chatModelId;
  }
}

function isRoutingAgent(config: AgentConfig): boolean {
  return (config.subAgents?.length ?? 0) > 0;
}

function isGatewayModelId(modelId: string): boolean {
  return modelId.includes("/") && !modelId.startsWith("vercel/");
}

export function buildAgentInstructions(
  config: AgentConfig,
  extras?: {
    agentsOverrideBody?: string | null;
    skillsOverrideBody?: string | null;
    soulOverrideBody?: string | null;
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
  const preferred = config.skillIds.filter((name) => name.trim().length > 0);
  if (preferred.length > 0) {
    parts.push(
      `Preferred skills: ${preferred.join(", ")}. Load a skill with the skill tool when relevant.`
    );
  }
  // Any agent that carries the durable-memory tools gets the full memory
  // discipline — one central layer instead of per-agent AGENTS.md copies.
  if (config.toolIds.includes(MEMORY_SAVE_TOOL_ID)) {
    parts.push(MEMORY_INSTRUCTIONS);
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
