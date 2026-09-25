// Companion-side host for the copilot. Mounted beside AppLayout via
// `CopilotShellUiHost`; `CopilotRiverProvider` wraps the layout in App.tsx so
// the river's page and the companion share one host via `useAgentHost`.
//
// This host does not read the live path. Path goes to `CopilotRiverLocationSync`
// (submit-time) and to `CopilotOpenDrawerLayer` only while the companion is open.

import { openCopilotShell } from "@engenty/ai-ui";
import {
  useCopilotActionsOrNull,
  useCopilotChromeHidden,
  useCopilotHostOrNull,
  useCopilotLayoutOrNull,
} from "@engenty/app-shell";
import { useRegisterCopilotFrontendTools } from "@engenty/engenty-copilot/ai/frontend-tools/register";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CopilotClosedDrawerChrome } from "@/components/copilot-drawer-layer";
import { CopilotOpenDrawerLayer } from "@/components/copilot-open-drawer-layer";
import { setUserSetting } from "@/lib/api/client";
import { workspaceContextOptions } from "@/lib/workspace-context-query";

function CopilotOpenFromQuery({
  chromeHidden,
  open,
  openCopilotShellAction,
}: {
  chromeHidden: boolean;
  open: boolean;
  openCopilotShellAction: () => void;
}) {
  const location = useLocation();
  useEffect(() => {
    if (chromeHidden) {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("copilot") === "open" && !open) {
      openCopilotShellAction();
    }
  }, [chromeHidden, location.search, open, openCopilotShellAction]);
  return null;
}

export function CopilotProviderContent() {
  const { i18n } = useTranslation("common");
  const { setTheme } = useTheme();
  const chromeHidden = useCopilotChromeHidden();
  const queryClient = useQueryClient();
  const layout = useCopilotLayoutOrNull();
  const actions = useCopilotActionsOrNull();
  const host = useCopilotHostOrNull();
  const [localOpen, setLocalOpen] = useState(false);

  const open = layout?.open ?? localOpen;
  const setOpen = actions?.setOpen ?? setLocalOpen;
  const dockMode = layout?.dockMode;
  const setPreferredDockMode = actions?.setPreferredDockMode;

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
      chromeHidden,
      isTalkPage: chromeHidden,
      mergeLayout: host?.copilotLayout.mergeLayout,
      preferredDockMode: layout?.preferredDockMode ?? null,
      setOpen,
      setPreferredDockMode,
    });
  }, [
    chromeHidden,
    host?.copilotLayout.mergeLayout,
    layout?.preferredDockMode,
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

  const shell = useMemo(
    () =>
      host
        ? {
            copilotDockRef: host.copilotDockRef,
            copilotLayout: host.copilotLayout,
            copilotSidebarRef: host.copilotSidebarRef,
            mainContentReady: host.mainContentReady,
            mainContentRef: host.mainContentRef,
            preferredDockMode: layout?.preferredDockMode ?? null,
          }
        : null,
    [host, layout?.preferredDockMode]
  );

  const copilotLayoutReady =
    host?.copilotLayout.layoutHydrated !== false &&
    (layout?.copilotLayoutApplied ?? true);
  if (!copilotLayoutReady) {
    return null;
  }

  return (
    <>
      <CopilotOpenFromQuery
        chromeHidden={chromeHidden}
        open={open}
        openCopilotShellAction={openCopilotShellAction}
      />
      {open ? (
        <CopilotOpenDrawerLayer
          chromeHidden={chromeHidden}
          dockMode={dockMode}
          open={open}
          setOpen={setOpen}
          setPreferredDockMode={setPreferredDockMode}
          shell={shell}
        />
      ) : (
        <CopilotClosedDrawerChrome
          dockMode={dockMode}
          setOpen={setOpen}
          setPreferredDockMode={setPreferredDockMode}
          shell={shell}
        />
      )}
    </>
  );
}
