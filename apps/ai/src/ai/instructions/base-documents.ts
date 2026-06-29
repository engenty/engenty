// Base (non-override) instruction documents, derived live from the AI registry.
//
// Since the schema-split, base prompt content is file-derived: each registered
// agent owns one editable AGENTS.md whose body is its assembled instructions.
// These documents are never stored — they are computed on demand and merged with
// the persisted tenant/user overrides to form the admin catalog.

import { buildAgentInstructions } from "../registry/assemble-dynamic-agent.js";
import type { AgentConfig, AiRegistry } from "../registry/types.js";
import type { AiInstructionDocument } from "./types.js";

/** Stable instruction-store key for an agent's AGENTS.md (e.g. `engenty.copilot.agents`). */
export function agentInstructionDocumentKey(agentId: string): string {
  return `${agentId}.agents`;
}

/** Module bucket for an agent id, matching the admin catalog's grouping. */
function moduleIdForAgent(agentId: string): string {
  if (agentId.startsWith("engenty.")) {
    return "engenty";
  }
  return agentId.split(".")[0] ?? "engenty";
}

function toBaseDocument(
  config: AgentConfig,
  nowIso: string
): AiInstructionDocument {
  const documentKey = agentInstructionDocumentKey(config.id);
  return {
    body: buildAgentInstructions(config),
    created_at: nowIso,
    created_by_user_id: null,
    document_key: documentKey,
    // Base docs are file-derived, so the key doubles as a stable id.
    id: documentKey,
    is_active: true,
    layer: "agent",
    metadata: {
      filename: "AGENTS.md",
      owner_id: config.id,
      owner_kind: "agent",
    },
    module_id: moduleIdForAgent(config.id),
    source_kind: "seed",
    tenant_id: null,
    title: config.name ?? config.id,
    updated_at: nowIso,
    updated_by_user_id: null,
    version: 1,
  };
}

type ListableRegistry = AiRegistry & {
  listAgentConfigs?: () => Promise<AgentConfig[]>;
};

async function listAgentConfigs(registry: AiRegistry): Promise<AgentConfig[]> {
  const listable = registry as ListableRegistry;
  if (typeof listable.listAgentConfigs === "function") {
    return await listable.listAgentConfigs();
  }
  return [];
}

/** All file-derived base documents (one AGENTS.md per registered agent). */
export async function listBaseInstructionDocuments(
  registry: AiRegistry,
  nowIso: string
): Promise<AiInstructionDocument[]> {
  const configs = await listAgentConfigs(registry);
  return configs.map((config) => toBaseDocument(config, nowIso));
}

/** The single base document for a key, or null when no agent owns it. */
export async function getBaseInstructionDocumentByKey(
  registry: AiRegistry,
  documentKey: string,
  nowIso: string
): Promise<AiInstructionDocument | null> {
  const configs = await listAgentConfigs(registry);
  const match = configs.find(
    (config) => agentInstructionDocumentKey(config.id) === documentKey
  );
  return match ? toBaseDocument(match, nowIso) : null;
}
