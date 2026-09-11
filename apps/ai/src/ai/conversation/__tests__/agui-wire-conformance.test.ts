// Wire conformance: our expander's output, judged by a STOCK AG-UI client.
//
// A wire bug is invisible from the inside. Our own client tolerates duplicate
// TOOL_CALL_ENDs where a spec-compliant one rejects the entire stream, and our
// own assertions once encoded that duplicate as expected — under the title
// "well-formed tool call". Judging our events against our own reading of the
// spec is the failure mode this file exists to prevent.
//
// So this asserts nothing itself. It hands each stream to `verifyEvents` from
// @ag-ui/client — the same state machine that runs inside a real AG-UI client —
// and lets IT judge. When @ag-ui/client is upgraded and its rules tighten, these
// break, which is the point: it is a canary for drift we did not author.
//
// Scope: stream VALIDITY (bracketing, ordering, lifecycle). Semantics — the
// user-turn echo, resume payload shape, accumulated messages — are behavioural
// and belong to the route tests. No network, no LLM, deterministic.

import type { BaseEvent } from "@ag-ui/client";
import { EventType, verifyEvents } from "@ag-ui/client";
import { firstValueFrom, from, of, toArray } from "rxjs";
import { catchError } from "rxjs/operators";
import { describe, expect, it } from "vitest";
import { AgUiTextChunkExpander } from "../agui-text-chunks.js";

const RUN_ID = "run-1";
const THREAD_ID = "thread-1";

/**
 * Frame converter output as a complete run and run the stock verifier over it.
 * Resolves to null when the stream is valid, or the client's own rejection text.
 */
async function verify(body: BaseEvent[]): Promise<string | null> {
  const stream: BaseEvent[] = [
    { runId: RUN_ID, threadId: THREAD_ID, type: EventType.RUN_STARTED },
    ...body,
    { runId: RUN_ID, threadId: THREAD_ID, type: EventType.RUN_FINISHED },
  ] as BaseEvent[];
  const failure = await firstValueFrom(
    from(stream).pipe(
      verifyEvents(false),
      toArray(),
      catchError((err: unknown) =>
        of([{ __error: (err as Error)?.message ?? String(err) }])
      )
    )
  );
  const first = failure[0] as { __error?: string } | undefined;
  return first?.__error ?? null;
}

/**
 * What the chat lanes actually put on the wire: `@ag-ui/mastra`'s own events with
 * text chunks expanded. The expander is the only thing between upstream and the
 * client now, so it is the only thing left to verify.
 */
function expanded(events: Record<string, unknown>[]): BaseEvent[] {
  const expander = new AgUiTextChunkExpander();
  const out = events.flatMap((e) => expander.expand(e as never));
  out.push(...expander.finish());
  return out as unknown as BaseEvent[];
}

describe("the verifier is actually running", () => {
  it("rejects a duplicate TOOL_CALL_END", async () => {
    // Guards the guard. Every assertion above is `toBeNull()`, which a no-op
    // verifier would satisfy; this is the case that must FAIL. It is also the
    // exact shape a stock client rejects.
    const err = await verify([
      {
        parentMessageId: "m1",
        toolCallId: "x1",
        toolCallName: "search",
        type: EventType.TOOL_CALL_START,
      },
      { toolCallId: "x1", type: EventType.TOOL_CALL_END },
      { toolCallId: "x1", type: EventType.TOOL_CALL_END },
    ] as BaseEvent[]);
    expect(err).toMatch(/TOOL_CALL_END/);
  });
});

// `@ag-ui/mastra` emits TEXT_MESSAGE_CHUNK and the expander turns it into the
// START/CONTENT/END this wire is defined on. It is now the only thing standing
// between upstream's events and the client, so this is where the conformance
// guarantee lives.
describe("the expanded chat wire is a stream a stock AG-UI client accepts", () => {
  it("a plain assistant turn", async () => {
    expect(
      await verify(
        expanded([
          { delta: "Hel", messageId: "m1", type: EventType.TEXT_MESSAGE_CHUNK },
          { delta: "lo", messageId: "m1", type: EventType.TEXT_MESSAGE_CHUNK },
        ])
      )
    ).toBeNull();
  });

  it("a turn that ended mid-text", async () => {
    // The suspend/failure shape: the expander has to close what it opened, or the
    // client rejects a run that finishes with a message still open.
    expect(
      await verify(
        expanded([
          {
            delta: "half",
            messageId: "m1",
            type: EventType.TEXT_MESSAGE_CHUNK,
          },
        ])
      )
    ).toBeNull();
  });

  it("a tool call bracketed around text", async () => {
    expect(
      await verify(
        expanded([
          {
            delta: "let me look",
            messageId: "m1",
            type: EventType.TEXT_MESSAGE_CHUNK,
          },
          {
            parentMessageId: "m1",
            toolCallId: "c1",
            toolCallName: "lookup",
            type: EventType.TOOL_CALL_START,
          },
          { delta: "{}", toolCallId: "c1", type: EventType.TOOL_CALL_ARGS },
          { toolCallId: "c1", type: EventType.TOOL_CALL_END },
          {
            content: "{}",
            messageId: "r1",
            role: "tool",
            toolCallId: "c1",
            type: EventType.TOOL_CALL_RESULT,
          },
          {
            delta: "found it",
            messageId: "m2",
            type: EventType.TEXT_MESSAGE_CHUNK,
          },
        ])
      )
    ).toBeNull();
  });
});
