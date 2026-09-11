import type { AgentSessionStatus as WireAgentSessionStatus } from "@engenty/ai-core/browser";

export const DEFAULT_COPILOT_AGENT_TYPE_KEY = "engenty.copilot";

/** Wire status plus the client-synthetic "draft" (unsaved thread). */
export type AgentThreadStatus = WireAgentSessionStatus | "draft";

export interface AgentThreadDto {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  created_by_user_id: string;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  /**
   * The space this conversation belongs to (PLAN-spaces.md Phase C2).
   *
   * Null on a thread from before the backfill. Worth carrying on the wire
   * rather than inferring from the URL: they are exactly the two things that
   * can disagree, and when they do the run follows the THREAD — so a chat can
   * be answering with another space's tools while the address bar says
   * otherwise, which is only visible if both numbers are in hand.
   */
  space_id: string | null;
  status: AgentThreadStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

export interface AgentThreadMessageDto {
  author_user_id: string | null;
  created_at: string;
  id: string;
  parts: unknown;
  role: string;
  tenant_id: string;
  thread_id: string;
}
