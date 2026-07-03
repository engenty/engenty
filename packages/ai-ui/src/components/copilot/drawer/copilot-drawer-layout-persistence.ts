"use client";

import type { CopilotFabAnchor } from "@engenty/app-shell";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import { reconcileCopilotLayoutSnapshot } from "../session/copilot-layout-snapshot";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_WIDTH,
  FLOATING_MAX_HEIGHT,
  FLOATING_MAX_WIDTH,
  FLOATING_MIN_HEIGHT,
  FLOATING_MIN_WIDTH,
} from "./copilot-drawer-constants";
import type { CopilotPanelMode } from "./copilot-drawer-types";
import {
  computeFabAnchor,
  resolveFabAnchorPosition,
} from "./copilot-fab-anchor";

export function useCopilotDrawerLayoutPersistence(input: {
  collapseToCircle: boolean;
  copilotLayout: CopilotLayoutPersistenceApi | null;
  fabAnchor: CopilotFabAnchor | null;
  fabPosition: { x: number; y: number } | null;
  floatingPosition: { x: number; y: number };
  floatingSize: { height: number; width: number };
  internalPanelMode: CopilotPanelMode;
  isPanelModeControlled: boolean;
  setCollapseToCircle: Dispatch<SetStateAction<boolean>>;
  setFabAnchor: Dispatch<SetStateAction<CopilotFabAnchor | null>>;
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
    const raw = input.copilotLayout.snapshot;
    const s = raw ? reconcileCopilotLayoutSnapshot(raw) : null;
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
      // Restore the FAB's custom corner. Prefer the edge anchor (resilient to
      // viewport changes); fall back to a legacy absolute position.
      const fabSize = {
        width: BUTTON_SNAP_FAB_WIDTH,
        height: BUTTON_SNAP_FAB_SIZE,
      };
      if (s.fabAnchor && typeof window !== "undefined") {
        input.setFabAnchor(s.fabAnchor);
        input.setFabPosition(
          resolveFabAnchorPosition(
            s.fabAnchor,
            fabSize,
            { width: window.innerWidth, height: window.innerHeight },
            BUTTON_SNAP_FAB_INSET
          )
        );
      } else if (s.fabPosition) {
        input.setFabPosition({
          x: s.fabPosition.x,
          y: s.fabPosition.y,
        });
        if (typeof window !== "undefined") {
          input.setFabAnchor(
            computeFabAnchor(s.fabPosition, fabSize, {
              width: window.innerWidth,
              height: window.innerHeight,
            })
          );
        }
      }
    }
    drawerPersistEnabledRef.current = true;
  }, [
    input.copilotLayout,
    input.copilotLayout?.layoutHydrated,
    input.copilotLayout?.snapshot,
    input.isPanelModeControlled,
    input.setCollapseToCircle,
    input.setFabAnchor,
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
        fabAnchor: input.fabAnchor ?? undefined,
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
    input.fabAnchor,
    input.fabPosition,
    input.floatingPosition.x,
    input.floatingPosition.y,
    input.floatingSize.width,
    input.floatingSize.height,
    input.internalPanelMode,
    input.isPanelModeControlled,
  ]);
}
