// Shell-level wrapper that mounts the active copilot provider so both
// the routed page tree (full-page `/chat/*`) and the copilot slot (drawer)
// resolve copilot host + binding hooks from the same provider tree.

import {
  ActiveCopilotProvider,
  defaultCopilotSessionPath,
  isActiveCopilotChatIndexPathname,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import {
  COPILOT_MODULE_ID,
  isFullPageCopilotChatRoute,
  parseCopilotChatPathname,
  resolveCopilotChatThreadIdFromPathname,
} from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parseSpacePath, spaceModulePath } from "@/lib/space-routes";
import { useCopilotSpaceId } from "./use-copilot-space-id";

export interface AppActiveCopilotProviderProps {
  children: ReactNode;
  tenantId: string;
  userId: string;
}

export function AppActiveCopilotProvider(props: AppActiveCopilotProviderProps) {
  const { i18n } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const shell = useCopilotShellOrNull();
  const currentLanguage = i18n.language?.startsWith("de") ? "de" : "en";

  const isFullPageChatRoute = isFullPageCopilotChatRoute(location.pathname);
  const isChatIndexRoute = useMemo(
    () => isActiveCopilotChatIndexPathname(location.pathname),
    [location.pathname]
  );
  const isNewChatRoute = useMemo(
    () => parseCopilotChatPathname(location.pathname).kind === "new",
    [location.pathname]
  );
  const routeThreadId = useMemo(
    () => resolveCopilotChatThreadIdFromPathname(location.pathname),
    [location.pathname]
  );

  // Selecting a chat while standing in a space must keep the URL in that space.
  // The default builder emits `/mdl/…`, which is the personal desk — following
  // it from `/s/<key>/copilot/chat` would leave the space Copilot.
  const spaceKey = useMemo(
    () => parseSpacePath(location.pathname)?.spaceKey ?? null,
    [location.pathname]
  );
  const resolveSessionPath = useMemo(
    () =>
      spaceKey
        ? (threadId: string) =>
            spaceModulePath(
              spaceKey,
              COPILOT_MODULE_ID,
              `chat/${encodeURIComponent(threadId)}`
            )
        : defaultCopilotSessionPath,
    [spaceKey]
  );

  // The space this chat belongs to, carried in `scope` (PLAN-spaces.md Phase
  // C2). `scope` rather than a field of its own because the agent affinity key
  // hashes it: putting the space there is what stops the drawer in Marketing
  // from resuming the thread you left open in Company, with no second
  // mechanism. `space_id` must therefore stay OUT of
  // AFFINITY_EXCLUDED_SCOPE_KEYS.
  //
  // Null while the spaces query is still loading. That is not a hole: the value
  // is read when a thread is created, the route context is recomputed when the
  // query resolves, and the server coalesces rather than overwriting — so a
  // thread cannot be un-spaced by a later save that arrived before the answer.
  //
  // The SAME hook the threads provider keys persisted active threads by, so a
  // thread cannot be resumed from one space and recorded in another.
  const copilotSpaceId = useCopilotSpaceId();

  const routeContext = useMemo(() => {
    const spaceScope = copilotSpaceId ? { space_id: copilotSpaceId } : {};
    const shellContext = shell?.copilotContext;
    if (!shellContext) {
      return {
        moduleId: "engenty-copilot",
        pathname: location.pathname,
        routeKey: "chat",
        scope: { ...spaceScope, ui_language: currentLanguage },
      };
    }
    return {
      ...shellContext,
      scope: {
        ...shellContext.scope,
        // AFTER the module's scope, not before: the URL decides which space you
        // are in (Phase 5a), and a module's copilot context carrying a stale
        // `space_id` must not be able to bind the chat somewhere else. Same
        // precedence rule `useRouteSpace` follows for the same reason.
        ...spaceScope,
        ui_language: currentLanguage,
      },
    };
  }, [
    copilotSpaceId,
    currentLanguage,
    location.pathname,
    shell?.copilotContext,
  ]);

  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";

  return (
    <ActiveCopilotProvider
      isChatIndexRoute={isChatIndexRoute}
      isFullPageChatRoute={isFullPageChatRoute}
      isNewChatRoute={isNewChatRoute}
      navigate={navigate}
      pathname={location.pathname}
      resolveSessionPath={resolveSessionPath}
      routeContext={routeContext}
      routeThreadId={routeThreadId}
      serviceBaseUrl={serviceBaseUrl}
      tenantId={props.tenantId}
      userId={props.userId}
    >
      {props.children}
    </ActiveCopilotProvider>
  );
}
