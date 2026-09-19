/**
 * Minimal surface for React/Vite clients — no Node built-ins.
 * Prefer this over `@engenty/ai-core` in browser code; the main entry pulls server-only modules.
 */

export {
  encodeAgUiSseEvent,
  frontendToolCallToAgUiEvents,
  frontendToolResultToAgUiEvent,
  runtimeProgressToAgUiEvent,
  stateDeltaToAgUiEvent,
  stateSnapshotToAgUiEvent,
} from "./ag-ui/ag-ui-event-adapter.js";
export {
  agUiMessageText,
  buildAgUiMessagesFromSessionMessages,
  buildAgUiMessagesFromThreadMessages,
  normalizeAgUiMessageForPersistence,
  type PersistedAgUiSessionMessageRecord,
  type PersistedAgUiThreadMessageRecord,
  readAgUiMessageCreatedAt,
  sortAgUiMessagesForTranscript,
  sortPersistedAgUiSessionMessageRecords,
  sortPersistedAgUiThreadMessageRecords,
} from "./ag-ui/ag-ui-messages.js";
export { isToolApprovalResumeNudgeText } from "./ag-ui/tool-approval-resume-nudge.js";
export {
  AGENT_DESK_LANES,
  type AgentDeskAgent,
  type AgentDeskCapabilityChip,
  type AgentDeskEngagement,
  type AgentDeskEngagementKind,
  type AgentDeskFeed,
  type AgentDeskLane,
  type AgentDeskLaneCounts,
  type AgentDeskStarter,
  agentDeskCapabilityChips,
  emptyAgentDeskLaneCounts,
  formatAgentDeskCapabilityLabel,
} from "./agent-desk/contracts.js";
export {
  AGENT_DESK_CONVERSATION_PREFIX,
  conversationEngagement,
  threadIdFromEngagement,
} from "./agent-ui/agent-desk-engagement.js";
export { formatAgentUiStateHarnessInstructions } from "./agent-ui/agent-prompt-context-from-ui.js";
export { buildAppNavigationPathsPromptSection } from "./agent-ui/app-navigation-paths-prompt.js";
export {
  canonicalModulePathname,
  isSpaceReservedSegment,
  SPACE_MODULE_URL_ALIASES,
  SPACE_RESERVED_SEGMENTS,
  spaceChatsPathname,
  spaceKeyFromPathname,
  spaceModuleIdFromUrlSegment,
  spaceModuleUrlSegment,
  spaceRoomPathname,
} from "./agent-ui/space-module-url.js";
export {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
  isAgentEngentyKind,
  resolveAgentEngenty,
} from "./agents/agent-engenty.js";
export {
  AGENT_ENGENTY_COLORS,
  AGENT_ENGENTY_LOOKS,
  type AgentEngentyLook,
  agentEngentyLook,
  parseAgentEngentyKind,
  type SuggestAgentLookInput,
  type SuggestedAgentLook,
  suggestAgentLook,
} from "./agents/agent-look.js";
export {
  buildAgentLookImagePrompt,
  buildAgentLookSvgPrompt,
  DEFAULT_AGENT_LOOK_IMAGE_MODEL,
  DEFAULT_AGENT_LOOK_SVG_MODEL,
} from "./agents/agent-look-prompt.js";
export {
  type AgentMessageHeader,
  formatAgentMessageHeader,
  parseAgentMessageHeader,
} from "./agents/agent-message-header.js";
export {
  AGENT_STARTER_DECLARE_MAX,
  AGENT_STARTER_MAX,
  AGENT_STARTER_WHAT_CAN_YOU_DO_ID,
  type AgentStarter,
  type AgentStarterCondition,
  type AgentStarterContext,
  agentStarterSchema,
  mergeGeneratedStarters,
  type ResolvedAgentStarter,
  selectAgentDeskStarters,
} from "./agents/agent-starters.js";
export { GENERAL_CHAT_AGENT_ID } from "./agents/copilot-constants.js";
export {
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TEMPLATE_ID,
  FIRST_ENGENTY_TOOL_IDS,
} from "./agents/first-engenty.js";
export {
  LIVE_HIRE_ATTACHED_TOOL_IDS,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
  SPECIALIST_TOOL_GATING,
} from "./agents/hire-floor.js";
export {
  createFieldSuggestionsArtifact,
  FIELD_SUGGESTIONS_ARTIFACT_TYPE,
  type FieldSuggestion,
  type FieldSuggestionCandidate,
  type FieldSuggestionsArtifactCreatedValue,
  type FieldSuggestionsToolOutput,
  fieldSuggestionCandidateSchema,
  fieldSuggestionSchema,
  fieldSuggestionsPayloadSchema,
  fieldSuggestionsToolOutputToCreatedValue,
  parseFieldSuggestionsArtifactCreatedValue,
} from "./artifacts/field-suggestions.js";
export { isCapableAgentModel } from "./config/capable-agent-model.js";
export {
  type ChatModelResolutionPurpose,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_LOW_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
  resolveChatModelId,
  resolveSafeguardModelId,
} from "./config/chat-model-id.js";
export {
  AI_MODEL_PURPOSES,
  type AiModelPurpose,
  type AiSettingSource,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  type ResolvedModel,
} from "./config/model-purposes.js";
export {
  ANTHROPIC_GATEWAY_ID,
  DEFAULT_MODEL_GATEWAY_ID,
  formatModelRef,
  gatewayOfRef,
  isNonDefaultGatewayRef,
  MODEL_GATEWAY_IDS,
  type ModelRef,
  modelIdOfRef,
  OPENAI_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPPER_GATEWAY_ID,
  parseModelRef,
  vendorModelId,
} from "./config/model-ref.js";
export {
  AI_EFFORT_LEVELS,
  AI_PLATFORM_ROLES,
  type AiEffort,
  type AiEffortChoice,
  type AiRoleSpec,
  bindingsFromList,
  effortOfRole,
  GRADED_ROLE_PREFIX,
  graded,
  type ModelBinding,
  type ModelBindings,
  mergeDeclaredRoles,
  PURPOSE_TO_ROLE,
  seedBindings,
} from "./config/model-roles.js";
export type { AgentSessionStatus } from "./contracts.js";
export {
  type ColumnEdit,
  coerceColumnValue,
  coerceRowValues,
  columnEdit,
  DATA_TABLE_ARTIFACT_TYPE,
  DATA_TABLE_MIME_TYPE,
  type DataTableHandle,
  dataTableHandleSchema,
  formatTableCell,
  mergeRowValues,
  parseTableColumns,
  type TableColumn,
  TableColumnValueError,
  type TextStyle,
  tableColumnsSchema,
  textColumnStyle,
} from "./data-tables/index.js";
export type {
  AgentConfig,
  AgentGuardrailsConfig,
  AgentLimitsConfig,
} from "./dynamic-contracts.js";
export {
  COMPUTER_NETWORK_TIERS,
  type ComputerNetworkTier,
  parseComputerNetworkTier,
} from "./dynamic-contracts.js";
export type {
  SupportedModel,
  SupportedModelsData,
} from "./models/supported.js";
export { supportedModels } from "./models/supported.js";
export type {
  SupportedEmbeddingModel,
  SupportedEmbeddingModelsData,
} from "./models/supported-embeddings.js";
export { supportedEmbeddingModels } from "./models/supported-embeddings.js";
export {
  type A2uiRenderMeta,
  readA2uiRenderMeta,
} from "./objects/a2ui-render.js";
export {
  formatObjectRef,
  type ObjectDisplayHint,
  type ObjectDisplayItem,
  type ObjectRef,
  type ObjectRenderMeta,
  objectRefTypeKey,
  parseObjectRef,
  readObjectRenderMeta,
} from "./objects/object-ref.js";
export {
  type CascadeClientMessage,
  type CascadeServerMessage,
  type CascadeToolCall,
  parseCascadeMessage,
} from "./realtime/cascade-protocol.js";
export {
  composeVoiceInstructions,
  type VoiceRegister,
  voiceRegisterInstructions,
} from "./realtime/locale-register.js";
export {
  type LegacyRealtimeProviderId,
  normalizeRealtimeProviderId,
  type RealtimeProviderId,
  type RealtimeServerCascadeSession,
  type RealtimeSessionDescriptor,
  RealtimeSessionError,
  type RealtimeSessionRequest,
  type RealtimeSessionScope,
  type RealtimeVoiceProvider,
  type RealtimeVoiceTenantPrefs,
  type RealtimeWebRtcDirectSession,
} from "./realtime/provider.js";
export { isAgentThreadId } from "./runtime/agent-thread-id.js";
export {
  AGENT_SKILL_NAME_MAX_LENGTH,
  isValidAgentSkillName,
} from "./skill-name.js";
export {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  type AgentApprovalTenantPrefs,
  type AiCapsConfig,
  type BrowserParseProvider,
  type DocConverterTenantPrefs,
  parseAgentApprovalMode,
  parseTenantAiSettings,
  resolveBrowserParse,
  TENANT_AI_CONFIG_KEY,
  type TenantAiSettings,
} from "./tenant-ai-settings.js";
export {
  type ProposeUpdatesArtifact,
  type ProposeUpdatesInput,
  proposeUpdatesInputSchema,
  proposeUpdatesToolDefinition,
} from "./tools/propose-updates.js";
// Browser-safe on purpose: the copilot transcript has to read a resolved
// chooser's answer back out of the model-facing resume sentence, which is all
// that survives of it in storage.
export {
  DECISION_RESUME_PREFIXES,
  readDecisionResumeAnswer,
} from "./tools/request-decision-tool.js";
export type {
  ModelPricingRecord,
  TenantUsagePolicyRecord,
  UsageEnforcementMode,
  UsageEventRecord,
  UsageFeature,
  UsagePeriodMode,
  UsagePeriodTotalRecord,
  UsagePeriodUnit,
  UsageTokenInput,
  UserUsagePolicyRecord,
} from "./usage/contracts.js";
export {
  DEFAULT_TENANT_USAGE_POLICY,
  TENANT_AGGREGATE_USER_ID,
} from "./usage/contracts.js";
export {
  ceilingEffort,
  clampEffort,
  type EffortGrant,
  isEffortAllowed,
  isEffortUnrestricted,
} from "./usage/effort-grants.js";
export type {
  UsageLimitErrorBody,
  UsageLimitScope,
  UsageLimitType,
} from "./usage/limit-check.js";
export {
  canonicalModelId,
  firstAllowedModelId,
  isModelAllowed,
  isUnrestricted,
  type ModelAllowList,
  providerOfModelId,
} from "./usage/model-allow-list.js";
export {
  type ResolvedPeriod,
  resolveCurrentPeriod,
} from "./usage/period.js";
