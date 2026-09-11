import type { ComponentType } from "react";

/**
 * Non-OAuth connectors (browser / api_key) need a bespoke connect affordance
 * instead of the shared OAuth `ConnectButton`. They register one here from
 * their own UI plugin; the connections catalog/detail pages look it up by
 * connector id. The registry lives on `globalThis` under a `Symbol.for` key so
 * it is shared across the per-plugin jiti/module-cache copies, mirroring the
 * connector-definition registry in `@engenty/connections-sdk`.
 */
export interface ConnectorConnectButtonProps {
  connectorId: string;
  /** Whether the caller already has at least one connection of this connector. */
  hasConnections: boolean;
  /** Where to return to after connecting (for redirect-style flows). */
  redirectTo: string;
  /**
   * Mount the new account into this space (PLAN-spaces.md CN.4 Flow A).
   * Set when the connect started from inside a space.
   */
  spaceId?: string | null;
}

export interface ConnectorExtrasProps {
  connectionId: string;
  connectorId: string;
  status: "active" | "error" | "revoked";
}

interface ConnectorUiRegistry {
  connectButtons: Map<string, ComponentType<ConnectorConnectButtonProps>>;
  extras: Map<string, ComponentType<ConnectorExtrasProps>>;
}

const REGISTRY_KEY = Symbol.for("engenty.connections.ui-extensions");

function registry(): ConnectorUiRegistry {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      connectButtons: new Map(),
      extras: new Map(),
    } satisfies ConnectorUiRegistry;
  }
  return g[REGISTRY_KEY] as ConnectorUiRegistry;
}

export function registerConnectorConnectButton(
  connectorId: string,
  component: ComponentType<ConnectorConnectButtonProps>
): void {
  registry().connectButtons.set(connectorId, component);
}

export function getConnectorConnectButton(
  connectorId: string
): ComponentType<ConnectorConnectButtonProps> | undefined {
  return registry().connectButtons.get(connectorId);
}

export function registerConnectionExtras(
  connectorId: string,
  component: ComponentType<ConnectorExtrasProps>
): void {
  registry().extras.set(connectorId, component);
}

export function getConnectionExtras(
  connectorId: string
): ComponentType<ConnectorExtrasProps> | undefined {
  return registry().extras.get(connectorId);
}
