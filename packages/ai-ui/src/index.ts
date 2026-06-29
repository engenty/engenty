// @engenty/ai-ui public barrel — see packages/ai-ui/docs/architecture.md for Tier 1/2/3 boundaries.
//
// Tier 1 (embed API): re-exported from ./embed.js — safe for modules and third-party embeds.
// Tier 2 (product): ActiveCopilotProvider, copilot thread binding, admin routes, local recovery.
// Tier 3 (transitional ui-core re-exports): removed — copilot + AI Elements live in ai-ui (Phase 2).

// --- Dev tooling (not embed API) ---
export {
  AgUiAgentInspectorWidget,
  type AgUiAgentInspectorWidgetProps,
  openAgUiAgentInspector,
} from "./components/ag-ui-inspector/ag-ui-inspector-widget.js";
export {
  CopilotMessageQueueSurface,
  type CopilotMessageQueueSurfaceLabels,
  type CopilotMessageQueueSurfaceProps,
} from "./components/copilot/composer/copilot-message-queue-surface.js";
export {
  SubAgentRunFullPage,
  type SubAgentRunFullPageLabels,
  type SubAgentRunFullPageProps,
} from "./components/copilot/sub-agent-run/sub-agent-run-full-page.js";
export { SubAgentRunMonitor } from "./components/copilot/sub-agent-run/sub-agent-run-monitor.js";
export {
  CopilotVoiceFab,
  type CopilotVoiceFabProps,
} from "./components/copilot/voice-fab/index.js";
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
  type RejectCopilotOpenInterruptParams,
  rejectCopilotOpenInterrupt,
} from "./copilot/approve-copilot-open-interrupt.js";
export {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
  COPILOT_SUB_RUN_QUERY,
  copilotChatSubRunPath,
  defaultCopilotSessionPath,
  readCopilotSubRunToolCallId,
} from "./copilot/copilot-chat-paths.js";
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
// --- Tier 2: admin operator UI (plugin catalog + HTTP clients) ---
export { AGENTS_WORKSPACE_ROOT_PATH } from "./features/agents-workspace/agent-workspace-url-state.js";
export type {
  AiAdminSessionStats,
  AiRegisteredAgent,
  AiSessionMessage,
  AiSessionRecord,
} from "./lib/admin/ai-runtime-api.js";
export {
  aiRuntimeKeys,
  useAdminAiSessionStatsQuery,
  useAiAgentsQuery,
  useCustomAgentDetailQuery,
  useDeleteAllAdminAiSessionsMutation,
} from "./lib/admin/ai-runtime-queries.js";
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
