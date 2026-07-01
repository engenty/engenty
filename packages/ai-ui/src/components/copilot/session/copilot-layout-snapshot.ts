/**
 * Copilot layout snapshot (v1) for user-settings JSON persistence.
 * Host apps load/save via `/api/user-settings/copilot.layout`.
 */

export {
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  type CopilotPersistedPanelMode,
  reconcileCopilotLayoutSnapshot,
} from "@engenty/app-shell";

import {
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutSnapshotV1,
  reconcileCopilotLayoutSnapshot,
} from "@engenty/app-shell";

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Parse a JSON object from user-settings into a snapshot, or null if invalid. */
export function parseCopilotLayoutSnapshot(
  data: unknown
): CopilotLayoutSnapshotV1 | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.v !== 1) {
    return null;
  }
  const open = Boolean(o.open);
  const validModes: CopilotLayoutPersistDockMode[] = [
    "floating",
    "mini-floating",
    "drawer",
    "sidebar",
    "bottom",
  ];
  let preferredDockMode: CopilotLayoutPersistDockMode | null = null;
  if (o.preferredDockMode === null || o.preferredDockMode === undefined) {
    preferredDockMode = null;
  } else if (
    typeof o.preferredDockMode === "string" &&
    validModes.includes(o.preferredDockMode as CopilotLayoutPersistDockMode)
  ) {
    preferredDockMode = o.preferredDockMode as CopilotLayoutPersistDockMode;
  }

  let floatingPosition: { x: number; y: number } | undefined;
  const fp = o.floatingPosition;
  if (
    fp &&
    typeof fp === "object" &&
    isFiniteNumber((fp as { x?: unknown }).x) &&
    isFiniteNumber((fp as { y?: unknown }).y)
  ) {
    floatingPosition = {
      x: (fp as { x: number }).x,
      y: (fp as { y: number }).y,
    };
  }

  let fabPosition: { x: number; y: number } | undefined;
  const fab = o.fabPosition;
  if (
    fab &&
    typeof fab === "object" &&
    isFiniteNumber((fab as { x?: unknown }).x) &&
    isFiniteNumber((fab as { y?: unknown }).y)
  ) {
    fabPosition = {
      x: (fab as { x: number }).x,
      y: (fab as { y: number }).y,
    };
  }

  let floatingSize: { width: number; height: number } | undefined;
  const fs = o.floatingSize;
  if (
    fs &&
    typeof fs === "object" &&
    isFiniteNumber((fs as { width?: unknown }).width) &&
    isFiniteNumber((fs as { height?: unknown }).height)
  ) {
    floatingSize = {
      width: (fs as { width: number }).width,
      height: (fs as { height: number }).height,
    };
  }

  const collapseToCircle =
    typeof o.collapseToCircle === "boolean" ? o.collapseToCircle : undefined;
  const panelMode =
    o.panelMode === "docked" || o.panelMode === "floating"
      ? o.panelMode
      : undefined;

  return reconcileCopilotLayoutSnapshot({
    v: 1,
    open,
    preferredDockMode,
    fabPosition,
    floatingPosition,
    floatingSize,
    collapseToCircle,
    panelMode,
  });
}

export function createEmptyCopilotLayoutSnapshot(): CopilotLayoutSnapshotV1 {
  return {
    v: 1,
    open: false,
    preferredDockMode: null,
  };
}

export function mergeCopilotLayoutSnapshot(
  base: CopilotLayoutSnapshotV1,
  patch: Partial<CopilotLayoutSnapshotV1>
): CopilotLayoutSnapshotV1 {
  return reconcileCopilotLayoutSnapshot({
    v: 1,
    open: patch.open === undefined ? base.open : patch.open,
    preferredDockMode:
      patch.preferredDockMode === undefined
        ? base.preferredDockMode
        : patch.preferredDockMode,
    fabPosition:
      patch.fabPosition === undefined ? base.fabPosition : patch.fabPosition,
    floatingPosition:
      patch.floatingPosition === undefined
        ? base.floatingPosition
        : patch.floatingPosition,
    floatingSize:
      patch.floatingSize === undefined ? base.floatingSize : patch.floatingSize,
    collapseToCircle:
      patch.collapseToCircle === undefined
        ? base.collapseToCircle
        : patch.collapseToCircle,
    panelMode: patch.panelMode === undefined ? base.panelMode : patch.panelMode,
  });
}
