// Public barrel for apps/ai AG-UI transport — threads, runs, session hook, frontend-tool dispatch.
// Tier 1 embed API: consumed by EngentyAgent and module embeds via `@engenty/ai-ui`.

export {
  type AgUiOpenInterruptMetadata,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
export {
  resolvePendingUserInsertIndex,
  resolvePendingUserTextForTranscript,
} from "../pending-send-transcript.js";
export {
  type EngentyAgentContextConfig,
  useEngentyAgentContext,
} from "../use-engenty-agent-context.js";
export { useEngentyAgentState } from "../use-engenty-agent-state.js";
export {
  type UseEngentyCopilotOptions,
  type UseEngentyCopilotResult,
  useEngentyCopilot,
} from "../use-engenty-copilot.js";
export {
  type EngentyFrontendToolRenderProps,
  type EngentyFrontendToolStatus,
  type EngentyZodFrontendToolConfig,
  type UseEngentyFrontendToolOptions,
  useEngentyFrontendTool,
} from "../use-engenty-frontend-tool.js";
export {
  APPS_AI_BASE_PATH,
  appsAiRequestHeaders,
  appsAiThreadsPath,
  resolveEngentyAiServiceBaseUrl,
} from "./apps-ai-api.js";
export {
  type AppsAiCopilotAppsAiQueryKeyParams,
  type AppsAiCopilotModulePanelQueryKeyParams,
  appsAiCopilotAppsAiQueryKeys,
  appsAiCopilotModulePanelQueryKeys,
} from "./apps-ai-copilot-query-keys.js";
export {
  type AppsAiThreadMessageRecord,
  type AppsAiThreadRecord,
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  appsAiThreadsListQueryKey,
  deleteAppsAiThread,
  deleteAppsAiThreads,
  getAppsAiThread,
  listAppsAiThreadMessages,
  listAppsAiThreads,
  updateAppsAiThread,
  useAppsAiThreadMessagesQuery,
  useAppsAiThreadQuery,
  useAppsAiThreadsQuery,
} from "./apps-ai-session-api.js";
export {
  type AppsAiThreadDto,
  createAppsAiThread,
  postAppsAiThreadRun,
} from "./apps-ai-transport.js";
export {
  buildAppsAiResumeRunInput,
  buildAppsAiRunInput,
} from "./build-apps-ai-run-input.js";
export {
  executeOpenAiRealtimeVoiceBackendTool,
  isOpenAiRealtimeVoiceBackendToolName,
  OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS,
  type PostRealtimeVoiceFieldsApplyOptions,
  type PostRealtimeVoiceToolApproveOptions,
  parseRealtimeVoiceToolApproval,
  postRealtimeVoiceFieldsApply,
  postRealtimeVoiceToolApprove,
  type RealtimeVoiceToolApproval,
  type RealtimeVoiceToolApprovalChoice,
  type RealtimeVoiceToolApprovalDecision,
} from "./realtime-voice-backend-tools.js";
export {
  type RealtimeVoiceEvent,
  type RealtimeVoiceToolCallRequest,
  type RealtimeVoiceToolDefinition,
  type RealtimeVoiceTranscript,
  type RealtimeVoiceTranscriptMessage,
  type RealtimeVoiceTranscriptSegment,
  type RealtimeVoiceTransport,
  realtimeVoiceTranscriptMessagesFromTranscript,
} from "./realtime-voice-events.js";
export {
  executeOpenAiRealtimeVoiceFrontendTool,
  normalizeRealtimeToolInput,
  openAiRealtimeVoiceFrontendToolName,
  openAiRealtimeVoiceToolsFromFrontendTools,
  resolveOpenAiRealtimeVoiceFrontendTool,
} from "./realtime-voice-frontend-tools.js";
export {
  type ConnectRealtimeVoiceTransportOptions,
  connectRealtimeVoiceTransport,
} from "./realtime-voice-transport.js";
export { resolveAppsAiFrontendTools } from "./resolve-apps-ai-frontend-tools.js";
export { transcribeAudioViaAppsAi } from "./transcribe-audio.js";
export {
  type EngentyAgUiPendingSend,
  useEngentyAgUiAppsAiSession,
} from "./use-engenty-ag-ui-apps-ai-session.js";
export {
  type UseEngentyAiCopilotSessionQueriesOptions,
  useEngentyAiCopilotSessionQueries,
} from "./use-engenty-ai-copilot-session-queries.js";
export {
  type OpenAiRealtimeVoiceComposerControls,
  type UseOpenAiRealtimeVoiceComposerControlsOptions,
  useOpenAiRealtimeVoiceComposerControls,
} from "./use-openai-realtime-voice-composer-controls.js";
export {
  type OpenAiRealtimeVoiceSessionState,
  type OpenAiRealtimeVoiceToolCallRequest,
  type OpenAiRealtimeVoiceToolDefinition,
  type OpenAiRealtimeVoiceTranscript,
  type OpenAiRealtimeVoiceTranscriptMessage,
  type OpenAiRealtimeVoiceTranscriptSegment,
  openAiRealtimeVoiceSessionToolEvents,
  openAiRealtimeVoiceToolCallsFromOpenAiEvent,
  openAiRealtimeVoiceTranscriptMessagesFromTranscript,
  realtimeVoiceStatusFromOpenAiEvent,
  realtimeVoiceTranscriptFromOpenAiEvent,
  useOpenAiRealtimeVoiceSession,
} from "./use-openai-realtime-voice-session.js";
export {
  type RealtimeVoiceSessionState,
  type UseRealtimeVoiceSessionOptions,
  useRealtimeVoiceSession,
} from "./use-realtime-voice-session.js";
export {
  clearPendingVoiceConfirmation,
  getPendingVoiceConfirmation,
  type ResolvePendingVoiceConfirmationParams,
  type ResolveVoiceConfirmationResult,
  resolvePendingVoiceConfirmation,
  setPendingVoiceConfirmation,
  subscribePendingVoiceConfirmation,
  suggestionsToApproved,
  type VoiceBackendApprovalPendingConfirmation,
  type VoiceFieldSuggestion,
  type VoiceFieldSuggestionsPendingConfirmation,
  type VoicePendingConfirmation,
} from "./voice-pending-confirmation.js";
export {
  PROPOSE_UPDATES_VOICE_TOOL,
  parseVoiceProposeUpdatesArgs,
  type VoiceProposeUpdatesArgs,
} from "./voice-propose-updates-tool.js";
