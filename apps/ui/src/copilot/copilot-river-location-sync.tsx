/**
 * Stamps the copilot's next turn with the page the person is on.
 *
 * The river's agent wraps the whole app. Passing the path in as a prop would
 * re-render that tree on every space switch. This writes the path into the
 * ref the session reads when a turn is sent.
 */
import { useSetTurnContext } from "@engenty/ai-ui";
import { useCopilotRoute } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useLayoutEffect, useMemo } from "react";
import { useCopilotSpaceId } from "./use-copilot-space-id";

export function CopilotRiverLocationSync() {
  const { i18n } = useTranslation("common");
  const setTurnContext = useSetTurnContext();
  const shellContext = useCopilotRoute();
  const copilotSpaceId = useCopilotSpaceId();
  const currentLanguage = i18n.language?.startsWith("de") ? "de" : "en";

  const routeContext = useMemo(() => {
    const spaceScope = copilotSpaceId ? { space_id: copilotSpaceId } : {};
    return {
      ...shellContext,
      scope: {
        ...shellContext.scope,
        // After the module's scope: the URL decides the space, and a stale
        // `space_id` on a module context must not place the turn elsewhere.
        ...spaceScope,
        ui_language: currentLanguage,
      },
    };
  }, [copilotSpaceId, currentLanguage, shellContext]);

  useLayoutEffect(() => {
    setTurnContext({
      pathname: shellContext.pathname,
      routeContext,
    });
  }, [routeContext, setTurnContext, shellContext.pathname]);

  return null;
}
