/**
 * AI registration registry. Uses a global singleton so registrations survive
 * across multiple @engenty/ai-core package loads (e.g. HMR, separate builds).
 */

import type {
  AiRegistration,
  RoutineDefinition,
  SkillDefinition,
  WorkflowDefinition,
} from "./contracts.js";
import type { AgentConfig } from "./dynamic-contracts.js";

const AI_REGISTRATIONS_KEY = Symbol.for("engenty.ai-core.aiRegistrations");

export interface AiRegistrationOwner {
  generationId?: number;
  pluginId?: string;
}

interface AiRegistrationEntry {
  owner?: AiRegistrationOwner;
  registration: AiRegistration;
}

function getGlobalAiRegistryMap(): Map<string, AiRegistrationEntry> {
  const target = globalThis as Record<PropertyKey, unknown>;
  const existing = target[AI_REGISTRATIONS_KEY];
  if (existing instanceof Map) {
    return existing as Map<string, AiRegistrationEntry>;
  }
  const created = new Map<string, AiRegistrationEntry>();
  target[AI_REGISTRATIONS_KEY] = created;
  return created;
}

const aiRegistrations = getGlobalAiRegistryMap();

export function registerAiRegistration(
  registration: AiRegistration,
  owner?: AiRegistrationOwner
): void {
  aiRegistrations.set(registration.module_id, { owner, registration });
}

export function unregisterAiRegistration(moduleId: string): void {
  aiRegistrations.delete(moduleId);
}

/** Remove active registrations for a plugin generation during plugin unload. */
export function unregisterAiRegistrationsByOwner(owner: AiRegistrationOwner): {
  removed: number;
} {
  let removed = 0;
  for (const [moduleId, entry] of aiRegistrations) {
    const entryOwner = entry.owner;
    if (!entryOwner || entryOwner.pluginId !== owner.pluginId) {
      continue;
    }
    if (
      typeof owner.generationId === "number" &&
      entryOwner.generationId !== owner.generationId
    ) {
      continue;
    }
    aiRegistrations.delete(moduleId);
    removed += 1;
  }
  return { removed };
}

export function listActiveAiRegistrations(): AiRegistration[] {
  return Array.from(aiRegistrations.values()).map(
    (entry) => entry.registration
  );
}

export interface ModuleDynamicCapabilitySeed {
  agentConfigs?: AgentConfig[];
  chatCommands?: import("./chat-commands/contracts.js").ChatCommandDefinition[];
  moduleId: string;
  routines?: RoutineDefinition[];
  skills?: Record<string, string>;
  workflows?: WorkflowDefinition[];
}

/** JSON-serializable module AI metadata registered by active plugins. */
export function listModuleDynamicCapabilitySeeds(): ModuleDynamicCapabilitySeed[] {
  return listActiveAiRegistrations()
    .map((registration) => ({
      moduleId: registration.module_id,
      agentConfigs: registration.dynamic?.agent_configs,
      skills: registration.dynamic?.skills,
      // Actions/routines/chat-commands ride the same capability channel so
      // apps/ai can resolve module-declared workflows / triggers /
      // COMMAND.md without sharing memory.
      workflows: registration.workflows,
      chatCommands: registration.chat_commands,
      routines: registration.routines,
    }))
    .filter(
      (capability) =>
        (capability.agentConfigs?.length ?? 0) > 0 ||
        (capability.workflows?.length ?? 0) > 0 ||
        (capability.chatCommands?.length ?? 0) > 0 ||
        (capability.routines?.length ?? 0) > 0 ||
        Object.keys(capability.skills ?? {}).length > 0
    );
}

/** Resolve an orchestrator action definition by id across all active registrations. */
export function resolveWorkflowDefinitionById(
  workflowId: string
): WorkflowDefinition | undefined {
  for (const { registration } of aiRegistrations.values()) {
    const action = registration.workflows?.find(
      (item) => item.id === workflowId
    );
    if (action) {
      return action;
    }
  }
  return;
}

/** Resolve a registered routine definition by id. */
export function resolveRoutineDefinitionById(
  routineId: string
): RoutineDefinition | undefined {
  for (const { registration } of aiRegistrations.values()) {
    const routine = registration.routines?.find(
      (item) => item.id === routineId
    );
    if (routine) {
      return routine;
    }
  }
  return;
}

/** List all registered routines across active orchestrator registrations. */
export function listRegisteredRoutines(): RoutineDefinition[] {
  return Array.from(aiRegistrations.values()).flatMap(
    ({ registration }) => registration.routines ?? []
  );
}

/** Resolve a registered skill definition by id. */
export function resolveSkillDefinitionById(
  skillId: string
): SkillDefinition | undefined {
  let resolved: SkillDefinition | undefined;
  for (const { registration } of aiRegistrations.values()) {
    const skill = registration.skills?.find((item) => item.name === skillId);
    if (skill) {
      resolved = skill;
    }
  }
  return resolved;
}

/** List all registered skills across active orchestrator registrations. */
export function listRegisteredSkills(): SkillDefinition[] {
  return Array.from(aiRegistrations.values()).flatMap(
    ({ registration }) => registration.skills ?? []
  );
}

/** Model roles declared by modules, tagged with the module that declared them. */
export function listRegisteredModelRoles(): {
  default_model_id: string;
  label: string;
  module_id: string;
  role: string;
}[] {
  return Array.from(aiRegistrations.values()).flatMap(({ registration }) =>
    (registration.model_roles ?? []).map((definition) => ({
      ...definition,
      module_id: registration.module_id,
    }))
  );
}

/** List all registered action definitions across active orchestrator registrations. */
export function listRegisteredWorkflows(): WorkflowDefinition[] {
  return Array.from(aiRegistrations.values()).flatMap(
    ({ registration }) => registration.workflows ?? []
  );
}

/** List all registered chat slash commands across active registrations. */
export function listRegisteredChatCommands(): import("./chat-commands/contracts.js").ChatCommandDefinition[] {
  return Array.from(aiRegistrations.values()).flatMap(
    ({ registration }) => registration.chat_commands ?? []
  );
}
