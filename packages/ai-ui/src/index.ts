// @engenty/ai-ui public barrel — see packages/ai-ui/docs/architecture.md for Tier 1/2/3 boundaries.
//
// Tier 1 (embed API): re-exported from ./embed.js — safe for modules and third-party embeds.
// Tier 2 (product): ActiveCopilotProvider, copilot thread binding, admin routes, local recovery.
// Tier 3 (transitional ui-core re-exports): removed — copilot + AI Elements live in ai-ui (Phase 2).

export {
  registerAgentDisplayNames,
  useAgentDisplayNamesVersion,
} from "./ag-ui/agent-display-names.js";
export {
  type AppArtifactHandle,
  AppArtifactView,
  parseAppHandle,
} from "./artifacts/app-artifact-view.js";
export {
  type AppReview,
  type AppReviewAction,
  type AppReviewDetail,
  type AppReviewOperation,
  type AppReviewTable,
  appFrontendQueryKey,
  appReviewQueryKey,
  useAppReviewDecision,
  useAppReviewQuery,
} from "./artifacts/app-review-api.js";
export { AppReviewBanner } from "./artifacts/app-review-banner.js";
export {
  type AppReviewScopeGroup,
  AppReviewScopeIcon,
  type AppReviewScopeKind,
  type AppReviewScopeLine,
  useAppReviewScopeGroups,
} from "./artifacts/app-review-scopes.js";
export { iconForArtifactType } from "./artifacts/artifact-icons.js";
export {
  ArtifactMoveMenu,
  type ArtifactMoveMenuProps,
  type ArtifactStoreTarget,
} from "./artifacts/artifact-move-menu.js";
export {
  ArtifactPane,
  type ArtifactPaneProps,
} from "./artifacts/artifact-pane.js";
export {
  type ArtifactEditorProps,
  type ArtifactViewProps,
  registerArtifactEditor,
  registerArtifactRenderer,
  resolveArtifactEditor,
  resolveArtifactRenderer,
} from "./artifacts/artifact-renderers.js";
export { ArtifactStoragePicker } from "./artifacts/artifact-storage-picker.js";
export {
  type ArtifactPaneState,
  activateArtifact,
  clearArtifactsForTests,
  closeObjectPaneTab,
  closeWorkFilePaneTab,
  getArtifactPaneOpen,
  isObjectPaneTabKey,
  isTransientPaneTabKey,
  isWorkFilePaneTabKey,
  type ObjectPaneTab,
  objectPaneTabKey,
  objectRefFromPaneTabKey,
  openArtifactPane,
  openObjectPaneTab,
  openWorkFilePaneTab,
  setActiveArtifact,
  setArtifactPaneExpanded,
  setArtifactPaneOpen,
  type UseArtifactPaneResult,
  useArtifacts,
  type WorkFilePaneTab,
  workFilePaneTabKey,
} from "./artifacts/artifact-store.js";
export {
  type ArtifactScopeType,
  type ArtifactSummary,
  type ArtifactVersionListEntry,
  type ArtifactVersionSummary,
  type ArtifactWithContent,
  artifactsQueryRoot,
  containerArtifactsQueryKey,
  formatWorkContainer,
  listContainerArtifacts,
  useArtifactDetailQuery,
  useArtifactsListQuery,
  useContainerArtifactsQuery,
  type WorkContainerRef,
  type WorkContainerTier,
} from "./artifacts/artifacts-api.js";
export { MarkdownDocumentEditor } from "./artifacts/markdown-document-editor.js";
export {
  isMarkdownReadingStyle,
  type MarkdownReadingStyle,
  markdownDocumentColumnClassName,
  markdownReadingWrapClassName,
  useMarkdownReadingStyle,
} from "./artifacts/markdown-reading-style.js";
export { MarkdownReadingStyleSegment } from "./artifacts/markdown-reading-style-segment.js";
export {
  listWorkFiles,
  useWorkFilesQuery,
  type WorkFileEntry,
  type WorkFilesResponse,
  workFilesQueryKey,
  workFilesQueryRoot,
} from "./artifacts/work-files-api.js";
export { WorkPanel, type WorkPanelProps } from "./artifacts/work-panel.js";
export {
  type ArtifactPaneScope,
  ArtifactPaneToggle,
  WorkspaceArtifactPane,
  type WorkspaceArtifactPaneProps,
} from "./artifacts/workspace-artifact-pane.js";
export { useDeveloperModeEnabled } from "./components/ag-ui-inspector/ag-ui-inspector-hooks.js";
// --- Dev tooling (not embed API) ---
export {
  AgUiAgentInspectorWidget,
  type AgUiAgentInspectorWidgetProps,
  openAgUiAgentInspector,
} from "./components/ag-ui-inspector/ag-ui-inspector-widget.js";
export {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "./components/ai-elements/prompt-input/index.js";
export {
  type ChatKind,
  ChatKindBadge,
  useChatKindCopy,
} from "./components/copilot/chat-kind-badge.js";
export {
  CHAT_LANE_COLUMN_CLASS,
  CHAT_LANE_COMPOSER_CLASS,
  CHAT_LANE_TRANSCRIPT_CLASS,
  type ChatLaneComposer,
  ChatLaneDock,
  type ChatLaneDockLabels,
  type ChatLanePanelBaseProps,
  chatLanePanelBaseProps,
  type UseChatLaneComposerParams,
  useChatLaneComposer,
} from "./components/copilot/chat-lane/index.js";
export { agentIdToMentionHandle } from "./components/copilot/composer/copilot-agent-mention.js";
export type { StarterPromptItem } from "./components/copilot/composer/copilot-composer.js";
export { CopilotComposerSection } from "./components/copilot/composer/copilot-composer-section.js";
export {
  CopilotMessageQueueSurface,
  type CopilotMessageQueueSurfaceLabels,
  type CopilotMessageQueueSurfaceProps,
} from "./components/copilot/composer/copilot-message-queue-surface.js";
export type { ChatSlashCommand } from "./components/copilot/composer/copilot-slash-command.js";
export type {
  MentionRefCandidate,
  MentionRefSearch,
} from "./components/copilot/composer/use-copilot-composer-mention.js";
export {
  ContextUsageIndicator,
  type ContextUsageIndicatorProps,
  type ContextUsageLevel,
  contextUsageCostUsd,
  contextUsageLevel,
  contextUsageRatio,
  fetchThreadContextUsage,
  formatContextUsageLabel,
  formatCostUsd,
  formatTokenCount,
  type ThreadContextUsage,
  ThreadUsageDialog,
  type ThreadUsageDialogProps,
  type ThreadUsageEvent,
  threadContextUsageQueryKey,
  useCopilotContextUsage,
  useThreadUsageEvents,
} from "./components/copilot/context-usage/index.js";
export {
  SubAgentRunFullPage,
  type SubAgentRunFullPageLabels,
  type SubAgentRunFullPageProps,
} from "./components/copilot/sub-agent-run/sub-agent-run-full-page.js";
export { SubAgentRunMonitor } from "./components/copilot/sub-agent-run/sub-agent-run-monitor.js";
export {
  buildThreadContextSummary,
  ContextBox,
  type ContextBoxItem,
  ContextBoxRow,
  ContextBoxSection,
  type ContextBoxSectionModel,
  ContextBoxView,
  type ContextObjectItem,
  extractThreadAgents,
  extractThreadAttachments,
  extractThreadObjects,
  extractThreadSources,
  THREAD_CONTEXT_FLOAT_GAP_PX,
  THREAD_CONTEXT_FLOAT_WIDTH_PX,
  THREAD_CONTEXT_INLINE_MIN_WIDTH_PX,
  THREAD_CONTEXT_INLINE_PAD_VAR,
  THREAD_CONTEXT_PANE_WIDTH_PX,
  type ThreadContextAgentItem,
  type ThreadContextArtifactItem,
  type ThreadContextAttachmentItem,
  ThreadContextBox,
  ThreadContextMenuItem,
  type ThreadContextMessageLike,
  type ThreadContextMode,
  type ThreadContextObjectItem,
  ThreadContextPane,
  type ThreadContextSourceItem,
  type ThreadContextSummary,
  ThreadContextToggle,
  useContextObjectItems,
  useThreadContextSummary,
  useThreadContextUi,
} from "./components/copilot/thread-context/index.js";
export { TranscriptLoadOlder } from "./components/copilot/transcript/transcript-load-older.js";
export {
  CopilotVoiceFab,
  type CopilotVoiceFabProps,
} from "./components/copilot/voice-fab/index.js";
export {
  ENGENTY_CLUSTER_MAX,
  EngentyCluster,
} from "./components/engenty-cluster.js";
export {
  ThreadStatusIcon,
  type ThreadStatusIconProps,
  type ThreadStatusIconSize,
  threadStatusBadgeClassName,
} from "./components/thread-status/thread-status.js";
export {
  ACTIVE_COPILOT_NEW_CHAT_GENERATION_STORAGE_KEY,
  type ActiveCopilotHostThreadIdInput,
  type ActiveCopilotHostThreadIdResult,
  type ActiveCopilotStableSessionKeyInput,
  bumpActiveCopilotNewChatGeneration,
  isActiveCopilotChatIndexPathname,
  readActiveCopilotNewChatGeneration,
  resolveActiveCopilotHostThreadId,
  resolveActiveCopilotStableSessionKey,
  resolveAuthoritativeChatThreadIdFromPathname,
} from "./copilot/active-copilot-controller.js";
export {
  ActiveCopilotProvider,
  type ActiveCopilotProviderProps,
} from "./copilot/active-copilot-provider.js";
// --- Tier 2: product copilot shell (engenty:copilot lane orchestration) ---
export {
  type ApproveCopilotOpenInterruptParams,
  approveCopilotOpenInterrupt,
  type CopilotOpenInterruptExecuteFrontendTool,
  type CopilotOpenInterruptResumeInterrupt,
} from "./copilot/approve-copilot-open-interrupt.js";
export {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
  COPILOT_SUB_RUN_QUERY,
  canonicalCopilotChatPathname,
  copilotChatSubRunPath,
  defaultCopilotSessionPath,
  readCopilotSubRunToolCallId,
  resolveFullscreenCopilotChatPath,
  spaceCopilotChatPath,
} from "./copilot/copilot-chat-paths.js";
export {
  registerCopilotComposerDraftSetter,
  setCopilotComposerDraft,
} from "./copilot/copilot-composer-draft-intent.js";
export {
  CopilotThreadBindingProvider,
  type CopilotThreadBindingProviderProps,
  useCopilotThreadBinding,
} from "./copilot/copilot-thread-binding-provider.js";
export {
  CopilotVoiceProvider,
  useCopilotVoice,
} from "./copilot/copilot-voice-provider.js";
export {
  clearPendingHostMessage,
  HOST_MESSAGE_HANDOFF_STATE,
  pendingHostMessageFromState,
  pendingHostMessageStorageKey,
  readPendingHostMessage,
  resolvePendingHostMessage,
  writePendingHostMessage,
} from "./copilot/host-message-handoff.js";
export {
  type AgentRunOutcomeState,
  type AgentRunStatus,
  AgentStatusTicker,
  type AgentStatusTickerLabels,
  type AgentStatusTickerProps,
  type AgentStatusTickerSnapshot,
  type AgentStatusTickerVariant,
  type AgentStepKind,
  type AgentTurnMessageLike,
  type AgentTurnPhase,
  buildAssistantActivitySignature,
  CopilotCompactComposerShell,
  type CopilotCompactComposerShellProps,
  type DeriveAgentStatusTickerInput,
  deriveAgentStatusTicker,
  getLastAssistantMessage,
} from "./copilot/index.js";
export {
  buildCopilotLocalRecoveryStorageKey,
  type CopilotLocalRecoveryThreadKey,
  type CopilotLocalRecoveryV1,
  clearAllCopilotLocalRecoveryForUser,
  clearCopilotComposerDraft,
  isCopilotComposerDraftRecoveryEnabled,
  moveCopilotComposerDraft,
  readCopilotComposerDraft,
  writeCopilotComposerDraft,
} from "./copilot/local-recovery.js";
export { PendingHostMessageSubmit } from "./copilot/pending-host-message-submit.js";
export {
  type SubAgentDelegationDetail,
  selectSubAgentDelegationFromMessages,
} from "./copilot/sub-agent-run/select-sub-agent-delegation.js";
export { useCopilotAssistantTurnFinish } from "./copilot/use-copilot-assistant-turn-finish.js";
export {
  resolveCopilotRecoveryThreadKey,
  type UseCopilotComposerDraftRecoveryOptions,
  useCopilotComposerDraftRecovery,
} from "./copilot/use-copilot-composer-draft-recovery.js";
export { useCopilotInitialMessages } from "./copilot/use-copilot-initial-messages.js";
export {
  type CopilotMessageQueue,
  type CopilotRunStatus,
  type QueuedCopilotMessage,
  useCopilotMessageQueue,
} from "./copilot/use-copilot-message-queue.js";
export { useCopilotSelectedThread } from "./copilot/use-copilot-selected-thread.js";
export {
  useCopilotOnThreadCreated,
  useCopilotThreadActions,
} from "./copilot/use-copilot-thread-actions.js";
export * from "./embed.js";
export { AgentDesk } from "./features/agent-desk/agent-desk.js";
export {
  type AgentDeskWelcome,
  postAgentDeskWelcome,
} from "./features/agent-desk/agent-desk-api.js";
export {
  canManageAgent,
  isAgentDeskChatSurface,
  resolveAgentDeskDefault,
} from "./features/agent-desk/agent-desk-defaults.js";
export type { AgentDeskRelation } from "./features/agent-desk/agent-desk-header.js";
export { AgentDeskNewRoomDialog } from "./features/agent-desk/agent-desk-new-room-dialog.js";
export type {
  AgentDeskSwitchAgent,
  AgentDeskSwitchRoom,
} from "./features/agent-desk/agent-desk-switcher.js";
export {
  agentDeskHostKey,
  agentRoomHostKey,
  conversationEngagement,
  threadIdFromEngagement,
} from "./features/agent-desk/agent-desk-url.js";
export { AgentRemovalDialog } from "./features/agent-desk/agent-removal-dialog.js";
export { AgentRoom } from "./features/agent-desk/agent-room.js";
export type { AgentDeskSpacePerson } from "./features/agent-desk/agent-room-info-panel.js";
export {
  type RoomVisibility,
  type SpaceConversations,
  type SpaceDmRow,
  type SpaceRoomDirectoryRow,
  type SpaceRoomRow,
  useContinueRoomMutation,
  useJoinRoomMutation,
  useLeaveRoomMutation,
  useOpenDmMutation,
  useRoomsDirectoryQuery,
  useSpaceConversationsQuery,
  useUpdateRoomMutation,
} from "./features/agent-desk/conversation-api.js";
export {
  type SendDeskMessageInput,
  type SendDeskMessageResult,
  sendDeskMessageInPlace,
} from "./features/agent-desk/send-desk-message.js";
export { useAgentDeskFeed } from "./features/agent-desk/use-agent-desk-feed.js";
export {
  type AgentLiveActivity,
  useAgentLiveActivity,
  useAgentLiveActivityMap,
} from "./features/agent-desk/use-agent-live-activity.js";
export {
  AGENT_ROLE_TEMPLATES,
  type AgentRoleTemplate,
} from "./features/agent-form/agent-role-templates.js";
export { AgentProposalsCard } from "./features/agent-proposals/agent-proposals-card.js";
export {
  AgentModuleBadge,
  AgentRoleBadge,
  AgentSourceBadge,
} from "./features/agents-workspace/agent-badges.js";
// --- Tier 2: admin operator UI (plugin catalog + HTTP clients) ---
export {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildConnectionDetailPath,
  CONNECTIONS_ROOT_PATH,
} from "./features/agents-workspace/agent-workspace-url-state.js";
export { formatRelativeDate } from "./features/agents-workspace/date-format.js";
// Shell nav for module-owned pages living under /admin/engenty (e.g. the
// connections module's Connections page): same sidebar as the core pages.
export { EngentyCanvasPageChrome } from "./features/agents-workspace/engenty-catalog-page-chrome.js";
export { useAgentsWorkspaceShellNav } from "./features/agents-workspace/use-agents-workspace-shell-nav.js";
export { useWorkspaceNavData } from "./features/agents-workspace/use-workspace-nav-data.js";
export { useEffortLastResolved } from "./features/ai-effort/effort-resolved-flash.js";
// Grant lookup is Tier 2: it reads the tenant usage policy over the admin HTTP
// client, which the embed entry deliberately does not pull in.
export { useEffortGrant } from "./features/ai-effort/use-effort-grant.js";
export { useEffortModelBindings } from "./features/ai-effort/use-effort-model-bindings.js";
export { useEffortResolvedFeedback } from "./features/ai-effort/use-effort-resolved-feedback.js";
export { CopilotAdminLinksSection } from "./features/ai-settings/copilot-admin-links-section.js";
export { EffortTiersCard } from "./features/ai-settings/effort-tiers-card.js";
export {
  CopilotBrowserPanel,
  userBrowserQueryKey,
} from "./features/browser/copilot-browser-panel.js";
export {
  mintUserBrowserTicket,
  readUserBrowser,
  startUserBrowser,
  stopUserBrowser,
  type UserBrowserState,
  type UserBrowserStatus,
} from "./features/browser/user-browser-api.js";
export {
  UserBrowserPane,
  UserBrowserPaneToggle,
} from "./features/browser/user-browser-pane.js";
export {
  type UserBrowserSeat,
  UserBrowserView,
} from "./features/browser/user-browser-view.js";
export {
  organizeSpaceChats,
  SPACE_CHAT_KIND_ORDER,
  type SpaceChatAgentGroup,
  type SpaceChatAgentInfo,
  type SpaceChatDirectoryRoom,
  type SpaceChatKind,
  type SpaceChatKindGroup,
  type SpaceChatRow,
  SpaceChatsList,
  type SpaceChatsListLabels,
  type SpaceChatVisibility,
  spaceChatKind,
  spaceChatRows,
  spaceChatVisibility,
  transcriptShowsSenderLabels,
  type UseSpaceChatsResult,
  unattendedRunIdOfThread,
  useSpaceChats,
} from "./features/space-chats/index.js";
export {
  type SpaceHomeAppRelease,
  type SpaceHomeInterrupt,
  type SpaceHomeJob,
  type SpaceHomeLastMessage,
  type SpaceHomeResponse,
  type SpaceHomeState,
  type SpaceHomeThread,
  type SpaceHomeThreadKind,
  spaceHomeQueryKey,
  useSpaceHomeQuery,
} from "./features/space-home/space-home-api.js";
export { GateDecisionCard } from "./features/workflow-canvas/gate-decision-card.js";
export {
  type CanvasNodeData,
  type CanvasNodeKind,
  type StoredGraph,
  storedGraphToCanvas,
} from "./features/workflow-canvas/graph-model.js";
export { NodeInspector } from "./features/workflow-canvas/node-inspector.js";
// ── Action canvas (multi-step graph actions) ─────────────────────────────────
export type {
  GraphIssueDto,
  WorkflowDto,
  WorkflowVersionDto,
} from "./features/workflow-canvas/workflow-api.js";
export {
  type CanvasMode,
  WorkflowCanvas,
} from "./features/workflow-canvas/workflow-canvas.js";
export { WorkflowEditor } from "./features/workflow-canvas/workflow-editor.js";
export { WorkflowLibraryCards } from "./features/workflow-canvas/workflow-flows-cards.js";
export { WorkflowLibraryTable } from "./features/workflow-canvas/workflow-flows-table.js";
export type { NodeRunState } from "./features/workflow-canvas/workflow-node.js";
export {
  useGraphValidationQuery,
  useResumeRunMutation,
  useRunWorkflowMutation,
  useWorkflowListQuery,
  useWorkflowQuery,
  workflowKeys,
} from "./features/workflow-canvas/workflow-queries.js";
export { WorkflowRunView } from "./features/workflow-canvas/workflow-run-view.js";
export { WorkflowRunsList } from "./features/workflow-canvas/workflow-runs-list.js";
export { useChatSlashCommands } from "./hooks/use-chat-slash-commands.js";
export { useMentionAgentCandidates } from "./hooks/use-mention-agent-candidates.js";
export type {
  AiAdminThreadStats,
  AiRegisteredAgent,
  AiThreadMessage,
  AiThreadRecord,
} from "./lib/admin/ai-runtime-api.js";
export {
  aiRuntimeKeys,
  useAdminAiThreadStatsQuery,
  useAiAgentsQuery,
  useCreateCustomAgentMutation,
  useCustomAgentDetailQuery,
  useDeleteAllAdminAiThreadsMutation,
} from "./lib/admin/ai-runtime-queries.js";
export {
  useAiSettingsQuery,
  useEffectiveAiSettingsQuery,
} from "./lib/admin/ai-settings-queries.js";
export { AgentFormPage } from "./routes/agent-form-page.js";
export {
  AiGeneralSettingsPage,
  AiSettingsPage,
} from "./routes/ai-settings-page.js";
export { OverviewPage } from "./routes/overview-page.js";
export { SkillDetailPage } from "./routes/skill-detail-page.js";
export {
  isTemporaryEngentyThreadId,
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
} from "./threads/index.js";
