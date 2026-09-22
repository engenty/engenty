"use client";

import type {
  AgUiOpenInterruptMetadata,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import type { AiEffortChoice } from "@engenty/ai-core/browser";
import type { QueryClient } from "@engenty/query-client";
import type { ReactNode } from "react";
import type {
  EngentyAgUiPendingSend,
  ResumeInterruptFeedback,
} from "../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js";
import type {
  EngentyAgUiEvent,
  EngentyAgUiMessage,
  EngentyAgUiState,
} from "../ag-ui/conversation.js";
import type { EngentyAgUiRouteContext } from "../ag-ui/engenty-ag-ui-route-context.js";
import type { CopilotPanelContentProps } from "../components/presentation.js";
import type { ChatAttachmentPart } from "../lib/chat-attachment-part.js";
import type { ChatReferenceItem } from "../lib/chat-reference-part.js";

export type EngentyAgentStatus = "ready" | "submitted" | "streaming" | "error";

/** Per-send options for the composer → agent submit path. */
export interface SubmitMessageOptions {
  /** Uploaded photo/file attachments carried on the user turn (AG-UI content parts). */
  attachments?: ChatAttachmentPart[];
  /** Typed @-mention references (ObjectRefs) carried on the user turn. */
  refs?: ChatReferenceItem[];
  /** Per-send agent override resolved from an `@mention` in the composer. */
  requestedAgentId?: string;
}

export type SubmitMessage = (
  text: string,
  options?: SubmitMessageOptions
) => void;

/**
 * What `resumeInterrupt`/`respond` accept — an artifact decision choice OR a
 * native tool-approval result. Alias of the session's own payload type: the
 * first cut named only the artifact half here while the runtime handled both,
 * which forced every host to lie about the callback it was passing.
 */
export type EngentyInterruptFeedback = ResumeInterruptFeedback;

/** Agent tool id (`TOOL_CALL_START.toolCallName`) → query roots to invalidate. */
export type AgentToolInvalidationMap = ReadonlyMap<
  string,
  readonly (readonly unknown[])[]
>;

export interface EngentyAIProps {
  /**
   * Maps a copilot tool id to the React Query roots its execution invalidates,
   * so agent writes (e.g. `manage_project` → `["projects"]`) refresh the UI
   * without a reload. Assembled from module live bindings in the host app.
   */
  agentToolInvalidation?: AgentToolInvalidationMap;
  children: ReactNode;
  executeFrontendTool: (
    request: FrontendToolCallRequest
  ) => Promise<JsonValue> | JsonValue;
  formatRequestError?: (message: string) => string;
  formatTransportBlocker?: (blocker: "scope" | "ai_base_url") => string;
  frontendTools?: FrontendToolDefinition[];
  queryClient?: QueryClient;
  /** Supabase client for `ai.thread` realtime list invalidation. */
  resolveKbArticleHref?: (kbSlug: string, articleSlug: string) => string;
  serviceBaseUrl: string | null | undefined;
  stateSnapshot?: RunAgentInput["state"];
  tenantId?: string | null;
  threadsRealtimeClient?:
    | import("../threads/engenty-threads-realtime.js").EngentyThreadsRealtimeClient
    | null;
  userId?: string | null;
}

export interface HostConfig {
  agentId: string;
  /** Parsed `/chat/:threadId` from the URL — trumps bound id for reset guards. */
  authoritativeUrlThreadId?: string | null;
  /** User's effort pick for this lane (`forwardedProps.engenty.effort`). */
  effort?: AiEffortChoice | null;
  hostKey: string;
  /** When false, TanStack `initialMessages` never hydrate this host (e.g. closed drawer). */
  hydrateEnabled?: boolean;
  initialMessages?: readonly EngentyAgUiMessage[];
  messagesQueryKey?: readonly unknown[];
  modelId?: string | null;
  onMessagesSnapshot?: () => void;
  onThreadCreated?: (threadId: string) => void;
  openInterruptFromSession?: AgUiOpenInterruptMetadata | null;
  pathname?: string;
  routeContext: EngentyAgUiRouteContext;
  stableSessionKey?: string | null;
  threadDetailQueryKey?: readonly unknown[];
  threadId: string | null;
  threadsListQueryKey?: readonly unknown[];
}

export interface EngentyAgentProps extends HostConfig {
  children: ReactNode;
}

export interface AgentHost {
  activeThreadId: string | null;
  /** A run this window streams but did not start — a colleague's turn, another window's. */
  attachedRunId?: string | null;
  awaitingInterrupt: boolean;
  cancel: () => void;
  config: HostConfig;
  configureHost: (config: Partial<HostConfig>) => void;
  copilotMessages: CopilotPanelContentProps["messages"];
  /** The interrupt card's ✕: hide it now and clear it on the server, without answering. */
  dismissInterrupt: (open: AgUiOpenInterruptMetadata) => void;
  error: Error | null;
  events: EngentyAgUiEvent[];
  hostKey: string;
  messages: EngentyAgUiMessage[];
  /** Freshly-opened interrupt from the live stream — authoritative over the (lagging) session-metadata copy while set. */
  openInterruptFromStream: AgUiOpenInterruptMetadata | null;
  /** Optimistic resolved labels keyed by toolCallId, set on `respond` so the chooser collapses instantly. */
  optimisticInterruptResults: Record<string, string>;
  /** Tool call ids the agent is currently suspended on (CopilotKit-shaped HITL status, from the stream). */
  pendingInterruptToolCallIds: ReadonlySet<string>;
  pendingSend: EngentyAgUiPendingSend;
  pendingUserInsertIndex: number | null;
  /** Optimistic attachment / reference parts while a run is in flight. */
  pendingUserParts: unknown[] | null;
  pendingUserText: string | null;
  reset: () => void;
  /** Tool call ids whose card this client already answered or dismissed — masks the lagging session-metadata copy. */
  resolvedInterruptToolCallIds: ReadonlySet<string>;
  /** Resolve an interactive decision/feedback tool call: records the result optimistically, then resumes. */
  respond: (toolCallId: string, feedback: EngentyInterruptFeedback) => void;
  /** Re-attach to an in-flight server run after reload/navigation (poll transcript + run events). */
  resumeActiveRun: () => void;
  resumeInterrupt: (feedback: EngentyInterruptFeedback) => void;
  state: EngentyAgUiState;
  status: EngentyAgentStatus;
  /** Put words into the attached run; false when there was none to steer. */
  steer?: (text: string, options?: SubmitMessageOptions) => Promise<boolean>;
  submitMessage: SubmitMessage;
  threadId: string | null;
  threadResetKey: number;
}

export interface EngentyAIContextValue {
  agentToolInvalidation?: AgentToolInvalidationMap;
  executeFrontendTool: EngentyAIProps["executeFrontendTool"];
  formatRequestError: (message: string) => string;
  formatTransportBlocker: (blocker: "scope" | "ai_base_url") => string;
  frontendTools: FrontendToolDefinition[];
  isTransportReady: boolean;
  queryClient?: QueryClient;
  registerHost: (host: AgentHost) => void;
  resolveHost: (hostKey: string) => AgentHost | null;
  resolveKbArticleHref?: (kbSlug: string, articleSlug: string) => string;
  serviceBaseUrl: string;
  stateSnapshot?: RunAgentInput["state"];
  // Subscribe to host registration updates for `hostKey`. Returns an
  // unsubscribe fn. Used by `useAgentHost` to re-render sibling-subtree
  // consumers when the registered host changes (active copilot: shell
  // host mounts the AgentHost; full-page chat is a sibling that binds via the
  // registry, not via React Context — so it would otherwise not re-render
  // when the host's internal state updates).
  subscribeHost: (hostKey: string, listener: () => void) => () => void;
  /** Active tenant id — used to build tenant-scoped storage keys for chat uploads. */
  tenantId?: string | null;
  threadsRealtimeClient?:
    | import("../threads/engenty-threads-realtime.js").EngentyThreadsRealtimeClient
    | null;
  transportBlocker: "scope" | "ai_base_url" | null;
  unregisterHost: (hostKey: string, host: AgentHost) => void;
}
