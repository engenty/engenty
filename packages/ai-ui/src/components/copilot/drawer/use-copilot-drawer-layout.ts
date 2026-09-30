"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useCopilotDrawerLayoutPersistence } from "./copilot-drawer-layout-persistence";
import type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";
import type { CopilotDockMode } from "./copilot-drawer-types";
import { resolveCopilotOpenDockMode } from "./copilot-drawer-utils";

export type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";

export function useCopilotDrawerLayout({
  copilotLayout,
  onOpenChange,
  open,
  preferredDockMode = null,
  setPreferredDockMode,
}: UseCopilotDrawerLayoutOptions): UseCopilotDrawerLayoutResult {
  const copilotOpenRef = useRef(open);
  copilotOpenRef.current = open;

  const [collapseToCircle, setCollapseToCircle] = useState(true);

  useLayoutEffect(() => {
    if (open && collapseToCircle) {
      setCollapseToCircle(false);
    }
  }, [open, collapseToCircle]);

  useCopilotDrawerLayoutPersistence({
    collapseToCircle,
    copilotLayout,
    setCollapseToCircle,
  });

  const handleDockPositionSelect = useCallback(
    (value: string) => {
      if (!setPreferredDockMode) {
        return;
      }
      if (value === "mini-floating") {
        setCollapseToCircle(true);
        onOpenChange(false);
        return;
      }
      if (value === "bottom" || value === "floating") {
        setPreferredDockMode("sidebar");
        setCollapseToCircle(false);
        onOpenChange(true);
        return;
      }
      const mode = value as CopilotDockMode;
      setPreferredDockMode(mode);
      setCollapseToCircle(false);
      onOpenChange(true);
    },
    [onOpenChange, setPreferredDockMode]
  );

  const collapseToFabIcon = useCallback(() => {
    setCollapseToCircle(true);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFabTriggerOpen = useCallback(() => {
    setCollapseToCircle(false);
    if (setPreferredDockMode) {
      setPreferredDockMode(resolveCopilotOpenDockMode(preferredDockMode));
    }
    onOpenChange(true);
  }, [onOpenChange, preferredDockMode, setPreferredDockMode]);

  const handleFabTriggerClick = useCallback(() => {
    if (copilotOpenRef.current) {
      collapseToFabIcon();
      return;
    }
    handleFabTriggerOpen();
  }, [collapseToFabIcon, handleFabTriggerOpen]);

  return {
    collapseToCircle,
    collapseToFabIcon,
    handleDockPositionSelect,
    handleFabTriggerClick,
  };
}
