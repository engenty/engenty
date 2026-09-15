// The headless lane, driven by `@ag-ui/mastra`.
//
// `MastraAgent` emits AG-UI events directly, so this path needs no converter of
// its own. A headless run still has to learn seven distinct facts from the
// stream — a parked workspace tool, a published app_build preview, field
// suggestions, and so on. `mapHeadlessAgUiEvent` is that mapping, kept pure so it
// is testable without a model; the runner around it is glue.
import { EventType } from "@engenty/ag-ui-bridge";
import {
  type FieldSuggestion,
  fieldSuggestionsToolOutputToCreatedValue,
} from "@engenty/ai-core";

/**
 * Recognize an app_build tool result that published a preview artifact. The
 * shape is the tool's own contract (appBuildResultSchema): app_id +
 * artifact_id + a status that means "a version exists to look at".
 */
export function appBuildArtifactIdOf(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as {
    app_id?: unknown;
    artifact_id?: unknown;
    status?: unknown;
  };
  if (
    typeof record.app_id === "string" &&
    typeof record.artifact_id === "string" &&
    (record.status === "built" || record.status === "published")
  ) {
    return record.artifact_id;
  }
  return null;
}

/**
 * The tools whose result names an artifact the colleague made or presented.
 * `artifact_write` returns `{ artifact_id, version }` on success (and
 * `{ error }` otherwise); `show_artifact` echoes the id it presented.
 */
const ARTIFACT_PRODUCING_TOOLS = new Set(["artifact_write", "show_artifact"]);

/**
 * Recognize an artifact tool result that names an artifact — the deliverable
 * a delegated colleague made, so the parent's transcript can offer it where
 * the person reads (see delegate-tool `artifact_ids`).
 */
export function producedArtifactIdOf(
  toolName: string | undefined,
  result: unknown
): string | null {
  if (!(toolName && ARTIFACT_PRODUCING_TOOLS.has(toolName))) {
    return null;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as { artifact_id?: unknown; error?: unknown };
  if (record.error !== undefined && record.error !== null) {
    return null;
  }
  return typeof record.artifact_id === "string" && record.artifact_id
    ? record.artifact_id
    : null;
}

/** Everything the headless lane learns from the run's event stream. */
export interface HeadlessRunSinks {
  /** A workspace tool parked for a human: same grant id the Session path used. */
  onApprovalRequired?: (input: {
    operationId: string;
    riskLevel: "high";
    title: string;
  }) => void;
  onProgress?: (line: string) => void;
}

/** A gated tool call the run paused on, addressed by id when it is answered. */
export interface PendingApproval {
  /** The grant that would have covered the call — dropped once it is declined. */
  grantId: string;
  /** `${snapshotRunId}::${toolCallId}` — what a resume entry addresses. */
  interruptId: string;
  toolName: string;
}

/**
 * What the model is told when its run cannot ask anyone. Names the reason, and
 * says not to retry — a decline the model reads as a transient failure turns
 * one gated call into a loop.
 */
const DECLINED_UNATTENDED =
  "Declined: this run is unattended and cannot ask for approval. Do not repeat this call — finish with what you can do without it, and say what was left undone.";

/**
 * Backstop for a model that answers a decline by calling the same tool again.
 * One round is one gated call.
 */
const MAX_DECLINE_ROUNDS = 8;

export interface HeadlessRunState {
  appArtifactId?: string;
  artifactId?: string;
  /**
   * The colleague's answer: its LAST assistant message that carried text. A
   * run narrates between tool calls ("I'll start by…", "Good — KB is fresh…")
   * before it writes the report; those are separate AG-UI messages, and only
   * the final one is the answer. Concatenating them put the narration first
   * and buried the report.
   */
  finalText: string;
  /** The message the text deltas currently belong to. */
  messageId?: string;
  /** Text of that message so far, replaced on the next message start. */
  messageText: string;
  /**
   * The pauses of THIS round, cleared by the runner once it answers them. A
   * grant id says what was asked for; only the interrupt id can answer it.
   */
  pendingApprovals: PendingApproval[];
  /**
   * Artifacts the run wrote or presented (artifact_write / show_artifact), in
   * order, each once. The parent surfaces them beside the colleague's reply.
   */
  producedArtifactIds: string[];
  streamError: string | null;
  suggestions?: FieldSuggestion[];
  /** toolCallId → toolCallName, since TOOL_CALL_RESULT carries only the id. */
  toolCallNames: Map<string, string>;
  /** Grant ids of workspace tools that suspended — a park, never a failure. */
  workspaceSuspensions: Set<string>;
}

export function createHeadlessRunState(): HeadlessRunState {
  return {
    finalText: "",
    messageText: "",
    pendingApprovals: [],
    producedArtifactIds: [],
    streamError: null,
    toolCallNames: new Map(),
    workspaceSuspensions: new Set(),
  };
}

/** The Mastra suspension payload `@ag-ui/mastra` preserves under `metadata.mastra`. */
interface MastraSuspendMetadata {
  args?: Record<string, unknown>;
  toolName?: string;
  type?: string;
}

function suspendMetadataOf(interrupt: unknown): MastraSuspendMetadata | null {
  if (!interrupt || typeof interrupt !== "object") {
    return null;
  }
  const metadata = (interrupt as { metadata?: { mastra?: unknown } }).metadata;
  const mastra = metadata?.mastra;
  if (!mastra || typeof mastra !== "object") {
    return null;
  }
  const typed = mastra as MastraSuspendMetadata;
  return typed.type === "mastra_suspend" ? typed : null;
}

/**
 * Re-derive the headless lane's facts from ONE AG-UI event.
 *
 * Mutates `state` rather than returning a delta: one run's facts accumulate
 * across many events, and threading a delta through every case buys nothing.
 */
export function mapHeadlessAgUiEvent(
  event: Record<string, unknown>,
  state: HeadlessRunState,
  sinks: HeadlessRunSinks,
  deps: {
    /** `workspaceToolGrantId` — injected so this module stays free of workspace deps. */
    grantIdOf: (toolName: string, args: Record<string, unknown>) => string;
    /** `describeWorkspaceToolCall` — the human-readable half of the card title. */
    describeCall: (args: unknown) => string;
    /**
     * Optional, and by default filters NOTHING: a leaf runs under
     * `approvalPolicy: "deny"`, so module ops never suspend and a workspace tool
     * is the only thing that can. Override only if that stops being true.
     */
    isWorkspaceTool?: (toolName: string) => boolean;
  }
): void {
  switch (event.type) {
    // A stream error does not throw, so it has to be captured here or the run
    // reports as "completed with no output" instead of FAILED.
    case EventType.RUN_ERROR: {
      state.streamError =
        (event.message as string | undefined) ?? "agent stream error";
      break;
    }

    case EventType.TEXT_MESSAGE_START: {
      const messageId = event.messageId;
      state.messageId = typeof messageId === "string" ? messageId : undefined;
      state.messageText = "";
      break;
    }

    case EventType.TEXT_MESSAGE_CONTENT: {
      // AG-UI carries text as DELTAS, so this accumulates within one message.
      // A delta for another message id (a start event that never arrived)
      // opens a new message; the previous one stays the answer until this one
      // carries text of its own.
      const delta = event.delta;
      if (typeof delta !== "string") {
        break;
      }
      const messageId = event.messageId;
      if (typeof messageId === "string" && messageId !== state.messageId) {
        state.messageId = messageId;
        state.messageText = "";
      }
      state.messageText += delta;
      state.finalText = state.messageText;
      break;
    }

    case EventType.TOOL_CALL_START: {
      const toolName = event.toolCallName;
      if (typeof toolName === "string") {
        sinks.onProgress?.(`Running ${toolName}`);
        const toolCallId = event.toolCallId;
        if (typeof toolCallId === "string") {
          state.toolCallNames.set(toolCallId, toolName);
        }
      }
      break;
    }

    case EventType.TOOL_CALL_RESULT: {
      // `tool_end` carried the parsed result object; AG-UI carries `content` as a
      // string, so it is parsed back before the artifact probes run.
      const raw = event.content;
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }
      const created = fieldSuggestionsToolOutputToCreatedValue(parsed);
      if (created) {
        state.suggestions = created.suggestions;
        state.artifactId = created.artifact_id;
      }
      const appArtifactId = appBuildArtifactIdOf(parsed);
      if (appArtifactId) {
        state.appArtifactId = appArtifactId;
      }
      const toolCallId = event.toolCallId;
      const produced = producedArtifactIdOf(
        typeof toolCallId === "string"
          ? state.toolCallNames.get(toolCallId)
          : undefined,
        parsed
      );
      if (produced && !state.producedArtifactIds.includes(produced)) {
        state.producedArtifactIds.push(produced);
      }
      break;
    }

    case EventType.RUN_FINISHED: {
      // The workspace-suspension bridge (4a). The Session emitted `tool_suspended`
      // per tool; `MastraAgent` collects suspensions into the terminating
      // RUN_FINISHED outcome instead, preserving toolName + args under
      // `metadata.mastra` — which is exactly what the grant id needs.
      const outcome = event.outcome as
        | { interrupts?: unknown[]; type?: string }
        | undefined;
      if (outcome?.type !== "interrupt") {
        break;
      }
      for (const interrupt of outcome.interrupts ?? []) {
        const mastra = suspendMetadataOf(interrupt);
        const toolName = mastra?.toolName;
        if (!toolName || deps.isWorkspaceTool?.(toolName) === false) {
          continue;
        }
        const args = mastra?.args ?? {};
        const grantId = deps.grantIdOf(toolName, args);
        state.workspaceSuspensions.add(grantId);
        const interruptId = (interrupt as { id?: unknown }).id;
        if (typeof interruptId === "string") {
          state.pendingApprovals.push({ grantId, interruptId, toolName });
        }
        sinks.onApprovalRequired?.({
          operationId: grantId,
          riskLevel: "high",
          title: `${toolName} — ${deps.describeCall(args)}`,
        });
      }
      break;
    }

    default:
      break;
  }
}

/** Provider-reported usage, as `@ag-ui/mastra` attaches it to RUN_FINISHED. */
export interface HeadlessRunUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface HeadlessRunOutcome extends HeadlessRunState {
  /**
   * From `RUN_FINISHED.usage` (5b).
   *
   * `@ag-ui/mastra` attaches provider usage there as `TokenUsage[]`. Worth knowing:
   * the AG-UI 0.0.58 schema does NOT declare `usage` on RunFinishedEvent — upstream
   * casts it on. It survives anyway because the event schemas pass unknown keys
   * through (verified), so this works in-process AND over SSE. But it is an
   * undeclared field, so a future schema tightening could silently drop it — hence
   * an explicit null rather than an optional a caller might not notice.
   */
  usage: HeadlessRunUsage[] | null;
}

/**
 * Drive one headless leaf run through `@ag-ui/mastra`.
 *
 * 5b–5f are addressed here rather than in the mapper, because each is about how the
 * run is CONSTRUCTED and torn down, not about reading its events.
 */
export async function runHeadlessViaMastraAgent(input: {
  abortSignal?: AbortSignal;
  /** The already-assembled Mastra `Agent` — this module does not assemble. */
  agent: unknown;
  agentId: string;
  content: string;
  /**
   * This run has no channel to ask a human, so it answers its own approval
   * pauses with a decline (see {@link DECLINED_UNATTENDED}). Off for a run that
   * parks and is re-dispatched after someone approves.
   */
  declineApprovals?: boolean;
  describeCall: (args: unknown) => string;
  grantIdOf: (toolName: string, args: Record<string, unknown>) => string;
  /**
   * Reasoning-iteration cap for the child. Without it the loop halts at
   * Mastra's default (5 steps): a colleague that needed a sixth step to
   * answer returned nothing, and the parent reported an empty reply.
   */
  maxSteps?: number;
  /** Every AG-UI event, verbatim — this is what the run tracker persists. */
  onAgUiEvent?: (event: Record<string, unknown>) => void;
  /** 5f. Return a release fn; it is called on EVERY exit path. */
  onLiveSession?: (io: {
    deliver: (content: string) => Promise<void>;
  }) => (() => void) | undefined;
  requestContext?: unknown;
  resourceId: string;
  runId: string;
  sinks: HeadlessRunSinks;
  threadId: string;
}): Promise<HeadlessRunOutcome> {
  const { MastraAgent } = await import("@ag-ui/mastra");
  const { interceptMastraStream } = await import(
    "./mastra-stream-intercept.js"
  );
  const state = createHeadlessRunState();
  let usage: HeadlessRunUsage[] | null = null;

  // A gated tool pauses the run with a chunk `@ag-ui/mastra` has no case for, on
  // the initial stream and on every continuation alike — so both calls the bridge
  // makes are wrapped, or the second pause disappears the way the first did.
  const stepOptions = input.maxSteps ? { maxSteps: input.maxSteps } : {};
  const proxied = interceptMastraStream(
    interceptMastraStream(input.agent, "stream", stepOptions).proxied,
    "resumeStream",
    stepOptions
  ).proxied;

  // 5c/5e: thread, resource and requestContext bind at CONSTRUCTION. The Session
  // path needed an explicit `thread.switch` because `createSession` defaults to
  // "most recent thread", which is never the thread a delegated child must write
  // to; here it is a constructor argument, so there is no default to fight.
  const agUiAgent = new (
    MastraAgent as never as new (
      c: unknown
    ) => {
      abortRun: () => void;
      messages: unknown;
      runAgent: (p: unknown, s: unknown) => Promise<unknown>;
    }
  )({
    agent: proxied,
    agentId: input.agentId,
    resourceId: input.resourceId,
    threadId: input.threadId,
    ...(input.requestContext ? { requestContext: input.requestContext } : {}),
  });

  agUiAgent.messages = [
    { content: input.content, id: `${input.runId}-user`, role: "user" },
  ];

  // 5d: cancellation. `session.abort()` becomes `abortRun()`, and an ALREADY
  // aborted signal must not start the run at all — the Session path checked that.
  const onAbort = () => agUiAgent.abortRun();
  if (input.abortSignal?.aborted) {
    return { ...state, usage: null };
  }
  input.abortSignal?.addEventListener("abort", onAbort, { once: true });

  // 5f: mid-flight steering. `onLiveSession.deliver` was a SECOND
  // `session.sendMessage`, drained by the agentic loop as inbound input, so a task
  // comment lands in the SAME turn. The Agent-level equivalent is a signal with
  // `ifActive.behavior: "deliver"`.
  //
  // The Agent message/signal API is @experimental upstream, so this is the least
  // stable part of the port: a failure to steer must never take the run down. The
  // comment is best-effort; the run is not.
  const release = input.onLiveSession?.({
    deliver: async (content: string) => {
      const agent = input.agent as {
        sendMessage?: (
          m: unknown,
          t: unknown
        ) => { accepted?: Promise<unknown> };
      };
      try {
        const sent = agent.sendMessage?.(
          { content, role: "user" },
          {
            ifActive: { behavior: "deliver" },
            runId: input.runId,
            threadId: input.threadId,
          }
        );
        await sent?.accepted;
      } catch (error) {
        input.sinks.onProgress?.(
          `Could not deliver a mid-run comment: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
  });

  const subscriber = {
    onEvent: ({ event }: { event: Record<string, unknown> }) => {
      input.onAgUiEvent?.(event);
      mapHeadlessAgUiEvent(event, state, input.sinks, {
        describeCall: input.describeCall,
        grantIdOf: input.grantIdOf,
      });
      if (event.type === EventType.RUN_FINISHED) {
        const raw = event.usage;
        // Only a round that actually finished reports usage; a paused round
        // carries none, and its `null` must not erase what an earlier one billed.
        usage = Array.isArray(raw) ? (raw as HeadlessRunUsage[]) : usage;
      }
    },
  };

  try {
    await agUiAgent.runAgent({ runId: input.runId }, subscriber);
    // Answer this run's own approval pauses and carry on. A routine fire is the
    // case: "at 03:00 there is nobody to ask, so a fire either may do the work
    // or does nothing" — the standing grants decide the first half, and a call
    // they do not cover is declined here with the reason, so the model finishes
    // the part it can do instead of the turn ending on a call that never ran.
    // The round cap is a backstop against a model that answers a decline by
    // repeating the call; each round is one gated call, so it is never reached
    // by an agent that reads its own tool results.
    for (
      let round = 0;
      input.declineApprovals && state.pendingApprovals.length > 0;
      round += 1
    ) {
      const answered = state.pendingApprovals;
      state.pendingApprovals = [];
      // A declined call is not a park: drop it again so the caller does not
      // report a run that finished as one waiting for a human.
      for (const approval of answered) {
        state.workspaceSuspensions.delete(approval.grantId);
      }
      if (round >= MAX_DECLINE_ROUNDS) {
        input.sinks.onProgress?.(
          `Stopped after ${MAX_DECLINE_ROUNDS} declined approval requests.`
        );
        break;
      }
      await agUiAgent.runAgent(
        {
          resume: answered.map((approval) => ({
            interruptId: approval.interruptId,
            payload: { approved: false, reason: DECLINED_UNATTENDED },
            status: "resolved",
          })),
          runId: input.runId,
        },
        subscriber
      );
    }
  } catch (error) {
    // Same contract as the Session path: a stream failure is a FAILED run, not a
    // thrown call — the caller turns `streamError` into the outcome.
    state.streamError ??=
      error instanceof Error ? error.message : String(error);
  } finally {
    release?.();
    input.abortSignal?.removeEventListener("abort", onAbort);
  }

  return { ...state, usage };
}
