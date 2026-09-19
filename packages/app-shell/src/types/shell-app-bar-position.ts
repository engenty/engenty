/** User-settings JSON key — desktop app-bar edge (left / top / right / bottom). */
export const SHELL_APP_BAR_POSITION_USER_SETTING_NAME =
  "shell.app_bar.position";

/** Instant-paint cache; hydrates from the user setting after login. */
export const SHELL_APP_BAR_POSITION_STORAGE_KEY = "engenty:app-bar-position";

export const SHELL_APP_BAR_POSITION_CHANGE_EVENT =
  "engenty:app-bar-position-change";

export const APP_BAR_POSITIONS = ["left", "top", "right", "bottom"] as const;

export type AppBarPosition = (typeof APP_BAR_POSITIONS)[number];

export const DEFAULT_APP_BAR_POSITION: AppBarPosition = "left";

/** Compact rail thickness (px). Matches desktop `AppSidebar` compact mode. */
export const APP_BAR_COMPACT_THICKNESS_PX = 56;

/** Extended vertical rail width (px). Not used on top/bottom. */
export const APP_BAR_EXTENDED_WIDTH_PX = 220;
/**
 * The extended (labelled) rail only makes sense with room to spare. Below
 * this viewport width the "extended" preference still renders compact.
 */
export const APP_BAR_EXTENDED_MIN_VIEWPORT_PX = 1400;
export const APP_BAR_EXTENDED_MEDIA_QUERY = `(min-width: ${APP_BAR_EXTENDED_MIN_VIEWPORT_PX}px)`;

export interface ShellAppBarPositionSnapshotV1 {
  position: AppBarPosition;
  v: 1;
}

/** Injected by the host (e.g. React Query + user-settings API). */
export interface ShellAppBarPositionPersistenceApi {
  mergePosition: (patch: Partial<ShellAppBarPositionSnapshotV1>) => void;
  positionHydrated: boolean;
  snapshot: ShellAppBarPositionSnapshotV1 | null;
}

export type ShellAppBarPositionPersistence = ShellAppBarPositionPersistenceApi;

/** Hosts without user-settings wiring (e.g. manage app). */
export const SHELL_APP_BAR_POSITION_NOOP: ShellAppBarPositionPersistence = {
  snapshot: null,
  positionHydrated: true,
  mergePosition: () => {},
};

export function isAppBarPosition(value: unknown): value is AppBarPosition {
  return (
    value === "left" ||
    value === "top" ||
    value === "right" ||
    value === "bottom"
  );
}

export function isHorizontalAppBarPosition(position: AppBarPosition): boolean {
  return position === "top" || position === "bottom";
}

export function createDefaultShellAppBarPositionSnapshot(): ShellAppBarPositionSnapshotV1 {
  return { position: DEFAULT_APP_BAR_POSITION, v: 1 };
}

export function parseShellAppBarPositionSnapshot(
  data: unknown
): ShellAppBarPositionSnapshotV1 | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.v !== 1) {
    return null;
  }
  if (!isAppBarPosition(o.position)) {
    return null;
  }
  return { position: o.position, v: 1 };
}

export function mergeShellAppBarPositionSnapshot(
  base: ShellAppBarPositionSnapshotV1,
  patch: Partial<ShellAppBarPositionSnapshotV1>
): ShellAppBarPositionSnapshotV1 {
  const position = patch.position ?? base.position;
  return {
    position: isAppBarPosition(position) ? position : DEFAULT_APP_BAR_POSITION,
    v: 1,
  };
}

export function appBarThicknessPx(
  position: AppBarPosition,
  mode: "compact" | "extended"
): number {
  if (isHorizontalAppBarPosition(position) || mode === "compact") {
    return APP_BAR_COMPACT_THICKNESS_PX;
  }
  return APP_BAR_EXTENDED_WIDTH_PX;
}

export function appBarHideTransform(
  position: AppBarPosition,
  sizePx: number
): string {
  switch (position) {
    case "left":
      return `translateX(-${sizePx}px)`;
    case "right":
      return `translateX(${sizePx}px)`;
    case "top":
      return `translateY(-${sizePx}px)`;
    case "bottom":
      return `translateY(${sizePx}px)`;
  }
}

export type AppBarTooltipSide = "top" | "right" | "bottom" | "left";

/** Tooltip / menu fly toward the content, away from the docked edge. */
export function appBarTooltipSide(position: AppBarPosition): AppBarTooltipSide {
  switch (position) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
  }
}

export function shellRootFlexClass(position: AppBarPosition): string {
  switch (position) {
    case "left":
      return "flex-row";
    case "right":
      return "flex-row-reverse";
    case "top":
      return "flex-col";
    case "bottom":
      return "flex-col-reverse";
  }
}

export function readAppBarPositionFromStorage(): AppBarPosition | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(
      SHELL_APP_BAR_POSITION_STORAGE_KEY
    );
    return isAppBarPosition(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeAppBarPositionToStorage(position: AppBarPosition): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SHELL_APP_BAR_POSITION_STORAGE_KEY, position);
    window.dispatchEvent(new Event(SHELL_APP_BAR_POSITION_CHANGE_EVENT));
  } catch {
    // ignore quota / private-mode failures
  }
}
