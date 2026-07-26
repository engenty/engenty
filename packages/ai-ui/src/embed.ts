// @engenty/ai-ui embed entry — Tier 1 only (see packages/ai-ui/docs/architecture.md).
//
// Standalone React apps and module embeds import from `@engenty/ai-ui/embed` to avoid
// pulling admin routes, admin HTTP clients, or product copilot shell hooks.

// --- AG-UI runtime — apps/ai transport, conversation, frontend tools ---
export { parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
export {
  formatObjectRef,
  isAgentThreadId,
  type ObjectDisplayHint,
  type ObjectDisplayItem,
  type ObjectRef,
  type ObjectRenderMeta,
  objectRefTypeKey,
  parseObjectRef,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
export {
  appsAiActionRunPath,
  appsAiActionsListPath,
  type ChatCommandCatalogEntry,
  getAppsAiChatCommands,
  postAppsAiActionRun,
} from "./ag-ui/apps-ai/apps-ai-api.js";
export {
  type AgUiOpenInterruptMetadata,
  type AppsAiCopilotAppsAiQueryKeyParams,
  type AppsAiCopilotModulePanelQueryKeyParams,
  type AppsAiThreadDto,
  type AppsAiThreadMessageRecord,
  type AppsAiThreadRecord,
  appsAiCopilotAppsAiQueryKeys,
  appsAiCopilotModulePanelQueryKeys,
  appsAiRequestHeaders,
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  appsAiThreadsListQueryKey,
  appsAiThreadsPath,
  buildAppsAiResumeRunInput,
  buildAppsAiRunInput,
  createAppsAiThread,
  deleteAppsAiThread,
  deleteAppsAiThreads,
  type EngentyAgUiPendingSend,
  executeOpenAiRealtimeVoiceBackendTool,
  executeOpenAiRealtimeVoiceFrontendTool,
  getAppsAiThread,
  isAgUiOpenInterruptExpired,
  isOpenAiRealtimeVoiceBackendToolName,
  listAppsAiThreadMessages,
  listAppsAiThreads,
  OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS,
  type OpenAiRealtimeVoiceComposerControls,
  type OpenAiRealtimeVoiceToolCallRequest,
  type OpenAiRealtimeVoiceToolDefinition,
  openAiRealtimeVoiceToolsFromFrontendTools,
  postAppsAiThreadRun,
  readAgUiOpenInterrupt,
  resolveAppsAiFrontendTools,
  resolveEngentyAiServiceBaseUrl,
  transcribeAudioViaAppsAi,
  updateAppsAiThread,
  useAppsAiThreadMessagesQuery,
  useAppsAiThreadQuery,
  useAppsAiThreadsQuery,
  useEngentyAgentContext,
  useEngentyAgentState,
  useEngentyAgUiAppsAiSession,
  useEngentyAiCopilotSessionQueries,
  useEngentyCopilot,
  useEngentyFrontendTool,
  useOpenAiRealtimeVoiceComposerControls,
} from "./ag-ui/apps-ai/index.js";
export {
  applyEngentyAgUiConversationAction,
  areAgUiHydrationTargetsEqual,
  type EngentyAgUiConversationState,
  type EngentyAgUiConversationStatus,
  type EngentyAgUiMessage,
  type EngentyAgUiState,
  isAwaitingAgUiInitialHydrate,
  reduceEngentyAgUiConversationEvent,
  shouldSeedAgUiConversationFromInitialMessages,
  useEngentyAgUiConversation,
} from "./ag-ui/conversation.js";
export { agUiMessagesToCopilotMessages } from "./ag-ui/copilot-adapter.js";
export {
  agUiMessagesFromAiSessionMessages,
  type EngentyAgUiPanelStatus,
  type EngentyAgUiRouteContext,
} from "./ag-ui/engenty-ag-ui-route-context.js";
export {
  resolvePendingUserInsertIndex,
  resolvePendingUserTextForTranscript,
} from "./ag-ui/pending-send-transcript.js";
export {
  formatCopilotRunError,
  resolveAgUiRunErrorEventMessage,
} from "./ag-ui/run-error-message.js";
export {
  mergeDynamicToolPart,
  mergeDynamicToolPartsInOrder,
  shouldAcceptIncomingOverExisting,
} from "./ag-ui/tool-call-merge.js";
// --- Agent host provider + lane hooks ---
export {
  ACTIVE_COPILOT_AGENT_ID,
  type ActiveCopilotAgentId,
  type AgentHost,
  ENGENTY_COPILOT_HOST_KEY,
  EngentyAgent,
  type EngentyAgentAffinityKeyInput,
  type EngentyAgentProps,
  type EngentyAgentStatus,
  EngentyAI,
  type EngentyAIContextValue,
  type EngentyAIProps,
  type EngentyCopilotHostKey,
  type EngentyInterruptFeedback,
  type HostConfig,
  resolveCopilotWorkContextStableSessionKey,
  resolveEngentyAgentAffinityStableSessionKey,
  type SubmitMessage,
  type SubmitMessageOptions,
  useAgentHost,
  useAgentHostConfig,
  useEngentyAIContext,
} from "./agent-provider/index.js";
export {
  ActionButton,
  type ActionButtonProps,
} from "./components/ai-elements/action-button.js";
export { A2uiToolCallCard } from "./components/copilot/tool-call/a2ui-tool-call-card.js";
// --- Presentation (copilot chrome + AI Elements) ---
export {
  asRecord,
  COPILOT_BOTTOM_DOCK_HEIGHT,
  COPILOT_DOCK_COMPOSER_CARD_CLASS,
  COPILOT_LAYOUT_USER_SETTING_NAME,
  CopilotAgentSessionChooser,
  type CopilotAgentSessionChooserSession,
  type CopilotChatOnFinish,
  CopilotComposerSection,
  CopilotDrawer,
  type CopilotDrawerInjectedSession,
  CopilotDrawerPositionMenu,
  type CopilotDrawerPositionMenuProps,
  type CopilotLayoutPersistDockMode,
  type CopilotLayoutPersistenceApi,
  type CopilotLayoutSnapshotV1,
  CopilotOpenInterruptBanner,
  CopilotPanelContent,
  type CopilotPanelContentProps,
  CopilotPanelHeader,
  type CopilotPanelMode,
  type CopilotRouteContext,
  CopilotTranscript,
  CopilotTranscriptLoading,
  type CopilotTranscriptLoadingProps,
  type CopilotTranscriptProps,
  createEmptyCopilotLayoutSnapshot,
  type FieldSuggestion,
  FileDownloadsToolCallCard,
  formatCopilotRouteStatusLabel,
  formatCopilotThreadCopyText,
  HitlApprovalCard,
  isFileDownloadsOfferOutput,
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
  matchesFileDownloadsToolCall,
  mergeCopilotLayoutSnapshot,
  type OpenCopilotShellInput,
  openCopilotShell,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputInput,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  parseCopilotLayoutSnapshot,
  parseDecisionArtifact,
  pendingInterruptFromTranscript,
  readStringField,
  reconcileCopilotLayoutSnapshot,
  registerDefaultToolCallUiCards,
  registerToolCallUi,
  Shimmer,
  shouldShowTopOpenInterruptBanner,
  type TextShimmerProps,
  ToolCallCard,
  ToolCallCardBase,
  type ToolCallCardDensity,
  type ToolCallCardProps,
  toHumanValue,
  useCopilotSuggestionsState,
  useCopilotToolCallActions,
  usePromptInputController,
} from "./components/presentation.js";
// --- Effort: the end-user "how much thinking" control ---
export {
  AI_EFFORT_CHOICES,
  buildEffortChoiceOptions,
  type EffortChoiceOption,
  isEffortRestricted,
  resolveEffortChoice,
  toEffortGrant,
} from "./features/ai-effort/effort-choices.js";
export {
  EffortSelector,
  type EffortSelectorProps,
} from "./features/ai-effort/effort-selector.js";
// --- Inbox (Mastra notifications; rendered by the tasks module) ---
export type { InboxNotificationDto } from "./features/inbox/inbox-api.js";
export { listInbox } from "./features/inbox/inbox-api.js";
export {
  inboxKeys,
  useInboxListQuery,
  useInboxUnseenCountQuery,
  useMarkAllInboxSeenMutation,
  useMarkInboxNotificationMutation,
} from "./features/inbox/inbox-queries.js";
// --- Working memory (assistant's per-user profile; settings view) ---
export {
  parseWorkingMemoryProfile,
  useResetWorkingMemoryMutation,
  useWorkingMemoryQuery,
  type WorkingMemoryDto,
  workingMemoryKeys,
} from "./features/memory/working-memory-api.js";
export {
  RoutineCreateDialog,
  type RoutineCreateDialogProps,
} from "./features/routines/routine-create-dialog.js";
export {
  RoutineDetailPanel,
  type RoutineDetailPanelProps,
} from "./features/routines/routine-detail-panel.js";
export {
  RoutineForm,
  type RoutineFormProps,
} from "./features/routines/routine-form.js";
export {
  defaultRoutineFormValue,
  type RoutineFormErrorKey,
  type RoutineFormValue,
  routineFormToPayload,
  routineToFormValue,
  validateRoutineForm,
} from "./features/routines/routine-form-value.js";
export {
  RoutineTriggerChip,
  type RoutineTriggerChipProps,
} from "./features/routines/routine-trigger-chip.js";
// --- AI Routines & Custom Routines ---
export {
  type CustomRoutineInput,
  createCustomRoutine,
  deleteCustomRoutine,
  listRoutines,
  patchRoutineState,
  type RoutineDto,
  runRoutineNow,
  updateCustomRoutine,
} from "./features/routines/routines-api.js";
export {
  RoutinesList,
  type RoutinesListProps,
} from "./features/routines/routines-list.js";
export {
  routinesKeys,
  routinesListOptions,
  useCreateCustomRoutineMutation,
  useDeleteCustomRoutineMutation,
  usePatchRoutineStateMutation,
  useRoutinesListQuery,
  useRunRoutineNowMutation,
  useUpdateCustomRoutineMutation,
} from "./features/routines/routines-queries.js";
export {
  type RunActionInput,
  type RunActionResult,
  useRunAction,
} from "./hooks/use-run-action.js";
export {
  buildChatReferencePart,
  type ChatReferenceItem,
  isChatReferencePart,
  readChatReferencePart,
} from "./lib/chat-reference-part.js";
// --- Chat attachments (reused by module chat surfaces, e.g. team-chat) ---
export { getFileStorageSignedUrl } from "./lib/file-storage-signed-url.js";
export {
  type FileStorageSkillSummary,
  getFileStorageSkills,
} from "./lib/runtime/skills-api.js";
export type { TranscribeSpeechAudio } from "./lib/speech/use-speech-to-text.js";
export {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  type ChatAttachmentUpload,
  uploadChatAttachment,
} from "./lib/upload-chat-attachment.js";
// --- Object widgets (module entities rendered in chat by reference) ---
export {
  type ObjectDisplayIntent,
  ObjectDisplayIntentProvider,
  useObjectDisplayIntent,
} from "./objects/object-display-intent.js";
export { ObjectFallbackCard } from "./objects/object-fallback-card.js";
export {
  ObjectCardFrame,
  ObjectCardLink,
  ObjectListFooter,
  ObjectListRow,
  type ObjectListRowProps,
  type ObjectRowAction,
  ObjectRowList,
} from "./objects/object-list.js";
export {
  ObjectPanelAskAgentBar,
  type ObjectPanelAskAgentBarProps,
} from "./objects/object-panel-ask-agent-bar.js";
export {
  ObjectRenderToolCallCard,
  objectRenderToolCallMatch,
} from "./objects/object-render-tool-call-card.js";
export {
  clearObjectWidgetsForTests,
  listObjectWidgets,
  type ObjectWidgetCardProps,
  type ObjectWidgetPanelProps,
  type ObjectWidgetRegistration,
  registerObjectWidget,
  resolveObjectWidget,
  useObjectWidget,
  useObjectWidgets,
} from "./objects/object-widget-registry.js";
// --- Host-scoped thread list (CopilotKit-shaped) ---
export {
  type CreateEngentyThreadOptions,
  ENGENTY_THREAD_HOST_KEY_FIELD,
  type EngentyThreadRecord,
  EngentyThreadsProvider,
  type EngentyThreadsProviderProps,
  engentyThreadsListQueryKey,
  mergeRouteContextWithHostKey,
  readActiveThreadIdForHost,
  readThreadHostKeyFromRouteContext,
  resolveEngentyThreadHostProfile,
  sessionMatchesHostKey,
  type UseEngentyThreadOptions,
  type UseEngentyThreadResult,
  type UseEngentyThreadsOptions,
  type UseEngentyThreadsResult,
  useEngentyThread,
  useEngentyThreads,
  useEngentyThreadsContext,
  writeActiveThreadIdForHost,
} from "./threads/index.js";
