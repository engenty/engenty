import {
  COPILOT_CHAT_NEW,
  type ParsedCopilotChatRoute,
  parseCopilotChatPathname,
} from "../../paths.js";

export interface CopilotChatRouteState {
  isNewThreadRoute: boolean;
  rawRouteThreadId: string | undefined;
  routeThreadId: string | null;
}

/** Pathname is the single source of truth for which chat route is active. */
export function resolveCopilotChatRoute(
  pathname: string
): CopilotChatRouteState {
  const parsed: ParsedCopilotChatRoute = parseCopilotChatPathname(pathname);
  if (parsed.kind === "thread") {
    return {
      isNewThreadRoute: false,
      rawRouteThreadId: parsed.threadId,
      routeThreadId: parsed.threadId,
    };
  }
  if (parsed.kind === "new") {
    return {
      isNewThreadRoute: true,
      rawRouteThreadId: "new",
      routeThreadId: null,
    };
  }
  if (parsed.kind === "invalid_thread") {
    return {
      isNewThreadRoute: false,
      rawRouteThreadId: parsed.rawId,
      routeThreadId: null,
    };
  }
  return {
    isNewThreadRoute: false,
    rawRouteThreadId: undefined,
    routeThreadId: null,
  };
}

export function isCopilotNewChatPathname(pathname: string): boolean {
  return (
    pathname === COPILOT_CHAT_NEW ||
    parseCopilotChatPathname(pathname).kind === "new"
  );
}
