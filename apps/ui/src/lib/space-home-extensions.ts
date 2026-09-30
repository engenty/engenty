/**
 * A Space's Erweiterungen, as the home box and the settings section list them:
 * one row per ACCOUNT (labelled by the mailbox, not the provider), and one
 * per plugin enabled on the Space that has no account yet. Skills have a box
 * of their own (space-home-skills).
 */
import type { CatalogConnector } from "@engenty/connections/ui/api";
import type { SpaceMount } from "@/lib/api/spaces-client";

export const SPACE_HOME_EXTENSIONS_SHOWN = 6;

export interface SpaceHomeExtensionAccount {
  /** Who signed in — audit only, never the owner. */
  connectedBy: string | null;
  connectorId: string;
  connectorName: string;
  id: string;
  label: string;
  status: "active" | "error" | "revoked";
}

export type SpaceHomeExtensionKind = "connection" | "plugin";

export interface SpaceHomeExtensionRow {
  connectedBy: string | null;
  connectorId: string;
  connectorName: string | null;
  id: string;
  kind: SpaceHomeExtensionKind;
  label: string;
  /** An account's status; `pending` = a plugin nobody has connected yet. */
  status: SpaceHomeExtensionAccount["status"] | "pending";
}

/** The Space's own accounts from its connections catalog. */
export function spaceExtensionAccounts(
  connectors: readonly Pick<CatalogConnector, "connections" | "id" | "name">[],
  spaceId: string
): SpaceHomeExtensionAccount[] {
  const accounts: SpaceHomeExtensionAccount[] = [];
  for (const connector of connectors) {
    for (const connection of connector.connections) {
      if (connection.space_id !== spaceId) {
        continue;
      }
      accounts.push({
        connectedBy: connection.connected_by,
        connectorId: connector.id,
        connectorName: connector.name,
        id: connection.id,
        label:
          connection.display_name?.trim() ||
          connection.external_account?.trim() ||
          connector.name,
        status: connection.status,
      });
    }
  }
  return accounts;
}

export function selectSpaceHomeExtensionRows(
  mounts: readonly Pick<SpaceMount, "resourceKey" | "resourceType">[],
  accounts: readonly SpaceHomeExtensionAccount[],
  names: { plugins?: ReadonlyMap<string, string> } = {}
): SpaceHomeExtensionRow[] {
  const rows: SpaceHomeExtensionRow[] = accounts.map((account) => ({
    connectedBy: account.connectedBy,
    connectorId: account.connectorId,
    connectorName: account.connectorName,
    id: account.id,
    kind: "connection",
    label: account.label,
    status: account.status,
  }));
  const connected = new Set(accounts.map((account) => account.connectorId));
  for (const mount of mounts) {
    if (mount.resourceType === "plugin" && !connected.has(mount.resourceKey)) {
      rows.push({
        connectedBy: null,
        connectorId: mount.resourceKey,
        connectorName: null,
        id: mount.resourceKey,
        kind: "plugin",
        label: names.plugins?.get(mount.resourceKey) ?? mount.resourceKey,
        status: "pending",
      });
    }
  }
  return rows.sort((left, right) => left.label.localeCompare(right.label));
}
