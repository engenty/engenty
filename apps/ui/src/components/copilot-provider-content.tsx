// Companion-side host for the copilot. Mounted beside AppLayout via
// `CopilotShellUiHost`; `CopilotRiverProvider` wraps the layout in App.tsx so
// the river's page and the companion share one host via `useAgentHost`.

import {
  ACTIVE_COPILOT_AGENT_ID,
  isCopilotRiverPathname,
  openCopilotShell,
} from "@engenty/ai-ui";
import {
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
  useCopilotShellOrNull,
} from "@engenty/app-shell";
import { useRegisterCopilotFrontendTools } from "@engenty/engenty-copilot/ai/frontend-tools/register";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CopilotDrawerLayer } from "@/components/copilot-drawer-layer";
import { setUserSetting } from "@/lib/api/client";
import { isModuleHubChatRoute } from "@/lib/module-chat-routes";
import { workspaceContextOptions } from "@/lib/workspace-context-query";
import { useUiPluginContributions } from "@/plugins";

// Dev-only console trace for the copilot UI dock-mode / open state, so route
// transitions (especially onto and off the river's page)
// are easy to follow alongside `[copilot-layout]` persistence logs.
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

// Dev guard: the main copilot lane is locked to `engenty.copilot`; flag scopes /
// contributions that try to swap agents so we catch leftover Phase-C wiring.
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

export function CopilotProviderContent() {
  const { i18n, t } = useTranslation("common");
  const { setTheme } = useTheme();
  const { currentTenant } = useWorkspaceContext();
  const location = useLocation();
  // Pages that already show a conversation full width: the river's own page
  // and a module's hub chat. The companion has nothing to add there, so its
  // chrome hides; the layer itself stays mounted so the blob, Prompt and Voice
  // keep working from the app bar.
  const chromeHidden =
    isCopilotRiverPathname(location.pathname) ||
    isModuleHubChatRoute(location.pathname);
  const queryClient = useQueryClient();
  const shell = useCopilotShellOrNull();
  const [localOpen, setLocalOpen] = useState(false);

  const open = shell?.open ?? localOpen;
  const setOpen = shell?.setOpen ?? setLocalOpen;
  const dockMode = shell?.dockMode;
  const setPreferredDockMode = shell?.setPreferredDockMode;
  const shellCopilotContext = shell?.copilotContext;

  const { contributions } = useUiPluginContributions({ enabled: true });
  const currentLanguage = i18n.language?.startsWith("de") ? "de" : "en";
  const agentUiStateSnapshot = useAgentUiStateSnapshot();
  const frontendTools = useAgentUiFrontendTools();
  const agentUi = useMemo(
    () => ({
      frontend_tools: frontendTools,
      state_snapshot: agentUiStateSnapshot,
    }),
    [agentUiStateSnapshot, frontendTools]
  );

  const persistAppearance = useCallback(async (key: string, value: unknown) => {
    await setUserSetting(
      key,
      value as {
        type: "string" | "numeric" | "boolean" | "json";
        value_boolean?: boolean | null;
        value_jsonb?: unknown;
        value_numeric?: number | null;
        value_string?: string | null;
      }
    );
  }, []);

  const invalidateWorkspaceContext = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: workspaceContextOptions.queryKey,
    });
  }, [queryClient]);

  const openCopilotShellAction = useCallback(() => {
    openCopilotShell({
      chromeHidden: shell?.chromeHidden,
      isTalkPage: isCopilotRiverPathname(location.pathname),
      mergeLayout: shell?.copilotLayout.mergeLayout,
      preferredDockMode: shell?.preferredDockMode ?? null,
      setOpen,
      setPreferredDockMode,
    });
  }, [
    location.pathname,
    shell?.chromeHidden,
    shell?.copilotLayout.mergeLayout,
    shell?.preferredDockMode,
    setOpen,
    setPreferredDockMode,
  ]);

  useRegisterCopilotFrontendTools({
    changeLanguage: i18n.changeLanguage.bind(i18n),
    invalidateWorkspaceContext,
    open,
    openCopilotShell: openCopilotShellAction,
    persistAppearance,
    setOpen,
    setPreferredDockMode,
    setTheme,
  });

  // Page-supplied copilot route context feeds the active copilot host and drawer contribution resolution.
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
  }, [shellCopilotContext, location.pathname, currentLanguage]);

  const contribution = useMemo(
    () =>
      resolveContribution(
        location.pathname,
        copilotContext.scope,
        contributions.copilotContributions
      ),
    [
      location.pathname,
      copilotContext.scope,
      contributions.copilotContributions,
    ]
  );

  const onApplySuggestions = useCallback(
    async (patch: Record<string, string | null>) => {
      const scope = copilotContext.scope ?? {};
      const draftApplyHandler = contribution?.resolveApplySuggestions?.({
        pathname: location.pathname,
        scope,
      });
      if (draftApplyHandler) {
        await draftApplyHandler(patch);
        return;
      }
      if (!contribution?.applySuggestions) {
        throw new Error("No apply handler configured.");
      }
      await contribution.applySuggestions(patch, { scope });
    },
    [
      contribution,
      contribution?.resolveApplySuggestions,
      contribution?.applySuggestions,
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

  const hasApply =
    contribution?.resolveApplySuggestions != null ||
    contribution?.applySuggestions != null;
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
  const startMode =
    readStringScopeValue(launchScope, "copilotStartMode") === "auto"
      ? "auto"
      : "manual";
  const triggerType = (() => {
    const value = readStringScopeValue(launchScope, "copilotTriggerType");
    return value === "button" || value === "shortcut"
      ? value
      : "message_copilot";
  })();
  const copilotAutoUserMessage = readStringScopeValue(
    launchScope,
    "copilotAutoUserMessage"
  );

  useEffect(() => {
    if (chromeHidden) {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("copilot") === "open" && !open) {
      openCopilotShellAction();
    }
  }, [chromeHidden, location.search, open, openCopilotShellAction]);

  useEffect(() => {
    logCopilotUiState("shell snapshot", {
      chromeHidden,
      dockMode,
      open,
      pathname: location.pathname,
      preferredDockMode: shell?.preferredDockMode ?? null,
    });
  }, [
    dockMode,
    chromeHidden,
    open,
    location.pathname,
    shell?.preferredDockMode,
  ]);

  const copilotLayoutReady =
    shell?.copilotLayout.layoutHydrated !== false &&
    (shell?.copilotLayoutApplied ?? true);
  if (!copilotLayoutReady) {
    return null;
  }

  return (
    <CopilotDrawerLayer
      agentUi={agentUi}
      contribution={contribution}
      copilotAutoUserMessage={copilotAutoUserMessage}
      copilotContext={copilotContext}
      currentTenant={currentTenant}
      dockMode={dockMode}
      hasApply={hasApply}
      launchScope={launchScope}
      location={location}
      onApplySuggestions={onApplySuggestions}
      onCopilotApplySuccess={onCopilotApplySuccess}
      open={open}
      requestedAgentId={requestedAgentId}
      setOpen={setOpen}
      setPreferredDockMode={setPreferredDockMode}
      shell={shell}
      startMode={startMode}
      triggerType={triggerType}
    />
  );
}
