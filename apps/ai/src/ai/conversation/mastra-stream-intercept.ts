// The seam where `@ag-ui/mastra` and this codebase disagree.
//
// `MastraAgent` builds its own options for `agent.stream()` / `agent.resumeStream()`
// and exposes no hook to extend them — but the AGENT it calls them on is ours. So
// the seam belongs here: a Proxy over our own object, not a reach into upstream's
// private methods (which are minified `private` members of a dist bundle, and would
// fail as a runtime TypeError in the middle of a user's turn on the next upgrade).
//
// What rides through it, and why each has to:
//
//   - **abortSignal** — `MastraAgent` passes none, so a local Mastra agent cannot be
//     cancelled at all. That is the Stop button.
//   - **untilIdle** — dropped on the resume branch; keeps the outer stream open
//     across continuations a background task triggers.
//   - **attachments** — our base64 files are appended as Mastra content on the last
//     user message. Routing them through AG-UI's own content model instead would
//     force every non-image through `{type:"image"}` or an opaque source object.
//   - **the stream object** — `readMastraStreamFailure` needs it to catch a
//     `finishReason: "error"` that never threw.
//   - **the raw `error` chunk** — upstream does `Error(payload.error)` on what is
//     usually an object, so a real provider message arrives as "[object Object]".
//   - **`agent-execution-event-*`** — native sub-agent progress, which upstream does
//     not recognise (its processor warns "Unrecognized stream chunk type").
//   - **`tool-call-approval`** — the pause a `requireApproval` gate opens, restated
//     as the `tool-call-suspended` upstream does have a case for.
import {
  formatSubAgentProgressLine,
  isSubAgentDelegationToolName,
} from "../sessions/transcript.js";

/** A base64 attachment on the user turn, as the run route resolves it. */
export interface MastraStreamAttachment {
  data: string;
  filename?: string;
  mediaType: string;
}

export interface MastraStreamInterceptOptions {
  /** Cancellation. Upstream passes none, so without this Stop does nothing. */
  abortSignal?: AbortSignal;
  /** Appended to the last user message's content (initial stream only). */
  attachments?: readonly MastraStreamAttachment[];
  /**
   * Reasoning-iteration cap. Upstream passes none, so the loop halted at
   * Mastra's own default (5 steps) — a turn whose fifth step still wanted a
   * tool ended silently mid-chain, with the tool executed and no reply. That
   * was the "worked only after typing continue" bug.
   */
  maxSteps?: number;
  /** Native sub-agent progress lines, keyed by delegation tool call. */
  onSubAgentProgress?: (toolCallId: string, line: string) => void;
  /** Keep the stream open across background-task continuations. */
  untilIdle?: boolean;
}

export interface MastraStreamIntercept {
  proxied: unknown;
  /** Mastra's in-band `error` chunk, read before upstream flattens it. */
  readErrorChunk: () => Error | undefined;
  /** The stream result, for the finishReason check. */
  readStream: () => unknown;
}

/**
 * Attachments, as Mastra content parts on the last user message.
 *
 * The Session path handed these to `sendMessage({files})`. Going through AG-UI's
 * message content instead would mean `{type:"image"}` for a PDF, so they are put
 * where Mastra already expects them and the AG-UI message stays text.
 */
function appendAttachments(
  messages: unknown,
  attachments: readonly MastraStreamAttachment[]
): unknown {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }
  const parts = attachments.map((file) =>
    file.mediaType.startsWith("image/")
      ? { image: `data:${file.mediaType};base64,${file.data}`, type: "image" }
      : {
          data: file.data,
          mimeType: file.mediaType,
          type: "file",
          ...(file.filename ? { filename: file.filename } : {}),
        }
  );
  const out = [...messages];
  // The LAST user message: the turn being sent. Earlier ones are history.
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const message = out[i] as { content?: unknown; role?: string };
    if (message?.role !== "user") {
      continue;
    }
    const content = Array.isArray(message.content)
      ? [...message.content]
      : [{ text: String(message.content ?? ""), type: "text" }];
    out[i] = { ...message, content: [...content, ...parts] };
    return out;
  }
  return out;
}

/**
 * Wrap an agent so `@ag-ui/mastra` drives it the way these lanes need.
 *
 * `method` is the call to intercept: `"stream"` for a fresh turn,
 * `"resumeStream"` for a continuation.
 */
export function interceptMastraStream(
  agent: unknown,
  method: "resumeStream" | "stream",
  options: MastraStreamInterceptOptions = {}
): MastraStreamIntercept {
  let captured: unknown;
  let errorChunk: Error | undefined;
  // The delegation tool call nested progress currently attaches to.
  let activeDelegation: string | null = null;
  const target = agent as Record<string, unknown>;

  const proxied = new Proxy(target, {
    get(base, prop, receiver) {
      if (prop !== method) {
        // Read off the TARGET and bind to it — never `receiver`.
        //
        // A Mastra `Agent` keeps `#memory`, `#tools` and friends in real private
        // fields. Handing a method back unbound makes `this` the Proxy, and
        // private-field access on an object whose class did not declare them
        // THROWS. `@ag-ui/mastra` catches those and carries on with a warning, so
        // nothing fails outright — it just silently loses `selectNewMessages`,
        // which is the thing that stops the ENTIRE thread history being re-sent
        // on every turn. A quiet cost and correctness regression, not a crash.
        const value = Reflect.get(base, prop);
        return typeof value === "function" ? value.bind(base) : value;
      }
      const original = Reflect.get(base, prop, receiver) as (
        first: unknown,
        second: unknown
      ) => Promise<unknown>;
      return async (first: unknown, second: unknown) => {
        const callOptions = {
          ...(second as Record<string, unknown>),
          ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
          ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
          ...(options.untilIdle ? { untilIdle: true } : {}),
        };
        const firstArg =
          method === "stream" && options.attachments?.length
            ? appendAttachments(first, options.attachments)
            : first;
        const stream = (await original.call(base, firstArg, callOptions)) as
          | { fullStream?: AsyncIterable<unknown> }
          | undefined;
        captured = stream;
        if (!stream?.fullStream) {
          return stream;
        }
        const source = stream.fullStream;
        // Pass the chunks through in order, reading the ones upstream mangles or
        // ignores on the way past. `tool-call-approval` is the one chunk that is
        // rewritten rather than merely read (see approvalAsSuspension).
        const observed = (async function* () {
          for await (const chunk of source) {
            errorChunk ??= errorFromChunk(chunk);
            activeDelegation = readSubAgentProgress(
              chunk,
              activeDelegation,
              options.onSubAgentProgress
            );
            yield approvalAsSuspension(chunk);
          }
        })();
        // A Proxy, NOT `{...stream, fullStream}`. A Mastra stream result exposes
        // `usage`, `finishReason` and `getFullOutput` as GETTERS and prototype
        // methods, and a spread copies neither: the object reaching MastraAgent
        // would have had no `usage` at all, so every turn billed zero — silently,
        // because `resolveUsage` swallows the miss and returns [].
        return new Proxy(stream, {
          get(base, prop, receiver) {
            return prop === "fullStream"
              ? observed
              : Reflect.get(base, prop, receiver);
          },
        });
      };
    },
  });

  return {
    proxied,
    readErrorChunk: () => errorChunk,
    readStream: () => captured,
  };
}

/**
 * The Mastra pause a `requireApproval` gate opens, restated as the suspension
 * `@ag-ui/mastra` understands.
 *
 * Mastra has two chunks for the same stop: `tool-call-suspended` when a tool
 * calls `suspend()` itself, and `tool-call-approval` when the tool's
 * `requireApproval` gate answers yes. The bridge implements only the first. The
 * second falls through its default branch, so nothing suppresses the pending
 * tool call and nothing records an interrupt: the run emits
 * TOOL_CALL_START/ARGS/END with no result, terminates with a bare RUN_FINISHED
 * (no outcome, no usage), and every lane above reads a turn that finished with
 * nothing to say — the gated call silently never ran. Both chunks carry the same
 * fields, so the approval is handed over as the shape upstream has a case for.
 *
 * `suspendPayload` mirrors what Mastra's own `suspend()` carries here
 * (`requireToolApproval`), and the resume answer is `{approved}` either way, so
 * a resume still lands on the call Mastra parked.
 */
function approvalAsSuspension(chunk: unknown): unknown {
  const typed = chunk as
    | { payload?: Record<string, unknown>; runId?: unknown; type?: string }
    | undefined;
  if (typed?.type !== "tool-call-approval") {
    return chunk;
  }
  const payload = typed.payload ?? {};
  const { toolCallId, toolName } = payload;
  if (typeof toolCallId !== "string" || typeof toolName !== "string") {
    // Nothing to correlate a resume with — leave it for upstream to ignore.
    return chunk;
  }
  const args = (payload.args ?? {}) as Record<string, unknown>;
  return {
    ...typed,
    payload: {
      ...payload,
      args,
      // Mastra keys the suspended snapshot by the run id on the chunk; the
      // bridge reads the payload first, so both are offered.
      runId: payload.runId ?? typed.runId,
      suspendPayload: { requireToolApproval: { args, toolCallId, toolName } },
    },
    type: "tool-call-suspended",
  };
}

/** The suspend payload {@link approvalAsSuspension} writes. */
export interface MastraToolApprovalSuspendPayload {
  requireToolApproval: {
    args: Record<string, unknown>;
    toolCallId: string;
    toolName: string;
  };
}

/** Is this the suspend payload of a `requireApproval` gate? */
export function isMastraToolApprovalSuspend(
  value: unknown
): value is MastraToolApprovalSuspendPayload {
  const gate = (value as MastraToolApprovalSuspendPayload | undefined)
    ?.requireToolApproval;
  return (
    typeof gate?.toolCallId === "string" && typeof gate?.toolName === "string"
  );
}

/**
 * Native sub-agent progress. A Mastra sub-agent streams its inner activity as
 * `agent-execution-event-*` chunks belonging to the delegation tool call before
 * them. Mastra memory drops these, so the fold-back onto the persisted delegation
 * part is the only thing that keeps the card's Log and drill-in across a reload.
 *
 * Dormant in practice — engenty's own delegations stay Agent-level for their
 * sandbox and report through `recordSubAgentProgress` — which is precisely why it
 * would have disappeared without anyone noticing.
 *
 * Returns the delegation the NEXT chunk should attach to.
 */
function readSubAgentProgress(
  chunk: unknown,
  active: string | null,
  onProgress?: (toolCallId: string, line: string) => void
): string | null {
  const typed = chunk as
    | { payload?: Record<string, unknown>; type?: string }
    | undefined;
  const type = typed?.type ?? "";
  const payload = typed?.payload ?? {};
  if (type === "tool-call" || type === "tool-execution-start") {
    const toolName =
      typeof payload.toolName === "string" ? payload.toolName : "";
    const toolCallId =
      typeof payload.toolCallId === "string" ? payload.toolCallId : "";
    return toolCallId && isSubAgentDelegationToolName(toolName)
      ? toolCallId
      : active;
  }
  if (
    type === "agent-execution-event-cancelled" ||
    type === "agent-execution-event-completed" ||
    type === "agent-execution-event-failed"
  ) {
    // The delegation's own tool-result renders the outcome; stop attaching.
    return null;
  }
  if (
    active &&
    (type === "agent-execution-event-output" ||
      type === "agent-execution-event-progress")
  ) {
    const line = formatSubAgentProgressLine(type, payload);
    if (line) {
      onProgress?.(active, line);
    }
  }
  return active;
}

/**
 * Mastra's in-band `error` chunk, read before `@ag-ui/mastra` flattens it.
 *
 * Its payload is `{ error }`, where `error` is usually an object carrying the
 * provider's message. Upstream passes that object straight to `Error()`.
 */
function errorFromChunk(chunk: unknown): Error | undefined {
  const typed = chunk as
    | { payload?: Record<string, unknown>; type?: string }
    | undefined;
  if (typed?.type !== "error") {
    return;
  }
  const raw = typed.payload?.error ?? typed.payload;
  if (raw instanceof Error) {
    return raw;
  }
  const message =
    typeof raw === "string"
      ? raw
      : typeof (raw as { message?: unknown })?.message === "string"
        ? (raw as { message: string }).message
        : "Agent run error";
  return new Error(message);
}
