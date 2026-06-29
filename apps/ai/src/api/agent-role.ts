// Display-only workforce taxonomy for the admin agents catalog (ui-6 §"Agent role model").
// Derived at the registry response boundary — never baked into AgentConfig rows.

export type AgentRole =
  | "copilot"
  | "coordinator"
  | "specialist"
  | "chat_surface"
  | "external";

interface AgentRoleInput {
  id: string;
}

/** Agents whose id starts with a key here are synced/owned by that module. */
const MODULE_SYNCED_ID_PREFIXES: Readonly<Record<string, string>> = {
  "chatbot.": "chatbot",
};

const COPILOT_AGENT_ID = "engenty.copilot";
const COORDINATOR_AGENT_ID = "engenty.coordinator";
const CHAT_SURFACE_ID_SUFFIX = ".answers";

export function resolveManagedByModule(config: AgentRoleInput): string | null {
  for (const [prefix, moduleId] of Object.entries(MODULE_SYNCED_ID_PREFIXES)) {
    if (config.id.startsWith(prefix)) {
      return moduleId;
    }
  }
  return null;
}

export function resolveAgentRole(config: AgentRoleInput): AgentRole {
  if (config.id === COPILOT_AGENT_ID) {
    return "copilot";
  }
  if (config.id === COORDINATOR_AGENT_ID) {
    return "coordinator";
  }
  if (resolveManagedByModule(config) !== null) {
    return "external";
  }
  if (config.id.endsWith(CHAT_SURFACE_ID_SUFFIX)) {
    return "chat_surface";
  }
  return "specialist";
}

/** Decorate a registry agent row with `role` + `managed_by_module` for API responses. */
export function decorateAgentWithRole<T extends AgentRoleInput>(
  config: T
): T & { managed_by_module: string | null; role: AgentRole } {
  return {
    ...config,
    managed_by_module: resolveManagedByModule(config),
    role: resolveAgentRole(config),
  };
}
