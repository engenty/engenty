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
export { buildAppNavigationPathsPromptSection } from "./agent-ui/app-navigation-paths-prompt.js";
export { GENERAL_CHAT_AGENT_ID } from "./agents/copilot-constants.js";
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
export {
  type ChatModelResolutionPurpose,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
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
export type {
  AgentConfig,
  AgentGuardrailsConfig,
  AgentLimitsConfig,
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
  type AiCapsConfig,
  type DocConverterTenantPrefs,
  parseTenantAiSettings,
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
