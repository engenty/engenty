import type { CopilotLayoutSnapshotV1 } from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-launcher";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import type { CopilotDockMode } from "./copilot-drawer-types";

export type CopilotFloatingSnapTarget = "bottom" | "button" | "sidebar" | null;

export type CopilotPositionMenuChoice =
  | "bottom"
  | "drawer"
  | "mini-floating"
  | "floating"
  | "sidebar";

export function normalizeCopilotPositionMenuValue(
  preferred: CopilotDockMode | null | undefined,
  effective: CopilotDockMode
): CopilotPositionMenuChoice {
  if (
    preferred === "bottom" ||
    preferred === "drawer" ||
    preferred === "mini-floating" ||
    preferred === "floating" ||
    preferred === "sidebar"
  ) {
    return preferred;
  }
  if (
    effective === "bottom" ||
    effective === "drawer" ||
    effective === "mini-floating" ||
    effective === "floating" ||
    effective === "sidebar"
  ) {
    return effective;
  }
  return "floating";
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

/** Dock mode to restore when opening copilot from the collapsed FAB (not mini-floating). */
export function resolveCopilotOpenDockMode(
  preferred: CopilotDockMode | null | undefined
): CopilotDockMode {
  if (
    preferred === "drawer" ||
    preferred === "sidebar" ||
    preferred === "bottom" ||
    preferred === "floating"
  ) {
    return preferred;
  }
  return "sidebar";
}

export interface OpenCopilotShellInput {
  mergeLayout?: (patch: Partial<CopilotLayoutSnapshotV1>) => void;
  preferredDockMode?: CopilotDockMode | null;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
}

/** Open copilot shell from FAB-equivalent entry points (tools, URL params, etc.). */
export function openCopilotShell(input: OpenCopilotShellInput): void {
  input.mergeLayout?.({ collapseToCircle: false, open: true });
  input.setPreferredDockMode?.(
    resolveCopilotOpenDockMode(input.preferredDockMode)
  );
  input.setOpen(true);
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
      pathname: "/mdl/engenty-copilot/chat",
      routeKey: "chat",
      scope: globalScope(baseContext.scope ?? scope),
    },
  });

  return options;
}

/** FAB is visible only in collapsed mini-floating (circle) state, plus during collapse morph. */
export function shouldShowCopilotFab(input: {
  collapseToCircle: boolean;
  isCollapsingToIcon: boolean;
  open: boolean;
  showCompactLauncher: boolean;
  /** When a realtime voice session is active the voice FAB takes over. */
  voiceSessionActive?: boolean;
}): boolean {
  if (input.voiceSessionActive) {
    return false;
  }
  if (input.isCollapsingToIcon) {
    return true;
  }
  if (input.open) {
    return false;
  }
  return input.showCompactLauncher && input.collapseToCircle;
}
