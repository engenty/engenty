import type { AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import { streamText } from "ai";

import { DEFAULT_AI_CHAT_MODEL_GATEWAY_ID } from "../config/models.js";
import {
  type ActionRequestStore,
  createActionRequestStore,
} from "../dal/action-requests/action-request-store.js";
import {
  type AgentRunStore,
  type AgentSessionStore,
  createAgentRunStore,
  createAgentSessionStore,
} from "../dal/agent-sessions/index.js";

export { createArtifactStoreFromEnv } from "../dal/artifacts/index.js";

import {
  type ChatSearchRetrieval,
  createChatSearchRetrieval,
} from "../dal/chat-search/index.js";
import {
  createRegistryStore,
  type RegistryStore,
} from "../dal/registry/index.js";
import { createAiUsageStore } from "../dal/usage/index.js";
import { createAiDatabaseAdapter } from "../infra/database.js";
import type { AiRegistry } from "./registry/index.js";
import {
  type AiSessionScope,
  createSessionService,
  type SessionService,
  type SessionServiceOptions,
} from "./sessions.js";

export {
  assembleDynamicHarnessAgent,
  createDefaultAiRegistry,
} from "./agents.js";
export { ENGENTY_STREAM_UNTIL_IDLE_MAX_IDLE_MS } from "./background-tasks.js";
export type {
  ExternalChannelInteraction,
  ExternalChannelInteractionResult,
  ExternalChannelToolApprovalAction,
  ExternalChannelToolApprovalResult,
} from "./channel-interactions.js";
export {
  handleExternalChannelToolApprovalInteraction,
  normalizeExternalChannelInteraction,
} from "./channel-interactions.js";
export type {
  ExternalChannelFetch,
  ExternalChannelOutboundInput,
  ExternalChannelOutboundResult,
  ExternalChannelOutboundSender,
} from "./channel-outbound.js";
export {
  createHttpExternalChannelOutboundSender,
  createNoopExternalChannelOutboundSender,
  sendExternalChannelReply,
} from "./channel-outbound.js";
export type {
  ExternalChannelConfig,
  ExternalChannelIngressEvent,
  ExternalChannelMultimodalConfig,
  ExternalChannelOutboundMode,
  ExternalChannelProvider,
  ExternalChannelProviderConfig,
  ExternalChannelVerificationMode,
} from "./channels.js";
export {
  createExternalChannelConfigFromEnv,
  EXTERNAL_CHANNEL_PROVIDERS,
  isExternalChannelProvider,
  normalizeExternalChannelIngress,
} from "./channels.js";
export type { EngentyWorkspaceContext } from "./core-http-client.js";
export {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "./core-http-client.js";
export type { AiSessionErrorCode } from "./errors.js";
export { AiSessionError } from "./errors.js";
export type {
  EngentyMemoryIdentityInput,
  EngentyMemoryInvocationInput,
  EngentyNativeMemoryAgent,
  EngentySessionMemoryRuntimeInput,
  EngentySessionMemoryScope,
  EngentySessionMemoryStorageOptions,
} from "./memory/index.js";
export {
  assertEngentyNativeMastraMemoryConfigured,
  bindEngentyNativeMastraMemory,
  createEngentyAgentExecutionOptions,
  createEngentyMastraResourceId,
  createEngentyMastraThreadId,
  createEngentyMemoryInvocationOptions,
  createEngentyNativeMastraMemoryAgent,
  createEngentySessionMastraMemory,
  createEngentySessionMemoryRuntime,
  createEngentySessionMemoryStorage,
  EngentySessionMemoryStorage,
} from "./memory/index.js";
export {
  createCoreBackedModuleOperationInvoker,
  createDefaultModuleCapabilityLoader,
  type DynamicAiModuleCapabilityFactory,
  type DynamicAiModuleCapabilityFactoryContext,
  StaticDynamicAiModuleCapabilityLoader,
} from "./module-capability-loader.js";
export type {
  AgentConfig,
  AiCapabilitySource,
  AiRegistry,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./registry/index.js";
export {
  assembleDynamicAgent,
  BuiltinProvider,
  CompositeAiRegistry,
  createBuiltinProvider,
  createSessionAgentStateChannel,
  DatabaseProvider,
  type DynamicAiDatabaseStore,
  type DynamicAiModuleCapability,
  type DynamicAiModuleCapabilityLoader,
  FunctionAgentProvider,
  type FunctionAgentStateChannel,
  ModuleProvider,
} from "./registry/index.js";
export type {
  AiSessionScope,
  RuntimeModelConfigInput,
  SessionService,
} from "./sessions.js";
export {
  createTenantModelConfigResolverFromEnv,
  type TenantModelConfigResolver,
} from "./tenant-model-config.js";
export {
  assembleWorkspaceAgent,
  createEngentyAgentWorkspace,
  createWorkspaceAgentRecordSource,
  type EngentyWorkspaceAgentConfig,
  type EngentyWorkspaceRuntimeSpec,
  initEngentyAgentWorkspace,
  WorkspaceBackedAgentRegistry,
} from "./workspace/index.js";

export interface AiServiceOptions {
  createRegistry?: (scope: AiSessionScope) => AiRegistry;
  getRunStore?: () => AgentRunStore | null;
  getStore: () => AgentSessionStore | null;
  getUsageStore?: () => AiUsageStore | null;
  mastra: Mastra;
  registry?: AiRegistry;
  resolveTenantModelConfig?: SessionServiceOptions["resolveTenantModelConfig"];
}

export interface AiService {
  sessions: SessionService;
  streamPing: () => ReturnType<typeof streamText>;
}

export function createAiService(opts: AiServiceOptions): AiService {
  return {
    sessions: createSessionService({
      ...opts,
      getRunStore: opts.getRunStore ?? (() => null),
      getUsageStore: opts.getUsageStore ?? (() => null),
    }),
    streamPing: () =>
      streamText({
        model: DEFAULT_AI_CHAT_MODEL_GATEWAY_ID,
        prompt: "Reply with exactly the single word: pong",
        maxOutputTokens: 8,
      }),
  };
}

export function createAgentSessionStoreFromEnv(): AgentSessionStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createAgentSessionStore(client);
}

export function createAgentRunStoreFromEnv(): AgentRunStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createAgentRunStore(client);
}

export function createChatSearchRetrievalFromEnv(): ChatSearchRetrieval | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createChatSearchRetrieval({ supabase: client });
}

export function createAiUsageStoreFromEnv(): AiUsageStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createAiUsageStore(client);
}

export function createRegistryStoreFromEnv(): RegistryStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createRegistryStore(client);
}

export function createActionRequestStoreFromEnv(): ActionRequestStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createActionRequestStore(client);
}
