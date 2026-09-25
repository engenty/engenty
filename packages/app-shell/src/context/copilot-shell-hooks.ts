"use client";

import { useContext, useMemo } from "react";
import type {
  CopilotRouteContext,
  CopilotShellActionsValue,
  CopilotShellContextValue,
  CopilotShellHostValue,
  CopilotShellLayoutValue,
} from "../types/copilot-shell";
import {
  useCopilotChromeHidden,
  useCopilotPathname,
} from "./copilot-path-context";
import { mergeCopilotRoute, projectCopilotShell } from "./copilot-shell-merge";
import {
  CopilotActionsContext,
  CopilotHostContext,
  CopilotLayoutContext,
  CopilotOverrideContext,
} from "./copilot-shell-slices";

export function useCopilotLayout(): CopilotShellLayoutValue {
  const ctx = useContext(CopilotLayoutContext);
  if (!ctx) {
    throw new Error(
      "useCopilotLayout must be used within CopilotShellProvider"
    );
  }
  return ctx;
}

export function useCopilotActions(): CopilotShellActionsValue {
  const ctx = useContext(CopilotActionsContext);
  if (!ctx) {
    throw new Error(
      "useCopilotActions must be used within CopilotShellProvider"
    );
  }
  return ctx;
}

export function useCopilotHost(): CopilotShellHostValue {
  const ctx = useContext(CopilotHostContext);
  if (!ctx) {
    throw new Error("useCopilotHost must be used within CopilotShellProvider");
  }
  return ctx;
}

/** Live path + page override. Submit-time route; not layout or host. */
export function useCopilotRoute(): CopilotRouteContext {
  const pathname = useCopilotPathname();
  const override = useContext(CopilotOverrideContext);
  return useMemo(
    () => mergeCopilotRoute(pathname, override),
    [override, pathname]
  );
}

export function useCopilotShell(): CopilotShellContextValue {
  const layout = useContext(CopilotLayoutContext);
  const actions = useContext(CopilotActionsContext);
  const host = useContext(CopilotHostContext);
  const chromeHidden = useCopilotChromeHidden();
  const pathname = useCopilotPathname();
  const override = useContext(CopilotOverrideContext);
  const value = useMemo(() => {
    if (!(layout && actions && host)) {
      return null;
    }
    return projectCopilotShell(
      { ...layout, ...actions, ...host },
      chromeHidden,
      pathname,
      override
    );
  }, [actions, chromeHidden, host, layout, override, pathname]);
  if (!value) {
    throw new Error("useCopilotShell must be used within CopilotShellProvider");
  }
  return value;
}

export function useCopilotShellOrNull(): CopilotShellContextValue | null {
  const layout = useContext(CopilotLayoutContext);
  const actions = useContext(CopilotActionsContext);
  const host = useContext(CopilotHostContext);
  const chromeHidden = useCopilotChromeHidden();
  const pathname = useCopilotPathname();
  const override = useContext(CopilotOverrideContext);
  return useMemo(() => {
    if (!(layout && actions && host)) {
      return null;
    }
    return projectCopilotShell(
      { ...layout, ...actions, ...host },
      chromeHidden,
      pathname,
      override
    );
  }, [actions, chromeHidden, host, layout, override, pathname]);
}

export function useCopilotLayoutOrNull(): CopilotShellLayoutValue | null {
  return useContext(CopilotLayoutContext);
}

export function useCopilotActionsOrNull(): CopilotShellActionsValue | null {
  return useContext(CopilotActionsContext);
}

export function useCopilotHostOrNull(): CopilotShellHostValue | null {
  return useContext(CopilotHostContext);
}
