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

/**
 * The credential a scope carries, and — the point of the union — WHAT it is.
 *
 * Both kinds are bearers toward core, so nothing that merely forwards a token
 * needs to care. The distinction exists so that anything which does something
 * credential-specific (talks to Supabase directly, assumes a row in
 * `auth.users`, attributes an action to a human) is forced to say so.
 *
 * See docs/wip/service-identity-inventory.md: as of CP1 no call site in
 * apps/ai sends this token anywhere but core, and this type is what keeps that
 * true as the tree grows.
 */
export type AiScopeCredential =
  | { kind: "user"; token: string } // Supabase session — a real person
  | { kind: "service"; token: string }; // engenty service token — headless

export interface AiSessionScope {
  /**
   * Preferred over {@link AiSessionScope.userAccessToken}. Optional for the
   * same reason the old field was: about half the consumers treat a missing
   * credential as "degrade this feature", not "fail the request".
   */
  credential?: AiScopeCredential;
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
  tenantId: string;
  tenantRole?: "admin" | "member" | "service" | null;
  /**
   * @deprecated Shim kept so scope literals (notably in tests) keep compiling
   * through the CP4→CP6 window. Read through {@link resolveScopeCredential} /
   * {@link scopeAccessToken}, never directly. Removed at CP6.
   */
  userAccessToken?: string;
  userId: string;
}

/**
 * The scope's credential, whichever field carries it.
 *
 * A bare `userAccessToken` is reported as `kind: "user"` — that is what it
 * always meant before the split, and headless callers set `credential`
 * explicitly.
 */
export function resolveScopeCredential(
  scope: Pick<AiSessionScope, "credential" | "userAccessToken">
): AiScopeCredential | null {
  if (scope.credential?.token.trim()) {
    return scope.credential;
  }
  const legacy = scope.userAccessToken?.trim();
  return legacy ? { kind: "user", token: legacy } : null;
}

/**
 * The user id to write into user-attribution columns (FKs to core.users), or
 * null when the scope's principal is not a human — a service scope's `userId`
 * is the credential id, which core.users does not contain.
 */
export function scopeAttributionUserId(
  scope: Pick<AiSessionScope, "credential" | "userAccessToken" | "userId">
): string | null {
  return resolveScopeCredential(scope)?.kind === "service"
    ? null
    : scope.userId;
}

/** The bearer to send toward core, or undefined when the scope has none. */
export function scopeAccessToken(
  scope: Pick<AiSessionScope, "credential" | "userAccessToken">
): string | undefined {
  return resolveScopeCredential(scope)?.token;
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
  planningCodingModelId?: string | null;
  researchModelId?: string | null;
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
