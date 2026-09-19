import { z } from "zod";
import { AGENT_ENGENTY_KINDS } from "./agents/agent-engenty.js";

// The sandbox network union, shared with the SPACE-level setting that decides
// the same thing for the space computer (`core.spaces.computer_network_tier`).
export {
  COMPUTER_NETWORK_TIERS,
  type ComputerNetworkTier,
  parseComputerNetworkTier,
} from "@engenty/plugin-sdk";

import {
  AGENT_STARTER_DECLARE_MAX,
  agentStarterSchema,
} from "./agents/agent-starters.js";
// Type-only import — contracts.ts imports AgentConfig from this file, so keep
// this cycle erased at runtime.
import type { RoutineDefinition, WorkflowDefinition } from "./contracts.js";
// Type-only (no runtime cycle): hooks/types.ts imports AgentConfig from here.
import type { AgentFnDescriptor } from "./hooks/types.js";

export const agentSubAgentConfigSchema = z.object({
  alias: z.string().min(1).optional(),
  id: z.string().min(1),
});

// Mastra guardrail processor strategy aliases — match @mastra/core/processors.
const guardrailStrategySchema = z.enum([
  "block",
  "warn",
  "detect",
  "filter",
  "redact",
  "rewrite",
  "translate",
]);

const guardrailProcessorBaseSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: guardrailStrategySchema.optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const promptInjectionGuardrailSchema = guardrailProcessorBaseSchema.extend({
  detectionTypes: z.array(z.string().min(1)).optional(),
});

const moderationGuardrailSchema = guardrailProcessorBaseSchema.extend({
  categories: z.array(z.string().min(1)).optional(),
});

const piiGuardrailSchema = guardrailProcessorBaseSchema.extend({
  detectionTypes: z.array(z.string().min(1)).optional(),
  redactionMethod: z.enum(["mask", "remove", "placeholder", "hash"]).optional(),
});

const systemPromptScrubberGuardrailSchema = guardrailProcessorBaseSchema.extend(
  {
    customPatterns: z.array(z.string().min(1)).optional(),
    redactionMethod: z.enum(["mask", "placeholder"]).optional(),
  }
);

const batchPartsGuardrailSchema = z.object({
  enabled: z.boolean().default(true),
  batchSize: z.number().int().positive().optional(),
  maxWaitTime: z.number().int().positive().optional(),
});

const guardrailsInputSchema = z
  .object({
    moderation: moderationGuardrailSchema.optional(),
    pii: piiGuardrailSchema.optional(),
    promptInjection: promptInjectionGuardrailSchema.optional(),
  })
  .optional();

const guardrailsOutputSchema = z
  .object({
    batchParts: batchPartsGuardrailSchema.optional(),
    moderation: moderationGuardrailSchema.optional(),
    pii: piiGuardrailSchema.optional(),
    systemPromptScrubber: systemPromptScrubberGuardrailSchema.optional(),
  })
  .optional();

// Per-agent Mastra guardrails config persisted on `ai.engenty_ai_agents.guardrails`.
// The assembler in apps/ai maps this JSON to @mastra/core/processors instances.
export const agentGuardrailsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  input: guardrailsInputSchema,
  output: guardrailsOutputSchema,
});

export type AgentGuardrailsConfig = z.infer<typeof agentGuardrailsConfigSchema>;

const agentBackgroundToolConfigSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean(),
    timeoutMs: z.number().int().positive().optional(),
  }),
]);

export const agentBackgroundConfigSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  disabled: z.boolean().optional(),
  tools: z
    .union([
      z.literal("all"),
      z.record(z.string(), agentBackgroundToolConfigSchema),
    ])
    .optional(),
  waitTimeoutMs: z.number().int().positive().optional(),
});

// Declarative, serializable workspace request for an agent. No `@mastra` import:
// apps/ai expands this into a Mastra `Workspace` per run. Mounts form an
// fstab-style layered table; `scope` resolves to a tenant file-storage prefix.
const agentWorkspaceMountSchema = z.object({
  // Mount point inside the agent's filesystem, e.g. "/", "/home", "/skills", "/task".
  path: z.string().min(1),
  // Storage scope; resolved to a file-storage prefix by the harness.
  // `routine`/`project` are the containment tiers around a bound task
  // (resolved via work-scope's visibility chain — see apps/ai
  // resolve-work-visibility). `routine` is the standing work a fire belongs to,
  // so successive fires of one routine share a folder.
  // `space` is the steady tier above them (PLAN-spaces.md) and roots the mount
  // at `tenants/<t>/spaces/<s>/…` instead of the tenant root. It took over the
  // socket previously reserved as `group`, which nothing ever emitted.
  scope: z.enum([
    "tenant",
    "user",
    "agent",
    "task",
    "routine",
    "project",
    "space",
    "sandbox",
  ]),
  // `commons` is writable tenant-shared working context (durable, cross-user/
  // cross-session), not a deliverable or record store. Tenant AGENTS.md/SOUL.md reach the agent via prompt
  // injection (instruction registry), not a filesystem mount.
  //
  // `data` is the odd one out and deliberately so: it resolves to no storage
  // prefix at all. It is the space's DATA TREE (PLAN-space-data.md D4) — module
  // records rendered as files — so its bytes are never bytes on disk, and every
  // read and write it serves goes through the module's own operations with the
  // run's principal, approval card included.
  source: z.enum([
    "commons",
    "data",
    "home",
    "skills",
    "checkout",
    "routine",
    "project",
    "sandbox",
  ]),
  access: z.enum(["ro", "rw"]),
  // Only mount when the session is bound to that scope's entity (e.g. a task).
  requireBinding: z.boolean().optional(),
});

export type AgentWorkspaceMount = z.infer<typeof agentWorkspaceMountSchema>;

const agentWorkspaceSandboxRuntimeSchema = z.enum(["node", "python"]);

export const agentWorkspaceSandboxSchema = z.object({
  enabled: z.boolean().default(false),
  // Gate `EXECUTE_COMMAND` behind human approval (HITL) when true.
  requireApproval: z.boolean().default(true),
  // Compute provider; defaults from `ENGENTY_SANDBOX_PROVIDER` at runtime.
  // Docker is the only agent-execution provider (sandbox doctrine 2026-08-03).
  provider: z.enum(["docker", "local"]).optional(),
  // Workspace mount path for sandbox files (default `/sandbox`).
  mountPath: z.string().min(1).default("/sandbox"),
  // Sandbox storage lifecycle: per run, session thread, or bound task checkout.
  lifecycle: z.enum(["run", "session", "task"]).default("run"),
  timeoutMs: z.number().int().positive().optional(),
  runtimes: z.array(agentWorkspaceSandboxRuntimeSchema).optional(),
  // Network reach the agent asks for. Absent means `none`, resolved at the
  // factory: the container stays off every network, which is enough for engenty
  // tools and Code Mode since both speak stdio to the host. `egress` is for
  // agents that fetch (package installs, third-party APIs) and routes through
  // the host's egress proxy.
  network: z.enum(["none", "egress"]).optional(),
});

// Workspace archetypes: `assistant` (per-user personal desk, e.g. engenty.copilot)
// and `staff` (per-agent company resource, e.g. engenty.tools / module specialists).
// `custom` uses the explicit `mounts` array verbatim.
export const agentWorkspaceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  preset: z
    .enum(["assistant", "staff", "code_execution", "custom"])
    .default("custom"),
  // Overrides/extends the preset's mount table when provided.
  mounts: z.array(agentWorkspaceMountSchema).optional(),
  sandbox: agentWorkspaceSandboxSchema.optional(),
  // BM25 keyword search is always available to skill agents; `vector` opts into
  // hybrid (BM25 + semantic) search, activated only when the workspace vector
  // env (pgvector + AI Gateway embeddings) is configured.
  search: z
    .object({ bm25: z.boolean().optional(), vector: z.boolean().optional() })
    .optional(),
  skills: z
    .object({ discoveryPaths: z.array(z.string().min(1)).optional() })
    .optional(),
  /**
   * Mastra workspace tools this agent does not want, by their
   * `mastra_workspace_*` name. Mastra attaches all of them whenever a workspace
   * exists, and each one's JSON Schema rides in the prompt on every model call
   * (measured: 53 KB across 16 tools) — so a tool an archetype will never call
   * is pure prompt weight. Mastra's own per-tool `enabled: false` is the seam;
   * this is the declarative way to reach it.
   */
  disabledWorkspaceTools: z.array(z.string().min(1)).optional(),
});

export type AgentWorkspaceConfig = z.infer<typeof agentWorkspaceConfigSchema>;

/** Purpose an agent binds to for tenant model resolution (Phase 4). */
export const agentModelPurposeSchema = z.enum([
  "chat",
  "routing",
  "coordinator",
  "research",
  "planning_coding",
  "safeguard",
]);
export type AgentModelPurpose = z.infer<typeof agentModelPurposeSchema>;

// Per-agent operational limits. A governance dial on a single agent, layered
// over the global/tenant defaults. `max_steps` caps the agent's reasoning
// iterations per run (hard ceiling 60 — a per-agent value can only tighten);
// `budget` caps cumulative spend over the tenant usage period, metered off
// ai.usage_event by (tenant, agent).
export const agentLimitsConfigSchema = z.object({
  max_steps: z.number().int().min(1).max(60).optional(),
  budget: z
    .object({
      maxCostMicrosPerPeriod: z.number().int().nonnegative().nullish(),
    })
    .nullish(),
});
export type AgentLimitsConfig = z.infer<typeof agentLimitsConfigSchema>;

/**
 * Which skill owns which tools. A tool named here is withheld from the model
 * until that skill is activated in the thread; a tool named nowhere is always
 * offered. Fail-open on purpose — per-run frontend tools arrive with names the
 * config cannot know, and a tool nobody gated must never vanish.
 *
 * This is a VISIBILITY gate, not an authorization one. Every listed tool is
 * still attached, still space-gated and still approval-gated; the model simply
 * does not carry its schema around until the lane it belongs to is open.
 */
export const agentToolGatingConfigSchema = z.object({
  bySkill: z.record(z.string().min(1), z.array(z.string().min(1))),
});
export type AgentToolGatingConfig = z.infer<typeof agentToolGatingConfigSchema>;

export const agentConfigSchema = z.object({
  /**
   * Generic ownership classification. Personal agents belong to one user;
   * shared agents are company resources whose shared state is space-scoped.
   */
  agentScope: z.enum(["personal", "shared"]).optional(),
  backgroundTasks: agentBackgroundConfigSchema.optional(),
  description: z.string().optional(),
  /**
   * Blob character on the agent start header. When omitted, the id is hashed
   * to a stable kind (`resolveAgentEngenty`).
   */
  engenty: z.enum(AGENT_ENGENTY_KINDS).optional(),
  /**
   * Optional generated portrait. A storage object key under
   * `tenants/<tid>/ai/agents/…`, or a data/https URL in tests. When set, UI
   * prefers it over the blob silhouette and falls back to `engenty` if the
   * file is missing.
   */
  avatarUrl: z.string().min(1).max(2048).nullish(),
  /**
   * How much thinking this agent's turns default to whenever nobody chose:
   * the person left the composer on Auto, or the turn is a hand-off, a
   * delegation or a routine. An explicit pick on the person's own desk still
   * wins. Absent = sized from the turn, except that an agent holding a coding
   * tool defaults to high (`agentDefaultEffort`).
   */
  effort: z.enum(["low", "medium", "high"]).nullish(),
  guardrails: agentGuardrailsConfigSchema.optional(),
  id: z.string().min(1),
  instructions: z.string().min(1),
  /**
   * What an agent under this space is FOR — the declared classification that
   * replaced the id-string classifiers.
   *
   * `interface`: the space's own mouth/ears (copilot, coordinator, remote) —
   *   placed by baseline mounts, never hired, never a routine owner.
   * `specialist`: an engenty — instructions, skills, actions, triggers; the
   *   default when absent and the only kind `agent_propose` may mint.
   * `delegated`: a sub-agent that exists to be delegated to (cli,
   *   file-analyst, app-coder); may not own triggers.
   * `chat_surface`: a module's Q&A face (knowledge-base.answers); a chat
   *   endpoint, not a worker.
   */
  kind: z
    .enum(["interface", "specialist", "delegated", "chat_surface"])
    .optional(),
  /**
   * How an interface agent faces the user: `live` (copilot UI), `background`
   * (coordinator), `remote` (channels). Only meaningful with
   * `kind: "interface"`.
   */
  interfaceRole: z.enum(["live", "background", "remote"]).optional(),
  /** Per-agent operational limits (iteration cap, …). */
  limits: agentLimitsConfigSchema.optional(),
  model: z.string().min(1),
  /**
   * Owning module id; null/absent = platform. The single ownership signal —
   * `source` stays provider provenance (builtin/module/database) and never
   * says who owns the agent.
   */
  moduleId: z.string().min(1).nullish(),
  /**
   * Explicit per-agent model pin. When set, it beats the tenant/purpose default
   * (precedence flip). Absent = inherit via {@link purpose}.
   */
  modelOverride: z.string().min(1).nullish(),
  /**
   * Which tenant model tier this agent inherits when not pinned. Defaults by
   * structure (supervisors → routing, leaves → chat) when absent.
   */
  purpose: agentModelPurposeSchema.optional(),
  name: z.string().min(1),
  /**
   * Reachable from a remote channel (Slack, Telegram, …) as itself, not only
   * through the shared front door. When on, a bound channel or an `@handle`
   * routes the turn to THIS agent, assembled with its own tools and memory.
   * Off by default: a channel turn that lands on an agent nobody
   * meant to expose is a leak, not a feature.
   */
  remoteEnabled: z.boolean().optional(),
  /**
   * The short name a channel addresses it by (`@sales`, `/to sales`). Lower
   * case, letters/digits/dashes/underscores. Absent = the agent id's last
   * segment.
   */
  remoteHandle: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)
    .nullish(),
  skillIds: z.array(z.string().min(1)).default([]),
  source: z.enum(["builtin", "module", "database"]).optional(),
  /**
   * Empty-state composer chips. Module manifests may declare up to
   * {@link AGENT_STARTER_DECLARE_MAX}; the desk shows at most 3 after
   * locale + condition filtering. Agent-authored proposals are capped at 3
   * at the propose route.
   */
  starters: z
    .array(agentStarterSchema)
    .max(AGENT_STARTER_DECLARE_MAX)
    .optional(),
  subAgents: z.array(agentSubAgentConfigSchema).optional(),
  toolIds: z.array(z.string().min(1)).default([]),
  /** Skill-gated tool visibility. See {@link agentToolGatingConfigSchema}. */
  toolGating: agentToolGatingConfigSchema.optional(),
  /**
   * Whether this agent may drive the person's screen from a chat surface —
   * the frontend tools (navigate, open a dialog, focus a field, the guided
   * tour, the browser-use set). Only ever on a run a browser started; a
   * channel or routine turn never carries them whatever this says.
   *
   * `auto` (default) = on for the Space's coordinator (top-level Engenty),
   * off for the rest. `on` / `off` decide outright.
   */
  uiTools: z.enum(["auto", "on", "off"]).optional(),
  // Optional per-agent workspace request (filesystem + skills + sandbox).
  workspace: agentWorkspaceConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

/**
 * The Worker compute default (PLAN-agent-computers.md §1.1): what a
 * specialist's runs get when its declaration asked for a workspace and said
 * nothing about execution. Identical to the values the registry has always
 * given DB-registered agents — one default, not two per code path.
 */
export const WORKER_SANDBOX_DEFAULT = {
  enabled: true,
  lifecycle: "run",
  mountPath: "/sandbox",
  network: "none",
  requireApproval: true,
} as const satisfies NonNullable<AgentWorkspaceConfig["sandbox"]>;

/**
 * Apply the Worker compute default to an agent's declaration.
 *
 * Keys off a DECLARED workspace on purpose: an agent that declared one asked
 * to work with files, and execution rides along; an agent that declared
 * nothing (File Analyst, App Coder) stays exactly as it is, and an explicit
 * `sandbox` block — enabled or disabled — always wins. Called once at the
 * registry read seam so chat, delegation, headless runs and the registry API
 * all see the same answer.
 */
export function applyWorkerSandboxDefault(config: AgentConfig): AgentConfig {
  const workspace = config.workspace;
  if (!workspace || workspace.enabled === false || workspace.sandbox) {
    return config;
  }
  return {
    ...config,
    workspace: { ...workspace, sandbox: { ...WORKER_SANDBOX_DEFAULT } },
  };
}

export const toolConfigSchema = z.object({
  description: z.string().optional(),
  endpointUrl: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  schemaJson: z.record(z.string(), z.unknown()).default({}),
});

export type ToolConfig = z.infer<typeof toolConfigSchema>;

export type AiCapabilitySource = NonNullable<AgentConfig["source"]>;

export type MastraToolDefinition = object;

/**
 * The thread a config resolution is for (PLAN-agent-hooks D5). Optional and
 * ignored by data providers; the function-agent provider uses it to load the
 * thread's `agent_state` snapshot before rendering. Absent = bare render
 * (catalog listings, delegate lookups): function agents show their base face.
 */
export interface AgentResolveContext {
  tenantId: string;
  threadId: string;
  userId: string;
}

export interface AiRegistry {
  getAgentConfig(
    id: string,
    context?: AgentResolveContext
  ): Promise<AgentConfig | undefined>;
  getTool(id: string): Promise<MastraToolDefinition | undefined>;
}

export interface AiRegistryProvider extends AiRegistry {
  readonly providerId: string;
}

export interface DynamicAiModuleCapability {
  agentConfigs?: AgentConfig[];
  // Function agents (PLAN-agent-hooks Phase 4): hook-composed agent bodies,
  // authored in module code (conventionally agent.ts beside agent.json) and
  // passed through `defineModuleAi({ agentFns })`. In-process only — they
  // ride the same non-serializable channel as `tools`. A function replaces a
  // scanned agent.json config of the same id (D7).
  agentFns?: AgentFnDescriptor[];
  // Serializable COMMAND.md chat slash commands declared by the module.
  chatCommands?: import("./chat-commands/contracts.js").ChatCommandDefinition[];
  moduleId: string;
  // Trigger declarations from agent.json `triggers:` (plain JSON data).
  routines?: RoutineDefinition[];
  // Raw SKILL.md markdown by skill name. Seed channel only: published into the
  // tenant's read-only `managed` skills tier; never resolved at runtime (agents
  // load skills via the Mastra Workspace skill tools).
  skills?: Record<string, string>;
  tools?: Record<string, MastraToolDefinition>;
  // Module workflow definitions — already plain JSON, carried verbatim.
  workflows?: WorkflowDefinition[];
}

export interface DynamicAiModuleCapabilityLoader {
  listModuleCapabilities(): Promise<DynamicAiModuleCapability[]>;
}
