// The interactive START turn on `@ag-ui/mastra`.
//
// Four things only this lane has to get right, and all four are upstream gaps:
// cancellation, the resume correlation key, stopping on a tool RESULT, and
// attachments. Each has a test here because each fails silently.
import { EventType } from "@engenty/ag-ui-bridge";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AGENT_THREADS_OUTPUT_TRUNCATED } from "../../sessions/mastra-stream-failure.js";
import { runInteractiveViaMastraAgent } from "../agui-start-driver.js";
import { AgUiTurnAccumulator } from "../agui-turn-accumulator.js";

const usage = { inputTokens: 12, outputTokens: 4, totalTokens: 16 };

function textAgent(text: string, doStream?: unknown) {
  return new Agent({
    name: "start-fixture",
    instructions: "test",
    model: new MockLanguageModelV3({
      doStream:
        doStream ??
        (async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: text },
              { type: "text-end", id: "t1" },
              { type: "finish", finishReason: "stop", usage },
            ],
          }),
        })),
    } as never) as never,
    storage: new InMemoryStore(),
  } as never);
}

async function drive(agent: unknown, overrides: Record<string, unknown> = {}) {
  const accumulator = new AgUiTurnAccumulator();
  const emitted: Record<string, unknown>[] = [];
  const outcome = await runInteractiveViaMastraAgent({
    accumulator,
    agent,
    agentId: "engenty.copilot",
    emit: (e) => emitted.push(e as never as Record<string, unknown>),
    isStopOnResult: () => false,
    prompt: "go",
    resourceId: "resource-1",
    runId: "run-1",
    threadId: "thread-1",
    ...overrides,
  });
  return { accumulator, emitted, outcome };
}

const typesOf = (events: Record<string, unknown>[]) =>
  events.map((e) => String(e.type));

describe("I3: the interactive start driver", () => {
  it("streams the answer and bills the turn", async () => {
    const { accumulator, emitted, outcome } = await drive(textAgent("hello"));

    expect(outcome.runError).toBeNull();
    expect(typesOf(emitted)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(accumulator.getTranscriptParts()).toEqual([
      { text: "hello", type: "text" },
    ]);
    expect(accumulator.runUsage).toMatchObject({ input: 12, output: 4 });
  });

  it("does NOT frame a turn the caller frames itself", async () => {
    // `conversation-run` emits its own RUN_FINISHED — and on a suspension that
    // one carries the INTERRUPT outcome, which upstream's plain pair cannot.
    const { emitted } = await drive(textAgent("hi"));
    expect(typesOf(emitted)).not.toContain(EventType.RUN_STARTED);
    expect(typesOf(emitted)).not.toContain(EventType.RUN_FINISHED);
  });
});

describe("I3/15: cancellation", () => {
  it("hands agent.stream() an abortSignal, which upstream never does", async () => {
    // `MastraAgent.streamMastraAgent` builds its options as
    // `{memory, runId, clientTools, requestContext}` — no abortSignal — and its
    // Observable's teardown is a bare `() => {}`, so unsubscribing does not stop
    // the stream either. Stock `@ag-ui/mastra` cannot cancel a local Mastra agent
    // AT ALL. Asserted at `agent.stream`, because that is the exact call upstream
    // builds and the exact argument it omits.
    const stream = vi.fn(async (_m: unknown, _o: unknown) => ({
      fullStream: (async function* () {
        yield { payload: { id: "t1", text: "ok" }, type: "text-delta" };
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    }));
    const controller = new AbortController();

    await drive(
      { getMemory: async () => undefined, model: {}, stream },
      { abortSignal: controller.signal }
    );

    const options = stream.mock.calls[0]?.[1] as
      | { abortSignal?: AbortSignal }
      | undefined;
    expect(options?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options?.abortSignal?.aborted).toBe(false);
  });

  it("passes the caller's cancellation through, not a dangling signal of its own", async () => {
    // The signal handed to Mastra is ours, so it has to be WIRED to the route's
    // — an unwired one would satisfy the test above and still cancel nothing.
    const stream = vi.fn(async (_m: unknown, _o: unknown) => ({
      fullStream: (async function* () {
        yield { payload: { id: "t1", text: "ok" }, type: "text-delta" };
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    }));
    const controller = new AbortController();
    controller.abort();

    await drive(
      { getMemory: async () => undefined, model: {}, stream },
      { abortSignal: controller.signal }
    );

    const options = stream.mock.calls[0]?.[1] as
      | { abortSignal?: AbortSignal }
      | undefined;
    expect(options?.abortSignal?.aborted).toBe(true);
  });

  it("an aborted turn is not reported as a failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const { outcome } = await drive(textAgent("x"), {
      abortSignal: controller.signal,
    });
    expect(outcome.runError).toBeNull();
  });
});

describe("I3/16: the resume correlation key", () => {
  it("keys the snapshot on the run id we passed in", async () => {
    // The Session lane had TWO ids: ours, and the Mastra run id that
    // `session.getCurrentRunId()` revealed only after the fact — which is what
    // the resume POST had to look the snapshot up by.
    //
    // `MastraAgent` forwards `input.runId` straight into `agent.stream({runId})`,
    // so Mastra's run id IS ours and the two collapse into one. That is a
    // simplification, but it is also load-bearing: this assertion is what would
    // catch it silently ceasing to be true, because `suspendToInterrupt` falls
    // back to the AG-UI runId and would produce a plausible-but-wrong id rather
    // than an error.
    const gated = createTool({
      id: "engenty_tool_execute",
      description: "gated",
      inputSchema: z.object({}),
      resumeSchema: z.object({ approved: z.boolean() }),
      execute: async (_input, context) => {
        const ctx = context as {
          agent?: {
            resumeData?: unknown;
            suspend?: (p: unknown) => Promise<void>;
          };
        };
        if (ctx.agent?.resumeData) {
          return { ok: true };
        }
        await ctx.agent?.suspend?.({ kind: "tool_approval" });
        return { ok: false };
      },
    });
    const agent = new Agent({
      name: "start-fixture",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "engenty_tool_execute",
                input: "{}",
              },
              { type: "finish", finishReason: "tool-calls", usage },
            ],
          }),
        }),
      } as never) as never,
      storage: new InMemoryStore(),
      tools: { engenty_tool_execute: gated },
    } as never);

    const { accumulator, outcome } = await drive(agent);

    expect(outcome.suspended).toBeTruthy();
    expect(outcome.suspended?.toolCallId).toBe("call-1");
    expect(outcome.suspended?.toolName).toBe("engenty_tool_execute");
    expect(outcome.suspended?.suspendPayload).toMatchObject({
      kind: "tool_approval",
    });
    expect(outcome.suspended?.mastraRunId).toBe("run-1");
    // A parked call is legitimately resultless — closing it with an error would
    // settle the very approval card the user is about to answer.
    expect(accumulator.getUnresolvedToolCalls()).toEqual([]);
  });
});

describe("I3/17: stopping on a tool RESULT", () => {
  it("aborts the run and withholds the result", async () => {
    // `requestFeedback` returns its artifact as a RESULT rather than suspending,
    // and the model would answer straight past it. The caller renders the
    // interactive interrupt instead, so the plain result must not reach the wire.
    const feedback = createTool({
      id: "requestFeedback",
      description: "ask",
      inputSchema: z.object({}),
      execute: async () => ({
        artifact_id: "art-1",
        artifact_type: "feedback",
        title: "What do you think?",
      }),
    });
    let call = 0;
    const agent = new Agent({
      name: "start-fixture",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => {
          call += 1;
          return call === 1
            ? {
                stream: simulateReadableStream({
                  chunks: [
                    { type: "stream-start", warnings: [] },
                    {
                      type: "tool-call",
                      toolCallId: "call-fb",
                      toolName: "requestFeedback",
                      input: "{}",
                    },
                    { type: "finish", finishReason: "tool-calls", usage },
                  ],
                }),
              }
            : {
                stream: simulateReadableStream({
                  chunks: [
                    { type: "stream-start", warnings: [] },
                    { type: "text-start", id: "t2" },
                    {
                      type: "text-delta",
                      id: "t2",
                      delta: "talking past the question",
                    },
                    { type: "text-end", id: "t2" },
                    { type: "finish", finishReason: "stop", usage },
                  ],
                }),
              };
        },
      } as never) as never,
      storage: new InMemoryStore(),
      tools: { requestFeedback: feedback },
    } as never);

    const { accumulator, emitted, outcome } = await drive(agent, {
      isStopOnResult: (result: unknown) =>
        (result as { artifact_type?: string })?.artifact_type === "feedback",
    });

    expect(outcome.artifact?.toolCallId).toBe("call-fb");
    expect(outcome.runError).toBeNull();
    // The plain result never reached the wire...
    expect(
      emitted.filter((e) => e.type === EventType.TOOL_CALL_RESULT)
    ).toHaveLength(0);
    // ...but the durable part DID record it, or the next turn cannot see what
    // was asked.
    expect(JSON.stringify(accumulator.getTranscriptParts())).toContain(
      "What do you think?"
    );
    // And the model did not get to answer past it.
    expect(
      emitted.some((e) =>
        String(e.delta ?? "").includes("talking past the question")
      )
    ).toBe(false);
  });
});

describe("I3/18: attachments", () => {
  it("reach the model as Mastra content on the user turn", async () => {
    // The Session took `sendMessage({files})`. Routing these through AG-UI's own
    // message content would force a PDF through `{type:"image"}`.
    const seen: unknown[] = [];
    const agent = textAgent("ok", async (options: { prompt?: unknown }) => {
      seen.push(options?.prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "finish", finishReason: "stop", usage },
          ],
        }),
      };
    });

    await drive(agent, {
      attachments: [
        {
          data: "JVBERi0=",
          filename: "report.pdf",
          mediaType: "application/pdf",
        },
      ],
    });

    expect(JSON.stringify(seen)).toContain("application/pdf");
  });
});

describe("I3: failures", () => {
  it("reports a model failure without throwing", async () => {
    const agent = textAgent("", async () => {
      throw new Error("gateway 402");
    });
    const { outcome } = await drive(agent);
    expect(outcome.runError).toContain("gateway 402");
  });

  it("names a run the context window ended in SILENCE (finishReason 'length', no text)", async () => {
    // @mastra/core treats finishReason "length" as a clean loop end: the step's
    // already-emitted tool call still executes, then the loop stops — no error,
    // no text, run "completed". Live repro: a 232k-prompt copilot turn whose
    // user saw "no response". The driver must name it, not pass it as success.
    const lookup = createTool({
      id: "lookup",
      description: "lookup",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });
    const agent = new Agent({
      name: "start-fixture",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "lookup",
                input: "{}",
              },
              { type: "finish", finishReason: "length", usage },
            ],
          }),
        }),
      } as never) as never,
      storage: new InMemoryStore(),
      tools: { lookup },
    } as never);

    const { accumulator, outcome } = await drive(agent);

    expect(accumulator.hasAssistantText).toBe(false);
    expect(outcome.runError).toBe(AGENT_THREADS_OUTPUT_TRUNCATED);
  });

  it("keeps a truncated-but-visible answer as a normal turn", async () => {
    // finishReason "length" with text on screen is a cut-off answer the user
    // can already read — failing the run would mark a usable turn as broken.
    const agent = textAgent("", async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "half an answer" },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "length", usage },
        ],
      }),
    }));

    const { accumulator, outcome } = await drive(agent);

    expect(accumulator.hasAssistantText).toBe(true);
    expect(outcome.runError).toBeNull();
  });

  it("keeps the partial answer when the stream dies mid-text", async () => {
    const agent = textAgent("", async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "half an answer" },
          { type: "error", error: { message: "boom" } },
        ],
      }),
    }));

    const { accumulator, emitted } = await drive(agent);

    expect(JSON.stringify(accumulator.getTranscriptParts())).toContain(
      "half an answer"
    );
    // ...and the text message it opened is still closed on the wire.
    expect(typesOf(emitted)).toContain(EventType.TEXT_MESSAGE_END);
  });
});
