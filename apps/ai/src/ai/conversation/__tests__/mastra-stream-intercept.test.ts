// The seam where `@ag-ui/mastra` and this codebase disagree.
import { describe, expect, it, vi } from "vitest";
import { interceptMastraStream } from "../mastra-stream-intercept.js";

/** A stream result shaped like Mastra's: usage is a GETTER, not a property. */
function mastraShapedStream(chunks: unknown[]) {
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
    get finishReason() {
      return "stop";
    },
    getFullOutput() {
      return Promise.resolve({ finishReason: "stop" });
    },
    get usage() {
      return Promise.resolve({ inputTokens: 7, outputTokens: 2 });
    },
  };
}

async function drain(stream: unknown) {
  const out: unknown[] = [];
  for await (const chunk of (stream as { fullStream: AsyncIterable<unknown> })
    .fullStream) {
    out.push(chunk);
  }
  return out;
}

describe("interceptMastraStream", () => {
  it("keeps GETTERS on the stream it hands back", async () => {
    // The bug this exists to prevent: `{...stream, fullStream}` copies neither
    // getters nor prototype methods, so the object reaching MastraAgent had no
    // `usage` at all — and `resolveUsage` swallows the miss and returns [], so
    // every turn billed zero without a word.
    const inner = vi.fn(async (_m: unknown, _o: unknown) =>
      mastraShapedStream([])
    );
    const { proxied } = interceptMastraStream({ stream: inner }, "stream");
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});

    expect(await (returned as { usage: Promise<unknown> }).usage).toMatchObject(
      {
        inputTokens: 7,
      }
    );
    expect((returned as { finishReason: string }).finishReason).toBe("stop");
    expect(typeof (returned as { getFullOutput: unknown }).getFullOutput).toBe(
      "function"
    );
  });

  it("passes every chunk through, unchanged and in order", async () => {
    const chunks = [
      { payload: { text: "a" }, type: "text-delta" },
      { payload: { text: "b" }, type: "text-delta" },
    ];
    const { proxied } = interceptMastraStream(
      { stream: async () => mastraShapedStream(chunks) },
      "stream"
    );
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});

    expect(await drain(returned)).toEqual(chunks);
  });

  it("hands a tool-approval pause over as the suspension upstream reads", async () => {
    // Mastra stops the same run two ways: `tool-call-suspended` when a tool
    // suspends itself, `tool-call-approval` when its `requireApproval` gate
    // says yes. `@ag-ui/mastra` implements only the first, so the second fell
    // through its default branch and the gated call vanished — TOOL_CALL_*
    // with no result, RUN_FINISHED with no interrupt, no usage, no answer.
    const chunks = [
      {
        from: "AGENT",
        payload: {
          args: { command: "date" },
          resumeSchema: '{"type":"object"}',
          toolCallId: "call-1",
          toolName: "mastra_workspace_execute_command",
        },
        runId: "mastra-run-1",
        type: "tool-call-approval",
      },
    ];
    const { proxied } = interceptMastraStream(
      { stream: async () => mastraShapedStream(chunks) },
      "stream"
    );
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});

    expect(await drain(returned)).toEqual([
      {
        from: "AGENT",
        payload: {
          args: { command: "date" },
          resumeSchema: '{"type":"object"}',
          // The snapshot key a resume addresses.
          runId: "mastra-run-1",
          suspendPayload: {
            requireToolApproval: {
              args: { command: "date" },
              toolCallId: "call-1",
              toolName: "mastra_workspace_execute_command",
            },
          },
          toolCallId: "call-1",
          toolName: "mastra_workspace_execute_command",
        },
        runId: "mastra-run-1",
        type: "tool-call-suspended",
      },
    ]);
  });

  it("leaves an approval it cannot correlate alone", async () => {
    // No tool call id means no resume can address it; inventing one would park
    // the run on a pause nothing could ever answer.
    const chunks = [{ payload: { toolName: "x" }, type: "tool-call-approval" }];
    const { proxied } = interceptMastraStream(
      { stream: async () => mastraShapedStream(chunks) },
      "stream"
    );
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});

    expect(await drain(returned)).toEqual(chunks);
  });

  it("intercepts only the named method", async () => {
    const stream = vi.fn(async (_m: unknown, _o: unknown) =>
      mastraShapedStream([])
    );
    const resumeStream = vi.fn(async (_d: unknown, _o: unknown) =>
      mastraShapedStream([])
    );
    const { proxied } = interceptMastraStream(
      { resumeStream, stream },
      "resumeStream",
      { untilIdle: true }
    );
    const agent = proxied as {
      resumeStream: (a: unknown, b: unknown) => Promise<unknown>;
      stream: (a: unknown, b: unknown) => Promise<unknown>;
    };
    await agent.stream([], { runId: "r" });
    await agent.resumeStream({}, { runId: "r" });

    expect(stream.mock.calls[0]?.[1]).toEqual({ runId: "r" });
    expect(resumeStream.mock.calls[0]?.[1]).toMatchObject({ untilIdle: true });
  });

  it("appends an image attachment to the LAST user message", async () => {
    const stream = vi.fn(async (_m: unknown, _o: unknown) =>
      mastraShapedStream([])
    );
    const { proxied } = interceptMastraStream({ stream }, "stream", {
      attachments: [{ data: "AAAA", mediaType: "image/png" }],
    });
    await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream(
      [
        { content: "older", role: "user" },
        { content: "answer", role: "assistant" },
      ],
      {}
    );

    // The assistant turn in between must not collect it, and the EARLIER user
    // message must not either — only the turn being sent.
    const sent = (stream.mock.calls[0]?.[0] ?? []) as { content?: unknown }[];
    expect(JSON.stringify(sent[1])).not.toContain("AAAA");
    expect(JSON.stringify(sent[0])).toContain("data:image/png;base64,AAAA");
  });

  it("sends a non-image as a FILE part, not an image", async () => {
    // AG-UI's own message content would force this through `{type:"image"}`.
    const stream = vi.fn(async (_m: unknown, _o: unknown) =>
      mastraShapedStream([])
    );
    const { proxied } = interceptMastraStream({ stream }, "stream", {
      attachments: [
        { data: "JVBERi0=", filename: "r.pdf", mediaType: "application/pdf" },
      ],
    });
    await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([{ content: "read this", role: "user" }], {});

    const sent = (stream.mock.calls[0]?.[0] ?? []) as { content?: unknown[] }[];
    expect(sent[0]?.content).toContainEqual({
      data: "JVBERi0=",
      filename: "r.pdf",
      mimeType: "application/pdf",
      type: "file",
    });
  });

  it("recovers the real message from an object-shaped error chunk", async () => {
    // Upstream does `Error(payload.error)` on an object → "[object Object]".
    const { proxied, readErrorChunk } = interceptMastraStream(
      {
        stream: async () =>
          mastraShapedStream([
            {
              payload: { error: { message: "context_length_exceeded" } },
              type: "error",
            },
          ]),
      },
      "stream"
    );
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});
    await drain(returned);

    expect(readErrorChunk()?.message).toBe("context_length_exceeded");
  });

  it("attaches native sub-agent progress to the delegation before it", async () => {
    const lines: [string, string][] = [];
    const { proxied } = interceptMastraStream(
      {
        stream: async () =>
          mastraShapedStream([
            {
              payload: { toolCallId: "d1", toolName: "agent-cli" },
              type: "tool-call",
            },
            {
              payload: { text: "cloning" },
              type: "agent-execution-event-progress",
            },
            { payload: {}, type: "agent-execution-event-completed" },
            {
              payload: { text: "stray" },
              type: "agent-execution-event-progress",
            },
          ]),
      },
      "stream",
      { onSubAgentProgress: (id, line) => lines.push([id, line]) }
    );
    const returned = await (
      proxied as { stream: (a: unknown, b: unknown) => Promise<unknown> }
    ).stream([], {});
    await drain(returned);

    // The line after the delegation FINISHED belongs to nothing and must not be
    // folded onto the card that just closed.
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[0]).toBe("d1");
  });
});
