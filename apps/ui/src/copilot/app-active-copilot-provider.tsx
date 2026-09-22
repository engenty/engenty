// Shell-level wrapper that mounts the copilot river so the routed page tree
// (`/copilot`, `/s/<key>/copilot`) and the companion (drawer / sidebar /
// window) resolve the same host from the same provider.

import {
  CopilotRiverProvider,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

  // The space the copilot considers itself in for this URL, carried in
  // `scope`. Under the river this no longer files the THREAD anywhere — there
  // is one thread — it stamps the TURN (apps/ai turn-context.ts), which is what
  // cuts the river into chapters and lets a run reach the space's tools.
  //
  // Null while the spaces query is still loading; recomputed when it resolves.
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
        // are in, and a module's copilot context carrying a stale `space_id`
        // must not be able to place the turn somewhere else.
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

  // Read for its side effect of validating configuration early, the way the
  // provider before it did; the river client reads the base URL itself.
  void resolveEngentyAiServiceBaseUrl();

  return (
    <CopilotRiverProvider
      navigate={navigate}
      pathname={location.pathname}
      routeContext={routeContext}
      tenantId={props.tenantId}
      userId={props.userId}
    >
      {props.children}
    </CopilotRiverProvider>
  );
}
