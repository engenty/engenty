/** User-settings JSON key — global module secondary nav pinned open/closed (desktop). */
export const SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME =
  "shell.secondary_nav.pinned";

export interface ShellSecondaryNavPinnedSnapshotV1 {
  pinnedOpen: boolean;
  v: 1;
}

/** Injected by the host (e.g. React Query + user-settings API). */
export interface ShellSecondaryNavPinnedPersistenceApi {
  mergePinned: (patch: Partial<ShellSecondaryNavPinnedSnapshotV1>) => void;
  pinnedHydrated: boolean;
  snapshot: ShellSecondaryNavPinnedSnapshotV1 | null;
}

export type ShellSecondaryNavPinnedPersistence =
  ShellSecondaryNavPinnedPersistenceApi;

/** Hosts without user-settings wiring (e.g. manage app). */
export const SHELL_SECONDARY_NAV_PINNED_NOOP: ShellSecondaryNavPinnedPersistence =
  {
    snapshot: null,
    pinnedHydrated: true,
    mergePinned: () => {},
  };

export function createDefaultShellSecondaryNavPinnedSnapshot(): ShellSecondaryNavPinnedSnapshotV1 {
  return { pinnedOpen: true, v: 1 };
}

export function parseShellSecondaryNavPinnedSnapshot(
  data: unknown
): ShellSecondaryNavPinnedSnapshotV1 | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.v !== 1) {
    return null;
  }
  if (typeof o.pinnedOpen !== "boolean") {
    return null;
  }
  return { pinnedOpen: o.pinnedOpen, v: 1 };
}

export function mergeShellSecondaryNavPinnedSnapshot(
  base: ShellSecondaryNavPinnedSnapshotV1,
  patch: Partial<ShellSecondaryNavPinnedSnapshotV1>
): ShellSecondaryNavPinnedSnapshotV1 {
  return {
    ...base,
    ...patch,
    v: 1,
  };
}
