// Live-path companion host. Mounted only while the drawer is open so a space
// switch does not rebuild contribution matching, page header, or the transcript.

import { ACTIVE_COPILOT_AGENT_ID } from "@engenty/ai-ui";
import { useCopilotRoute } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  CopilotDrawerLayer,
  type CopilotDrawerLayerProps,
} from "@/components/copilot-drawer-layer";
import { useUiPluginContributions } from "@/plugins";

function logCopilotUiState(message: string, payload: Record<string, unknown>) {
  if (process.env.ENV !== "development") {
    return;
  }
  console.log(`[copilot-ui] ${message}`, payload);
}

function resolveContribution(
  pathname: string,
  scope: Record<string, unknown> | undefined,
  contributions: UiCopilotContribution[]
): UiCopilotContribution | null {
  const matchContext = { pathname, scope };
  for (const c of contributions) {
    if (c.matches(matchContext)) {
      return c;
    }
  }
  return null;
}

function readStringScopeValue(
  scope: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = scope?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function useRequestedAgentDevGuard(input: {
  requestedAgentId: string | undefined;
  source: "scope" | "contribution" | null;
}): void {
  useEffect(() => {
    if (process.env.ENV !== "development") {
      return;
    }
    const id = input.requestedAgentId?.trim();
    if (!id || id === ACTIVE_COPILOT_AGENT_ID) {
      return;
    }
    console.warn(
      `[active-copilot] ignoring requestedAgentId=${id} (source=${input.source ?? "unknown"}); lane is locked to ${ACTIVE_COPILOT_AGENT_ID}`
    );
  }, [input.requestedAgentId, input.source]);
}

export function CopilotOpenDrawerLayer({
  chromeHidden,
  dockMode,
  open,
  setOpen,
  setPreferredDockMode,
  shell,
}: {
  chromeHidden: boolean;
  dockMode: CopilotDrawerLayerProps["dockMode"];
  open: boolean;
  setOpen: CopilotDrawerLayerProps["setOpen"];
  setPreferredDockMode: CopilotDrawerLayerProps["setPreferredDockMode"];
  shell: CopilotDrawerLayerProps["shell"];
}) {
  const { i18n } = useTranslation("common");
  const location = useLocation();
  const queryClient = useQueryClient();
  const shellCopilotContext = useCopilotRoute();
  const { contributions } = useUiPluginContributions({ enabled: true });
  const currentLanguage = i18n.language?.startsWith("de") ? "de" : "en";

  const copilotContext = useMemo(() => {
    if (!shellCopilotContext) {
      return {
        moduleId: "engenty-copilot",
        pathname: location.pathname,
        routeKey: "chat",
        scope: { ui_language: currentLanguage },
      };
    }
    return {
      ...shellCopilotContext,
      scope: {
        ...shellCopilotContext.scope,
        ui_language: currentLanguage,
      },
    };
  }, [currentLanguage, location.pathname, shellCopilotContext]);

  const contribution = useMemo(
    () =>
      resolveContribution(
        location.pathname,
        copilotContext.scope,
        contributions.copilotContributions
      ),
    [
      contributions.copilotContributions,
      copilotContext.scope,
      location.pathname,
    ]
  );

  const onCopilotApplySuccess = useCallback(() => {
    const handler = contribution?.onApplySuccess;
    if (!handler) {
      return;
    }
    void handler({
      queryClient,
      pathname: location.pathname,
      scope: (copilotContext.scope ?? {}) as Record<string, unknown>,
    });
  }, [
    contribution?.onApplySuccess,
    copilotContext.scope,
    location.pathname,
    queryClient,
  ]);

  const launchScope = copilotContext.scope;
  const scopeRequestedAgentId = readStringScopeValue(
    launchScope,
    "copilotRequestedAgentId"
  );
  const requestedAgentId =
    scopeRequestedAgentId ?? contribution?.requestedAgentId;
  useRequestedAgentDevGuard({
    requestedAgentId,
    source: scopeRequestedAgentId
      ? "scope"
      : contribution?.requestedAgentId
        ? "contribution"
        : null,
  });

  useEffect(() => {
    logCopilotUiState("shell snapshot", {
      chromeHidden,
      dockMode,
      open,
      pathname: location.pathname,
      preferredDockMode: shell?.preferredDockMode ?? null,
    });
  }, [
    chromeHidden,
    dockMode,
    location.pathname,
    open,
    shell?.preferredDockMode,
  ]);

  return (
    <CopilotDrawerLayer
      contribution={contribution}
      copilotContext={copilotContext}
      dockMode={dockMode}
      location={location}
      onCopilotApplySuccess={onCopilotApplySuccess}
      open={open}
      setOpen={setOpen}
      setPreferredDockMode={setPreferredDockMode}
      shell={shell}
    />
  );
}
