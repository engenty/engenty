export type {
  AgentUiPageBriefInput,
  AgentUiPageBriefKey,
  AgentUiPageType,
  EngentyFrontendToolMetadata,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
  RunAgentInput,
  Tool,
} from "@engenty/ag-ui-bridge";
export {
  AGENT_UI_DOM_REGION,
  AGENT_UI_DOM_REGION_SELECTORS,
  AGENT_UI_PAGE_BRIEF_KEYS,
  buildAgentUiPageBrief,
  buildDefaultDomEntryPoints,
  createFrontendToolDefinition,
  isAgentUiPageBriefKey,
  toAgUiTool,
} from "@engenty/ag-ui-bridge";
export { AppLayout, type AppLayoutProps } from "./components/app-layout";
export {
  ModuleSidebarHeaderLabel,
  type ModuleSidebarHeaderLabelProps,
} from "./components/app-layout/module-sidebar-header-label";
export { useSettingsSecondaryShellNav } from "./components/app-layout/use-settings-secondary-shell-nav";
export { useSetupSecondaryShellNav } from "./components/app-layout/use-setup-secondary-shell-nav";
export {
  setWorkspaceEndPaneExpanded,
  useWorkspaceEndPaneTarget,
} from "./components/app-layout/workspace-end-pane";
export { AppSidebar } from "./components/app-sidebar";
export { type AppMenuActions, AppTopbar } from "./components/app-topbar";
export {
  Pane,
  PaneGroup,
  type PaneProps,
  PaneResizeHandle,
  type PaneResizeHandleProps,
  type PaneTabItem,
  PaneTabStrip,
  type PaneTabStripProps,
  PaneTopBar,
} from "./components/pane/pane";
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
  type CopilotFabAnchor,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  type CopilotPersistedPanelMode,
  reconcileCopilotLayoutSnapshot,
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
  NavigationSectionId,
  ShellSidebarConfig,
  ShellTenant,
  TenantSwitcherConfig,
} from "./types/shell";
export {
  createDefaultShellDockModuleOrderSnapshot,
  parseShellDockModuleOrderSnapshot,
  SHELL_DOCK_MODULE_ORDER_NOOP,
  SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME,
  type ShellDockModuleOrderPersistence,
  type ShellDockModuleOrderPersistenceApi,
  type ShellDockModuleOrderSnapshotV1,
} from "./types/shell-dock-module-order";
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
