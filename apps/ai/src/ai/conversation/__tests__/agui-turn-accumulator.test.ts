// The durable half of a turn, re-derived from AG-UI.
//
// The end-to-end fixture at the bottom pins the accumulator to fixed expected
// values; everything above it pins a single behaviour the end-to-end shape could
// hide. When a pinned value changes, confirm the new one by OBSERVING the output
// — the shapes here are not obvious (a resolved tool call is one `dynamic-tool`
// part with the result folded in, and usage arrives as a single aggregate).
import { EventType } from "@engenty/ag-ui-bridge";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  workspaceApprovalTitle,
  workspaceToolGrantId,
} from "../../workspace/workspace-tool-guards.js";
import { AgUiTurnAccumulator } from "../agui-turn-accumulator.js";
import { runHeadlessViaMastraAgent } from "../delegate-run-agui-driver.js";

const usage = { inputTokens: 30, outputTokens: 6, totalTokens: 36 };

function feed(events: Record<string, unknown>[]) {
  const acc = new AgUiTurnAccumulator();
  for (const e of events) {
    acc.observe(e as never);
  }
  return acc;
}

describe("AgUiTurnAccumulator: the durable transcript", () => {
  it("accumulates assistant text into ONE part", () => {
    // Mastra memory flushes only at end-of-generation, so a turn that ends on an
    // interrupt persists nothing without this — and the next turn reads an empty
    // history and re-asks what the user already answered.
    const acc = feed([
      { delta: "Hel", messageId: "m1", type: EventType.TEXT_MESSAGE_CHUNK },
      { delta: "lo", messageId: "m1", type: EventType.TEXT_MESSAGE_CHUNK },
    ]);
    expect(acc.getTranscriptParts()).toEqual([{ text: "Hello", type: "text" }]);
  });

  it("handles START/CONTENT as well as CHUNK", () => {
    // `@ag-ui/mastra` emits TEXT_MESSAGE_CHUNK; our converters emit
    // START/CONTENT/END. The accumulator sits behind either producer, so it has
    // to read both spellings — a silent no-op here would drop the whole answer.
    const acc = feed([
      { messageId: "m1", type: EventType.TEXT_MESSAGE_START },
      { delta: "hi", messageId: "m1", type: EventType.TEXT_MESSAGE_CONTENT },
    ]);
    expect(acc.getTranscriptParts()).toEqual([{ text: "hi", type: "text" }]);
  });

  it("persists the CALL before its result exists", () => {
    // A turn that suspends mid-tool still has to show WHAT was asked.
    const acc = feed([
      {
        parentMessageId: "m1",
        toolCallId: "c1",
        toolCallName: "lookup",
        type: EventType.TOOL_CALL_START,
      },
      { delta: '{"q":"a"}', toolCallId: "c1", type: EventType.TOOL_CALL_ARGS },
    ]);
    expect(acc.getTranscriptParts()).toEqual([
      {
        input: { q: "a" },
        state: "input-available",
        toolCallId: "c1",
        toolName: "lookup",
        type: "dynamic-tool",
      },
    ]);
  });

  it("keeps PARTIAL args rather than losing the input", () => {
    // Replaying a tool call with no `input` fails the whole turn upstream with
    // "function.arguments must be defined" — a thread that cannot recover on its
    // own. Truncated JSON is worth more than an empty object.
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "lookup",
        type: EventType.TOOL_CALL_START,
      },
      {
        delta: '{"q":"unfin',
        toolCallId: "c1",
        type: EventType.TOOL_CALL_ARGS,
      },
    ]);
    const part = acc.getTranscriptParts()[0] as { input?: unknown };
    expect(part.input).toBe('{"q":"unfin');
  });

  it("replaces the running part with the result part", () => {
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "lookup",
        type: EventType.TOOL_CALL_START,
      },
      { delta: '{"q":"a"}', toolCallId: "c1", type: EventType.TOOL_CALL_ARGS },
      {
        content: JSON.stringify({ hits: 3 }),
        toolCallId: "c1",
        type: EventType.TOOL_CALL_RESULT,
      },
    ]);
    expect(acc.getTranscriptParts()).toHaveLength(1);
    expect(acc.getTranscriptParts()[0]).toMatchObject({
      input: { q: "a" },
      output: { hits: 3 },
      state: "output-available",
      toolCallId: "c1",
    });
  });
});

describe("AgUiTurnAccumulator: dangling vs parked", () => {
  it("closes a call that ended the turn unanswered", () => {
    // A hallucinated tool name never dispatches, so no result arrives: the card
    // spins forever and the model re-invents the same tool next turn.
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "ask_user",
        type: EventType.TOOL_CALL_START,
      },
    ]);
    const closing = acc.closeUnresolvedToolCalls({
      knownToolNames: ["lookup"],
    });
    expect(closing).toHaveLength(1);
    expect(closing[0]).toMatchObject({
      toolCallId: "c1",
      type: EventType.TOOL_CALL_RESULT,
    });
    // ...and the durable part records the failure too, not just the wire.
    expect(acc.getTranscriptParts()[0]).toMatchObject({
      state: "output-error",
      toolCallId: "c1",
    });
  });

  it("never closes a call that PARKED the run", () => {
    // The single most damaging thing this class could get wrong: error-closing a
    // suspension answers the user's own approval card with a failure, so the
    // resume has nothing left to continue.
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "engenty_tool_execute",
        type: EventType.TOOL_CALL_START,
      },
      {
        name: "on_interrupt",
        type: EventType.CUSTOM,
        value: JSON.stringify({ toolCallId: "c1", type: "mastra_suspend" }),
      },
    ]);
    expect(acc.getUnresolvedToolCalls()).toEqual([]);
    expect(acc.closeUnresolvedToolCalls()).toEqual([]);
  });

  it("also reads the suspension off RUN_FINISHED", () => {
    // `@ag-ui/mastra` announces a park TWICE — mid-stream CUSTOM and the terminal
    // interrupt outcome. Either alone must be enough, since a stream that dies
    // before RUN_FINISHED still emitted the CUSTOM, and a replay may carry only
    // the terminal event.
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "engenty_tool_execute",
        type: EventType.TOOL_CALL_START,
      },
      {
        outcome: {
          interrupts: [{ id: "r::c1", toolCallId: "c1" }],
          type: "interrupt",
        },
        type: EventType.RUN_FINISHED,
      },
    ]);
    expect(acc.getUnresolvedToolCalls()).toEqual([]);
  });

  it("a resolved call is not dangling", () => {
    const acc = feed([
      {
        toolCallId: "c1",
        toolCallName: "lookup",
        type: EventType.TOOL_CALL_START,
      },
      { content: "{}", toolCallId: "c1", type: EventType.TOOL_CALL_RESULT },
    ]);
    expect(acc.getUnresolvedToolCalls()).toEqual([]);
  });
});

describe("AgUiTurnAccumulator: usage and sub-agent progress", () => {
  it("splits billed total from window occupancy", () => {
    // Summing for occupancy reports a context window several times larger than
    // any single call actually used.
    const acc = feed([
      {
        type: EventType.RUN_FINISHED,
        usage: [
          { inputTokens: 100, outputTokens: 5 },
          { inputTokens: 140, outputTokens: 7 },
        ],
      },
    ]);
    expect(acc.runUsage).toMatchObject({ input: 240, output: 12 });
    expect(acc.windowUsage).toMatchObject({ input: 140 });
  });

  it("collects sub-agent progress lines off the CUSTOM event", () => {
    const acc = feed([
      {
        name: "engenty.sub_agent.progress",
        type: EventType.CUSTOM,
        value: { line: "Running lookup", toolCallId: "d1" },
      },
    ]);
    expect([...acc.getSubAgentProgressLines()]).toEqual([
      ["d1", ["Running lookup"]],
    ]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the fixture the I1 differential ran, now pinned to fixed values.
// ---------------------------------------------------------------------------

const ANSWER = "Found 3 items.";

function fixtureAgent() {
  let call = 0;
  return new Agent({
    name: "accumulator-fixture",
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
                    toolCallId: "call-1",
                    toolName: "lookup",
                    input: JSON.stringify({ q: "items" }),
                  },
                  { type: "finish", finishReason: "tool-calls", usage },
                ],
              }),
            }
          : {
              stream: simulateReadableStream({
                chunks: [
                  { type: "stream-start", warnings: [] },
                  { type: "text-start", id: "t1" },
                  { type: "text-delta", id: "t1", delta: ANSWER },
                  { type: "text-end", id: "t1" },
                  { type: "finish", finishReason: "stop", usage },
                ],
              }),
            };
      },
    } as never) as never,
    storage: new InMemoryStore(),
    tools: {
      lookup: createTool({
        id: "lookup",
        description: "look something up",
        inputSchema: z.object({ q: z.string() }),
        execute: async () => ({ hits: 3 }),
      }),
    },
  } as never);
}

/** The production shape: MastraAgent's AG-UI events → the accumulator. */
async function viaAccumulator() {
  const acc = new AgUiTurnAccumulator();
  await runHeadlessViaMastraAgent({
    agent: fixtureAgent(),
    agentId: "accumulator-fixture",
    content: "find items",
    describeCall: workspaceApprovalTitle,
    grantIdOf: workspaceToolGrantId,
    onAgUiEvent: (e) => acc.observe(e as never),
    resourceId: "resource-1",
    runId: "run-acc",
    sinks: {},
    threadId: "thread-acc",
  });
  return acc;
}

describe("the accumulator over the end-to-end fixture", () => {
  // These values were established by the I1 differential: the same fixture ran
  // through this
  // accumulator, and the two agreed. The converter is deleted; the agreed
  // values are pinned here so a regression shows up as a concrete diff instead
  // of "differs from code that no longer exists".
  it("records the durable transcript", async () => {
    // The transcript is what survives a reload and what the NEXT turn reads.
    // A resolved tool call is ONE `dynamic-tool` part (the AI SDK UIMessage
    // shape) with the result folded in, not a call part plus a result part.
    const acc = await viaAccumulator();
    expect(acc.getTranscriptParts()).toEqual([
      {
        input: { q: "items" },
        output: { hits: 3 },
        state: "output-available",
        toolCallId: "call-1",
        toolName: "lookup",
        type: "dynamic-tool",
      },
      { text: ANSWER, type: "text" },
    ]);
  });

  it("leaves nothing dangling", async () => {
    const acc = await viaAccumulator();
    expect(acc.getUnresolvedToolCalls()).toEqual([]);
  });

  it("bills the run's aggregate usage", async () => {
    // Two model calls at 30 in / 6 out each. `@ag-ui/mastra` builds
    // RUN_FINISHED.usage from the stream result's own `usage` promise, which is
    // ONE aggregate entry — so run total and window occupancy coincide here.
    // (With per-call entries the window would be the LAST call's input; the
    // per-entry arithmetic is pinned in the unit tests above.)
    const acc = await viaAccumulator();
    expect(acc.runUsage).toMatchObject({ input: 60, output: 12 });
    expect(acc.windowUsage).toMatchObject({ input: 60 });
  });
});
