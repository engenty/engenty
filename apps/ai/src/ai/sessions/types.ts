import type {
  AGUIEvent,
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
  FrontendToolDefinition,
  Message,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import type { AiUsageStore } from "@engenty/ai-core";
import { capabilityCovers } from "@engenty/plugin-sdk";
import type { Mastra } from "@mastra/core/mastra";
import type {
  AgentRunStore,
  AgentSessionStatus,
  ThreadMessageRole,
  ThreadStore,
} from "../../dal/threads/index.js";
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
   * What this principal is allowed to do, in the capability ids core matches
   * with `capabilityCovers` — resolved from core's workspace context (AUTH-06).
   *
   * Gate with {@link scopeCoversCapability}, never by reading this directly:
   * the entries are patterns (`module.*`, `*`), not a membership list.
   *
   * Optional, and empty on a scope that never spoke to core (static scopes,
   * fixtures). An empty bundle denies everything — that is the intended
   * failure direction.
   */
  capabilities?: readonly string[];
  /**
   * Optional because about half the consumers treat a missing credential as
   * "degrade this feature", not "fail the request".
   */
  credential?: AiScopeCredential;
  /**
   * Platform-operator flag. Deliberately NOT expressed as a capability: the
   * `tenant.admin` profile holds `*`, which covers `core.superadmin` for the
   * matcher, so a capability check cannot tell a tenant admin from a
   * superadmin. Superadmin-only routes must keep gating on this boolean.
   */
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
  tenantId: string;
  tenantRole?: "admin" | "member" | "service" | null;
  userId: string;
}

/** The scope's credential, or null when it carries none. */
export function resolveScopeCredential(
  scope: Pick<AiSessionScope, "credential">
): AiScopeCredential | null {
  return scope.credential?.token.trim() ? scope.credential : null;
}

/**
 * The user id to write into user-attribution columns (FKs to core.users), or
 * null when the scope's principal is not a human — a service scope's `userId`
 * is the credential id, which core.users does not contain.
 */
export function scopeAttributionUserId(
  scope: Pick<AiSessionScope, "credential" | "userId">
): string | null {
  return resolveScopeCredential(scope)?.kind === "service"
    ? null
    : scope.userId;
}

/**
 * Whether the scope's capability bundle covers `capabilityId`.
 *
 * Delegates to the shared `capabilityCovers` matcher so apps/ai enforces with
 * exactly the rule core grants by — wildcards, sub-trees and all. Do not
 * reimplement the matching here or anywhere else in this app.
 */
export function scopeCoversCapability(
  scope: Pick<AiSessionScope, "capabilities">,
  capabilityId: string
): boolean {
  return capabilityCovers([...(scope.capabilities ?? [])], capabilityId);
}

/** The bearer to send toward core, or undefined when the scope has none. */
export function scopeAccessToken(
  scope: Pick<AiSessionScope, "credential">
): string | undefined {
  return resolveScopeCredential(scope)?.token;
}

export interface CreateAiThreadInput {
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

export interface UpdateAiThreadInput {
  agentId?: string;
  archived?: boolean;
  /** Set (or clear with null) the artifact the agent is presenting, so every
   * window attached to this thread shows the same one. Merges into metadata
   * under ACTIVE_ARTIFACT_METADATA_KEY — does not touch other metadata keys. */
  activeArtifactId?: string | null;
  metadata?: Record<string, unknown>;
  routeContext?: Record<string, unknown>;
  scope: AiSessionScope;
  status?: AgentSessionStatus;
  summary?: string | null;
  threadId: string;
  title?: string | null;
  workspaceKey?: string | null;
}

export interface AppendAiThreadMessageInput {
  authorUserId?: string | null;
  parts: unknown;
  role: ThreadMessageRole;
  scope: AiSessionScope;
  threadId: string;
}

export interface ListAiThreadsInput {
  agentId?: string;
  hostKey?: string;
  includeArchived?: boolean;
  /**
   * Optional because `deleteThreads` lists without one; the store then applies
   * its own default of 50. NOTE that means a delete-by-filter only ever sees
   * the first 50 threads — pre-existing behaviour, left as-is here rather than
   * widened by a typing change.
   */
  limit?: number;
  scope: AiSessionScope;
}

export interface DeleteAiThreadsInput {
  agentId?: string;
  hostKey?: string;
  scope: AiSessionScope;
}

export interface ListAiThreadMessagesInput {
  limit: number;
  scope: AiSessionScope;
  threadId: string;
}

export interface AgentUiProducerContext {
  frontend_tools: FrontendToolDefinition[];
  state_delta?: AgentUiStateDeltaV1;
  state_snapshot?: AgentUiStateSnapshotV1;
}

export interface StreamAiThreadInput {
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

export interface ThreadServiceOptions {
  assembleDynamicAgent?: DynamicAgentAssembler;
  createRegistry?: (scope: AiSessionScope) => AiRegistry;
  getRunStore?: () => AgentRunStore | null;
  getStore: () => ThreadStore | null;
  getUsageStore: () => AiUsageStore | null;
  mastra: Mastra;
  registry?: AiRegistry;
  resolveTenantModelConfig?: (
    scope: AiSessionScope
  ) => Promise<RuntimeModelConfigInput | null | undefined>;
}
