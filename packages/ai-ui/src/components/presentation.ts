// Tier 1 presentation — copilot chrome + AI Elements (Option A Phase 2 owner: @engenty/ai-ui).

export {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  type ChainOfThoughtHeaderProps,
  type ChainOfThoughtProps,
  ChainOfThoughtSearchResult,
  type ChainOfThoughtSearchResultProps,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
  type ChainOfThoughtStepProps,
  type ChainOfThoughtStepStatus,
  useChainOfThought,
} from "./ai-elements/chain-of-thought.js";
export {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "./ai-elements/message.js";
export {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputInput,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "./ai-elements/prompt-input.js";
export {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from "./ai-elements/reasoning.js";
export {
  Shimmer,
  type TextShimmerProps,
} from "./ai-elements/shimmer.js";
export {
  type CitationItem,
  SourceCitations,
  type SourceCitationsProps,
} from "./ai-elements/source-citations.js";
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
  type DeriveAgentStatusTickerInput,
  deriveAgentStatusTicker,
  getLastAssistantMessage,
} from "./copilot/composer/agent-status-ticker/index.js";
export {
  CopilotAgentPicker,
  type CopilotAgentPickerAgent,
} from "./copilot/composer/copilot-agent-picker.js";
export {
  CopilotAgentSessionChooser,
  type CopilotAgentSessionChooserSession,
} from "./copilot/composer/copilot-agent-session-chooser.js";
export {
  CopilotCompactComposerShell,
  type CopilotCompactComposerShellProps,
} from "./copilot/composer/copilot-compact-composer-shell.js";
export {
  CopilotComposer,
  type StarterPromptItem,
} from "./copilot/composer/copilot-composer.js";
export { CopilotComposerSection } from "./copilot/composer/copilot-composer-section.js";
export { CopilotRecentSessionsChooser } from "./copilot/composer/copilot-recent-sessions-chooser.js";
export {
  type ChatSlashCommand,
  type ChatSlashCommandKind,
  parseLeadingSlashCommand,
} from "./copilot/composer/copilot-slash-command.js";
export type {
  MentionRefCandidate,
  MentionRefSearch,
} from "./copilot/composer/use-copilot-composer-mention.js";
export {
  COPILOT_BOTTOM_DOCK_HEIGHT,
  CopilotDrawer,
  type CopilotPanelMode,
  type CopilotRouteContext,
  formatCopilotRouteStatusLabel,
} from "./copilot/drawer/copilot-drawer.js";
export type { CopilotDrawerInjectedSession } from "./copilot/drawer/copilot-drawer-injected-session.js";
export {
  CopilotDrawerPositionMenu,
  type CopilotDrawerPositionMenuProps,
} from "./copilot/drawer/copilot-drawer-position-menu.js";
export {
  type OpenCopilotShellInput,
  openCopilotShell,
  resolveCopilotOpenDockMode,
} from "./copilot/drawer/copilot-drawer-utils.js";
export { CopilotOpenInterruptBanner } from "./copilot/interrupts/copilot-open-interrupt-banner.js";
export {
  type CopilotDecisionInterruptFeedback,
  CopilotToolCallActionsProvider,
  type CopilotToolCallActionsValue,
  useCopilotToolCallActions,
} from "./copilot/interrupts/copilot-tool-call-actions.js";
export {
  type DecisionArtifact,
  DecisionArtifactCard,
  type DecisionArtifactChoice,
  decisionArtifactFromOpenInterrupt,
  parseDecisionArtifact,
  resolveDecisionArtifactForToolCall,
} from "./copilot/interrupts/decision-artifact.js";
export {
  type FeedbackArtifact,
  FeedbackArtifactCard,
  feedbackArtifactFromOpenInterrupt,
  parseFeedbackArtifact,
  resolveFeedbackArtifactForToolCall,
} from "./copilot/interrupts/feedback-artifact.js";
export {
  type FieldSuggestion,
  HitlApprovalCard,
} from "./copilot/interrupts/hitl-approval-card.js";
export { pendingInterruptFromTranscript } from "./copilot/interrupts/pending-interrupt-from-transcript.js";
export {
  COPILOT_DOCK_COMPOSER_CARD_CLASS,
  CopilotPanelContent,
  type CopilotPanelContentProps,
  CopilotPanelHeader,
} from "./copilot/panel/copilot-panel-content.js";
export type { CopilotChatOnFinish } from "./copilot/session/copilot-chat-types.js";
export { clearCopilotPersistedClientStorage } from "./copilot/session/copilot-client-storage.js";
export {
  COPILOT_LAYOUT_USER_SETTING_NAME,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  type CopilotPersistedPanelMode,
  createEmptyCopilotLayoutSnapshot,
  mergeCopilotLayoutSnapshot,
  parseCopilotLayoutSnapshot,
  reconcileCopilotLayoutSnapshot,
} from "./copilot/session/copilot-layout-snapshot.js";
export { useCopilotSuggestionsState } from "./copilot/session/use-copilot-suggestions-state.js";
export {
  DecisionArtifactToolCallCard,
  matchesDecisionArtifactOutput,
} from "./copilot/tool-call/decision-artifact-tool-call-card.js";
export {
  FeedbackArtifactToolCallCard,
  matchesFeedbackArtifactOutput,
} from "./copilot/tool-call/feedback-artifact-tool-call-card.js";
export {
  FileDownloadsToolCallCard,
  isFileDownloadsOfferOutput,
  matchesFileDownloadsToolCall,
} from "./copilot/tool-call/file-downloads-tool-call-card.js";
export {
  matchesSandboxCommandToolCall,
  SandboxCommandConfirmToolCallCard,
} from "./copilot/tool-call/sandbox-command-confirm-tool-call-card.js";
export {
  isSandboxExecuteCommandToolName,
  SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
} from "./copilot/tool-call/sandbox-command-tool-name.js";
export {
  shouldShowTopOpenInterruptBanner,
  transcriptHasActiveSandboxCommandToolPart,
} from "./copilot/tool-call/sandbox-command-transcript-utils.js";
export {
  registerDefaultToolCallUiCards,
  registerToolCallUi,
  resolveToolCallUiCard,
  ToolCallCard,
  type ToolCallCardDensity,
  type ToolCallCardProps,
  type ToolCallUiMatchContext,
  type ToolCallUiRegistration,
} from "./copilot/tool-call/tool-call-card.js";
export { ToolCallCardBase } from "./copilot/tool-call/tool-call-card-base.js";
export {
  asRecord,
  readStringField,
  toHumanValue,
} from "./copilot/tool-call/tool-call-card-utils.js";
export {
  extractCopilotMessageCopyText,
  formatCopilotThreadCopyText,
} from "./copilot/transcript/copilot-thread-copy.js";
export {
  CopilotTranscript,
  type CopilotTranscriptProps,
} from "./copilot/transcript/copilot-transcript.js";
export {
  CopilotTranscriptLoading,
  type CopilotTranscriptLoadingProps,
} from "./copilot/transcript/copilot-transcript-loading.js";
