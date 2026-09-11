import type { AiRegisteredAction } from "../../lib/admin/ai-runtime-api";

/**
 * Read-only view model of one module-shipped workflow action. Actions are
 * defined in code, so this only normalizes the registry row for rendering —
 * there is nothing to author or persist from here.
 */
export interface ActionDraft {
  action_key: string;
  /** Owning specialist id; empty = the shared library. */
  agent_id: string;
  /** Tool ids the workflow may use. */
  allowed_tools: string[];
  /** Subject entity type the action is bound to; empty = none. */
  context_type: string;
  description: string;
  /** The workflow's inputSchema. */
  input_schema_json: Record<string, unknown>;
  module_id: string;
  name: string;
  skills: string[];
}

export function createEmptyActionDraft(): ActionDraft {
  return {
    action_key: "",
    agent_id: "",
    allowed_tools: [],
    context_type: "",
    description: "",
    input_schema_json: { type: "object" },
    module_id: "engenty-core",
    name: "",
    skills: [],
  };
}

function cloneJsonObject(value: Record<string, unknown> | null | undefined) {
  return JSON.parse(
    JSON.stringify(
      value && typeof value === "object" && !Array.isArray(value) ? value : {}
    )
  ) as Record<string, unknown>;
}

export function createActionDraft(action: AiRegisteredAction): ActionDraft {
  return {
    action_key: action.id,
    agent_id: action.agent_id ?? "",
    allowed_tools: [...action.allowed_tools],
    context_type: action.context_type ?? "",
    description: action.description ?? "",
    input_schema_json: cloneJsonObject(action.input_schema_json),
    module_id: action.module_id?.trim() || "engenty-core",
    name: action.name,
    skills: [...action.skills],
  };
}
