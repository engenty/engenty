export interface UiCopilotContext {
  moduleId: string;
  pathname: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}

const MODULE_PATH_RE = /^\/module\/([^/]+)(?:\/([^/]+))?(?:\/edit)?/i;

/**
 * Derive context for the global chat launcher. Always returns a general chat
 * context (copilot/chat) with optional scope from the current path.
 * Use this for free-form chat from the floating Copilot button.
 */
export function deriveCopilotContext(pathname: string): UiCopilotContext {
  const match = pathname.match(MODULE_PATH_RE);
  if (match) {
    const moduleId = match[1];
    const entityId = match[2];
    return {
      moduleId: "engenty-copilot",
      routeKey: "chat",
      pathname,
      scope: {
        currentModule: moduleId ?? undefined,
        entityId: entityId ?? undefined,
      },
    };
  }
  return {
    moduleId: "engenty-copilot",
    routeKey: "chat",
    pathname,
    scope: undefined,
  };
}

/**
 * Derive context for a module-specific copilot (e.g. contact detail page).
 * Returns null when not on a module path. Use for contextual drawers that
 * run a specific specialist (e.g. contacts enhance).
 */
export function deriveModuleCopilotContext(
  pathname: string
): UiCopilotContext | null {
  const match = pathname.match(MODULE_PATH_RE);
  if (!match) {
    return null;
  }
  const moduleId = match[1];
  const entityId = match[2];
  if (!moduleId) {
    return null;
  }
  return {
    moduleId,
    routeKey: "enhance",
    pathname,
    scope: entityId ? { entityId } : undefined,
  };
}
