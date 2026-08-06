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
  assertAgentUiStateSnapshotWithinLimit,
  getAgentUiStateSnapshotByteLength,
  isAgentUiStateSnapshotV1,
} from "./agent-ui-state.js";
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
export { getFrontendToolInputValidationError } from "./validate-frontend-tool-input.js";
export type { EngentyFrontendToolSpec } from "./zod-frontend-tool.js";
export {
  buildFrontendToolDefinitionFromZod,
  defineFrontendToolSpec,
} from "./zod-frontend-tool.js";
