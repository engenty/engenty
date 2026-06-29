import type {
  AGUIEvent,
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
  FrontendToolDefinition,
  Message,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import type { AiUsageStore } from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type {
  AgentSessionStatus,
  AgentSessionStore,
  SessionMessageRole,
} from "../../dal/agent-sessions/index.js";
import type {
  AiRegistry,
  AssembleDynamicAgentOptions,
  assembleDynamicAgent,
} from "../registry/index.js";
import type { SessionRunTracker } from "./run-tracking.js";
import type { AssistantDynamicToolPart } from "./transcript.js";

export interface AiSessionScope {
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
  tenantId: string;
  tenantRole?: "admin" | "member" | null;
  userAccessToken?: string;
  userId: string;
}

export interface CreateAiSessionInput {
  agentId: string;
  routeContext?: Record<string, unknown>;
  scope: AiSessionScope;
  sessionKey?: string | null;
  status?: AgentSessionStatus;
  summary?: string | null;
  threadId?: string | null;
  title?: string | null;
  workspaceKey?: string | null;
}

export interface UpdateAiSessionInput {
  agentId?: string;
  archived?: boolean;
  metadata?: Record<string, unknown>;
  routeContext?: Record<string, unknown>;
  scope: AiSessionScope;
  status?: AgentSessionStatus;
  summary?: string | null;
  threadId: string;
  title?: string | null;
  workspaceKey?: string | null;
}

export interface AppendAiSessionMessageInput {
  authorUserId?: string | null;
  parts: unknown;
  role: SessionMessageRole;
  scope: AiSessionScope;
  threadId: string;
}

export interface ListAiSessionsInput {
  agentId?: string;
  hostKey?: string;
  includeArchived?: boolean;
  limit: number;
  scope: AiSessionScope;
}

export interface DeleteAiSessionsInput {
  agentId?: string;
  hostKey?: string;
  scope: AiSessionScope;
}

export interface ListAiSessionMessagesInput {
  limit: number;
  scope: AiSessionScope;
  threadId: string;
}

export interface AgentUiProducerContext {
  frontend_tools: FrontendToolDefinition[];
  state_delta?: AgentUiStateDeltaV1;
  state_snapshot?: AgentUiStateSnapshotV1;
}

export interface StreamAiSessionInput {
  abortSignal?: AbortSignal;
  agentUi?: AgentUiProducerContext | null;
  authorization?: string | null;
  emit?: (event: AGUIEvent) => void;
  messages?: Message[];
  modelIdOverride?: string | null;
  onArtifactCreated?: (value: unknown) => void;
  onRuntimePromptBuilt?: (value: {
    modelMessages: unknown;
    runtimeContextInstructions: string;
  }) => void;
  onTextDelta?: (delta: string) => void;
  onTextEnd?: (messageId: string) => void;
  onTextStart?: (messageId: string) => void;
  onToolResult?: (params: {
    messageId: string;
    part: AssistantDynamicToolPart;
    toolCallId: string;
  }) => void;
  resume?: NonNullable<RunAgentInput["resume"]>;
  /** Official AG-UI `RunAgentInput.context` entries from the client run. */
  runContext?: RunAgentInput["context"];
  runId?: string;
  runTracker?: SessionRunTracker;
  scope: AiSessionScope;
  threadId: string;
}

export type DynamicAgentAssembler = (
  registry: AiRegistry,
  agentId: string,
  options?: AssembleDynamicAgentOptions
) => ReturnType<typeof assembleDynamicAgent>;

export interface RuntimeModelConfigInput {
  chatModelId?: string | null;
  routingModelId?: string | null;
  safeguardModelId?: string | null;
}

export interface SessionServiceOptions {
  assembleDynamicAgent?: DynamicAgentAssembler;
  createRegistry?: (scope: AiSessionScope) => AiRegistry;
  getRunStore?: () => AgentRunStore | null;
  getStore: () => AgentSessionStore | null;
  getUsageStore: () => AiUsageStore | null;
  mastra: Mastra;
  registry?: AiRegistry;
  resolveTenantModelConfig?: (
    scope: AiSessionScope
  ) => Promise<RuntimeModelConfigInput | null | undefined>;
}
