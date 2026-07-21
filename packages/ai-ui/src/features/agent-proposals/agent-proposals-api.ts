// Agent-registry governance client — agent-created agents/revisions land as
// proposals (never live); this surface lists them and lets an admin approve
// or reject. Backend: /ai/registry/agent-records + agents/:id/approve|reject
// (apps/ai registry-routes; approve/reject are deliberately not agent tools).

import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export type AgentRecordStatus = "proposed" | "active" | "archived";

export interface AgentRecordConfig {
  description?: string;
  id: string;
  instructions: string;
  model: string;
  name: string;
  skillIds?: string[];
  toolIds?: string[];
}

export interface AgentRecord {
  config: AgentRecordConfig;
  created_by_agent: string | null;
  proposed_config: Record<string, unknown> | null;
  status: AgentRecordStatus;
  updated_at: string;
}

/** One approvable item: a brand-new proposed agent or a pending revision. */
export interface PendingAgentProposal {
  agentId: string;
  createdByAgent: string | null;
  /** Config under review: the row itself (new) or the parked revision. */
  description: string;
  instructions: string;
  kind: "new_agent" | "revision";
  name: string;
  skillIds: string[];
  toolIds: string[];
  updatedAt: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Flatten governance records into the approvable list. A 'proposed' row is a
 * new agent under review; an active row with proposed_config is a pending
 * revision (the agent keeps running its approved config meanwhile).
 */
export function selectPendingProposals(
  records: AgentRecord[]
): PendingAgentProposal[] {
  const pending: PendingAgentProposal[] = [];
  for (const record of records) {
    if (record.status === "proposed") {
      pending.push({
        agentId: record.config.id,
        createdByAgent: record.created_by_agent,
        description: record.config.description ?? "",
        instructions: record.config.instructions,
        kind: "new_agent",
        name: record.config.name,
        skillIds: record.config.skillIds ?? [],
        toolIds: record.config.toolIds ?? [],
        updatedAt: record.updated_at,
      });
      continue;
    }
    if (record.status === "active" && record.proposed_config) {
      const revision = record.proposed_config;
      pending.push({
        agentId: record.config.id,
        createdByAgent: record.created_by_agent,
        description:
          typeof revision.description === "string"
            ? revision.description
            : (record.config.description ?? ""),
        instructions:
          typeof revision.instructions === "string"
            ? revision.instructions
            : record.config.instructions,
        kind: "revision",
        name:
          typeof revision.name === "string"
            ? revision.name
            : record.config.name,
        skillIds: asStringArray(revision.skill_ids ?? revision.skillIds),
        toolIds: asStringArray(revision.tool_ids ?? revision.toolIds),
        updatedAt: record.updated_at,
      });
    }
  }
  return pending.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAgentRecords(
  signal?: AbortSignal
): Promise<AgentRecord[]> {
  const data = await requestAiServiceJson<{ records?: AgentRecord[] }>(
    "/ai/registry/agent-records",
    { signal }
  );
  return data.records ?? [];
}

export async function approveAgentProposal(agentId: string): Promise<void> {
  await requestAiServiceJson(
    `/ai/registry/agents/${encodeURIComponent(agentId)}/approve`,
    { method: "POST" }
  );
}

export async function rejectAgentProposal(agentId: string): Promise<void> {
  await requestAiServiceJson(
    `/ai/registry/agents/${encodeURIComponent(agentId)}/reject`,
    { method: "POST" }
  );
}
