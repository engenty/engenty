import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import type { CopilotDockMode } from "./copilot-drawer-types";

export interface UseCopilotDrawerLayoutOptions {
  copilotLayout: CopilotLayoutPersistenceApi | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preferredDockMode?: CopilotDockMode | null;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
}

export interface UseCopilotDrawerLayoutResult {
  collapseToCircle: boolean;
  collapseToFabIcon: () => void;
  handleDockPositionSelect: (value: string) => void;
  handleFabTriggerClick: () => void;
}
