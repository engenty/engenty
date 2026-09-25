/**
 * The home's Erweiterungen list: the Space's own ACCOUNTS (labelled by the
 * mailbox, not the provider), plus its plugin and skill mounts.
 */
import type { SpaceMount } from "@/lib/api/spaces-client";

export const SPACE_HOME_EXTENSIONS_SHOWN = 6;

/** The fields the home needs from `spaceAccounts`. */
export interface SpaceHomeExtensionAccount {
  connectorId: string;
  connectorName: string;
  id: string;
  label: string;
}

export type SpaceHomeExtensionKind = "connection" | "plugin" | "skill";

export interface SpaceHomeExtensionRow {
  connectorId: string | null;
  connectorName: string | null;
  id: string;
  kind: SpaceHomeExtensionKind;
  label: string;
}

export function selectSpaceHomeExtensionRows(
  mounts: readonly Pick<SpaceMount, "resourceKey" | "resourceType">[],
  accounts: readonly SpaceHomeExtensionAccount[],
  names: {
    plugins?: ReadonlyMap<string, string>;
    skills?: ReadonlyMap<string, string>;
  } = {}
): SpaceHomeExtensionRow[] {
  const rows: SpaceHomeExtensionRow[] = accounts.map((account) => ({
    connectorId: account.connectorId,
    connectorName: account.connectorName,
    id: account.id,
    kind: "connection",
    label: account.label,
  }));
  for (const mount of mounts) {
    if (mount.resourceType === "plugin") {
      rows.push({
        connectorId: mount.resourceKey,
        connectorName: null,
        id: mount.resourceKey,
        kind: "plugin",
        label: names.plugins?.get(mount.resourceKey) ?? mount.resourceKey,
      });
    } else if (mount.resourceType === "skill") {
      rows.push({
        connectorId: null,
        connectorName: null,
        id: mount.resourceKey,
        kind: "skill",
        label: names.skills?.get(mount.resourceKey) ?? mount.resourceKey,
      });
    }
  }
  return rows.sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * Connections settings for this space: its accounts, and a connect that lands
 * here. Pass a connector id to open that provider; omit it for the list.
 */
export function spaceAddAccountPath(
  spaceId: string,
  backPath: string,
  connectorId?: string
): string {
  const query = new URLSearchParams({ back: backPath, space: spaceId });
  const base = connectorId
    ? `/settings/connections/${encodeURIComponent(connectorId)}`
    : "/settings/connections";
  return `${base}?${query.toString()}`;
}
