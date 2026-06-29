"use client";

import type {
  Dispatch,
  MutableRefObject,
  PointerEvent,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  ATTACH_THRESHOLD,
  BOTTOM_DOCK_SNAP_THRESHOLD,
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  COMPACT_LAUNCHER_HEIGHT,
  COMPACT_LAUNCHER_WIDTH,
  FLOATING_MAX_HEIGHT,
  FLOATING_MAX_WIDTH,
  FLOATING_MIN_HEIGHT,
  FLOATING_MIN_WIDTH,
} from "./copilot-drawer-constants";
import type { CopilotDockMode } from "./copilot-drawer-types";
import type { CopilotFloatingSnapTarget } from "./copilot-drawer-utils";

export function useCopilotDrawerFloatingDrag(input: {
  bottomDockCardRef: MutableRefObject<HTMLDivElement | null>;
  compactShellMeasuredRef: MutableRefObject<{ height: number; width: number }>;
  copilotOpenRef: MutableRefObject<boolean>;
  dragBoundsMargin: number;
  effectiveMode: CopilotDockMode;
  floatingPosition: { x: number; y: number };
  floatingSize: { height: number; width: number };
  margin: number;
  onOpenChange: (open: boolean) => void;
  setCollapseToCircle: Dispatch<SetStateAction<boolean>>;
  setFabPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setFloatingPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setFloatingSize: Dispatch<SetStateAction<{ height: number; width: number }>>;
  setPanelMode: (mode: "docked" | "floating") => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  setSnapTarget: Dispatch<SetStateAction<CopilotFloatingSnapTarget>>;
  snapTargetRef: MutableRefObject<CopilotFloatingSnapTarget>;
  surfaceHeight: number;
  surfaceWidth: number;
}) {
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });
  // Tracks the last computed position during any drag (FAB or panel)
  const lastDragPositionRef = useRef({ x: 0, y: 0 });
  // Saves the modal's floatingPosition before FAB drag so we can restore it
  const savedFloatingPositionRef = useRef<{ x: number; y: number } | null>(
    null
  );
  const tearOffFromBottomDockRef = useRef(false);
  const tearOffDockCardBottomYRef = useRef(0);
  const bottomDockDragCommittedRef = useRef(false);
  const resizeRef = useRef<{
    isResizing: boolean;
    edge: "e" | "s" | "se";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  }>({
    isResizing: false,
    edge: "se",
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startLeft: 0,
    startTop: 0,
  });
  const restoreUserSelectRef = useRef<(() => void) | null>(null);

  const suppressTextSelection = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousBodyUserSelect = document.body.style.userSelect;
    const previousDocumentUserSelect =
      document.documentElement.style.userSelect;

    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";
    window.getSelection?.()?.removeAllRanges();

    restoreUserSelectRef.current = () => {
      document.body.style.userSelect = previousBodyUserSelect;
      document.documentElement.style.userSelect = previousDocumentUserSelect;
      restoreUserSelectRef.current = null;
    };
  }, []);

  const restoreTextSelection = useCallback(() => {
    restoreUserSelectRef.current?.();
  }, []);

  useEffect(() => () => restoreTextSelection(), [restoreTextSelection]);

  const clearSnapTarget = useCallback(() => {
    input.snapTargetRef.current = null;
    input.setSnapTarget(null);
  }, [input.setSnapTarget, input.snapTargetRef]);

  const applyFloatingDragMove = useCallback(
    (clientX: number, clientY: number, surfW: number, surfH: number) => {
      if (typeof window === "undefined") {
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!dragRef.current.isDragging) {
        return;
      }
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;
      const nextX = Math.max(
        input.dragBoundsMargin,
        Math.min(
          w - surfW - input.dragBoundsMargin,
          dragRef.current.startLeft + dx
        )
      );
      const nextY = Math.max(
        input.dragBoundsMargin,
        Math.min(
          h - surfH - input.dragBoundsMargin,
          dragRef.current.startTop + dy
        )
      );
      // Use a tighter snap threshold for small surfaces (FAB avatar)
      const bottomThreshold =
        surfH <= BUTTON_SNAP_FAB_SIZE ? 32 : BOTTOM_DOCK_SNAP_THRESHOLD;
      const panelBottom = nextY + surfH;
      // For large panels, snap when the panel top (not bottom) is near the
      // viewport bottom to avoid premature snapping from configured height.
      // For the FAB, snap based on the FAB bottom as usual.
      const distToBottom =
        surfH <= BUTTON_SNAP_FAB_SIZE
          ? h - panelBottom // FAB: distance from FAB bottom edge
          : h - nextY - surfH * 0.5; // Panel: distance from panel midpoint
      const nearViewportBottom = distToBottom <= bottomThreshold;
      const nearRightEdge = w - (nextX + surfW) <= ATTACH_THRESHOLD;
      const fabHomeBottom = h - BUTTON_SNAP_FAB_INSET - BUTTON_SNAP_FAB_SIZE;
      const nearFabHome =
        panelBottom >= fabHomeBottom - ATTACH_THRESHOLD && nearRightEdge;
      // After tearing off from bottom dock, suppress bottom snap until the
      // panel is dragged well above the original dock position
      const clearedTearOffBand =
        !tearOffFromBottomDockRef.current ||
        panelBottom <
          tearOffDockCardBottomYRef.current - bottomThreshold - surfH;
      const isBottomDockSnapCandidate =
        nearViewportBottom && clearedTearOffBand;
      const isButtonSnapCandidate = nearFabHome;
      const isSidebarSnapCandidate =
        nearRightEdge && !nearViewportBottom && !nearFabHome;

      input.setFloatingPosition({ x: nextX, y: nextY });
      lastDragPositionRef.current = { x: nextX, y: nextY };
      const nextSnap: CopilotFloatingSnapTarget = isButtonSnapCandidate
        ? "button"
        : isBottomDockSnapCandidate
          ? "bottom"
          : isSidebarSnapCandidate
            ? "sidebar"
            : null;
      input.snapTargetRef.current = nextSnap;
      input.setSnapTarget(nextSnap);
    },
    [
      input.dragBoundsMargin,
      input.setFloatingPosition,
      input.setSnapTarget,
      input.snapTargetRef,
    ]
  );

  const finalizeFloatingDrag = useCallback(() => {
    if (!dragRef.current.isDragging) {
      return;
    }
    dragRef.current.isDragging = false;
    const wasTornFromBottom = tearOffFromBottomDockRef.current;
    tearOffFromBottomDockRef.current = false;
    tearOffDockCardBottomYRef.current = 0;
    const activeSnapTarget = input.snapTargetRef.current;
    input.snapTargetRef.current = null;
    input.setSnapTarget(null);
    restoreTextSelection();
    // Restore the modal's floating position if we saved it during FAB drag
    if (savedFloatingPositionRef.current) {
      input.setFloatingPosition(savedFloatingPositionRef.current);
      savedFloatingPositionRef.current = null;
    }
    if (activeSnapTarget === "button") {
      if (wasTornFromBottom) {
        // Torn from bottom dock → land as floating modal, not collapsed avatar
        input.setPreferredDockMode?.("floating");
        input.setPanelMode("floating");
        input.setCollapseToCircle(false);
        input.setFabPosition(null);
        input.onOpenChange(true);
      } else {
        input.setPreferredDockMode?.("mini-floating");
        input.setCollapseToCircle(true);
        input.setFabPosition(null);
        input.onOpenChange(false);
      }
      return;
    }
    if (activeSnapTarget === "bottom") {
      input.setPreferredDockMode?.("bottom");
      input.setFabPosition(null);
      input.onOpenChange(true);
      return;
    }
    if (activeSnapTarget === "sidebar") {
      input.setPreferredDockMode?.("sidebar");
      input.setCollapseToCircle(false);
      input.setFabPosition(null);
      if (input.copilotOpenRef.current) {
        input.setPanelMode("docked");
      } else {
        input.onOpenChange(true);
      }
      return;
    }
    // No snap target — free drop
    if (wasTornFromBottom) {
      // Keep as floating modal at the drop position
      input.setPreferredDockMode?.("floating");
      input.setPanelMode("floating");
      input.setFabPosition(null);
      input.setFloatingPosition({
        x: lastDragPositionRef.current.x,
        y: lastDragPositionRef.current.y,
      });
      input.onOpenChange(true);
    } else {
      // Save the free drop position as the FAB's custom position
      input.setFabPosition({
        x: lastDragPositionRef.current.x,
        y: lastDragPositionRef.current.y,
      });
    }
  }, [
    input.copilotOpenRef,
    input.onOpenChange,
    input.setCollapseToCircle,
    input.setPanelMode,
    input.setPreferredDockMode,
    input.setSnapTarget,
    input.snapTargetRef,
    restoreTextSelection,
  ]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target.closest("button") && !target.closest("[data-drag-handle]")) ||
        target.closest("textarea") ||
        target.closest("input") ||
        target.closest("[role='menuitem']") ||
        target.closest("[role='combobox']")
      ) {
        return;
      }
      e.preventDefault();
      clearSnapTarget();
      suppressTextSelection();
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: input.floatingPosition.x,
        startTop: input.floatingPosition.y,
      };
      target.setPointerCapture?.(e.pointerId);
    },
    [
      clearSnapTarget,
      input.floatingPosition.x,
      input.floatingPosition.y,
      suppressTextSelection,
    ]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (resizeRef.current.isResizing) {
        const { edge, startX, startY, startWidth, startHeight } =
          resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let nextWidth = startWidth;
        let nextHeight = startHeight;
        if (edge === "e" || edge === "se") {
          nextWidth = Math.max(
            FLOATING_MIN_WIDTH,
            Math.min(FLOATING_MAX_WIDTH, startWidth + dx)
          );
        }
        if (edge === "s" || edge === "se") {
          nextHeight = Math.max(
            FLOATING_MIN_HEIGHT,
            Math.min(FLOATING_MAX_HEIGHT, startHeight + dy)
          );
        }
        input.setFloatingSize({ width: nextWidth, height: nextHeight });
        return;
      }
      if (!dragRef.current.isDragging) {
        return;
      }
      applyFloatingDragMove(
        e.clientX,
        e.clientY,
        input.surfaceWidth,
        input.surfaceHeight
      );
    },
    [
      applyFloatingDragMove,
      input.setFloatingSize,
      input.surfaceHeight,
      input.surfaceWidth,
    ]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (resizeRef.current.isResizing) {
        resizeRef.current.isResizing = false;
        clearSnapTarget();
        restoreTextSelection();
        return;
      }
      finalizeFloatingDrag();
    },
    [clearSnapTarget, finalizeFloatingDrag, restoreTextSelection]
  );

  const handleBottomDockGripPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!input.setPreferredDockMode || input.effectiveMode !== "bottom") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const card = input.bottomDockCardRef.current;
      if (!card || typeof window === "undefined") {
        return;
      }

      const origin = card.getBoundingClientRect();
      const originLeft = origin.left;
      const originBottom = origin.bottom;
      const originWidth = origin.width;
      const startX = e.clientX;
      const startY = e.clientY;

      bottomDockDragCommittedRef.current = false;
      suppressTextSelection();
      clearSnapTarget();

      const onMove = (ev: PointerEvent) => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const visualBottom = originBottom + dy;

        const compactW =
          input.compactShellMeasuredRef.current.width || COMPACT_LAUNCHER_WIDTH;
        const compactH =
          input.compactShellMeasuredRef.current.height ||
          COMPACT_LAUNCHER_HEIGHT;
        const tearMargin = Math.min(input.margin, 8);

        if (bottomDockDragCommittedRef.current) {
          applyFloatingDragMove(ev.clientX, ev.clientY, compactW, compactH);
          return;
        }

        if (vh - visualBottom > BOTTOM_DOCK_SNAP_THRESHOLD) {
          bottomDockDragCommittedRef.current = true;
          card.style.removeProperty("transform");

          const visualLeft = originLeft + dx;
          const fx = Math.max(
            tearMargin,
            Math.min(
              vw - compactW - tearMargin,
              visualLeft + originWidth - compactW
            )
          );
          const fy = Math.max(
            tearMargin,
            Math.min(vh - compactH - tearMargin, visualBottom - compactH)
          );

          clearSnapTarget();
          // Tear off from bottom dock → transition to floating modal (keep open)
          input.setPreferredDockMode?.("floating");
          input.setPanelMode("floating");
          input.setCollapseToCircle(false);
          input.setFloatingPosition({ x: fx, y: fy });
          dragRef.current = {
            isDragging: true,
            startX: ev.clientX,
            startY: ev.clientY,
            startLeft: fx,
            startTop: fy,
          };
          tearOffFromBottomDockRef.current = true;
          tearOffDockCardBottomYRef.current = originBottom;
          applyFloatingDragMove(ev.clientX, ev.clientY, compactW, compactH);
          return;
        }

        card.style.transform = `translate(${dx}px, ${dy}px)`;
      };

      const onEnd = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        if (bottomDockDragCommittedRef.current) {
          finalizeFloatingDrag();
        } else {
          card.style.removeProperty("transform");
          restoreTextSelection();
        }
        bottomDockDragCommittedRef.current = false;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [
      applyFloatingDragMove,
      clearSnapTarget,
      finalizeFloatingDrag,
      input.bottomDockCardRef,
      input.compactShellMeasuredRef,
      input.effectiveMode,
      input.margin,
      input.onOpenChange,
      input.setFloatingPosition,
      input.setPreferredDockMode,
      restoreTextSelection,
      suppressTextSelection,
    ]
  );

  const handleResizePointerDown = useCallback(
    (edge: "e" | "s" | "se") => (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      clearSnapTarget();
      suppressTextSelection();
      resizeRef.current = {
        isResizing: true,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: input.floatingSize.width,
        startHeight: input.floatingSize.height,
        startLeft: input.floatingPosition.x,
        startTop: input.floatingPosition.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [
      clearSnapTarget,
      input.floatingPosition.x,
      input.floatingPosition.y,
      input.floatingSize.width,
      input.floatingSize.height,
      suppressTextSelection,
    ]
  );

  const iconDragMovedRef = useRef(false);
  const suppressFabTriggerClickRef = useRef(false);

  const handleFabTriggerPointerDown = useCallback(
    (e: PointerEvent, anchor: { x: number; y: number }) => {
      e.preventDefault();
      iconDragMovedRef.current = false;
      suppressFabTriggerClickRef.current = false;
      clearSnapTarget();
      suppressTextSelection();
      // Save the modal's floating position before we overwrite it for FAB drag visuals
      savedFloatingPositionRef.current = {
        x: input.floatingPosition.x,
        y: input.floatingPosition.y,
      };
      input.setFloatingPosition(anchor);
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: anchor.x,
        startTop: anchor.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [clearSnapTarget, input.setFloatingPosition, suppressTextSelection]
  );

  const handleFabTriggerPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current.isDragging) {
        return;
      }
      const dx = Math.abs(e.clientX - dragRef.current.startX);
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      if (dx > 4 || dy > 4) {
        iconDragMovedRef.current = true;
      }
      applyFloatingDragMove(
        e.clientX,
        e.clientY,
        BUTTON_SNAP_FAB_SIZE,
        BUTTON_SNAP_FAB_SIZE
      );
    },
    [applyFloatingDragMove]
  );

  const handleFabTriggerPointerUp = useCallback(
    (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (iconDragMovedRef.current) {
        suppressFabTriggerClickRef.current = true;
      }
      finalizeFloatingDrag();
      iconDragMovedRef.current = false;
    },
    [finalizeFloatingDrag]
  );

  const handleFabTriggerClick = useCallback((onOpen: () => void) => {
    if (suppressFabTriggerClickRef.current) {
      suppressFabTriggerClickRef.current = false;
      return;
    }
    onOpen();
  }, []);

  return {
    handleBottomDockGripPointerDown,
    handleFabTriggerClick,
    handleFabTriggerPointerDown,
    handleFabTriggerPointerMove,
    handleFabTriggerPointerUp,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleResizePointerDown,
    isIconDragging: () => dragRef.current.isDragging,
    suppressFabTriggerClickRef,
  };
}
