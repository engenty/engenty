"use client";

import { cn } from "@engenty/ui-core";
import { type ComponentPropsWithoutRef, useCallback, useRef } from "react";
import {
  useCopilotActionsOrNull,
  useCopilotHostOrNull,
} from "./copilot-shell-hooks";

/** Wrapper for main content. Use inside CopilotShellContentArea. */
export function CopilotShellMain({
  className,
  id: _idFromProps,
  ...rest
}: ComponentPropsWithoutRef<"main">) {
  return (
    <main
      className={cn(className)}
      data-engenty-region="main"
      id="engenty-app-main"
      {...rest}
    />
  );
}

/** Wrapper for content area (topbar + main). Assigns mainContentRef for bottom-dock anchoring. */
export function CopilotShellContentArea(
  props: ComponentPropsWithoutRef<"div">
) {
  const host = useCopilotHostOrNull();
  const actions = useCopilotActionsOrNull();
  const hostRef = useRef(host);
  const actionsRef = useRef(actions);
  hostRef.current = host;
  actionsRef.current = actions;
  const hasNotified = useRef(false);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    const currentHost = hostRef.current;
    if (!currentHost) {
      return;
    }
    currentHost.mainContentRef.current = el;
    if (el && !hasNotified.current) {
      hasNotified.current = true;
      actionsRef.current?.notifyMainMounted?.();
    }
    if (!el) {
      hasNotified.current = false;
    }
  }, []);

  return <div ref={setRef} {...props} />;
}
