export const DEFAULT_COPILOT_AGENT_TYPE_KEY = "engenty.copilot";

export type AgentSessionStatus =
  | "draft"
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "completed";

export interface AgentSessionDto {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  created_by_user_id: string;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  status: AgentSessionStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

export interface AgentSessionMessageDto {
  author_user_id: string | null;
  created_at: string;
  id: string;
  parts: unknown;
  role: string;
  tenant_id: string;
  thread_id: string;
}
