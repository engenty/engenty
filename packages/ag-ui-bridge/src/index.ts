// Public barrel: official AG-UI re-exports plus Engenty bridge contracts.
export * from "@ag-ui/core";
export { AGUI_MEDIA_TYPE, EventEncoder } from "@ag-ui/encoder";
export type { ActiveArtifactMetadata } from "./active-artifact-metadata.js";
export {
  ACTIVE_ARTIFACT_METADATA_KEY,
  mergeActiveArtifactMetadata,
  readActiveArtifactMetadata,
} from "./active-artifact-metadata.js";
export {
  createAgUiSseParser,
  encodeAgUiSseEvent,
  parseAgUiSseChunk,
} from "./ag-ui-sse.js";
export type { AgentTurnMessageLike } from "./agent-turn-message.js";
export type {
  AgentUiDomEntryPoints,
  AgentUiDomRegionId,
} from "./agent-ui-dom-regions.js";
export {
  AGENT_UI_DOM_REGION,
  AGENT_UI_DOM_REGION_SELECTORS,
  buildDefaultDomEntryPoints,
  mergeDomEntryPoints,
} from "./agent-ui-dom-regions.js";
export type {
  AgentUiPageBriefInput,
  AgentUiPageBriefKey,
  AgentUiPageType,
} from "./agent-ui-page-brief.js";
export {
  AGENT_UI_PAGE_BRIEF_KEYS,
  buildAgentUiPageBrief,
  isAgentUiPageBriefKey,
} from "./agent-ui-page-brief.js";
export type {
  AgentUiAppContextEntry,
  AgentUiDraftSnapshot,
  AgentUiRouteSnapshot,
  AgentUiSelectionSnapshot,
  AgentUiShellSnapshot,
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
} from "./agent-ui-state.js";
export {
  AGENT_UI_STATE_SNAPSHOT_MAX_BYTES,
  agentUiBaseShellSignature,
  agentUiSharedStateSignature,
  agentUiStateForwardedProps,
  assertAgentUiStateSnapshotWithinLimit,
  getAgentUiStateSnapshotByteLength,
  isAgentUiStateSnapshotV1,
  readAgentUiStateSnapshot,
  readRunRouteContext,
  runRouteContextForwardedProps,
} from "./agent-ui-state.js";
export type {
  EngentyDebugInitialPromptPayload,
  RecalledMessagePointer,
} from "./engenty-debug-initial-prompt.js";
export {
  ENGENTY_DEBUG_INITIAL_PROMPT_EVENT,
  historySpeakerKey,
  RECALLED_MESSAGE_PREVIEW_CHARS,
  readEngentyDebugInitialPrompt,
  readEngentyDebugInitialPromptEventValue,
} from "./engenty-debug-initial-prompt.js";
export type {
  EngentyEffortResolvedPayload,
  EngentyResolvedEffort,
} from "./engenty-effort-resolved.js";
export {
  ENGENTY_EFFORT_RESOLVED_EVENT,
  readEngentyEffortResolvedEventValue,
} from "./engenty-effort-resolved.js";
export type {
  AgUiOpenInterruptKind,
  AgUiOpenInterruptMetadata,
} from "./engenty-open-interrupt.js";
export {
  AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS,
  AG_UI_FRONTEND_TOOL_INTERRUPT_TTL_MS,
  AG_UI_OPEN_INTERRUPT_DEFAULT_TTL_MS,
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  agUiOpenInterruptTtlMsForKind,
  buildAgUiOpenInterruptExpiresAt,
  buildFrontendToolOpenInterrupt,
  buildSandboxCommandOpenInterrupt,
  ENGENTY_OPEN_INTERRUPT_EVENT,
  isAgUiOpenInterruptExpired,
  isDecisionOpenInterrupt,
  isFeedbackOpenInterrupt,
  isFrontendToolOpenInterrupt,
  isSandboxCommandOpenInterrupt,
  readAgUiOpenInterrupt,
  readAgUiOpenInterruptEventValue,
} from "./engenty-open-interrupt.js";
export type { EngentyUsageUpdatePayload } from "./engenty-usage-update.js";
export {
  ENGENTY_USAGE_UPDATE_EVENT,
  readEngentyUsageUpdateEventValue,
  sumEngentyUsageUpdateTokens,
} from "./engenty-usage-update.js";
export type {
  AgentUiContextLike,
  AgentUiRunContext,
  CreateFrontendToolDefinitionInput,
  EngentyFrontendToolMetadata,
  FrontendToolAvailability,
  FrontendToolCallRequest,
  FrontendToolCallResult,
  FrontendToolDefinition,
} from "./frontend-tools.js";
export {
  createFrontendToolDefinition,
  isAgentUiRunContext,
  isFrontendToolCallResult,
  isFrontendToolDefinition,
  toAgUiTool,
} from "./frontend-tools.js";
export type {
  JsonPatchOperation,
  JsonPrimitive,
  JsonValue,
} from "./json-value.js";
export type { LedgerMarkupPart } from "./ledger-markup.js";
export {
  isLedgerMetaLine,
  ledgerTagTone,
  ledgerTextAsCode,
  ledgerTextAsMarkdown,
  parseLedgerMarkup,
  splitLedgerDetail,
  unwrapLedgerText,
} from "./ledger-markup.js";
export type { ResumableHttpAgentConfig } from "./resumable-http-agent.js";
export { ResumableHttpAgent } from "./resumable-http-agent.js";
export type {
  RunLlmCall,
  RunTokenUsageEntry,
  RunTraceStats,
} from "./run-trace.js";
export {
  buildRunLlmCalls,
  readRunFinishedUsage,
  runTraceStats,
} from "./run-trace.js";
export type {
  TrajectoryGanttLane,
  TrajectoryGanttModel,
  TrajectoryGanttSectionLabel,
  TrajectoryGanttSpan,
  TrajectoryGanttTurnBoundary,
} from "./run-trace-gantt.js";
export {
  deriveTrajectoryGantt,
  GANTT_LABEL_ROW_PX,
  GANTT_LANE_COUNT,
  GANTT_LANE_PAD_PX,
  GANTT_LANE_PITCH_PX,
  ganttLaneFor,
  trajectoryRowAnchorId,
} from "./run-trace-gantt.js";
export type {
  SessionGanttBand,
  SessionGanttModel,
  SessionGanttSpan,
  SessionTurnInput,
  SessionTurnNode,
} from "./session-gantt.js";
export {
  deriveSessionGantt,
  nestSessionTurns,
} from "./session-gantt.js";
export type {
  RunEventRecordLike,
  TrajectoryCellKind,
  TrajectoryRow,
  TrajectorySpeechMessage,
} from "./trajectory.js";
export {
  buildInspectorTrajectory,
  runEventRecordsToAgUi,
  SYSTEM_INSTRUCTIONS_NOT_CAPTURED,
  trajectoryRowKeyPreview,
  trajectoryTranscript,
} from "./trajectory.js";
export { getFrontendToolInputValidationError } from "./validate-frontend-tool-input.js";
export type {
  JsonHighlightToken,
  JsonHighlightTokenKind,
} from "./wire-json.js";
export {
  formatWireJson,
  reviveJsonStrings,
  tokenizeJson,
} from "./wire-json.js";
export type { EngentyFrontendToolSpec } from "./zod-frontend-tool.js";
export {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "./zod-frontend-tool.js";
