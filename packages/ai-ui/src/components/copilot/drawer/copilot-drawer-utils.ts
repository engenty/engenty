import type {
  CopilotDockMode,
  CopilotLayoutSnapshotV1,
} from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import {
  COPILOT_RIVER_PATH,
  isCopilotRiverPathname,
} from "../../../copilot/copilot-river-paths.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";

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

export function getSuggestionsSignature(
  suggestions: Array<{
    field: string;
    value?: unknown;
    candidates?: Array<{ value?: unknown }> | undefined;
    source_url?: string | null;
  }>
) {
  return JSON.stringify(
    suggestions.map((suggestion) => ({
      field: suggestion.field,
      value: suggestion.value ?? null,
      candidates:
        suggestion.candidates?.map((candidate) => candidate.value ?? null) ??
        [],
      source_url: suggestion.source_url ?? null,
    }))
  );
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

function humanizeToken(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

/** True if pathname looks like /mdl/:slug/:entityId (entity detail page). */
function isEntityDetailPath(pathname: string | undefined): boolean {
  if (!pathname) {
    return false;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 3) {
    return false;
  }
  const last = segments.at(-1) ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    last
  );
}

function stripEntityScope(
  scope: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!scope) {
    return;
  }

  const {
    entityId: _entityId,
    entity_title: _entityTitle,
    contact_snapshot: _contactSnapshot,
    routeKey: _routeKey,
    copilotAutoUserMessage: _copilotAutoUserMessage,
    copilotRequestedActionId: _copilotRequestedActionId,
    copilotRequestedAgentId: _copilotRequestedAgentId,
    copilotStartMode: _copilotStartMode,
    copilotTriggerType: _copilotTriggerType,
    ...nextScope
  } = scope;

  return Object.keys(nextScope).length > 0 ? nextScope : undefined;
}

function globalScope(
  scope: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!scope || typeof scope.ui_language !== "string") {
    return;
  }

  return { ui_language: scope.ui_language };
}

/** User-facing hint for the technical moduleId/routeKey sent to the API (shown when no context menu). */
export function formatCopilotRouteStatusLabel(
  moduleId: string | undefined,
  routeKey: string | undefined
): string | undefined {
  const m = typeof moduleId === "string" ? moduleId.trim() : "";
  const r = typeof routeKey === "string" ? routeKey.trim() : "";
  if (!(m && r)) {
    return;
  }
  if (m === "engenty-copilot" && r === "chat") {
    return "Global chat";
  }
  const humanize = (s: string) =>
    s
      .split(/[-_.]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  return `${humanize(m)} · ${humanize(r)}`;
}

export function buildCompactContextOptions({
  copilotContext,
  module,
  routeKey,
  scope,
  title,
}: {
  copilotContext?: CopilotRouteContext;
  module: string;
  routeKey: string;
  scope: Record<string, unknown> | null;
  title?: string;
}): CopilotCompactContextOption[] {
  const pathname = copilotContext?.pathname;
  const baseContext: CopilotRouteContext = copilotContext ?? {
    moduleId: module,
    pathname,
    routeKey,
    scope: scope ?? undefined,
  };
  const pathSegmentsForCurrent = pathname?.split("/").filter(Boolean) ?? [];
  const moduleSlugForCurrent =
    pathSegmentsForCurrent[0] === "module" && pathSegmentsForCurrent[1]
      ? pathSegmentsForCurrent[1]
      : null;
  const onEntityDetail = isEntityDetailPath(pathname);

  let currentLabel: string;
  if (pathname?.endsWith("/settings")) {
    currentLabel = `${title ?? humanizeToken(module)} settings`;
  } else if (onEntityDetail) {
    const entityTitle =
      typeof scope?.entity_title === "string"
        ? scope.entity_title.trim()
        : typeof scope?.project_title === "string"
          ? scope.project_title.trim()
          : "";
    if (entityTitle) {
      currentLabel = entityTitle;
    } else if (moduleSlugForCurrent === "projects" && title === "Projects") {
      currentLabel = "Project";
    } else if (moduleSlugForCurrent === "contacts" && title === "Contacts") {
      currentLabel = "Contact";
    } else {
      currentLabel = title ?? humanizeToken(routeKey);
    }
  } else if (title && routeKey !== "chat") {
    currentLabel = `${title} / ${humanizeToken(routeKey)}`;
  } else {
    currentLabel = title ?? humanizeToken(routeKey);
  }
  const options: CopilotCompactContextOption[] = [
    {
      id: "current",
      label: currentLabel,
      routeContext: baseContext,
    },
  ];

  const pathSegments = pathname?.split("/").filter(Boolean) ?? [];
  const moduleSlug =
    pathSegments[0] === "module" && pathSegments[1] ? pathSegments[1] : null;
  const moduleRootPath = moduleSlug ? `/mdl/${moduleSlug}` : null;
  const settingsPath = moduleRootPath ? `${moduleRootPath}/settings` : null;

  if (settingsPath && pathname !== settingsPath) {
    options.push({
      id: "settings",
      label: title ? `${title} settings` : "Settings",
      routeContext: {
        ...baseContext,
        pathname: settingsPath,
        routeKey: "settings",
        scope: stripEntityScope(baseContext.scope ?? scope),
      },
    });
  }

  if (moduleRootPath && pathname !== moduleRootPath) {
    const listLabel = moduleSlug
      ? `${humanizeToken(moduleSlug)} · List`
      : humanizeToken(module);
    options.push({
      id: "module-root",
      label: listLabel,
      routeContext: {
        ...baseContext,
        moduleId: "engenty-copilot",
        pathname: moduleRootPath,
        routeKey: "chat",
        scope: moduleSlug
          ? {
              ...stripEntityScope(baseContext.scope ?? scope),
              currentModule: moduleSlug,
            }
          : stripEntityScope(baseContext.scope ?? scope),
      },
    });
  }

  options.push({
    id: "global",
    label: "Global",
    routeContext: {
      moduleId: "engenty-copilot",
      pathname: COPILOT_RIVER_PATH,
      routeKey: "chat",
      scope: globalScope(baseContext.scope ?? scope),
    },
  });

  return options;
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
