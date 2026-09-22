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
 *
 * Imported (integrations.sh / MCP / OpenAPI) definitions carry `tenantId` and
 * are stored under `${tenantId}::${id}` so one tenant's import is not listed
 * or executed as another's. Builtins have no tenantId and use `id` as the key.
 */
const REGISTRY_KEY = Symbol.for("engenty.connections.connector-registry");

type RegistryMap = Map<string, ConnectorDefinition>;

function registry(): RegistryMap {
  const host = globalThis as { [REGISTRY_KEY]?: RegistryMap };
  host[REGISTRY_KEY] ??= new Map();
  return host[REGISTRY_KEY];
}

function registryKey(
  def: Pick<ConnectorDefinition, "id" | "tenantId">
): string {
  return def.tenantId ? `${def.tenantId}::${def.id}` : def.id;
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
  registry().set(registryKey(def), def);
}

/**
 * Remove a definition (imported-connector delete). Already-registered gateway
 * operations cannot be unregistered — they dead-end at policy resolution once
 * the definition is gone; a restart fully clears them.
 */
export function removeConnectorDefinition(
  id: string,
  tenantId?: string | null
): void {
  registry().delete(tenantId ? `${tenantId}::${id}` : id);
}

export function getConnectorDefinition(
  id: string,
  tenantId?: string | null
): ConnectorDefinition | undefined {
  const map = registry();
  if (tenantId) {
    const scoped = map.get(`${tenantId}::${id}`);
    if (scoped) {
      return scoped;
    }
  }
  const builtin = map.get(id);
  if (builtin && !builtin.tenantId) {
    return builtin;
  }
  return;
}

/** Builtins plus this tenant's imports. Omit tenantId to list builtins only. */
export function listConnectorDefinitions(
  tenantId?: string | null
): ConnectorDefinition[] {
  return [...registry().values()]
    .filter((def) => !def.tenantId || def.tenantId === tenantId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function connectorsForResolve(tenantId?: string | null): ConnectorDefinition[] {
  if (!tenantId) {
    return [...registry().values()].filter((def) => !def.tenantId);
  }
  return listConnectorDefinitions(tenantId);
}

/** Find the connector + action that own a projected operation id. */
export function resolveConnectorOperation(
  operationId: string,
  tenantId?: string | null
): {
  action: ConnectorDefinition["actions"][number];
  connector: ConnectorDefinition;
} | null {
  for (const connector of connectorsForResolve(tenantId)) {
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
