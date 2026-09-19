"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import { reconcileCopilotLayoutSnapshot } from "../session/copilot-layout-snapshot";
import {
  COMPACT_STATUS_FLAP_MAX_HEIGHT,
  COMPACT_STATUS_FLAP_MIN_HEIGHT,
  FLOATING_MAX_HEIGHT,
  FLOATING_MAX_WIDTH,
  FLOATING_MIN_HEIGHT,
  FLOATING_MIN_WIDTH,
} from "./copilot-drawer-constants";

export function useCopilotDrawerLayoutPersistence(input: {
  collapseToCircle: boolean;
  compactStatusFlapHeight: number;
  copilotLayout: CopilotLayoutPersistenceApi | null;
  floatingDockedToCorner: boolean;
  floatingPosition: { x: number; y: number };
  floatingSize: { height: number; width: number };
  setCollapseToCircle: Dispatch<SetStateAction<boolean>>;
  setCompactStatusFlapHeight: Dispatch<SetStateAction<number>>;
  setFloatingDockedToCorner: Dispatch<SetStateAction<boolean>>;
  setFloatingPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setFloatingSize: Dispatch<SetStateAction<{ height: number; width: number }>>;
  /** Flip true after the first hydrate so corner re-pin cannot race restored coords. */
  setLayoutSnapshotApplied: Dispatch<SetStateAction<boolean>>;
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
      if (s.floatingPosition) {
        input.setFloatingPosition({
          x: s.floatingPosition.x,
          y: s.floatingPosition.y,
        });
        // Restored coords are authoritative. Without clearing this latch, the
        // corner re-pin effect (same layout pass / next tick) overwrites them
        // because floatingDockedToCorner always boots as `true`.
        if (typeof s.floatingDockedToCorner === "boolean") {
          input.setFloatingDockedToCorner(s.floatingDockedToCorner);
        } else {
          // Legacy snapshots always wrote floatingPosition (including the
          // default corner). Treat stored coords as free placement so reload
          // cannot wipe a custom drop.
          input.setFloatingDockedToCorner(false);
        }
      } else if (typeof s.floatingDockedToCorner === "boolean") {
        input.setFloatingDockedToCorner(s.floatingDockedToCorner);
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
      if (
        s.compactStatusFlapHeight != null &&
        s.compactStatusFlapHeight >= COMPACT_STATUS_FLAP_MIN_HEIGHT &&
        s.compactStatusFlapHeight <= COMPACT_STATUS_FLAP_MAX_HEIGHT
      ) {
        input.setCompactStatusFlapHeight(s.compactStatusFlapHeight);
      }
      if (typeof s.collapseToCircle === "boolean") {
        input.setCollapseToCircle(s.collapseToCircle);
      }
      // The avatar always defaults to its bottom-right home — its position is
      // intentionally not restored (see handleDockPositionSelect).
    }
    drawerPersistEnabledRef.current = true;
    input.setLayoutSnapshotApplied(true);
  }, [
    input.copilotLayout,
    input.copilotLayout?.layoutHydrated,
    input.copilotLayout?.snapshot,
    input.setCollapseToCircle,
    input.setCompactStatusFlapHeight,
    input.setFloatingDockedToCorner,
    input.setFloatingPosition,
    input.setFloatingSize,
    input.setLayoutSnapshotApplied,
  ]);

  useEffect(() => {
    if (input.copilotLayout == null || !drawerPersistEnabledRef.current) {
      return;
    }
    const { mergeLayout } = input.copilotLayout;
    const timer = window.setTimeout(() => {
      mergeLayout({
        collapseToCircle: input.collapseToCircle,
        compactStatusFlapHeight: input.compactStatusFlapHeight,
        floatingDockedToCorner: input.floatingDockedToCorner,
        floatingPosition: input.floatingPosition,
        floatingSize: input.floatingSize,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    input.collapseToCircle,
    input.compactStatusFlapHeight,
    input.copilotLayout,
    input.floatingDockedToCorner,
    input.floatingPosition.x,
    input.floatingPosition.y,
    input.floatingSize.width,
    input.floatingSize.height,
  ]);
}
