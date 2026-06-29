import type {
  AiAgentChatTriggers,
  AiAgentEntry,
  AiRegisteredAction,
  AiRegisteredAgent,
  AiRuntimeTrigger,
} from "../../lib/admin/ai-runtime-api";
import type { AiInstructionDocument } from "../../lib/admin/instruction-settings-api";
import { toAiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";

/** `module_id` values for agents registered from apps/core (copilot, dashboard, etc.). */
const CORE_AGENT_MODULE_IDS = new Set(["dashboard", "engenty", "engenty-core"]);

export function isCoreAgentModuleId(moduleId: string) {
  return CORE_AGENT_MODULE_IDS.has(moduleId);
}

/** Sort catalog rows: core `module_id` first, then `module_id` + `name`. */
export function compareCoreModuleThenModuleName<
  T extends { module_id: string; name: string },
>(left: T, right: T): number {
  const leftCore = isCoreAgentModuleId(left.module_id);
  const rightCore = isCoreAgentModuleId(right.module_id);
  if (leftCore !== rightCore) {
    return leftCore ? -1 : 1;
  }
  return `${left.module_id}:${left.name}`.localeCompare(
    `${right.module_id}:${right.name}`
  );
}

const DEFAULT_CHAT_TRIGGERS: AiAgentChatTriggers = {
  include_in_chat_picker: true,
  is_active: true,
  mention_routing_enabled: true,
};

function isCopilotSyntheticOwner(ownerId: string) {
  return ownerId === "engenty.copilot";
}

function fallbackAgentName(ownerId: string) {
  if (isCopilotSyntheticOwner(ownerId)) {
    return "Engenty";
  }
  return ownerId
    .split(".")
    .map((part) =>
      part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part
    )
    .join(" ");
}

export function buildAgentCatalogEntries(params: {
  agents: AiRegisteredAgent[];
  documents: AiInstructionDocument[];
}) {
  const documentsByOwner = new Map<string, AiInstructionDocument[]>();
  for (const document of params.documents) {
    const fileDocument = toAiInstructionFileDocument(document);
    if (
      fileDocument.owner_kind !== "agent" &&
      !(
        (fileDocument.owner_kind === "system" ||
          fileDocument.owner_kind === "tenant") &&
        isCopilotSyntheticOwner(fileDocument.owner_id)
      )
    ) {
      continue;
    }
    const existing = documentsByOwner.get(fileDocument.owner_id) ?? [];
    existing.push(document);
    documentsByOwner.set(fileDocument.owner_id, existing);
  }

  const entries = new Map<string, AiAgentEntry>();
  for (const agent of params.agents) {
    entries.set(agent.id, {
      agent_origin: agent.agent_origin ?? "registry",
      chat_triggers: agent.chat_triggers ?? DEFAULT_CHAT_TRIGGERS,
      description: agent.description,
      documents: documentsByOwner.get(agent.id) ?? [],
      id: agent.id,
      is_synthetic: false,
      kind: "agent",
      managed_by_module: agent.managed_by_module ?? null,
      module_id: agent.module_id,
      name: agent.name,
      skills: agent.skills ?? [],
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.role ? { role: agent.role } : {}),
      ...(agent.source ? { source: agent.source } : {}),
      ...(agent.tools?.length ? { tools: agent.tools } : {}),
    });
  }

  for (const [ownerId, documents] of documentsByOwner) {
    if (entries.has(ownerId)) {
      continue;
    }
    entries.set(ownerId, {
      agent_origin: "registry",
      chat_triggers: DEFAULT_CHAT_TRIGGERS,
      description: isCopilotSyntheticOwner(ownerId)
        ? "Built-in copilot (general chat)."
        : null,
      documents,
      id: ownerId,
      is_synthetic: true,
      kind: "agent",
      module_id: ownerId.startsWith("engenty.")
        ? "engenty"
        : (documents[0]?.module_id ?? "unknown"),
      name: fallbackAgentName(ownerId),
      skills: [],
    });
  }

  return Array.from(entries.values()).toSorted(compareCoreModuleThenModuleName);
}

export function filterAgentActions(
  actions: AiRegisteredAction[],
  agentId: string
) {
  return actions.filter((action) => action.agent_id === agentId);
}

export function filterAgentTriggers(
  triggers: AiRuntimeTrigger[],
  params: { agentId: string }
) {
  return triggers.filter(
    (trigger) => trigger.module_id === params.agentId.split(".")[0]
  );
}
