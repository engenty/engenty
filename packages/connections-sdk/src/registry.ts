import type { ConnectorDefinition } from "./types.js";

/**
 * Process-wide connector registry. Connector modules register at plugin load;
 * the connections module reads it lazily (OAuth routes, management ops, UI
 * catalog), so registration order between modules does not matter.
 *
 * IMPORTANT: core loads every plugin through its OWN jiti instance (fresh
 * module cache per plugin — see apps/core/src/plugins/loader.ts), so a plain
 * module-level Map would give each module a private copy. The registry
 * therefore lives on `globalThis` under a `Symbol.for` key, which is shared
 * across all module-cache copies in the process.
 */
const REGISTRY_KEY = Symbol.for("engenty.connections.connector-registry");

type RegistryMap = Map<string, ConnectorDefinition>;

function registry(): RegistryMap {
  const host = globalThis as { [REGISTRY_KEY]?: RegistryMap };
  host[REGISTRY_KEY] ??= new Map();
  return host[REGISTRY_KEY];
}

export function registerConnectorDefinition(def: ConnectorDefinition): void {
  const seen = new Set<string>();
  for (const action of def.actions) {
    if (seen.has(action.id)) {
      throw new Error(`Connector "${def.id}" duplicates action "${action.id}"`);
    }
    seen.add(action.id);
  }
  // Idempotent on purpose: dev-reload re-runs plugin factories; the latest
  // definition wins.
  registry().set(def.id, def);
}

/**
 * Remove a definition (imported-connector delete). Already-registered gateway
 * operations cannot be unregistered — they dead-end at policy resolution once
 * the definition is gone; a restart fully clears them.
 */
export function removeConnectorDefinition(id: string): void {
  registry().delete(id);
}

export function getConnectorDefinition(
  id: string
): ConnectorDefinition | undefined {
  return registry().get(id);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return [...registry().values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Find the connector + action that own a projected operation id. */
export function resolveConnectorOperation(operationId: string): {
  action: ConnectorDefinition["actions"][number];
  connector: ConnectorDefinition;
} | null {
  for (const connector of registry().values()) {
    const prefix = `${connector.toolPrefix}_`;
    if (!operationId.startsWith(prefix)) {
      continue;
    }
    const actionId = operationId.slice(prefix.length);
    const action = connector.actions.find((a) => a.id === actionId);
    if (action) {
      return { action, connector };
    }
  }
  return null;
}

/** Test-only: reset the registry between vitest cases. */
export function __resetConnectorRegistryForTests(): void {
  registry().clear();
}
