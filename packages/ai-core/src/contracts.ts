/**
 * AI Core – contracts for route context and module registration.
 */
import type { TriggerDefinition } from "./copilot-trigger-contracts.js";
import type { AgentConfig } from "./dynamic-contracts.js";

/** Route + module context passed from UI (pathname, module, route, scope). */
export interface AiRouteContext {
  moduleId: string;
  pathname?: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}

/** Additional skill metadata values projected from the Agent Skills spec. */
export interface SkillMetadataDefinition {
  [key: string]: string;
}

/** Durable instruction document seed definition. */
export interface InstructionDocumentDefinition {
  default_body: string;
  filename?: string;
  id: string;
  key: string;
  // `system` is reserved for installation-wide defaults (unused today); `tenant`
  // is the tenant-wide base layer that module/agent layers refine.
  layer: "system" | "tenant" | "module" | "agent";
  module_id: string;
  owner_id?: string;
  owner_kind?: "system" | "tenant" | "module" | "agent" | "workflow";
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
  | "workflow"
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

/**
 * Pre-approved tool ids for an action (`metadata.allowed_tools` on the workflow definition).
 * When set, the orchestrator intersects this list with the agent tool surface (no deny-list).
 */
export type WorkflowAllowedTools = string[];

/**
 * A verbatim Mastra `DynamicWorkflowGraph` in its JSON form — nothing
 * engenty-specific in the definition itself. Engenty-side metadata that is
 * not Mastra's (`owner_agent_id`, `context_type`, `allowed_tools`, `skills`,
 * `title`) rides in `metadata`.
 */
export interface WorkflowGraphDefinition {
  description?: string;
  graph: Record<string, unknown>[];
  id: string;
  inputSchema: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requestContextSchema?: Record<string, unknown>;
  stateSchema?: Record<string, unknown>;
}

/**
 * An Action: a module-shipped workflow (`ai/workflows/<id>.workflow.json`).
 * The `definition` is the stored artifact; everything else is convenience
 * derived from it (and its `metadata`) at load so callers need not re-parse.
 */
export interface WorkflowDefinition {
  /** From `metadata.allowed_tools`. */
  allowed_tools?: WorkflowAllowedTools;
  /** From `metadata.context_type` — the record kind a press is about. */
  context_type?: string;
  definition: WorkflowGraphDefinition;
  description?: string;
  id: string;
  module_id: string;
  /** Display name — `metadata.title`, falling back to the id. */
  name: string;
  /** From `metadata.owner_agent_id`; null/absent = library (decision B). */
  owner_agent_id?: string | null;
  /** From `metadata.skills`. */
  skills?: string[];
  /**
   * From `metadata.surface`. `wizard`: a person walks the run one gate per
   * page; it is listed in the catalog and as a slash command. Absent = chat.
   */
  surface?: "chat" | "wizard";
}

/**
 * A declared trigger (agent.json `triggers:`) — a binding on the SPECIALIST
 * (decision A): wake `schedule|event|manual` → run a module workflow with an
 * input mapping. At runtime these are reconciled into `ai.routines` rows
 * (source `'module'`); `scope: "space"` fans out one row per space mounting
 * the module, `scope: "tenant"` keeps one tenant-global row. Each fire starts
 * a Run — never a Task.
 */
export interface RoutineDefinition {
  /** The owning specialist — the agent whose agent.json declares it. */
  agent_id: string;
  /** Cron expression (schedule kind). */
  cron?: string | null;
  description?: string;
  enabled_by_default: boolean;
  /** Event-kind filter over the provider's payloads. */
  event_filter?: Record<string, unknown> | null;
  id: string;
  /** Static input + mapped context handed to the workflow at fire. */
  input_mapping?: Record<string, unknown>;
  kind: "event" | "manual" | "schedule";
  module_id: string;
  name: string;
  /** Event-kind source provider. */
  provider_id?: string | null;
  /** Optional `"HH:MM-HH:MM"` UTC window during which the trigger never fires. */
  quiet_hours?: string | null;
  /** Event-kind resource selector. */
  resource?: string | null;
  /** One row per mounting space, or one tenant-global row. Default: space. */
  scope: "space" | "tenant";
  suppress_if_no_op?: boolean;
  timezone?: string | null;
  /** The module workflow this trigger runs (e.g. `inbox.sync`). */
  workflow: string;
}

/**
 * A destination a routine fire can deliver to. Registered like module
 * workflows — not a closed enum. Built-ins (`desk.chat`, …) live in
 * apps/ai; a plugin sets `operationId` and core invokes that operation
 * with `{ config, payload, envelope }`.
 */
export type JsonSchema = Record<string, unknown>;

export interface OutcomeProviderDefinition {
  /** Standing settings (address, webhook URL, target agent). */
  configSchema: JsonSchema;
  description: string;
  id: string;
  label: string;
  moduleId: string;
  /** Plugin providers deliver by invoking this gateway operation. */
  operationId?: string;
  /** What the run passes, beyond the shared envelope. */
  payloadSchema: JsonSchema;
}

/**
 * A job a module needs a model for, declared alongside its tools and agents.
 *
 * Without this a module that wants its own model — a coder that plans with one
 * model and edits with another, an OCR pass with a vision model — has to either
 * hard-code an id or push a new platform-wide purpose. Both make the platform
 * responsible for knowing what jobs a module invents. Declaring the role
 * instead means the module says what it needs, and a superadmin decides what
 * fills it.
 */
export interface ModelRoleDefinition {
  /** Seed model id, used until someone rebinds the role. */
  default_model_id: string;
  /** Shown in the binding console. */
  label: string;
  /**
   * Namespaced by convention (`coder.plan`), because role ids share one table
   * across every installed module.
   */
  role: string;
}

export interface AiRegistration {
  /** Chat slash commands declared via ai/commands/<name>/COMMAND.md. */
  chat_commands?: import("./chat-commands/contracts.js").ChatCommandDefinition[];
  dynamic?: AiRegistrationDynamicCapability;
  instruction_documents?: InstructionDocumentDefinition[];
  model_roles?: ModelRoleDefinition[];
  module_id: string;
  outcome_providers?: OutcomeProviderDefinition[];
  routines?: RoutineDefinition[];
  skills?: SkillDefinition[];
  triggers?: TriggerDefinition[];
  workflows?: WorkflowDefinition[];
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
