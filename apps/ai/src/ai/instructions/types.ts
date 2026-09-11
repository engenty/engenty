// Instruction-editing contract for apps/ai. Mirrors the shape the admin UI
// (`@engenty/ai-ui` instruction-settings-api) expects. Base/agent/module/action
// layers are derived live from the registry; only the two override layers are
// persisted (see ai.engenty_instruction_overrides).

export type InstructionEditScope = "tenant" | "user";

export type InstructionLayer =
  | "system"
  | "tenant"
  | "module"
  | "agent"
  | "workflow"
  | "tenant_override"
  | "user_override";

export type InstructionSourceKind =
  | "seed"
  | "user"
  | "agent_proposal"
  | "agent_approved";

export interface AiInstructionDocument {
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  document_key: string;
  id: string;
  is_active: boolean;
  layer: InstructionLayer;
  metadata: Record<string, unknown>;
  module_id: string;
  source_kind: InstructionSourceKind;
  tenant_id: string | null;
  title: string;
  updated_at: string;
  updated_by_user_id: string | null;
  version: number;
}

export interface AiInstructionChange {
  approved_at: string | null;
  approved_by_user_id: string | null;
  change_reason: string | null;
  created_at: string;
  id: string;
  instruction_doc_id: string;
  next_body: string;
  previous_body: string | null;
  proposed_by_run_id: string | null;
  status: "proposed" | "approved" | "rejected" | "applied";
}

export const EDIT_SCOPE_TO_LAYER: Record<
  InstructionEditScope,
  "tenant_override" | "user_override"
> = {
  tenant: "tenant_override",
  user: "user_override",
};

export function isInstructionEditScope(
  value: string | undefined
): value is InstructionEditScope {
  return value === "tenant" || value === "user";
}
