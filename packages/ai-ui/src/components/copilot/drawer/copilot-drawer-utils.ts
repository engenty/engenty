import type {
  CopilotDockMode,
  CopilotLayoutSnapshotV1,
} from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { isCopilotRiverPathname } from "../../../copilot/copilot-river-paths.js";

export type CopilotFloatingSnapTarget = "button" | "sidebar" | null;

export type CopilotPositionMenuChoice = "drawer" | "window" | "sidebar";

const POSITION_MENU_CHOICES: ReadonlySet<string> =
  new Set<CopilotPositionMenuChoice>(["drawer", "window", "sidebar"]);

function isPositionMenuChoice(
  value: CopilotDockMode | null | undefined
): value is CopilotPositionMenuChoice {
  return value != null && POSITION_MENU_CHOICES.has(value);
}

export function normalizeCopilotPositionMenuValue(
  preferred: CopilotDockMode | null | undefined,
  effective: CopilotDockMode
): CopilotPositionMenuChoice {
  if (isPositionMenuChoice(preferred)) {
    return preferred;
  }
  if (isPositionMenuChoice(effective)) {
    return effective;
  }
  return "sidebar";
}

export function debugCopilotSurface(
  event: string,
  payload: Record<string, unknown>
) {
  if (typeof window === "undefined" || !isEngentyDevelopmentEnvironment()) {
    return;
  }

  // console.debug allowed in dev-only copilot diagnostics (apps/ui is not biome noConsole gated)
  console.debug(`[copilot] ${event}`, payload);
}

export function getDockedModePreference(
  shellDockMode: CopilotDockMode | undefined
): CopilotDockMode {
  if (shellDockMode === "drawer") {
    return "drawer";
  }

  return "sidebar";
}

/** Dock mode to restore when opening copilot from the collapsed FAB. */
export function resolveCopilotOpenDockMode(
  preferred: CopilotDockMode | null | undefined
): CopilotDockMode {
  if (
    preferred === "drawer" ||
    preferred === "sidebar" ||
    preferred === "window"
  ) {
    return preferred;
  }
  return "sidebar";
}

export type CopilotCompanionPlacement = "drawer" | "sidebar" | "window";

export type CopilotCompanionOpenTarget =
  | { kind: "talk" }
  | { kind: "work"; dock: CopilotCompanionPlacement };

/**
 * Talk is a route; Work/Window is companion chrome. Look at the main area,
 * then open. Persist only Work vs Window as the last companion placement.
 */
export function resolveCopilotCompanionOpen(input: {
  chromeHidden?: boolean;
  isMobile?: boolean;
  isTalkPage: boolean;
  preferredDockMode?: CopilotDockMode | null;
}): CopilotCompanionOpenTarget {
  if (input.chromeHidden || input.isTalkPage) {
    return { kind: "talk" };
  }
  if (input.isMobile) {
    return { kind: "work", dock: "drawer" };
  }
  const last = resolveCopilotOpenDockMode(input.preferredDockMode);
  if (last === "window") {
    return { kind: "work", dock: "window" };
  }
  return { kind: "work", dock: last === "drawer" ? "sidebar" : last };
}

/**
 * Dedicated conversation pages: a desk, a room, or the river's own page.
 * Roster `/agents` and hire `/agents/new` are not Talk.
 */
export function isTalkConversationPathname(pathname: string): boolean {
  if (isCopilotRiverPathname(pathname)) {
    return true;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "s" || segments.length < 3) {
    return false;
  }
  const section = segments[2] ?? "";
  if (section === "rooms") {
    return Boolean(segments[3]);
  }
  if (section === "agents") {
    const agentId = segments[3] ?? "";
    return agentId.length > 0 && agentId !== "new";
  }
  return false;
}

export interface OpenCopilotShellInput {
  chromeHidden?: boolean;
  isMobile?: boolean;
  isTalkPage?: boolean;
  mergeLayout?: (patch: Partial<CopilotLayoutSnapshotV1>) => void;
  preferredDockMode?: CopilotDockMode | null;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
}

/** Open Work/Window from FAB-equivalent entry points. No-ops on a Talk page. */
export function openCopilotShell(
  input: OpenCopilotShellInput
): "talk" | "work" {
  const target = resolveCopilotCompanionOpen({
    chromeHidden: input.chromeHidden,
    isMobile: input.isMobile,
    isTalkPage: input.isTalkPage ?? false,
    preferredDockMode: input.preferredDockMode,
  });
  if (target.kind === "talk") {
    return "talk";
  }
  input.mergeLayout?.({ collapseToCircle: false, open: true });
  input.setPreferredDockMode?.(target.dock);
  input.setOpen(true);
  return "work";
}

/**
 * Whether the blob is on screen.
 *
 * The DOCKED blob is app-bar chrome and stays put whatever the main area
 * holds, `chromeHidden` included: on Copilot's own full page the bar used to
 * end at the avatar, so the one control that reaches Voice, Prompt, New chat
 * and Global Copilot vanished exactly where a person is most likely to reach
 * for it, and the bar changed shape as you walked between pages.
 *
 * `chromeHidden` still hides the FLOATING blob, which has no bar to sit on and
 * would cover the chat page's own composer.
 */
/** Transcript / hired-Engenty lane — not the FAB — only when the companion is showing. */
export function isCopilotCompanionSurfaceActive(input: {
  chromeHidden?: boolean;
  open: boolean;
}): boolean {
  return Boolean(input.open && !input.chromeHidden);
}

export function shouldShowCopilotFab(input: {
  chromeHidden?: boolean;
  collapseToCircle: boolean;
  docked?: boolean;
  isCollapsingToIcon: boolean;
  open: boolean;
  /** When a realtime voice session is active the voice FAB takes over. */
  voiceSessionActive?: boolean;
}): boolean {
  if (input.voiceSessionActive) {
    return false;
  }
  if (input.docked) {
    return true;
  }
  if (input.chromeHidden) {
    return false;
  }
  if (input.isCollapsingToIcon) {
    return true;
  }
  return !input.open;
}
