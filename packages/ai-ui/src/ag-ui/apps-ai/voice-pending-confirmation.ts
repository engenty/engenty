/**
 * Voice HITL gate. An action that needs the user's approval — a gated backend
 * op whose `engenty_tool_execute` returned an approval decision artifact, or a
 * set of proposed field updates — parks here as the single active pending
 * confirmation while a dialog (and the agent's voice) asks the user to decide.
 *
 * Two resolution channels feed the same store, first-to-resolve wins:
 * - voice: the agent calls `resolve_pending_confirmation` after hearing yes/no;
 * - click: the user taps a button on the on-screen card.
 *
 * `clearPendingVoiceConfirmation()` is the lock — it reads and clears in one
 * synchronous step, so a racing second channel sees `no_pending` and no action
 * runs twice. Pure module (no React), subscribable for `useSyncExternalStore`.
 */
import type { JsonValue } from "@engenty/ag-ui-bridge";
import type {
  PostRealtimeVoiceToolApproveOptions,
  RealtimeVoiceToolApprovalChoice,
} from "./realtime-voice-backend-tools.js";
import type { OpenAiRealtimeVoiceToolCallRequest } from "./use-openai-realtime-voice-session.js";

export interface VoiceFieldSuggestionCandidate {
  evidence_snippet?: string;
  label?: string;
  source_url?: string;
  value: string | null;
}

export interface VoiceFieldSuggestion {
  candidates?: VoiceFieldSuggestionCandidate[];
  confidence?: number;
  evidence_snippet?: string;
  field: string;
  source_url?: string;
  value: string | null;
}

interface VoicePendingConfirmationBase {
  /** Original realtime tool call id (the gated tool, not the resolve tool). */
  callId: string;
  /** Parsed tool arguments, for the dialog preview. */
  input: JsonValue;
  /** The realtime request replayed verbatim once the user approves. */
  request: OpenAiRealtimeVoiceToolCallRequest;
  /** Human-readable heading for the dialog. */
  title: string;
}

export interface VoiceBackendApprovalPendingConfirmation
  extends VoicePendingConfirmationBase {
  artifactId: string;
  body?: string;
  /** Decision choices straight from the backend artifact (approve/always/deny). */
  choices: RealtimeVoiceToolApprovalChoice[];
  interruptId?: string;
  kind: "backend_approval";
  /** Backend operation id the user is approving (e.g. `contacts_contact_create`). */
  operationId: string;
  /** Thread the grant is persisted against. Null in a threadless voice session
   * (fresh chat) — the decision then rides the re-invoke as a one-shot grant. */
  threadId: string | null;
}

export interface VoiceFieldSuggestionsPendingConfirmation
  extends VoicePendingConfirmationBase {
  contextId: string;
  contextType: string;
  kind: "field_suggestions";
  suggestions: VoiceFieldSuggestion[];
}

export type VoicePendingConfirmation =
  | VoiceBackendApprovalPendingConfirmation
  | VoiceFieldSuggestionsPendingConfirmation;

let active: VoicePendingConfirmation | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setPendingVoiceConfirmation(
  confirmation: VoicePendingConfirmation
): void {
  active = confirmation;
  emit();
}

export function getPendingVoiceConfirmation(): VoicePendingConfirmation | null {
  return active;
}

/**
 * Atomically read-and-clear the active confirmation. Acts as the resolution
 * lock: the first caller gets the confirmation, any racing caller gets null.
 */
export function clearPendingVoiceConfirmation(
  callId?: string
): VoicePendingConfirmation | null {
  if (callId && active?.callId !== callId) {
    return null;
  }
  const previous = active;
  active = null;
  if (previous) {
    emit();
  }
  return previous;
}

export function subscribePendingVoiceConfirmation(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface ResolveVoiceConfirmationResult {
  result?: unknown;
  status: "approved" | "no_pending" | "rejected";
  tool?: string;
}

export interface ResolvePendingVoiceConfirmationParams {
  /** Backend approvals only: grant for the whole chat instead of once. */
  always?: boolean;
  /** Field suggestions only: apply the approved patch to the subject. */
  applyFieldUpdates?: (params: {
    approved: Array<{ field: string; value: string | null }>;
    contextId: string;
    contextType: string;
  }) => Promise<{ applied: number }>;
  /** Persist a backend approval decision, then the op is re-invoked. */
  approveBackendTool?: (
    params: Pick<
      PostRealtimeVoiceToolApproveOptions,
      "decision" | "operationId" | "threadId"
    >
  ) => Promise<{ granted: boolean }>;
  /** Approve when true; deny/reject when false. */
  approved: boolean;
  /** Field suggestions only: the explicit field selection (click path). */
  approvedFields?: Array<{ field: string; value: string | null }>;
  /** Re-invoke the gated backend op after the grant is persisted. In a
   * threadless session the approval travels as `approvalGrantOnce` instead. */
  executeBackendTool?: (
    request: OpenAiRealtimeVoiceToolCallRequest,
    opts?: { approvalGrantOnce?: string }
  ) => Promise<unknown>;
  runId: string;
}

/**
 * Resolve the active pending confirmation. Shared by both channels — the voice
 * resolve tool and the dialog buttons. On approval the gated action runs for
 * real (a persisted backend grant + re-invoke, or an applied field-update
 * patch).
 */
export async function resolvePendingVoiceConfirmation(
  params: ResolvePendingVoiceConfirmationParams
): Promise<ResolveVoiceConfirmationResult> {
  const pending = clearPendingVoiceConfirmation();
  if (!pending) {
    return { status: "no_pending" };
  }
  if (pending.kind === "backend_approval") {
    return resolveBackendApproval(pending, params);
  }
  return resolveFieldSuggestions(pending, params);
}

async function resolveBackendApproval(
  pending: VoiceBackendApprovalPendingConfirmation,
  params: ResolvePendingVoiceConfirmationParams
): Promise<ResolveVoiceConfirmationResult> {
  const decision = params.approved
    ? params.always
      ? "approve_always"
      : "approve_once"
    : "deny";
  // Persisting the grant needs a thread; a threadless session carries the
  // approval on the re-invoke itself instead.
  if (pending.threadId) {
    await params.approveBackendTool?.({
      decision,
      operationId: pending.operationId,
      threadId: pending.threadId,
    });
  }
  if (!params.approved) {
    return { status: "rejected", tool: pending.operationId };
  }
  // Grant persisted (or carried one-shot) — re-invoke; the gate now passes.
  const result = await params.executeBackendTool?.(
    pending.request,
    pending.threadId ? undefined : { approvalGrantOnce: pending.operationId }
  );
  return { result, status: "approved", tool: pending.operationId };
}

async function resolveFieldSuggestions(
  pending: VoiceFieldSuggestionsPendingConfirmation,
  params: ResolvePendingVoiceConfirmationParams
): Promise<ResolveVoiceConfirmationResult> {
  if (!params.approved) {
    return { status: "rejected", tool: "field_updates" };
  }
  const approved =
    params.approvedFields ?? suggestionsToApproved(pending.suggestions);
  if (approved.length === 0) {
    return { status: "rejected", tool: "field_updates" };
  }
  const result = await params.applyFieldUpdates?.({
    approved,
    contextId: pending.contextId,
    contextType: pending.contextType,
  });
  return { result, status: "approved", tool: "field_updates" };
}

/** Voice "apply all" — take each suggestion's primary value. */
export function suggestionsToApproved(
  suggestions: readonly VoiceFieldSuggestion[]
): Array<{ field: string; value: string | null }> {
  return suggestions.map((suggestion) => ({
    field: suggestion.field,
    value: suggestion.value,
  }));
}
