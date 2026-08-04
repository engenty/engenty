import { z } from "zod";
// Type-only import — contracts.ts imports AgentConfig from this file, so keep
// this cycle erased at runtime.
import type { ActionDefinition, RoutineDefinition } from "./contracts.js";
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
  // `goal`/`project` are the containment tiers above a bound task (resolved
  // via work-scope's visibility chain — see apps/ai resolve-work-visibility).
  // `group` is reserved for a future tenant-group concept (unused now).
  scope: z.enum([
    "tenant",
    "user",
    "agent",
    "task",
    "goal",
    "project",
    "group",
    "sandbox",
  ]),
  // `commons` is a writable tenant-shared scratch space (durable, cross-user/
  // cross-session). Tenant AGENTS.md/SOUL.md reach the agent via prompt
  // injection (instruction registry), not a filesystem mount.
  source: z.enum([
    "commons",
    "home",
    "skills",
    "checkout",
    "goal",
    "project",
    "sandbox",
  ]),
  access: z.enum(["ro", "rw"]),
  // Only mount when the session is bound to that scope's entity (e.g. a task).
  requireBinding: z.boolean().optional(),
});

export type AgentWorkspaceMount = z.infer<typeof agentWorkspaceMountSchema>;

const agentWorkspaceSandboxRuntimeSchema = z.enum(["node", "python"]);

const agentWorkspaceSandboxSchema = z.object({
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
});

export type AgentWorkspaceConfig = z.infer<typeof agentWorkspaceConfigSchema>;

/** Purpose an agent binds to for tenant model resolution (Phase 4). */
export const agentModelPurposeSchema = z.enum([
  "chat",
  "routing",
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

export const agentConfigSchema = z.object({
  backgroundTasks: agentBackgroundConfigSchema.optional(),
  description: z.string().optional(),
  guardrails: agentGuardrailsConfigSchema.optional(),
  id: z.string().min(1),
  instructions: z.string().min(1),
  /** Per-agent operational limits (iteration cap, …). */
  limits: agentLimitsConfigSchema.optional(),
  model: z.string().min(1),
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
  skillIds: z.array(z.string().min(1)).default([]),
  source: z.enum(["builtin", "module", "database"]).optional(),
  subAgents: z.array(agentSubAgentConfigSchema).optional(),
  toolIds: z.array(z.string().min(1)).default([]),
  // Optional per-agent workspace request (filesystem + skills + sandbox).
  workspace: agentWorkspaceConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

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

// Serializable ActionDefinition for the cross-process capability channel:
// drops the zod `input_schema` and requires the JSON Schema form instead.
// apps/ai re-materializes the zod schema with `z.fromJSONSchema` on load.
export type ModuleActionCapability = Omit<
  ActionDefinition,
  "input_schema" | "input_schema_json"
> & {
  input_schema_json: Record<string, unknown>;
};

/** Project a registered action onto the serializable capability shape. */
export function toModuleActionCapability(
  action: ActionDefinition
): ModuleActionCapability {
  const { input_schema, input_schema_json, ...rest } = action;
  return {
    ...rest,
    // Prefer the authored JSON Schema (keeps property descriptions); fall back
    // to converting the zod schema for code-registered actions.
    input_schema_json:
      input_schema_json ??
      (z.toJSONSchema(input_schema as z.ZodType) as Record<string, unknown>),
  };
}

export interface DynamicAiModuleCapability {
  // Serializable ACTION.md definitions declared by the module.
  actions?: ModuleActionCapability[];
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
  // ROUTINE.md definitions (already plain JSON data).
  routines?: RoutineDefinition[];
  // Raw SKILL.md markdown by skill name. Seed channel only: published into the
  // tenant's read-only `managed` skills tier; never resolved at runtime (agents
  // load skills via the Mastra Workspace skill tools).
  skills?: Record<string, string>;
  tools?: Record<string, MastraToolDefinition>;
}

export interface DynamicAiModuleCapabilityLoader {
  listModuleCapabilities(): Promise<DynamicAiModuleCapability[]>;
}
