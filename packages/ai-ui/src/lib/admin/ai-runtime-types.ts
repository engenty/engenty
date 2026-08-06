// Shared admin/runtime DTO shapes for AI catalog, threads, runs, and the custom registry.
// Consumed by admin pages, TanStack query hooks, and apps/ai HTTP client modules.

import type { AiEffortChoice } from "@engenty/ai-core/browser";
import type { UIMessage } from "ai";
import type { AiInstructionDocument } from "./instruction-settings-api.js";

export type AiCatalogSourceKind = "seed" | "imported" | "user";
export type AiCatalogReferenceKind = "core" | "module" | "import" | "tenant";

export interface AiAgentChatTriggers {
  include_in_chat_picker: boolean;
  is_active: boolean;
  mention_routing_enabled: boolean;
}

/** Workforce role taxonomy derived server-side in GET /ai/registry/agents. */
export type AiAgentRole =
  | "copilot"
  | "coordinator"
  | "specialist"
  | "chat_surface"
  | "external";

/** Where the agent config comes from (server-stamped on registry rows). */
export type AiAgentSource = "builtin" | "module" | "database";

export interface AiRegisteredAgent {
  agent_origin?: "custom" | "registry";
  chat_triggers?: AiAgentChatTriggers;
  description: string | null;
  /**
   * How much thinking this agent's work deserves — the tier-level counterpart
   * of {@link modelOverride}. Absent = inherit. Requires the AI service to
   * persist `effort` on the registry row; until then the PATCH is a no-op.
   */
  effort?: AiEffortChoice | null;
  id: string;
  instruction_keys: string[];
  /** Per-agent operational limits (Phase 4): iteration cap + spend budget. */
  limits?: {
    max_steps?: number | null;
    budget?: { maxCostMicrosPerPeriod?: number | null } | null;
  } | null;
  /** Module owning a synced agent (e.g. "chatbot"); null when not module-managed. */
  managed_by_module?: string | null;
  model?: string;
  /** Per-agent model overrides (Phase 4). Null/absent = inherit tenant defaults. */
  modelOverride?: string | null;
  module_id: string;
  name: string;
  purpose?:
    | "chat"
    | "routing"
    | "research"
    | "planning_coding"
    | "safeguard"
    | null;
  role?: AiAgentRole;
  skills: string[];
  source?: AiAgentSource;
  /** Tool ids from runtime `build_tools` (admin Tools list merges this with skill surfaces). */
  tools?: string[];
}

export interface AiRegisteredAction {
  agent_id: string;
  allowed_tools: string[];
  context_type: string | null;
  default_thread_mode: "reuse" | "new" | "none";
  description: string | null;
  has_input_schema: boolean;
  id: string;
  instruction_keys: string[];
  module_id: string;
  name: string;
  owner_kind?: "core" | "module" | "tenant";
  prompt?: string;
  record_id?: string;
  reference_kind?: AiCatalogReferenceKind;
  skills: string[];
  source_kind?: AiCatalogSourceKind;
  source_reference?: string | null;
}

export interface AiRuntimeTrigger {
  action_id: string | null;
  agent_id?: string | null;
  enabled?: boolean;
  feedback_mode: string | null;
  id: string;
  kind: "ui_trigger";
  module_id: string;
  name?: string;
  route_key?: string;
  trigger_type: string;
}

export interface AiSkillCatalogOrigin {
  module_id: string;
  reference_kind: AiCatalogReferenceKind;
  source_reference: string;
}

export interface AiSkillMetadata {
  [key: string]: string;
}

// File-storage skill tier: `managed` = code-provided (read-only), `custom` =
// uploaded / registry-installed (editable). Carried through the legacy shapes so
// admin UI can badge/gate without a parallel model.
export type AiSkillTier = "managed" | "custom";

export interface AiSkillCatalogEntry {
  allowed_tools: string[];
  compatibility: string | null;
  description: string | null;
  editable?: boolean;
  engenty_modules?: string[];
  license: string | null;
  metadata: AiSkillMetadata;
  name: string;
  origins: AiSkillCatalogOrigin[];
  requires_sandbox?: boolean;
  source?: string;
  tier?: AiSkillTier;
  title: string | null;
}

export interface AiSkillRecord {
  allowed_tools: string[];
  body_markdown: string | null;
  compatibility: string | null;
  created_at: string;
  description: string | null;
  // File-storage tier metadata (managed = read-only, custom = editable).
  editable?: boolean;
  engenty_modules?: string[];
  has_tenant_override: boolean;
  last_seeded_at: string | null;
  last_synced_at: string | null;
  license: string | null;
  metadata: AiSkillMetadata;
  metadata_order: string[];
  name: string;
  owner_id: string;
  owner_kind: "core" | "module" | "tenant";
  record_id: string;
  reference_kind: AiCatalogReferenceKind;
  requires_sandbox?: boolean;
  source_kind: AiCatalogSourceKind;
  source_reference: string | null;
  tenant_id: string | null;
  tier?: AiSkillTier;
  title: string | null;
  updated_at: string;
}

export interface AiFileRecord {
  content_hash: string;
  content_text: string;
  last_seeded_at: string | null;
  last_synced_at: string | null;
  logical_path: string;
  module_id: string;
  owner_key: string;
  owner_type: "skill" | "action" | "agent" | "system";
  reference_kind: AiCatalogReferenceKind;
  source_kind: AiCatalogSourceKind;
  source_reference: string | null;
  tenant_id: string | null;
  updated_at: string;
}

export interface AiActionRecord extends AiRegisteredAction {
  created_at: string;
  has_tenant_override: boolean;
  input_schema_json: Record<string, unknown>;
  last_seeded_at: string | null;
  last_synced_at: string | null;
  owner_id: string;
  owner_kind: "core" | "module" | "tenant";
  record_id: string;
  reference_kind: AiCatalogReferenceKind;
  source_kind: AiCatalogSourceKind;
  source_reference: string | null;
  tenant_id: string | null;
  updated_at: string;
}

export interface CreateAiSkillInput {
  allowed_tools?: string[];
  body_markdown?: string | null;
  compatibility?: string | null;
  description?: string | null;
  license?: string | null;
  metadata?: AiSkillMetadata;
  metadata_order?: string[];
  name: string;
  title?: string | null;
}

export interface UpdateAiSkillInput extends Partial<CreateAiSkillInput> {
  skillId: string;
}

export interface AiAgentRunSummary {
  action_id: string | null;
  agent_id: string;
  created_at: string;
  error: string | null;
  finished_at: string | null;
  id: string;
  request_id: string | null;
  started_at: string | null;
  status:
    | "queued"
    | "running"
    | "waiting_for_input"
    | "waiting_for_approval"
    | "requires_action"
    | "paused"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "timed_out";
  summary: string | null;
  tenant_id: string | null;
  thread_id: string | null;
  trigger: "message" | "command" | "button" | "cron" | "hook" | "direct";
}

export interface AiAgentRunRecord {
  action_id: string | null;
  agent_id: string;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  error: string | null;
  finished_at: string | null;
  id: string;
  request_id: string | null;
  result_json: Record<string, unknown> | null;
  started_at: string | null;
  status: AiAgentRunSummary["status"];
  tenant_id: string | null;
  thread_id: string | null;
  trigger: AiAgentRunSummary["trigger"];
  updated_at: string;
  usage_json: Record<string, unknown> | null;
}

export interface AiRunEventRecord {
  created_at: string;
  event_type: string;
  id: string;
  level: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  run_id: string;
  seq: number;
}

export interface AiAgentEntry {
  agent_origin: "custom" | "registry";
  chat_triggers: AiAgentChatTriggers;
  description: string | null;
  documents: AiInstructionDocument[];
  id: string;
  is_synthetic: boolean;
  kind: "system" | "agent";
  managed_by_module?: string | null;
  model?: string;
  module_id: string;
  name: string;
  role?: AiAgentRole;
  skills: string[];
  source?: AiAgentSource;
  /** Tool ids from runtime registration (merged into admin effective-tools list). */
  tools?: string[];
}

/** Admin introspection of live tool Zod → JSON Schema (developer tools UI). */
export interface AiAgentToolSchemaSnapshot {
  description: string | null;
  input_schema_json: Record<string, unknown> | null;
  output_schema_json: Record<string, unknown> | null;
  tool_id: string;
}

export interface AiRunDetailResult {
  run: AiAgentRunRecord;
  summary: AiAgentRunSummary;
}

export interface AiRunEventsResult {
  events: AiRunEventRecord[];
  run_id: string;
}

export interface AiThreadRecord {
  created_at: string;
  current_agent_id: string | null;
  id: string;
  last_message_at: string | null;
  route_context: Record<string, unknown>;
  status: "idle" | "running" | "waiting" | "failed" | "completed";
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  user_id: string;
}

export type AiThreadMessage = UIMessage & {
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export interface AiServiceThreadRecord {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  created_by_user_id: string;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  status: AiThreadRecord["status"];
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

export interface AiServiceThreadMessage {
  author_user_id: string | null;
  created_at: string;
  id: string;
  parts: unknown;
  role: "assistant" | "system" | "tool" | "user";
  tenant_id: string;
  thread_id: string;
}

export interface CreateAiThreadInput {
  context?: {
    moduleId?: string;
    pathname?: string;
    routeKey?: string;
    scope?: Record<string, unknown> | null;
  };
  requestedAgentId?: string;
  threadId?: string;
  title?: string;
}

export interface UpdateAiThreadInput {
  agent_id?: string | null;
  current_agent_id?: string | null;
  threadId: string;
  title?: string | null;
}

/** Tenant-wide orchestrator threads (admin observability). */
export interface AiAdminThreadRow {
  created_at: string;
  current_agent_id: string | null;
  id: string;
  last_action_id: string | null;
  last_message_at: string | null;
  route_context: Record<string, unknown>;
  status: AiThreadRecord["status"];
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  user_id: string;
}

export interface AiAdminThreadStats {
  last_message_at: string | null;
  runs_total: number;
  threads_by_status: Record<AiThreadRecord["status"], number>;
  threads_total: number;
}

export interface CustomAgentConfig {
  description?: string;
  id: string;
  instructions: string;
  /** Server-derived on GET responses; never sent on create/update. */
  managed_by_module?: string | null;
  model: string;
  name: string;
  /** Server-derived on GET responses; never sent on create/update. */
  role?: AiAgentRole;
  skillIds: string[];
  /** Server-stamped provenance on GET responses. */
  source?: AiAgentSource;
  subAgents?: { id: string; alias?: string }[];
  toolIds: string[];
}

export interface CustomToolConfig {
  description?: string;
  endpointUrl: string;
  id: string;
  name: string;
  schemaJson: Record<string, unknown>;
}

/** Unified registry tool entry returned by GET /ai/registry/tools.
 *  Module/MCP tools carry a `source` field stamped by apps/ai; custom DB tools may also
 *  carry an `engenty_mcp_app` metadata field for MCP-backed tools.
 */
export interface AiRegistryTool extends CustomToolConfig {
  /** Optional MCP app name stamped for MCP-backed tools. */
  engenty_mcp_app?: string;
  /** Source string stamped by apps/ai (absent on plain custom DB tools). */
  source?: string;
}
