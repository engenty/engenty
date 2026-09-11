import type { AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import { streamText } from "ai";

import { DEFAULT_AI_CHAT_MODEL_GATEWAY_ID } from "../config/models.js";
import {
  createRoutineStore,
  type RoutineStore,
} from "../dal/routines/routine-store.js";
import {
  createRoutineTriggerStore,
  type RoutineTriggerStore,
} from "../dal/routines/routine-trigger-store.js";
import {
  type AgentRunStore,
  createAgentRunStore,
  createThreadStore,
  type ThreadStore,
} from "../dal/threads/index.js";
import {
  createWorkflowRunStore,
  type WorkflowRunStore,
} from "../dal/workflow-runs/workflow-run-store.js";
import {
  createWorkflowStore,
  type WorkflowStore,
} from "../dal/workflows/index.js";

export { createArtifactStoreFromEnv } from "../dal/artifacts/index.js";
export { createDataTableStoreFromEnv } from "../dal/data-tables/index.js";

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
import { createDbSourceFromEnv } from "../infra/tenant-db.js";
import type { AiRegistry } from "./registry/index.js";
import {
  type AiSessionScope,
  createThreadService,
  type ThreadService,
  type ThreadServiceOptions,
} from "./sessions.js";

export { createDefaultAiRegistry } from "./agents.js";
export { ENGENTY_STREAM_UNTIL_IDLE_MAX_IDLE_MS } from "./background-tasks.js";
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
  type AgentStateSessionStore,
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
  ThreadService,
} from "./sessions.js";
export {
  createTenantModelConfigResolverFromEnv,
  type TenantModelConfigResolver,
} from "./tenant-model-config.js";
export {
  createEngentyAgentWorkspace,
  type EngentyWorkspaceAgentConfig,
  type EngentyWorkspaceRuntimeSpec,
  initEngentyAgentWorkspace,
} from "./workspace/index.js";

export interface AiServiceOptions {
  createRegistry?: (scope: AiSessionScope) => AiRegistry;
  getRunStore?: () => AgentRunStore | null;
  getStore: () => ThreadStore | null;
  getUsageStore?: () => AiUsageStore | null;
  mastra: Mastra;
  registry?: AiRegistry;
  resolveTenantModelConfig?: ThreadServiceOptions["resolveTenantModelConfig"];
}

export interface AiService {
  mastra: Mastra;
  streamPing: () => ReturnType<typeof streamText>;
  threads: ThreadService;
}

export function createAiService(opts: AiServiceOptions): AiService {
  return {
    mastra: opts.mastra,
    threads: createThreadService({
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

// Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): the env factories hand
// the stores BOTH lanes — tenant-keyed methods mint tenant-locked handles per
// call; each store's documented residuals keep the service client.
export function createThreadStoreFromEnv(): ThreadStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createThreadStore(source);
}

export function createAgentRunStoreFromEnv(): AgentRunStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createAgentRunStore(source);
}

// Phase A: retrieval runs tenant-locked when the lane is configured —
// search.source_visibility gained a read-only engenty_server policy
// (20260809240000), so query_chunks (SECURITY INVOKER) evaluates fully under
// RLS and p_tenant_id can only narrow. The plain-client path remains for
// no-lane dev bootstraps.
export function createChatSearchRetrievalFromEnv(): ChatSearchRetrieval | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  const source = createDbSourceFromEnv();
  return createChatSearchRetrieval({
    supabase: client,
    ...(source
      ? {
          retrievalDb: {
            getDb: (auth: { tenantId: string }) => source.getTenantDb(auth),
            serviceDb: source.serviceDb,
          },
        }
      : {}),
  });
}

export function createAiUsageStoreFromEnv(): AiUsageStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createAiUsageStore(source);
}

export function createRegistryStoreFromEnv(): RegistryStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createRegistryStore(source);
}

export function createWorkflowRunStoreFromEnv(): WorkflowRunStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createWorkflowRunStore(source);
}

export function createRoutineStoreFromEnv(): RoutineStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createRoutineStore(source);
}

export function createRoutineTriggerStoreFromEnv(): RoutineTriggerStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createRoutineTriggerStore(source);
}

export function createWorkflowStoreFromEnv(): WorkflowStore | null {
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    return null;
  }
  return createWorkflowStore(client);
}
