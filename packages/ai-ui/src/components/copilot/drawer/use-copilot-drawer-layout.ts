"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  clampFloatingPositionToViewport,
  reanchorFloatingPositionToViewport,
} from "../session/copilot-floating-bounds";
import {
  anchorStyleToMorphRect,
  COPILOT_COLLAPSE_MORPH_MS,
  type CopilotCollapseMorphTransform,
  computeCopilotCollapseMorphTransform,
  domRectToMorphRect,
} from "./copilot-drawer-collapse-morph";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_WIDTH,
  COMPACT_LAUNCHER_HEIGHT,
  COMPACT_LAUNCHER_WIDTH,
  COMPACT_STATUS_FLAP_DEFAULT_HEIGHT,
  FLOATING_DEFAULT_HEIGHT,
  FLOATING_DEFAULT_MARGIN,
  FLOATING_DEFAULT_WIDTH,
  MINI_FLOATING_HEIGHT,
  MINI_FLOATING_WIDTH,
} from "./copilot-drawer-constants";
import { useCopilotDrawerFloatingDrag } from "./copilot-drawer-layout-drag";
import { useCopilotDrawerLayoutPersistence } from "./copilot-drawer-layout-persistence";
import type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";
import {
  resolveBottomDockIndicatorStyle,
  resolveButtonFabIndicatorStyle,
  resolveFabTriggerAnchorStyle,
  resolveSidebarDockIndicatorStyle,
} from "./copilot-drawer-snap-indicators";
import type { CopilotDockMode } from "./copilot-drawer-types";
import {
  type CopilotFloatingSnapTarget,
  resolveCopilotOpenDockMode,
} from "./copilot-drawer-utils";
import {
  type CopilotFabAnchor,
  defaultFabAnchor,
  resolveFabAnchorPosition,
} from "./copilot-fab-anchor";

export type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";

/**
 * Bottom-right home for the floating compact launcher, sized to the launcher's
 * own footprint (not the larger modal) so it docks to the corner instead of
 * floating mid-screen. Used for the initial position and whenever the user
 * switches into a floating mode from the position menu.
 */
function resolveLauncherCornerPosition(
  launcherHeight: number,
  inset: number
): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: 100, y: 100 };
  }
  const width = COMPACT_LAUNCHER_WIDTH;
  const height = launcherHeight || COMPACT_LAUNCHER_HEIGHT;
  return clampFloatingPositionToViewport({
    x: window.innerWidth - width - inset,
    y: window.innerHeight - height - inset,
    margin: inset,
    surfaceWidth: width,
    surfaceHeight: height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

export function useCopilotDrawerLayout({
  activeCopilotContext,
  copilotLayout,
  effectiveMode,
  floatingBoundsMargin,
  headerChrome = "default",
  internalPanelMode,
  isPanelModeControlled,
  isFloatingStyle,
  launcherMode,
  mainContentReady,
  mainContentRef,
  onOpenChange,
  open,
  preferredDockMode = null,
  routeKey,
  setInternalPanelMode,
  setPanelMode,
  setPreferredDockMode,
  showCompactLauncher,
  surfaceInstanceKey,
}: UseCopilotDrawerLayoutOptions): UseCopilotDrawerLayoutResult {
  const copilotOpenRef = useRef(open);
  copilotOpenRef.current = open;

  const [floatingPosition, setFloatingPosition] = useState(() =>
    resolveLauncherCornerPosition(
      COMPACT_LAUNCHER_HEIGHT,
      FLOATING_DEFAULT_MARGIN
    )
  );
  const [floatingSize, setFloatingSize] = useState(() => ({
    width: FLOATING_DEFAULT_WIDTH,
    height: FLOATING_DEFAULT_HEIGHT,
  }));
  const [compactStatusFlapHeight, setCompactStatusFlapHeight] = useState(
    COMPACT_STATUS_FLAP_DEFAULT_HEIGHT
  );
  const [snapTarget, setSnapTarget] = useState<CopilotFloatingSnapTarget>(null);
  const [collapseToCircle, setCollapseToCircle] = useState(true);
  const [collapseMorph, setCollapseMorph] =
    useState<CopilotCollapseMorphTransform | null>(null);
  const [collapseMorphPhase, setCollapseMorphPhase] = useState<
    "animating" | "start" | null
  >(null);
  const collapseMorphTimeoutRef = useRef<number | null>(null);
  const [isCollapsingToIcon, setIsCollapsingToIcon] = useState(false);

  useLayoutEffect(() => {
    if (open && collapseToCircle) {
      setCollapseToCircle(false);
    }
  }, [open, collapseToCircle]);

  const [enterFromClose, setEnterFromClose] = useState(false);
  const [isIconDragging, setIsIconDragging] = useState(false);

  // The FAB's logical dock: which corner it's pinned to, plus its gap to that
  // corner. This is the single source of truth for the avatar's position —
  // always defined (defaults to bottom-right), never a raw pixel point, and
  // entirely independent of the floating modal's `floatingPosition`.
  const [fabAnchor, setFabAnchor] = useState<CopilotFabAnchor>(() =>
    defaultFabAnchor(BUTTON_SNAP_FAB_INSET)
  );
  const resetFabAnchor = useCallback(() => {
    setFabAnchor(defaultFabAnchor(BUTTON_SNAP_FAB_INSET));
  }, []);

  // Pixel position derived from fabAnchor for the current viewport. Recomputed
  // on anchor change and on resize — never mutated directly.
  const [fabPosition, setFabPosition] = useState(() =>
    typeof window === "undefined"
      ? { x: 100, y: 100 }
      : resolveFabAnchorPosition(
          fabAnchor,
          { width: BUTTON_SNAP_FAB_WIDTH, height: BUTTON_SNAP_FAB_SIZE },
          { width: window.innerWidth, height: window.innerHeight },
          BUTTON_SNAP_FAB_INSET
        )
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const recompute = () => {
      setFabPosition(
        resolveFabAnchorPosition(
          fabAnchor,
          { width: BUTTON_SNAP_FAB_WIDTH, height: BUTTON_SNAP_FAB_SIZE },
          { width: window.innerWidth, height: window.innerHeight },
          BUTTON_SNAP_FAB_INSET
        )
      );
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [fabAnchor]);

  // Transient pixel position used only while actively dragging the FAB — kept
  // fully separate from floatingPosition (the modal's own state) so dragging
  // one surface can never bleed into the other's committed position.
  const [fabDragPosition, setFabDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [compactShellMeasured, setCompactShellMeasured] = useState({
    width: COMPACT_LAUNCHER_WIDTH,
    height: COMPACT_LAUNCHER_HEIGHT,
  });
  // True while the floating launcher rests at its bottom-right home corner.
  // Cleared once the user drags it away; re-armed when a mode switch re-docks.
  const [floatingDockedToCorner, setFloatingDockedToCorner] = useState(true);
  // Stay false until layout hydrate finishes so the corner re-pin effect cannot
  // race restored floatingPosition in the same layout pass.
  const [layoutSnapshotApplied, setLayoutSnapshotApplied] = useState(
    () => copilotLayout == null
  );

  const isMiniFloating = open && launcherMode === "mini-floating";
  const floatingWidth = isMiniFloating
    ? MINI_FLOATING_WIDTH
    : floatingSize.width;
  const floatingHeight = isMiniFloating
    ? MINI_FLOATING_HEIGHT
    : floatingSize.height;

  const clampFloatingChromeActive =
    (open && isFloatingStyle) ||
    (!(open || collapseToCircle) &&
      (launcherMode === "floating" ||
        launcherMode === "mini-floating" ||
        effectiveMode === "drawer" ||
        effectiveMode === "bottom" ||
        effectiveMode === "sidebar"));

  useCopilotDrawerLayoutPersistence({
    collapseToCircle,
    compactStatusFlapHeight,
    copilotLayout,
    floatingDockedToCorner,
    floatingPosition,
    floatingSize,
    internalPanelMode,
    isPanelModeControlled,
    setCollapseToCircle,
    setCompactStatusFlapHeight,
    setFloatingDockedToCorner,
    setFloatingPosition,
    setFloatingSize,
    setInternalPanelMode,
    setLayoutSnapshotApplied,
  });

  // Keep the resting floating launcher glued to its bottom-right corner as its
  // measured height settles (the default height constant overestimates a
  // single-line launcher, so the initial dock would otherwise float too high).
  useLayoutEffect(() => {
    if (
      !(layoutSnapshotApplied && floatingDockedToCorner) ||
      typeof window === "undefined" ||
      open ||
      collapseToCircle ||
      !showCompactLauncher
    ) {
      return;
    }
    const next = resolveLauncherCornerPosition(
      compactShellMeasured.height,
      FLOATING_DEFAULT_MARGIN
    );
    setFloatingPosition((cur) =>
      cur.x === next.x && cur.y === next.y ? cur : next
    );
  }, [
    collapseToCircle,
    compactShellMeasured.height,
    floatingDockedToCorner,
    layoutSnapshotApplied,
    open,
    showCompactLauncher,
  ]);

  const isCompactLauncherSurface = showCompactLauncher && !collapseToCircle;

  const margin = floatingBoundsMargin;
  const dragBoundsMargin = open ? margin : Math.min(margin, 8);
  const surfaceWidth = isCompactLauncherSurface
    ? compactShellMeasured.width
    : open
      ? launcherMode === "mini-floating"
        ? MINI_FLOATING_WIDTH
        : floatingSize.width
      : compactShellMeasured.width;
  const surfaceHeight = isCompactLauncherSurface
    ? compactShellMeasured.height
    : open
      ? launcherMode === "mini-floating"
        ? MINI_FLOATING_HEIGHT
        : floatingSize.height
      : compactShellMeasured.height;

  const clampCurrentFloatingPosition = useCallback(
    (position: { x: number; y: number }) => {
      if (typeof window === "undefined") {
        return position;
      }
      return clampFloatingPositionToViewport({
        x: position.x,
        y: position.y,
        margin: dragBoundsMargin,
        surfaceWidth,
        surfaceHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    },
    [dragBoundsMargin, surfaceHeight, surfaceWidth]
  );

  const snapTargetRef = useRef<CopilotFloatingSnapTarget>(null);
  const bottomDockCardRef = useRef<HTMLDivElement | null>(null);
  const compactLauncherMeasureRef = useRef<HTMLDivElement | null>(null);
  const compactShellMeasuredRef = useRef(compactShellMeasured);
  compactShellMeasuredRef.current = compactShellMeasured;

  const drag = useCopilotDrawerFloatingDrag({
    bottomDockCardRef,
    compactShellMeasuredRef,
    copilotOpenRef,
    dragBoundsMargin,
    effectiveMode,
    floatingPosition,
    floatingSize,
    margin,
    onOpenChange,
    resetFabAnchor,
    setCollapseToCircle,
    setFabAnchor,
    setFabDragPosition,
    setFloatingPosition,
    setFloatingSize,
    setPanelMode,
    setPreferredDockMode,
    setSnapTarget,
    snapTargetRef,
    surfaceHeight,
    surfaceWidth,
  });

  const handleDockPositionSelect = useCallback(
    (value: string) => {
      if (!setPreferredDockMode) {
        return;
      }
      const mode = value as CopilotDockMode;
      setPreferredDockMode(mode);
      if (mode === "bottom" || mode === "sidebar") {
        setCollapseToCircle(false);
        onOpenChange(true);
      } else if (mode === "floating" || mode === "mini-floating") {
        // Only re-dock to the bottom-right home if the launcher was never
        // dragged away from it — otherwise a user-customized position would
        // get silently discarded on every round-trip through another mode.
        if (floatingDockedToCorner) {
          setFloatingPosition(
            resolveLauncherCornerPosition(
              compactShellMeasuredRef.current.height,
              FLOATING_DEFAULT_MARGIN
            )
          );
        }
        // The avatar always resets to its bottom-right home on a mode switch
        // (clearing any custom drag anchor).
        resetFabAnchor();
        setCollapseToCircle(mode === "mini-floating");
        onOpenChange(false);
      } else {
        setCollapseToCircle(false);
        onOpenChange(true);
      }
    },
    [floatingDockedToCorner, onOpenChange, resetFabAnchor, setPreferredDockMode]
  );

  const finishCollapseToFabIcon = useCallback(
    (options?: { enterFromClose?: boolean }) => {
      setPreferredDockMode?.("mini-floating");
      setCollapseToCircle(true);
      onOpenChange(false);
      setIsCollapsingToIcon(false);
      setCollapseMorph(null);
      setCollapseMorphPhase(null);
      if (options?.enterFromClose) {
        setEnterFromClose(true);
        window.setTimeout(() => setEnterFromClose(false), 320);
      }
    },
    [onOpenChange, setPreferredDockMode]
  );

  const collapseToFabIcon = useCallback(() => {
    if (collapseMorphTimeoutRef.current != null) {
      window.clearTimeout(collapseMorphTimeoutRef.current);
      collapseMorphTimeoutRef.current = null;
    }

    const finishWithoutMorph = () => {
      finishCollapseToFabIcon({ enterFromClose: true });
    };

    const panelEl = document.querySelector("[data-copilot-drawer-panel]");
    const anchorRect = anchorStyleToMorphRect(resolveFabTriggerAnchorStyle());
    const canMorph =
      open &&
      effectiveMode === "drawer" &&
      panelEl instanceof HTMLElement &&
      anchorRect != null;

    if (!canMorph) {
      setIsCollapsingToIcon(true);
      collapseMorphTimeoutRef.current = window.setTimeout(() => {
        collapseMorphTimeoutRef.current = null;
        finishWithoutMorph();
      }, 0);
      return;
    }

    const fromRect = domRectToMorphRect(panelEl.getBoundingClientRect());
    if (fromRect.width <= 0 || fromRect.height <= 0) {
      finishWithoutMorph();
      return;
    }

    const morph = computeCopilotCollapseMorphTransform(fromRect, anchorRect);
    setIsCollapsingToIcon(true);
    setCollapseMorph(morph);
    setCollapseMorphPhase("start");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCollapseMorphPhase("animating");
      });
    });

    collapseMorphTimeoutRef.current = window.setTimeout(() => {
      collapseMorphTimeoutRef.current = null;
      finishCollapseToFabIcon();
    }, COPILOT_COLLAPSE_MORPH_MS);
  }, [effectiveMode, finishCollapseToFabIcon, open]);

  useEffect(
    () => () => {
      if (collapseMorphTimeoutRef.current != null) {
        window.clearTimeout(collapseMorphTimeoutRef.current);
      }
    },
    []
  );

  // fabPosition is always derived from fabAnchor and already viewport-clamped,
  // so the drag origin can use it directly — no separate default-style path.
  const resolveTriggerAnchor = useCallback(() => fabPosition, [fabPosition]);

  const handleFabTriggerOpen = useCallback(() => {
    setCollapseToCircle(false);
    if (setPreferredDockMode) {
      setPreferredDockMode(resolveCopilotOpenDockMode(preferredDockMode));
    }
    onOpenChange(true);
  }, [onOpenChange, preferredDockMode, setPreferredDockMode]);

  useLayoutEffect(() => {
    if (!clampFloatingChromeActive) {
      return;
    }
    setFloatingPosition((current) => {
      const next = clampCurrentFloatingPosition(current);
      if (next.x === current.x && next.y === current.y) {
        return current;
      }
      return next;
    });
  }, [
    activeCopilotContext?.moduleId,
    activeCopilotContext?.routeKey,
    clampCurrentFloatingPosition,
    clampFloatingChromeActive,
    compactShellMeasured.height,
    compactShellMeasured.width,
    floatingPosition.x,
    floatingPosition.y,
    routeKey,
  ]);

  useEffect(() => {
    if (!clampFloatingChromeActive) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    // Track the viewport across resizes so the panel keeps its distance to the
    // nearest edges (a bottom-right panel tracks the corner instead of drifting).
    let prevWidth = window.innerWidth;
    let prevHeight = window.innerHeight;
    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      setFloatingPosition((current) => {
        const next = reanchorFloatingPositionToViewport({
          x: current.x,
          y: current.y,
          margin: dragBoundsMargin,
          surfaceWidth,
          surfaceHeight,
          prevViewportWidth: prevWidth,
          prevViewportHeight: prevHeight,
          viewportWidth,
          viewportHeight,
        });
        if (next.x === current.x && next.y === current.y) {
          return current;
        }
        return next;
      });
      prevWidth = viewportWidth;
      prevHeight = viewportHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    clampFloatingChromeActive,
    dragBoundsMargin,
    surfaceHeight,
    surfaceWidth,
  ]);

  useLayoutEffect(() => {
    if (!showCompactLauncher || collapseToCircle) {
      return;
    }
    const el = compactLauncherMeasureRef.current;
    if (!el) {
      return;
    }
    const sync = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w <= 0 || h <= 0) {
        return;
      }
      setCompactShellMeasured((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };
    sync();
    const ro = new ResizeObserver(() => {
      sync();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapseToCircle, showCompactLauncher, surfaceInstanceKey]);

  const handleExpandFromCircle = useCallback(() => {
    handleFabTriggerOpen();
  }, [handleFabTriggerOpen]);

  const handleFabTriggerPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      setIsIconDragging(true);
      drag.handleFabTriggerPointerDown(e, resolveTriggerAnchor());
    },
    [drag.handleFabTriggerPointerDown, resolveTriggerAnchor]
  );

  const handleFabTriggerPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      drag.handleFabTriggerPointerMove(e);
    },
    [drag.handleFabTriggerPointerMove]
  );

  const handleFabTriggerPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      drag.handleFabTriggerPointerUp(e);
      setIsIconDragging(false);
    },
    [drag.handleFabTriggerPointerUp]
  );

  const handleFabTriggerPointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (isIconDragging) {
        drag.handleFabTriggerPointerUp(e);
        setIsIconDragging(false);
      }
    },
    [drag.handleFabTriggerPointerUp, isIconDragging]
  );

  const handleFabTriggerClick = useCallback(() => {
    drag.handleFabTriggerClick(() => {
      if (copilotOpenRef.current) {
        collapseToFabIcon();
        return;
      }
      handleFabTriggerOpen();
    });
  }, [collapseToFabIcon, drag.handleFabTriggerClick, handleFabTriggerOpen]);

  // Dragging the floating surface (launcher or bottom-dock grip) breaks the
  // corner dock, so the re-pin effect stops overriding the dropped position.
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      setFloatingDockedToCorner(false);
      drag.handlePointerDown(e);
    },
    [drag.handlePointerDown]
  );

  const handleBottomDockGripPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      setFloatingDockedToCorner(false);
      drag.handleBottomDockGripPointerDown(e);
    },
    [drag.handleBottomDockGripPointerDown]
  );

  return {
    bottomDockCardRef,
    bottomDockIndicatorStyle: resolveBottomDockIndicatorStyle({
      mainContentReady,
      mainContentRef,
      margin,
    }),
    buttonFabIndicatorStyle: resolveButtonFabIndicatorStyle(),
    collapseMorph,
    collapseMorphPhase,
    collapseToCircle,
    collapseToFabIcon,
    compactLauncherMeasureRef,
    compactShellMeasured,
    compactStatusFlapHeight,
    enterFromClose,
    fabDragPosition,
    fabPosition,
    floatingHeight,
    floatingPosition,
    floatingSize,
    floatingWidth,
    handleBottomDockGripPointerDown,
    handleDockPositionSelect,
    handleExpandFromCircle,
    handlePointerDown,
    handlePointerMove: drag.handlePointerMove,
    handlePointerUp: drag.handlePointerUp,
    handleResizePointerDown: drag.handleResizePointerDown,
    handleFabTriggerClick,
    handleFabTriggerPointerDown,
    handleFabTriggerPointerLeave,
    handleFabTriggerPointerMove,
    handleFabTriggerPointerUp,
    isCollapsingToIcon,
    isIconDragging,
    margin,
    setCompactStatusFlapHeight,
    sidebarDockIndicatorStyle: resolveSidebarDockIndicatorStyle(margin),
    snapTarget,
  };
}
