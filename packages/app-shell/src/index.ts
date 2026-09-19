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
export { AppBarPositionPicker } from "./components/app-bar-position-picker";
export { AppLayout, type AppLayoutProps } from "./components/app-layout";
export {
  ModuleSidebarHeaderLabel,
  type ModuleSidebarHeaderLabelProps,
} from "./components/app-layout/module-sidebar-header-label";
export { useSettingsSecondaryShellNav } from "./components/app-layout/use-settings-secondary-shell-nav";
export { useSetupSecondaryShellNav } from "./components/app-layout/use-setup-secondary-shell-nav";
export {
  setWorkspaceEndPaneExpanded,
  useWorkspaceEndPaneCount,
  useWorkspaceEndPaneTarget,
} from "./components/app-layout/workspace-end-pane";
export { WorkspaceEndPaneItem } from "./components/app-layout/workspace-end-pane-item";
export { AppSidebar } from "./components/app-sidebar";
export { type AppMenuActions, AppTopbar } from "./components/app-topbar";
export { CopilotRailDockAnchor } from "./components/copilot-rail-dock-anchor";
export {
  Pane,
  PaneGroup,
  type PaneProps,
  PaneResizeHandle,
  type PaneResizeHandleProps,
  PaneTopBar,
} from "./components/pane/pane";
export {
  SidebarSpacesZone,
  type SidebarSpacesZoneLabels,
  type SidebarSpacesZoneProps,
} from "./components/sidebar-spaces-zone";
export { SpaceIconFace } from "./components/space-icon-face";
export type {
  AgentUiBaseSnapshotInput,
  AgentUiDialogOpener,
  AgentUiFieldElementGetter,
  AgentUiFieldFocusHandler,
  AgentUiFrontendToolHandler,
  AgentUiStateSlice,
} from "./context/agent-ui-state-context";
export {
  AgentUiStateProvider,
  useAgentUiDialogOpener,
  useAgentUiFieldElement,
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
  AppBarChromeProvider,
  useAppBarChromeContext,
} from "./context/app-bar-chrome-context";
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
export {
  DEFAULT_UI_GUIDE_ACTIONS,
  dismissUiGuideSession,
  formatUiGuideFollowUpMessage,
  GuideOverlayHost,
  type GuideOverlayHostProps,
  getUiGuideSession,
  type ResolveUiGuideTargetHelpers,
  resetUiGuideSessionForTests,
  resolveUiGuideAction,
  resolveUiGuideTarget,
  showUiGuideSession,
  subscribeUiGuide,
  UI_GUIDE_SPOTLIGHT_PADDING_PX,
  type UiGuideAction,
  type UiGuideActionVariant,
  type UiGuideInputConfig,
  type UiGuideInputField,
  type UiGuideInputType,
  type UiGuidePlacement,
  type UiGuidePresentation,
  type UiGuideResolvedResult,
  type UiGuideSession,
  type UiGuideShowConfig,
  type UiGuideShownResult,
  type UiGuideShowResult,
  type UiGuideTarget,
  type UiGuideUpdateConfig,
  updateUiGuideSession,
} from "./guide";
export { useAppBarChrome, useAppBarPosition } from "./hooks/use-app-bar-chrome";
export type { PersistedEwResizePaneWidthOptions } from "./hooks/use-persisted-ew-resize-pane-width";
export { usePersistedEwResizePaneWidth } from "./hooks/use-persisted-ew-resize-pane-width";
export { useShellSecondaryNavWidth } from "./hooks/use-shell-secondary-nav-width";
export {
  AGENT_UI_FIELD_ATTR,
  agentUiFieldFormName,
  agentUiFieldSelector,
  isPlausibleAgentUiFieldActiveElement,
  queryAgentUiFieldElement,
} from "./lib/agent-ui-field-element";
export {
  isCopilotShellSlotOpen,
  shouldShowInlineCopilotSidebar,
} from "./lib/copilot-chrome";
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
  isSpaceImageIcon,
  RAIL_SPACE_BUDGET,
  RAIL_SPACE_NO_STACK_MAX,
  type RailSpace,
  type RailSpaceIndicator,
  type RailSpaceTile,
  type ResolveRailSpacesInput,
  type ResolveRailSpacesResult,
  railSpaceInitials,
  resolveRailSpaces,
  rollUpIndicators,
} from "./lib/rail-spaces";
export {
  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
  RAIL_TILE_REST_SHADOW_CLASSNAME,
} from "./lib/rail-tile-chrome";
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
  COPILOT_DOCK_MODES,
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotDockMode,
  type CopilotLayoutLegacyDockMode,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  type CopilotWindowRect,
  isCopilotDockMode,
  reconcileCopilotLayoutSnapshot,
  remapPersistedDockMode,
  UI_SCROLL_SAFE_BOTTOM_PX,
} from "./types/copilot-layout";
export {
  COPILOT_LAYOUT_NOOP,
  type CopilotCompanionWho,
  type CopilotLayoutPersistence,
  type CopilotSlotProps,
} from "./types/copilot-shell";
export type {
  NavigationItem,
  NavigationSection,
  NavigationSectionId,
  ShellSidebarConfig,
} from "./types/shell";
export {
  APP_BAR_COMPACT_THICKNESS_PX,
  APP_BAR_EXTENDED_WIDTH_PX,
  APP_BAR_POSITIONS,
  type AppBarPosition,
  type AppBarTooltipSide,
  appBarHideTransform,
  appBarThicknessPx,
  appBarTooltipSide,
  createDefaultShellAppBarPositionSnapshot,
  DEFAULT_APP_BAR_POSITION,
  isAppBarPosition,
  isHorizontalAppBarPosition,
  mergeShellAppBarPositionSnapshot,
  parseShellAppBarPositionSnapshot,
  readAppBarPositionFromStorage,
  SHELL_APP_BAR_POSITION_CHANGE_EVENT,
  SHELL_APP_BAR_POSITION_NOOP,
  SHELL_APP_BAR_POSITION_STORAGE_KEY,
  SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
  type ShellAppBarPositionPersistence,
  type ShellAppBarPositionPersistenceApi,
  type ShellAppBarPositionSnapshotV1,
  shellRootFlexClass,
  writeAppBarPositionToStorage,
} from "./types/shell-app-bar-position";
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
