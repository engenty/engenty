/**
 * AI Core – contracts for route context, module registration, and agent definitions.
 */
import type { ZodType } from "zod";
import type { TriggerDefinition } from "./copilot-trigger-contracts.js";
import type { AgentConfig } from "./dynamic-contracts.js";
import type { ToolExecutionContext } from "./tools/types.js";

/** Route + module context passed from UI (pathname, module, route, scope). */
export interface AiRouteContext {
  moduleId: string;
  pathname?: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}

export interface ArtifactDefinition {
  id: string;
  schema: unknown;
}

/** Additional skill metadata values projected from the Agent Skills spec. */
export interface SkillMetadataDefinition {
  [key: string]: string;
}

/** Execution source and scope for a run. */
export interface ExecutionScope {
  role: string | null;
  scope_id: string | null;
  source: "user" | "automation" | "system";
  tenant_id: string | null;
  user_id: string | null;
}

/** Durable instruction document seed definition. */
export interface InstructionDocumentDefinition {
  default_body: string;
  filename?: string;
  id: string;
  key: string;
  // `system` is reserved for installation-wide defaults (unused today); `tenant`
  // is the tenant-wide base layer that module/agent/action layers refine.
  layer: "system" | "tenant" | "module" | "agent" | "action";
  module_id: string;
  owner_id?: string;
  owner_kind?: "system" | "tenant" | "module" | "agent" | "action";
  title: string;
}

/** Stable runtime skill definition aligned with the Agent Skills model. */
export interface SkillDefinition {
  /** Allowed tool ids; persisted from Agent Skills `allowed-tools` (space-delimited in SKILL.md). */
  allowed_tools?: string[];
  /**
   * When the persisted seed UUID was originally derived from a different string
   * (e.g. legacy dotted ids), set this so `toStableCatalogSeedUuid` stays stable
   * after renaming `name` to a spec-compliant slug.
   */
  catalog_seed_key?: string;
  compatibility?: string;
  description: string;
  license?: string;
  metadata?: SkillMetadataDefinition;
  /** Spec `name`: kebab-case slug (max 64, [a-z0-9-]). */
  name: string;
  /** Engenty plugin: human-readable title (not in agentskills.io root schema). */
  title?: string | null;
}

/** Persisted instruction layer kinds used by the DB-backed runtime. */
export type InstructionDocumentLayer =
  | "system"
  | "tenant"
  | "module"
  | "agent"
  | "action"
  | "tenant_override"
  | "user_override";

/** Origin for a persisted instruction document body. */
export type InstructionDocumentSourceKind =
  | "seed"
  | "user"
  | "agent_proposal"
  | "agent_approved";

/** Serializable module agent metadata for apps/ai dynamic assembly. */
export interface AiRegistrationDynamicCapability {
  agent_configs?: AgentConfig[];
  skills?: Record<string, string>;
}

/** Stable orchestrator agent/persona definition. */
export interface AgentDefinition {
  artifacts?: ArtifactDefinition[];
  build_system_prompt?: (params: {
    action?: ActionDefinition<ZodType> | null;
    context: Record<string, unknown>;
    scope: ExecutionScope;
  }) => Promise<string> | string;
  build_tools: (context: ToolExecutionContext) => Record<string, object>;
  description?: string;
  id: string;
  instruction_keys: string[];
  module_id: string;
  name: string;
  /** Bound skill ids (kebab), same storage style as Agent Skills `allowed-tools` in ACTION.md (space-delimited). */
  skills?: string[];
}

/**
 * Pre-approved tool ids for an action (Agent Skills `allowed-tools`: space-delimited in ACTION.md).
 * When set, the orchestrator intersects this list with the agent tool surface (no deny-list).
 */
export type ActionAllowedTools = string[];

/** Narrow execution harness. This remains the main guardrail surface for orchestrated runs. */
export interface ActionDefinition<TInput extends ZodType = ZodType> {
  agent_id: string;
  /**
   * Optional allow list of tool ids (same semantics as {@link SkillDefinition.allowed_tools}).
   * @see https://agentskills.io/specification
   */
  allowed_tools?: ActionAllowedTools;
  context_type?: string;
  default_thread_mode: "reuse" | "new" | "none";
  description?: string;
  id: string;
  input_schema: TInput;
  /**
   * JSON Schema as authored (e.g. in ACTION.md), including `description` on properties.
   * When set, catalog seeding uses this instead of `z.toJSONSchema(input_schema)` so metadata is preserved.
   */
  input_schema_json?: Record<string, unknown>;
  instruction_keys?: string[];
  module_id: string;
  name: string;
  prompt: string;
  skills?: string[];
}

// A routine creates a Task — the only target kind. (Legacy `agent_prompt` /
// `action` kinds retired; headless agent prompts are system jobs in apps/ai.
// See docs/content/wip/agent-platform/actions-tasks-routines-concept.md.)
export type RoutineTargetKind = "task_template";

/** Task payload created by a routine each due tick. */
export interface RoutineTaskTemplate {
  agent_type_key: string;
  description?: string;
  priority?: string;
  title: string;
}

/** What a routine creates when due: a Task. */
export interface RoutineTarget {
  kind: "task_template";
  task_template: RoutineTaskTemplate;
}

/**
 * Declared recurring work (module ROUTINE.md). A Routine = `Trigger(schedule)
 * → Task`. At runtime these declarations are reconciled into
 * `module_tasks.triggers` rows (source `'module'`) backed by Mastra
 * heartbeats — see apps/ai `src/scheduler/`.
 */
export interface RoutineDefinition {
  description?: string;
  enabled_by_default: boolean;
  id: string;
  module_id: string;
  name: string;
  /** Optional `"HH:MM-HH:MM"` UTC window during which the routine never fires. */
  quiet_hours?: string | null;
  /** Cron expression, UTC. */
  schedule: string;
  suppress_if_no_op?: boolean;
  target: RoutineTarget;
}

/** Registry payload for module AI registration. */
export interface AiRegistration {
  actions?: ActionDefinition[];
  agents?: AgentDefinition[];
  dynamic?: AiRegistrationDynamicCapability;
  instruction_documents?: InstructionDocumentDefinition[];
  module_id: string;
  routines?: RoutineDefinition[];
  skills?: SkillDefinition[];
  triggers?: TriggerDefinition[];
}

/** Persisted runtime instruction document. */
export interface InstructionDocumentRecord {
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  document_key: string;
  id: string;
  is_active: boolean;
  layer: InstructionDocumentLayer;
  metadata: Record<string, unknown>;
  module_id: string;
  source_kind: InstructionDocumentSourceKind;
  tenant_id: string | null;
  title: string;
  updated_at: string;
  updated_by_user_id: string | null;
  version: number;
}

/** Wire/DB status of an agent session (`agent_session_status_check`).
 * Client-synthetic states (e.g. "draft" for unsaved sessions) are UI-layer
 * extensions and must never appear on the wire. */
export type AgentSessionStatus =
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "completed";

/** Orchestrator thread (cross-agent session container). */
export interface OrchestratorThreadRecord {
  current_agent_id: string | null;
  id: string;
  last_action_id: string | null;
  last_message_at: string | null;
  route_context: Record<string, unknown>;
  status: AgentSessionStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  user_id: string;
  workspace_id: string | null;
}
