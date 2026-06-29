export type {
  EngentyFrontendToolMetadata,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
  RunAgentInput,
  Tool,
} from "@engenty/ag-ui-bridge";
export {
  createFrontendToolDefinition,
  toAgUiTool,
} from "@engenty/ag-ui-bridge";
export { AppLayout, type AppLayoutProps } from "./components/app-layout";
export {
  ModuleSidebarHeaderLabel,
  type ModuleSidebarHeaderLabelProps,
} from "./components/app-layout/module-sidebar-header-label";
export { useSettingsSecondaryShellNav } from "./components/app-layout/use-settings-secondary-shell-nav";
export { AppSidebar } from "./components/app-sidebar";
export { type AppMenuActions, AppTopbar } from "./components/app-topbar";
export {
  type AgentUiBaseSnapshotInput,
  type AgentUiDialogOpener,
  type AgentUiFieldFocusHandler,
  type AgentUiFrontendToolHandler,
  AgentUiStateProvider,
  type AgentUiStateSlice,
  useAgentUiDialogOpener,
  useAgentUiFieldFocuser,
  useAgentUiFrontendToolExecutor,
  useAgentUiFrontendToolHandler,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
  useFrontendTool,
  useRegisterAgentUiDialog,
  useRegisterAgentUiField,
  useRegisterAgentUiSlice,
} from "./context/agent-ui-state-context";
export {
  CopilotShellContentArea,
  CopilotShellMain,
  CopilotShellProvider,
  useCopilotShell,
  useCopilotShellOrNull,
} from "./context/copilot-shell-context";
export type { ShellSecondaryNavContextValue } from "./context/shell-secondary-nav-context";
export {
  ShellSecondaryNavProvider,
  useShellSecondaryNav,
} from "./context/shell-secondary-nav-context";
export type { PersistedEwResizePaneWidthOptions } from "./hooks/use-persisted-ew-resize-pane-width";
export { usePersistedEwResizePaneWidth } from "./hooks/use-persisted-ew-resize-pane-width";
export { useShellSecondaryNavWidth } from "./hooks/use-shell-secondary-nav-width";
export {
  SHELL_SECONDARY_NAV_ITEM_ATTR,
  shellSecondaryNavItemProps,
} from "./lib/module-secondary-nav-keyboard";
export {
  clampPaneWidthPx,
  persistPaneWidthPx,
  readInitialPaneWidthPx,
} from "./lib/persisted-pane-width";
export {
  isShellSecondaryNavPinnedViewport,
  SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_PX,
  SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY,
} from "./lib/shell-secondary-nav-breakpoint";
export {
  clampShellSecondaryNavWidthPx,
  persistShellSecondaryNavWidthPx,
  readInitialShellSecondaryNavWidthPx,
  SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX,
  SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
  SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
  SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY,
} from "./lib/shell-secondary-nav-width";
export {
  COPILOT_BOTTOM_DOCK_HEIGHT,
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  type CopilotPersistedPanelMode,
} from "./types/copilot-layout";
export {
  COPILOT_LAYOUT_NOOP,
  type CopilotDockMode,
  type CopilotLayoutPersistence,
  type CopilotSlotProps,
} from "./types/copilot-shell";
export type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
  ShellTenant,
  TenantSwitcherConfig,
} from "./types/shell";
export {
  createDefaultShellSecondaryNavPinnedSnapshot,
  mergeShellSecondaryNavPinnedSnapshot,
  parseShellSecondaryNavPinnedSnapshot,
  SHELL_SECONDARY_NAV_PINNED_NOOP,
  SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME,
  type ShellSecondaryNavPinnedPersistence,
  type ShellSecondaryNavPinnedPersistenceApi,
  type ShellSecondaryNavPinnedSnapshotV1,
} from "./types/shell-secondary-nav-pinned";
