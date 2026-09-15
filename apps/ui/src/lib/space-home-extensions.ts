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

export interface SpaceHomeExtensionRow {
  connectorId: string | null;
  connectorName: string | null;
  id: string;
  label: string;
}

export function selectSpaceHomeExtensionRows(
  mounts: readonly Pick<SpaceMount, "resourceKey" | "resourceType">[],
  metaById: ReadonlyMap<string, SpaceHomeExtensionAccount>
): SpaceHomeExtensionRow[] {
  return mounts
    .filter((mount) => mount.resourceType === "connection")
    .map((mount) => {
      const meta = metaById.get(mount.resourceKey);
      return {
        connectorId: meta?.connectorId ?? null,
        connectorName: meta?.connectorName ?? null,
        id: mount.resourceKey,
        label: meta?.label ?? mount.resourceKey,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
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
