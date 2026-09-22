/**
 * The home's Erweiterungen list: mounted ACCOUNTS, not connector types.
 *
 * Same labelling as space settings (CN.3) — a row names the mailbox, and a
 * mount whose account the viewer cannot see still appears under its raw key
 * rather than vanishing.
 */
import type { SpaceMount } from "@/lib/api/spaces-client";

export const SPACE_HOME_EXTENSIONS_SHOWN = 6;

/** The fields the home needs from `connectionMetaById`. */
export interface SpaceHomeExtensionAccount {
  connectorId: string;
  connectorName: string;
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
  metaById: ReadonlyMap<string, SpaceHomeExtensionAccount>,
  names: {
    plugins?: ReadonlyMap<string, string>;
    skills?: ReadonlyMap<string, string>;
  } = {}
): SpaceHomeExtensionRow[] {
  const rows: SpaceHomeExtensionRow[] = [];
  for (const mount of mounts) {
    if (mount.resourceType === "connection") {
      const meta = metaById.get(mount.resourceKey);
      rows.push({
        connectorId: meta?.connectorId ?? null,
        connectorName: meta?.connectorName ?? null,
        id: mount.resourceKey,
        kind: "connection",
        label: meta?.label ?? mount.resourceKey,
      });
    } else if (mount.resourceType === "plugin") {
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
 * Tenant connections settings, carrying this space so a new account mounts
 * here (CN.4). Pass a connector id to open that provider; omit it for the list.
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
