/// <reference path="./md.d.ts" />

/**
 * @engenty/ai-core – module AI registration, dynamic-agent contracts, Mastra tools, usage, AG-UI helpers.
 *
 * **Browser / Vite:** import from `@engenty/ai-core/browser` — the main entry pulls Node-only code (`fs`).
 *
 * See packages/ai-core/README.md for layout and diagrams; packages/ai-core/docs/ for how-tos (hub: docs/README.md).
 */

export {
  CHAT_THREAD_INDEX_STATUS_ARTIFACT_ID,
  type ChatThreadIndexStatusPayload,
  chatThreadIndexStatusPayloadSchema,
} from "../ai/artifacts/chat-thread-index-status.js";
export {
  type ActionSchemaReferenceMap,
  loadActionDefinitionsFromDirectory,
  resolveModuleActionsDir,
} from "./actions/loader.js";
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
export {
  buildAgUiMessagesFromMastraUiMessages,
  type MastraUiMessage,
  type MastraUiMessagePart,
} from "./ag-ui/mastra-ui-projection.js";
export {
  buildAgentSystemPromptFromUiState,
  formatAgentUiStateHarnessInstructions,
  resolveCurrentPageModule,
} from "./agent-ui/agent-prompt-context-from-ui.js";
export {
  filterAgentUiFrontendToolsByTenant,
  stripModuleOwnedAgentUiFrontendTools,
} from "./agent-ui/agent-ui-frontend-tool-gating.js";
export type {
  AgentAssetLocator,
  AiAgentManifest,
} from "./agents/agent-manifest.js";
export {
  aiAgentManifestSchema,
  loadAgentManifest,
  readAgentJsonAsset,
  readAgentTextAsset,
  resolveAgentAssetDir,
} from "./agents/agent-manifest.js";
export {
  type CopilotAgentManifest,
  copilotAgentManifestSchema,
} from "./agents/copilot-agent-manifest.js";
export { GENERAL_CHAT_AGENT_ID } from "./agents/copilot-constants.js";
export {
  composeAllowedToolsIntersection,
  normalizeAllowedToolsInput,
} from "./allowed-tools.js";
export {
  createFieldSuggestionsArtifact,
  FIELD_SUGGESTIONS_ARTIFACT_TYPE,
  type FieldSuggestion,
  type FieldSuggestionCandidate,
  type FieldSuggestionsArtifactCreatedValue,
  type FieldSuggestionsArtifactDefinition,
  type FieldSuggestionsToolOutput,
  fieldSuggestionCandidateSchema,
  fieldSuggestionSchema,
  fieldSuggestionsPayloadSchema,
  fieldSuggestionsToolOutputToCreatedValue,
  parseFieldSuggestionsArtifactCreatedValue,
} from "./artifacts/field-suggestions.js";
export {
  TranscribeGatewayAudioError,
  type TranscribeGatewayAudioOptions,
  transcribeGatewayAudio,
} from "./audio/transcribe-gateway-audio.js";
export {
  type ChatCommandArg,
  type ChatCommandDefinition,
  type ChatCommandKind,
  expandChatCommand,
  isValidChatCommandToken,
  parseLeadingChatCommand,
} from "./chat-commands/contracts.js";
export { loadChatCommandDefinitionsFromDirectory } from "./chat-commands/loader.js";
export { readAiGatewayApiKeyFromEnv } from "./config/ai-gateway-api-key.js";
export {
  type ChatModelResolutionPurpose,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
  type ResolveChatModelIdOptions,
  type ResolveSafeguardModelIdOptions,
  resolveChatModelId,
  resolveSafeguardModelId,
} from "./config/chat-model-id.js";
export {
  AI_MODEL_PURPOSE_SPECS,
  AI_MODEL_PURPOSES,
  type AiModelPurpose,
  type AiSettingSource,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  type ResolvedModel,
  type ResolvePurposeModelOptions,
  resolvePurposeModel,
  resolvePurposeModelId,
} from "./config/model-purposes.js";
export type {
  ActionDefinition,
  AgentDefinition,
  AgentSessionStatus,
  AiRegistration,
  InstructionDocumentDefinition,
  RoutineDefinition,
  RoutineTarget,
  RoutineTargetKind,
  RoutineTaskTemplate,
  SkillDefinition,
} from "./contracts.js";
export type { TriggerDefinition } from "./copilot-trigger-contracts.js";
export {
  type AgentConfigOverride,
  type DefineModuleAiOptions,
  defineModuleAi,
  type ModuleAi,
} from "./define-module-ai.js";
export {
  type AgentConfig,
  type AgentGuardrailsConfig,
  type AgentLimitsConfig,
  type AgentToolProfile,
  type AgentWorkspaceConfig,
  type AgentWorkspaceMount,
  type AiCapabilitySource,
  type AiRegistry,
  type AiRegistryProvider,
  agentBackgroundConfigSchema,
  agentConfigSchema,
  agentGuardrailsConfigSchema,
  agentLimitsConfigSchema,
  agentToolProfileSchema,
  agentWorkspaceConfigSchema,
  type DynamicAiModuleCapability,
  type DynamicAiModuleCapabilityLoader,
  type MastraToolDefinition,
  type ModuleActionCapability,
  type ToolConfig,
  toModuleActionCapability,
  toolConfigSchema,
} from "./dynamic-contracts.js";
export type { EmailContactExtraction } from "./extract/email-contact.js";
export { extractEmailContactInfo } from "./extract/email-contact.js";
export type { InboundRoutingContext } from "./inbound-contracts.js";
export {
  type AgentLayeredPromptInput,
  buildAgentLayeredPrompt,
} from "./instructions/compose-agent-prompt.js";
export {
  createEngentyCopilotInstructionDocuments,
  ENGENTY_COPILOT_AGENTS_KEY,
  ENGENTY_COPILOT_SOUL_KEY,
} from "./instructions/registry.js";
export {
  type ResolvedCopilotPromptLayers,
  resolveCopilotPromptLayers,
} from "./instructions/resolver.js";
export {
  type AiDebugLogger,
  type AiGenerationResultDebug,
  isAiDebugEnabled,
  logAiGenerationResult,
  logAiLoopTrace,
  logAiPromptInput,
  withAiErrorDebug,
} from "./lib/debug.js";
export {
  type SupportedModel,
  type SupportedModelsData,
  supportedModels,
} from "./models/supported.js";
export {
  type SupportedEmbeddingModel,
  type SupportedEmbeddingModelsData,
  supportedEmbeddingModels,
} from "./models/supported-embeddings.js";
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
export type { ModuleDynamicCapabilitySeed } from "./registry.js";
export {
  listActiveAiRegistrations,
  listModuleDynamicCapabilitySeeds,
  listRegisteredActions,
  listRegisteredChatCommands,
  listRegisteredRoutines,
  registerAiRegistration,
  resolveActionDefinitionById,
  resolveAgentDefinitionById,
  resolveRoutineDefinitionById,
  resolveSkillDefinitionById,
  unregisterAiRegistration,
  unregisterAiRegistrationsByOwner,
} from "./registry.js";
export { isAgentThreadId } from "./runtime/agent-thread-id.js";
export {
  type ParallelTaskResult,
  type ParallelTaskSpec,
  runParallelTasks,
} from "./runtime/parallel-tasks.js";
export {
  AGENT_SKILL_NAME_MAX_LENGTH,
  AGENT_SKILL_NAME_POSTGRES_PATTERN,
  assertValidAgentSkillName,
  isValidAgentSkillName,
} from "./skill-name.js";
export {
  loadSkillDefinitionsFromDirectory,
  resolveModuleSkillsDir,
} from "./skills/loader.js";
export {
  type AiCapsConfig,
  type DocConverterTenantPrefs,
  parseTenantAiSettings,
  type RealtimeVoiceTenantPrefs,
  TENANT_AI_CONFIG_KEY,
  type TenantAiSettings,
} from "./tenant-ai-settings.js";
export {
  configureThreadStore,
  getThreadStore,
  type ThreadStore,
} from "./threads/store.js";
export {
  type AiChatsSearchInput,
  aiChatsSearchInputSchema,
  buildChatThreadSearchTool,
  buildMastraChatThreadSearchTool,
  CHAT_THREAD_INDEX_HEALTH_METHOD,
  CHAT_THREAD_SEARCH_METHOD,
  CHAT_THREAD_SEARCH_TOOL_ID,
  type ChatThreadIndexHealthInput,
  type ChatThreadSearchToolDefinition,
  chatThreadIndexHealthInputSchema,
} from "./tools/chat-thread-search-tool.js";
export {
  buildConvertImageTool,
  CONVERT_IMAGE_TOOL_ID,
  type ConvertImageError,
  type ConvertImageInput,
  type ConvertImageResult,
  type ConvertImageToolDefinition,
  convertImageInputSchema,
  runConvertImage,
} from "./tools/convert-image.js";
export {
  type BuildEngentyApiToolParams,
  buildEngentyApiTool,
  ENGENTY_API_REQUEST_SCOPE_KEY,
  type EngentyApiRequestFn,
  engentyApiInputSchema,
} from "./tools/engenty-api.js";
export {
  buildEngentyApiCatalogTool,
  ENGENTY_API_CATALOG_TOOL_ID,
  type EngentyApiCatalogInput,
  type EngentyApiCatalogResult,
  engentyApiCatalogInputSchema,
  engentyApiCatalogMatchSchema,
  engentyApiCatalogResultSchema,
} from "./tools/engenty-api-catalog.js";
export {
  buildProposeUpdatesTool,
  createProposeUpdatesArtifact,
  type ProposeUpdatesArtifact,
  type ProposeUpdatesInput,
  type ProposeUpdatesToolDefinition,
  proposeUpdatesInputSchema,
  proposeUpdatesToolDefinition,
} from "./tools/propose-updates.js";
export {
  buildRequestDecisionTool,
  createRequestDecisionArtifact,
  type RequestDecisionArtifact,
  type RequestDecisionInput,
  type RequestDecisionToolDefinition,
  requestDecisionChoiceSchema,
  requestDecisionInputSchema,
  requestDecisionToolDefinition,
} from "./tools/request-decision-tool.js";
export {
  buildRequestFeedbackTool,
  createRequestFeedbackArtifact,
  type RequestFeedbackArtifact,
  type RequestFeedbackInput,
  type RequestFeedbackToolDefinition,
  requestFeedbackInputSchema,
  requestFeedbackToolDefinition,
} from "./tools/request-feedback-tool.js";
export {
  buildSetStateTool,
  type SetStateInput,
  type SetStateToolDefinition,
  type SetStateToolResult,
  setStateInputSchema,
  setStateToolDefinition,
} from "./tools/set-state-tool.js";
export type { ToolExecutionContext } from "./tools/types.js";
export {
  buildMastraWebSearchTool,
  runWebSearch,
  WEB_SEARCH_TOOL_ID,
  type WebSearchInput,
  type WebSearchResult,
  type WebSearchSource,
  type WebSearchToolDefinition,
  webSearchInputSchema,
  webSearchTool,
} from "./tools/web-search.js";
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
  type CheckUsageLimitsParams,
  checkUsageLimits,
  formatUsageLimitError,
  type UsageLimitDecision,
  type UsageLimitErrorBody,
  type UsageLimitScope,
  type UsageLimitType,
} from "./usage/limit-check.js";
export {
  type ResolvedPeriod,
  resolveCurrentPeriod,
} from "./usage/period.js";
export {
  computeUsageCost,
  type RecordAiUsageInput,
  type ResolvedUsageCost,
  recordAiUsage,
} from "./usage/record.js";
export {
  DEFAULT_MODEL_PRICING_SEEDS,
  FALLBACK_MODEL_PRICING,
  type ModelPricingSeed,
} from "./usage/seed-pricing.js";
export {
  type AiUsageStore,
  configureAiUsageStore,
  getAiUsageStore,
  type PeriodTotalsBumpInput,
  type UsageEventInsert,
} from "./usage/store.js";
