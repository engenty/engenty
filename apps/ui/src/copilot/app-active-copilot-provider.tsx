// Shell-level wrapper that mounts the active copilot provider so both
// the routed page tree (full-page `/chat/*`) and the copilot slot (drawer)
// resolve copilot host + binding hooks from the same provider tree.

import {
  ActiveCopilotProvider,
  isActiveCopilotChatIndexPathname,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import {
  isFullPageCopilotChatRoute,
  parseCopilotChatPathname,
  resolveCopilotChatThreadIdFromPathname,
} from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

  const routeContext = useMemo(() => {
    const shellContext = shell?.copilotContext;
    if (!shellContext) {
      return {
        moduleId: "engenty-copilot",
        pathname: location.pathname,
        routeKey: "chat",
        scope: { ui_language: currentLanguage },
      };
    }
    return {
      ...shellContext,
      scope: {
        ...shellContext.scope,
        ui_language: currentLanguage,
      },
    };
  }, [currentLanguage, location.pathname, shell?.copilotContext]);

  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";

  return (
    <ActiveCopilotProvider
      isChatIndexRoute={isChatIndexRoute}
      isFullPageChatRoute={isFullPageChatRoute}
      isNewChatRoute={isNewChatRoute}
      navigate={navigate}
      pathname={location.pathname}
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
