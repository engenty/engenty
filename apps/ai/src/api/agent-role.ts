// Workforce taxonomy at the registry response boundary (ui-6 §"Agent role model").
// Derived from the DECLARED `kind`/`interfaceRole`/`moduleId` on the config —
// never from the id string.

/** Display vocabulary API responses carry; UIs switch on it. */
export type AgentRole =
  | "chat_surface"
  | "coordinator"
  | "copilot"
  | "delegated"
  | "external"
  | "specialist";

interface AgentRoleInput {
  id: string;
  interfaceRole?: "background" | "live" | "remote" | null;
  kind?: "chat_surface" | "delegated" | "interface" | "specialist" | null;
  moduleId?: string | null;
  /** Present on full `AgentConfig` rows; absent on id-only callers. */
  workspace?: { sandbox?: { enabled?: boolean } | null } | null;
}

export function resolveManagedByModule(config: AgentRoleInput): string | null {
  return config.moduleId ?? null;
}

export function resolveAgentRole(config: AgentRoleInput): AgentRole {
  switch (config.kind) {
    case "interface":
      if (config.interfaceRole === "background") {
        return "coordinator";
      }
      // A remote interface answers users on someone else's surface.
      return config.interfaceRole === "remote" ? "external" : "copilot";
    case "chat_surface":
      return "chat_surface";
    case "delegated":
      return "delegated";
    default:
      return "specialist";
  }
}

/**
 * Whether this agent can run commands at all — it declared a sandbox.
 *
 * Most agents never execute anything: they call tools and write files. Surfaces
 * that offer an execution choice (the Space's Compute settings) need to know
 * which agents the choice is even meaningful for, and reading it off the raw
 * `workspace` blob at each call site would spread that shape across the UI.
 */
export function resolveAgentCanExecute(config: AgentRoleInput): boolean {
  return config.workspace?.sandbox?.enabled === true;
}

/** Decorate a registry agent row with the derived fields API responses carry. */
export function decorateAgentWithRole<T extends AgentRoleInput>(
  config: T
): T & {
  can_execute: boolean;
  managed_by_module: string | null;
  role: AgentRole;
} {
  return {
    ...config,
    can_execute: resolveAgentCanExecute(config),
    managed_by_module: resolveManagedByModule(config),
    role: resolveAgentRole(config),
  };
}
