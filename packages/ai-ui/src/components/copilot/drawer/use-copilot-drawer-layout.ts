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
import type { CopilotCollapseMorphTransform } from "./copilot-drawer-collapse-morph";
import {
  COMPACT_LAUNCHER_HEIGHT,
  COMPACT_LAUNCHER_WIDTH,
  COMPACT_STATUS_FLAP_DEFAULT_HEIGHT,
  FLOATING_DEFAULT_HEIGHT,
  FLOATING_DEFAULT_MARGIN,
  FLOATING_DEFAULT_WIDTH,
} from "./copilot-drawer-constants";
import { useCopilotDrawerFloatingDrag } from "./copilot-drawer-layout-drag";
import { useCopilotDrawerLayoutPersistence } from "./copilot-drawer-layout-persistence";
import type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";
import {
  resolveBottomDockIndicatorStyle,
  resolveSidebarDockIndicatorStyle,
} from "./copilot-drawer-snap-indicators";
import type { CopilotDockMode } from "./copilot-drawer-types";
import {
  type CopilotFloatingSnapTarget,
  resolveCopilotOpenDockMode,
} from "./copilot-drawer-utils";

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
  copilotContext,
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

  const floatingWidth = floatingSize.width;
  const floatingHeight = floatingSize.height;

  const clampFloatingChromeActive =
    (open && isFloatingStyle) ||
    (!(open || collapseToCircle) &&
      (effectiveMode === "drawer" ||
        effectiveMode === "sidebar" ||
        effectiveMode === "window"));

  useCopilotDrawerLayoutPersistence({
    collapseToCircle,
    compactStatusFlapHeight,
    copilotLayout,
    floatingDockedToCorner,
    floatingPosition,
    floatingSize,
    setCollapseToCircle,
    setCompactStatusFlapHeight,
    setFloatingDockedToCorner,
    setFloatingPosition,
    setFloatingSize,
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
      ? floatingSize.width
      : compactShellMeasured.width;
  const surfaceHeight = isCompactLauncherSurface
    ? compactShellMeasured.height
    : open
      ? floatingSize.height
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

  const finishCollapseToFabIcon = useCallback(
    (options?: { enterFromClose?: boolean }) => {
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
    [onOpenChange]
  );

  const collapseToFabIcon = useCallback(() => {
    if (collapseMorphTimeoutRef.current != null) {
      window.clearTimeout(collapseMorphTimeoutRef.current);
      collapseMorphTimeoutRef.current = null;
    }
    finishCollapseToFabIcon({ enterFromClose: true });
  }, [finishCollapseToFabIcon]);

  useEffect(
    () => () => {
      if (collapseMorphTimeoutRef.current != null) {
        window.clearTimeout(collapseMorphTimeoutRef.current);
      }
    },
    []
  );

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
    copilotContext?.moduleId,
    copilotContext?.routeKey,
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

  const handleFabTriggerClick = useCallback(() => {
    if (copilotOpenRef.current) {
      collapseToFabIcon();
      return;
    }
    handleFabTriggerOpen();
  }, [collapseToFabIcon, handleFabTriggerOpen]);

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
    buttonFabIndicatorStyle: null,
    collapseMorph,
    collapseMorphPhase,
    collapseToCircle,
    collapseToFabIcon,
    compactLauncherMeasureRef,
    compactShellMeasured,
    compactStatusFlapHeight,
    enterFromClose,
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
    isCollapsingToIcon,
    margin,
    setCompactStatusFlapHeight,
    sidebarDockIndicatorStyle: resolveSidebarDockIndicatorStyle(margin),
    snapTarget,
  };
}
