"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CopilotDockMode, CopilotPanelMode } from "./copilot-drawer-types";
import {
  debugCopilotSurface,
  getDockedModePreference,
} from "./copilot-drawer-utils";

export interface UseCopilotDrawerShellModeInput {
  controlledPanelMode?: CopilotPanelMode;
  defaultPanelMode: CopilotPanelMode;
  onPanelModeChange?: (mode: CopilotPanelMode) => void;
  open: boolean;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  shellDockMode?: CopilotDockMode;
}

export function useCopilotDrawerShellMode(
  input: UseCopilotDrawerShellModeInput
) {
  const isPanelModeControlled = input.controlledPanelMode !== undefined;
  const [internalPanelMode, setInternalPanelMode] = useState<CopilotPanelMode>(
    input.defaultPanelMode
  );
  const panelMode = isPanelModeControlled
    ? input.controlledPanelMode
    : internalPanelMode;
  const launcherMode: CopilotDockMode | null = input.shellDockMode ?? null;
  const effectiveMode: CopilotDockMode = input.shellDockMode ?? "drawer";
  const isFloatingStyle = effectiveMode === "window";
  const panelModeForHeader: CopilotPanelMode = isFloatingStyle
    ? "floating"
    : "docked";
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);
  const previousModeRef = useRef(effectiveMode);

  const setPanelMode = useCallback(
    (mode: CopilotPanelMode) => {
      if (!isPanelModeControlled) {
        setInternalPanelMode(mode);
      }
      if (input.setPreferredDockMode) {
        const nextDockMode =
          mode === "floating"
            ? "window"
            : getDockedModePreference(input.shellDockMode);
        debugCopilotSurface("panel-mode-change", {
          mode,
          nextDockMode,
          panelMode,
          shellDockMode: input.shellDockMode,
        });
        input.setPreferredDockMode(nextDockMode);
      }
      input.onPanelModeChange?.(mode);
    },
    [
      isPanelModeControlled,
      input.onPanelModeChange,
      input.setPreferredDockMode,
      input.shellDockMode,
      panelMode,
    ]
  );

  const showCompactLauncher = false;

  useEffect(() => {
    if (previousModeRef.current === effectiveMode) {
      return;
    }
    setSurfaceEpoch((currentEpoch) => currentEpoch + 1);
    previousModeRef.current = effectiveMode;
  }, [effectiveMode]);

  return useMemo(
    () => ({
      effectiveMode,
      floatingLauncherMode: false,
      isFloatingStyle,
      isPanelModeControlled,
      launcherMode,
      panelMode,
      panelModeForHeader,
      setInternalPanelMode,
      setPanelMode,
      showCompactLauncher,
      surfaceEpoch,
    }),
    [
      effectiveMode,
      isFloatingStyle,
      isPanelModeControlled,
      launcherMode,
      panelMode,
      panelModeForHeader,
      showCompactLauncher,
      surfaceEpoch,
      setPanelMode,
    ]
  );
}
