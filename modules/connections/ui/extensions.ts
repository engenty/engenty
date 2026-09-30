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
  /**
   * Marketplace (and other inline connect surfaces): called after a successful
   * connect so the caller can enable the plugin on the Space.
   */
  onConnected?: (connectionId?: string) => void | Promise<void>;
  /** Where to return to after connecting (for redirect-style flows). */
  redirectTo: string;
  /** The Space the new account belongs to; absent = the viewer's own. */
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

/**
 * Extra sections on Setup → Connections, below the catalog — the imported
 * connectors' table (connections-external) registers one.
 */
const CATALOG_SECTIONS_KEY = Symbol.for("engenty.connections.catalog-sections");

function catalogSections(): ComponentType[] {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[CATALOG_SECTIONS_KEY]) {
    g[CATALOG_SECTIONS_KEY] = [];
  }
  return g[CATALOG_SECTIONS_KEY] as ComponentType[];
}

export function registerCatalogSection(component: ComponentType): void {
  const sections = catalogSections();
  if (!sections.includes(component)) {
    sections.push(component);
  }
}

export function getCatalogSections(): readonly ComponentType[] {
  return catalogSections();
}

/**
 * The connect dialog for surfaces that cannot import this module — ai-ui's
 * agent desk and Copilot pane (a cycle otherwise). They look it up on
 * `globalThis` under this key; `engenty-extensions-dialog` fires once it is
 * registered. The props are ExtensionsDialogProps.
 */
const EXTENSIONS_DIALOG_KEY = Symbol.for(
  "engenty.connections.extensions-dialog"
);

export function registerExtensionsDialog(
  component: ComponentType<never>
): void {
  const g = globalThis as Record<symbol, unknown>;
  g[EXTENSIONS_DIALOG_KEY] = component;
  globalThis.dispatchEvent(new Event("engenty-extensions-dialog"));
}
