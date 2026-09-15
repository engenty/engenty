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
  formatAgentUiStateHarnessInstructions,
  resolveCurrentPageModule,
  resolveCurrentPageSpaceKey,
} from "./agent-ui/agent-prompt-context-from-ui.js";
export {
  filterAgentUiFrontendToolsByTenant,
  stripModuleOwnedAgentUiFrontendTools,
} from "./agent-ui/agent-ui-frontend-tool-gating.js";
export { SPACE_CONTRACT_PROMPT } from "./agent-ui/space-contract-prompt.js";
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
export {
  type CopilotAgentManifest,
  copilotAgentManifestSchema,
} from "./agents/copilot-agent-manifest.js";
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
} from "./agents/hire-floor.js";
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
export {
  configuredModelGateways,
  gatewayApiKeyEnvName,
  hasAnyModelGatewayApiKey,
  readAiGatewayApiKeyFromEnv,
  readGatewayApiKeyFromEnv,
  readOpenRouterApiKeyFromEnv,
} from "./config/ai-gateway-api-key.js";
export { isCapableAgentModel } from "./config/capable-agent-model.js";
export {
  type ChatModelResolutionPurpose,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_LOW_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
  type ResolveChatModelIdOptions,
  type ResolveSafeguardModelIdOptions,
  resolveChatModelId,
  resolveSafeguardModelId,
} from "./config/chat-model-id.js";
export {
  gatewayLanguageModel,
  installGatewayAwareDefaultProvider,
  OPPER_COMPAT_BASE_URL,
  openRouterLanguageModel,
  resetGatewayAwareDefaultProviderForTests,
  UnconfiguredModelGatewayError,
} from "./config/gateway-provider.js";
export { withLlmTrace } from "./config/llm-trace.js";
export {
  BINDING_PACK_GATEWAY_PREFERENCE,
  bindingPackFor,
  gatewayIdFromApiKeyEnvName,
  isStockPlatformBindings,
  listBindingPacks,
  type ModelBindingPack,
  type StockBinding,
  seedGatewayFromEnv,
} from "./config/model-binding-packs.js";
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
export type {
  AgentSessionStatus,
  AiRegistration,
  InstructionDocumentDefinition,
  ModelRoleDefinition,
  RoutineDefinition,
  SkillDefinition,
  WorkflowDefinition,
  WorkflowGraphDefinition,
} from "./contracts.js";
export type { TriggerDefinition } from "./copilot-trigger-contracts.js";
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
  type TableColumnWire,
  type TextStyle,
  tableColumnsSchema,
  tableColumnsWireSchema,
  textColumnStyle,
} from "./data-tables/index.js";
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
  type AgentModelPurpose,
  type AgentResolveContext,
  type AgentToolGatingConfig,
  type AgentWorkspaceConfig,
  type AgentWorkspaceMount,
  type AiCapabilitySource,
  type AiRegistry,
  type AiRegistryProvider,
  agentBackgroundConfigSchema,
  agentConfigSchema,
  agentGuardrailsConfigSchema,
  agentLimitsConfigSchema,
  agentToolGatingConfigSchema,
  agentWorkspaceConfigSchema,
  agentWorkspaceSandboxSchema,
  applyWorkerSandboxDefault,
  COMPUTER_NETWORK_TIERS,
  type ComputerNetworkTier,
  type DynamicAiModuleCapability,
  type DynamicAiModuleCapabilityLoader,
  type MastraToolDefinition,
  parseComputerNetworkTier,
  type ToolConfig,
  toolConfigSchema,
  WORKER_SANDBOX_DEFAULT,
} from "./dynamic-contracts.js";
export type { EmailContactExtraction } from "./extract/email-contact.js";
export { extractEmailContactInfo } from "./extract/email-contact.js";
export {
  type AgentFn,
  type AgentFnDescriptor,
  type AgentRenderContext,
  createHookStateStore,
  guardedTool,
  type HookStateStore,
  isRendering,
  RENDERED_TOOLS,
  renderAgentFn,
  renderedToolsOf,
  type ThreadStateSetter,
  useGuardrails,
  useInstruction,
  useLimits,
  useMachine,
  useModel,
  usePurpose,
  useRegisteredTool,
  useSkillHint,
  useSubagent,
  useThreadState,
  useTool,
  useWorkspace,
} from "./hooks/index.js";
export type { InboundRoutingContext } from "./inbound-contracts.js";
export {
  type AgentLayeredPromptInput,
  buildAgentLayeredPrompt,
} from "./instructions/compose-agent-prompt.js";
export {
  copilotAgentAssetLocator,
  readCopilotAgentsMarkdown,
  readCopilotInstructionFile,
  readCopilotSkillsMarkdown,
  readCopilotSoulMarkdown,
  resolveCopilotAgentDir,
} from "./instructions/copilot-seed-files.js";
export {
  createEngentyCopilotInstructionDocuments,
  ENGENTY_COPILOT_AGENTS_KEY,
  ENGENTY_COPILOT_SKILLS_KEY,
  ENGENTY_COPILOT_SOUL_KEY,
  listRegisteredInstructionDocuments,
  resolveRegisteredInstructionDocumentByKey,
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
export type { ModuleDynamicCapabilitySeed } from "./registry.js";
export {
  listActiveAiRegistrations,
  listModuleDynamicCapabilitySeeds,
  listRegisteredChatCommands,
  listRegisteredModelRoles,
  listRegisteredRoutines,
  listRegisteredWorkflows,
  registerAiRegistration,
  resolveRoutineDefinitionById,
  resolveSkillDefinitionById,
  resolveWorkflowDefinitionById,
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
  DECISION_RESUME_PREFIXES,
  type RequestDecisionArtifact,
  type RequestDecisionInput,
  type RequestDecisionToolDefinition,
  readDecisionResumeAnswer,
  requestDecisionChoiceSchema,
  requestDecisionInputSchema,
  requestDecisionToolDefinition,
} from "./tools/request-decision-tool.js";
export {
  buildRequestFeedbackTool,
  buildRequestFeedbackToolDefinition,
  createRequestFeedbackArtifact,
  isRequestFeedbackUnavailable,
  NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE,
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
export {
  forwardSpaceOnGatewayCall,
  type ToolExecutionContext,
} from "./tools/types.js";
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
export {
  type AutoEffortConfidence,
  type AutoEffortGuess,
  agentDefaultEffort,
  type GuessEffortFromPromptInput,
  guessEffortFromPrompt,
} from "./usage/auto-effort-guess.js";
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
export {
  loadModuleWorkflowsFromDirectory,
  toWorkflowDefinition,
  workflowBrief,
} from "./workflows/loader.js";
