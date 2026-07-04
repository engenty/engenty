import type {
  CSSProperties,
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { CopilotHeaderChrome } from "../panel/copilot-panel-content-types";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import type { CopilotCollapseMorphTransform } from "./copilot-drawer-collapse-morph";
import type { CopilotDockMode, CopilotPanelMode } from "./copilot-drawer-types";
import type { CopilotFloatingSnapTarget } from "./copilot-drawer-utils";

export interface UseCopilotDrawerLayoutOptions {
  activeCopilotContext?: CopilotRouteContext;
  copilotLayout: CopilotLayoutPersistenceApi | null;
  effectiveMode: CopilotDockMode;
  floatingBoundsMargin: number;
  headerChrome?: CopilotHeaderChrome;
  internalPanelMode: CopilotPanelMode;
  isFloatingStyle: boolean;
  isPanelModeControlled: boolean;
  launcherMode: CopilotDockMode | null;
  mainContentReady: boolean;
  mainContentRef?: { current: HTMLElement | null };
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preferredDockMode?: CopilotDockMode | null;
  routeKey: string;
  setInternalPanelMode: Dispatch<SetStateAction<CopilotPanelMode>>;
  setPanelMode: (mode: CopilotPanelMode) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  showCompactLauncher: boolean;
  surfaceInstanceKey: string;
}

export interface UseCopilotDrawerLayoutResult {
  bottomDockCardRef: RefObject<HTMLDivElement | null>;
  bottomDockIndicatorStyle: CSSProperties | null;
  buttonFabIndicatorStyle: CSSProperties | null;
  collapseMorph: CopilotCollapseMorphTransform | null;
  collapseMorphPhase: "animating" | "start" | null;
  collapseToCircle: boolean;
  collapseToFabIcon: () => void;
  compactLauncherMeasureRef: RefObject<HTMLDivElement | null>;
  compactShellMeasured: { height: number; width: number };
  enterFromClose: boolean;
  /** Live pixel position while the FAB is being dragged; null when not dragging. */
  fabDragPosition: { x: number; y: number } | null;
  /** FAB's committed pixel position, always derived from its logical corner anchor. */
  fabPosition: { x: number; y: number };
  floatingHeight: number;
  floatingPosition: { x: number; y: number };
  floatingSize: { height: number; width: number };
  floatingWidth: number;
  handleBottomDockGripPointerDown: (e: PointerEvent<HTMLElement>) => void;
  handleDockPositionSelect: (value: string) => void;
  handleExpandFromCircle: () => void;
  handleFabTriggerClick: () => void;
  handleFabTriggerPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  handleFabTriggerPointerLeave: (e: PointerEvent<HTMLButtonElement>) => void;
  handleFabTriggerPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  handleFabTriggerPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  handlePointerDown: (e: PointerEvent) => void;
  handlePointerMove: (e: PointerEvent) => void;
  handlePointerUp: (e: PointerEvent) => void;
  handleResizePointerDown: (
    edge: "e" | "s" | "se"
  ) => (e: PointerEvent) => void;
  isCollapsingToIcon: boolean;
  isIconDragging: boolean;
  margin: number;
  sidebarDockIndicatorStyle: CSSProperties | null;
  snapTarget: CopilotFloatingSnapTarget;
}
