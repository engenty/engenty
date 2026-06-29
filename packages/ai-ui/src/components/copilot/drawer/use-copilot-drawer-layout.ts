"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { clampFloatingPositionToViewport } from "../session/copilot-floating-bounds";
import {
  anchorStyleToMorphRect,
  COPILOT_COLLAPSE_MORPH_MS,
  type CopilotCollapseMorphTransform,
  computeCopilotCollapseMorphTransform,
  domRectToMorphRect,
} from "./copilot-drawer-collapse-morph";
import {
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

export type {
  UseCopilotDrawerLayoutOptions,
  UseCopilotDrawerLayoutResult,
} from "./copilot-drawer-layout-types";

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

  const [floatingPosition, setFloatingPosition] = useState(() => ({
    x:
      typeof window === "undefined"
        ? 100
        : window.innerWidth - FLOATING_DEFAULT_WIDTH - FLOATING_DEFAULT_MARGIN,
    y:
      typeof window === "undefined"
        ? 100
        : Math.max(
            FLOATING_DEFAULT_MARGIN,
            window.innerHeight -
              FLOATING_DEFAULT_HEIGHT -
              FLOATING_DEFAULT_MARGIN -
              96
          ),
  }));
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
  const [enterFromClose, setEnterFromClose] = useState(false);
  const [isIconDragging, setIsIconDragging] = useState(false);
  const [fabPosition, setFabPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [compactShellMeasured, setCompactShellMeasured] = useState({
    width: COMPACT_LAUNCHER_WIDTH,
    height: COMPACT_LAUNCHER_HEIGHT,
  });

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
    fabPosition,
    floatingPosition,
    floatingSize,
    internalPanelMode,
    isPanelModeControlled,
    setCollapseToCircle,
    setFabPosition,
    setFloatingPosition,
    setFloatingSize,
    setInternalPanelMode,
  });

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
        setCollapseToCircle(mode === "mini-floating");
        onOpenChange(false);
      } else {
        setCollapseToCircle(false);
        onOpenChange(true);
      }
    },
    [onOpenChange, setPreferredDockMode]
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
      return { x: fabPosition.x, y: fabPosition.y };
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
    const handleResize = () => {
      setFloatingPosition((current) => {
        const next = clampCurrentFloatingPosition(current);
        if (next.x === current.x && next.y === current.y) {
          return current;
        }
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [clampCurrentFloatingPosition, clampFloatingChromeActive]);

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
    handleBottomDockGripPointerDown: drag.handleBottomDockGripPointerDown,
    handleDockPositionSelect,
    handleExpandFromCircle,
    handlePointerDown: drag.handlePointerDown,
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
