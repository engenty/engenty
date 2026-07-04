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
  computeFabAnchor,
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
  const [fabPosition, setFabPositionRaw] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Edge anchor derived from the FAB's custom position. Persisting the anchor
  // (not the absolute point) keeps the avatar stuck to its corner across
  // window resizes and reloads.
  const [fabAnchor, setFabAnchor] = useState<CopilotFabAnchor | null>(null);

  // Wrap the FAB position setter so every user-committed position also records
  // its edge anchor. Clearing the position (snap to a dock) clears the anchor.
  const setFabPosition = useCallback(
    (
      value:
        | { x: number; y: number }
        | null
        | ((
            prev: { x: number; y: number } | null
          ) => { x: number; y: number } | null)
    ) => {
      setFabPositionRaw((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (next == null) {
          setFabAnchor(null);
        } else if (typeof window !== "undefined") {
          setFabAnchor(
            computeFabAnchor(
              next,
              { width: BUTTON_SNAP_FAB_WIDTH, height: BUTTON_SNAP_FAB_SIZE },
              { width: window.innerWidth, height: window.innerHeight }
            )
          );
        }
        return next;
      });
    },
    []
  );
  const [compactShellMeasured, setCompactShellMeasured] = useState({
    width: COMPACT_LAUNCHER_WIDTH,
    height: COMPACT_LAUNCHER_HEIGHT,
  });
  // True while the floating launcher rests at its bottom-right home corner.
  // Cleared once the user drags it away; re-armed when a mode switch re-docks.
  const [floatingDockedToCorner, setFloatingDockedToCorner] = useState(true);

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
    copilotLayout,
    fabAnchor,
    fabPosition,
    floatingPosition,
    floatingSize,
    internalPanelMode,
    isPanelModeControlled,
    setCollapseToCircle,
    setFabAnchor,
    setFabPosition,
    setFloatingPosition,
    setFloatingSize,
    setInternalPanelMode,
  });

  // Keep the custom FAB pinned to its corner when the viewport changes. The
  // anchor (not the absolute point) is the source of truth, so a resized or
  // reloaded window re-resolves the same edge offsets instead of drifting.
  useEffect(() => {
    if (typeof window === "undefined" || !fabAnchor) {
      return;
    }
    const reanchor = () => {
      setFabPositionRaw(
        resolveFabAnchorPosition(
          fabAnchor,
          { width: BUTTON_SNAP_FAB_WIDTH, height: BUTTON_SNAP_FAB_SIZE },
          { width: window.innerWidth, height: window.innerHeight },
          BUTTON_SNAP_FAB_INSET
        )
      );
    };
    reanchor();
    window.addEventListener("resize", reanchor);
    return () => window.removeEventListener("resize", reanchor);
  }, [fabAnchor]);

  // Keep the resting floating launcher glued to its bottom-right corner as its
  // measured height settles (the default height constant overestimates a
  // single-line launcher, so the initial dock would otherwise float too high).
  useLayoutEffect(() => {
    if (
      !floatingDockedToCorner ||
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
    open,
    showCompactLauncher,
  ]);

  const margin = floatingBoundsMargin;
  const dragBoundsMargin = open ? margin : Math.min(margin, 8);
  const surfaceWidth = open
    ? launcherMode === "mini-floating"
      ? MINI_FLOATING_WIDTH
      : floatingSize.width
    : compactShellMeasured.width;
  const surfaceHeight = open
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
    setCollapseToCircle,
    setFabPosition,
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
        // Re-dock both surfaces to their bottom-right home so switching modes
        // always lands in the corner: the floating launcher via floatingPosition,
        // the collapsed avatar by clearing its custom position/anchor. The
        // docked flag keeps the launcher pinned as its measured height settles.
        setFloatingDockedToCorner(true);
        setFloatingPosition(
          resolveLauncherCornerPosition(
            compactShellMeasuredRef.current.height,
            FLOATING_DEFAULT_MARGIN
          )
        );
        setFabPosition(null);
        setCollapseToCircle(mode === "mini-floating");
        onOpenChange(false);
      } else {
        setCollapseToCircle(false);
        onOpenChange(true);
      }
    },
    [onOpenChange, setFabPosition, setPreferredDockMode]
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

  const resolveTriggerAnchor = useCallback(() => {
    if (fabPosition) {
      // Keep a persisted position within the current viewport so drag origin
      // and speed-dial centering match the (clamped) rendered FAB position.
      return clampFloatingPositionToViewport({
        x: fabPosition.x,
        y: fabPosition.y,
        margin: BUTTON_SNAP_FAB_INSET,
        surfaceWidth: BUTTON_SNAP_FAB_WIDTH,
        surfaceHeight: BUTTON_SNAP_FAB_SIZE,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    }
    const anchor = resolveFabTriggerAnchorStyle();
    if (!anchor || anchor.left == null || anchor.top == null) {
      return { x: 0, y: 0 };
    }
    return { x: Number(anchor.left), y: Number(anchor.top) };
  }, [fabPosition]);

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
    enterFromClose,
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
    sidebarDockIndicatorStyle: resolveSidebarDockIndicatorStyle(margin),
    snapTarget,
  };
}
