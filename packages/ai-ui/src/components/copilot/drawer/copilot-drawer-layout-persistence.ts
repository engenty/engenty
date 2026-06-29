"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import {
  FLOATING_MAX_HEIGHT,
  FLOATING_MAX_WIDTH,
  FLOATING_MIN_HEIGHT,
  FLOATING_MIN_WIDTH,
} from "./copilot-drawer-constants";
import type { CopilotPanelMode } from "./copilot-drawer-types";

export function useCopilotDrawerLayoutPersistence(input: {
  collapseToCircle: boolean;
  copilotLayout: CopilotLayoutPersistenceApi | null;
  fabPosition: { x: number; y: number } | null;
  floatingPosition: { x: number; y: number };
  floatingSize: { height: number; width: number };
  internalPanelMode: CopilotPanelMode;
  isPanelModeControlled: boolean;
  setCollapseToCircle: Dispatch<SetStateAction<boolean>>;
  setFabPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setFloatingPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setFloatingSize: Dispatch<SetStateAction<{ height: number; width: number }>>;
  setInternalPanelMode: Dispatch<SetStateAction<CopilotPanelMode>>;
}) {
  const drawerSnapshotAppliedRef = useRef(false);
  const drawerPersistEnabledRef = useRef(false);

  useLayoutEffect(() => {
    if (
      input.copilotLayout == null ||
      !input.copilotLayout.layoutHydrated ||
      drawerSnapshotAppliedRef.current
    ) {
      return;
    }
    drawerSnapshotAppliedRef.current = true;
    const s = input.copilotLayout.snapshot;
    if (s) {
      if (
        !input.isPanelModeControlled &&
        (s.panelMode === "floating" || s.panelMode === "docked")
      ) {
        input.setInternalPanelMode(s.panelMode);
      }
      if (s.floatingPosition) {
        input.setFloatingPosition({
          x: s.floatingPosition.x,
          y: s.floatingPosition.y,
        });
      }
      if (
        s.floatingSize &&
        s.floatingSize.width >= FLOATING_MIN_WIDTH &&
        s.floatingSize.width <= FLOATING_MAX_WIDTH &&
        s.floatingSize.height >= FLOATING_MIN_HEIGHT &&
        s.floatingSize.height <= FLOATING_MAX_HEIGHT
      ) {
        input.setFloatingSize({
          width: s.floatingSize.width,
          height: s.floatingSize.height,
        });
      }
      if (typeof s.collapseToCircle === "boolean") {
        input.setCollapseToCircle(s.collapseToCircle);
      }
      // Restore custom FAB position (undefined → keep null default)
      if (s.fabPosition) {
        input.setFabPosition({
          x: s.fabPosition.x,
          y: s.fabPosition.y,
        });
      }
    }
    drawerPersistEnabledRef.current = true;
  }, [
    input.copilotLayout,
    input.copilotLayout?.layoutHydrated,
    input.copilotLayout?.snapshot,
    input.isPanelModeControlled,
    input.setCollapseToCircle,
    input.setFabPosition,
    input.setFloatingPosition,
    input.setFloatingSize,
    input.setInternalPanelMode,
  ]);

  useEffect(() => {
    if (input.copilotLayout == null || !drawerPersistEnabledRef.current) {
      return;
    }
    const { mergeLayout } = input.copilotLayout;
    const timer = window.setTimeout(() => {
      mergeLayout({
        collapseToCircle: input.collapseToCircle,
        fabPosition: input.fabPosition ?? undefined,
        floatingPosition: input.floatingPosition,
        floatingSize: input.floatingSize,
        ...(input.isPanelModeControlled
          ? {}
          : { panelMode: input.internalPanelMode }),
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    input.collapseToCircle,
    input.copilotLayout,
    input.fabPosition,
    input.floatingPosition.x,
    input.floatingPosition.y,
    input.floatingSize.width,
    input.floatingSize.height,
    input.internalPanelMode,
    input.isPanelModeControlled,
  ]);
}
