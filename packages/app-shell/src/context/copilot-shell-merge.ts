import { deriveCopilotContext } from "@engenty/ui-plugin-sdk";
import { remapPersistedDockMode } from "../types/copilot-layout";
import type {
  CopilotDockMode,
  CopilotRouteContext,
  CopilotShellContextValue,
} from "../types/copilot-shell";

/** Compute effective dock mode from screen size when user prefers auto. */
export function resolveEffectiveMode(
  preferred: CopilotDockMode | null,
  isMobile: boolean,
  isTablet: boolean
): CopilotDockMode {
  const live = remapPersistedDockMode(preferred);
  if (live != null) {
    if (isMobile && live !== "drawer") {
      return "drawer";
    }
    if (isTablet && live === "sidebar") {
      return "drawer";
    }
    return live;
  }
  if (isMobile || isTablet) {
    return "drawer";
  }
  return "sidebar";
}

export function mergeCopilotRoute(
  pathname: string,
  override: Partial<CopilotRouteContext> | null
): CopilotRouteContext {
  const derived = deriveCopilotContext(pathname);
  if (!override) {
    return derived;
  }
  return {
    moduleId: override.moduleId ?? derived.moduleId,
    pathname: override.pathname ?? derived.pathname,
    routeKey: override.routeKey ?? derived.routeKey,
    scope:
      override.scope === null || override.scope === undefined
        ? derived.scope
        : { ...derived.scope, ...override.scope },
  };
}

export function projectCopilotShell(
  base: Omit<CopilotShellContextValue, "chromeHidden" | "copilotContext">,
  chromeHidden: boolean,
  pathname: string,
  override: Partial<CopilotRouteContext> | null
): CopilotShellContextValue {
  return {
    ...base,
    chromeHidden,
    copilotContext: mergeCopilotRoute(pathname, override),
  };
}
