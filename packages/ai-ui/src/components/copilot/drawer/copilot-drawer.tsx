// Copilot drawer entry — presentation shell; runtime wiring lives in @engenty/ai-ui agent-provider.
"use client";

export { CopilotDrawerBody as CopilotDrawer } from "./copilot-drawer-body";
export { COPILOT_BOTTOM_DOCK_HEIGHT } from "./copilot-drawer-constants";
export type {
  CopilotDockMode,
  CopilotDrawerProps,
  CopilotPanelMode,
  CopilotRouteContext,
} from "./copilot-drawer-types";
export { formatCopilotRouteStatusLabel } from "./copilot-drawer-utils";
