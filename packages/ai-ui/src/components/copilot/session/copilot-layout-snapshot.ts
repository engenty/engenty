/**
 * Copilot layout snapshot (v1) for user-settings JSON persistence.
 * Host apps load/save via `/api/user-settings/copilot.layout`.
 */

export {
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  reconcileCopilotLayoutSnapshot,
} from "@engenty/app-shell";

import {
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutSnapshotV1,
  type CopilotWindowRect,
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
    "window",
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

  const floatingDockedToCorner =
    typeof o.floatingDockedToCorner === "boolean"
      ? o.floatingDockedToCorner
      : undefined;

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

  let windowRect: CopilotWindowRect | undefined;
  const wr = o.windowRect as Record<string, unknown> | undefined | null;
  if (
    wr &&
    typeof wr === "object" &&
    isFiniteNumber(wr.x) &&
    isFiniteNumber(wr.y) &&
    isFiniteNumber(wr.width) &&
    isFiniteNumber(wr.height)
  ) {
    windowRect = {
      height: wr.height,
      width: wr.width,
      x: wr.x,
      y: wr.y,
    };
  }

  let compactStatusFlapHeight: number | undefined;
  if (isFiniteNumber(o.compactStatusFlapHeight)) {
    compactStatusFlapHeight = o.compactStatusFlapHeight;
  }

  const collapseToCircle =
    typeof o.collapseToCircle === "boolean" ? o.collapseToCircle : undefined;

  return reconcileCopilotLayoutSnapshot({
    v: 1,
    open,
    preferredDockMode,
    floatingDockedToCorner,
    floatingPosition,
    floatingSize,
    compactStatusFlapHeight,
    collapseToCircle,
    windowRect,
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
    floatingDockedToCorner:
      patch.floatingDockedToCorner === undefined
        ? base.floatingDockedToCorner
        : patch.floatingDockedToCorner,
    floatingPosition:
      patch.floatingPosition === undefined
        ? base.floatingPosition
        : patch.floatingPosition,
    floatingSize:
      patch.floatingSize === undefined ? base.floatingSize : patch.floatingSize,
    compactStatusFlapHeight:
      patch.compactStatusFlapHeight === undefined
        ? base.compactStatusFlapHeight
        : patch.compactStatusFlapHeight,
    collapseToCircle:
      patch.collapseToCircle === undefined
        ? base.collapseToCircle
        : patch.collapseToCircle,
    windowRect:
      patch.windowRect === undefined ? base.windowRect : patch.windowRect,
  });
}
