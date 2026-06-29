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
  const launcherMode: CopilotDockMode | null =
    input.shellDockMode ?? (panelMode === "floating" ? "floating" : null);
  const floatingLauncherMode =
    launcherMode === "floating" || launcherMode === "mini-floating";
  const effectiveMode: CopilotDockMode =
    launcherMode === "floating" || launcherMode === "mini-floating"
      ? launcherMode
      : (input.shellDockMode ??
        (panelMode === "floating" ? "floating" : "drawer"));
  const isFloatingStyle =
    effectiveMode === "floating" || effectiveMode === "mini-floating";
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
            ? "floating"
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

  const showCompactLauncher =
    floatingLauncherMode ||
    (!input.open &&
      (effectiveMode === "drawer" ||
        effectiveMode === "bottom" ||
        effectiveMode === "sidebar"));

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
      floatingLauncherMode,
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
      floatingLauncherMode,
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
